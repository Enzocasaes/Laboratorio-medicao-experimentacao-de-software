import {
  validarCabecalho,
  validarQuantidadeDeLinhas,
  validarSemDuplicados,
  validarSemCamposVazios,
  validarValoresNumericos,
} from "./estrutura.js";
import { correlacaoPearson } from "../estatisticas.js";

const INDICE_COLUNA_REPOSITORIO = 0;
const INDICE_COLUNA_ESTRELAS = 1;
const INDICE_COLUNA_PRS = 2;
const INDICE_COLUNA_RELEASES = 3;
const INDICE_COLUNA_DIAS = 4;

export const VALIDACAO_RQ08 = {
  chave: "rq08",
  titulo: "Validacao RQ08 (inovacao) - correlacao entre estrelas e as demais metricas",
  arquivoCSV: "rq08Correlacao.csv",
  cabecalhoEsperado: ["repositorio", "estrelas", "pull_requests_aceitas", "total_releases", "dias_desde_atualizacao"],
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
          '"estrelas" deve ser inteiro >= 2 (a busca so traz stars:>1); "pull_requests_aceitas" e "total_releases" >= 0 inteiros; "dias_desde_atualizacao" >= 0',
        erros: [
          ...validarValoresNumericos(linhas, INDICE_COLUNA_ESTRELAS, { minimo: 2, inteiro: true }),
          ...validarValoresNumericos(linhas, INDICE_COLUNA_PRS, { minimo: 0, inteiro: true }),
          ...validarValoresNumericos(linhas, INDICE_COLUNA_RELEASES, { minimo: 0, inteiro: true }),
          ...validarValoresNumericos(linhas, INDICE_COLUNA_DIAS, { minimo: 0 }),
        ],
      },
    ];
  },

  // Nao ha distribuicao/outlier de uma unica coluna aqui - o interessante da
  // RQ08 e a correlacao entre estrelas e cada uma das outras 3 colunas.
  relatorio(linhas) {
    const estrelas = linhas.map((l) => Number(l[INDICE_COLUNA_ESTRELAS]));
    const prs = linhas.map((l) => Number(l[INDICE_COLUNA_PRS]));
    const releases = linhas.map((l) => Number(l[INDICE_COLUNA_RELEASES]));
    const dias = linhas.map((l) => Number(l[INDICE_COLUNA_DIAS]));

    console.log("\nCorrelacao de Pearson (estrelas x metrica), recalculada a partir do CSV:");
    console.log(`  estrelas x pull_requests_aceitas : r = ${correlacaoPearson(estrelas, prs).toFixed(3)}`);
    console.log(`  estrelas x total_releases         : r = ${correlacaoPearson(estrelas, releases).toFixed(3)}`);
    console.log(`  estrelas x dias_desde_atualizacao  : r = ${correlacaoPearson(estrelas, dias).toFixed(3)}`);
  },
};
