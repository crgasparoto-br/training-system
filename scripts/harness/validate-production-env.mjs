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

// Prioriza valores reais do ambiente e usa .env local apenas como fallback.
loadEnvFileIfExists('.env');
loadEnvFileIfExists('.env.example');

const requiredApiVars = [
  'DATABASE_URL',
  'NODE_ENV',
  'FRONTEND_URL',
  'CORS_ORIGINS',
  'JWT_SECRET',
];

const requiredWebVars = ['VITE_API_URL'];
const requiredGithubSecrets = [
  'PRODUCTION_DATABASE_URL',
  'RENDER_API_DEPLOY_HOOK_URL',
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
  'PRODUCTION_VITE_API_URL',
];

function missing(vars) {
  return vars.filter((name) => !process.env[name]);
}

const missingApi = missing(requiredApiVars);
const missingWeb = missing(requiredWebVars);
const missingSecrets = missing(requiredGithubSecrets);
const strictDeploySecrets = process.env.HARNESS_VALIDATE_DEPLOY_SECRETS === '1';

if (missingApi.length || missingWeb.length || (strictDeploySecrets && missingSecrets.length)) {
  console.error('Variaveis ausentes no ambiente atual:');
  if (missingApi.length) console.error(`API: ${missingApi.join(', ')}`);
  if (missingWeb.length) console.error(`WEB: ${missingWeb.join(', ')}`);
  if (strictDeploySecrets && missingSecrets.length) {
    console.error(`GitHub/Deploy: ${missingSecrets.join(', ')}`);
  }
  console.error('\nUse este comando como checklist. Nao commit valores reais de segredo.');
  process.exit(1);
}

if (missingSecrets.length) {
  console.warn('Aviso (nao bloqueante): segredos de deploy ausentes no ambiente local:');
  console.warn(`GitHub/Deploy: ${missingSecrets.join(', ')}`);
  console.warn('Para bloquear por esses segredos, execute com HARNESS_VALIDATE_DEPLOY_SECRETS=1.');
}

console.log('harness:validate-env OK');
