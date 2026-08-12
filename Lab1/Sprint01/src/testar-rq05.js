/**
 * Lab01S01 - RQ05: validacao individual da metrica de linguagem primaria,
 * numa amostra de repositorios buscados automaticamente (sem lista escrita a
 * mao). Mesmo padrao de src/testar-rq02.js.
 *
 * Este e o script de VALIDACAO INDIVIDUAL da RQ05 (ver enunciado: "cada
 * integrante implementa e testa, em Issue propria, a extracao e uma
 * validacao rapida... antes de integrar ao script unico de consulta do
 * grupo").
 *
 * A busca dos repositorios populares reaproveita a MESMA infraestrutura das
 * demais RQs (src/queries/busca-populares.js, via o campo "search" da API,
 * ordenado por estrelas) - nenhuma lista manual de repositorios e criada aqui.
 *
 * Como a busca de populares nao devolve a linguagem primaria, para CADA
 * repositorio da amostra este script faz uma segunda consulta GraphQL - a
 * QUERY_RQ05 (ver src/queries/rq05.js) - pedindo "primaryLanguage { name }".
 *
 * A metrica desta RQ e CATEGORICA (o nome de uma linguagem), nao numerica.
 * Por isso o resumo no console mostra a CONTAGEM por linguagem (quantos
 * repositorios usam cada uma), em vez de mediana. A referencia adotada para
 * "linguagens mais populares" e o GitHub Octoverse (ver rq05.js).
 *
 * Ao final, os resultados sao exportados para data/rq05Validation.csv
 * (nome do repositorio e linguagem primaria).
 *
 * Uso:
 *   node src/testar-rq05.js
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { QUERY_RQ05 } from "./queries/rq05.js";
import { gerarCSV } from "./csv.js";

/** Quantos repositorios pedir nesta chamada (maximo permitido pela API: 100). */
const QUANTIDADE = 100;

/** Texto usado quando o GitHub nao detecta uma linguagem primaria. */
const SEM_LINGUAGEM = "Sem linguagem";

/** Caminho do CSV de validacao, sempre em <raiz do projeto>/data/. */
const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAMINHO_DO_CSV = resolve(raizDoProjeto, "data", "rq05Validation.csv");

/**
 * Separa "dono/repositorio" (nameWithOwner) em owner e name, para preencher
 * as variaveis $owner/$name exigidas pela QUERY_RQ05. Mesmo cuidado de
 * testar-rq02.js (cobre o caso raro de o proprio nome do repositorio conter "/").
 *
 * @param {{ name: string, nameWithOwner: string }} repositorio
 * @returns {{ owner: string, name: string }}
 */
function separarOwnerENome(repositorio) {
  const owner = repositorio.nameWithOwner.slice(
    0,
    repositorio.nameWithOwner.length - repositorio.name.length - 1
  );
  return { owner, name: repositorio.name };
}

async function main() {
  carregarEnv();

  console.log("=== Lab01S01 - RQ05: linguagem primaria ===\n");
  console.log(`Consultando os ${QUANTIDADE} repositorios populares...\n`);

  // Mesma busca automatica das demais RQs: nenhuma lista de nomes escrita a
  // mao, a ordenacao por estrelas fica a cargo da query de busca.
  const dadosDaBusca = await executarQueryGraphQL(QUERY_BUSCAR_POPULARES, {
    quantidade: QUANTIDADE,
    cursor: null,
  });

  const busca = dadosDaBusca.search;
  if (!busca || !Array.isArray(busca.nodes)) {
    throw new Error('A resposta da API nao contem a lista esperada em "search.nodes".');
  }

  const resultados = [];

  for (const repositorioDaBusca of busca.nodes) {
    // O campo "search" pode devolver "null" no lugar de um resultado quando o
    // repositorio ficou inacessivel entre a indexacao da busca e a resposta.
    if (!repositorioDaBusca || !repositorioDaBusca.nameWithOwner) {
      console.log("FALHA um item da busca veio vazio (repositorio pode ter sido removido) - ignorado");
      continue;
    }

    const { owner, name } = separarOwnerENome(repositorioDaBusca);

    try {
      const dados = await executarQueryGraphQL(QUERY_RQ05, { owner, name });

      // Repository pode vir null quando o repositorio nao existe (mais) ou o
      // token nao tem permissao para ve-lo.
      const repositorio = dados.repository;
      if (!repositorio) {
        console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} repositorio nao encontrado na resposta da API`);
        continue;
      }

      // primaryLanguage pode ser null (repositorio sem codigo com linguagem
      // reconhecida) - isso nao e um erro, apenas uma categoria a parte.
      const linguagem = repositorio.primaryLanguage?.name ?? SEM_LINGUAGEM;
      resultados.push({ nameWithOwner: repositorio.nameWithOwner, linguagem });
      console.log(`OK    ${repositorio.nameWithOwner.padEnd(28)} -> ${linguagem}`);
    } catch (erro) {
      // Um repositorio com erro nao deve derrubar os demais.
      console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} ${erro.message}`);
    }
  }

  console.log("\n=== Resumo ===");
  console.log(`Processados com sucesso: ${resultados.length}/${busca.nodes.length}`);

  if (resultados.length > 0) {
    // Metrica categorica: contamos quantos repositorios usam cada linguagem,
    // ordenando da mais frequente para a menos frequente.
    const contagemPorLinguagem = new Map();
    for (const { linguagem } of resultados) {
      contagemPorLinguagem.set(linguagem, (contagemPorLinguagem.get(linguagem) ?? 0) + 1);
    }

    console.log("\nContagem por linguagem:");
    const ordenadas = [...contagemPorLinguagem.entries()].sort((a, b) => b[1] - a[1]);
    for (const [linguagem, quantidade] of ordenadas) {
      console.log(`  ${linguagem.padEnd(20)} ${quantidade}`);
    }
  }

  // Exporta o resultado da validacao para CSV: nome do repositorio e linguagem
  // primaria.
  const linhasDoCSV = resultados.map((r) => [r.nameWithOwner, r.linguagem]);
  const conteudoDoCSV = gerarCSV(["repositorio", "linguagem_primaria"], linhasDoCSV);
  writeFileSync(CAMINHO_DO_CSV, conteudoDoCSV, "utf8");
  console.log(`\nCSV de validacao gravado em: ${CAMINHO_DO_CSV}`);
}

main().catch((erro) => {
  console.error("\n[ERRO] " + erro.message);
  process.exitCode = 1;
});
