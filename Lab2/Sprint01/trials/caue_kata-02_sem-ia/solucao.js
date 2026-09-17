export function alocarReservas(reservas) {
  const alocadas = [];
  const recusadas = [];
  const salas = {};

  for (const reserva of reservas) {
    const { sala, inicioMin, fimMin } = reserva;

    if (
      typeof sala !== "string" ||
      sala.length === 0 ||
      !Number.isInteger(inicioMin) ||
      !Number.isInteger(fimMin) ||
      inicioMin < 0 ||
      inicioMin > 1439 ||
      fimMin < 0 ||
      fimMin > 1439 ||
      inicioMin >= fimMin
    ) {
      throw new Error("reserva invalida");
    }

    if (!salas[sala]) {
      salas[sala] = [];
    }

    const conflito = salas[sala].some(r =>
      inicioMin < r.fimMin && fimMin > r.inicioMin
    );

    if (conflito) {
      recusadas.push(reserva);
    } else {
      alocadas.push(reserva);
      salas[sala].push(reserva);
    }
  }

  return { alocadas, recusadas };
}