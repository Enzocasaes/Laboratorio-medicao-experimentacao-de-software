// enzo_kata-05_sem-ia
// Implemente aqui. O enunciado esta' em enunciado.md, nesta pasta.

function validar(participante) {
  const { nome, pontos, vitorias, saldo } = participante;
  if (typeof nome !== "string" || nome.length === 0) {
    throw new Error("nome invalido");
  }
  for (const campo of [pontos, vitorias, saldo]) {
    if (typeof campo !== "number" || !Number.isFinite(campo)) {
      throw new Error("campo numerico invalido");
    }
  }
}

function mesmoDesempenho(a, b) {
  return a.pontos === b.pontos && a.vitorias === b.vitorias && a.saldo === b.saldo;
}

export function classificar(participantes) {
  participantes.forEach(validar);

  const nomes = new Set();
  for (const p of participantes) {
    if (nomes.has(p.nome)) throw new Error("nome duplicado");
    nomes.add(p.nome);
  }

  const ordenados = [...participantes].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    if (b.saldo !== a.saldo) return b.saldo - a.saldo;
    return a.nome.localeCompare(b.nome);
  });

  const resultado = [];
  for (let i = 0; i < ordenados.length; i += 1) {
    const posicao = i > 0 && mesmoDesempenho(ordenados[i], ordenados[i - 1])
      ? resultado[i - 1].posicao
      : i + 1;
    resultado.push({ nome: ordenados[i].nome, posicao });
  }

  return resultado;
}
