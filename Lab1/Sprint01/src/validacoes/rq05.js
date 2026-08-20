import {
  validarCabecalho,
  validarQuantidadeDeLinhas,
  validarSemDuplicados,
  validarSemCamposVazios,
} from "./estrutura.js";

const INDICE_COLUNA_REPOSITORIO = 0;
const INDICE_COLUNA_LINGUAGEM = 1;

const SEM_LINGUAGEM = "Sem linguagem";
const VALORES_INVALIDOS = ["null", "undefined", "nan", "n/a", "-"];

function validarLinguagemPrimaria(linhas) {
  const erros = [];
  linhas.forEach((linha, indiceDaLinha) => {
    const repositorio = linha[INDICE_COLUNA_REPOSITORIO] || "?";
    const linguagem = linha[INDICE_COLUNA_LINGUAGEM] ?? "";

    if (VALORES_INVALIDOS.includes(linguagem.trim().toLowerCase())) {
      erros.push(
        `Linha ${indiceDaLinha + 2}: linguagem "${linguagem}" invalida (repositorio: ${repositorio}). ` +
          `Repositorio sem linguagem deve ser gravado como "${SEM_LINGUAGEM}".`
      );
    }
  });
  return erros;
}

export const VALIDACAO_RQ05 = {
  chave: "rq05",
  titulo: "Validacao RQ05 - linguagem primaria",
  arquivoCSV: "rq05Validation.csv",
  cabecalhoEsperado: ["repositorio", "linguagem_primaria"],
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
        checagem: "Linguagem primaria",
        descricao: `a linguagem deve ser um nome valido; repositorio sem linguagem usa "${SEM_LINGUAGEM}"`,
        erros: validarLinguagemPrimaria(linhas),
      },
    ];
  },
};
