// RQ 05 e RQ 06: os testes estatisticos sao implementados sem dependencias, entao
// cada um e' conferido contra o valor que o scipy/statsmodels devolve para a
// mesma entrada (anotado ao lado). scripts/conferir_rq05_rq06.py faz a mesma
// conferencia sobre o dataset completo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import {
  cortesQuartis,
  holm,
  kruskalWallis,
  magnitudeCliff,
  magnitudeEpsilon2,
  magnitudeRho,
  mannWhitney,
  normalBilateral,
  postos,
  quartilDe,
  quiQuadradoSF,
  significativos4,
  spearman,
  spearmanParcial,
  tBilateral,
} from "../src/analise/estatistica.js";
import { COLUNAS_RQ05, decomporCFREntrega, executarRQ05 } from "../src/analise/rq05.js";
import { agruparLinguagens, analisar, executarRQ06, planejarContrastes, tiposPorConsenso } from "../src/analise/rq06.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

const perto = (obtido, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(obtido - esperado) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);

// ---- distribuicoes -----------------------------------------------------------

test("distribuicoes: normal, qui-quadrado e t batem com o scipy", () => {
  perto(normalBilateral(1.96), 0.04999579029644087); // 2 * norm.sf(1.96)
  perto(quiQuadradoSF(3.841458820694124, 1), 0.05); // chi2.sf
  perto(quiQuadradoSF(10, 3), 0.01856613546304325);
  perto(tBilateral(2.5, 10), 0.03144684423660882); // 2 * t.sf(2.5, 10)
  assert.equal(normalBilateral(0), 1);
  assert.equal(quiQuadradoSF(0, 2), 1);
});

// ---- postos e testes ---------------------------------------------------------

test("postos: empates recebem a media dos postos e sao contados", () => {
  const { postos: r, empates } = postos([10, 20, 20, 30, 20]);
  assert.deepEqual(r, [1, 3, 3, 5, 3]);
  assert.deepEqual(empates, [3]);
});

test("spearman: rho e p iguais ao scipy.stats.spearmanr", () => {
  const sem = spearman([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 6, 5]);
  perto(sem.rho, 0.8285714285714287);
  perto(sem.p, 0.04156268221574335);
  assert.ok(sem.ic_inf < sem.rho && sem.rho < sem.ic_sup);

  const comEmpates = spearman([1, 2, 2, 3, 4, 5, 6], [3, 1, 2, 2, 6, 5, 7]);
  perto(comEmpates.rho, 0.7181818181818183);
  perto(comEmpates.p, 0.06909561889264877);
});

test("spearman: pares com valor ausente ficam de fora; constante ou n < 4 nao calcula", () => {
  const r = spearman([1, 2, null, 3, 4, 5, 6], [2, 1, 9, 4, 3, null, 6]);
  assert.equal(r.n, 5);
  assert.equal(spearman([1, 2, 3], [1, 2, 3]).rho, null);
  assert.equal(spearman([1, 1, 1, 1], [1, 2, 3, 4]).rho, null);
  const perfeita = spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
  assert.equal(perfeita.rho, 1);
  assert.equal(perfeita.p, 0);
});

test("spearmanParcial: formula de primeira ordem sobre os rho do scipy, p pela t com n - 3 gl", () => {
  const r = spearmanParcial([1, 2, 3, 4, 5, 6, 7, 8], [2, 1, 4, 3, 7, 8, 6, 5], [1, 3, 2, 5, 4, 6, 8, 7]);
  assert.equal(r.n, 8);
  perto(r.rho, 0.6215595646390119);
  perto(r.p, 0.13620871644213076);
  assert.equal(spearmanParcial([1, 2, 3], [1, 2, 3], [1, 2, 3]).rho, null); // n < 5
});

test("kruskalWallis: H e p iguais ao scipy.stats.kruskal (com empates)", () => {
  const kw = kruskalWallis([[1, 2, 3, 4], [3, 5, 6, 7], [8, 9, 9, 10]]);
  perto(kw.h, 9.073063380281692);
  perto(kw.p, 0.010710489505113479);
  assert.equal(kw.gl, 2);
  perto(kw.epsilon2, 9.073063380281692 / 11);
});

test("kruskalWallis: grupo vazio sai; um grupo so' ou todos iguais nao calcula", () => {
  assert.equal(kruskalWallis([[1, 2, 3], []]).h, null);
  assert.equal(kruskalWallis([[5, 5], [5, 5]]).h, null);
  assert.equal(kruskalWallis([[1, 2], [], [3, 4]]).k, 2);
});

