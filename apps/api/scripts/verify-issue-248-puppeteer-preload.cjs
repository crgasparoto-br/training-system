'use strict';

const puppeteer = require('puppeteer');
const originalLaunch = puppeteer.launch.bind(puppeteer);
const browserFlags = [
  '--disable-web-security',
  '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
];

async function installExplicitResponsibleSelection(page) {
  await page.evaluateOnNewDocument(() => {
    function selectResponsible() {
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
    }

    addEventListener('DOMContentLoaded', () => {
      selectResponsible();
      const observer = new MutationObserver(selectResponsible);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  });
}

async function launchWithLocalIntegrationSupport(options = {}) {
  const browser = await originalLaunch({
    ...options,
    args: Array.from(new Set([...(options.args || []), ...browserFlags])),
  });
  const originalNewPage = browser.newPage.bind(browser);
  browser.newPage = async () => {
    const page = await originalNewPage();
    await installExplicitResponsibleSelection(page);
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
