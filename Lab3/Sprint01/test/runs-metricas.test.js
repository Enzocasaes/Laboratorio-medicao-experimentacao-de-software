// Metricas da Pessoa C sobre fixtures montadas a mao, com o resultado
// conferido no papel: change failure rate (RQ 03 a) e tempo de recuperacao
// (RQ 04), incluindo os casos de borda de censura.

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarJanela } from "../src/janela.js";
import {
  agruparPorWorkflow,
  calcularCFR,
  episodiosDeFalha,
  episodiosDoWorkflow,
  paraLinhaEpisodioCSV,
  resumirRecuperacao,
  resumirRepositorio,
  COLUNAS_EPISODIOS,
} from "../src/runs/metricas.js";
import { contarRuns, criarRun } from "../src/runs/modelo.js";
import { workflowRun } from "./apoio/api-falsa.js";

const JANELA = criarJanela("2025-01-01", "2025-12-31");

// run(id, inicio, conclusion, fim?) -> registro normalizado, como sai da coleta.
function run(id, inicio, conclusion, fim = inicio, extra = {}) {
  return criarRun(workflowRun(inicio, conclusion, { id, updated_at: fim, ...extra }), JANELA);
}

// ---- RQ 03 (a): change failure rate --------------------------------------

test("calcularCFR: falhas / (falhas + sucessos)", () => {
  assert.deepEqual(calcularCFR({ successful_runs: 80, failed_runs: 20 }), {
    evaluated_runs: 100,
    change_failure_rate_ci: 0.2,
  });
});

test("calcularCFR: sem runs validos a taxa e' null, nao zero", () => {
  const cfr = calcularCFR({ successful_runs: 0, failed_runs: 0 });
  assert.equal(cfr.change_failure_rate_ci, null);
  assert.equal(cfr.evaluated_runs, 0);
});

test("calcularCFR: ignorados (cancelled, em andamento) ficam fora do denominador", () => {
  const runs = [
    run(1, "2025-02-01T10:00:00Z", "success"),
    run(2, "2025-02-02T10:00:00Z", "failure"),
    run(3, "2025-02-03T10:00:00Z", "cancelled"),
    run(4, "2025-02-04T10:00:00Z", null),
  ];
  const contagens = contarRuns(runs, { defaultBranch: "main" });
  assert.equal(calcularCFR(contagens).evaluated_runs, 2);
  assert.equal(calcularCFR(contagens).change_failure_rate_ci, 0.5);
});

// ---- RQ 04: tempo de recuperacao -----------------------------------------

test("episodio do exemplo do enunciado: 10:00 falha -> 11:20 sucesso = 1h20", () => {
  // Tabela da RQ 04: 09:00 success, 10:00 failure, 10:30 failure,
  // 11:15 success (terminou as 11:20) -> 1h20 = 1,333 h.
  const runs = [
    run(1, "2025-03-01T09:00:00Z", "success"),
    run(2, "2025-03-01T10:00:00Z", "failure"),
    run(3, "2025-03-01T10:30:00Z", "failure"),
    run(4, "2025-03-01T11:15:00Z", "success", "2025-03-01T11:20:00Z"),
  ];

  const episodios = episodiosDoWorkflow(runs);

  assert.equal(episodios.length, 1);
  assert.equal(episodios[0].recovery_hours, 1.333);
  assert.equal(episodios[0].failed_runs_in_episode, 2);
  assert.equal(episodios[0].first_failure_run_id, 2);
  assert.equal(episodios[0].recovery_run_id, 4);
  assert.equal(episodios[0].censored, false);
  assert.equal(episodios[0].prior_success, true);
});

test("episodios: sucessos seguidos nao abrem episodio", () => {
  const runs = [
    run(1, "2025-03-01T09:00:00Z", "success"),
    run(2, "2025-03-01T10:00:00Z", "success"),
  ];
  assert.deepEqual(episodiosDoWorkflow(runs), []);
});