test("mannWhitney: U e p iguais ao scipy (asymptotic, com continuidade) e delta de Cliff", () => {
  const mw = mannWhitney([1, 2, 3, 4, 5], [3, 6, 7, 8, 9, 10]);
  assert.equal(mw.u, 2.5);
  perto(mw.p, 0.02810006355731762);
  perto(mw.delta, (2 * 2.5) / 30 - 1); // 2U / (n1 n2) - 1 = -0,8333
  const empates = mannWhitney([1, 2, 2, 3], [2, 4, 5]);
  assert.equal(empates.u, 2);
  perto(empates.p, 0.19908985214820463);
});

test("mannWhitney: delta positivo quando x tende a ser maior; grupo vazio nao calcula", () => {
  assert.equal(mannWhitney([10, 11, 12], [1, 2, 3]).delta, 1);
  assert.equal(mannWhitney([1, 2], []).p, null);
});

test("holm: igual ao statsmodels multipletests(method='holm'), preservando a ordem e os nulls", () => {
  const ajustados = holm([0.01, 0.04, null, 0.03, 0.5]);
  assert.equal(ajustados[2], null);
  [0.04, 0.09, 0.09, 0.5].forEach((esperado, i) => perto(ajustados.filter((p) => p !== null)[i], esperado));
});

test("significativos4: p minusculo nao vira zero", () => {
  assert.equal(significativos4(1.3941234e-21), 1.394e-21);
  assert.equal(significativos4(0.0481349), 0.04813);
  assert.equal(significativos4(null), null);
});

test("magnitudes: fronteiras de rho, epsilon^2 e delta de Cliff", () => {
  assert.equal(magnitudeRho(0.0999), "nula");
  assert.equal(magnitudeRho(-0.3), "moderada");
  assert.equal(magnitudeRho(0.5), "forte");
  assert.equal(magnitudeEpsilon2(0.0099), "desprezivel");
  assert.equal(magnitudeEpsilon2(0.08), "medio");
  assert.equal(magnitudeEpsilon2(0.26), "grande");
  assert.equal(magnitudeCliff(-0.146), "desprezivel");
  assert.equal(magnitudeCliff(0.33), "medio");
  assert.equal(magnitudeCliff(-0.474), "grande");
});

test("quartis: corte pelo percentil linear e empate no corte fica no quartil de baixo", () => {
  const cortes = cortesQuartis([1, 2, 3, 4, 5, 6, 7, 8, 9]); // 3, 5, 7
  assert.deepEqual(cortes, [3, 5, 7]);
  assert.equal(quartilDe(3, cortes), "Q1");
  assert.equal(quartilDe(3.01, cortes), "Q2");
  assert.equal(quartilDe(7, cortes), "Q3");
  assert.equal(quartilDe(9, cortes), "Q4");
  assert.equal(quartilDe(null, cortes), null);
});

// ---- RQ 05 -------------------------------------------------------------------

test("decomporCFREntrega: oportunidade e condicional; censuradas e indeterminadas fora", () => {
  const linha = (status, dias) => ({ full_name: "a/b", cfr_delivery_status: status, days_to_next: dias });
  const d = decomporCFREntrega([
    linha("failed", "2"),
    linha("not_failed", "3"), // seguinte no prazo, nao corretiva
    linha("not_failed", "30"), // seguinte fora do prazo
    linha("not_failed", ""), // sem seguinte
    linha("censored", "1"),
    linha("undetermined", "1"),
  ]).get("a/b");
  assert.equal(d.avaliadas, 4);
  assert.equal(d.com_seguinte_no_prazo, 2);
  assert.equal(d.falharam, 1);
  assert.equal(d.oportunidade, 0.5);
  assert.equal(d.condicional, 0.5);
  // CFR (b) = 1/4 = oportunidade x condicional
  assert.equal(d.oportunidade * d.condicional, 0.25);
});

test("decomporCFREntrega: sem seguinte no prazo a condicional e' nula, nao zero", () => {
  const d = decomporCFREntrega([{ full_name: "x/y", cfr_delivery_status: "not_failed", days_to_next: "20" }]).get("x/y");
  assert.equal(d.oportunidade, 0);
  assert.equal(d.condicional, null);
});

