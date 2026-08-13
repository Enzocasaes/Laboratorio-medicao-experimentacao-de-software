import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";

const TAMANHO_DA_PAGINA = 10;

export class MineradorDeRepositorios {
  constructor({ quantidade = 100 } = {}) {
    this.quantidade = quantidade;
    carregarEnv();
  }

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
        if (no && no.nameWithOwner) repositorios.push(no);
      }

      console.log(`Coletados: ${repositorios.length}/${this.quantidade} repositorios`);

      if (!busca.pageInfo || !busca.pageInfo.hasNextPage) break;
      cursor = busca.pageInfo.endCursor;
    }

    return repositorios;
  }
}
