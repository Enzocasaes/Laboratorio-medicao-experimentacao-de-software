// RQ 08 (bonus): rework rate. As funcoes estatisticas ja sao conferidas contra
// o scipy em analise-rq05-rq06.test.js; aqui o foco e' o uso delas na RQ 08:
// campo vazio fora do calculo, filtro de >= 10 releases classificadas,
// quartis de frequencia e a familia de Holm com os 4 pares.
// scripts/conferir_rq08.py faz a conferencia com o scipy no dataset completo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import { significativos4, spearman } from "../src/analise/estatistica.js";
import {
  COLUNAS_QUARTIS,
  COLUNAS_RQ08,
  comMinimoClassificadas,
  correlacionar,
  descreverRework,
  diferencaCFRRework,
  executarRQ08,
  porQuartilDeFrequencia,
} from "../src/analise/rq08.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

const perto = (obtido, esperado, tolerancia = 1e-4) =>
  assert.ok(Math.abs(obtido - esperado) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);

// 12 repositorios, frequencia = i releases/semana (quartis de 3 em 3).
//   i = 1, 2   nenhuma release classificada: rework vazio (nao medido)
//   i impar    12 releases classificadas (entram na robustez)
//   i par       5 releases classificadas (ficam fora da robustez)
// CFR (b) = rework - 0,1 (minimo 0); CFR (a) vazio em i = 5; recuperacao vazia em i = 4.
const CORRETIVAS = { 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 1, 9: 5, 10: 3, 11: 6, 12: 4 };

function linhasFixture() {
  const repositorios = [];
  for (let i = 1; i <= 12; i += 1) {
    const classificadas = i <= 2 ? 0 : i % 2 ? 12 : 5;
    const corretivas = CORRETIVAS[i] ?? 0;
    const rework = classificadas === 0 ? "" : (corretivas / classificadas).toFixed(4);
    repositorios.push({
      full_name: `o/r${i}`,
      deployment_frequency_per_week: String(i),
      change_failure_rate_ci: i === 5 ? "" : (((i * 7) % 11) / 100).toFixed(2),
      change_failure_rate_delivery: rework === "" ? "0" : Math.max(0, Number(rework) - 0.1).toFixed(4),
      recovery_median_hours: i === 4 ? "" : String((i * 5) % 13),
      corrective_heuristic: "v3-patch-e-commits",
      corrective_releases: String(corretivas),
      releases_classified: String(classificadas),
      rework_rate: rework,
    });
  }
  return repositorios;
}

test("descreverRework: campo vazio fica fora do n e da mediana (nao vira zero)", () => {
  const d = descreverRework(linhasFixture());
  assert.equal(d.total, 12);
  assert.equal(d.sem_medida, 2);
  assert.equal(d.n, 10);
  // valores: 0,0833 0,1667 0,2 0,2 0,25 0,4 0,4167 0,5 0,6 0,8 -> mediana (0,25 + 0,4) / 2
  perto(d.mediana, 0.325);
  perto(d.minimo, 0.0833);
  assert.equal(d.maximo, 0.8);
});

test("robustez: so' repositorios com >= 10 releases classificadas", () => {
  const filtrados = linhasFixture().filter(comMinimoClassificadas);
  assert.deepEqual(filtrados.map((r) => r.full_name), ["o/r3", "o/r5", "o/r7", "o/r9", "o/r11"]);
  const d = descreverRework(filtrados);
  assert.equal(d.n, 5);
  assert.equal(d.sem_medida, 0);
  perto(d.mediana, 0.25); // 1/12, 2/12, 3/12, 5/12, 6/12
  assert.equal(comMinimoClassificadas({ releases_classified: "" }), false);
  assert.equal(comMinimoClassificadas({ releases_classified: "10" }), true);
});

