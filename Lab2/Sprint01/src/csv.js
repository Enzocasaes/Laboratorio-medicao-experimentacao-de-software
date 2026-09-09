// Gerador/leitor minimo de CSV, sem dependencias.

export function gerarCSV(cabecalho, linhas) {
  return [cabecalho, ...linhas]
    .map((linha) => linha.map(escaparCampoCSV).join(","))
    .join("\n") + "\n";
}

// Uma unica linha ja com a quebra final - usada para o append incremental de
// trials em data/trials.csv.
export function linhaCSV(campos) {
  return campos.map(escaparCampoCSV).join(",") + "\n";
}

function escaparCampoCSV(valor) {
  const texto = String(valor);
  const precisaDeAspas = texto.includes(",") || texto.includes('"') || texto.includes("\n");
  return precisaDeAspas ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Parser em passada unica: lida com campos entre aspas contendo virgula, quebra
// de linha e aspas escapadas (""). Devolve { cabecalho, linhas }.
export function lerCSV(texto) {
  const registros = [];
  let linha = [];
  let campo = "";
  let dentroDeAspas = false;
  let campoIniciado = false; // houve algum caractere no registro atual?

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 1; }
        else dentroDeAspas = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
      campoIniciado = true;
    } else if (c === ",") {
      linha.push(campo);
      campo = "";
      campoIniciado = true;
    } else if (c === "\n") {
      linha.push(campo);
      registros.push(linha);
      linha = [];
      campo = "";
      campoIniciado = false;
    } else if (c === "\r") {
      // ignora CR de quebras CRLF
    } else {
      campo += c;
      campoIniciado = true;
    }
  }

  if (campoIniciado || campo !== "" || linha.length > 0) {
    linha.push(campo);
    registros.push(linha);
  }

  if (registros.length === 0) return { cabecalho: [], linhas: [] };
  const [cabecalho, ...linhas] = registros;
  return { cabecalho, linhas };
}
