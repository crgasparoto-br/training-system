import type { RequestHandler } from 'express';

/**
 * Opt-in, bounded operational telemetry. Never emit full URLs, credentials,
 * user identifiers, payloads, query parameters or tenant identifiers.
 */
const enabled = process.env.API_RESOURCE_TELEMETRY_ENABLED === 'true';
const intervalSeconds = Math.max(30, Math.min(300, Number(process.env.API_RESOURCE_TELEMETRY_INTERVAL_SECONDS) || 60));
const slowMs = Math.max(100, Math.min(60_000, Number(process.env.API_SLOW_REQUEST_MS) || 2000));
const pressureThreshold = Math.max(128, Math.min(16384, Number(process.env.API_MEMORY_WARNING_MIB) || 420));
const mib = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;

function sampleMemory(): Record<string, number> {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  return { rssMiB: mib(rss), heapUsedMiB: mib(heapUsed), heapTotalMiB: mib(heapTotal), externalMiB: mib(external), arrayBuffersMiB: mib(arrayBuffers) };
}

export function startApiResourceTelemetry(): void {
  if (!enabled) return;
  const timer = setInterval(() => {
    const memory = sampleMemory();
    const pressure = memory.rssMiB >= pressureThreshold;
    const payload = JSON.stringify({
      event: pressure ? 'memory-pressure' : 'memory',
      uptimeSeconds: Math.round(process.uptime()),
      ...memory,
    });
    if (pressure) console.warn('[api-resource]', payload);
    else console.info('[api-resource]', payload);
  }, intervalSeconds * 1000);
  timer.unref();
}

export const apiResourceRequestTelemetry: RequestHandler = (req, res, next) => {
  if (!enabled) return next();
  const started = process.hrtime.bigint();
  let completed = false;
  const report = (aborted: boolean) => {
    if (completed) return;
    completed = true;
    const elapsedMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    if (!aborted && elapsedMs < slowMs && res.statusCode < 500) return;
    // Use only a fixed route category. Never log req.url, req.path,
    // req.originalUrl or route parameters (which may contain PII or tokens).
    const category = req.originalUrl.startsWith('/api/v1/alunos') ? 'students'
      : req.originalUrl.startsWith('/api/v1/contracts') ? 'contracts'
      : req.originalUrl.startsWith('/api/v1/auth') ? 'auth'
      : req.originalUrl.startsWith('/api/v1') ? 'api'
      : 'other';
    console.warn('[api-resource]', JSON.stringify({
      event: aborted ? 'request-aborted' : 'request', category, method: req.method, status: res.statusCode,
      durationMs: elapsedMs, ...sampleMemory(),
    }));
  };
  res.once('finish', () => report(false));
  res.once('close', () => report(!res.writableEnded));
  next();
};
