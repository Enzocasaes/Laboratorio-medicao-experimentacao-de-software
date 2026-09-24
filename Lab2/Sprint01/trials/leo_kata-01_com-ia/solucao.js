export function normalizarNotas(texto) {
  const linhas = String(texto).split("\n").map((linha) => {
    // 1. remove espacos/tabs no fim  2. colapsa 2+ espacos em um
    let normalizada = linha.replace(/[ \t]+$/, "").replace(/ {2,}/g, " ");

    // 3. "* " vira "- ", preservando a indentacao
    normalizada = normalizada.replace(/^([ \t]*)\* /, "$1- ");

    // 4. capitaliza a primeira letra do titulo
    if (normalizada.startsWith("# ")) {
      const titulo = normalizada.slice(2);
      normalizada = "# " + titulo.charAt(0).toUpperCase() + titulo.slice(1);
    }

    return normalizada;
  });

  // 5. duas ou mais linhas em branco viram uma so'
  const colapsadas = [];
  for (const linha of linhas) {
    const emBranco = linha.trim().length === 0;
    const anteriorEmBranco =
      colapsadas.length > 0 && colapsadas[colapsadas.length - 1].trim().length === 0;
    if (emBranco && anteriorEmBranco) continue;
    colapsadas.push(linha);
  }

  // 6. remove linhas em branco no inicio e no fim
  while (colapsadas.length > 0 && colapsadas[0].trim().length === 0) colapsadas.shift();
  while (colapsadas.length > 0 && colapsadas[colapsadas.length - 1].trim().length === 0) {
    colapsadas.pop();
  }

  return colapsadas.join("\n");
}
