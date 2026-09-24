const DIAS_SEMANA = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3,
  quinta: 4, sexta: 5, sabado: 6,
};

export function resolverData(expr, base) {
  const texto = String(expr).trim().toLowerCase();
  const [ano, mes, dia] = base.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  const formatar = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  const invalida = () => {
    throw new Error(`expressao de data invalida: "${expr}"`);
  };

  if (texto === "ultimo dia do mes") {
    return formatar(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0)));
  }

  const proxima = texto.match(/^proxima\s+([a-z]+)$/);
  if (proxima) {
    const alvo = DIAS_SEMANA[proxima[1]];
    if (alvo === undefined) invalida();
    const resultado = new Date(data);
    do {
      resultado.setUTCDate(resultado.getUTCDate() + 1);
    } while (resultado.getUTCDay() !== alvo);
    return formatar(resultado);
  }

  const deslocamento = texto.match(/^([+-])(\d+)\s+(dias\s+uteis|dias|semanas)$/);
  if (!deslocamento) invalida();

  const sinal = deslocamento[1] === "-" ? -1 : 1;
  const quantidade = Number(deslocamento[2]);
  const unidade = deslocamento[3].replace(/\s+/g, " ");
  const resultado = new Date(data);

  if (unidade === "dias") {
    resultado.setUTCDate(resultado.getUTCDate() + sinal * quantidade);
  } else if (unidade === "semanas") {
    resultado.setUTCDate(resultado.getUTCDate() + sinal * quantidade * 7);
  } else {
    let restantes = quantidade;
    while (restantes > 0) {
      resultado.setUTCDate(resultado.getUTCDate() + sinal);
      const diaSemana = resultado.getUTCDay();
      if (diaSemana !== 0 && diaSemana !== 6) restantes -= 1;
    }
  }

  return formatar(resultado);
}
