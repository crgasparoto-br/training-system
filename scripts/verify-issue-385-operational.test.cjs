"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateConfig, summarizeTimeline, isAllowedStagingRequest, evaluateScenarioEvidence, SCENARIOS } = require("./verify-issue-385-operational.cjs");

const config = (override = {}) => ({
  baseUrl: "https://homolog.example.test",
  apiOrigin: "https://api-homolog.example.test",
  entryPath: "/alunos/aluno-ficticio",
  expectedHeadSha: "a".repeat(40),
  syntheticData: true,
  fixtureDescription: "alunos ficticios em banco isolado",
  deploymentEvidenceUrl: "https://example.test/deploy/385",
  ...override,
});

test("TL-385-020: bloqueia producao e outros hostnames nao identificados como staging", () => {
  for (const host of [
    "https://sistema-acesso.solveritconsultoria.com.br",
    "https://training-system-web.vercel.app",
    "https://unrecognized.example.com",
  ]) {
    assert.throws(() => validateConfig(config({ baseUrl: host })));
  }
  assert.equal(validateConfig(config()).baseUrl, "https://homolog.example.test");
});

test("TL-385-020: aceita apenas o alias de preview do projeto e branch 385 com proveniencia Vercel", () => {
  const baseUrl = "https://training-system-web-git-feat-38-77e478-crgasparoto-brs-projects.vercel.app";
  const deploymentEvidenceUrl = "https://vercel.com/crgasparoto-brs-projects/training-system-web/AJAWUeGZffQhmAa5cwY9wQv8SDbB";
  assert.equal(validateConfig(config({ baseUrl, deploymentEvidenceUrl })).baseUrl, baseUrl);
  assert.throws(() => validateConfig(config({ baseUrl, deploymentEvidenceUrl: "https://vercel.com/other-team/training-system-web/not-the-deploy" })));
  assert.throws(() => validateConfig(config({ baseUrl: baseUrl.replace("-git-feat-38-", "-git-main-"), deploymentEvidenceUrl })));
  assert.throws(() => validateConfig(config({ baseUrl: "https://training-system-web-crgasparoto-brs-projects.vercel.app", deploymentEvidenceUrl })));
  assert.throws(() => validateConfig(config({ baseUrl: "https://training-system-web-git-feat-38-77e478-another-team.vercel.app", deploymentEvidenceUrl })));
});

test("TL-385-020: exige isolamento, SHA valido, endereco seguro e dados ficticios", () => {
  assert.throws(() => validateConfig(config({ syntheticData: false })));
  assert.throws(() => validateConfig(config({ expectedHeadSha: "abc" })));
  assert.throws(() => validateConfig(config({ baseUrl: "http://homolog.example.test" })));
  assert.throws(() => validateConfig(config({ entryPath: "//exfiltrate.invalid/path" })));
  assert.throws(() => validateConfig(config({ apiOrigin: "https://sistema-acesso-api.onrender.com" })));
  assert.throws(() => validateConfig(config({ apiOrigin: "https://training-system-web.vercel.app" })));
  assert.throws(() => validateConfig(config({ fixtureDescription: "dados reais" })));
  assert.throws(() => validateConfig(config({ deploymentEvidenceUrl: "http://example.test" })));
});

test("TL-385-020: checklist inclui todos os 12 cenarios sem duplicacao", () => {
  assert.equal(SCENARIOS.length, 12);
  assert.equal(new Set(SCENARIOS.map(s => s.id)).size, SCENARIOS.length);
  assert.ok(SCENARIOS.some(s => s.id === "parq_denied"));
  assert.ok(SCENARIOS.some(s => s.id === "cross_tenant"));
  assert.ok(SCENARIOS.some(s => s.id === "long_history"));
});

test("TL-385-020: sumariza apenas metadados e identifica duplicacao/denegacao", () => {
  const scenario = {};
  const first = summarizeTimeline({ data: {
    items: [
      { id: "opaque1", type: "prnt_parq_submitted", sourceType: "student-parq-submission", sourceId: "SECRET", patientName: "NEVER_PERSIST" },
      { id: "opaque2", type: "student_created", sourceType: "system", sourceId: "other" },
    ],
    nextCursor: "CURSOR_SECRET", partial: true, unavailableDomains: ["PAR-Q"],
  } }, scenario);
  const second = summarizeTimeline({ data: { items: [
    { id: "another-id", type: "prnt_parq_submitted", sourceType: "student-parq-submission", sourceId: "SECRET" },
  ] } }, scenario);
  assert.equal(first.count, 2);
  assert.equal(first.containsParq, true);
  assert.equal(first.containsClinical, true);
  assert.equal(first.hasNextCursor, true);
  assert.equal(first.partial, true);
  assert.equal(second.repeatedCanonicalSources, 1);
  assert.equal(scenario._items, 3);
  assert.equal(scenario._repeats, 1);
  assert.ok(!JSON.stringify(first).includes("NEVER_PERSIST"));
  assert.ok(!JSON.stringify(first).includes("CURSOR_SECRET"));
  assert.ok(!JSON.stringify(first).includes("SECRET"));
});


