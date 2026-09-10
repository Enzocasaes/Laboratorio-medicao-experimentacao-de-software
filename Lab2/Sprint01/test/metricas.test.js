import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  tokenizar, analisarFuncoes, normalizarLinhas, detectarDuplicacao, halstead,
  indiceManutenibilidade, analisarCodigo, separarTrialId, listarArquivosDeCodigo,
} from "../src/metricas.js";
import { lerCSV } from "../src/csv.js";

const SCRIPT = fileURLToPath(new URL("../src/metricas.js", import.meta.url));

// complexidade da unica funcao do trecho
const cc = (codigo) => analisarFuncoes(tokenizar(codigo).tokens)[0].complexidade;

// ---------------------------------------------------------------- tokenizar

test("tokenizar: 'if' dentro de string simples/dupla nao vira ponto de decisao", () => {
  assert.equal(cc('function f() {\n  const s = "if (x) { for } while";\n  return s;\n}'), 1);
  assert.equal(cc("function f() {\n  const s = 'if (x) while (y)';\n  return s;\n}"), 1);
});

test("tokenizar: 'if' dentro de comentario nao conta e a linha e' contada como comentario", () => {
  const { tokens, linhasComentario } = tokenizar("function f() {\n  // if (x) {}\n  /* while (y) */\n  return 1;\n}");
  assert.equal(analisarFuncoes(tokens)[0].complexidade, 1);
  assert.deepEqual([...linhasComentario].sort((a, b) => a - b), [2, 3]);
});

test("tokenizar: literal de regex nao e' confundido com divisao nem com desvio", () => {
  assert.equal(cc("function f(s) {\n  return s.replace(/if|for|while/g, '');\n}"), 1);
  // divisao de verdade continua sendo divisao (nao abre regex ate' o fim do arquivo)
  assert.equal(cc("function f(a, b) {\n  const m = a / b / 2;\n  return m > 1 ? 1 : 0;\n}"), 2);
});

test("tokenizar: template string - o texto nao conta, a interpolacao conta", () => {
  assert.equal(cc("function f(n) {\n  return `valor if for ${n} fim`;\n}"), 1);
  assert.equal(cc('function f(n) {\n  return `valor ${n > 1 ? "muitos" : "um"} fim`;\n}'), 2);
});

// ------------------------------------------------------- complexidade McCabe

test("complexidade: funcao sem desvio = 1", () => {
  assert.equal(cc("function f(a) {\n  return a + 1;\n}"), 1);
});

test("complexidade: if/else = 2 (o else nao cria caminho novo)", () => {
  assert.equal(cc("function f(a) {\n  if (a) { return 1; } else { return 2; }\n}"), 2);
});

test("complexidade: operadores logicos e ternario contam; ?. nao conta", () => {
  assert.equal(cc("function f(a, b) {\n  return a && b;\n}"), 2);
  assert.equal(cc("function f(a, b) {\n  return a ?? b;\n}"), 2);
  assert.equal(cc("function f(a) {\n  return a ? 1 : 2;\n}"), 2);
  assert.equal(cc("function f(a) {\n  return a?.b?.c;\n}"), 1);
});

test("complexidade: switch conta um por case, sem contar switch/default", () => {
  const codigo = `function f(a) {
  switch (a) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    default: return 0;
  }
}`;
  assert.equal(cc(codigo), 4);
});

test("complexidade: for/while/catch contam; try nao conta", () => {
  assert.equal(cc("function f(v) {\n  for (const x of v) { console.log(x); }\n  return v;\n}"), 2);
  assert.equal(cc("function f() {\n  try { g(); } catch (e) { return 1; }\n  return 0;\n}"), 2);
});

test("complexidade: arrow e metodo de classe sao detectados", () => {
  const arrows = analisarFuncoes(tokenizar("const dobro = (x) => x * 2;\nconst filtra = (v) => v.filter((x) => x > 0 && x < 10);").tokens);
  assert.equal(arrows.find((f) => f.nome === "dobro").complexidade, 1);
  assert.equal(Math.max(...arrows.map((f) => f.complexidade)), 2); // o callback com && interno

  const metodo = analisarFuncoes(tokenizar("class A {\n  calcula(x) {\n    if (x) return 1;\n    return 0;\n  }\n}").tokens);
  assert.equal(metodo.length, 1);
  assert.equal(metodo[0].nome, "calcula");
  assert.equal(metodo[0].complexidade, 2);
});

