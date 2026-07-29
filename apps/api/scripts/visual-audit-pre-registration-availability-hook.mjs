import { Page } from 'puppeteer';

const originalOn = Page.prototype.on;
const availabilityPath = '/api/v1/pre-registration/availability';

/**
 * Compatibility hook for isolated browser evidence harnesses that mock API
 * requests through Puppeteer interception. Puppeteer uses its own EventEmitter,
 * so the contract must wrap Page.prototype.on directly rather than Node's
 * EventEmitter. Production consumers still execute the real availability
 * boundary; this hook only supplies the canonical 204 response inside isolated
 * visual fixtures.
 */
Page.prototype.on = function patchedOn(eventName, listener) {
  if (eventName !== 'request' || typeof listener !== 'function') {
    return originalOn.call(this, eventName, listener);
  }

  return originalOn.call(this, eventName, function availabilityAwareListener(request, ...args) {
    let pathname = '';
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return listener.call(this, request, ...args);
    }

    if (pathname !== availabilityPath) {
      return listener.call(this, request, ...args);
    }

    if (
      typeof request.isInterceptResolutionHandled === 'function' &&
      request.isInterceptResolutionHandled()
    ) {
      return undefined;
    }

    void request.respond({ status: 204, contentType: 'application/json', body: '' });
    return undefined;
  });
};
