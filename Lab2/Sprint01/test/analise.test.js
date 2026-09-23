import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  wilcoxonPareado,
  postosComEmpate,
  ajustarHolm,
  fdaNormalPadrao,
  montarParesPorKata,
  montarParesPorIntegrante,
  descritivaPorTratamento,
  analisar,
  gerarCSVResultados,
  relatorioTexto,
  parseArgs,
  carregarTrials,
} from "../src/analise.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLI = join(AQUI, "..", "src", "analise.js");
const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

// ------------------------------------------------------------ postos

test("postosComEmpate: postos 1-based na ordem original", () => {
  assert.deepEqual(postosComEmpate([3, 1, 2]), [3, 1, 2]);
});

test("postosComEmpate: empates recebem posto medio", () => {
  // valores 1,2,2,4 -> postos 1, (2+3)/2, (2+3)/2, 4
  assert.deepEqual(postosComEmpate([1, 2, 2, 4]), [1, 2.5, 2.5, 4]);
});

// ------------------------------------------------------------ Wilcoxon

test("wilcoxon: 6 pares todos na mesma direcao dao o menor p bilateral do desenho (0,031)", () => {
  const r = wilcoxonPareado([1, 2, 3, 4, 5, 6]);
  assert.equal(r.n, 6);
  assert.equal(r.wMais, 21);
  assert.equal(r.wMenos, 0);
  perto(r.pBilateral, 2 / 64); // 0.03125
  assert.ok(r.exato);
  assert.ok(r.rejeitaH0);
});

test("wilcoxon: com 5 pares nao ha como rejeitar H0 (piso 0,0625)", () => {
  const r = wilcoxonPareado([-1, -2, -3, -4, -5]);
  perto(r.pBilateral, 2 / 32);
  perto(r.menorPAtingivel, 2 / 32);
  assert.equal(r.rejeitaH0, false);
});

test("wilcoxon: confere com o exemplo classico do R (depressao): V=40, p=0,03906", () => {
  const x = [1.83, 0.5, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.3];
  const y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29];
  const d = x.map((v, i) => v - y[i]);

  const r = wilcoxonPareado(d);
  assert.equal(r.n, 9);
  assert.equal(r.wMais, 40); // V do wilcox.test(paired = TRUE)
  perto(r.pBilateral, 0.0390625, 1e-6);
  assert.ok(r.rejeitaH0);
});

test("wilcoxon: pares com D=0 sao descartados e reduzem n", () => {
  const r = wilcoxonPareado([0, 1, 2, 3, 0, 4]);
  assert.equal(r.nPares, 6);
  assert.equal(r.n, 4);
  assert.equal(r.descartadosZero, 2);
  perto(r.pBilateral, 2 / 16);
});

test("wilcoxon: sem pares (ou so' zeros) devolve resultado indisponivel", () => {
  assert.equal(wilcoxonPareado([]).suficiente, false);
  assert.equal(wilcoxonPareado([]).motivo, "nenhum par formado");
  assert.equal(wilcoxonPareado([0, 0]).suficiente, false);
});

test("wilcoxon: p unilateral acompanha a direcao observada e vale metade do bilateral", () => {
  const negativo = wilcoxonPareado([-1, -2, -3, -4, -5, -6]);
  perto(negativo.pUnilateral, 1 / 64);
  const positivo = wilcoxonPareado([1, 2, 3, 4, 5, 6]);
  perto(positivo.pUnilateral, 1 / 64);
});

test("wilcoxon: efeito r = |Z|/raiz(n) e simetrico ao inverter o sinal das diferencas", () => {
  const a = wilcoxonPareado([2, 4, 6, 8, 10, 12]);
  const b = wilcoxonPareado([-2, -4, -6, -8, -10, -12]);
  perto(a.r, b.r);
  perto(a.z, -b.z);
  perto(a.r, Math.abs(a.z) / Math.sqrt(6));
});

test("wilcoxon: empates de magnitude nao quebram a variancia nem o p exato", () => {
  const r = wilcoxonPareado([2, -2, 3, 3, 4, 5]);
  assert.ok(r.exato);
  assert.ok(r.pBilateral > 0 && r.pBilateral <= 1);
  assert.ok(Number.isFinite(r.z));
});

