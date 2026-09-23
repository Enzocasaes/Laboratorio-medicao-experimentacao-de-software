// enzo_kata-03_com-ia
// Implemente aqui. O enunciado esta' em enunciado.md, nesta pasta.

function parseHoraMin(valor) {
  const match = /^([0-9]{2}):([0-9]{2})$/.exec(valor);
  if (!match) throw new Error(`horario invalido: ${valor}`);
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas > 23 || minutos > 59) throw new Error(`horario invalido: ${valor}`);
  return horas * 60 + minutos;
}

function validarTabela(tabela) {
  for (const campo of ["toleranciaMin", "tarifaMinima", "tarifaPorHora", "tetoDiario"]) {
    const valor = tabela[campo];
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      throw new Error(`campo invalido na tabela: ${campo}`);
    }
  }
}

export function calcularTarifa(entrada, saida, tabela) {
  validarTabela(tabela);

  const minEntrada = parseHoraMin(entrada);
  const minSaida = parseHoraMin(saida);
  if (minSaida <= minEntrada) {
    throw new Error("saida deve ser estritamente depois da entrada");
  }

  const duracaoMin = minSaida - minEntrada;

  if (duracaoMin <= tabela.toleranciaMin) return 0;

  let valor;
  if (duracaoMin <= 60) {
    valor = tabela.tarifaMinima;
  } else {
    const horasExtras = Math.ceil((duracaoMin - 60) / 60);
    valor = tabela.tarifaMinima + horasExtras * tabela.tarifaPorHora;
  }

  valor = Math.min(valor, tabela.tetoDiario);
  return Math.round(valor * 100) / 100;
}
