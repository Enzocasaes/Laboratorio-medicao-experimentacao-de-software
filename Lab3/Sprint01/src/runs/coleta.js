// Coleta dos workflow runs de um repositorio
// (GET /repos/{owner}/{repo}/actions/runs?branch=&event=push&created=).
//
// POR QUE FATIAR A JANELA EM MESES: com filtros, esse endpoint devolve no
// maximo 1.000 resultados por consulta (secao 4 do enunciado). Um repositorio
// ativo passa de 1.000 runs em 12 meses com folga, e a API nao avisa que
// cortou - ela simplesmente para de paginar. Pedindo um mes de cada vez, o
// teto quase nunca e' alcancado; e quando e', da' para saber, porque
// `total_count` vem com o numero real de runs daquele mes. Cada fatia que
// passa de 1.000 e' marcada como `truncada` e registrada no JSON de auditoria,
// em vez de virar um numero menor sem explicacao.
//
// Cada fatia e' uma requisicao propria, com URL propria: o cache em disco
// (src/github/cache.js) guarda mes a mes, entao uma execucao interrompida no
// meio do ano retoma sem refazer os meses ja baixados.
//
// Respostas 4xx viram `erro` (texto registravel), nunca excecao - o mesmo
// padrao de src/releases/coleta.js.

import { caminhoDoRepositorio } from "../github/caminhos.js";
import { DIA_MS } from "../janela.js";
import { logSilencioso } from "../log.js";
import { criarRun, ehItemDeRunValido } from "./modelo.js";

export const RUNS_POR_PAGINA = 100; // maximo aceito pela API
export const MAX_PAGINAS_POR_FATIA = 10; // 10 x 100 = 1.000, o teto da API por consulta
export const TETO_DA_CONSULTA = 1000; // limite de resultados que a API entrega com filtro

function dataISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Divide a janela em fatias mensais, no formato aceito pelo filtro
// `created=AAAA-MM-DD..AAAA-MM-DD` (inclusivo nas duas pontas). A primeira e a
// ultima fatia sao recortadas pelas datas da janela, para nao coletar nada
// fora dela: uma janela de 22/10 a 22/10 do ano seguinte comeca em
// "2025-10-22..2025-10-31" e termina em "2026-10-01..2026-10-22".
export function fatiasMensais(janela) {
  const fatias = [];
  let inicioMs = janela.inicioMs;

  while (inicioMs < janela.fimExclusivoMs) {
    const inicio = new Date(inicioMs);
    const proximoMesMs = Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1);
    const fimExclusivoMs = Math.min(proximoMesMs, janela.fimExclusivoMs);
    fatias.push({ inicio: dataISO(inicioMs), fim: dataISO(fimExclusivoMs - DIA_MS) });
    inicioMs = fimExclusivoMs;
  }

  return fatias;
}

async function coletarFatia(cliente, fullName, fatia, { branch, porPagina, maxPaginas, log }) {
  const parametros = {
    branch,
    event: "push",
    created: `${fatia.inicio}..${fatia.fim}`,
    per_page: porPagina,
  };

  const itens = [];
  let paginas = 0;
  let totalInformado = null;

  let resposta = await cliente.get(`${caminhoDoRepositorio(fullName)}/actions/runs`, parametros);
  for (;;) {
    if (resposta.status !== 200) {
      return { itens, paginas, totalInformado, truncada: false, erro: `runs_http_${resposta.status}` };
    }
    const corpo = resposta.corpo;
    if (!corpo || !Array.isArray(corpo.workflow_runs)) {
      return { itens, paginas, totalInformado, truncada: false, erro: "runs_unexpected_response" };
    }

    paginas += 1;
    if (totalInformado === null && Number.isInteger(corpo.total_count)) totalInformado = corpo.total_count;
    itens.push(...corpo.workflow_runs);

    if (!resposta.links.next) break;
    if (paginas >= maxPaginas) {
      log.aviso(
        `${fullName}: ${fatia.inicio}..${fatia.fim} atingiu ${maxPaginas} paginas (${itens.length} runs) sem acabar; fatia truncada`
      );
      return { itens, paginas, totalInformado, truncada: true, erro: null };
    }
    resposta = await cliente.get(resposta.links.next);
  }

  // A API nao avisa quando corta em 1.000; `total_count` e' que denuncia.
  const truncada = totalInformado !== null && totalInformado > TETO_DA_CONSULTA;
  if (truncada) {
    log.aviso(
      `${fullName}: ${fatia.inicio}..${fatia.fim} tem ${totalInformado} runs, acima do teto de ${TETO_DA_CONSULTA} por consulta; ` +
        `${itens.length} coletados (fatia truncada)`
    );
  }
  return { itens, paginas, totalInformado, truncada, erro: null };
}

// Coleta os runs do default branch disparados por push, mes a mes.
// Devolve os runs normalizados (sem duplicatas) e o relato por fatia.
export async function coletarWorkflowRuns(
  cliente,
  fullName,
  janela,
  { branch = "main", porPagina = RUNS_POR_PAGINA, maxPaginas = MAX_PAGINAS_POR_FATIA, log = logSilencioso } = {}
) {
  const fatias = [];
  const runs = [];
  const vistos = new Set();
  let itensInvalidos = 0;
  let paginas = 0;
  let truncada = false;

  for (const fatia of fatiasMensais(janela)) {
    const resultado = await coletarFatia(cliente, fullName, fatia, { branch, porPagina, maxPaginas, log });
    paginas += resultado.paginas;

    if (resultado.erro !== null) {
      // Uma fatia sem resposta tornaria a contagem do repositorio menor do que
      // a real, e o criterio minimo excluiria por um erro de coleta. Entao a
      // coleta inteira e' dada como falha, e o repositorio segue pendente.
      fatias.push({ ...fatia, runs: 0, total_count: null, pages: resultado.paginas, truncated: false, error: resultado.erro });
      return { runs, fatias, paginas, itensInvalidos, truncada, erro: resultado.erro };
    }

    let novos = 0;
    for (const item of resultado.itens) {
      if (!ehItemDeRunValido(item)) {
        itensInvalidos += 1;
        log.aviso(`${fullName}: item de workflow run sem id ignorado`);
        continue;
      }
      if (vistos.has(item.id)) continue; // mesmo run em duas fatias (fronteira de mes)
      vistos.add(item.id);
      runs.push(criarRun(item, janela));
      novos += 1;
    }

    truncada = truncada || resultado.truncada;
    fatias.push({
      ...fatia,
      runs: novos,
      total_count: resultado.totalInformado,
      pages: resultado.paginas,
      truncated: resultado.truncada,
      error: null,
    });
    log.debug(`${fullName}: ${fatia.inicio}..${fatia.fim} -> ${novos} runs`);
  }

  return { runs, fatias, paginas, itensInvalidos, truncada, erro: null };
}
