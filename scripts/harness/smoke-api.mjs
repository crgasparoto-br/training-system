import fs from 'node:fs';
import path from 'node:path';

function parseDotEnv(contents) {
  const parsed = {};
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadEnvFileIfExists(fileName) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const parsed = parseDotEnv(fs.readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFileIfExists('.env');
loadEnvFileIfExists('.env.example');

const apiPort = process.env.PORT || process.env.API_PORT || '3000';
const baseUrl = process.env.API_BASE_URL || `http://localhost:${apiPort}`;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 5000);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

async function main() {
  const candidates = ['/health', '/api/health', '/api/v1', '/'];
  const failures = [];

  for (const path of candidates) {
    const url = `${baseUrl}${path}`;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok || response.status === 404) {
        console.log(`smoke-api OK: ${url} respondeu HTTP ${response.status}`);
        return;
      }
      failures.push(`${url} respondeu HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${url} falhou: ${error.message}`);
    }
  }

  console.error('smoke-api nao conseguiu conectar na API local:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

main().finally(() => clearTimeout(timeout));