test("porQuartilDeFrequencia: quartis da frequencia e mediana do rework so' com os medidos", () => {
  const { quartis, kruskal } = porQuartilDeFrequencia(linhasFixture());
  assert.deepEqual(quartis.map((q) => q.quartil), ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(quartis.map((q) => q.n), [3, 3, 3, 3]); // cortes 3,75 / 6,5 / 9,25
  assert.deepEqual(quartis.map((q) => q.rework_n), [1, 3, 3, 3]); // r1 e r2 sem medida
  assert.equal(quartis[0].freq_de, 1);
  assert.equal(quartis[0].freq_ate, 3.75);
  assert.equal(quartis[3].freq_ate, 12);
  perto(quartis[0].rework_mediana, 0.0833);
  perto(quartis[1].rework_mediana, 0.2);
  perto(quartis[2].rework_mediana, 0.25);
  perto(quartis[3].rework_mediana, 0.6);
  assert.equal(kruskal.n, 10);
  assert.equal(kruskal.gl, 3);
  assert.ok(kruskal.epsilon2 > 0 && kruskal.magnitude !== null);
});

test("porQuartilDeFrequencia: dataset vazio nao gera quartis", () => {
  const { quartis, kruskal } = porQuartilDeFrequencia([]);
  assert.deepEqual(quartis, []);
  assert.equal(kruskal.h, null);
});

test("correlacionar: 4 pares numa familia de Holm; n so' com as duas metricas medidas", () => {
  const repositorios = linhasFixture();
  const correlacoes = correlacionar(repositorios);
  assert.deepEqual(
    correlacoes.map((c) => c.id),
    ["rework_x_cfr_entrega", "rework_x_cfr_ci", "rework_x_frequencia", "rework_x_recuperacao"]
  );
  const porId = Object.fromEntries(correlacoes.map((c) => [c.id, c]));
  assert.equal(porId.rework_x_cfr_entrega.n, 10); // r1 e r2 tem CFR (b), mas nao rework
  assert.equal(porId.rework_x_cfr_ci.n, 9); // sem r5
  assert.equal(porId.rework_x_frequencia.n, 10);
  assert.equal(porId.rework_x_recuperacao.n, 9); // sem r4

  // Holm com m = 4: o menor p e' multiplicado por 4, e nenhum ajustado e' menor que o bruto.
  const brutos = correlacoes.map((c) =>
    spearman(repositorios.map((r) => (r.rework_rate === "" ? null : Number(r.rework_rate))),
      repositorios.map((r) => (r[c.y] === "" ? null : Number(r[c.y])))).p
  );
  const menor = Math.min(...brutos);
  const iMenor = brutos.indexOf(menor);
  assert.equal(correlacoes[iMenor].p_holm, significativos4(Math.min(1, 4 * menor)));
  for (const c of correlacoes) assert.ok(c.p_holm >= c.p, `${c.id}: Holm nao pode diminuir o p`);
  // o maior ajustado e' o maior bruto (ou o maximo acumulado), nunca menor
  const maiorBruto = Math.max(...brutos);
  assert.ok(correlacoes[brutos.indexOf(maiorBruto)].p_holm >= significativos4(maiorBruto));
  // frequencia e rework crescem juntos no fixture
  assert.ok(porId.rework_x_frequencia.rho > 0.5);
});

test("diferencaCFRRework: so' repositorios com as duas taxas; conta o sinal", () => {
  const d = diferencaCFRRework(linhasFixture());
  assert.equal(d.n, 10);
  assert.equal(d.negativos, 10);
  assert.equal(d.zeros + d.positivos, 0);
  perto(d.mediana, -0.1);
  perto(d.maximo, -0.0833); // r3: CFR (b) = 0, rework = 1/12
});

test("executarRQ08: grava os CSVs e o relatorio com a versao da heuristica", async () => {
  const pasta = pastaTemporaria();
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });
  const repositorios = linhasFixture();
  const colunas = Object.keys(repositorios[0]);
  writeFileSync(
    join(processados, "dataset.csv"),
    [colunas.join(","), ...repositorios.map((r) => colunas.map((c) => r[c]).join(","))].join("\n") + "\n"
  );
  const config = { janela: criarJanela("2025-10-01", "2026-09-30"), diretorios: { saida: join(pasta, "data") } };
  const resultado = await executarRQ08({ config, log: logSilencioso, agora: () => new Date("2026-10-19T00:00:00Z") });

  assert.equal(resultado.geral.sem_medida, 2);
  assert.equal(resultado.robustez.n, 5);
  assert.deepEqual(resultado.heuristica, ["v3-patch-e-commits"]);

  const correlacoesCSV = lerCSV(readFileSync(resultado.caminhos.correlacoes, "utf8"));
  assert.deepEqual(correlacoesCSV.cabecalho, [...COLUNAS_RQ08]);
  assert.equal(correlacoesCSV.linhas.length, 4);
  const quartisCSV = lerCSV(readFileSync(resultado.caminhos.quartis, "utf8"));
  assert.deepEqual(quartisCSV.cabecalho, [...COLUNAS_QUARTIS]);
  assert.equal(quartisCSV.linhas.length, 4);

  const relatorio = readFileSync(resultado.caminhos.relatorio, "utf8");
  assert.match(relatorio, /Arquivo \*\*gerado\*\* por `npm run analise:rq08`/);
  assert.match(relatorio, /`v3-patch-e-commits`/);
  assert.match(relatorio, /não foi validada/);
  assert.match(relatorio, /Gerado em: 2026-10-19T00:00:00.000Z/);
  assert.match(relatorio, /## Como refazer/);
});
