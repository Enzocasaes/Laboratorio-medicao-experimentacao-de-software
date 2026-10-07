// Etapa "repositorios" do pipeline (Pessoa A): selecao dos candidatos, filtro
// de GitHub Actions, metadados (estrelas, linguagem, contribuidores, idade) e
// funil de selecao.
//
// Saidas (em <diretorios.saida>):
//   raw/repositories.json          tudo: parametros, fatias da busca e um registro por candidato
//   processed/candidates.csv       todos os candidatos, inclusive os descartados (auditoria)
//   processed/repositories.csv     os que seguem no pipeline -> ENTRADA das etapas de B e C
//   processed/selection_funnel.csv tabela do funil para a Metodologia do artigo
//
// Interface para B e C (sem acoplamento com as implementacoes deles):
//   repositoriosParaColeta(dirSaida)            -> registros que B/C devem processar
//   atualizarCriterios(dirSaida, contagens, cfg) -> aplica o criterio minimo e regrava o funil

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gerarCSV } from "../csv.js";
import { criarJanela } from "../janela.js";
import { logSilencioso } from "../log.js";
import { buscarCandidatos } from "./busca.js";
import { COLUNAS_FUNIL, aplicarCriterios, construirFunil, definirAmostraFinal } from "./funil.js";
import { COLUNAS, ETAPAS, MOTIVOS, STATUS, criarRegistro, excluir, paraLinhaCSV } from "./modelo.js";
import { contarContribuidores, verificarGitHubActions } from "./verificacoes.js";

export function caminhosDeSaida(dirSaida) {
  return {
    json: join(dirSaida, "raw", "repositories.json"),
    candidatos: join(dirSaida, "processed", "candidates.csv"),
    repositorios: join(dirSaida, "processed", "repositories.csv"),
    funil: join(dirSaida, "processed", "selection_funnel.csv"),
  };
}

export function escreverSaidas(dirSaida, selecaoColetada) {
  const caminhos = caminhosDeSaida(dirSaida);
  const { registros, selecao } = selecaoColetada;
  mkdirSync(join(dirSaida, "raw"), { recursive: true });
  mkdirSync(join(dirSaida, "processed"), { recursive: true });

  writeFileSync(caminhos.json, JSON.stringify(selecaoColetada, null, 2) + "\n");
  writeFileSync(caminhos.candidatos, gerarCSV(COLUNAS, registros.map(paraLinhaCSV)));
  writeFileSync(
    caminhos.repositorios,
    gerarCSV(COLUNAS, registros.filter((r) => r.status !== STATUS.EXCLUIDO).map(paraLinhaCSV))
  );
  const funil = construirFunil(registros, selecao);
  writeFileSync(caminhos.funil, gerarCSV(COLUNAS_FUNIL, funil.map((linha) => COLUNAS_FUNIL.map((c) => linha[c]))));
  return { caminhos, funil };
}

