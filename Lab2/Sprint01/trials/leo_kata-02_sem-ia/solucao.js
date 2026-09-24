export function alocarReservas(reservas) {
  const alocadas = [];
  const recusadas = [];
  const ocupadasPorSala = {};

  for (const reserva of reservas) {
    const { sala, inicioMin, fimMin } = reserva;

    if (typeof sala !== 'string' || sala.length === 0) {
      throw new Error('sala invalida');
    }
    if (
      !Number.isInteger(inicioMin) ||
      !Number.isInteger(fimMin) ||
      inicioMin < 0 || inicioMin > 1439 ||
      fimMin < 0 || fimMin > 1439
    ) {
      throw new Error('inicioMin/fimMin fora de [0, 1439]');
    }
    if (inicioMin >= fimMin) {
      throw new Error('inicioMin deve ser menor que fimMin');
    }

    if (!ocupadasPorSala[sala]) {
      ocupadasPorSala[sala] = [];
    }

    const conflita = ocupadasPorSala[sala].some(
      (r) => inicioMin < r.fimMin && r.inicioMin < fimMin
    );

    if (conflita) {
      recusadas.push(reserva);
    } else {
      ocupadasPorSala[sala].push(reserva);
      alocadas.push(reserva);
    }
  }

  return { alocadas, recusadas };
}