'use strict';

const puppeteer = require('puppeteer');
const originalLaunch = puppeteer.launch.bind(puppeteer);
const browserFlags = [
  '--disable-web-security',
  '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
];

async function selectEligibleResponsible(page) {
  await page.waitForFunction(
    () => {
      const select = document.querySelector('#adpt-responsible');
      return select instanceof HTMLSelectElement
        && Array.from(select.options).some((item) => item.value && !item.disabled);
    },
    { timeout: 30_000 }
  );

  const selected = await page.$eval('#adpt-responsible', (select) => {
    if (!(select instanceof HTMLSelectElement)) return false;
    const option = Array.from(select.options).find((item) => item.value && !item.disabled);
    if (!option) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value'
    )?.set;
    setter?.call(select, option.value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value === option.value;
  });

  if (!selected) {
    throw new Error('Não foi possível selecionar o responsável elegível no navegador ADPT.');
  }

  await page.waitForFunction(
    () => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (item) => item.textContent?.trim() === 'Nova avaliação'
      );
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    { timeout: 30_000 }
  );
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
    page.goto = async (url, gotoOptions) => {
      const response = await originalGoto(url, gotoOptions);
      if (String(url).includes('/protocolo-avaliacao-fisica/adipometria')) {
        await selectEligibleResponsible(page);
      }
      return response;
    };
    return page;
  };
  return browser;
}

try {
  Object.defineProperty(puppeteer, 'launch', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: launchWithLocalIntegrationSupport,
  });
} catch {
  puppeteer.launch = launchWithLocalIntegrationSupport;
}

if (puppeteer.default && typeof puppeteer.default === 'object') {
  try {
    Object.defineProperty(puppeteer.default, 'launch', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: launchWithLocalIntegrationSupport,
    });
  } catch {
    puppeteer.default.launch = launchWithLocalIntegrationSupport;
  }
}
