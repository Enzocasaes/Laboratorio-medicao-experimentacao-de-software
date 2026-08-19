import {
  validarCabecalho,
  validarQuantidadeDeLinhas,
  validarSemDuplicados,
  validarSemCamposVazios,
  validarValoresNumericos,
} from "./estrutura.js";
import { calcularMediana, detectarOutliers } from "../estatisticas.js";

const INDICE_COLUNA_REPOSITORIO = 0;
const INDICE_COLUNA_TOTAL_RELEASES = 1;

export const VALIDACAO_RQ03 = {
  chave: "rq03",
  titulo: "Validacao RQ03 - total de releases",
  arquivoCSV: "rq03Validation.csv",
  cabecalhoEsperado: ["repositorio", "total_releases"],
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
        descricao: '"total_releases" deve ser um numero inteiro maior ou igual a 0 (nao existe release negativa)',
        erros: validarValoresNumericos(linhas, INDICE_COLUNA_TOTAL_RELEASES, { minimo: 0, inteiro: true }),
      },
    ];
  },

  // Consistencia dos dados (distribuicao e outliers), alem das checagens
  // estruturais acima. Nao conta como falha: releases variam muito entre
  // repositorios populares (ex.: bibliotecas vs. listas "awesome-*"), entao
  // um outlier aqui e um dado real, nao um erro de coleta.
  relatorio(linhas) {
    const valores = linhas.map((linha) => Number(linha[INDICE_COLUNA_TOTAL_RELEASES]));
    const { q1, q3, iqr, limiteInferior, limiteSuperior, indices } = detectarOutliers(valores);
    const semReleases = valores.filter((valor) => valor === 0).length;

    console.log("\nDistribuicao (total_releases):");
    console.log(`  minimo  : ${Math.min(...valores)}`);
    console.log(`  Q1      : ${q1.toFixed(2)}`);
    console.log(`  mediana : ${calcularMediana(valores).toFixed(2)}`);
    console.log(`  Q3      : ${q3.toFixed(2)}`);
    console.log(`  maximo  : ${Math.max(...valores)}`);
    console.log(`  IQR     : ${iqr.toFixed(2)} (faixa nao-outlier: ${limiteInferior.toFixed(2)} a ${limiteSuperior.toFixed(2)})`);
    console.log(
      `  sem nenhuma release: ${semReleases}/${valores.length} (${((semReleases / valores.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  outliers (fora do IQR): ${indices.length}/${valores.length} (${((indices.length / valores.length) * 100).toFixed(1)}%)`
    );
    if (indices.length > 0) {
      const exemplos = indices
        .slice(0, 5)
        .map((indice) => `${linhas[indice][INDICE_COLUNA_REPOSITORIO]} (${valores[indice]})`)
        .join(", ");
      console.log(`  exemplos: ${exemplos}${indices.length > 5 ? ", ..." : ""}`);
    }
  },
};
