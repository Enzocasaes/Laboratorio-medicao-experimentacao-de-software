// RQ 07 — análise de sensibilidade. O teste mais importante é o do kappa
// ponderado: ele precisa distinguir "trocou Elite por High" de "trocou Elite
// por Low", que é exatamente o que o kappa simples não faz.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import {
  COMBINACOES,
  ORDEM,
  classificarCombinacoes,
  compararCombinacoes,
  distribuicaoPorCombinacao,
  interpretarKappa,
  kappaPonderado,
  valoresDaCombinacao,
} from "../src/analise/rq07.js";
import { executarSensibilidade, tagsPorRepositorio } from "../src/analise/rq07-etapa.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

const JANELA = criarJanela("2025-10-01", "2026-09-30"); // 365 dias
const SEMANAS = 365 / 7;

const REPO = {
  full_name: "a/um",
  rank: "1",
  releases_in_window: "52",
  prereleases_in_window: "52",
  lead_time_release_median_days: "0.5",
  lead_time_commit_median_days: "10",
  change_failure_rate_ci: "0.05",
  change_failure_rate_delivery: "0.5",
  recovery_median_hours: "2",
};

// ---- valores de cada combinação ------------------------------------------

test("C1 usa release, lead time (a) e CFR (a)", () => {
  const v = valoresDaCombinacao(REPO, COMBINACOES[0], { semanas: SEMANAS });
  assert.equal(v.leadTimeDias, 0.5);
  assert.equal(v.cfr, 0.05);
  assert.ok(Math.abs(v.frequenciaPorSemana - 52 / SEMANAS) < 1e-3);
});

test("C2 soma as pre-releases e troca as duas variantes", () => {
  const v = valoresDaCombinacao(REPO, COMBINACOES[1], { semanas: SEMANAS });
  assert.ok(Math.abs(v.frequenciaPorSemana - 104 / SEMANAS) < 1e-3); // 52 + 52
  assert.equal(v.leadTimeDias, 10); // variante (b)
  assert.equal(v.cfr, 0.5); // CFR (b)
});

test("C3 usa a contagem de tags; sem tags, a frequencia fica null", () => {
  const comTags = valoresDaCombinacao(REPO, COMBINACOES[2], { semanas: SEMANAS, tagsNaJanela: 365 });
  assert.ok(Math.abs(comTags.frequenciaPorSemana - 7) < 1e-2);
  assert.equal(comTags.cfr, 0.05); // CFR (a)
  assert.equal(comTags.leadTimeDias, 10); // lead time (b)

  const semTags = valoresDaCombinacao(REPO, COMBINACOES[2], { semanas: SEMANAS, tagsNaJanela: null });
  assert.equal(semTags.frequenciaPorSemana, null);
});

test("o tempo de recuperacao e' o mesmo nas tres combinacoes", () => {
  const valores = COMBINACOES.map((c) => valoresDaCombinacao(REPO, c, { semanas: SEMANAS, tagsNaJanela: 10 }));
  assert.deepEqual(new Set(valores.map((v) => v.recuperacaoHoras)), new Set([2]));
});

test("classificarCombinacoes: uma categoria por combinacao, por repositorio", () => {
  const [linha] = classificarCombinacoes([REPO], { janela: JANELA, tagsPorRepositorio: new Map([["a/um", 400]]) });
  for (const c of COMBINACOES) {
    assert.ok(ORDEM.includes(linha[`${c.id}_categoria`]), `${c.id} sem categoria`);
  }
  // C3 tem muito mais "deploys" (400 tags) -> nao pode ser pior que C1
  assert.ok(ORDEM.indexOf(linha.C3_categoria) >= ORDEM.indexOf(linha.C1_categoria));
});

// ---- kappa ponderado -----------------------------------------------------

test("kappa ponderado: concordancia total da 1", () => {
  const k = kappaPonderado(["Elite", "High", "Low"], ["Elite", "High", "Low"]);
  assert.equal(k.kappa, 1);
  assert.equal(k.concordancia_exata, 1);
});

test("kappa ponderado: trocar por categoria vizinha pesa menos que trocar por distante", () => {
  const base = ["Elite", "Elite", "High", "High", "Medium", "Medium", "Low", "Low"];
  const vizinha = ["High", "High", "Medium", "Medium", "Low", "Low", "Medium", "Medium"];
  const distante = ["Low", "Low", "Low", "Low", "Elite", "Elite", "Elite", "Elite"];

  const kVizinha = kappaPonderado(base, vizinha).kappa;
  const kDistante = kappaPonderado(base, distante).kappa;
  assert.ok(kVizinha > kDistante, `${kVizinha} deveria ser maior que ${kDistante}`);
});

test("kappa ponderado: ignora quem nao tem categoria nos dois lados", () => {
  const k = kappaPonderado(["Elite", null, "Low"], ["Elite", "High", null]);
  assert.equal(k.n, 1);
});

