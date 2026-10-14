#!/usr/bin/env node
"use strict";

// Issue #385 / TL-385-020: evidence collector for a REAL authenticated staging browser.
// This does not mock API calls or authenticate as the operator. No patient data or
// session secrets are written to the report. Only fictitious staging fixtures are allowed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const readline = require("node:readline/promises");

const SCENARIOS = [
  { id: "prnt", name: "PRNT versionado", instructions: "Abra Historico, selecione objetivo atualizado e Abrir registro original. Confirme recordId, entidade e versao exatos." },
  { id: "intake", name: "Anamnese Inicial", instructions: "Abra a revisao historica e confirme a versao especifica na tela de origem." },
  { id: "parq", name: "PAR-Q", instructions: "Abra a submissao historica e confirme que a submissao exata foi selecionada." },
  { id: "anthropometry", name: "Antropometria", instructions: "Abra conclusao e correcao. Confirme as referencias exatas e que a conclusao anterior permanece." },
  { id: "adipometry", name: "Adipometria R1/R2", instructions: "Use dois finalizadores ficticios, conclua R1 e corrija em R2 pelo fluxo canonico. Confirme dois eventos, datas e autores." },
  { id: "audit_only", name: "Perfil somente Audit", instructions: "Troque para perfil sem acesso clinico/financeiro. Confirme ausencia desses dados nos eventos e na resposta da API." },
  { id: "partial_access", name: "Permissao PRNT parcial", instructions: "Conceda somente um bloco PRNT e negue outros. Confirme que somente a categoria autorizada aparece." },
  { id: "parq_denied", name: "Anamnese permitida, PAR-Q negado", instructions: "Conceda Anamnese e negue PAR-Q. Confirme que nao ha consulta ao endpoint de submissions, payload PAR-Q ou evento PAR-Q." },
  { id: "cross_tenant", name: "Isolamento entre contratos", instructions: "Troque para contrato B e solicite aluno ficticio de A. Confirme resposta negada e nenhuma informacao do aluno A." },
  { id: "long_history", name: "Historico acima de 200 eventos", instructions: "Com mais de 200 eventos ficticios, carregue todas as paginas via Carregar eventos anteriores. Confira sem lacunas/duplicatas e registre tempos." },
  { id: "localized_failure", name: "Falha localizada", instructions: "Indisponibilize UMA fonte no staging, confira aviso parcial, demais eventos e o botao Tentar novamente apos restaurar." },
  { id: "accessibility", name: "Acessibilidade", instructions: "Valide teclado, Enter, zoom 200% e viewport 390x844; confira leitura e navegacao sem overflow." },
];
const PRODUCTION_HOSTS = new Set([
  "sistema-acesso.solveritconsultoria.com.br",
  "training-system-web.vercel.app",
  "training-system-web-crgasparoto-brs-projects.vercel.app",
]);

