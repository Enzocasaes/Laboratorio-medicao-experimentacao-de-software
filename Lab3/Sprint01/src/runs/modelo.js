// Modelo de um workflow run, na definicao operacional da secao 3 do enunciado.
//
// EXECUCOES CONSIDERADAS: apenas runs do default branch disparados por `push`
// (event = push). O filtro ja vai na URL (src/runs/coleta.js), mas e'
// reconferido aqui, porque a API as vezes devolve runs de outro branch quando
// o repositorio renomeia o default branch.
//
// CLASSIFICACAO PELO CAMPO `conclusion`:
//   success                                  -> sucesso
//   failure, timed_out, startup_failure      -> falha
//   cancelled, skipped, neutral,
//   action_required, stale, vazio/null       -> IGNORADO (nao entra em nenhum
//                                               calculo: nem no CFR, nem nos
//                                               episodios de recuperacao, nem
//                                               na contagem do criterio minimo)
//
// Conclusoes desconhecidas (a API pode ganhar valores novos) tambem sao
// ignoradas, mas contadas a parte em `unknown_conclusions`, para que uma
// mudanca da API apareca no relato em vez de sumir silenciosamente.

import { estaNaJanela } from "../janela.js";

export const CLASSIFICACAO = Object.freeze({
  SUCESSO: "success",
  FALHA: "failure",
  IGNORADA: "ignored",
});

export const CONCLUSOES_DE_FALHA = Object.freeze(["failure", "timed_out", "startup_failure"]);
export const CONCLUSOES_IGNORADAS = Object.freeze([
  "cancelled",
  "skipped",
  "neutral",
  "action_required",
  "stale",
]);

export const COLUNAS_RUNS = Object.freeze([
  "full_name",
  "run_id",
  "workflow_id",
  "workflow_name",
  "run_number",
  "run_attempt",
  "head_branch",
  "event",
  "status",
  "conclusion",
  "classification",
  "run_started_at",
  "updated_at",
  "created_at",
  "in_window",
  "html_url",
]);

// Um item de GET /actions/runs so' serve se identificar o run e o workflow.
export function ehItemDeRunValido(item) {
  return item !== null && typeof item === "object" && Number.isInteger(item.id);
}

// conclusion -> classificacao. `conhecida` distingue "ignorada por regra do
// enunciado" de "valor que o enunciado nao previu".
export function classificarConclusao(conclusion) {
  const valor = typeof conclusion === "string" ? conclusion.trim().toLowerCase() : "";
  if (valor === "success") return { classificacao: CLASSIFICACAO.SUCESSO, conhecida: true };
  if (CONCLUSOES_DE_FALHA.includes(valor)) return { classificacao: CLASSIFICACAO.FALHA, conhecida: true };
  // Vazio = execucao em andamento (status "in_progress"/"queued"), que o
  // enunciado manda ignorar junto com cancelled/skipped/neutral/...
  if (valor === "" || CONCLUSOES_IGNORADAS.includes(valor)) {
    return { classificacao: CLASSIFICACAO.IGNORADA, conhecida: true };
  }
  return { classificacao: CLASSIFICACAO.IGNORADA, conhecida: false };
}

// Item de GET /repos/{owner}/{repo}/actions/runs -> registro normalizado.
// `run_started_at` e' o inicio do run (usado no tempo de recuperacao); quando
// a API nao o envia, cai para created_at, que e' quando o run foi criado.
export function criarRun(item, janela) {
  const conclusion = typeof item.conclusion === "string" && item.conclusion !== "" ? item.conclusion : null;
  const { classificacao, conhecida } = classificarConclusao(conclusion);
  const iniciadoEm = textoOuNulo(item.run_started_at) ?? textoOuNulo(item.created_at);
  return {
    run_id: item.id,
    workflow_id: Number.isInteger(item.workflow_id) ? item.workflow_id : null,
    workflow_name: item.name ?? null,
    run_number: Number.isInteger(item.run_number) ? item.run_number : null,
    run_attempt: Number.isInteger(item.run_attempt) ? item.run_attempt : null,
    head_branch: textoOuNulo(item.head_branch),
    event: textoOuNulo(item.event),
    status: textoOuNulo(item.status),
    conclusion,
    classification: classificacao,
    conclusao_conhecida: conhecida,
    run_started_at: iniciadoEm,
    updated_at: textoOuNulo(item.updated_at),
    created_at: textoOuNulo(item.created_at),
    in_window: iniciadoEm !== null && estaNaJanela(iniciadoEm, janela),
    html_url: item.html_url ?? null,
  };
}

function textoOuNulo(valor) {
  return typeof valor === "string" && valor !== "" ? valor : null;
}

// Run que entra nos calculos: dentro da janela, no default branch, disparado
// por push e com conclusao de sucesso ou falha.
export function ehRunValido(run, { defaultBranch = null } = {}) {
  if (!run.in_window) return false;
  if (run.event !== "push") return false;
  if (defaultBranch !== null && run.head_branch !== null && run.head_branch !== defaultBranch) return false;
  return run.classification === CLASSIFICACAO.SUCESSO || run.classification === CLASSIFICACAO.FALHA;
}

// Contagens por repositorio. `valid_workflow_runs` e' a que alimenta o
// criterio minimo de 50 runs do funil (src/selecao/funil.js).
export function contarRuns(runs, { defaultBranch = null } = {}) {
  const contagens = {
    runs_total: runs.length,
    runs_in_window: 0,
    valid_workflow_runs: 0,
    successful_runs: 0,
    failed_runs: 0,
    ignored_runs: 0,
    other_branch_runs: 0,
    other_event_runs: 0,
    unknown_conclusions: 0,
    workflows_with_valid_runs: 0,
  };
  const workflows = new Set();

  for (const run of runs) {
    if (!run.conclusao_conhecida) contagens.unknown_conclusions += 1;
    if (!run.in_window) continue;
    contagens.runs_in_window += 1;
    if (run.event !== "push") {
      contagens.other_event_runs += 1;
      continue;
    }
    if (defaultBranch !== null && run.head_branch !== null && run.head_branch !== defaultBranch) {
      contagens.other_branch_runs += 1;
      continue;
    }
    if (run.classification === CLASSIFICACAO.IGNORADA) {
      contagens.ignored_runs += 1;
      continue;
    }
    if (run.classification === CLASSIFICACAO.SUCESSO) contagens.successful_runs += 1;
    else contagens.failed_runs += 1;
    contagens.valid_workflow_runs += 1;
    workflows.add(run.workflow_id);
  }

  contagens.workflows_with_valid_runs = workflows.size;
  return contagens;
}

export function paraLinhaRunCSV(fullName, run) {
  return COLUNAS_RUNS.map((coluna) => (coluna === "full_name" ? fullName : run[coluna]));
}
