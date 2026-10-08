// Metricas DORA calculadas a partir dos workflow runs (Pessoa C):
//
//   RQ 03 (a) - CHANGE FAILURE RATE, proxy de CI:
//       falhas / (falhas + sucessos), sobre os runs validos da janela.
//       Mede falha de PIPELINE, que nao e' falha em producao - a diferenca
//       entra na discussao do artigo e nas ameacas de construto.
//
//   RQ 04 - TEMPO DE RECUPERACAO:
//       dentro de CADA workflow, em ordem cronologica, um EPISODIO DE FALHA
//       comeca na primeira falha depois de um sucesso e termina na proxima
//       execucao bem-sucedida do mesmo workflow. O tempo do episodio e'
//       `updated_at do sucesso - run_started_at da primeira falha`.
//       Valor do repositorio = mediana dos episodios de todos os workflows.
//
// Dois casos de borda tem tratamento explicito, porque mudam o numero:
//
//   CENSURA A DIREITA: episodio que nao termina dentro da janela (a falha
//   nunca foi corrigida). NAO e' descartado nem contado como "recuperacao
//   rapida": fica registrado com `censored = 1`, fora da mediana, e a
//   proporcao de censurados e' reportada por repositorio (secao 3 do
//   enunciado). Descartar faria os repositorios parecerem mais rapidos do que
//   sao.
//
//   CENSURA A ESQUERDA: sequencia de falhas no comeco da janela, sem nenhum
//   sucesso antes dela. Pela definicao do enunciado o episodio comeca "na
//   primeira falha APOS um sucesso", entao essas falhas nao formam episodio:
//   nao se sabe quando a quebra comecou (pode ter sido semanas antes da
//   janela). Elas ficam no CSV com `prior_success = 0` e sao contadas em
//   `episodes_without_prior_success`, de modo que a Sprint 03 possa refazer a
//   conta incluindo-as, se quiser.
//
// Os ajudantes de estatistica (mediana, IQR, arredondamento, horas entre duas
// datas) sao os mesmos do lead time: uma definicao so' para o laboratorio
// inteiro, para que RQ 02 e RQ 04 nao usem percentis diferentes.

import { arredondar, horasEntre, iqr, mediana } from "../releases/leadtime.js";
import { CLASSIFICACAO, ehRunValido } from "./modelo.js";

const HORAS_POR_DIA = 24;

export const COLUNAS_EPISODIOS = Object.freeze([
  "full_name",
  "workflow_id",
  "workflow_name",
  "episode_index",
  "first_failure_run_id",
  "first_failure_at",
  "recovery_run_id",
  "recovered_at",
  "failed_runs_in_episode",
  "recovery_hours",
  "censored",
  "prior_success",
]);

export const COLUNAS_DORA_RUNS = Object.freeze([
  "full_name",
  "rank",
  "default_branch",
  "runs_total",
  "runs_in_window",
  "valid_workflow_runs",
  "successful_runs",
  "failed_runs",
  "ignored_runs",
  "other_event_runs",
  "other_branch_runs",
  "unknown_conclusions",
  "workflows_with_valid_runs",
  "change_failure_rate_ci",
  "recovery_episodes",
  "recovery_episodes_recovered",
  "recovery_episodes_censored",
  "recovery_censored_ratio",
  "episodes_without_prior_success",
  "recovery_median_hours",
  "recovery_median_days",
  "recovery_iqr_hours",
  "negative_recovery_episodes",
  "truncated_slices",
  "error",
]);

// ---- RQ 03 (a) -----------------------------------------------------------

// CFR = falhas / (falhas + sucessos). Sem runs validos a taxa e' null (nao 0):
// "nao medido" e' diferente de "nenhuma falha".
export function calcularCFR({ successful_runs = 0, failed_runs = 0 } = {}) {
  const avaliados = successful_runs + failed_runs;
  return {
    evaluated_runs: avaliados,
    change_failure_rate_ci: avaliados === 0 ? null : arredondar(failed_runs / avaliados, 4),
  };
}

// ---- RQ 04 ---------------------------------------------------------------

// Ordem cronologica deterministica: run_started_at e, no empate, o id.
function emOrdem(runs) {
  return [...runs].sort(
    (a, b) => Date.parse(a.run_started_at) - Date.parse(b.run_started_at) || a.run_id - b.run_id
  );
}

export function agruparPorWorkflow(runs, { defaultBranch = null } = {}) {
  const grupos = new Map();
  for (const run of runs) {
    if (!ehRunValido(run, { defaultBranch })) continue;
    if (!grupos.has(run.workflow_id)) grupos.set(run.workflow_id, []);
    grupos.get(run.workflow_id).push(run);
  }
  for (const [id, lista] of grupos) grupos.set(id, emOrdem(lista));
  return grupos;
}

