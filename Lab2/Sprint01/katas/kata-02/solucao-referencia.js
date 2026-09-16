// Kata 02 - Agendador de salas sem conflito.
// Ver enunciado.md para as regras. Solucao de referencia (autoral).

function validarMinuto(rotulo, sala, minuto) {
  if (!Number.isInteger(minuto) || minuto < 0 || minuto > 1439) {
    throw new Error(`pedido invalido para a sala "${sala}": ${rotulo} (${minuto}) fora de [0,1439]`);
  }
}

function validarPedido(pedido) {
  const { sala, inicioMin, fimMin } = pedido;
  if (typeof sala !== "string" || sala.trim().length === 0) {
    throw new Error('pedido invalido: "sala" deve ser uma string nao vazia');
  }
  validarMinuto("inicioMin", sala, inicioMin);
  validarMinuto("fimMin", sala, fimMin);
  if (inicioMin >= fimMin) {
    throw new Error(`intervalo invalido para a sala "${sala}": inicio (${inicioMin}) >= fim (${fimMin})`);
  }
}

function seSobrepoe(a, b) {
  return a.inicioMin < b.fimMin && b.inicioMin < a.fimMin;
}

function conflitaComAlguma(pedido, aceitasNaSala) {
  return aceitasNaSala.some((aceita) => seSobrepoe(aceita, pedido));
}

function validarLista(reservas) {
  if (!Array.isArray(reservas)) {
    throw new Error('"reservas" deve ser uma lista de pedidos');
  }
}

export function alocarReservas(reservas) {
  validarLista(reservas);
  const aceitasPorSala = new Map();
  const alocadas = [];
  const recusadas = [];

  for (const pedido of reservas) {
    validarPedido(pedido);

    const aceitasNaSala = aceitasPorSala.get(pedido.sala) ?? [];

    if (conflitaComAlguma(pedido, aceitasNaSala)) {
      recusadas.push(pedido);
      continue;
    }

    aceitasNaSala.push(pedido);
    aceitasPorSala.set(pedido.sala, aceitasNaSala);
    alocadas.push(pedido);
  }

  return { alocadas, recusadas };
}
