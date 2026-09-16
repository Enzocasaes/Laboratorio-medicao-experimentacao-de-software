// Kata 03 - Tarifador de estacionamento por faixas.
// Ver enunciado.md para as regras. Solucao de referencia (autoral).

const FORMATO_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const CAMPOS_TABELA = ["toleranciaMin", "tarifaMinima", "tarifaPorHora", "tetoDiario"];

function validarHorario(rotulo, hhmm) {
  if (!FORMATO_HORARIO.test(hhmm)) {
    throw new Error(`${rotulo} invalido: "${hhmm}" (esperado HH:MM)`);
  }
}

function validarTabela(tabela) {
  for (const campo of CAMPOS_TABELA) {
    if (typeof tabela[campo] !== "number" || tabela[campo] < 0) {
      throw new Error(`tabela invalida: campo "${campo}" ausente ou negativo`);
    }
  }
}

function paraMinutos(hhmm) {
  const [horas, minutos] = hhmm.split(":").map(Number);
  return horas * 60 + minutos;
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

export function calcularTarifa(entrada, saida, tabela) {
  validarHorario("entrada", entrada);
  validarHorario("saida", saida);
  validarTabela(tabela);

  const { toleranciaMin, tarifaMinima, tarifaPorHora, tetoDiario } = tabela;
  const minutos = paraMinutos(saida) - paraMinutos(entrada);

  if (minutos <= 0) {
    throw new Error(`saida (${saida}) deve ser depois da entrada (${entrada})`);
  }
  if (minutos <= toleranciaMin) {
    return 0;
  }

  let valor;
  if (minutos <= 60) {
    valor = tarifaMinima;
  } else {
    const horasExtras = Math.ceil((minutos - 60) / 60);
    valor = tarifaMinima + horasExtras * tarifaPorHora;
  }

  return arredondar(Math.min(valor, tetoDiario));
}
