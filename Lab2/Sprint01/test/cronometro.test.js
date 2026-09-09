import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatarHMS, parseArgs, resultadoTrial } from "../src/cronometro.js";
import { lerCSV } from "../src/csv.js";

const SCRIPT = fileURLToPath(new URL("../src/cronometro.js", import.meta.url));

// ---------------------------------------------------------------- unidade

test("formatarHMS: casos basicos, arredondamento e piso em zero", () => {
  assert.equal(formatarHMS(0), "00:00:00");
  assert.equal(formatarHMS(90), "00:01:30");
  assert.equal(formatarHMS(3661), "01:01:01");
  assert.equal(formatarHMS(12.6), "00:00:13");
  assert.equal(formatarHMS(-5), "00:00:00");
});

test("parseArgs: flags com valor, flags booleanas e tokens soltos", () => {
  const a = parseArgs(["--participante", "P1", "--forcar", "--ordem", "5", "lixo"]);
  assert.deepEqual(a, { participante: "P1", forcar: true, ordem: "5" });
});

test("parseArgs: valor que comeca com -- e' tratado como flag booleana", () => {
  const a = parseArgs(["--obs", "--censurar"]);
  assert.deepEqual(a, { obs: true, censurar: true });
});

test("resultadoTrial: verde antes do time-box", () => {
  const r = resultadoTrial({ decorridoS: 600, timeBoxMin: 35, testesPassando: 10, testesTotal: 10 });
  assert.equal(r.censurado, false);
  assert.equal(r.sucesso, true);
  assert.equal(r.duracaoRegistrada, 600);
  assert.equal(r.taxaSucesso, 1);
});

test("resultadoTrial: atingiu o time-box sem sucesso -> CENSURADO em 2100 s", () => {
  const r = resultadoTrial({ decorridoS: 2400, timeBoxMin: 35, testesPassando: 8, testesTotal: 12 });
  assert.equal(r.censurado, true);
  assert.equal(r.sucesso, false);
  assert.equal(r.duracaoRegistrada, 2100);
  assert.equal(r.taxaSucesso, 0.6667);
});

test("resultadoTrial: exatamente no limite do time-box ja conta como censura", () => {
  const r = resultadoTrial({ decorridoS: 2100, timeBoxMin: 35, testesPassando: 12, testesTotal: 12 });
  assert.equal(r.censurado, true);
  assert.equal(r.sucesso, false);
  assert.equal(r.duracaoRegistrada, 2100);
});

test("resultadoTrial: flag --censurar forca censura mesmo abaixo do time-box", () => {
  const r = resultadoTrial({ decorridoS: 900, timeBoxMin: 35, censurar: true, testesPassando: 5, testesTotal: 10 });
  assert.equal(r.censurado, true);
  assert.equal(r.duracaoRegistrada, 2100);
});

test("resultadoTrial: encerrado cedo sem todos os testes -> tempo real, sucesso=nao", () => {
  const r = resultadoTrial({ decorridoS: 900, timeBoxMin: 35, testesPassando: 11, testesTotal: 12 });
  assert.equal(r.censurado, false);
  assert.equal(r.sucesso, false);
  assert.equal(r.duracaoRegistrada, 900);
  assert.equal(r.taxaSucesso, 0.9167);
});

test("resultadoTrial: sem contagem de testes -> taxa vazia e sucesso=nao", () => {
  const r = resultadoTrial({ decorridoS: 600, timeBoxMin: 35 });
  assert.equal(r.taxaSucesso, "");
  assert.equal(r.sucesso, false);
});

test("resultadoTrial: time-box reduzido (30 min) e' respeitado", () => {
  const r = resultadoTrial({ decorridoS: 1800, timeBoxMin: 30, testesPassando: 3, testesTotal: 9 });
  assert.equal(r.timeBoxS, 1800);
  assert.equal(r.censurado, true);
  assert.equal(r.duracaoRegistrada, 1800);
});

test("resultadoTrial: arredonda a duracao para segundos inteiros", () => {
  const r = resultadoTrial({ decorridoS: 42.7, timeBoxMin: 35, testesPassando: 1, testesTotal: 1 });
  assert.equal(r.duracaoRegistrada, 43);
});

// ------------------------------------------------------------ integracao (CLI)

function comCronometro(t) {
  const dir = mkdtempSync(join(tmpdir(), "lab02-cron-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, LAB02_DATA_DIR: dir },
  });
  return { dir, run };
}

function linhasDoCSV(dir) {
  const { cabecalho, linhas } = lerCSV(readFileSync(join(dir, "trials.csv"), "utf8"));
  return linhas.map((l) => Object.fromEntries(cabecalho.map((c, i) => [c, l[i]])));
}

