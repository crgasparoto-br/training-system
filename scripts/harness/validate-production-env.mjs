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

if (missingApi.length || missingWeb.length || missingSecrets.length) {
  console.error('Variaveis ausentes no ambiente atual:');
  if (missingApi.length) console.error(`API: ${missingApi.join(', ')}`);
  if (missingWeb.length) console.error(`WEB: ${missingWeb.join(', ')}`);
  if (missingSecrets.length) console.error(`GitHub/Deploy: ${missingSecrets.join(', ')}`);
  console.error('\nUse este comando como checklist. Nao commit valores reais de segredo.');
  process.exit(1);
}

console.log('harness:validate-env OK');
