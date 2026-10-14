// Gerador/leitor minimo de CSV, sem dependencias (mesmo do Lab02).
// null/undefined viram campo vazio - e' assim que um dado ausente aparece no CSV.

import { existsSync, readFileSync } from "node:fs";

export function gerarCSV(cabecalho, linhas) {
  return [cabecalho, ...linhas]
    .map((linha) => linha.map(escaparCampoCSV).join(","))
    .join("\n") + "\n";
}

function escaparCampoCSV(valor) {
  const texto = valor === null || valor === undefined ? "" : String(valor);
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
  let campoIniciado = false;

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
    } else if (c !== "\r") {
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

// Converte o resultado de lerCSV em objetos { coluna: valor }. Campo que falta
// numa linha curta vira "" (e' assim que o CSV representa o dado ausente).
export function paraObjetos({ cabecalho, linhas }) {
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((coluna, i) => [coluna, linha[i] ?? ""])));
}

// Le um CSV do disco como lista de objetos. Arquivo inexistente devolve null,
// para o chamador distinguir "etapa nao rodou" de "rodou e nao gerou linhas".
export function lerTabelaCSV(caminho) {
  if (!existsSync(caminho)) return null;
  const texto = readFileSync(caminho, "utf8").replace(/^﻿/, ""); // BOM de planilha exportada
  const tabela = lerCSV(texto);
  return { cabecalho: tabela.cabecalho, registros: paraObjetos(tabela) };
}
