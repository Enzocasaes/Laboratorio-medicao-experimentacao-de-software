// Kata 01 - Normalizador de mini-formato de notas.
// Ver enunciado.md para as regras. Solucao de referencia (autoral).

function removerEspacoNoFim(linha) {
  return linha.replace(/[ \t]+$/, "");
}

function colapsarEspacos(linha) {
  return linha.replace(/ {2,}/g, " ");
}

function normalizarMarcador(linha) {
  const indentacao = linha.match(/^\s*/)[0];
  const resto = linha.slice(indentacao.length);
  if (resto.startsWith("* ")) {
    return `${indentacao}- ${resto.slice(2)}`;
  }
  return linha;
}

function capitalizarTitulo(linha) {
  if (!linha.startsWith("# ")) return linha;
  const titulo = linha.slice(2);
  if (titulo.length === 0) return linha;
  return `# ${titulo[0].toUpperCase()}${titulo.slice(1)}`;
}

function colapsarLinhasBrancas(linhas) {
  const resultado = [];
  let anteriorEraVazia = false;
  for (const linha of linhas) {
    const vazia = linha.trim().length === 0;
    if (vazia && anteriorEraVazia) continue;
    resultado.push(vazia ? "" : linha);
    anteriorEraVazia = vazia;
  }
  return resultado;
}

function removerBordasBrancas(linhas) {
  const copia = [...linhas];
  while (copia.length && copia[0] === "") copia.shift();
  while (copia.length && copia.at(-1) === "") copia.pop();
  return copia;
}

export function normalizarNotas(texto) {
  const linhas = texto
    .split("\n")
    .map(removerEspacoNoFim)
    .map(colapsarEspacos)
    .map(normalizarMarcador)
    .map(capitalizarTitulo);

  const semDuplicatas = colapsarLinhasBrancas(linhas);
  const semBordas = removerBordasBrancas(semDuplicatas);

  return semBordas.join("\n");
}
