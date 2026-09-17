import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { redirecionarImport, nomeExportado, esqueletoDaSolucao } from "../src/preparar-trial.js";

const SCRIPT = fileURLToPath(new URL("../src/preparar-trial.js", import.meta.url));

const TESTE_DO_KATA = `import { test } from "node:test";
import assert from "node:assert/strict";
import { alocarReservas } from "./solucao-referencia.js";

test("aceita um unico pedido", () => {
  assert.ok(alocarReservas([]));
});
test("recusa sobreposicao", () => {
  assert.ok(alocarReservas([]));
});
`;

test("redirecionarImport: aponta a suite para o arquivo do participante", () => {
  const redirecionado = redirecionarImport(TESTE_DO_KATA);
  assert.match(redirecionado, /from "\.\/solucao\.js"/);
  assert.doesNotMatch(redirecionado, /solucao-referencia/);
  assert.match(redirecionado, /from "node:test"/, "os outros imports ficam intactos");
});

test("nomeExportado: acha a funcao que a suite espera", () => {
  assert.equal(nomeExportado(TESTE_DO_KATA), "alocarReservas");
  assert.equal(nomeExportado('import { test } from "node:test";'), null);
});

test("esqueletoDaSolucao: exporta a funcao certa e nao entrega solucao", () => {
  const esqueleto = esqueletoDaSolucao("alocarReservas", "leo_kata-02_sem-ia");
  assert.match(esqueleto, /export function alocarReservas\(\)/);
  assert.match(esqueleto, /nao implementado/);
});

// ------------------------------------------------------------ integracao (CLI)

function comAmbiente(t) {
  const dir = mkdtempSync(join(tmpdir(), "lab02-preparar-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const katasDir = join(dir, "katas");
  mkdirSync(join(katasDir, "kata-02"), { recursive: true });
  writeFileSync(join(katasDir, "kata-02", "kata-02.test.js"), TESTE_DO_KATA);
  writeFileSync(join(katasDir, "kata-02", "solucao-referencia.js"), "export function alocarReservas() { return 42; }");
  writeFileSync(join(katasDir, "kata-02", "enunciado.md"), "# Kata 02\n");

  const trials = join(dir, "trials");
  const run = (args) => spawnSync(process.execPath, [SCRIPT, "--katas-dir", katasDir, "--trials", trials, ...args], { encoding: "utf8" });
  return { dir, trials, run };
}

test("CLI: monta a pasta do trial com enunciado, suite e esqueleto", (t) => {
  const { trials, run } = comAmbiente(t);
  const r = run(["--participante", "leo", "--kata", "kata-02", "--tratamento", "sem-ia"]);
  assert.equal(r.status, 0, r.stderr);

  const pasta = join(trials, "leo_kata-02_sem-ia");
  assert.ok(existsSync(join(pasta, "enunciado.md")));
  assert.ok(existsSync(join(pasta, "kata-02.test.js")));
  assert.ok(existsSync(join(pasta, "solucao.js")));
  assert.match(r.stdout, /2 testes de aceitacao/);

  const suite = readFileSync(join(pasta, "kata-02.test.js"), "utf8");
  assert.match(suite, /from "\.\/solucao\.js"/);
});

test("CLI: NAO copia a solucao de referencia para a pasta do trial", (t) => {
  const { trials, run } = comAmbiente(t);
  run(["--participante", "leo", "--kata", "kata-02", "--tratamento", "com-ia"]);
  assert.equal(existsSync(join(trials, "leo_kata-02_com-ia", "solucao-referencia.js")), false);
});

test("CLI: nao sobrescreve codigo ja escrito", (t) => {
  const { trials, run } = comAmbiente(t);
  run(["--participante", "leo", "--kata", "kata-02", "--tratamento", "sem-ia"]);
  writeFileSync(join(trials, "leo_kata-02_sem-ia", "solucao.js"), "// meu codigo\n");

  const r = run(["--participante", "leo", "--kata", "kata-02", "--tratamento", "sem-ia"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ja existe/);
  assert.equal(readFileSync(join(trials, "leo_kata-02_sem-ia", "solucao.js"), "utf8"), "// meu codigo\n");
});

test("CLI: kata inexistente ou tratamento invalido -> exit 1", (t) => {
  const { run } = comAmbiente(t);
  assert.equal(run(["--participante", "leo", "--kata", "kata-99", "--tratamento", "sem-ia"]).status, 1);
  assert.equal(run(["--participante", "leo", "--kata", "kata-02", "--tratamento", "talvez"]).status, 1);
});

test("CLI: a suite copiada roda de verdade contra o esqueleto (e falha, como esperado)", (t) => {
  const { trials, run } = comAmbiente(t);
  run(["--participante", "leo", "--kata", "kata-02", "--tratamento", "sem-ia"]);

  // NODE_TEST_CONTEXT precisa sair do ambiente: sem isso o runner de dentro
  // reporta para o runner de fora e o exit code do filho vem zerado
  const { NODE_TEST_CONTEXT, NODE_OPTIONS, ...env } = process.env;
  const suite = spawnSync(process.execPath, ["--test", join(trials, "leo_kata-02_sem-ia", "kata-02.test.js")], { encoding: "utf8", env });
  assert.notEqual(suite.status, 0, "o esqueleto nao pode passar nos testes");
  assert.match(suite.stdout, /nao implementado/);
});