test("kappa ponderado: sem nenhum par valido devolve null", () => {
  assert.deepEqual(kappaPonderado([null], [null]), { kappa: null, n: 0, concordancia_exata: null });
});

test("interpretarKappa: escala de Landis & Koch", () => {
  assert.equal(interpretarKappa(0.1), "leve");
  assert.equal(interpretarKappa(0.35), "razoavel");
  assert.equal(interpretarKappa(0.55), "moderada");
  assert.equal(interpretarKappa(0.75), "substancial");
  assert.equal(interpretarKappa(0.9), "quase perfeita");
  assert.equal(interpretarKappa(null), "sem dados");
});

// ---- comparação ----------------------------------------------------------

test("compararCombinacoes: tres pares, com quantos mudaram e a distancia", () => {
  const classificados = [
    { full_name: "a", C1_categoria: "Elite", C2_categoria: "Elite", C3_categoria: "Low" },
    { full_name: "b", C1_categoria: "High", C2_categoria: "Medium", C3_categoria: "High" },
  ];
  const pares = compararCombinacoes(classificados);

  assert.deepEqual(pares.map((p) => p.par), ["C1 x C2", "C1 x C3", "C2 x C3"]);
  const c1c2 = pares[0];
  assert.equal(c1c2.mudaram, 1);
  assert.equal(c1c2.mudaram_percentual, 0.5);
  assert.equal(c1c2.distancia_media, 1); // High -> Medium = 1 categoria
  const c1c3 = pares[1];
  assert.equal(c1c3.distancia_maxima, 3); // Elite -> Low
});

test("distribuicaoPorCombinacao: conta as categorias de cada combinacao", () => {
  const d = distribuicaoPorCombinacao([
    { C1_categoria: "Elite", C2_categoria: "High", C3_categoria: null },
    { C1_categoria: "Elite", C2_categoria: "Low", C3_categoria: "High" },
  ]);
  assert.equal(d[0].Elite, 2);
  assert.equal(d[1].High, 1);
  assert.equal(d[2].sem_classificacao, 1);
});

// ---- etapa ---------------------------------------------------------------

function prepararDados(pasta, { comTags = true } = {}) {
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });
  writeFileSync(
    join(processados, "dataset.csv"),
    [
      "full_name,rank,releases_in_window,prereleases_in_window,lead_time_release_median_days,lead_time_commit_median_days,change_failure_rate_ci,change_failure_rate_delivery,recovery_median_hours",
      "a/um,1,52,52,0.5,10,0.05,0.5,2",
      "a/dois,2,6,0,40,30,0.5,0.6,200",
    ].join("\n") + "\n"
  );
  if (comTags) {
    writeFileSync(
      join(processados, "tags_resumo.csv"),
      "full_name,tags_in_window\na/um,400\na/dois,8\n"
    );
  }
  return { janela: JANELA, diretorios: { saida: join(pasta, "data") } };
}

test("executarSensibilidade: grava os dois CSVs e o relatorio", async () => {
  const pasta = pastaTemporaria();
  const config = prepararDados(pasta);

  const { comparacoes, caminhos, semTags } = await executarSensibilidade({ config, log: logSilencioso });

  assert.equal(comparacoes.length, 3);
  assert.equal(semTags, 0);

  const { cabecalho, linhas } = lerCSV(readFileSync(caminhos.classificacao, "utf8"));
  assert.equal(linhas.length, 2);
  assert.ok(cabecalho.includes("C3_categoria"));

  const relatorio = readFileSync(caminhos.relatorio, "utf8");
  assert.match(relatorio, /RQ 07/);
  assert.match(relatorio, /kappa ponderado/i);
  assert.match(relatorio, /tempo de recuperação \(RQ 04\) é o mesmo/);
});

test("executarSensibilidade: sem a etapa de tags, avisa e marca os repositorios", async () => {
  const pasta = pastaTemporaria();
  const config = prepararDados(pasta, { comTags: false });

  const { semTags, caminhos } = await executarSensibilidade({ config, log: logSilencioso });

  assert.equal(semTags, 2);
  assert.match(readFileSync(caminhos.relatorio, "utf8"), /npm run coletar:tags/);
});

test("tagsPorRepositorio: le o resumo da etapa de tags", () => {
  const pasta = pastaTemporaria();
  prepararDados(pasta);
  const mapa = tagsPorRepositorio(join(pasta, "data"));
  assert.equal(mapa.get("a/um"), 400);
  assert.equal(mapa.size, 2);
});

test("executarSensibilidade: sem dataset, explica qual etapa rodar antes", async () => {
  const pasta = pastaTemporaria();
  const config = { janela: JANELA, diretorios: { saida: join(pasta, "data") } };
  await assert.rejects(() => executarSensibilidade({ config, log: logSilencioso }), /npm run dataset/);
});