test("episodios: duas quebras separadas viram dois episodios", () => {
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success"),
    run(2, "2025-03-01T01:00:00Z", "failure"),
    run(3, "2025-03-01T03:00:00Z", "success"), // 2 h
    run(4, "2025-03-02T00:00:00Z", "failure"),
    run(5, "2025-03-02T06:00:00Z", "success"), // 6 h
  ];

  const episodios = episodiosDoWorkflow(runs);
  assert.deepEqual(episodios.map((e) => e.recovery_hours), [2, 6]);
  assert.deepEqual(episodios.map((e) => e.episode_index), [1, 2]);
});

test("episodios: falha nunca recuperada fica censurada (sem duracao)", () => {
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success"),
    run(2, "2025-03-01T01:00:00Z", "failure"),
    run(3, "2025-03-01T02:00:00Z", "failure"),
  ];

  const episodios = episodiosDoWorkflow(runs);
  assert.equal(episodios.length, 1);
  assert.equal(episodios[0].censored, true);
  assert.equal(episodios[0].recovery_hours, null);
  assert.equal(episodios[0].recovered_at, null);
  assert.equal(episodios[0].failed_runs_in_episode, 2);
});

test("episodios: falha no inicio da janela, sem sucesso anterior, nao forma episodio", () => {
  const runs = [
    run(1, "2025-01-01T01:00:00Z", "failure"),
    run(2, "2025-01-01T02:00:00Z", "success"),
    run(3, "2025-01-02T01:00:00Z", "failure"),
    run(4, "2025-01-02T02:00:00Z", "success"),
  ];

  const episodios = episodiosDoWorkflow(runs);
  assert.equal(episodios.length, 2);
  assert.equal(episodios[0].prior_success, false); // censurado a esquerda
  assert.equal(episodios[1].prior_success, true);

  const resumo = resumirRecuperacao(episodios);
  assert.equal(resumo.episodes_without_prior_success, 1);
  assert.equal(resumo.recovery_episodes, 1); // so' o segundo entra na conta
  assert.equal(resumo.recovery_median_hours, 1);
});

test("episodios: execucoes ignoradas no meio nao quebram nem fecham o episodio", () => {
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success"),
    run(2, "2025-03-01T01:00:00Z", "failure"),
    run(3, "2025-03-01T02:00:00Z", "cancelled"), // ignorada
    run(4, "2025-03-01T03:00:00Z", "skipped"), // ignorada
    run(5, "2025-03-01T05:00:00Z", "success"),
  ];

  const episodios = episodiosDeFalha(runs, { defaultBranch: "main" });
  assert.equal(episodios.length, 1);
  assert.equal(episodios[0].recovery_hours, 4); // 01:00 -> 05:00
  assert.equal(episodios[0].failed_runs_in_episode, 1);
});

test("agruparPorWorkflow: cada workflow e' contado separado e em ordem cronologica", () => {
  const runs = [
    run(3, "2025-03-01T03:00:00Z", "success", "2025-03-01T03:00:00Z", { workflow_id: 1 }),
    run(1, "2025-03-01T01:00:00Z", "failure", "2025-03-01T01:00:00Z", { workflow_id: 1 }),
    run(2, "2025-03-01T02:00:00Z", "success", "2025-03-01T02:00:00Z", { workflow_id: 2, name: "docs" }),
  ];

  const grupos = agruparPorWorkflow(runs, { defaultBranch: "main" });
  assert.deepEqual([...grupos.keys()], [1, 2]);
  assert.deepEqual(grupos.get(1).map((r) => r.run_id), [1, 3]);
});

test("episodios: a falha de um workflow nao e' fechada pelo sucesso de outro", () => {
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success", "2025-03-01T00:00:00Z", { workflow_id: 1, name: "CI" }),
    run(2, "2025-03-01T01:00:00Z", "failure", "2025-03-01T01:00:00Z", { workflow_id: 1, name: "CI" }),
    run(3, "2025-03-01T02:00:00Z", "success", "2025-03-01T02:00:00Z", { workflow_id: 2, name: "docs" }),
    run(4, "2025-03-01T04:00:00Z", "success", "2025-03-01T04:00:00Z", { workflow_id: 1, name: "CI" }),
  ];

  const episodios = episodiosDeFalha(runs, { defaultBranch: "main" });
  assert.equal(episodios.length, 1);
  assert.equal(episodios[0].workflow_id, 1);
  assert.equal(episodios[0].workflow_name, "CI");
  assert.equal(episodios[0].recovery_hours, 3); // 01:00 -> 04:00, e nao 02:00
});

