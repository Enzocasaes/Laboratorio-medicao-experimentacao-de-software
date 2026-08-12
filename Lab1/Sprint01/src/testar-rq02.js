/**
 * Lab01S01 - RQ02: validacao individual da metrica de Pull Requests aceitas,
 * numa amostra de repositorios buscados automaticamente (sem lista escrita a
 * mao). Mesmo padrao de src/testar-rq01.js.
 *
 * Este e o script de VALIDACAO INDIVIDUAL da RQ02 (ver enunciado: "cada
 * integrante implementa e testa, em Issue propria, a extracao e uma
 * validacao rapida... antes de integrar ao script unico de consulta do
 * grupo").
 *
 * A busca dos repositorios populares reaproveita a MESMA infraestrutura da
 * RQ01 (src/queries/busca-populares.js, via o campo "search" da API,
 * ordenado por estrelas) - nenhuma lista manual de repositorios e criada
 * aqui, como pede o enunciado.
 *
 * Diferenca importante em relacao a RQ01: a busca de populares NAO devolve
 * o total de Pull Requests aceitas (esse dado nao existe nos campos pedidos
 * em busca-populares.js). Por isso, para CADA repositorio da amostra, este
 * script faz uma segunda consulta GraphQL - a QUERY_RQ02 (ver
 * src/queries/rq02.js) - pedindo apenas
 * "pullRequests(states: MERGED) { totalCount }". Nao ha paginacao das PRs
 * individuais: "totalCount" ja vem pronto do GitHub em uma unica resposta.
 *
 * Nesta etapa a quantidade e pequena (8), so para validar que a consulta
 * funciona e que a extracao do totalCount esta correta. Pedir 100 ou
 * paginar ate 1000 e so trocar QUANTIDADE (e, no caso de 1000, adicionar
 * o loop com pageInfo.endCursor, ja usado - mas ainda nao iterado - na
 * RQ01).
 *
 * Ao final, os resultados sao exportados para data/rq02Validation.csv
 * (nome do repositorio e total de PRs aceitas), como registro da validacao
 * feita nesta amostra.
 *
 * Uso:
 *   node src/testar-rq02.js
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { QUERY_RQ02 } from "./queries/rq02.js";
import { calcularMediana } from "./estatisticas.js";
import { gerarCSV } from "./csv.js";

/** Quantos repositorios pedir nesta chamada (maximo permitido pela API: 100). */
const QUANTIDADE = 100;

/** Caminho do CSV de validacao, sempre em <raiz do projeto>/data/. */
const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAMINHO_DO_CSV = resolve(raizDoProjeto, "data", "rq02Validation.csv");

/**
 * Separa "dono/repositorio" (nameWithOwner) em owner e name, para preencher
 * as variaveis $owner/$name exigidas pela QUERY_RQ02. O nome do repositorio
 * ja vem pronto no campo "name" devolvido pela busca; o dono e obtido
 * removendo esse sufixo de nameWithOwner (cobre o caso raro de o proprio
 * nome do repositorio conter "/", o que "split" ingenuo quebraria).
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

  console.log("=== Lab01S01 - RQ02: total de Pull Requests aceitas ===\n");
  console.log(`Consultando os ${QUANTIDADE} repositorios populares...\n`);

  // Mesma busca automatica usada na RQ01: nenhuma lista de nomes escrita a
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
    // repositorio ficou inacessivel entre a indexacao da busca e a resposta
    // (mesmo cuidado tomado em testar-rq01.js).
    if (!repositorioDaBusca || !repositorioDaBusca.nameWithOwner) {
      console.log("FALHA um item da busca veio vazio (repositorio pode ter sido removido) - ignorado");
      continue;
    }

    const { owner, name } = separarOwnerENome(repositorioDaBusca);

    try {
      const dados = await executarQueryGraphQL(QUERY_RQ02, { owner, name });

      // Repository pode vir null quando o repositorio nao existe (mais) ou o
      // token nao tem permissao para ve-lo.
      const repositorio = dados.repository;
      if (!repositorio) {
        console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} repositorio nao encontrado na resposta da API`);
        continue;
      }

      // Validacao defensiva: garante que a conexao pullRequests e o
      // totalCount vieram preenchidos antes de usa-los.
      if (!repositorio.pullRequests || typeof repositorio.pullRequests.totalCount !== "number") {
        console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} resposta sem "pullRequests.totalCount"`);
        continue;
      }

      const pullRequestsAceitas = repositorio.pullRequests.totalCount;
      resultados.push({ nameWithOwner: repositorio.nameWithOwner, pullRequestsAceitas });
      console.log(
        `OK    ${repositorio.nameWithOwner.padEnd(28)} -> ${pullRequestsAceitas.toLocaleString("pt-BR")} PRs aceitas`
      );
    } catch (erro) {
      // Um repositorio com erro nao deve derrubar os demais.
      console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} ${erro.message}`);
    }
  }

  console.log("\n=== Resumo ===");
  console.log(`Processados com sucesso: ${resultados.length}/${busca.nodes.length}`);

  if (resultados.length > 0) {
    const totais = resultados.map((r) => r.pullRequestsAceitas);
    console.log(`\nPRs aceitas minima : ${Math.min(...totais).toLocaleString("pt-BR")}`);
    console.log(`PRs aceitas maxima : ${Math.max(...totais).toLocaleString("pt-BR")}`);
    console.log(`PRs aceitas mediana: ${calcularMediana(totais).toLocaleString("pt-BR")}`);
  }

  // Exporta o resultado da validacao para CSV: nome do repositorio e total
  // de Pull Requests aceitas (MERGED).
  const linhasDoCSV = resultados.map((r) => [r.nameWithOwner, r.pullRequestsAceitas]);
  const conteudoDoCSV = gerarCSV(["repositorio", "pull_requests_aceitas"], linhasDoCSV);
  writeFileSync(CAMINHO_DO_CSV, conteudoDoCSV, "utf8");
  console.log(`\nCSV de validacao gravado em: ${CAMINHO_DO_CSV}`);
}

main().catch((erro) => {
  console.error("\n[ERRO] " + erro.message);
  process.exitCode = 1;
});
