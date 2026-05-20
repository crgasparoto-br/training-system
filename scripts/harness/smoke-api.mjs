const baseUrl = process.env.API_BASE_URL || 'http://localhost:3333';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 5000);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

async function main() {
  const candidates = ['/health', '/api/health', '/'];
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
