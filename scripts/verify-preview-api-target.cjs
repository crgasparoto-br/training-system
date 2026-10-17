#!/usr/bin/env node
"use strict";

// Fail closed before Vite bundles a preview against a production API.
// This is a build-time gate; it is not evidence of operational homologation.
const assert = require("node:assert/strict");

const PRODUCTION_HOSTS = new Set([
  "sistema-acesso-api.onrender.com",
  "sistema-acesso.solveritconsultoria.com.br",
]);

function validatePreviewApiTarget(env) {
  if (env.VERCEL_ENV !== "preview") return { checked: false };
  assert.ok(typeof env.VITE_API_URL === "string" && env.VITE_API_URL.trim(),
    "Preview bloqueado: VITE_API_URL precisa apontar para API isolada de homologacao");
  let url;
  try { url = new URL(env.VITE_API_URL); }
  catch { throw new Error("Preview bloqueado: VITE_API_URL deve ser uma URL HTTPS absoluta"); }
  assert.equal(url.protocol, "https:", "Preview bloqueado: API exige HTTPS");
  assert.ok(!url.username && !url.password && !url.search && !url.hash &&
    (url.pathname === "/" || url.pathname === ""),
  "Preview bloqueado: configure somente a origem HTTPS da API, sem credenciais ou caminhos");
  const host = url.hostname.toLowerCase();
  assert.ok(!PRODUCTION_HOSTS.has(host), "Preview bloqueado: host da API de producao");
  assert.ok(host.endsWith(".onrender.com") || host.endsWith(".solveritconsultoria.com.br"),
    "Preview bloqueado: API deve estar em dominio administrado e isolado");
  assert.match(host, /(^|[.-])(homolog|staging|preview)([.-]|$)/,
    "Preview bloqueado: hostname da API deve indicar homolog, staging ou preview");
  return { checked: true, host };
}

if (require.main === module) {
  try {
    const result = validatePreviewApiTarget(process.env);
    process.stdout.write(result.checked
      ? `Preview API isolada validada: ${result.host}\n`
      : "Validacao de preview nao aplicavel fora de VERCEL_ENV=preview\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { validatePreviewApiTarget };
