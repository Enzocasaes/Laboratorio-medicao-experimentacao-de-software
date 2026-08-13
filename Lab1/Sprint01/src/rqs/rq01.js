import { converterCreatedAt, calcularIdade, formatarIdade } from "../index.js";
import { calcularMediana } from "../estatisticas.js";

export const RQ01 = {
  chave: "rq01",
  titulo: "RQ01 - idade do repositorio",
  arquivoCSV: "rq01Validation.csv",
  cabecalhoCSV: ["repositorio", "data_criacao", "idade_anos", "idade_detalhada"],

  extrair(repo, { agora }) {
    const idade = calcularIdade(converterCreatedAt(repo.createdAt), agora);
    return {
      valor: idade.anosDecimais,
      celulas: [repo.createdAt, idade.anosDecimais.toFixed(2), formatarIdade(idade)],
      rotulo: formatarIdade(idade),
    };
  },

  resumir(valores) {
    console.log(`Idade minima  : ${Math.min(...valores).toFixed(2)} anos`);
    console.log(`Idade maxima  : ${Math.max(...valores).toFixed(2)} anos`);
    console.log(`Idade mediana : ${calcularMediana(valores).toFixed(2)} anos`);
  },
};