test("TL-385-020: nenhuma navegacao, recurso, iframe ou API pode sair das origens de staging", () => {
  const approved = new Set(["https://homolog.example.test", "https://api-homolog.example.test"]);
  assert.equal(isAllowedStagingRequest("https://homolog.example.test/alunos/ficticio", approved), true);
  assert.equal(isAllowedStagingRequest("https://api-homolog.example.test/api/alunos/ficticio/timeline", approved), true);
  for (const url of [
    "https://sistema-acesso.solveritconsultoria.com.br/alunos/real",
    "https://training-system-web.vercel.app/",
    "https://homolog.example.test.evil.invalid/",
    "https://public-cdn.invalid/tracker.js",
    "file:///etc/passwd",
    "data:text/plain,unsafe",
    "not-a-url",
  ]) assert.equal(isAllowedStagingRequest(url, approved), false, url);
});

test("TL-385-020: IdP externo somente de homologacao e explicitamente configurado", () => {
  assert.equal(validateConfig(config()).authOrigin, null);
  assert.equal(validateConfig(config({ authOrigin: "https://auth-homolog.example.test" })).authOrigin, "https://auth-homolog.example.test");
  assert.throws(() => validateConfig(config({ authOrigin: "https://auth.solveritconsultoria.com.br" })));
  assert.throws(() => validateConfig(config({ authOrigin: "https://homolog.example.test:443@evil.invalid" })));
  assert.throws(() => validateConfig(config({ authOrigin: "http://auth-homolog.example.test" })));
});

test("TL-385-020: Audit-only falha para eventos clinicos legados e financeiros", () => {
  const scenario = { timelineRequests: [summarizeTimeline({ data: { items: [
    { id: "x", type: "intake_recorded", sourceType: "student", sourceId: "x" },
  ] } }, {})] };
  assert.equal(scenario.timelineRequests[0].containsClinical, true);
  assert.equal(evaluateScenarioEvidence("audit_only", scenario, "pass"), "fail");
  const financialScenario = { timelineRequests: [summarizeTimeline({ data: { items: [
    { id: "y", type: "financial_contract_signed", sourceType: "student", sourceId: "y" },
  ] } }, {})] };
  assert.equal(financialScenario.timelineRequests[0].containsFinancial, true);
  assert.equal(evaluateScenarioEvidence("audit_only", financialScenario, "pass"), "fail");
});

test("TL-385-020: cross-tenant exige fronteira 403/404, 200 vazio nao e sucesso", () => {
  assert.equal(evaluateScenarioEvidence("cross_tenant", { timelineRequests: [{ status: 200, count: 0 }] }, "pass"), "fail");
  assert.equal(evaluateScenarioEvidence("cross_tenant", { timelineRequests: [{ status: 404 }] }, "pass"), "pass");
  assert.equal(evaluateScenarioEvidence("cross_tenant", { timelineRequests: [{ status: 503 }] }, "pass"), "blocked");
  assert.equal(evaluateScenarioEvidence("cross_tenant", { timelineRequests: [{ status: 200 }, { status: 404 }] }, "pass"), "fail");
  assert.equal(evaluateScenarioEvidence("prnt", { timelineRequests: [{ status: 200 }] }, "pass", 1), "blocked");
});


test("TL-385-020: blueprint Render prende migracao e runtime ao banco isolado", () => {
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const blueprint = readFileSync(join(__dirname, "..", "infra", "issue-385", "render.yaml"), "utf8");
  assert.match(blueprint, /name:\s*training-system-issue385-homolog-api/);
  assert.match(blueprint, /name:\s*training-system-issue385-homolog-pg/);
  assert.match(blueprint, /startCommand:\s*pnpm --filter @corrida\/api start:with-migrations/);
  assert.match(blueprint, /autoDeployTrigger:\s*["']?off/);
  assert.match(blueprint, /ipAllowList:\s*\[\]/);
  assert.match(blueprint, /postgresMajorVersion:\s*["']16["']/);
  for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"]) {
    const segment = blueprint.split("- key: " + key)[1]?.split(/\n\s*- key:/)[0] ?? "";
    assert.match(segment, /fromDatabase:\s*\n\s*name:\s*training-system-issue385-homolog-pg\s*\n\s*property:\s*connectionString/);
  }
  assert.match(blueprint, /key:\s+JWT_SECRET\s*\n\s+generateValue:\s+true/);
  assert.doesNotMatch(blueprint, /sistema-acesso\.solveritconsultoria\.com\.br/);
  assert.doesNotMatch(blueprint, /sistema-acesso-api\.onrender\.com/);
});
