import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function carregarEnv() {
  const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const caminhoDoEnv = resolve(raizDoProjeto, ".env");

  let conteudo;
  try {
    conteudo = readFileSync(caminhoDoEnv, "utf8");
  } catch (erro) {
    if (erro.code === "ENOENT") return;
    throw new Error(`Nao foi possivel ler o arquivo .env (${caminhoDoEnv}): ${erro.message}`);
  }

  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (linha === "" || linha.startsWith("#")) continue;

    const posicaoDoIgual = linha.indexOf("=");
    if (posicaoDoIgual === -1) continue;

    const chave = linha.slice(0, posicaoDoIgual).trim();
    let valor = linha.slice(posicaoDoIgual + 1).trim();

    const temAspas =
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"));
    if (temAspas && valor.length >= 2) valor = valor.slice(1, -1);

    if (process.env[chave] === undefined) {
      process.env[chave] = valor;
    }
  }
}
