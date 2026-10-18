// Classificação DORA e descritiva das RQ 01–04. Os cortes vêm da tabela fixada
// pela disciplina, então os testes exercitam cada FRONTEIRA: é ali que um sinal
// trocado (>= em vez de >) muda a categoria de dezenas de repositórios.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import {
  CATEGORIAS,
  categoriaGeral,
  classificarCFR,
  classificarFrequencia,
  classificarLeadTime,
  classificarRecuperacao,
  classificarRepositorio,
  distribuicao,
} from "../src/analise/dora.js";
import {
  classificarAmostra,
  descritiva,
  executarAnaliseDora,
  gerarRelatorioMarkdown,
  percentil,
  resumirMetricas,
  COLUNAS_CLASSIFICACAO,
} from "../src/analise/rq01a04.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

// ---- fronteiras de cada métrica ------------------------------------------

test("frequencia: >= 7/semana e' Elite; logo abaixo e' High", () => {
  assert.equal(classificarFrequencia(7), "Elite");
  assert.equal(classificarFrequencia(6.999), "High");
  assert.equal(classificarFrequencia(1), "High");
});

test("frequencia: entre 1/mes e 1/semana e' Medium; abaixo de 1/mes e' Low", () => {
  assert.equal(classificarFrequencia(0.9999), "Medium");
  assert.equal(classificarFrequencia(12 / 52.1775), "Medium"); // exatamente 1 por mes
  assert.equal(classificarFrequencia(0.2), "Low");
  assert.equal(classificarFrequencia(0), "Low");
});

test("lead time: < 1 dia Elite, 1 a 7 High, 7 a 30 Medium, >= 30 Low", () => {
  assert.equal(classificarLeadTime(0.99), "Elite");
  assert.equal(classificarLeadTime(1), "High");
  assert.equal(classificarLeadTime(6.99), "High");
  assert.equal(classificarLeadTime(7), "Medium");
  assert.equal(classificarLeadTime(29.99), "Medium");
  assert.equal(classificarLeadTime(30), "Low");
});

test("CFR: <= 15% Elite, ate 30% High, ate 45% Medium, acima disso Low", () => {
  assert.equal(classificarCFR(0.15), "Elite");
  assert.equal(classificarCFR(0.1501), "High");
  assert.equal(classificarCFR(0.3), "High");
  assert.equal(classificarCFR(0.45), "Medium");
  assert.equal(classificarCFR(0.4501), "Low");
});

test("recuperacao: < 1 h Elite, ate 1 dia High, ate 1 semana Medium, >= 1 semana Low", () => {
  assert.equal(classificarRecuperacao(0.99), "Elite");
  assert.equal(classificarRecuperacao(1), "High");
  assert.equal(classificarRecuperacao(23.99), "High");
  assert.equal(classificarRecuperacao(24), "Medium");
  assert.equal(classificarRecuperacao(167.99), "Medium");
  assert.equal(classificarRecuperacao(168), "Low");
});

test("metrica nao medida devolve null em vez de Low", () => {
  for (const classificar of [classificarFrequencia, classificarLeadTime, classificarCFR, classificarRecuperacao]) {
    assert.equal(classificar(null), null);
    assert.equal(classificar(""), null);
    assert.equal(classificar(undefined), null);
  }
});

// ---- categoria geral -----------------------------------------------------

test("categoria geral: o exemplo do enunciado (4,3,3,1) -> High", () => {
  const { categoria, pontos, metricas } = categoriaGeral(["Elite", "High", "High", "Low"]);
  assert.equal(pontos, 3);
  assert.equal(categoria, "High");
  assert.equal(metricas, 4);
});

test("categoria geral: mediana entre dois pontos arredonda para baixo", () => {
  // (4,3,2,1) -> mediana 2,5 -> 2 -> Medium
  assert.equal(categoriaGeral(["Elite", "High", "Medium", "Low"]).categoria, "Medium");
});

test("categoria geral: quatro Elite -> Elite; quatro Low -> Low", () => {
  assert.equal(categoriaGeral(["Elite", "Elite", "Elite", "Elite"]).categoria, "Elite");
  assert.equal(categoriaGeral(["Low", "Low", "Low", "Low"]).categoria, "Low");
});

test("categoria geral: metrica nao medida sai da conta, sem virar Low", () => {
  // Tres Elite e uma nao medida: a mediana e' de 3 valores, nao de 4.
  const { categoria, metricas } = categoriaGeral(["Elite", "Elite", "Elite", null]);
  assert.equal(categoria, "Elite");
  assert.equal(metricas, 3);
});

test("categoria geral: sem nenhuma metrica medida nao ha categoria", () => {
  assert.deepEqual(categoriaGeral([null, null, null, null]), { categoria: null, pontos: null, metricas: 0 });
});