test("complexidade: funcao aninhada e' contada a' parte e nao infla a externa", () => {
  const codigo = `function externa(lista) {
  return lista.map(function interna(x) {
    if (x > 0) return x;
    return 0;
  });
}`;
  const funcoes = analisarFuncoes(tokenizar(codigo).tokens);
  assert.equal(funcoes.find((f) => f.nome === "externa").complexidade, 1);
  assert.equal(funcoes.find((f) => f.nome === "interna").complexidade, 2);
});

test("complexidade: desvio fora de qualquer funcao vira '(nivel de modulo)'", () => {
  const funcoes = analisarFuncoes(tokenizar('const x = 1;\nif (x) { console.log("oi"); }').tokens);
  assert.equal(funcoes.length, 1);
  assert.equal(funcoes[0].nome, "(nivel de modulo)");
  assert.equal(funcoes[0].complexidade, 2);
});

// ---------------------------------------------------------------- duplicacao

const comoLinhas = (textos, arquivo = "solucao.js") =>
  textos.map((texto, i) => ({ arquivo, numero: i + 1, texto }));

const BLOCO = ["const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 5;"];

test("duplicacao: bloco de 5 linhas repetido marca as 10 linhas como duplicadas", () => {
  const r = detectarDuplicacao(comoLinhas([...BLOCO, "const z = 9;", ...BLOCO]), 5);
  assert.equal(r.total, 11);
  assert.equal(r.linhasDuplicadas, 10);
  assert.equal(r.percentual, 90.91);
  assert.equal(r.clones, 2);
});

test("duplicacao: codigo sem repeticao da' 0%", () => {
  const r = detectarDuplicacao(comoLinhas(BLOCO), 5);
  assert.equal(r.linhasDuplicadas, 0);
  assert.equal(r.percentual, 0);
});

test("duplicacao: a janela minima muda o resultado", () => {
  const linhas = comoLinhas([...BLOCO.slice(0, 3), "const z = 9;", ...BLOCO.slice(0, 3)]);
  assert.equal(detectarDuplicacao(linhas, 5).linhasDuplicadas, 0); // bloco menor que a janela
  assert.equal(detectarDuplicacao(linhas, 3).linhasDuplicadas, 6);
});

test("duplicacao: a janela nao atravessa a fronteira entre arquivos", () => {
  const linhas = [...comoLinhas(BLOCO.slice(0, 3), "a.js"), ...comoLinhas(BLOCO.slice(3), "b.js")];
  assert.equal(detectarDuplicacao(linhas, 5).linhasDuplicadas, 0);
});

test("normalizarLinhas: ignora vazias, comentarios e diferencas de indentacao", () => {
  const linhas = normalizarLinhas("// nota\nconst a =   1;\n\n    const a = 1;\n/* bloco\n   de comentario */\n");
  assert.deepEqual(linhas.map((l) => l.texto), ["const a = 1;", "const a = 1;"]);
});

// -------------------------------------------------------- halstead e MI

test("halstead: volume cresce com o tamanho do codigo e e' 0 para vazio", () => {
  assert.equal(halstead([]).volume, 0);
  const curto = halstead(tokenizar("const a = 1;").tokens).volume;
  const longo = halstead(tokenizar("const a = 1;\nconst b = 2;\nconst c = a + b;").tokens).volume;
  assert.ok(longo > curto, `${longo} deveria ser maior que ${curto}`);
});

test("indiceManutenibilidade: fica entre 0 e 100 e cai com complexidade/LOC", () => {
  const simples = indiceManutenibilidade({ volume: 100, complexidadeTotal: 2, loc: 20 });
  const complexo = indiceManutenibilidade({ volume: 100, complexidadeTotal: 40, loc: 20 });
  const grande = indiceManutenibilidade({ volume: 2000, complexidadeTotal: 2, loc: 400 });
  assert.ok(simples > complexo);
  assert.ok(simples > grande);
  for (const mi of [simples, complexo, grande]) {
    assert.ok(mi >= 0 && mi <= 100, `MI fora de 0..100: ${mi}`);
  }
  assert.equal(indiceManutenibilidade({ volume: 0, complexidadeTotal: 0, loc: 0 }), 100);
});

