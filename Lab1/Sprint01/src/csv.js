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

export function lerCSV(texto) {
  const registros = dividirEmRegistros(texto);
  if (registros.length === 0) return { cabecalho: [], linhas: [] };

  const [cabecalho, ...linhas] = registros.map(dividirRegistroEmCampos);
  return { cabecalho, linhas };
}

function dividirEmRegistros(texto) {
  const registros = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice];

    if (caractere === '"') {
      const proximoTambemEAspas = texto[indice + 1] === '"';
      if (dentroDeAspas && proximoTambemEAspas) {
        atual += '"';
        indice += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
        atual += caractere;
      }
    } else if (caractere === "\n" && !dentroDeAspas) {
      registros.push(atual);
      atual = "";
    } else if (caractere === "\r") {
      // ignorado: quebras de linha CRLF
    } else {
      atual += caractere;
    }
  }
  if (atual !== "") registros.push(atual);

  return registros;
}

function dividirRegistroEmCampos(registro) {
  const campos = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let indice = 0; indice < registro.length; indice += 1) {
    const caractere = registro[indice];

    if (caractere === '"') {
      const proximoTambemEAspas = registro[indice + 1] === '"';
      if (dentroDeAspas && proximoTambemEAspas) {
        atual += '"';
        indice += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (caractere === "," && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += caractere;
    }
  }
  campos.push(atual);

  return campos;
}