test("resumirRecuperacao: mediana, IQR e proporcao de censurados", () => {
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success"),
    run(2, "2025-03-01T01:00:00Z", "failure"),
    run(3, "2025-03-01T02:00:00Z", "success"), // 1 h
    run(4, "2025-03-02T00:00:00Z", "failure"),
    run(5, "2025-03-02T03:00:00Z", "success"), // 3 h
    run(6, "2025-03-03T00:00:00Z", "failure"),
    run(7, "2025-03-03T05:00:00Z", "success"), // 5 h
    run(8, "2025-03-04T00:00:00Z", "failure"), // nunca recuperado -> censurado
  ];

  const resumo = resumirRecuperacao(episodiosDeFalha(runs, { defaultBranch: "main" }));

  assert.equal(resumo.recovery_episodes, 4);
  assert.equal(resumo.recovery_episodes_recovered, 3);
  assert.equal(resumo.recovery_episodes_censored, 1);
  assert.equal(resumo.recovery_censored_ratio, 0.25);
  assert.equal(resumo.recovery_median_hours, 3); // mediana de 1, 3 e 5
  assert.equal(resumo.recovery_median_days, 0.125);
  assert.equal(resumo.recovery_iqr_hours, 2); // Q3 4 - Q1 2
});

test("resumirRecuperacao: repositorio sem episodio nenhum devolve null, nao zero", () => {
  const resumo = resumirRecuperacao([]);
  assert.equal(resumo.recovery_episodes, 0);
  assert.equal(resumo.recovery_median_hours, null);
  assert.equal(resumo.recovery_censored_ratio, null);
});

test("resumirRecuperacao: duracao negativa e' contada e fica fora da mediana", () => {
  // updated_at anterior ao inicio da falha: dado inconsistente da API.
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success"),
    run(2, "2025-03-01T05:00:00Z", "failure"),
    run(3, "2025-03-01T06:00:00Z", "success", "2025-03-01T04:00:00Z"),
    run(4, "2025-03-02T00:00:00Z", "failure"),
    run(5, "2025-03-02T02:00:00Z", "success"),
  ];

  const resumo = resumirRecuperacao(episodiosDeFalha(runs, { defaultBranch: "main" }));
  assert.equal(resumo.negative_recovery_episodes, 1);
  assert.equal(resumo.recovery_median_hours, 2); // so' o episodio valido
});

// ---- linha do repositorio ------------------------------------------------

test("resumirRepositorio: junta contagens, CFR e recuperacao numa linha so'", () => {
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success"),
    run(2, "2025-03-01T01:00:00Z", "failure"),
    run(3, "2025-03-01T03:00:00Z", "success"),
  ];
  const resumo = resumirRepositorio({
    fullName: "a/b",
    rank: 1,
    defaultBranch: "main",
    contagens: contarRuns(runs, { defaultBranch: "main" }),
    episodios: episodiosDeFalha(runs, { defaultBranch: "main" }),
    fatiasTruncadas: 0,
  });

  assert.equal(resumo.full_name, "a/b");
  assert.equal(resumo.valid_workflow_runs, 3);
  assert.equal(resumo.change_failure_rate_ci, 0.3333);
  assert.equal(resumo.recovery_median_hours, 2);
  assert.equal(resumo.error, null);
});

test("paraLinhaEpisodioCSV: booleanos viram 0/1 e nulos viram vazio", () => {
  const runs = [
    run(1, "2025-03-01T00:00:00Z", "success"),
    run(2, "2025-03-01T01:00:00Z", "failure"),
  ];
  const [episodio] = episodiosDeFalha(runs, { defaultBranch: "main" });
  const linha = paraLinhaEpisodioCSV("a/b", episodio);

  assert.equal(linha.length, COLUNAS_EPISODIOS.length);
  assert.equal(linha[COLUNAS_EPISODIOS.indexOf("censored")], 1);
  assert.equal(linha[COLUNAS_EPISODIOS.indexOf("prior_success")], 1);
  assert.equal(linha[COLUNAS_EPISODIOS.indexOf("recovery_hours")], "");
});