test("CLI: iniciar -> parar (verde) grava 1 linha com censurado=0 sucesso=1", (t) => {
  const { dir, run } = comCronometro(t);
  const ini = run(["iniciar", "--participante", "P1", "--kata", "kata-03", "--tratamento", "com-ia", "--ordem", "5"]);
  assert.equal(ini.status, 0, ini.stderr);
  assert.ok(existsSync(join(dir, "sessao-ativa.json")));

  const parar = run(["parar", "--testes-passando", "10", "--testes-total", "10", "--num-prompts", "7", "--obs", "usou IA, com virgula"]);
  assert.equal(parar.status, 0, parar.stderr);
  assert.equal(existsSync(join(dir, "sessao-ativa.json")), false, "sessao deve ser removida ao parar");

  const linhas = linhasDoCSV(dir);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].trial_id, "P1_kata-03_com-ia");
  assert.equal(linhas[0].censurado, "0");
  assert.equal(linhas[0].sucesso, "1");
  assert.equal(linhas[0].taxa_sucesso, "1");
  assert.equal(linhas[0].observacoes, "usou IA, com virgula");
});

test("CLI: iniciar com trial ja ativo falha (exit 1) sem --forcar", (t) => {
  const { run } = comCronometro(t);
  run(["iniciar", "--participante", "P1", "--kata", "k1", "--tratamento", "com-ia", "--ordem", "1"]);
  const segundo = run(["iniciar", "--participante", "P2", "--kata", "k2", "--tratamento", "sem-ia", "--ordem", "1"]);
  assert.equal(segundo.status, 1);
  assert.match(segundo.stderr, /trial ativo/i);
});

test("CLI: --time-box acima de 35 e' recusado", (t) => {
  const { run } = comCronometro(t);
  const r = run(["iniciar", "--participante", "P1", "--kata", "k1", "--tratamento", "com-ia", "--ordem", "1", "--time-box", "40"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nao pode passar de 35/i);
});

test("CLI: tratamento invalido e' recusado", (t) => {
  const { run } = comCronometro(t);
  const r = run(["iniciar", "--participante", "P1", "--kata", "k1", "--tratamento", "copilot", "--ordem", "1"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tratamento/);
});

test("CLI: registrar com duracao acima do time-box grava CENSURADO em 2100 s", (t) => {
  const { dir, run } = comCronometro(t);
  const r = run(["registrar", "--participante", "P2", "--kata", "kata-01", "--tratamento", "sem-ia", "--ordem", "3",
    "--duracao-min", "40", "--testes-passando", "8", "--testes-total", "12"]);
  assert.equal(r.status, 0, r.stderr);
  const linhas = linhasDoCSV(dir);
  assert.equal(linhas[0].censurado, "1");
  assert.equal(linhas[0].duracao_segundos, "2100");
  assert.equal(linhas[0].sucesso, "0");
  assert.equal(linhas[0].taxa_sucesso, "0.6667");
});

test("CLI: registrar aceita apelidos de tratamento (manual -> sem-ia)", (t) => {
  const { dir, run } = comCronometro(t);
  run(["registrar", "--participante", "P3", "--kata", "kata-05", "--tratamento", "manual", "--ordem", "2",
    "--duracao-segundos", "900", "--testes-passando", "9", "--testes-total", "9"]);
  const linhas = linhasDoCSV(dir);
  assert.equal(linhas[0].trial_id, "P3_kata-05_sem-ia");
  assert.equal(linhas[0].sucesso, "1");
});

test("CLI: dois registros acumulam no mesmo CSV (uma unica linha de cabecalho)", (t) => {
  const { dir, run } = comCronometro(t);
  run(["registrar", "--participante", "P1", "--kata", "k1", "--tratamento", "com-ia", "--ordem", "1", "--duracao-min", "10", "--testes-passando", "8", "--testes-total", "8"]);
  run(["registrar", "--participante", "P1", "--kata", "k2", "--tratamento", "sem-ia", "--ordem", "2", "--duracao-min", "12", "--testes-passando", "6", "--testes-total", "8"]);
  const bruto = readFileSync(join(dir, "trials.csv"), "utf8");
  assert.equal(bruto.split("\n").filter((l) => l.startsWith("trial_id,")).length, 1);
  assert.equal(linhasDoCSV(dir).length, 2);
});

test("CLI: abortar remove a sessao sem gravar no CSV", (t) => {
  const { dir, run } = comCronometro(t);
  run(["iniciar", "--participante", "P1", "--kata", "k1", "--tratamento", "com-ia", "--ordem", "1"]);
  const r = run(["abortar"]);
  assert.equal(r.status, 0);
  assert.equal(existsSync(join(dir, "sessao-ativa.json")), false);
  assert.equal(existsSync(join(dir, "trials.csv")), false);
});

test("CLI: listar sem dados nao quebra", (t) => {
  const { run } = comCronometro(t);
  const r = run(["listar"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nenhum trial|ainda nao ha/i);
});

test("CLI: sem comando mostra a ajuda", (t) => {
  const { run } = comCronometro(t);
  const r = run([]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /comandos:/);
});
