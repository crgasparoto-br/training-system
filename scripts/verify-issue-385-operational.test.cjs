"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateConfig, summarizeTimeline, SCENARIOS } = require("./verify-issue-385-operational.cjs");

const config = (override = {}) => ({
  baseUrl: "https://homolog.example.test",
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

test("TL-385-020: exige isolamento, SHA valido, endereco seguro e dados ficticios", () => {
  assert.throws(() => validateConfig(config({ syntheticData: false })));
  assert.throws(() => validateConfig(config({ expectedHeadSha: "abc" })));
  assert.throws(() => validateConfig(config({ baseUrl: "http://homolog.example.test" })));
  assert.throws(() => validateConfig(config({ entryPath: "//exfiltrate.invalid/path" })));
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