test("wilcoxon: acima do limite de enumeracao cai na aproximacao normal", () => {
  const d = Array.from({ length: 12 }, (_, i) => i + 1);
  const r = wilcoxonPareado(d, { maxEnumeracao: 6 });
  assert.equal(r.exato, false);
  perto(r.pBilateral, r.pNormalBilateral);
});

test("fdaNormalPadrao: valores de referencia", () => {
  perto(fdaNormalPadrao(0), 0.5, 1e-7);
  perto(fdaNormalPadrao(1.96), 0.975, 1e-4);
  perto(fdaNormalPadrao(-1.96), 0.025, 1e-4);
});

// ------------------------------------------------------------ Holm

test("ajustarHolm: (m - posicao) * p com monotonicidade", () => {
  const ajustados = ajustarHolm([0.01, 0.04, 0.03, 0.005]);
  perto(ajustados[3], 0.02); // 4 * 0.005
  perto(ajustados[0], 0.03); // 3 * 0.01
  perto(ajustados[2], 0.06); // 2 * 0.03
  perto(ajustados[1], 0.06); // 1 * 0.04, elevado pela monotonicidade
});

test("ajustarHolm: nunca passa de 1 e ignora hipoteses sem p", () => {
  const ajustados = ajustarHolm([0.5, NaN, 0.9]);
  assert.equal(ajustados[1], null);
  assert.ok(ajustados[0] <= 1 && ajustados[2] <= 1);
});

// ------------------------------------------------------------ pareamento

function trial(participante, kata, tratamento, extra = {}) {
  return {
    trial_id: `${participante}_${kata}_${tratamento}`,
    participante, kata, tratamento,
    duracao_segundos: "600", taxa_sucesso: "1", censurado: "0",
    complexidade_ciclomatica_media: "4", duplicacao_percentual: "0",
    ...extra,
  };
}

test("montarParesPorKata: um par por kata, D = mediana(com-ia) - mediana(sem-ia)", () => {
  const trials = [
    trial("p1", "kata-01", "com-ia", { duracao_segundos: "100" }),
    trial("p2", "kata-01", "com-ia", { duracao_segundos: "200" }),
    trial("p3", "kata-01", "sem-ia", { duracao_segundos: "500" }),
  ];

  const { pares, incompletos } = montarParesPorKata(trials, "duracao_segundos");
  assert.equal(pares.length, 1);
  assert.equal(incompletos.length, 0);
  assert.equal(pares[0].xComIA, 150); // mediana de 100 e 200
  assert.equal(pares[0].xSemIA, 500);
  assert.equal(pares[0].diferenca, -350);
  assert.equal(pares[0].nComIA, 2);
});

test("montarParesPorKata: kata com um so' tratamento nao vira par", () => {
  const trials = [
    trial("p1", "kata-01", "com-ia"),
    trial("p1", "kata-02", "sem-ia"),
  ];

  const { pares, incompletos } = montarParesPorKata(trials, "duracao_segundos");
  assert.equal(pares.length, 0);
  assert.deepEqual(incompletos.map((i) => i.kata), ["kata-01", "kata-02"]);
  assert.equal(incompletos[0].nSemIA, 0);
});

test("montarParesPorKata: campo vazio ou nao numerico e' ignorado", () => {
  const trials = [
    trial("p1", "kata-01", "com-ia", { complexidade_ciclomatica_media: "" }),
    trial("p2", "kata-01", "com-ia", { complexidade_ciclomatica_media: "6" }),
    trial("p3", "kata-01", "sem-ia", { complexidade_ciclomatica_media: "NaN" }),
  ];

  const { pares, incompletos } = montarParesPorKata(trials, "complexidade_ciclomatica_media");
  assert.equal(pares.length, 0);
  assert.equal(incompletos[0].nComIA, 1);
  assert.equal(incompletos[0].nSemIA, 0);
});

