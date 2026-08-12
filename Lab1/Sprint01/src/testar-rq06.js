/**
 * Lab01S01 - RQ06: validacao individual da metrica de razao entre issues
 * fechadas e total de issues, numa amostra de repositorios buscados
 * automaticamente (sem lista escrita a mao). Mesmo padrao de src/testar-rq02.js.
 *
 * Este e o script de VALIDACAO INDIVIDUAL da RQ06 (ver enunciado: "cada
 * integrante implementa e testa, em Issue propria, a extracao e uma
 * validacao rapida... antes de integrar ao script unico de consulta do
 * grupo").
 *
 * A busca dos repositorios populares reaproveita a MESMA infraestrutura das
 * demais RQs (src/queries/busca-populares.js, via o campo "search" da API,
 * ordenado por estrelas) - nenhuma lista manual de repositorios e criada aqui.
 *
 * Como a busca de populares nao devolve a contagem de issues, para CADA
 * repositorio da amostra este script faz uma segunda consulta GraphQL - a
 * QUERY_RQ06 (ver src/queries/rq06.js) - pedindo o total de issues e o total
 * de issues fechadas (via alias). A razao = fechadas / total e calculada aqui,
 * com cuidado para NAO dividir por zero em repositorios sem issues.
 *
 * O resumo no console mostra minima, maxima e mediana da razao (metrica
 * numerica entre 0 e 1). Ao final, os resultados sao exportados para
 * data/rq06Validation.csv.
 *
 * Uso:
 *   node src/testar-rq06.js
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { QUERY_RQ06 } from "./queries/rq06.js";
import { calcularMediana } from "./estatisticas.js";
import { gerarCSV } from "./csv.js";

/** Quantos repositorios pedir nesta chamada (maximo permitido pela API: 100). */
const QUANTIDADE = 100;

/** Caminho do CSV de validacao, sempre em <raiz do projeto>/data/. */
const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAMINHO_DO_CSV = resolve(raizDoProjeto, "data", "rq06Validation.csv");

/**
 * Separa "dono/repositorio" (nameWithOwner) em owner e name, para preencher
 * as variaveis $owner/$name exigidas pela QUERY_RQ06. Mesmo cuidado de
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

/**
 * Razao entre issues fechadas e total de issues. Repositorios sem nenhuma
 * issue (total = 0) recebem razao 0, evitando divisao por zero (NaN).
 *
 * @param {number} issuesFechadas
 * @param {number} issuesTotal
 * @returns {number} valor entre 0 e 1
 */
function calcularRazaoIssues(issuesFechadas, issuesTotal) {
  return issuesTotal === 0 ? 0 : issuesFechadas / issuesTotal;
}

async function main() {
  carregarEnv();

  console.log("=== Lab01S01 - RQ06: razao de issues fechadas ===\n");
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
      const dados = await executarQueryGraphQL(QUERY_RQ06, { owner, name });

      // Repository pode vir null quando o repositorio nao existe (mais) ou o
      // token nao tem permissao para ve-lo.
      const repositorio = dados.repository;
      if (!repositorio) {
        console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} repositorio nao encontrado na resposta da API`);
        continue;
      }

      // Validacao defensiva: garante que ambas as contagens vieram preenchidas
      // antes de usa-las (mesmo cuidado da RQ02 com pullRequests.totalCount).
      if (
        !repositorio.issuesTotal ||
        typeof repositorio.issuesTotal.totalCount !== "number" ||
        !repositorio.issuesFechadas ||
        typeof repositorio.issuesFechadas.totalCount !== "number"
      ) {
        console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} resposta sem as contagens de issues`);
        continue;
      }

      const issuesTotal = repositorio.issuesTotal.totalCount;
      const issuesFechadas = repositorio.issuesFechadas.totalCount;
      const razao = calcularRazaoIssues(issuesFechadas, issuesTotal);

      resultados.push({
        nameWithOwner: repositorio.nameWithOwner,
        issuesFechadas,
        issuesTotal,
        razao,
      });
      console.log(
        `OK    ${repositorio.nameWithOwner.padEnd(28)} -> ${issuesFechadas.toLocaleString("pt-BR")}/${issuesTotal.toLocaleString("pt-BR")} (${(razao * 100).toFixed(1)}%)`
      );
    } catch (erro) {
      // Um repositorio com erro nao deve derrubar os demais.
      console.log(`FALHA ${repositorioDaBusca.nameWithOwner.padEnd(28)} ${erro.message}`);
    }
  }

  console.log("\n=== Resumo ===");
  console.log(`Processados com sucesso: ${resultados.length}/${busca.nodes.length}`);

  if (resultados.length > 0) {
    const razoes = resultados.map((r) => r.razao);
    console.log(`\nRazao minima : ${(Math.min(...razoes) * 100).toFixed(1)}%`);
    console.log(`Razao maxima : ${(Math.max(...razoes) * 100).toFixed(1)}%`);
    console.log(`Razao mediana: ${(calcularMediana(razoes) * 100).toFixed(1)}%`);
  }

  // Exporta o resultado da validacao para CSV: nome do repositorio, issues
  // fechadas, total de issues e a razao (fracao entre 0 e 1).
  const linhasDoCSV = resultados.map((r) => [
    r.nameWithOwner,
    r.issuesFechadas,
    r.issuesTotal,
    r.razao.toFixed(4),
  ]);
  const conteudoDoCSV = gerarCSV(
    ["repositorio", "issues_fechadas", "issues_total", "razao_fechadas"],
    linhasDoCSV
  );
  writeFileSync(CAMINHO_DO_CSV, conteudoDoCSV, "utf8");
  console.log(`\nCSV de validacao gravado em: ${CAMINHO_DO_CSV}`);
}

main().catch((erro) => {
  console.error("\n[ERRO] " + erro.message);
  process.exitCode = 1;
});