function datasetSintetico(pasta, n = 40, { comCorretiva = true } = {}) {
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });
  const linguagens = ["TypeScript", "Go", "C", "C++"]; // TS 10, Go 10, C/C++ 20 (n = 40)
  const linhas = ["full_name,rank,stars,language,contributors,age_years,deployment_frequency_per_week,lead_time_release_median_days,change_failure_rate_ci,recovery_median_hours,change_failure_rate_delivery,cfr_delivery_evaluated"];
  const corretiva = ["full_name,cfr_delivery_status,days_to_next"];
  for (let i = 1; i <= n; i += 1) {
    const freq = (i * 0.37) % 5 + 0.1;
    linhas.push(
      [`o/r${i}`, i, 1000 + i * 37, linguagens[i % linguagens.length], 5 + ((i * 13) % 200), 1 + (i % 9), freq.toFixed(3),
        ((i * 7) % 40).toFixed(2), ((i * 3) % 20 / 100).toFixed(3), ((i * 5) % 30).toFixed(2), ((i % 5) / 10).toFixed(2), 5 + (i % 15)].join(",")
    );
    corretiva.push(`o/r${i},failed,1`, `o/r${i},not_failed,${i % 10}`, `o/r${i},not_failed,20`);
  }
  writeFileSync(join(processados, "dataset.csv"), linhas.join("\n") + "\n");
  if (comCorretiva) writeFileSync(join(processados, "release_corretiva.csv"), corretiva.join("\n") + "\n");
  return processados;
}

const configDe = (pasta) => ({
  janela: criarJanela("2025-10-01", "2026-09-30"),
  diretorios: { saida: join(pasta, "data") },
  heuristica: { diasParaCorrecao: 7 },
});

test("executarRQ05: grava as correlacoes com Holm, os quartis, a decomposicao e o relatorio", async () => {
  const pasta = pastaTemporaria();
  datasetSintetico(pasta);
  const { correlacoes, quartis, caminhos } = await executarRQ05({ config: configDe(pasta), log: logSilencioso });

  assert.equal(correlacoes.length, 6);
  for (const c of correlacoes) {
    assert.ok(c.p_holm >= c.p, `${c.id}: Holm nao pode diminuir o p`);
  }
  const min10 = correlacoes.find((c) => c.id === "freq_x_cfr_entrega_min10");
  assert.ok(min10.n < correlacoes.find((c) => c.id === "freq_x_cfr_entrega").n);
  assert.equal(quartis.reduce((s, q) => s + q.n, 0), 40);

  const { cabecalho, linhas } = lerCSV(readFileSync(caminhos.correlacoes, "utf8"));
  assert.deepEqual(cabecalho, [...COLUNAS_RQ05]);
  assert.equal(linhas.length, 6);
  assert.match(readFileSync(caminhos.relatorio, "utf8"), /Decomposição do CFR \(b\)/);
});

test("executarRQ05: sem release_corretiva.csv a decomposicao sai vazia, sem derrubar a etapa", async () => {
  const pasta = pastaTemporaria();
  datasetSintetico(pasta, 12, { comCorretiva: false });
  const { correlacoes } = await executarRQ05({ config: configDe(pasta), log: logSilencioso });
  assert.equal(correlacoes.find((c) => c.id === "freq_x_oportunidade").rho, null);
});

// ---- RQ 06 -------------------------------------------------------------------

test("agruparLinguagens: C e C++ juntas; raras e vazias em Outras", () => {
  const entrada = [...Array(6).fill("C"), ...Array(4).fill("C++"), ...Array(10).fill("Go"), "Ruby", ""];
  const grupos = agruparLinguagens(entrada, { minimo: 10 });
  assert.equal(grupos.filter((g) => g === "C/C++").length, 10);
  assert.equal(grupos.filter((g) => g === "Go").length, 10);
  assert.deepEqual(grupos.slice(-2), ["Outras", "Outras"]);
});

test("tiposPorConsenso: so' a dimensao tipo_do_projeto com consenso", () => {
  const tipos = tiposPorConsenso([
    { dimensao: "tipo_do_projeto", full_name: "a/a", status: "consenso", rotulo_consenso: "biblioteca_framework" },
    { dimensao: "tipo_do_projeto", full_name: "a/b", status: "sem_consenso", rotulo_consenso: "" },
    { dimensao: "release_corretiva", full_name: "a/c", status: "consenso", rotulo_consenso: "sim" },
  ]);
  assert.deepEqual([...tipos], [["a/a", "biblioteca_framework"]]);
});

test("planejarContrastes: cada linguagem automatizada presente x C/C++, na frequencia", () => {
  const soLinguagem = planejarContrastes(new Map([["linguagem", { ordem: ["Go", "TypeScript", "C/C++", "Outras"] }]]));
  assert.deepEqual(soLinguagem.map((c) => c.grupo_a), ["TypeScript", "Go"]);
  assert.ok(soLinguagem.every((c) => c.grupo_b === "C/C++" && c.metrica === "deployment_frequency_per_week" && c.esperado === 1));
});

