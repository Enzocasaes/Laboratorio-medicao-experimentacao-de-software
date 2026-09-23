// enzo_kata-06_sem-ia
// Implemente aqui. O enunciado esta' em enunciado.md, nesta pasta.

const DIAS_SEMANA = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

function parseBase(base) {
  const [ano, mes, dia] = base.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function formatar(data) {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function somarDias(data, n) {
  const copia = new Date(data.getTime());
  copia.setUTCDate(copia.getUTCDate() + n);
  return copia;
}

function ehFimDeSemana(data) {
  const dia = data.getUTCDay();
  return dia === 0 || dia === 6;
}

function somarDiasUteis(data, quantidade) {
  const passo = quantidade >= 0 ? 1 : -1;
  let restante = Math.abs(quantidade);
  let atual = data;
  while (restante > 0) {
    atual = somarDias(atual, passo);
    if (!ehFimDeSemana(atual)) restante -= 1;
  }
  return atual;
}

function proximoDiaDaSemana(data, diaAlvo) {
  let atual = somarDias(data, 1);
  while (atual.getUTCDay() !== diaAlvo) {
    atual = somarDias(atual, 1);
  }
  return atual;
}

function ultimoDiaDoMes(data) {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0));
}

export function resolverData(expr, base) {
  const normalizada = expr.trim().toLowerCase();
  const dataBase = parseBase(base);

  let match = normalizada.match(/^([+-])(\d+) dias uteis$/);
  if (match) {
    const sinal = match[1] === "-" ? -1 : 1;
    const n = Number(match[2]) * sinal;
    return formatar(somarDiasUteis(dataBase, n));
  }

  match = normalizada.match(/^([+-])(\d+) dias$/);
  if (match) {
    const sinal = match[1] === "-" ? -1 : 1;
    const n = Number(match[2]) * sinal;
    return formatar(somarDias(dataBase, n));
  }

  match = normalizada.match(/^([+-])(\d+) semanas$/);
  if (match) {
    const sinal = match[1] === "-" ? -1 : 1;
    const n = Number(match[2]) * 7 * sinal;
    return formatar(somarDias(dataBase, n));
  }

  match = normalizada.match(/^proxima ([a-z]+)$/);
  if (match && Object.prototype.hasOwnProperty.call(DIAS_SEMANA, match[1])) {
    return formatar(proximoDiaDaSemana(dataBase, DIAS_SEMANA[match[1]]));
  }

  if (normalizada === "ultimo dia do mes") {
    return formatar(ultimoDiaDoMes(dataBase));
  }

  throw new Error(`expressao de data invalida: "${expr}"`);
}
