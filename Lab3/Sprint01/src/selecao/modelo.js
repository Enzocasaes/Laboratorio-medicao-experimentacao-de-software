// Modelo de dados de um repositorio da selecao (o "RepositoryMetadata").
//
// Um registro por candidato, inclusive os descartados: o motivo da exclusao
// fica no proprio registro, entao nada e' removido silenciosamente.
// Os nomes dos campos sao os mesmos no JSON (data/raw/) e nos CSVs
// (data/processed/), em snake_case, proximos aos nomes da API.
//
// Campos preenchidos por outras etapas do pipeline (valor null ate la):
//   releases_in_window   <- etapa de releases (Pessoa B)
//   valid_workflow_runs  <- etapa de workflow runs (Pessoa C)

import { calcularIdade } from "../janela.js";

export const STATUS = Object.freeze({
  PENDENTE: "pending", // passou pelas etapas ja executadas; aguarda as seguintes
  ELEGIVEL: "eligible", // cumpre o criterio minimo; aguarda o corte da amostra final
  INCLUIDO: "included", // faz parte da amostra final
  EXCLUIDO: "excluded", // descartado (ver excluded_at_stage / exclusion_reason)
});

// Etapas do funil, na ordem em que sao aplicadas.
export const ETAPAS = Object.freeze({
  CANDIDATOS: "candidates",
  ACTIONS: "has_github_actions",
  RELEASES: "min_releases",
  RUNS: "min_workflow_runs",
  AMOSTRA: "final_sample",
});

export const MOTIVOS = Object.freeze({
  SEM_ACTIONS: "no_github_actions",
  FORA_DA_AMOSTRA: "beyond_target_sample_size",
  menosReleases: (minimo) => `fewer_than_${minimo}_releases_in_window`,
  menosRuns: (minimo) => `fewer_than_${minimo}_valid_workflow_runs_in_window`,
});

export const COLUNAS = Object.freeze([
  "rank",
  "id",
  "full_name",
  "owner",
  "name",
  "html_url",
  "default_branch",
  "stars",
  "language",
  "contributors",
  "created_at",
  "updated_at",
  "pushed_at",
  "archived",
  "age_days",
  "age_years",
  "created_relative_to_window",
  "has_github_actions",
  "workflow_count",
  "releases_in_window",
  "valid_workflow_runs",
  "status",
  "excluded_at_stage",
  "exclusion_reason",
  "metadata_errors",
  "collected_at",
]);

// Um item da busca so' serve se identificar o repositorio sem ambiguidade.
export function ehItemDeBuscaValido(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    Number.isInteger(item.id) &&
    typeof item.full_name === "string" &&
    /^[^/]+\/[^/]+$/.test(item.full_name) &&
    Number.isInteger(item.stargazers_count)
  );
}

// Item de GET /search/repositories -> registro. O item da busca ja traz todos
// os metadados (inclusive default_branch), entao nao e' preciso um
// GET /repos/{owner}/{repo} extra; so' os contribuidores custam outra chamada.
export function criarRegistro(item, { rank, janela }) {
  const [donoDoNome, nomeDoNome] = item.full_name.split("/");
  const idade = calcularIdade(item.created_at, janela);
  const erros = [];
  if (typeof item.default_branch !== "string" || item.default_branch === "") erros.push("missing_default_branch");
  if (idade.posicao === null) erros.push("invalid_created_at");

  return {
    rank,
    id: item.id,
    full_name: item.full_name,
    owner: item.owner?.login ?? donoDoNome,
    name: item.name ?? nomeDoNome,
    html_url: item.html_url ?? `https://github.com/${item.full_name}`,
    default_branch: erros.includes("missing_default_branch") ? null : item.default_branch,
    stars: item.stargazers_count,
    language: item.language ?? null, // null = o GitHub nao detectou linguagem principal
    contributors: null,
    created_at: item.created_at ?? null,
    updated_at: item.updated_at ?? null,
    pushed_at: item.pushed_at ?? null,
    archived: item.archived === true,
    age_days: idade.idadeDias,
    age_years: idade.idadeAnos,
    created_relative_to_window: idade.posicao,
    has_github_actions: null,
    workflow_count: null,
    releases_in_window: null,
    valid_workflow_runs: null,
    status: STATUS.PENDENTE,
    excluded_at_stage: null,
    exclusion_reason: null,
    metadata_errors: erros,
    collected_at: item._coletadoEm ?? null,
  };
}

export function excluir(registro, etapa, motivo) {
  return { ...registro, status: STATUS.EXCLUIDO, excluded_at_stage: etapa, exclusion_reason: motivo };
}

export function paraLinhaCSV(registro) {
  return COLUNAS.map((coluna) =>
    coluna === "metadata_errors" ? (registro.metadata_errors ?? []).join(";") : registro[coluna]
  );
}
