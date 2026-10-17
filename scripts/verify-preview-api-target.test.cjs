"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePreviewApiTarget } = require("./verify-preview-api-target.cjs");

const safe = { VERCEL_ENV: "preview", VITE_API_URL: "https://training-system-issue385-homolog-api.onrender.com" };

test("preview so aceita backend isolado HTTPS", () => {
  assert.deepEqual(validatePreviewApiTarget(safe), {
    checked: true, host: "training-system-issue385-homolog-api.onrender.com",
  });
  assert.equal(validatePreviewApiTarget({ VERCEL_ENV: "production" }).checked, false);
  assert.equal(validatePreviewApiTarget({}).checked, false);
});

test("preview falha fechado se VITE_API_URL estiver ausente ou for a API de producao", () => {
  for (const value of [undefined, "", "https://sistema-acesso-api.onrender.com", "https://sistema-acesso.solveritconsultoria.com.br"]) {
    assert.throws(() => validatePreviewApiTarget({ ...safe, VITE_API_URL: value }));
  }
});

test("preview nao aceita destino desconhecido, URL insegura, credenciais ou caminhos", () => {
  for (const value of [
    "http://training-system-issue385-homolog-api.onrender.com",
    "http://localhost:3000",
    "https://api-preview.example.net",
    "https://sistema-acesso-api.onrender.com@attacker.invalid",
    "https://user:pass@training-system-issue385-homolog-api.onrender.com",
    "https://training-system-issue385-homolog-api.onrender.com/api",
    "https://training-system-issue385-homolog-api.onrender.com/?token=abc",
    "https://training-system-issue385-homolog-api.onrender.com/#fragment",
    "https://training-system-issue385-other.onrender.com",
  ]) assert.throws(() => validatePreviewApiTarget({ ...safe, VITE_API_URL: value }));
});
