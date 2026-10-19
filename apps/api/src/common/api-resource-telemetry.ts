import type { RequestHandler } from 'express';

/** Operational telemetry is opt-in and never emits raw URLs or user data. */
export interface ApiTelemetrySettings {
  enabled: boolean;
  intervalSeconds: number;
  slowMs: number;
  pressureThreshold: number;
}

export function boundedNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function getApiTelemetrySettings(env: NodeJS.ProcessEnv = process.env): ApiTelemetrySettings {
  return {
    enabled: env.API_RESOURCE_TELEMETRY_ENABLED === 'true',
    intervalSeconds: boundedNumber(env.API_RESOURCE_TELEMETRY_INTERVAL_SECONDS, 60, 30, 300),
    slowMs: boundedNumber(env.API_SLOW_REQUEST_MS, 2000, 100, 60000),
    pressureThreshold: boundedNumber(env.API_MEMORY_WARNING_MIB, 420, 128, 16384),
  };
}

const mib = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;

export function sampleApiMemory(): Record<string, number> {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  return {
    rssMiB: mib(rss),
    heapUsedMiB: mib(heapUsed),
    heapTotalMiB: mib(heapTotal),
    externalMiB: mib(external),
    arrayBuffersMiB: mib(arrayBuffers),
  };
}

export function getApiRouteCategory(originalUrl: string): string {
  // Boundaries prevent /alunos-secret from being classified as /alunos.
  // Only fixed categories are returned; no user-controlled string is logged.
  const pathname = originalUrl.split(/[?#]/, 1)[0];
  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/');
  if (matches('/api/v1/alunos')) return 'students';
  if (matches('/api/v1/contracts')) return 'contracts';
  if (matches('/api/v1/auth')) return 'auth';
  if (matches('/api/v1')) return 'api';
  return 'other';
}

export function startApiResourceTelemetry(settings = getApiTelemetrySettings()): void {
  if (!settings.enabled) return;
  const timer = setInterval(() => {
    const memory = sampleApiMemory();
    const pressure = memory.rssMiB >= settings.pressureThreshold;
    const payload = JSON.stringify({
      event: pressure ? 'memory-pressure' : 'memory',
      uptimeSeconds: Math.round(process.uptime()),
      ...memory,
    });
    if (pressure) console.warn('[api-resource]', payload);
    else console.info('[api-resource]', payload);
  }, settings.intervalSeconds * 1000);
  timer.unref();
}

export function createApiResourceRequestTelemetry(settings = getApiTelemetrySettings()): RequestHandler {
  return (req, res, next) => {
    if (!settings.enabled) return next();
    const started = process.hrtime.bigint();
    let completed = false;
    const report = (aborted: boolean) => {
      if (completed) return;
      completed = true;
      const elapsedMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
      if (!aborted && elapsedMs < settings.slowMs && res.statusCode < 500) return;
      console.warn('[api-resource]', JSON.stringify({
        event: aborted ? 'request-aborted' : 'request',
        category: getApiRouteCategory(req.originalUrl),
        method: req.method,
        status: res.statusCode,
        durationMs: elapsedMs,
        ...sampleApiMemory(),
      }));
    };
    res.once('finish', () => report(false));
    res.once('close', () => report(!res.writableEnded));
    next();
  };
}

export const apiResourceRequestTelemetry: RequestHandler = createApiResourceRequestTelemetry();
