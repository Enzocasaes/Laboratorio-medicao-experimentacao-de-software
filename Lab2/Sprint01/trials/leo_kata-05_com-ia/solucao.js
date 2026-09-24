export function classificar(participantes) {
  if (!Array.isArray(participantes)) {
    throw new Error("participantes deve ser uma lista");
  }

  const nomesVistos = new Set();
  for (const p of participantes) {
    if (!p || typeof p.nome !== "string" || p.nome.length === 0) {
      throw new Error("nome deve ser uma string nao vazia");
    }
    for (const campo of ["pontos", "vitorias", "saldo"]) {
      if (typeof p[campo] !== "number" || !Number.isFinite(p[campo])) {
        throw new Error(`${campo} deve ser um numero finito`);
      }
    }
    if (nomesVistos.has(p.nome)) {
      throw new Error(`nome duplicado: ${p.nome}`);
    }
    nomesVistos.add(p.nome);
  }

  const ordenados = [...participantes].sort(
    (a, b) =>
      b.pontos - a.pontos ||
      b.vitorias - a.vitorias ||
      b.saldo - a.saldo ||
      a.nome.localeCompare(b.nome),
  );

  const empatado = (a, b) =>
    a.pontos === b.pontos && a.vitorias === b.vitorias && a.saldo === b.saldo;

  const resultado = [];
  let posicao = 0;
  ordenados.forEach((atual, indice) => {
    if (indice === 0 || !empatado(atual, ordenados[indice - 1])) {
      posicao = indice + 1;
    }
    resultado.push({ nome: atual.nome, posicao });
  });

  return resultado;
}