test("analisar: 'favorece' respeita o sentido da metrica (lead time menor e' melhor)", () => {
  const repositorios = [];
  for (let i = 0; i < 40; i += 1) {
    // idade cresce com i; lead time tambem -> Q4 (mais velhos) tem lead time MAIOR -> favorece Q1
    repositorios.push({
      full_name: `o/r${i}`, language: i % 2 ? "Go" : "Rust", contributors: String(i), age_years: String(i), stars: String(i),
      deployment_frequency_per_week: String(40 - i), lead_time_release_median_days: String(i), change_failure_rate_ci: "0.1",
      recovery_median_hours: "2", dora_score: 3, tipo_do_projeto: null,
    });
  }
  const { contrastes, testes } = analisar(repositorios);
  const lead = contrastes.find((c) => c.fator === "idade" && c.metrica === "lead_time_release_median_days");
  assert.equal(lead.delta, 1);
  assert.equal(lead.favorece, "Q1");
  const freq = contrastes.find((c) => c.fator === "idade" && c.metrica === "deployment_frequency_per_week");
  assert.equal(freq.favorece, "Q1"); // mais novos publicam mais
  assert.equal(freq.hipotese, "confirmada"); // H6: mais antigos -> frequencia menor
  // CFR constante: sem diferenca, nada a favorecer
  const cfr = contrastes.find((c) => c.fator === "idade" && c.metrica === "change_failure_rate_ci");
  assert.equal(cfr.favorece, null);
  assert.equal(testes.find((t) => t.fator === "idade" && t.metrica === "change_failure_rate_ci").h, null);
  // sem consenso, o fator tipo do projeto nao entra
  assert.ok(!testes.some((t) => t.fator === "tipo_do_projeto"));
});

test("executarRQ06: grava testes, contrastes e grupos; tipo do projeto pendente sem consenso", async () => {
  const pasta = pastaTemporaria();
  datasetSintetico(pasta);
  const { testes, contrastes, caminhos } = await executarRQ06({ config: configDe(pasta), log: logSilencioso });

  assert.equal(testes.length, 4 * 5); // linguagem, contribuidores, idade, popularidade x 5 metricas
  assert.ok(contrastes.some((c) => c.grupo_b === "C/C++"));
  assert.equal(contrastes.filter((c) => c.grupo_a === "Q4").length, 3 * 5);
  const relatorio = readFileSync(caminhos.relatorio, "utf8");
  assert.match(relatorio, /Tipo do projeto: pendente/);
  assert.match(relatorio, /Exploratória: contribuidores × idade/);
  assert.match(relatorio, /Kruskal–Wallis/);
  assert.equal(lerCSV(readFileSync(caminhos.grupos, "utf8")).linhas.length > 0, true);
});

test("executarRQ06: com consenso, o tipo do projeto entra como quinto fator", async () => {
  const pasta = pastaTemporaria();
  const processados = datasetSintetico(pasta);
  const tipos = ["biblioteca_framework", "aplicacao_servico", "ferramenta_cli"];
  const consenso = ["dimensao,full_name,status,rotulo_consenso"];
  for (let i = 1; i <= 30; i += 1) consenso.push(`tipo_do_projeto,o/r${i},consenso,${tipos[i % 3]}`);
  writeFileSync(join(processados, "consenso.csv"), consenso.join("\n") + "\n");

  const { testes } = await executarRQ06({ config: configDe(pasta), log: logSilencioso });
  const doTipo = testes.filter((t) => t.fator === "tipo_do_projeto");
  assert.equal(doTipo.length, 5);
  assert.ok(doTipo.every((t) => t.n <= 30 && t.grupos === 3));
});

test("executarRQ05 e executarRQ06: dataset so' com cabecalho sai vazio, sem derrubar o pipeline", async () => {
  const pasta = pastaTemporaria();
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });
  writeFileSync(join(processados, "dataset.csv"), "full_name,deployment_frequency_per_week,change_failure_rate_ci\n");
  const rq05 = await executarRQ05({ config: configDe(pasta), log: logSilencioso });
  assert.deepEqual(rq05.quartis, []);
  assert.ok(rq05.correlacoes.every((c) => c.rho === null));
  const rq06 = await executarRQ06({ config: configDe(pasta), log: logSilencioso });
  assert.ok(rq06.testes.every((t) => t.h === null));
});
