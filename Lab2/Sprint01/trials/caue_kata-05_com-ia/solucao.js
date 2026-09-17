export function classificar(participantes) {
  // Regra 8: Lista vazia devolve lista vazia
  if (!participantes || participantes.length === 0) {
    return [];
  }

  const nomesVistos = new Set();

  // Regras 6 e 7: Validação dos campos e checagem de nomes duplicados
  for (const p of participantes) {
    if (!p || typeof p.nome !== "string" || p.nome.trim() === "") {
      throw new Error('O campo "nome" deve ser uma string não vazia.');
    }

    if (nomesVistos.has(p.nome)) {
      throw new Error(`Nome duplicado encontrado: "${p.nome}".`);
    }
    nomesVistos.add(p.nome);

    const camposNumericos = ["pontos", "vitorias", "saldo"];
    for (const campo of camposNumericos) {
      if (typeof p[campo] !== "number" || !Number.isFinite(p[campo])) {
        throw new Error(`O campo "${campo}" deve ser um número finito.`);
      }
    }
  }

  // Regras 1 a 4: Ordenação em cascata
  const ordenados = [...participantes].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias;
    if (b.saldo !== a.saldo) return b.saldo - a.saldo;
    return a.nome.localeCompare(b.nome);
  });

  // Regra 5: Atribuição de posições com saltos (padrão 1, 2, 2, 4)
  const resultado = [];

  for (let i = 0; i < ordenados.length; i++) {
    const atual = ordenados[i];

    if (i === 0) {
      resultado.push({ nome: atual.nome, posicao: 1 });
      continue;
    }

    const anterior = ordenados[i - 1];
    const empatado =
      atual.pontos === anterior.pontos &&
      atual.vitorias === anterior.vitorias &&
      atual.saldo === anterior.saldo;

    resultado.push({
      nome: atual.nome,
      posicao: empatado ? resultado[i - 1].posicao : i + 1,
    });
  }

  return resultado;
}