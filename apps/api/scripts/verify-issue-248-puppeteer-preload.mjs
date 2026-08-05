import puppeteer from 'puppeteer';

const originalLaunch = puppeteer.launch.bind(puppeteer);
const browserFlags = [
  '--disable-web-security',
  '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
];

async function readAdipometryControlState(page) {
  return page.evaluate(() => {
    const select = document.querySelector('#adpt-responsible');
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Nova avaliação'
    );

    return {
      selectFound: select instanceof HTMLSelectElement,
      selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
      selectedValue: select instanceof HTMLSelectElement ? select.value : null,
      options: select instanceof HTMLSelectElement
        ? Array.from(select.options).map((item) => ({
            value: item.value,
            disabled: item.disabled,
            label: item.textContent?.trim() || '',
          }))
        : [],
      buttonFound: button instanceof HTMLButtonElement,
      buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
      bodyText: document.body.innerText.slice(0, 1_500),
    };
  });
}

async function readAdipometryProtocolState(page) {
  return page.evaluate(() => {
    const select = document.querySelector('#adpt-protocol');
    return {
      selectFound: select instanceof HTMLSelectElement,
      selectDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
      selectedValue: select instanceof HTMLSelectElement ? select.value : null,
      options: select instanceof HTMLSelectElement
        ? Array.from(select.options).map((item) => ({
            value: item.value,
            disabled: item.disabled,
            label: item.textContent?.trim() || '',
          }))
        : [],
      alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(
        (item) => item.textContent?.trim() || ''
      ),
      bodyText: document.body.innerText.slice(0, 2_000),
    };
  });
}

async function selectEligibleResponsible(page, waitForFunction) {
  await waitForFunction(
    () => {
      const select = document.querySelector('#adpt-responsible');
      return select instanceof HTMLSelectElement
        && !select.disabled
        && Array.from(select.options).some((item) => item.value && !item.disabled);
    },
    { timeout: 30_000 }
  );

  const optionValue = await page.$eval('#adpt-responsible', (select) => {
    if (!(select instanceof HTMLSelectElement)) return '';
    return Array.from(select.options).find((item) => item.value && !item.disabled)?.value || '';
  });

  if (!optionValue) {
    const state = await readAdipometryControlState(page);
    throw new Error(
      `Nenhum responsável elegível foi encontrado no navegador ADPT: ${JSON.stringify(state)}`
    );
  }

  await page.select('#adpt-responsible', optionValue);

  try {
    await waitForFunction(
      (expectedValue) => {
        const select = document.querySelector('#adpt-responsible');
        const button = Array.from(document.querySelectorAll('button')).find(
          (item) => item.textContent?.trim() === 'Nova avaliação'
        );
        return select instanceof HTMLSelectElement
          && select.value === expectedValue
          && button instanceof HTMLButtonElement
          && !button.disabled;
      },
      { timeout: 10_000 },
      optionValue
    );
  } catch (error) {
    const state = await readAdipometryControlState(page);
    throw new Error(
      `O responsável foi selecionado, mas a criação ADPT não foi habilitada: ${JSON.stringify(state)}`,
      { cause: error }
    );
  }
}

async function waitForAvailableProtocol(page, waitForFunction) {
  try {
    await waitForFunction(
      () => {
        const select = document.querySelector('#adpt-protocol');
        return select instanceof HTMLSelectElement
          && !select.disabled
          && Array.from(select.options).some((item) => item.value && !item.disabled);
      },
      { timeout: 30_000 }
    );
  } catch (error) {
    const state = await readAdipometryProtocolState(page);
    throw new Error(
      `Nenhum protocolo aprovado e compatível ficou disponível após a carga das referências: ${JSON.stringify(state)}`,
      { cause: error }
    );
  }
}

async function clickNewAssessmentAtValidState(page, waitForFunction, evalButtons) {
  await selectEligibleResponsible(page, waitForFunction);
  const clicked = await evalButtons(
    'button',
    (buttons) => {
      const button = buttons.find(
        (item) => item.textContent?.trim() === 'Nova avaliação'
      );
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    }
  );

  if (!clicked) {
    const state = await readAdipometryControlState(page);
    throw new Error(
      `A criação ADPT não pôde ser acionada no estado válido: ${JSON.stringify(state)}`
    );
  }
}

function filteredCentralUser(value) {
  if (!value?.accessControl?.permissions) return value;
  const copy = JSON.parse(JSON.stringify(value));
  copy.accessControl.permissions = copy.accessControl.permissions.filter((permission) => (
    permission.screenKey !== 'students.details'
    || permission.blockKey === null
    || permission.blockKey === ''
    || permission.blockKey === 'students.details.assessments'
  ));
  return copy;
}

function isGenericResource404(message) {
  if (message.type() !== 'error') return false;
  const text = message.text();
  return text.includes('Failed to load resource') && text.includes('404');
}

function parsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function classifyCentralHttpFailure(failure, centralAlunoId, comparisonCaptured) {
  const pathname = parsePath(failure.url);
  if (failure.status >= 500 || failure.status !== 404) return 'unexpected';
  if (pathname.endsWith('/favicon.ico')) return 'optional';

  const criticalPaths = new Set([
    `/api/v1/alunos/${centralAlunoId}`,
    `/api/v1/alunos/${centralAlunoId}/assessments`,
    '/api/v1/adipometry/responsible-professors',
    `/api/v1/adipometry/alunos/${centralAlunoId}/assessments`,
    `/api/v1/adipometry/alunos/${centralAlunoId}/compare`,
  ]);
  if (criticalPaths.has(pathname) || pathname.startsWith('/api/v1/adipometry/assessments/')) {
    return 'unexpected';
  }

  const crossTenantPattern = /^\/api\/v1\/adipometry\/alunos\/[^/]+\/assessments$/;
  if (
    comparisonCaptured
    && crossTenantPattern.test(pathname)
    && pathname !== `/api/v1/adipometry/alunos/${centralAlunoId}/assessments`
  ) {
    return 'negative-control';
  }

  return 'optional';
}

