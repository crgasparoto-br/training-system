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
    let newAssessmentPreclicked = false;

    page.goto = async (url, gotoOptions) => {
      const response = await originalGoto(url, gotoOptions);
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
      return originalEvalButtons(selector, pageFunction, ...args);
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