// Episodios de falha de UM workflow (lista ja em ordem cronologica).
export function episodiosDoWorkflow(runs, { workflowId = null, workflowName = null } = {}) {
  const episodios = [];
  let aberto = null;
  let viuSucesso = false;

  for (const run of runs) {
    if (run.classification === CLASSIFICACAO.FALHA) {
      if (aberto === null) {
        aberto = {
          workflow_id: workflowId ?? run.workflow_id,
          workflow_name: workflowName ?? run.workflow_name,
          first_failure_run_id: run.run_id,
          first_failure_at: run.run_started_at,
          failed_runs_in_episode: 1,
          prior_success: viuSucesso,
        };
      } else {
        aberto.failed_runs_in_episode += 1;
      }
      continue;
    }

    // sucesso
    if (aberto !== null) {
      episodios.push({
        ...aberto,
        recovery_run_id: run.run_id,
        recovered_at: run.updated_at ?? run.run_started_at,
        recovery_hours: arredondar(horasEntre(aberto.first_failure_at, run.updated_at ?? run.run_started_at)),
        censored: false,
      });
      aberto = null;
    }
    viuSucesso = true;
  }

  if (aberto !== null) {
    // Nunca se recuperou dentro da janela: censurado a direita.
    episodios.push({
      ...aberto,
      recovery_run_id: null,
      recovered_at: null,
      recovery_hours: null,
      censored: true,
    });
  }

  return episodios.map((episodio, indice) => ({ ...episodio, episode_index: indice + 1 }));
}

// Todos os episodios do repositorio, de todos os seus workflows.
export function episodiosDeFalha(runs, { defaultBranch = null } = {}) {
  const episodios = [];
  for (const [workflowId, lista] of agruparPorWorkflow(runs, { defaultBranch })) {
    const workflowName = lista[0]?.workflow_name ?? null;
    episodios.push(...episodiosDoWorkflow(lista, { workflowId, workflowName }));
  }
  return episodios;
}

// Episodios que entram na mediana: recuperados, com sucesso anterior (a
// definicao do enunciado) e com duracao nao negativa.
function duracoesValidas(episodios) {
  return episodios
    .filter((e) => !e.censored && e.prior_success && Number.isFinite(e.recovery_hours) && e.recovery_hours >= 0)
    .map((e) => e.recovery_hours);
}

export function resumirRecuperacao(episodios) {
  const comSucessoAnterior = episodios.filter((e) => e.prior_success);
  const recuperados = comSucessoAnterior.filter((e) => !e.censored);
  const censurados = comSucessoAnterior.filter((e) => e.censored);
  const negativos = recuperados.filter((e) => Number.isFinite(e.recovery_hours) && e.recovery_hours < 0);
  const duracoes = duracoesValidas(episodios);
  const medianaHoras = mediana(duracoes);

  return {
    recovery_episodes: comSucessoAnterior.length,
    recovery_episodes_recovered: recuperados.length,
    recovery_episodes_censored: censurados.length,
    recovery_censored_ratio:
      comSucessoAnterior.length === 0 ? null : arredondar(censurados.length / comSucessoAnterior.length, 4),
    episodes_without_prior_success: episodios.length - comSucessoAnterior.length,
    recovery_median_hours: arredondar(medianaHoras),
    recovery_median_days: arredondar(medianaHoras === null ? null : medianaHoras / HORAS_POR_DIA),
    recovery_iqr_hours: arredondar(iqr(duracoes)),
    negative_recovery_episodes: negativos.length,
  };
}

// Linha do CSV por repositorio: contagens + CFR (a) + recuperacao (RQ 04).
export function resumirRepositorio({
  fullName,
  rank = null,
  defaultBranch = null,
  contagens,
  episodios,
  fatiasTruncadas = 0,
  erro = null,
}) {
  return {
    full_name: fullName,
    rank,
    default_branch: defaultBranch,
    ...contagens,
    ...calcularCFR(contagens),
    ...resumirRecuperacao(episodios),
    truncated_slices: fatiasTruncadas,
    error: erro,
  };
}

export function paraLinhaEpisodioCSV(fullName, episodio) {
  return COLUNAS_EPISODIOS.map((coluna) => {
    if (coluna === "full_name") return fullName;
    const valor = episodio[coluna];
    if (typeof valor === "boolean") return valor ? 1 : 0;
    return valor ?? "";
  });
}

export function paraLinhaDoraCSV(resumo) {
  return COLUNAS_DORA_RUNS.map((coluna) => resumo[coluna] ?? "");
}
