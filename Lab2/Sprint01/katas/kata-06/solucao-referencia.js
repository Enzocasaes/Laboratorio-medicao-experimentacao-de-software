// Kata 06 - Interpretador de datas relativas.
// Ver enunciado.md para as regras. Solucao de referencia (autoral).

const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

function paraData(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function paraISO(data) {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function somarDias(data, quantidade) {
  const copia = new Date(data.getTime());
  copia.setUTCDate(copia.getUTCDate() + quantidade);
  return copia;
}

function somarDiasUteis(data, quantidade) {
  const passo = quantidade >= 0 ? 1 : -1;
  let restantes = Math.abs(quantidade);
  let atual = data;
  while (restantes > 0) {
    atual = somarDias(atual, passo);
    const diaSemana = atual.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes -= 1;
  }
  return atual;
}

function proximoDiaSemana(data, alvo) {
  let atual = somarDias(data, 1);
  while (atual.getUTCDay() !== alvo) atual = somarDias(atual, 1);
  return atual;
}

function ultimoDiaDoMes(data) {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0));
}

export function resolverData(expr, base) {
  const dataBase = paraData(base);
  const texto = expr.trim().toLowerCase();

  const deslocamento = texto.match(/^([+-]\d+)\s+(dias uteis|dias|semanas)$/);
  if (deslocamento) {
    const quantidade = Number(deslocamento[1]);
    const unidade = deslocamento[2];
    if (unidade === "dias") return paraISO(somarDias(dataBase, quantidade));
    if (unidade === "semanas") return paraISO(somarDias(dataBase, quantidade * 7));
    return paraISO(somarDiasUteis(dataBase, quantidade));
  }

  const proxima = texto.match(/^proxima (segunda|terca|quarta|quinta|sexta|sabado|domingo)$/);
  if (proxima) return paraISO(proximoDiaSemana(dataBase, DIAS_SEMANA.indexOf(proxima[1])));

  if (texto === "ultimo dia do mes") return paraISO(ultimoDiaDoMes(dataBase));

  throw new Error(`expressao de data invalida: "${expr}"`);
}
