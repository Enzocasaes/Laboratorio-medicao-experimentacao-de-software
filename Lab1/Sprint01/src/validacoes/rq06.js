import {
  validarCabecalho,
  validarQuantidadeDeLinhas,
  validarSemDuplicados,
  validarSemCamposVazios,
} from "./estrutura.js";

const INDICE_COLUNA_REPOSITORIO = 0;
const INDICE_COLUNA_FECHADAS = 1;
const INDICE_COLUNA_TOTAL = 2;
const INDICE_COLUNA_RAZAO = 3;

const TOLERANCIA = 0.0001;

function ehInteiroNaoNegativo(texto) {
  return /^\d+$/.test(String(texto).trim());
}

function validarContagensDeIssues(linhas) {
  const erros = [];
  linhas.forEach((linha, indiceDaLinha) => {
    const repositorio = linha[INDICE_COLUNA_REPOSITORIO] || "?";
    const fechadas = linha[INDICE_COLUNA_FECHADAS];
    const total = linha[INDICE_COLUNA_TOTAL];

    if (!ehInteiroNaoNegativo(fechadas) || !ehInteiroNaoNegativo(total)) {
      erros.push(
        `Linha ${indiceDaLinha + 2}: contagens de issues devem ser inteiros nao negativos ` +
          `(recebido fechadas="${fechadas}", total="${total}", repositorio: ${repositorio}).`
      );
      return;
    }

    if (Number(fechadas) > Number(total)) {
      erros.push(
        `Linha ${indiceDaLinha + 2}: issues fechadas (${fechadas}) maior que o total (${total}) ` +
          `(repositorio: ${repositorio}).`
      );
    }
  });
  return erros;
}

function validarRazaoDeIssuesFechadas(linhas) {
  const erros = [];
  linhas.forEach((linha, indiceDaLinha) => {
    const repositorio = linha[INDICE_COLUNA_REPOSITORIO] || "?";
    const fechadas = Number(linha[INDICE_COLUNA_FECHADAS]);
    const total = Number(linha[INDICE_COLUNA_TOTAL]);
    const razao = Number(linha[INDICE_COLUNA_RAZAO]);

    if (!Number.isFinite(razao)) {
      erros.push(
        `Linha ${indiceDaLinha + 2}: razao "${linha[INDICE_COLUNA_RAZAO]}" nao e um numero ` +
          `(repositorio: ${repositorio}).`
      );
      return;
    }

    if (razao < 0 || razao > 1) {
      erros.push(
        `Linha ${indiceDaLinha + 2}: razao ${razao} fora do intervalo de 0 a 1 ` +
          `(repositorio: ${repositorio}).`
      );
      return;
    }

    if (!Number.isFinite(fechadas) || !Number.isFinite(total)) return;

    const esperada = total === 0 ? 0 : fechadas / total;
    if (Math.abs(razao - esperada) > TOLERANCIA) {
      erros.push(
        `Linha ${indiceDaLinha + 2}: razao ${razao} nao confere com ${fechadas}/${total} = ` +
          `${esperada.toFixed(4)} (repositorio: ${repositorio}).`
      );
    }
  });
  return erros;
}

export const VALIDACAO_RQ06 = {
  chave: "rq06",
  titulo: "Validacao RQ06 - razao de issues fechadas",
  arquivoCSV: "rq06Validation.csv",
  cabecalhoEsperado: ["repositorio", "issues_fechadas", "issues_total", "razao_fechadas"],
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
        checagem: "Contagens de issues",
        descricao: "fechadas e total devem ser inteiros nao negativos, com fechadas menor ou igual ao total",
        erros: validarContagensDeIssues(linhas),
      },
      {
        checagem: "Razao de issues fechadas",
        descricao: "a razao deve ficar entre 0 e 1 e bater com fechadas dividido por total (0 quando o total e 0)",
        erros: validarRazaoDeIssuesFechadas(linhas),
      },
    ];
  },
};