export async function executarSelecao({ config, cliente, log = logSilencioso, agora = () => new Date() }) {
  const { janela, selecao, diretorios } = config;
  log.info(`janela de observacao: ${janela.inicio} a ${janela.fim} (${janela.dias} dias)`);

  const busca = await buscarCandidatos(cliente, {
    estrelasAcimaDe: selecao.estrelasAcimaDe,
    quantidade: selecao.quantidadeDeCandidatos,
    log,
  });
  log.info(`${busca.candidatos.length} candidatos selecionados (${busca.totalEncontrado} encontrados em ${busca.fatias.length} fatias)`);
  if (busca.candidatos.length < selecao.quantidadeDeCandidatos) {
    log.aviso(`a busca encontrou menos candidatos (${busca.candidatos.length}) que o configurado (${selecao.quantidadeDeCandidatos})`);
  }

  const registros = [];
  for (const [indice, item] of busca.candidatos.entries()) {
    const prefixo = `[${indice + 1}/${busca.candidatos.length}] ${item.full_name}`;
    let registro = criarRegistro(item, { rank: indice + 1, janela });

    const actions = await verificarGitHubActions(cliente, registro.full_name);
    registro.has_github_actions = actions.possuiActions;
    registro.workflow_count = actions.totalWorkflows;

    if (actions.erro) {
      registro = excluir(registro, ETAPAS.ACTIONS, actions.erro);
      log.aviso(`${prefixo}: descartado (${actions.erro})`);
    } else if (!actions.possuiActions) {
      registro = excluir(registro, ETAPAS.ACTIONS, MOTIVOS.SEM_ACTIONS);
      log.info(`${prefixo}: descartado (${MOTIVOS.SEM_ACTIONS})`);
    } else {
      const contribuidores = await contarContribuidores(cliente, registro.full_name);
      registro.contributors = contribuidores.contribuidores;
      if (contribuidores.erro) {
        registro.metadata_errors.push(contribuidores.erro);
        log.aviso(`${prefixo}: contribuidores indisponiveis (${contribuidores.erro})`);
      }
      log.info(`${prefixo}: segue (${registro.workflow_count} workflows, ${registro.contributors ?? "?"} contribuidores)`);
    }
    registros.push(registro);
  }

  const selecaoColetada = {
    generated_at: agora().toISOString(),
    observation_window: { start: janela.inicio, end: janela.fim, days: janela.dias },
    selecao,
    search_slices: busca.fatias,
    invalid_search_items: busca.itensInvalidos,
    registros,
  };
  const { caminhos, funil } = escreverSaidas(diretorios.saida, selecaoColetada);

  const seguem = registros.filter((r) => r.status !== STATUS.EXCLUIDO).length;
  log.info(`etapa concluida: ${seguem} de ${registros.length} candidatos seguem para as etapas de releases e workflow runs`);
  const linhaActions = funil.find((l) => l.stage === ETAPAS.ACTIONS);
  if (linhaActions.exclusion_reasons) log.info(`descartes: ${linhaActions.exclusion_reasons}`);
  log.info(`saidas: ${caminhos.json}, ${caminhos.repositorios}, ${caminhos.funil}`);
  return selecaoColetada;
}

export function carregarSelecao(dirSaida) {
  const { json } = caminhosDeSaida(dirSaida);
  let dados;
  try {
    dados = JSON.parse(readFileSync(json, "utf8"));
  } catch (erro) {
    throw new Error(`Nao foi possivel ler ${json} (rode antes a etapa "repositorios"): ${erro.message}`);
  }
  return { ...dados, janela: criarJanela(dados.observation_window.start, dados.observation_window.end) };
}

// Lista que B e C recebem: os repositorios que passaram pela selecao e ainda
// nao foram descartados. Cada registro traz owner, name, full_name e
// default_branch - o necessario para chamar /releases e /actions/runs.
export function repositoriosParaColeta(dirSaida) {
  return carregarSelecao(dirSaida).registros.filter((r) => r.status !== STATUS.EXCLUIDO);
}

// contagens: { "owner/name": { releases_in_window?, valid_workflow_runs? } }
// Aplica o criterio minimo, define a amostra final (se nao houver pendentes)
// e regrava JSON, CSVs e funil.
export function atualizarCriterios(dirSaida, contagens, { agora = () => new Date() } = {}) {
  const dados = carregarSelecao(dirSaida);
  const { janela, ...selecaoColetada } = dados;
  const desconhecidos = Object.keys(contagens).filter((nome) => !dados.registros.some((r) => r.full_name === nome));
  if (desconhecidos.length > 0) {
    throw new Error(`contagens para repositorios fora da selecao: ${desconhecidos.join(", ")}`);
  }
  const avaliados = dados.registros.map((r) =>
    contagens[r.full_name] ? aplicarCriterios(r, contagens[r.full_name], dados.selecao) : r
  );
  const { registros, definida } = definirAmostraFinal(avaliados, dados.selecao.tamanhoAlvoDaAmostra);
  const atualizada = { ...selecaoColetada, criteria_updated_at: agora().toISOString(), final_sample_defined: definida, registros };
  escreverSaidas(dirSaida, atualizada);
  return atualizada;
}
