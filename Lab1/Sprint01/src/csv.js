export function gerarCSV(cabecalho, linhas) {
  return [cabecalho, ...linhas]
    .map((linha) => linha.map(escaparCampoCSV).join(","))
    .join("\n") + "\n";
}

function escaparCampoCSV(valor) {
  const texto = String(valor);
  const precisaDeAspas = texto.includes(",") || texto.includes('"') || texto.includes("\n");
  return precisaDeAspas ? `"${texto.replace(/"/g, '""')}"` : texto;
}
