// Modelo do workflow run: classificacao de `conclusion` (tabela da secao 3 do
// enunciado), normalizacao do item da API e contagens que alimentam o criterio
// minimo de 50 runs validos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarJanela } from "../src/janela.js";
import {
  CLASSIFICACAO,
  classificarConclusao,
  contarRuns,
  criarRun,
  ehItemDeRunValido,
  ehRunValido,
  paraLinhaRunCSV,
  COLUNAS_RUNS,
} from "../src/runs/modelo.js";
import { workflowRun } from "./apoio/api-falsa.js";

const JANELA = criarJanela("2025-01-01", "2025-12-31");

test("classificarConclusao: success e' sucesso", () => {
  assert.deepEqual(classificarConclusao("success"), { classificacao: CLASSIFICACAO.SUCESSO, conhecida: true });
});

test("classificarConclusao: failure, timed_out e startup_failure sao falha", () => {
  for (const conclusion of ["failure", "timed_out", "startup_failure"]) {
    assert.equal(classificarConclusao(conclusion).classificacao, CLASSIFICACAO.FALHA, conclusion);
  }
});

test("classificarConclusao: cancelled, skipped, neutral, action_required e stale sao ignorados", () => {
  for (const conclusion of ["cancelled", "skipped", "neutral", "action_required", "stale"]) {
    const { classificacao, conhecida } = classificarConclusao(conclusion);
    assert.equal(classificacao, CLASSIFICACAO.IGNORADA, conclusion);
    assert.equal(conhecida, true, conclusion);
  }
});

test("classificarConclusao: conclusion vazia (execucao em andamento) e' ignorada", () => {
  for (const conclusion of [null, undefined, ""]) {
    assert.equal(classificarConclusao(conclusion).classificacao, CLASSIFICACAO.IGNORADA);
    assert.equal(classificarConclusao(conclusion).conhecida, true);
  }
});

test("classificarConclusao: valor novo da API e' ignorado, mas marcado como desconhecido", () => {
  const { classificacao, conhecida } = classificarConclusao("conclusao_que_a_api_inventou");
  assert.equal(classificacao, CLASSIFICACAO.IGNORADA);
  assert.equal(conhecida, false);
});

test("ehItemDeRunValido: exige id inteiro", () => {
  assert.equal(ehItemDeRunValido({ id: 10 }), true);
  assert.equal(ehItemDeRunValido({ id: "10" }), false);
  assert.equal(ehItemDeRunValido(null), false);
});

test("criarRun: normaliza o item da API e marca in_window", () => {
  const run = criarRun(workflowRun("2025-03-01T10:00:00Z", "success", { id: 7, workflow_id: 42, name: "CI" }), JANELA);
  assert.equal(run.run_id, 7);
  assert.equal(run.workflow_id, 42);
  assert.equal(run.workflow_name, "CI");
  assert.equal(run.classification, CLASSIFICACAO.SUCESSO);
  assert.equal(run.in_window, true);
  assert.equal(run.event, "push");
});

test("criarRun: run fora da janela fica in_window = false", () => {
  const run = criarRun(workflowRun("2024-12-31T23:00:00Z", "success"), JANELA);
  assert.equal(run.in_window, false);
});

test("criarRun: sem run_started_at usa created_at", () => {
  const item = { ...workflowRun("2025-05-01T10:00:00Z", "failure"), run_started_at: undefined };
  const run = criarRun(item, JANELA);
  assert.equal(run.run_started_at, "2025-05-01T10:00:00Z");
  assert.equal(run.classification, CLASSIFICACAO.FALHA);
});

test("ehRunValido: so' passa push do default branch com sucesso ou falha", () => {
  const base = { in_window: true, event: "push", head_branch: "main", classification: CLASSIFICACAO.SUCESSO };
  assert.equal(ehRunValido(base, { defaultBranch: "main" }), true);
  assert.equal(ehRunValido({ ...base, event: "schedule" }, { defaultBranch: "main" }), false);
  assert.equal(ehRunValido({ ...base, head_branch: "dev" }, { defaultBranch: "main" }), false);
  assert.equal(ehRunValido({ ...base, classification: CLASSIFICACAO.IGNORADA }, { defaultBranch: "main" }), false);
  assert.equal(ehRunValido({ ...base, in_window: false }, { defaultBranch: "main" }), false);
});

test("contarRuns: separa validos, ignorados, outro evento e outro branch", () => {
  const itens = [
    workflowRun("2025-02-01T10:00:00Z", "success", { id: 1 }),
    workflowRun("2025-02-02T10:00:00Z", "failure", { id: 2 }),
    workflowRun("2025-02-03T10:00:00Z", "timed_out", { id: 3 }),
    workflowRun("2025-02-04T10:00:00Z", "cancelled", { id: 4 }),
    workflowRun("2025-02-05T10:00:00Z", null, { id: 5 }), // em andamento
    workflowRun("2025-02-06T10:00:00Z", "success", { id: 6, event: "schedule" }),
    workflowRun("2025-02-07T10:00:00Z", "success", { id: 7, head_branch: "dev" }),
    workflowRun("2024-06-01T10:00:00Z", "success", { id: 8 }), // fora da janela
  ];
  const contagens = contarRuns(itens.map((i) => criarRun(i, JANELA)), { defaultBranch: "main" });

  assert.equal(contagens.runs_total, 8);
  assert.equal(contagens.runs_in_window, 7);
  assert.equal(contagens.valid_workflow_runs, 3); // 1 sucesso + 2 falhas
  assert.equal(contagens.successful_runs, 1);
  assert.equal(contagens.failed_runs, 2);
  assert.equal(contagens.ignored_runs, 2); // cancelled + em andamento
  assert.equal(contagens.other_event_runs, 1);
  assert.equal(contagens.other_branch_runs, 1);
  assert.equal(contagens.workflows_with_valid_runs, 1);
});

test("contarRuns: conta conclusoes desconhecidas para denunciar mudanca da API", () => {
  const runs = [criarRun(workflowRun("2025-02-01T10:00:00Z", "inventada"), JANELA)];
  assert.equal(contarRuns(runs).unknown_conclusions, 1);
  assert.equal(contarRuns(runs).valid_workflow_runs, 0);
});

test("paraLinhaRunCSV: segue a ordem das colunas e comeca pelo full_name", () => {
  const run = criarRun(workflowRun("2025-03-01T10:00:00Z", "success", { id: 7 }), JANELA);
  const linha = paraLinhaRunCSV("a/b", run);
  assert.equal(linha.length, COLUNAS_RUNS.length);
  assert.equal(linha[0], "a/b");
  assert.equal(linha[COLUNAS_RUNS.indexOf("run_id")], 7);
  assert.equal(linha[COLUNAS_RUNS.indexOf("classification")], CLASSIFICACAO.SUCESSO);
});