function validateConfig(config) {
  assert.ok(config && typeof config === "object", "Config JSON obrigatorio");
  assert.equal(config.syntheticData, true, "Somente dados ficticios em ambiente isolado");
  assert.match(config.expectedHeadSha, /^[a-f0-9]{40}$/, "expectedHeadSha exige SHA completo");
  assert.ok(typeof config.entryPath === "string" && config.entryPath.startsWith("/") && !config.entryPath.startsWith("//"), "entryPath deve ser rota relativa");
  const url = new URL(config.baseUrl);
  assert.ok(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)), "HTTPS obrigatorio fora de localhost");
  assert.ok(!PRODUCTION_HOSTS.has(url.hostname), "Dominio de producao bloqueado");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) || /(staging|homolog|preview)/i.test(url.hostname), "Use somente hostname explicitamente de homologacao/preview");
  assert.ok(url.username === "" && url.password === "" && url.pathname === "/" && !url.search && !url.hash, "baseUrl nao pode conter credenciais, rota ou query");
  assert.ok(typeof config.deploymentEvidenceUrl === "string" && config.deploymentEvidenceUrl.startsWith("https://"), "URL de comprovacao de deploy obrigatoria");
  assert.ok(typeof config.fixtureDescription === "string" && config.fixtureDescription.includes("fict"), "Identifique o conjunto ficticio");
  return { ...config, baseUrl: url.origin };
}
function readConfig() {
  const file = process.argv[2];
  assert.ok(file && file.endsWith(".json"), "Uso: node scripts/verify-issue-385-operational.cjs <config-local.json> [--preflight]");
  return validateConfig(JSON.parse(fs.readFileSync(file, "utf8")));
}
function clinical(item) {
  const source = String(item.sourceType || "");
  return /^(prontuario-|student-health-intake-|student-parq-|anthropometry-|adipometry-)/.test(source);
}
function sourceKey(item) {
  return item.sourceType && item.sourceId ? String(item.type) + "|" + item.sourceType + "|" + item.sourceId : String(item.id);
}
function summarizeTimeline(body, scenario) {
  const data = body && (body.data || body);
  const items = Array.isArray(data && data.items) ? data.items : [];
  const seen = scenario._seen || (scenario._seen = new Set());
  let repeated = 0;
  for (const item of items) {
    const key = sourceKey(item);
    if (seen.has(key)) repeated += 1;
    seen.add(key);
  }
  scenario._items = (scenario._items || 0) + items.length;
  scenario._repeats = (scenario._repeats || 0) + repeated;
  return {
    count: items.length,
    hasNextCursor: Boolean(data && data.nextCursor),
    partial: Boolean(data && data.partial),
    unavailableDomains: Array.isArray(data && data.unavailableDomains) ? data.unavailableDomains.filter(x => typeof x === "string").slice(0, 12) : [],
    containsClinical: items.some(clinical),
    containsParq: items.some(item => item.sourceType === "student-parq-submission" || item.type === "prnt_parq_submitted"),
    repeatedCanonicalSources: repeated,
  };
}
function safeDestination(raw) {
  try { const url = new URL(raw); return { host: url.host, pathname: url.pathname, queryKeys: [...url.searchParams.keys()].sort() }; }
  catch { return null; }
}
function sanitizeScenario(entry) {
  const { _seen, _items, _repeats, ...safe } = entry;
  return safe;
}

