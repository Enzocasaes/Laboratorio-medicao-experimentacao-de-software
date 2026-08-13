/**
 * RQ03 - "Sistemas populares lancam releases com frequencia?"
 * Metrica: total de releases.
 *
 * O valor vem pronto do no da busca em releases.totalCount.
 */
import { calcularMediana } from "../estatisticas.js";

export const RQ03 = {
  chave: "rq03",
  titulo: "RQ03 - total de releases",
  arquivoCSV: "rq03Validation.csv",
  cabecalhoCSV: ["repositorio", "total_releases"],

  extrair(repo) {
    const total = repo.releases?.totalCount;
    if (typeof total !== "number") throw new Error('resposta sem "releases.totalCount"');
    return { valor: total, celulas: [total], rotulo: `${total.toLocaleString("pt-BR")} releases` };
  },

  resumir(valores) {
    console.log(`Releases minima : ${Math.min(...valores).toLocaleString("pt-BR")}`);
    console.log(`Releases maxima : ${Math.max(...valores).toLocaleString("pt-BR")}`);
    console.log(`Releases mediana: ${calcularMediana(valores).toLocaleString("pt-BR")}`);
  },
};
