// Kata 05 - Ranking com criterios de desempate.
// Ver enunciado.md para as regras. Solucao de referencia (autoral).

function ehNumeroFinito(valor) {
  return typeof valor === "number" && Number.isFinite(valor);
}

function validarParticipante(participante) {
  const { nome, pontos, vitorias, saldo } = participante;
  if (typeof nome !== "string" || nome.trim().length === 0) {
    throw new Error('participante invalido: "nome" deve ser uma string nao vazia');
  }
  if (!ehNumeroFinito(pontos) || !ehNumeroFinito(vitorias) || !ehNumeroFinito(saldo)) {
    throw new Error(`participante "${nome}" tem campo numerico invalido (pontos/vitorias/saldo)`);
  }
}

function validarNomesUnicos(participantes) {
  const vistos = new Set();
  for (const { nome } of participantes) {
    if (vistos.has(nome)) {
      throw new Error(`nome duplicado: "${nome}" aparece mais de uma vez`);
    }
    vistos.add(nome);
  }
}

function comparar(a, b) {
  if (a.pontos !== b.pontos) return b.pontos - a.pontos;
  if (a.vitorias !== b.vitorias) return b.vitorias - a.vitorias;
  if (a.saldo !== b.saldo) return b.saldo - a.saldo;
  return a.nome.localeCompare(b.nome);
}

function empatados(a, b) {
  return a.pontos === b.pontos && a.vitorias === b.vitorias && a.saldo === b.saldo;
}

export function classificar(participantes) {
  participantes.forEach(validarParticipante);
  validarNomesUnicos(participantes);

  const ordenados = [...participantes].sort(comparar);
  const resultado = [];
  let posicaoAtual = 0;

  for (let indice = 0; indice < ordenados.length; indice += 1) {
    const atual = ordenados[indice];
    const anterior = ordenados[indice - 1];
    if (indice === 0 || !empatados(atual, anterior)) {
      posicaoAtual = indice + 1;
    }
    resultado.push({ nome: atual.nome, posicao: posicaoAtual });
  }

  return resultado;
}
