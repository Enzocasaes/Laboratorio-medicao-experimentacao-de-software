import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Leitor minimo de arquivo .env.
 *
 * Existe para que o token nao precise ficar escrito no codigo e para que o
 * programa rode com um simples "node src/index.js", sem nenhuma dependencia
 * externa (nada de "dotenv") e sem flags extras.
 *
 * O que ele faz: le o arquivo .env da raiz do projeto, interpreta linhas no
 * formato CHAVE=valor e copia os pares para process.env.
 *
 * Regras aceitas:
 *   - linhas em branco sao ignoradas;
 *   - linhas comecando com "#" sao comentarios e sao ignoradas;
 *   - o primeiro "=" separa a chave do valor (o valor pode conter "=");
 *   - aspas simples ou duplas em volta do valor sao removidas;
 *   - variaveis ja definidas no ambiente do sistema tem prioridade e NAO sao
 *     sobrescritas pelo arquivo.
 */
export function carregarEnv() {
  // Caminho da raiz do projeto: este arquivo esta em <raiz>/src/env.js,
  // entao subimos um nivel. Assim o .env e encontrado independentemente da
  // pasta em que o comando "node" foi executado.
  const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const caminhoDoEnv = resolve(raizDoProjeto, ".env");

  let conteudo;
  try {
    conteudo = readFileSync(caminhoDoEnv, "utf8");
  } catch (erro) {
    // Arquivo inexistente nao e erro fatal aqui: o token pode ter sido
    // definido diretamente no ambiente do sistema. A verificacao de token
    // ausente acontece em src/github.js, com uma mensagem clara.
    if (erro.code === "ENOENT") return;
    throw new Error(`Nao foi possivel ler o arquivo .env (${caminhoDoEnv}): ${erro.message}`);
  }

  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (linha === "" || linha.startsWith("#")) continue;

    const posicaoDoIgual = linha.indexOf("=");
    if (posicaoDoIgual === -1) continue; // linha sem "=" nao e um par valido

    const chave = linha.slice(0, posicaoDoIgual).trim();
    let valor = linha.slice(posicaoDoIgual + 1).trim();

    // remove aspas em volta do valor, se existirem
    const temAspas =
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"));
    if (temAspas && valor.length >= 2) valor = valor.slice(1, -1);

    if (process.env[chave] === undefined) {
      process.env[chave] = valor;
    }
  }
}
