import { EventEmitter } from 'events';
import {
  boundedNumber,
  createApiResourceRequestTelemetry,
  getApiRouteCategory,
  getApiTelemetrySettings,
  sampleApiMemory,
  startApiResourceTelemetry,
} from './api-resource-telemetry.js';

describe('API resource telemetry', () => {
  afterEach(() => jest.restoreAllMocks());

  it('validates configuration boundaries and rejects nonfinite values', () => {
    expect(boundedNumber(undefined, 60, 30, 300)).toBe(60);
    expect(boundedNumber('NaN', 60, 30, 300)).toBe(60);
    expect(boundedNumber('Infinity', 60, 30, 300)).toBe(60);
    expect(boundedNumber('-1', 60, 30, 300)).toBe(60);
    expect(boundedNumber('301', 60, 30, 300)).toBe(60);
    expect(boundedNumber('30', 60, 30, 300)).toBe(30);
    expect(boundedNumber('300', 60, 30, 300)).toBe(300);
    expect(getApiTelemetrySettings({ API_RESOURCE_TELEMETRY_ENABLED: 'true', API_SLOW_REQUEST_MS: '500' })).toMatchObject({
      enabled: true, slowMs: 500, intervalSeconds: 60, pressureThreshold: 420,
    });
    expect(getApiTelemetrySettings({ API_RESOURCE_TELEMETRY_ENABLED: 'TRUE' }).enabled).toBe(false);
  });

  it('uses fixed category values and exact path boundaries', () => {
    expect(getApiRouteCategory('/api/v1/alunos/abc?token=secret')).toBe('students');
    expect(getApiRouteCategory('/api/v1/alunos-other')).toBe('api');
    expect(getApiRouteCategory('/api/v1/contracts/abc')).toBe('contracts');
    expect(getApiRouteCategory('/api/v1/auth')).toBe('auth');
    expect(getApiRouteCategory('/api/v1/auth-secret')).toBe('api');
    expect(getApiRouteCategory('/api/v1')).toBe('api');
    expect(getApiRouteCategory('/external?q=secret')).toBe('other');
  });

  it('samples finite memory numbers', () => {
    expect(Object.values(sampleApiMemory()).every(Number.isFinite)).toBe(true);
  });

  function invoke(status: number, url: string, event: 'finish' | 'close', threshold = 2000) {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = Object.assign(new EventEmitter(), { statusCode: status, writableEnded: event === 'finish' });
    const next = jest.fn();
    const middleware = createApiResourceRequestTelemetry({
      enabled: true, intervalSeconds: 60, slowMs: threshold, pressureThreshold: 420,
    });
    middleware({ originalUrl: url, method: 'GET' } as never, response as never, next);
    response.emit(event);
    response.emit('close');
    expect(next).toHaveBeenCalledTimes(1);
    const output = warn.mock.calls.map(call => call.join(' ')).join(' ');
    return { warn, output };
  }

  it('does not log successful fast requests', () => {
    expect(invoke(200, '/api/v1/alunos/123', 'finish').warn).not.toHaveBeenCalled();
  });

  it('logs 5xx without leaking paths or query strings and only once', () => {
    const { warn, output } = invoke(503, '/api/v1/alunos/secret-person?token=secret', 'finish');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(output).toContain('"category":"students"');
    expect(output).toContain('"status":503');
    expect(output).not.toContain('secret');
    expect(output).not.toContain('person');
  });

  it('logs slow successes and client aborts', () => {
    const slow = invoke(200, '/api/v1/plans', 'finish', 0);
    expect(slow.output).toContain('"event":"request"');
    slow.warn.mockRestore();
    const aborted = invoke(200, '/api/v1/auth/login', 'close');
    expect(aborted.output).toContain('"event":"request-aborted"');
    expect(aborted.warn).toHaveBeenCalledTimes(1);
  });

  it('remains inert when disabled', () => {
    const next = jest.fn();
    const response = new EventEmitter();
    createApiResourceRequestTelemetry({ enabled: false, slowMs: 2000, intervalSeconds: 60, pressureThreshold: 420 })(
      { originalUrl: '/api/v1/auth' } as never, response as never, next,
    );
    expect(response.listenerCount('finish')).toBe(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses an unref timer and emits memory-pressure when above configured threshold', () => {
    const unref = jest.fn();
    const timer = jest.spyOn(global, 'setInterval').mockReturnValue({ unref } as never);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    startApiResourceTelemetry({ enabled: true, intervalSeconds: 30, slowMs: 2000, pressureThreshold: 128 });
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 30000);
    expect(unref).toHaveBeenCalledTimes(1);
    const tick = timer.mock.calls[0][0] as () => void;
    tick();
    expect(warn).toHaveBeenCalledWith('[api-resource]', expect.stringContaining('"event":"memory-pressure"'));
  });
});