async function main() {
  const config = readConfig();
  if (process.argv.includes("--preflight")) {
    process.stdout.write(JSON.stringify({ ok: true, purpose: "real-staging-browser", expectedHeadSha: config.expectedHeadSha, baseUrl: config.baseUrl }) + "\n");
    return;
  }
  assert.equal(process.env.ISSUE385_FICTITIOUS_ONLY, "YES", "Exporte ISSUE385_FICTITIOUS_ONLY=YES somente apos confirmar fixture ficticia");
  assert.ok(process.stdin.isTTY, "Operacao requer operador autenticado e terminal interativo");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const requireApi = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
  const puppeteer = requireApi("puppeteer");
  const evidenceDir = path.resolve(process.cwd(), "reports/issue-385-operational");
  fs.mkdirSync(evidenceDir, { recursive: true });
  let browser;
  const report = {
    schemaVersion: 1, issue: 385, pr: 510, type: "authenticated-staging-operation",
    candidateSha: config.expectedHeadSha, deploymentEvidenceUrl: config.deploymentEvidenceUrl,
    environmentHost: new URL(config.baseUrl).host, fixtureDescription: config.fixtureDescription,
    startedAt: new Date().toISOString(), browser: null, scenarios: [], outcome: "incomplete",
    note: "O resultado depende de execucao humana real; NAO e CI simulada ou evidencia de producao.",
  };
  try {
    const confirmed = (await rl.question("SHA de 40 caracteres CONFIRMADO no deployment isolado (copie da plataforma): ")).trim();
    assert.equal(confirmed, config.expectedHeadSha, "Deploy distinto do HEAD da PR. Homologacao bloqueada.");
    const acknowledgement = (await rl.question("Confirme que ambiente e alunos sao FICTICIOS e isolados; digite FICTICIOS: ")).trim();
    assert.equal(acknowledgement, "FICTICIOS", "Nao operar com dados reais");
    browser = await puppeteer.launch({
      headless: false, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
      defaultViewport: { width: 1440, height: 900 },
    });
    report.browser = await browser.version();
    const page = await browser.newPage();
    await page.goto(new URL(config.entryPath, config.baseUrl).href, { waitUntil: "domcontentloaded" });
    await rl.question("Autentique-se com o PERFIL FICTICIO no navegador aberto; pressione Enter ao terminar: ");
    for (const item of SCENARIOS) {
      const scenario = { id: item.id, name: item.name, startedAt: new Date().toISOString(),
        timelineRequests: [], otherApiPaths: [], pageErrors: [], result: "blocked", explanation: "" };
      report.scenarios.push(scenario);
      const started = new Map();
      const pending = [];
      const onRequest = req => { started.set(req, performance.now()); };
      const onResponse = res => {
        const request = res.request();
        const url = new URL(request.url());
        if (!url.pathname.startsWith("/api/")) return;
        const millis = Math.round(performance.now() - (started.get(request) || performance.now()));
        if (/\/alunos\/[^/]+\/timeline$/.test(url.pathname)) {
          pending.push((async () => {
            const record = { status: res.status(), durationMs: millis, ...{} };
            if (res.ok()) {
              try { Object.assign(record, summarizeTimeline(await res.json(), scenario)); }
              catch { record.responseUnreadable = true; }
            }
            scenario.timelineRequests.push(record);
          })());
        } else if (url.pathname.includes("/parq-submissions")) {
          scenario.otherApiPaths.push({ category: "parq-submissions", status: res.status() });
        }
      };
      const onPageError = () => scenario.pageErrors.push("browser-error");
      page.on("request", onRequest);
      page.on("response", onResponse);
      page.on("pageerror", onPageError);
      process.stdout.write("\n=== " + item.name + " ===\n" + item.instructions + "\n");
      await rl.question("Ajuste o PERFIL / permissao / fixture ficticia desta etapa e pressione Enter: ");
      if (item.id === "accessibility") await page.setViewport({ width: 390, height: 844 });
      else await page.setViewport({ width: 1440, height: 900 });
      await page.goto(new URL(config.entryPath, config.baseUrl).href, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await rl.question("Execute o cenario no navegador (incluindo links e paginacao) e pressione Enter para capturar: ");
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => undefined);
      await Promise.allSettled(pending);
      scenario.destination = safeDestination(page.url());
      scenario.viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      })).catch(() => null);
      const name = item.id + ".png";
      const screenshotPath = path.join(evidenceDir, name);
      const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true });
      scenario.screenshot = { file: name, sha256: crypto.createHash("sha256").update(screenshot).digest("hex") };
      const choice = (await rl.question("Resultado real [pass/fail/blocked], sem inferir da CI: ")).trim().toLowerCase();
      scenario.explanation = (await rl.question("Evidencia observada ou motivo (nao insira nomes, emails, tokens ou dados clinicos): ")).trim().slice(0, 700);
      scenario.result = ["pass", "fail", "blocked"].includes(choice) ? choice : "blocked";
      if (!scenario.timelineRequests.length) scenario.result = "blocked";
      if (item.id === "audit_only" && scenario.timelineRequests.some(r => r.containsClinical)) scenario.result = "fail";
      if (item.id === "parq_denied" && (scenario.timelineRequests.some(r => r.containsParq) || scenario.otherApiPaths.length)) scenario.result = "fail";
      if (item.id === "cross_tenant" && scenario.timelineRequests.some(r => r.status === 200 && r.count > 0)) scenario.result = "fail";
      if (item.id === "long_history" && ((scenario._items || 0) <= 200 || (scenario._repeats || 0) !== 0 || scenario.timelineRequests.length < 2)) scenario.result = "fail";
      if (item.id === "localized_failure" && !scenario.timelineRequests.some(r => r.partial)) scenario.result = "blocked";
      scenario.finishedAt = new Date().toISOString();
      page.off("request", onRequest); page.off("response", onResponse); page.off("pageerror", onPageError);
      Object.assign(scenario, sanitizeScenario(scenario));
      delete scenario._seen; delete scenario._items; delete scenario._repeats;
      fs.writeFileSync(path.join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
    }
    report.outcome = report.scenarios.length === SCENARIOS.length &&
      report.scenarios.every(s => s.result === "pass") ? "passed" : "not-approved";
  } catch (error) {
    report.outcome = "blocked";
    report.blocker = String(error.message).slice(0, 500);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
    await browser?.close().catch(() => undefined);
    rl.close();
  }
  process.stdout.write("Evidencia local: " + path.join(evidenceDir, "report.json") + "\n");
  if (report.outcome !== "passed") process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateConfig, summarizeTimeline, SCENARIOS };
