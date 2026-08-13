/**
 * RQ04 - "Sistemas populares sao atualizados com frequencia?"
 * Metrica: tempo (em dias) desde a ultima atualizacao (updatedAt).
 *
 * Reaproveita as funcoes de data ja validadas em src/tempo-atualizacao.js.
 */
import { calcularMediana } from "../estatisticas.js";
import { converterUpdatedAt, calcularDiasDesdeAtualizacao } from "../tempo-atualizacao.js";

export const RQ04 = {
  chave: "rq04",
  titulo: "RQ04 - dias desde a ultima atualizacao",
  arquivoCSV: "rq04Validation.csv",
  cabecalhoCSV: ["repositorio", "data_ultima_atualizacao", "dias_desde_atualizacao"],

  extrair(repo, { agora }) {
    const dias = calcularDiasDesdeAtualizacao(converterUpdatedAt(repo.updatedAt), agora);
    return { valor: dias, celulas: [repo.updatedAt, dias.toFixed(2)], rotulo: `${dias.toFixed(2)} dias` };
  },

  resumir(valores) {
    console.log(`Dias minimo : ${Math.min(...valores).toFixed(2)}`);
    console.log(`Dias maximo : ${Math.max(...valores).toFixed(2)}`);
    console.log(`Dias mediana: ${calcularMediana(valores).toFixed(2)}`);
  },
};
