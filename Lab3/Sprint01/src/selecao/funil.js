// Criterio de inclusao e funil de selecao (secoes 3 e 7 do enunciado).
//
// Este modulo NAO conta releases nem workflow runs - isso e' das etapas de B e
// C. Ele so' aplica a regra "pelo menos N releases e M workflow runs validos
// na janela" sobre as contagens que essas etapas entregarem, define a amostra
// final e monta a tabela do funil a partir dos registros. Como o funil e'
// sempre recalculado dos registros, ele nunca diverge dos dados.

import { ETAPAS, MOTIVOS, STATUS, excluir } from "./modelo.js";

function contagemValida(valor, campo) {
  if (valor === null) return null;
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(`${campo} deve ser um inteiro >= 0 ou null (recebido: ${JSON.stringify(valor)})`);
  }
  return valor;
}

// Aplica o criterio minimo a um registro, com as contagens produzidas por B
// (releases_in_window) e C (valid_workflow_runs). Contagem ausente (null)
// deixa o registro pendente. Pode ser chamada de novo com contagens novas:
// a avaliacao das etapas de criterio e' refeita do zero.
export function aplicarCriterios(registro, contagens, { minimoDeReleases, minimoDeWorkflowRuns }) {
  if (registro.status === STATUS.EXCLUIDO && registro.excluded_at_stage === ETAPAS.ACTIONS) {
    return registro;
  }
  const r = {
    ...registro,
    releases_in_window: contagemValida(
      contagens.releases_in_window !== undefined ? contagens.releases_in_window : registro.releases_in_window,
      "releases_in_window"
    ),
    valid_workflow_runs: contagemValida(
      contagens.valid_workflow_runs !== undefined ? contagens.valid_workflow_runs : registro.valid_workflow_runs,
      "valid_workflow_runs"
    ),
    status: STATUS.PENDENTE,
    excluded_at_stage: null,
    exclusion_reason: null,
  };
  if (r.releases_in_window === null) return r;
  if (r.releases_in_window < minimoDeReleases) {
    return excluir(r, ETAPAS.RELEASES, MOTIVOS.menosReleases(minimoDeReleases));
  }
  if (r.valid_workflow_runs === null) return r;
  if (r.valid_workflow_runs < minimoDeWorkflowRuns) {
    return excluir(r, ETAPAS.RUNS, MOTIVOS.menosRuns(minimoDeWorkflowRuns));
  }
  return { ...r, status: STATUS.ELEGIVEL };
}

// Corte da amostra final: os `tamanhoAlvo` elegiveis com melhor rank (mais
// estrelas). So' e' feito quando nao ha mais nenhum pendente - senao um
// pendente de rank melhor poderia entrar depois e mudar a amostra.
export function definirAmostraFinal(registros, tamanhoAlvo) {
  if (registros.some((r) => r.status === STATUS.PENDENTE)) {
    return { registros, definida: false };
  }
  const candidatos = registros
    .filter((r) => r.status === STATUS.ELEGIVEL || r.status === STATUS.INCLUIDO || r.excluded_at_stage === ETAPAS.AMOSTRA)
    .sort((a, b) => a.rank - b.rank);
  const incluidos = new Set(candidatos.slice(0, tamanhoAlvo).map((r) => r.id));
  const foraDoCorte = new Set(candidatos.slice(tamanhoAlvo).map((r) => r.id));
  return {
    definida: true,
    registros: registros.map((r) => {
      if (incluidos.has(r.id)) return { ...r, status: STATUS.INCLUIDO, excluded_at_stage: null, exclusion_reason: null };
      if (foraDoCorte.has(r.id)) return excluir(r, ETAPAS.AMOSTRA, MOTIVOS.FORA_DA_AMOSTRA);
      return r;
    }),
  };
}

export const COLUNAS_FUNIL = Object.freeze([
  "order",
  "stage",
  "description",
  "entered",
  "remaining",
  "excluded",
  "pending",
  "complete",
  "exclusion_reasons",
]);

function resumirMotivos(registros) {
  const contagem = new Map();
  for (const r of registros) contagem.set(r.exclusion_reason, (contagem.get(r.exclusion_reason) ?? 0) + 1);
  return [...contagem.entries()]
    .sort(([ma, a], [mb, b]) => b - a || (ma < mb ? -1 : 1))
    .map(([motivo, n]) => `${motivo}:${n}`)
    .join(";");
}

// Uma linha por etapa: quantos chegaram, quantos passaram, quantos foram
// excluidos (e por que) e quantos ainda dependem de uma etapa nao executada.
// complete = false enquanto houver pendentes nesta etapa ou numa anterior.
export function construirFunil(registros, selecao) {
  const { estrelasAcimaDe, quantidadeDeCandidatos, minimoDeReleases, minimoDeWorkflowRuns, tamanhoAlvoDaAmostra } = selecao;
  const etapas = [
    {
      stage: ETAPAS.CANDIDATOS,
      description: `Candidatos da busca stars:>${estrelasAcimaDe} (os ${quantidadeDeCandidatos} com mais estrelas)`,
      passou: () => true,
    },
    {
      stage: ETAPAS.ACTIONS,
      description: "Usa GitHub Actions (actions/workflows total_count > 0)",
      passou: (r) => r.has_github_actions === true,
    },
    {
      stage: ETAPAS.RELEASES,
      description: `>= ${minimoDeReleases} releases publicadas na janela`,
      passou: (r) => r.releases_in_window !== null && r.releases_in_window >= minimoDeReleases,
    },
    {
      stage: ETAPAS.RUNS,
      description: `>= ${minimoDeWorkflowRuns} workflow runs validos no default branch na janela`,
      passou: (r) => r.valid_workflow_runs !== null && r.valid_workflow_runs >= minimoDeWorkflowRuns,
    },
    {
      stage: ETAPAS.AMOSTRA,
      description: `Amostra final (ate ${tamanhoAlvoDaAmostra} repositorios, por ordem de estrelas)`,
      passou: (r) => r.status === STATUS.INCLUIDO,
    },
  ];

  let chegaram = registros;
  let anteriorCompleta = true;
  return etapas.map((etapa, indice) => {
    const excluidos = chegaram.filter((r) => r.excluded_at_stage === etapa.stage);
    const passaram = chegaram.filter((r) => r.excluded_at_stage !== etapa.stage && etapa.passou(r));
    const pendentes = chegaram.length - passaram.length - excluidos.length;
    anteriorCompleta = anteriorCompleta && pendentes === 0;
    const linha = {
      order: indice + 1,
      stage: etapa.stage,
      description: etapa.description,
      entered: chegaram.length,
      remaining: passaram.length,
      excluded: excluidos.length,
      pending: pendentes,
      complete: anteriorCompleta,
      exclusion_reasons: resumirMotivos(excluidos),
    };
    chegaram = passaram;
    return linha;
  });
}
