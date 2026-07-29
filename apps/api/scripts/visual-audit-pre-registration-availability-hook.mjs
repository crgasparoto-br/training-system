import { Page } from 'puppeteer';

const originalOn = Page.prototype.on;
const availabilityPath = '/api/v1/pre-registration/availability';
const issue270ReviewPath =
  '/api/v1/pre-registration-admin/leads/lead-1/enrollment-review';

const issue270Review = {
  alunoId: 'lead-1',
  status: 'READY_FOR_ENROLLMENT',
  recordVersion: 1,
  fingerprint: 'issue-270-visual-fingerprint',
  classification: 'NONE',
  candidates: [],
  restrictedCandidateCount: 0,
  canConfirmDifferentPeople: false,
  canUseExistingCanonical: false,
  canMarkReady: false,
  canConfirmEnrollment: true,
  health: {
    healthModuleStatus: 'COMPLETED',
    parqModuleStatus: 'COMPLETED',
    parqRequiresProfessionalReview: true,
  },
  downstream: {
    contract: 'NOT_CONFIGURED',
    plan: 'NOT_CONFIGURED',
    billing: 'NOT_CONFIGURED',
    responsibleProfessor: 'NOT_CONFIGURED',
    schedule: 'NOT_CONFIGURED',
  },
};

function respond(request, input) {
  if (
    typeof request.isInterceptResolutionHandled === 'function' &&
    request.isInterceptResolutionHandled()
  ) {
    return false;
  }
  void request.respond(input);
  return true;
}

/**
 * Compatibility hook for isolated browser evidence harnesses that mock API
 * requests through Puppeteer interception. Puppeteer uses its own EventEmitter,
 * so the contract wraps Page.prototype.on directly. Production consumers still
 * execute the real availability boundary; this hook only supplies canonical
 * responses inside isolated visual fixtures.
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

    if (pathname === availabilityPath) {
      respond(request, { status: 204, contentType: 'application/json', body: '' });
      return undefined;
    }

    if (
      process.env.ISSUE_270_VISUAL_REVIEW_FIXTURE === 'true' &&
      request.method() === 'GET' &&
      pathname === issue270ReviewPath
    ) {
      respond(request, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: issue270Review }),
      });
      return undefined;
    }

    return listener.call(this, request, ...args);
  });
};
