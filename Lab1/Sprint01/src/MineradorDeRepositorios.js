import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { construirQueryDetalhesDosRepositorios } from "./queries/detalhes-repositorio.js";

const TAMANHO_DA_PAGINA = 100;
const TAMANHO_DO_LOTE_DE_DETALHES = 15;
const PAUSA_ENTRE_REQUISICOES_MS = 500;

function esperar(milissegundos) {
  return new Promise((resolver) => setTimeout(resolver, milissegundos));
}

export class MineradorDeRepositorios {
  constructor({ quantidade = 100 } = {}) {
    this.quantidade = quantidade;
    carregarEnv();
  }

  async coletarRepositorios() {
    const repositorios = await this.buscarRepositoriosLeves();
    await this.enriquecerComDetalhes(repositorios);
    return repositorios;
  }

  async buscarRepositoriosLeves() {
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

      console.log(`Buscados: ${repositorios.length}/${this.quantidade} repositorios`);

      if (!busca.pageInfo || !busca.pageInfo.hasNextPage) break;
      cursor = busca.pageInfo.endCursor;
      await esperar(PAUSA_ENTRE_REQUISICOES_MS);
    }

    return repositorios;
  }

  async enriquecerComDetalhes(repositorios) {
    for (let inicio = 0; inicio < repositorios.length; inicio += TAMANHO_DO_LOTE_DE_DETALHES) {
      const lote = repositorios.slice(inicio, inicio + TAMANHO_DO_LOTE_DE_DETALHES);

      const query = construirQueryDetalhesDosRepositorios(lote.length);
      const variaveis = {};
      lote.forEach((repo, indice) => {
        variaveis[`owner${indice}`] = repo.nameWithOwner.split("/")[0];
        variaveis[`name${indice}`] = repo.name;
      });

      const dados = await executarQueryGraphQL(query, variaveis);

      lote.forEach((repo, indice) => {
        const detalhes = dados[`r${indice}`];
        if (!detalhes) {
          throw new Error(`A resposta da API nao contem detalhes para "${repo.nameWithOwner}".`);
        }
        repo.releases = detalhes.releases;
        repo.pullRequests = detalhes.pullRequests;
        repo.issuesTotal = detalhes.issuesTotal;
        repo.issuesFechadas = detalhes.issuesFechadas;
      });

      const totalObtido = Math.min(inicio + TAMANHO_DO_LOTE_DE_DETALHES, repositorios.length);
      console.log(`Detalhes obtidos: ${totalObtido}/${repositorios.length} repositorios`);

      if (totalObtido < repositorios.length) {
        await esperar(PAUSA_ENTRE_REQUISICOES_MS);
      }
    }
  }
}