test("montarParesPorIntegrante: par descritivo por participante", () => {
  const trials = [
    trial("caue", "kata-01", "com-ia", { duracao_segundos: "60" }),
    trial("caue", "kata-02", "com-ia", { duracao_segundos: "120" }),
    trial("caue", "kata-03", "sem-ia", { duracao_segundos: "900" }),
  ];

  const pares = montarParesPorIntegrante(trials, "duracao_segundos");
  assert.equal(pares.length, 1);
  assert.equal(pares[0].diferenca, 90 - 900);
});

// ------------------------------------------------------------ descritiva

test("descritivaPorTratamento: mediana, IQR e outliers por tratamento", () => {
  const trials = [
    ...[10, 12, 14, 16, 18, 200].map((s, i) => trial("p1", `kata-0${i + 1}`, "com-ia", { duracao_segundos: String(s) })),
    ...[20, 22].map((s, i) => trial("p2", `kata-0${i + 1}`, "sem-ia", { duracao_segundos: String(s) })),
  ];

  const d = descritivaPorTratamento(trials, "duracao_segundos");
  assert.equal(d["com-ia"].n, 6);
  assert.equal(d["com-ia"].mediana, 15);
  assert.deepEqual(d["com-ia"].outliers, [200]);
  assert.equal(d["sem-ia"].mediana, 21);
});

// ------------------------------------------------------------ analise completa

test("analisar: 6 katas completos -> 6 pares, Holm sobre as 4 hipoteses", () => {
  const katas = ["kata-01", "kata-02", "kata-03", "kata-04", "kata-05", "kata-06"];
  const trials = katas.flatMap((k, i) => [
    trial("p1", k, "com-ia", { duracao_segundos: String(100 + i * 10), complexidade_ciclomatica_media: "9" }),
    trial("p2", k, "sem-ia", { duracao_segundos: String(900 + i * 10), complexidade_ciclomatica_media: "5" }),
  ]);

  const analise = analisar(trials);
  const h1 = analise.resultados.find((r) => r.id === "H1");
  assert.equal(h1.pares.length, 6);
  assert.equal(h1.teste.n, 6);
  perto(h1.teste.pBilateral, 0.03125);
  assert.ok(h1.teste.medianaDiferencas < 0); // com IA mais rapido

  // H2 (taxa de sucesso identica) tem todas as diferencas zero -> indisponivel
  const h2 = analise.resultados.find((r) => r.id === "H2");
  assert.equal(h2.teste.suficiente, false);

  // Holm sobre as hipoteses testaveis: H1 e H3a (H2 e H3b tem D=0 em todos os
  // pares) -> H1 = 2 * 0,03125
  perto(h1.pHolm, 2 * 0.03125);
  assert.equal(h1.rejeitaH0ComHolm, false);
});

test("analisar: dados de um so' participante nao formam nenhum par", () => {
  const trials = [
    trial("caue", "kata-01", "sem-ia"),
    trial("caue", "kata-03", "com-ia"),
  ];

  const analise = analisar(trials);
  for (const r of analise.resultados) {
    assert.equal(r.teste.suficiente, false);
    assert.equal(r.teste.motivo, "nenhum par formado");
  }
});

test("relatorioTexto: avisa quando o n nao permite rejeitar H0 e lista katas incompletos", () => {
  const trials = ["kata-01", "kata-02", "kata-03"].flatMap((k, i) => [
    trial("p1", k, "com-ia", { duracao_segundos: String(100 + i) }),
    trial("p2", k, "sem-ia", { duracao_segundos: String(900 + i) }),
  ]).concat(trial("p1", "kata-04", "com-ia"));

  const texto = relatorioTexto(analisar(trials), { somenteRQ: ["RQ1"] });
  assert.match(texto, /menor p bilateral atingivel/);
  assert.match(texto, /kata-04 \(com-ia:1, sem-ia:0\)/);
  assert.match(texto, /nao rejeita H10/);
});

