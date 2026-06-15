import fs from 'node:fs';
import path from 'node:path';

const JWT_PLACEHOLDERS = new Set([
  'dev-secret',
  'your-super-secret-jwt-key-change-in-production',
]);

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

const strictRealEnv = process.env.HARNESS_VALIDATE_REAL_ENV === '1';

// Prioriza valores reais do ambiente e usa .env local apenas como fallback.
loadEnvFileIfExists('.env');
if (!strictRealEnv) {
  loadEnvFileIfExists('.env.example');
}

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

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

const missingApi = missing(requiredApiVars);
const missingWeb = missing(requiredWebVars);
const missingSecrets = missing(requiredGithubSecrets);
const strictDeploySecrets = process.env.HARNESS_VALIDATE_DEPLOY_SECRETS === '1';
const invalidSecrets = [];

if ((isProduction() || strictRealEnv) && JWT_PLACEHOLDERS.has(process.env.JWT_SECRET?.trim())) {
  invalidSecrets.push('JWT_SECRET usa valor placeholder');
}

if (isProduction() && !process.env.CORS_ORIGINS?.trim()) {
  invalidSecrets.push('CORS_ORIGINS deve ser definido explicitamente em producao');
}

if (
  missingApi.length ||
  missingWeb.length ||
  invalidSecrets.length ||
  (strictDeploySecrets && missingSecrets.length)
) {
  console.error('Variaveis ausentes ou invalidas no ambiente atual:');
  if (missingApi.length) console.error(`API: ${missingApi.join(', ')}`);
  if (missingWeb.length) console.error(`WEB: ${missingWeb.join(', ')}`);
  if (invalidSecrets.length) console.error(`Invalidas: ${invalidSecrets.join(', ')}`);
  if (strictDeploySecrets && missingSecrets.length) {
    console.error(`GitHub/Deploy: ${missingSecrets.join(', ')}`);
  }
  console.error('\nUse este comando como checklist. Nao commit valores reais de segredo.');
  console.error('Para ignorar .env.example e validar somente ambiente real/.env, use HARNESS_VALIDATE_REAL_ENV=1.');
  process.exit(1);
}

if (missingSecrets.length) {
  console.warn('Aviso (nao bloqueante): segredos de deploy ausentes no ambiente local:');
  console.warn(`GitHub/Deploy: ${missingSecrets.join(', ')}`);
  console.warn('Para bloquear por esses segredos, execute com HARNESS_VALIDATE_DEPLOY_SECRETS=1.');
}

console.log('harness:validate-env OK');
