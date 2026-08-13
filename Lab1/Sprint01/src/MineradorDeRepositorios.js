/**
 * Orquestrador da mineracao dos repositorios populares do GitHub.
 *
 * Responsabilidade UNICA desta classe: buscar os N repositorios com mais
 * estrelas (paginando a API quando N > 100) e devolver a lista de nos ja
 * validada. Todos os campos de todas as RQs vem nessa mesma busca (ver
 * src/queries/busca-populares.js), entao NAO ha segunda consulta por
 * repositorio - cada RQ apenas le o que precisa do no retornado.
 *
 * O calculo especifico de cada metrica NAO fica aqui: cada RQ e uma definicao
 * declarativa em src/rqs/ (extrair + resumir + colunas do CSV). Assim a
 * orquestracao (busca, paginacao, tratamento de nos vazios) mora num lugar so,
 * e adicionar/alterar uma RQ nao mexe neste arquivo.
 */

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";

/**
 * Quantos repositorios pedir por pagina. A API permite ate 100, mas pedir 100
 * de uma vez COM todos os totalCount (issues, PRs, releases) faz o GitHub
 * estourar o tempo (HTTP 504). Lotes menores sao mais estaveis - mesma
 * abordagem usada na analise por linguagem original.
 */
const TAMANHO_DA_PAGINA = 10;

export class MineradorDeRepositorios {
  /**
   * @param {{ quantidade?: number }} [opcoes] quantidade de repositorios a
   *   coletar (padrao 100). Valores acima de 100 sao paginados automaticamente.
   */
  constructor({ quantidade = 100 } = {}) {
    this.quantidade = quantidade;
    // Carrega o GITHUB_TOKEN para process.env uma unica vez, na construcao.
    carregarEnv();
  }

  /**
   * Busca os repositorios mais populares, seguindo a paginacao (pageInfo.
   * endCursor) ate reunir "this.quantidade" itens ou acabarem as paginas.
   *
   * @returns {Promise<Array<object>>} nos de repositorio validos (com
   *   nameWithOwner), na ordem de estrelas devolvida pela busca.
   */
  async coletarRepositorios() {
    const repositorios = [];
    let cursor = null;

    while (repositorios.length < this.quantidade) {
      const pedir = Math.min(TAMANHO_DA_PAGINA, this.quantidade - repositorios.length);
      const dados = await executarQueryGraphQL(QUERY_BUSCAR_POPULARES, {
        quantidade: pedir,
        cursor,
      });

      const busca = dados.search;
      if (!busca || !Array.isArray(busca.nodes)) {
        throw new Error('A resposta da API nao contem a lista esperada em "search.nodes".');
      }

      for (const no of busca.nodes) {
        // "search" pode devolver null quando um repositorio ficou inacessivel
        // entre a indexacao e a resposta - esses itens sao simplesmente pulados.
        if (no && no.nameWithOwner) repositorios.push(no);
      }

      console.log(`Coletados: ${repositorios.length}/${this.quantidade} repositorios`);

      if (!busca.pageInfo || !busca.pageInfo.hasNextPage) break;
      cursor = busca.pageInfo.endCursor;
    }

    return repositorios;
  }
}
