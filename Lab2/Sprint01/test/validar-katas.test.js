import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { contarLOC, contarTestes, avaliarKata, avaliarConjunto } from "../src/validar-katas.js";

const SCRIPT = fileURLToPath(new URL("../src/validar-katas.js", import.meta.url));
const MANIFESTO_REAL = fileURLToPath(new URL("../katas.manifest.json", import.meta.url));

const REGRAS = {
  testes_aceitacao_min: 8, testes_aceitacao_max: 12,
  loc_solucao_referencia_min: 40, loc_solucao_referencia_max: 80,
  amplitude_testes_max: 4, amplitude_loc_max: 40,
  hits_google_max: 10, hits_github_code_max: 5,
};

const kataBase = (over = {}) => ({
  id: "kata-x",
  titulo: "Kata de teste",
  dominio: "teste",
  autoral: true,
  planejado: { num_testes_aceitacao: 10, loc_solucao_referencia: 55, dependencias_externas: 0, io_rede_ou_arquivo: false },
  indexacao: { hits_google: null, hits_github_code: null, reconhecido_pelo_assistente: null },
  ...over,
});

// ---------------------------------------------------------------- contarLOC

test("contarLOC: ignora linhas vazias e comentarios de linha", () => {
  const codigo = `
// comentario
const a = 1;

  const b = 2; // com comentario no fim (conta)
`;
  assert.equal(contarLOC(codigo), 2);
});

test("contarLOC: remove blocos /* ... */ inclusive multi-linha", () => {
  const codigo = `/* bloco
ainda no bloco */
export function f() {
  return 1;
}`;
  assert.equal(contarLOC(codigo), 3);
});

// ---------------------------------------------------------------- contarTestes

test("contarTestes: conta test( e it(, com ou sem espaco", () => {
  const codigo = `
test("a", () => {});
test ("b", () => {});
it("c", () => {});
describe("grupo", () => {});
`;
  assert.equal(contarTestes(codigo), 3);
});

test("contarTestes: nao conta palavras que apenas terminam em 'test'/'it'", () => {
  const codigo = `latest(); await wait(); fastest("x");`;
  assert.equal(contarTestes(codigo), 0);
});

// ---------------------------------------------------------------- avaliarKata

test("avaliarKata: kata valido com indexacao nao medida fica PENDENTE", () => {
  const r = avaliarKata(kataBase(), REGRAS);
  assert.equal(r.statusDificuldade, "OK");
  assert.equal(r.statusIndexacao, "PENDENTE");
  assert.equal(r.statusFinal, "PENDENTE");
  assert.equal(r.origem, "planejado");
});

test("avaliarKata: indexacao medida e dentro dos limites -> APROVADO", () => {
  const r = avaliarKata(kataBase({
    indexacao: { hits_google: 2, hits_github_code: 0, reconhecido_pelo_assistente: false },
  }), REGRAS);
  assert.equal(r.statusFinal, "APROVADO");
});

test("avaliarKata: hits_google acima do limite reprova por indexacao", () => {
  const r = avaliarKata(kataBase({
    indexacao: { hits_google: 50, hits_github_code: 0, reconhecido_pelo_assistente: false },
  }), REGRAS);
  assert.equal(r.statusIndexacao, "REPROVADO");
  assert.equal(r.statusFinal, "REPROVADO");
  assert.ok(r.motivos.some((m) => m.includes("hits_google")));
});

test("avaliarKata: assistente que recita a solucao reprova", () => {
  const r = avaliarKata(kataBase({
    indexacao: { hits_google: 0, hits_github_code: 0, reconhecido_pelo_assistente: true },
  }), REGRAS);
  assert.equal(r.statusFinal, "REPROVADO");
  assert.ok(r.motivos.some((m) => m.includes("assistente")));
});

test("avaliarKata: nº de testes planejado fora de [8,12] reprova a dificuldade", () => {
  const r = avaliarKata(kataBase({ planejado: { num_testes_aceitacao: 5, loc_solucao_referencia: 55 } }), REGRAS);
  assert.equal(r.statusDificuldade, "REPROVADO");
  assert.ok(r.motivos.some((m) => m.startsWith("testes=5")));
});

test("avaliarKata: LOC fora da faixa reprova a dificuldade", () => {
  const r = avaliarKata(kataBase({ planejado: { num_testes_aceitacao: 10, loc_solucao_referencia: 120 } }), REGRAS);
  assert.equal(r.statusDificuldade, "REPROVADO");
  assert.ok(r.motivos.some((m) => m.startsWith("loc=120")));
});

