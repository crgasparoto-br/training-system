import { EventEmitter } from 'node:events';

const originalOn = EventEmitter.prototype.on;
const availabilityPath = '/api/v1/pre-registration/availability';

/**
 * Compatibility hook for isolated browser evidence harnesses that mock API
 * requests through Puppeteer interception. Production consumers must probe the
 * rollout endpoint before rendering; older visual scripts used a generic 404
 * fallback for every unlisted API request. This hook makes availability an
 * explicit part of those test contracts without weakening application logic.
 */
EventEmitter.prototype.on = function patchedOn(eventName, listener) {
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

    if (typeof request.isInterceptResolutionHandled === 'function' && request.isInterceptResolutionHandled()) {
      return undefined;
    }

    void request.respond({ status: 204, contentType: 'application/json', body: '' });
    return undefined;
  });
};
