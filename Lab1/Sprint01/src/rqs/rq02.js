/**
 * RQ02 - "Sistemas populares recebem muita contribuicao externa?"
 * Metrica: total de Pull Requests aceitas (state = MERGED).
 *
 * O valor vem pronto do no da busca em pullRequests(states: MERGED).totalCount.
 */
import { calcularMediana } from "../estatisticas.js";

export const RQ02 = {
  chave: "rq02",
  titulo: "RQ02 - pull requests aceitas (MERGED)",
  arquivoCSV: "rq02Validation.csv",
  cabecalhoCSV: ["repositorio", "pull_requests_aceitas"],

  extrair(repo) {
    const total = repo.pullRequests?.totalCount;
    if (typeof total !== "number") throw new Error('resposta sem "pullRequests.totalCount"');
    return { valor: total, celulas: [total], rotulo: `${total.toLocaleString("pt-BR")} PRs aceitas` };
  },

  resumir(valores) {
    console.log(`PRs aceitas minima : ${Math.min(...valores).toLocaleString("pt-BR")}`);
    console.log(`PRs aceitas maxima : ${Math.max(...valores).toLocaleString("pt-BR")}`);
    console.log(`PRs aceitas mediana: ${calcularMediana(valores).toLocaleString("pt-BR")}`);
  },
};
