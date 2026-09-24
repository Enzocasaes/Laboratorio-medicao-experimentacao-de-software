const HORARIO_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CAMPOS_TABELA = ["toleranciaMin", "tarifaMinima", "tarifaPorHora", "tetoDiario"];

function paraMinutos(horario, nome) {
  if (typeof horario !== "string") {
    throw new Error(`${nome} deve ser uma string HH:MM`);
  }
  const match = HORARIO_REGEX.exec(horario);
  if (!match) {
    throw new Error(`${nome} em formato inválido: "${horario}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function validarTabela(tabela) {
  if (tabela === null || typeof tabela !== "object") {
    throw new Error("tabela deve ser um objeto");
  }
  for (const campo of CAMPOS_TABELA) {
    const valor = tabela[campo];
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      throw new Error(`tabela.${campo} deve ser um número não negativo`);
    }
  }
}

function arredondar2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function calcularTarifa(entrada, saida, tabela) {
  const inicio = paraMinutos(entrada, "entrada");
  const fim = paraMinutos(saida, "saida");

  if (fim <= inicio) {
    throw new Error("saida deve ser estritamente depois de entrada");
  }

  validarTabela(tabela);

  const { toleranciaMin, tarifaMinima, tarifaPorHora, tetoDiario } = tabela;
  const permanencia = fim - inicio;

  if (permanencia <= toleranciaMin) return 0;

  let valor = tarifaMinima;
  if (permanencia > 60) {
    const horasIniciadas = Math.ceil((permanencia - 60) / 60);
    valor += horasIniciadas * tarifaPorHora;
  }

  return arredondar2(Math.min(valor, tetoDiario));
}