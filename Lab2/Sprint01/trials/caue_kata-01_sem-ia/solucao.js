export function normalizarNotas(texto) {
  let linhas = texto.split(/\r?\n/);

  linhas = linhas.map(linha => linha.replace(/[ \t]+$/, ""));
  linhas = linhas.map(linha => linha.replace(/ {2,}/g, " "));

  linhas = linhas.map(linha => {
    const match = linha.match(/^(\s*)\* (.*)$/);
    return match ? `${match[1]}- ${match[2]}` : linha;
  });

  linhas = linhas.map(linha => {
    if (linha.startsWith("# ")) {
      const titulo = linha.substring(2);
      return titulo
        ? "# " + titulo.charAt(0).toUpperCase() + titulo.substring(1)
        : linha;
    }
    return linha;
  });

  const resultado = [];
  let vaziaAnterior = false;

  for (const linha of linhas) {
    if (linha === "" && vaziaAnterior) continue;

    resultado.push(linha);
    vaziaAnterior = linha === "";
  }

  while (resultado.length && resultado[0] === "") {
    resultado.shift();
  }

  while (resultado.length && resultado[resultado.length - 1] === "") {
    resultado.pop();
  }

  return resultado.join("\n");
}