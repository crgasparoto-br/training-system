'use strict';

const puppeteer = require('puppeteer');
const originalLaunch = puppeteer.launch.bind(puppeteer);
const browserFlags = [
  '--disable-web-security',
  '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
];

async function stabilizeEligibleResponsible(page) {
  await page.waitForFunction(
    () => {
      const select = document.querySelector('#adpt-responsible');
      return select instanceof HTMLSelectElement
        && Array.from(select.options).some((item) => item.value && !item.disabled);
    },
    { timeout: 30_000 }
  );

  await page.evaluate(() => {
    const existing = window.__adptResponsibleStabilizer;
    if (typeof existing === 'number') clearInterval(existing);

    const selectResponsible = () => {
      const select = document.querySelector('#adpt-responsible');
      if (!(select instanceof HTMLSelectElement) || select.value) return;
      const option = Array.from(select.options).find((item) => item.value && !item.disabled);
      if (!option) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value'
      )?.set;
      setter?.call(select, option.value);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    selectResponsible();
    window.__adptResponsibleStabilizer = window.setInterval(selectResponsible, 100);
    window.setTimeout(() => {
      if (typeof window.__adptResponsibleStabilizer === 'number') {
        clearInterval(window.__adptResponsibleStabilizer);
        window.__adptResponsibleStabilizer = undefined;
      }
    }, 20_000);
  });

  await page.waitForFunction(
    () => {
      const select = document.querySelector('#adpt-responsible');
      const button = Array.from(document.querySelectorAll('button')).find(
        (item) => item.textContent?.trim() === 'Nova avaliação'
      );
      return select instanceof HTMLSelectElement
        && Boolean(select.value)
        && button instanceof HTMLButtonElement
        && !button.disabled;
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
        await stabilizeEligibleResponsible(page);
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