// ------------------------------------------------------------- analisarCodigo

test("analisarCodigo: agrega LOC, complexidade media/max e duplicacao dos arquivos", () => {
  const codigo = `export function f(a) {
  if (a > 0) return 1;
  return 0;
}

export function g(a) {
  return a;
}`;
  const m = analisarCodigo([{ caminho: "solucao.js", codigo }]);
  assert.equal(m.arquivos, 1);
  assert.equal(m.numFuncoes, 2);
  assert.equal(m.complexidadeTotal, 3);
  assert.equal(m.complexidadeMedia, 1.5);
  assert.equal(m.complexidadeMax, 2);
  assert.equal(m.loc, 7);
  assert.ok(m.indiceManutenibilidade > 0 && m.indiceManutenibilidade <= 100);
});

test("separarTrialId: quebra <participante>_<kata>_<tratamento>", () => {
  assert.deepEqual(separarTrialId("P1_kata-03_com-ia"), { participante: "P1", kata: "kata-03", tratamento: "com-ia" });
  assert.deepEqual(separarTrialId("formato-errado"), { participante: "", kata: "", tratamento: "" });
});

// ------------------------------------------------------------ integracao (CLI)

// monta um ambiente temporario com pasta de dados e pasta de trials
function comAmbiente(t) {
  const dir = mkdtempSync(join(tmpdir(), "lab02-metricas-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const trials = join(dir, "trials");
  mkdirSync(trials, { recursive: true });

  const criarTrial = (id, arquivos) => {
    const pasta = join(trials, id);
    mkdirSync(pasta, { recursive: true });
    for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(pasta, nome), conteudo);
  };
  const run = (args = []) => spawnSync(process.execPath, [SCRIPT, "--trials", trials, ...args], {
    encoding: "utf8",
    env: { ...process.env, LAB02_DATA_DIR: dir },
  });
  return { dir, trials, criarTrial, run };
}

const SOLUCAO = `export function classificar(itens) {
  if (!Array.isArray(itens)) throw new Error("entrada invalida");
  return itens
    .filter((i) => i.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome));
}`;

test("CLI: mede os trials, grava data/metricas.csv e resume por tratamento", (t) => {
  const { dir, criarTrial, run } = comAmbiente(t);
  criarTrial("P1_kata-05_com-ia", { "solucao.js": SOLUCAO });
  criarTrial("P2_kata-05_sem-ia", { "solucao.js": SOLUCAO.replace("classificar", "ordenar") });

  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 trial\(s\)/);
  assert.match(r.stdout, /com-ia\s+n=1/);
  assert.match(r.stdout, /sem-ia\s+n=1/);

  const { cabecalho, linhas } = lerCSV(readFileSync(join(dir, "metricas.csv"), "utf8"));
  assert.equal(linhas.length, 2);
  for (const coluna of ["trial_id", "loc", "complexidade_ciclomatica_media", "duplicacao_percentual", "indice_manutenibilidade", "ferramenta_versao"]) {
    assert.ok(cabecalho.includes(coluna), `falta a coluna ${coluna}`);
  }
  const linha = linhas[0];
  assert.equal(linha[cabecalho.indexOf("trial_id")], "P1_kata-05_com-ia");
  assert.equal(linha[cabecalho.indexOf("participante")], "P1");
  assert.equal(linha[cabecalho.indexOf("kata")], "kata-05");
  assert.equal(linha[cabecalho.indexOf("tratamento")], "com-ia");
  assert.ok(Number(linha[cabecalho.indexOf("loc")]) > 0);
});

test("CLI: arquivos de teste do kata ficam FORA da medicao por padrao", (t) => {
  const { dir, criarTrial, run } = comAmbiente(t);
  const teste = 'import { test } from "node:test";\ntest("a", () => { if (1) {} });\ntest("b", () => {});\n';
  criarTrial("P1_kata-05_com-ia", { "solucao.js": SOLUCAO, "kata-05.test.js": teste });

  const semTestes = run();
  assert.equal(semTestes.status, 0, semTestes.stderr);
  assert.match(semTestes.stdout, /arquivos de teste: ignorados/);
  const locSemTestes = Number(colunaDoCSV(join(dir, "metricas.csv"), "loc"));

  const comTestes = run(["--incluir-testes"]);
  assert.equal(comTestes.status, 0, comTestes.stderr);
  const locComTestes = Number(colunaDoCSV(join(dir, "metricas.csv"), "loc"));
  assert.ok(locComTestes > locSemTestes, `${locComTestes} deveria ser maior que ${locSemTestes}`);
});

