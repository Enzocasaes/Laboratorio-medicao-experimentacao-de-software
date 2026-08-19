import {
  validarCabecalho,
  validarQuantidadeDeLinhas,
  validarSemDuplicados,
  validarSemCamposVazios,
  validarValoresNumericos,
} from "./estrutura.js";
import { calcularMediana, detectarOutliers } from "../estatisticas.js";

const INDICE_COLUNA_REPOSITORIO = 0;
const INDICE_COLUNA_DIAS_DESDE_ATUALIZACAO = 2;

export const VALIDACAO_RQ04 = {
  chave: "rq04",
  titulo: "Validacao RQ04 - dias desde a ultima atualizacao",
  arquivoCSV: "rq04Validation.csv",
  cabecalhoEsperado: ["repositorio", "data_ultima_atualizacao", "dias_desde_atualizacao"],
  quantidadeEsperada: 1000,

  validar(cabecalho, linhas) {
    return [
      {
        checagem: "Cabecalho",
        descricao: `as colunas do CSV devem ser, nesta ordem: ${this.cabecalhoEsperado.join(", ")}`,
        erros: validarCabecalho(cabecalho, this.cabecalhoEsperado),
      },
      {
        checagem: "Quantidade de linhas",
        descricao: `o CSV deve ter exatamente ${this.quantidadeEsperada} repositorios (1 por linha, sem contar o cabecalho)`,
        erros: validarQuantidadeDeLinhas(linhas, this.quantidadeEsperada),
      },
      {
        checagem: "Repositorios duplicados",
        descricao: 'nenhum valor da coluna "repositorio" pode aparecer em mais de uma linha',
        erros: validarSemDuplicados(linhas, INDICE_COLUNA_REPOSITORIO),
      },
      {
        checagem: "Campos vazios",
        descricao: "nenhuma celula, em nenhuma coluna, pode estar vazia ou ausente",
        erros: validarSemCamposVazios(cabecalho, linhas),
      },
      {
        checagem: "Valores numericos",
        descricao:
          '"dias_desde_atualizacao" deve ser um numero >= 0 (um valor negativo indicaria "updatedAt" no futuro, ou seja, bug na coleta)',
        erros: validarValoresNumericos(linhas, INDICE_COLUNA_DIAS_DESDE_ATUALIZACAO, { minimo: 0 }),
      },
    ];
  },

  // Consistencia dos dados (distribuicao e outliers). Repositorios muito
  // ativos ou ha muito tempo sem commits sao esperados nessa metrica, entao
  // outliers sao reportados como informacao, nao como falha de validacao.
  relatorio(linhas) {
    const valores = linhas.map((linha) => Number(linha[INDICE_COLUNA_DIAS_DESDE_ATUALIZACAO]));
    const { q1, q3, iqr, limiteInferior, limiteSuperior, indices } = detectarOutliers(valores);
    const atualizadosUltimaSemana = valores.filter((valor) => valor <= 7).length;
    const semAtualizacaoUmAno = valores.filter((valor) => valor > 365).length;

    console.log("\nDistribuicao (dias_desde_atualizacao):");
    console.log(`  minimo  : ${Math.min(...valores).toFixed(2)}`);
    console.log(`  Q1      : ${q1.toFixed(2)}`);
    console.log(`  mediana : ${calcularMediana(valores).toFixed(2)}`);
    console.log(`  Q3      : ${q3.toFixed(2)}`);
    console.log(`  maximo  : ${Math.max(...valores).toFixed(2)}`);
    console.log(`  IQR     : ${iqr.toFixed(2)} (faixa nao-outlier: ${limiteInferior.toFixed(2)} a ${limiteSuperior.toFixed(2)})`);
    console.log(
      `  atualizados na ultima semana: ${atualizadosUltimaSemana}/${valores.length} (${((atualizadosUltimaSemana / valores.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  sem atualizacao ha mais de 1 ano: ${semAtualizacaoUmAno}/${valores.length} (${((semAtualizacaoUmAno / valores.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  outliers (fora do IQR): ${indices.length}/${valores.length} (${((indices.length / valores.length) * 100).toFixed(1)}%)`
    );
    if (indices.length > 0) {
      const exemplos = indices
        .slice(0, 5)
        .map((indice) => `${linhas[indice][INDICE_COLUNA_REPOSITORIO]} (${valores[indice].toFixed(0)}d)`)
        .join(", ");
      console.log(`  exemplos: ${exemplos}${indices.length > 5 ? ", ..." : ""}`);
    }
  },
};