async function launchWithLocalIntegrationSupport(options = {}) {
  const browser = await originalLaunch({
    ...options,
    args: Array.from(new Set([...(options.args || []), ...browserFlags])),
  });
  const originalNewPage = browser.newPage.bind(browser);

  browser.newPage = async () => {
    const page = await originalNewPage();
    const originalGoto = page.goto.bind(page);
    const originalWaitForFunction = page.waitForFunction.bind(page);
    const originalEval = page.$eval.bind(page);
    const originalEvalButtons = page.$$eval.bind(page);
    const originalEvaluateOnNewDocument = page.evaluateOnNewDocument.bind(page);
    const originalOn = page.on.bind(page);
    const originalScreenshot = page.screenshot.bind(page);
    const httpFailures = [];
    let centralAlunoId = '';
    let screenshotCount = 0;
    let httpFailuresChecked = false;
    let newAssessmentPreclicked = false;

    originalOn('response', (response) => {
      if (response.status() >= 400) {
        httpFailures.push({ status: response.status(), url: response.url() });
      }
    });

    page.evaluateOnNewDocument = async (pageFunction, ...args) => {
      const adjustedArgs = args.map((argument) => filteredCentralUser(argument));
      return originalEvaluateOnNewDocument(pageFunction, ...adjustedArgs);
    };

    page.on = (eventName, handler) => {
      if (eventName !== 'console') return originalOn(eventName, handler);
      return originalOn('console', (message) => {
        if (isGenericResource404(message)) return;
        handler(message);
      });
    };

    page.goto = async (url, gotoOptions) => {
      const centralRoute = String(url).includes('/central-do-aluno/');
      if (centralRoute) {
        const pathname = parsePath(String(url));
        centralAlunoId = decodeURIComponent(pathname.split('/central-do-aluno/')[1]?.split('/')[0] || '');
      }
      const normalizedGotoOptions = centralRoute
        ? { ...gotoOptions, waitUntil: 'domcontentloaded' }
        : gotoOptions;
      const response = await originalGoto(url, normalizedGotoOptions);
      if (String(url).includes('/protocolo-avaliacao-fisica/adipometria')) {
        await selectEligibleResponsible(page, originalWaitForFunction);
      }
      return response;
    };

    page.waitForFunction = async (pageFunction, waitOptions, ...args) => {
      if (args.some((argument) => argument === 'Nova avaliação')) {
        await clickNewAssessmentAtValidState(
          page,
          originalWaitForFunction,
          originalEvalButtons
        );
        newAssessmentPreclicked = true;
        return originalWaitForFunction(() => true, waitOptions);
      }
      if (args.some((argument) => argument === 'Avaliação Física')) {
        return originalWaitForFunction(
          (expected) => {
            const button = Array.from(document.querySelectorAll('button')).find(
              (item) => item.textContent?.trim().startsWith(expected)
            );
            return button instanceof HTMLButtonElement && !button.disabled;
          },
          waitOptions,
          'Avaliação Física'
        );
      }
      return originalWaitForFunction(pageFunction, waitOptions, ...args);
    };

    page.$eval = async (selector, pageFunction, ...args) => {
      if (selector === '#adpt-protocol') {
        await waitForAvailableProtocol(page, originalWaitForFunction);
      }
      return originalEval(selector, pageFunction, ...args);
    };

    page.$$eval = async (selector, pageFunction, ...args) => {
      if (
        newAssessmentPreclicked
        && selector === 'button'
        && args.some((argument) => argument === 'Nova avaliação')
      ) {
        newAssessmentPreclicked = false;
        return true;
      }
      if (
        selector === 'button'
        && args.some((argument) => argument === 'Avaliação Física')
      ) {
        return originalEvalButtons(
          'button',
          (buttons, expected) => {
            const button = buttons.find(
              (item) => item.textContent?.trim().startsWith(expected)
            );
            if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
            button.click();
            return true;
          },
          'Avaliação Física'
        );
      }
      return originalEvalButtons(selector, pageFunction, ...args);
    };

    page.screenshot = async (...args) => {
      const result = await originalScreenshot(...args);
      screenshotCount += 1;
      if (centralAlunoId && screenshotCount >= 2 && !httpFailuresChecked) {
        httpFailuresChecked = true;
        const classified = httpFailures.map((failure) => ({
          ...failure,
          classification: classifyCentralHttpFailure(
            failure,
            centralAlunoId,
            screenshotCount >= 2
          ),
        }));
        const unexpected = classified.filter((failure) => failure.classification === 'unexpected');
        if (unexpected.length > 0) {
          throw new Error(
            `A Central apresentou falhas HTTP em fronteiras obrigatórias: ${JSON.stringify(unexpected)}`
          );
        }
        const accepted = classified.filter((failure) => failure.classification !== 'unexpected');
        if (accepted.length > 0) {
          console.log(
            `[issue-249-central] Respostas HTTP degradadas classificadas: ${JSON.stringify(accepted)}`
          );
        }
      }
      return result;
    };

    return page;
  };

  return browser;
}

Object.defineProperty(puppeteer, 'launch', {
  configurable: true,
  enumerable: true,
  writable: true,
  value: launchWithLocalIntegrationSupport,
});
