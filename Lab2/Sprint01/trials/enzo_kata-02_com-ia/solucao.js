// enzo_kata-02_com-ia
// Implemente aqui. O enunciado esta' em enunciado.md, nesta pasta.

function validar({ sala, inicioMin, fimMin }) {
  if (typeof sala !== "string" || sala.length === 0) {
    throw new Error("sala invalida");
  }
  if (!Number.isInteger(inicioMin) || inicioMin < 0 || inicioMin > 1439) {
    throw new Error("inicioMin invalido");
  }
  if (!Number.isInteger(fimMin) || fimMin < 0 || fimMin > 1439) {
    throw new Error("fimMin invalido");
  }
  if (inicioMin >= fimMin) {
    throw new Error("inicioMin deve ser menor que fimMin");
  }
}

function conflita(a, b) {
  return a.inicioMin < b.fimMin && b.inicioMin < a.fimMin;
}

export function alocarReservas(reservas) {
  reservas.forEach(validar);

  const alocadasPorSala = new Map();
  const alocadas = [];
  const recusadas = [];

  for (const pedido of reservas) {
    const jaAceitas = alocadasPorSala.get(pedido.sala) ?? [];
    const temConflito = jaAceitas.some((aceita) => conflita(aceita, pedido));

    if (temConflito) {
      recusadas.push(pedido);
    } else {
      alocadas.push(pedido);
      alocadasPorSala.set(pedido.sala, [...jaAceitas, pedido]);
    }
  }

  return { alocadas, recusadas };
}
