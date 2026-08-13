/**
 * RQ06 - "Sistemas populares possuem um alto percentual de issues fechadas?"
 * Metrica: razao entre issues fechadas e total de issues.
 *
 * Os dois totais vem do no da busca via alias (issuesTotal / issuesFechadas,
 * ver src/queries/busca-populares.js). Repositorios sem issues (total = 0)
 * recebem razao 0, evitando divisao por zero.
 */
import { calcularMediana } from "../estatisticas.js";

export const RQ06 = {
  chave: "rq06",
  titulo: "RQ06 - razao de issues fechadas",
  arquivoCSV: "rq06Validation.csv",
  cabecalhoCSV: ["repositorio", "issues_fechadas", "issues_total", "razao_fechadas"],

  extrair(repo) {
    const total = repo.issuesTotal?.totalCount;
    const fechadas = repo.issuesFechadas?.totalCount;
    if (typeof total !== "number" || typeof fechadas !== "number") {
      throw new Error("resposta sem as contagens de issues");
    }
    const razao = total === 0 ? 0 : fechadas / total;
    return {
      valor: razao,
      celulas: [fechadas, total, razao.toFixed(4)],
      rotulo: `${fechadas.toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")} (${(razao * 100).toFixed(1)}%)`,
    };
  },

  resumir(valores) {
    console.log(`Razao minima : ${(Math.min(...valores) * 100).toFixed(1)}%`);
    console.log(`Razao maxima : ${(Math.max(...valores) * 100).toFixed(1)}%`);
    console.log(`Razao mediana: ${(calcularMediana(valores) * 100).toFixed(1)}%`);
  },
};