test("avaliarKata: dependencia externa reprova", () => {
  const r = avaliarKata(kataBase({
    planejado: { num_testes_aceitacao: 10, loc_solucao_referencia: 55, dependencias_externas: 2 },
  }), REGRAS);
  assert.ok(r.motivos.some((m) => m.includes("dependencias externas")));
});

test("avaliarKata: valores MEDIDOS tem prioridade e divergencia > 2 reprova", () => {
  const r = avaliarKata(kataBase(), REGRAS, { num_testes_aceitacao: 3, loc_solucao_referencia: 8 });
  assert.equal(r.origem, "medido");
  assert.equal(r.testes, 3);
  assert.equal(r.loc, 8);
  assert.equal(r.statusDificuldade, "REPROVADO");
  assert.ok(r.motivos.some((m) => m.includes("divergem do planejado")));
});

// ---------------------------------------------------------------- avaliarConjunto

test("avaliarConjunto: conjunto homogeneo passa e nao acusa outliers", () => {
  const itens = [
    { testes: 10, loc: 45 }, { testes: 11, loc: 50 }, { testes: 12, loc: 48 },
    { testes: 12, loc: 70 }, { testes: 10, loc: 45 }, { testes: 12, loc: 72 },
  ];
  const r = avaliarConjunto(itens, REGRAS);
  assert.equal(r.conjuntoOk, true);
  assert.deepEqual(r.outliersTestes, []);
  assert.deepEqual(r.outliersLoc, []);
  assert.equal(r.amplitudeTestes, 2);
});

test("avaliarConjunto: um kata muito leve quebra a homogeneidade", () => {
  const itens = [
    { testes: 3, loc: 45 }, { testes: 11, loc: 50 }, { testes: 12, loc: 48 },
    { testes: 12, loc: 70 }, { testes: 11, loc: 45 }, { testes: 12, loc: 72 },
  ];
  const r = avaliarConjunto(itens, REGRAS);
  assert.equal(r.conjuntoOk, false);
  assert.ok(r.amplitudeTestes > REGRAS.amplitude_testes_max);
  assert.deepEqual(r.outliersTestes, [0]);
});

// ------------------------------------------------------------ integracao (CLI)

function comSaida(t) {
  const dir = mkdtempSync(join(tmpdir(), "lab02-katas-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, LAB02_DATA_DIR: dir },
  });
  return { dir, run };
}

test("CLI: valida o manifesto real -> exit 0 (tudo PENDENTE) e grava o CSV", (t) => {
  const { dir, run } = comSaida(t);
  const r = run(["--manifest", MANIFESTO_REAL]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /6 pendente\(s\)/);
  assert.match(r.stdout, /conjunto homogeneo: SIM/);
  assert.ok(existsSync(join(dir, "validacao-katas.csv")));
  const { linhas } = readCSV(join(dir, "validacao-katas.csv"));
  assert.equal(linhas.length, 6);
});

test("CLI: manifesto com kata fora da faixa -> exit 1", (t) => {
  const { dir, run } = comSaida(t);
  const manifesto = {
    regras: REGRAS,
    katas: [
      kataBase({ id: "kata-01" }),
      kataBase({ id: "kata-02", planejado: { num_testes_aceitacao: 2, loc_solucao_referencia: 55 } }),
    ],
  };
  const caminho = join(dir, "m.json");
  writeFileSync(caminho, JSON.stringify(manifesto));
  const r = run(["--manifest", caminho]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /1 reprovado\(s\)/);
});

test("CLI: mede LOC/testes reais quando existe a pasta do kata", (t) => {
  const { dir, run } = comSaida(t);
  const katasDir = join(dir, "katas");
  mkdirSync(join(katasDir, "kata-01"), { recursive: true });
  writeFileSync(join(katasDir, "kata-01", "solucao-referencia.js"), "export function f(){\n  return 1;\n}\n");
  writeFileSync(join(katasDir, "kata-01", "kata-01.test.js"), 'test("a",()=>{});\nit("b",()=>{});\n');

  const manifesto = { regras: REGRAS, katas: [kataBase({ id: "kata-01" })] };
  const caminho = join(dir, "m.json");
  writeFileSync(caminho, JSON.stringify(manifesto));

  const r = run(["--manifest", caminho, "--katas-dir", katasDir]);
  assert.match(r.stdout, /medido/);
  // 3 LOC e 2 testes medidos -> ambos fora da faixa -> REPROVADO
  assert.equal(r.status, 1);
});

function readCSV(caminho) {
  const linhasTxt = readFileSync(caminho, "utf8").trim().split("\n");
  return { cabecalho: linhasTxt[0].split(","), linhas: linhasTxt.slice(1) };
}