test("CLI: --trial mede um trial so'", (t) => {
  const { dir, criarTrial, run } = comAmbiente(t);
  criarTrial("P1_kata-05_com-ia", { "solucao.js": SOLUCAO });
  criarTrial("P2_kata-05_sem-ia", { "solucao.js": SOLUCAO });

  const r = run(["--trial", "P2_kata-05_sem-ia"]);
  assert.equal(r.status, 0, r.stderr);
  const { linhas } = lerCSV(readFileSync(join(dir, "metricas.csv"), "utf8"));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0][0], "P2_kata-05_sem-ia");
});

test("CLI: pasta de trials vazia ou trial inexistente -> exit 1", (t) => {
  const { criarTrial, run } = comAmbiente(t);
  assert.equal(run().status, 1);
  criarTrial("P1_kata-05_com-ia", { "solucao.js": SOLUCAO });
  assert.equal(run(["--trial", "P9_kata-99_com-ia"]).status, 1);
});

test("CLI: --juntar cruza trials.csv com metricas.csv pelo trial_id", (t) => {
  const { dir, criarTrial, run } = comAmbiente(t);
  criarTrial("P1_kata-05_com-ia", { "solucao.js": SOLUCAO });
  run();

  // trials.csv como o cronometro grava (so' as colunas usadas no join)
  writeFileSync(join(dir, "trials.csv"),
    "trial_id,participante,kata,tratamento,duracao_segundos,taxa_sucesso\n" +
    "P1_kata-05_com-ia,P1,kata-05,com-ia,845,1\n" +
    "P3_kata-02_sem-ia,P3,kata-02,sem-ia,2100,0.5\n");

  const r = run(["--juntar"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /AVISO: sem metricas.*P3_kata-02_sem-ia/);

  const { cabecalho, linhas } = lerCSV(readFileSync(join(dir, "trials-com-metricas.csv"), "utf8"));
  assert.ok(cabecalho.includes("duracao_segundos") && cabecalho.includes("loc"));
  assert.equal(cabecalho.filter((c) => c === "kata").length, 1, "colunas repetidas no join");
  assert.equal(linhas.length, 2);
  assert.ok(Number(linhas[0][cabecalho.indexOf("loc")]) > 0);
  assert.equal(linhas[1][cabecalho.indexOf("loc")], "", "trial sem medicao fica com as colunas vazias");
});

test("CLI: --dir mede uma pasta avulsa sem gravar CSV", (t) => {
  const { dir, trials, criarTrial, run } = comAmbiente(t);
  criarTrial("avulso", { "solucao-referencia.js": SOLUCAO });
  const r = run(["--dir", join(trials, "avulso")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /classificar=/);
  assert.equal(existsSync(join(dir, "metricas.csv")), false);
});

test("listarArquivosDeCodigo: pega .js recursivo e ignora node_modules e ocultos", (t) => {
  const { trials, criarTrial } = comAmbiente(t);
  criarTrial("P1_kata-01_com-ia", { "solucao.js": SOLUCAO, "notas.md": "x", "solucao.test.js": "test('a',()=>{})" });
  mkdirSync(join(trials, "P1_kata-01_com-ia", "node_modules", "pacote"), { recursive: true });
  writeFileSync(join(trials, "P1_kata-01_com-ia", "node_modules", "pacote", "index.js"), "module.exports = 1;");

  const semTestes = listarArquivosDeCodigo(join(trials, "P1_kata-01_com-ia"));
  assert.deepEqual(semTestes.map((c) => c.split("/").pop()), ["solucao.js"]);
  const comTestes = listarArquivosDeCodigo(join(trials, "P1_kata-01_com-ia"), true);
  assert.equal(comTestes.length, 2);
});

function colunaDoCSV(caminho, coluna, indiceLinha = 0) {
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  return linhas[indiceLinha][cabecalho.indexOf(coluna)];
}