test("gerarCSVResultados: uma linha por hipotese, com metodo do p", () => {
  const trials = ["kata-01", "kata-02"].flatMap((k) => [
    trial("p1", k, "com-ia"), trial("p2", k, "sem-ia", { duracao_segundos: "800" }),
  ]);

  const csv = gerarCSVResultados(analisar(trials));
  const linhas = csv.trim().split("\n");
  assert.equal(linhas.length, 5); // cabecalho + 4 hipoteses
  assert.match(linhas[0], /^hipotese,rq,metrica,n_pares/);
  assert.match(linhas[1], /^H1,RQ1,duracao_segundos,2,2,0/);
  assert.match(linhas[1], /exato/);
});

// ------------------------------------------------------------ CLI

test("parseArgs: RQ1 e RQ2 por padrao; --todas e --rq mudam o recorte", () => {
  assert.deepEqual(parseArgs([]).rq, ["RQ1", "RQ2"]);
  assert.equal(parseArgs(["--todas"]).rq, null);
  assert.deepEqual(parseArgs(["--rq", "rq3a"]).rq, ["RQ3A"]);
  assert.equal(parseArgs(["--sem-csv"]).escrever, false);
});

function comDados(t, linhas) {
  const dir = mkdtempSync(join(tmpdir(), "lab02-analise-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cabecalho = "trial_id,participante,kata,tratamento,duracao_segundos,censurado,sucesso,testes_passando,testes_total,taxa_sucesso";
  writeFileSync(join(dir, "trials.csv"), [cabecalho, ...linhas].join("\n") + "\n");
  return dir;
}

const linhaTrial = (p, k, t, s, taxa = 1) =>
  `${p}_${k}_${t},${p},${k},${t},${s},0,1,12,12,${taxa}`;

test("carregarTrials: junta metricas.csv por trial_id quando existe", (t) => {
  const dir = comDados(t, [linhaTrial("p1", "kata-01", "com-ia", 100)]);
  writeFileSync(join(dir, "metricas.csv"), "trial_id,loc,complexidade_ciclomatica_media,duplicacao_percentual\np1_kata-01_com-ia,40,7,0\n");

  const trials = carregarTrials(dir);
  assert.equal(trials.length, 1);
  assert.equal(trials[0].complexidade_ciclomatica_media, "7");
  assert.equal(trials[0].duracao_segundos, "100"); // o trial manda no conflito de colunas
});

test("CLI: roda RQ1/RQ2, grava os CSVs e sai com 0 quando ha pares", (t) => {
  const katas = ["kata-01", "kata-02", "kata-03", "kata-04", "kata-05", "kata-06"];
  const dir = comDados(t, katas.flatMap((k, i) => [
    linhaTrial("p1", k, "com-ia", 100 + i, 1),
    linhaTrial("p2", k, "sem-ia", 900 + i, 0.75),
  ]));

  const saida = execFileSync(process.execPath, [CLI, "--dados", dir], { encoding: "utf8" });
  assert.match(saida, /H1 \(RQ1\)/);
  assert.match(saida, /p bilateral \(exato\) = 0\.031/);
  assert.ok(existsSync(join(dir, "analise-wilcoxon.csv")));
  // sem metricas.csv so' H1 e H2 formam pares: 2 hipoteses x 6 katas
  assert.equal(readFileSync(join(dir, "analise-pares.csv"), "utf8").trim().split("\n").length - 1, 12);
});

test("CLI: sem pares suficientes imprime INDISPONIVEL e sai com 2", (t) => {
  const dir = comDados(t, [linhaTrial("caue", "kata-01", "sem-ia", 800), linhaTrial("caue", "kata-03", "com-ia", 90)]);

  try {
    execFileSync(process.execPath, [CLI, "--dados", dir], { encoding: "utf8" });
    assert.fail("deveria sair com codigo 2");
  } catch (erro) {
    assert.equal(erro.status, 2);
    assert.match(erro.stdout, /RESULTADO INDISPONIVEL/);
  }
});

test("CLI: sem trials.csv avisa e sai com 1", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lab02-analise-vazio-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  try {
    execFileSync(process.execPath, [CLI, "--dados", dir], { encoding: "utf8" });
    assert.fail("deveria sair com codigo 1");
  } catch (erro) {
    assert.equal(erro.status, 1);
    assert.match(erro.stdout, /nenhum trial encontrado/);
  }
});
