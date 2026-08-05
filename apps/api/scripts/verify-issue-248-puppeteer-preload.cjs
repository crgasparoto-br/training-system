'use strict';

const puppeteer = require('puppeteer');
const originalLaunch = puppeteer.launch.bind(puppeteer);
const browserFlags = [
  '--disable-web-security',
  '--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
];

function launchWithLocalIntegrationSupport(options = {}) {
  return originalLaunch({
    ...options,
    args: Array.from(new Set([...(options.args || []), ...browserFlags])),
  });
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
