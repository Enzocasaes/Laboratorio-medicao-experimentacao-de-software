import {
  validarCabecalho,
  validarQuantidadeDeLinhas,
  validarSemDuplicados,
  validarSemCamposVazios,
} from "./estrutura.js";

const INDICE_COLUNA_REPOSITORIO = 0;

export const VALIDACAO_RQ02 = {
  chave: "rq02",
  titulo: "Validacao RQ02 - pull requests aceitas",
  arquivoCSV: "rq02Validation.csv",
  cabecalhoEsperado: ["repositorio", "pull_requests_aceitas"],
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
    ];
  },
};