test("classificarRepositorio: junta as quatro metricas e o geral", () => {
  const r = classificarRepositorio({
    frequenciaPorSemana: 8, // Elite
    leadTimeDias: 2, // High
    cfr: 0.1, // Elite
    recuperacaoHoras: 30, // Medium
  });
  assert.deepEqual(r.porMetrica, {
    deployment_frequency: "Elite",
    lead_time: "High",
    change_failure_rate: "Elite",
    time_to_restore: "Medium",
  });
  // pontos 4,3,4,2 -> mediana 3,5 -> 3 -> High
  assert.equal(r.categoria, "High");
});

test("distribuicao: conta as categorias e os sem classificacao", () => {
  const d = distribuicao(["Elite", "High", "High", null]);
  assert.equal(d.Elite, 1);
  assert.equal(d.High, 2);
  assert.equal(d.Medium, 0);
  assert.equal(d.sem_classificacao, 1);
  assert.deepEqual(CATEGORIAS, ["Elite", "High", "Medium", "Low"]);
});

// ---- descritiva ----------------------------------------------------------

test("percentil: interpolacao linear igual ao padrao do numpy", () => {
  assert.equal(percentil([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentil([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(percentil([1, 2, 3, 4], 0.75), 3.25);
  assert.equal(percentil([], 0.5), null);
});

test("descritiva: mediana, IQR e extremos, ignorando o que nao foi medido", () => {
  const d = descritiva([1, 2, 3, 4, null, null]);
  assert.equal(d.n, 4);
  assert.equal(d.mediana, 2.5);
  assert.equal(d.iqr, 1.5);
  assert.equal(d.minimo, 1);
  assert.equal(d.maximo, 4);
});

test("descritiva: sem nenhum valor devolve null, nao zero", () => {
  assert.deepEqual(descritiva([null, ""]), { n: 0, mediana: null, q1: null, q3: null, iqr: null, minimo: null, maximo: null });
});

// ---- amostra e etapa -----------------------------------------------------

function repo(nome, { freq, lead, cfr, rec }) {
  return {
    full_name: nome,
    rank: "1",
    stars: "1000",
    language: "Go",
    deployment_frequency_per_week: freq,
    lead_time_release_median_days: lead,
    change_failure_rate_ci: cfr,
    recovery_median_hours: rec,
  };
}

test("classificarAmostra: uma linha por repositorio, com as cinco categorias", () => {
  const linhas = classificarAmostra([
    repo("a/elite", { freq: "10", lead: "0.5", cfr: "0.02", rec: "0.5" }),
    repo("a/low", { freq: "0.1", lead: "40", cfr: "0.6", rec: "200" }),
  ]);

  assert.equal(linhas[0].dora_category, "Elite");
  assert.equal(linhas[1].dora_category, "Low");
  assert.equal(linhas[0].metricas_classificadas, 4);
  for (const coluna of COLUNAS_CLASSIFICACAO) assert.ok(coluna in linhas[0], coluna);
});

test("classificarAmostra: repositorio sem recuperacao e' classificado pelas outras tres", () => {
  const [linha] = classificarAmostra([repo("a/sem-falha", { freq: "10", lead: "0.5", cfr: "0.02", rec: "" })]);
  assert.equal(linha.time_to_restore_category, null);
  assert.equal(linha.metricas_classificadas, 3);
  assert.equal(linha.dora_category, "Elite");
});

test("resumirMetricas: uma linha por RQ, com n, mediana e distribuicao", () => {
  const repositorios = [
    repo("a/um", { freq: "10", lead: "0.5", cfr: "0.02", rec: "0.5" }),
    repo("a/dois", { freq: "2", lead: "10", cfr: "0.2", rec: "48" }),
  ];
  const resumos = resumirMetricas(repositorios, classificarAmostra(repositorios));

  assert.deepEqual(resumos.map((r) => r.rq), ["RQ 01", "RQ 02", "RQ 03", "RQ 04"]);
  const rq01 = resumos[0];
  assert.equal(rq01.n, 2);
  assert.equal(rq01.mediana, 6);
  assert.equal(rq01.elite, 1);
  assert.equal(rq01.high, 1);
});

test("executarAnaliseDora: grava os dois CSVs e o relatorio", async () => {
  const pasta = pastaTemporaria();
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });
  writeFileSync(
    join(processados, "dataset.csv"),
    [
      "full_name,rank,stars,language,deployment_frequency_per_week,lead_time_release_median_days,change_failure_rate_ci,recovery_median_hours",
      "a/elite,1,5000,Go,10,0.5,0.02,0.5",
      "a/medium,2,4000,Rust,0.5,10,0.2,48",
      "a/sem-falha,3,3000,C,3,2,0.05,",
    ].join("\n") + "\n"
  );

  const config = { janela: criarJanela("2025-10-01", "2026-09-30"), diretorios: { saida: join(pasta, "data") } };
  const { classificados, resumos, geral, caminhos } = await executarAnaliseDora({ config, log: logSilencioso });

  assert.equal(classificados.length, 3);
  assert.equal(resumos.length, 4);
  assert.equal(geral.Elite, 1); // so' a/elite: as quatro metricas Elite
  // a/sem-falha tem freq High, lead High e CFR Elite -> mediana 3 -> High
  assert.equal(classificados.find((c) => c.full_name === "a/sem-falha").dora_category, "High");

  const { cabecalho, linhas } = lerCSV(readFileSync(caminhos.classificacao, "utf8"));
  assert.deepEqual(cabecalho, [...COLUNAS_CLASSIFICACAO]);
  assert.equal(linhas.length, 3);

  const relatorio = readFileSync(caminhos.relatorio, "utf8");
  assert.match(relatorio, /RQ 01 a RQ 04/);
  assert.match(relatorio, /2025-10-01 a 2026-09-30/);
  assert.match(relatorio, /Categoria geral/);
});

test("executarAnaliseDora: sem dataset, explica qual etapa rodar antes", async () => {
  const pasta = pastaTemporaria();
  const config = { janela: criarJanela("2025-10-01", "2026-09-30"), diretorios: { saida: join(pasta, "data") } };
  await assert.rejects(() => executarAnaliseDora({ config, log: logSilencioso }), /npm run dataset/);
});

test("gerarRelatorioMarkdown: traz as quatro RQs e a distribuicao geral", () => {
  const repositorios = [repo("a/um", { freq: "10", lead: "0.5", cfr: "0.02", rec: "0.5" })];
  const classificados = classificarAmostra(repositorios);
  const md = gerarRelatorioMarkdown({
    resumos: resumirMetricas(repositorios, classificados),
    classificados,
    geral: distribuicao(classificados.map((c) => c.dora_category)),
    geradoEm: "2026-10-17T00:00:00Z",
    janela: criarJanela("2025-10-01", "2026-09-30"),
  });
  for (const rq of ["RQ 01", "RQ 02", "RQ 03", "RQ 04"]) assert.ok(md.includes(rq), rq);
  assert.match(md, /\| Elite \| 1 \| 100.0% \|/);
});

// ---- variantes obrigatórias (RQ 02 b, RQ 03 b) e censura (RQ 04) ----------

test("resumirComplementares: descritiva das variantes, sem classificar", async () => {
  const { resumirComplementares, COMPLEMENTARES } = await import("../src/analise/rq01a04.js");
  const repositorios = [
    { lead_time_commit_median_days: "2", change_failure_rate_delivery: "0.1", recovery_censored_ratio: "0" },
    { lead_time_commit_median_days: "8", change_failure_rate_delivery: "0.5", recovery_censored_ratio: "0.5" },
  ];

  const linhas = resumirComplementares(repositorios);
  assert.deepEqual(linhas.map((l) => l.rq), ["RQ 02", "RQ 03", "RQ 04"]);
  assert.equal(linhas[0].mediana, 5);
  assert.equal(linhas[0].papel, "complementar");
  // a tabela DORA nao se aplica a elas: as colunas de categoria ficam vazias
  assert.equal(linhas[0].elite, "");
  assert.equal(linhas[1].sem_classificacao, "");
  assert.equal(COMPLEMENTARES.length, 3);
});

test("resumirComplementares: variante sem valor nao vira zero", async () => {
  const { resumirComplementares } = await import("../src/analise/rq01a04.js");
  const [leadB] = resumirComplementares([{ lead_time_commit_median_days: "" }]);
  assert.equal(leadB.n, 0);
  assert.equal(leadB.mediana, null);
  assert.equal(leadB.sem_valor, 1);
});

test("executarAnaliseDora: o CSV de resumo traz as principais e as complementares", async () => {
  const pasta = pastaTemporaria();
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });
  writeFileSync(
    join(processados, "dataset.csv"),
    [
      "full_name,rank,stars,language,deployment_frequency_per_week,lead_time_release_median_days,change_failure_rate_ci,recovery_median_hours,lead_time_commit_median_days,change_failure_rate_delivery,recovery_censored_ratio",
      "a/um,1,5000,Go,10,0.5,0.02,0.5,0.4,0.1,0",
    ].join("\n") + "\n"
  );

  const config = { janela: criarJanela("2025-10-01", "2026-09-30"), diretorios: { saida: join(pasta, "data") } };
  const { complementares, caminhos } = await executarAnaliseDora({ config, log: logSilencioso });

  assert.equal(complementares.length, 3);
  const { linhas } = lerCSV(readFileSync(caminhos.resumo, "utf8"));
  assert.equal(linhas.length, 7); // 4 principais + 3 complementares
  assert.match(readFileSync(caminhos.relatorio, "utf8"), /Variantes obrigatórias e censura/);
});
