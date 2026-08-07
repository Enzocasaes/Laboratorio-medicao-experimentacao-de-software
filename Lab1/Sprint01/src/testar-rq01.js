/**
 * Lab01S01 - RQ01: validacao individual da metrica de idade, numa amostra de
 * repositorios buscados automaticamente (sem lista escrita a mao).
 *
 * Este e o script de VALIDACAO INDIVIDUAL da RQ01 (ver enunciado: "cada
 * integrante implementa e testa, em Issue propria, a extracao e uma
 * validacao rapida... antes de integrar ao script unico de consulta do
 * grupo"). Cada RQ tera um script equivalente (testar-rq02.js, testar-rq03.js,
 * ...); depois que todas estiverem validadas, os campos sao reunidos numa
 * unica query e num unico CSV de coleta (ver a secao "Reaproveitamento para
 * as proximas RQs" no README).
 *
 * A busca dos repositorios usa o campo "search" da API GraphQL, ordenando
 * por estrelas (ver src/queries/busca-populares.js) - por isso nenhuma lista
 * de nomes e necessaria aqui.
 *
 * Nesta etapa a quantidade e pequena (8) so para validar que a busca
 * funciona e que o calculo de idade continua correto quando os repositorios
 * vem da API em vez de uma lista fixa. Pedir 100 ou paginar ate 1000 e so
 * trocar QUANTIDADE e, no caso de 1000, adicionar um loop usando
 * pageInfo.endCursor (ainda nao implementado aqui).
 *
 * Ao final, os resultados tambem sao exportados para data/rq01Validation.csv
 * (nome do repositorio, data de criacao e idade em anos), como registro da
 * validacao feita nesta amostra.
 *
 * Uso:
 *   node src/testar-rq01.js
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { converterCreatedAt, calcularIdade, formatarIdade } from "./index.js";
import { calcularMediana } from "./estatisticas.js";
import { gerarCSV } from "./csv.js";

/** Quantos repositorios pedir nesta chamada (maximo permitido pela API: 100). */
const QUANTIDADE = 8;

/** Caminho do CSV de validacao, sempre em <raiz do projeto>/data/. */
const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAMINHO_DO_CSV = resolve(raizDoProjeto, "data", "rq01Validation.csv");

async function main() {
  carregarEnv();

  console.log(`=== Lab01S01 - RQ01: busca automatica dos ${QUANTIDADE} repositorios com mais estrelas ===\n`);

  // Nenhum "owner"/"name" e informado: quem decide quais repositorios voltam
  // e o proprio GitHub, atraves do "sort:stars-desc" dentro da query
  // (ver src/queries/busca-populares.js). "cursor: null" pede a primeira pagina.
  const dados = await executarQueryGraphQL(QUERY_BUSCAR_POPULARES, {
    quantidade: QUANTIDADE,
    cursor: null,
  });

  const busca = dados.search;
  if (!busca || !Array.isArray(busca.nodes)) {
    throw new Error('A resposta da API nao contem a lista esperada em "search.nodes".');
  }

  console.log(`Repositorios publicos que casam com a busca (total): ${busca.repositoryCount.toLocaleString("pt-BR")}`);
  console.log(`Repositorios devolvidos nesta chamada: ${busca.nodes.length}\n`);

  const resultados = [];

  for (const repositorio of busca.nodes) {
    // O campo "search" pode devolver "null" no lugar de um resultado quando o
    // repositorio ficou inacessivel entre a indexacao da busca e a resposta
    // (por exemplo, foi apagado). E raro, mas nao deve derrubar o script.
    if (!repositorio || !repositorio.nameWithOwner) {
      console.log("FALHA um item da busca veio vazio (repositorio pode ter sido removido) - ignorado");
      continue;
    }

    try {
      const dataDeCriacao = converterCreatedAt(repositorio.createdAt);
      const idade = calcularIdade(dataDeCriacao, new Date());
      resultados.push({ ...repositorio, idade });
      console.log(
        `OK    ${repositorio.nameWithOwner.padEnd(28)} criado em ${repositorio.createdAt}  ->  ${formatarIdade(idade)}`
      );
    } catch (erro) {
      console.log(`FALHA ${repositorio.nameWithOwner.padEnd(28)} ${erro.message}`);
    }
  }

  console.log("\n=== Resumo ===");
  console.log(`Processados com sucesso: ${resultados.length}/${busca.nodes.length}`);

  if (resultados.length > 0) {
    const idadesEmAnos = resultados.map((r) => r.idade.anosDecimais);
    console.log(`Idade minima  : ${Math.min(...idadesEmAnos).toFixed(2)} anos`);
    console.log(`Idade maxima  : ${Math.max(...idadesEmAnos).toFixed(2)} anos`);
    console.log(`Idade mediana : ${calcularMediana(idadesEmAnos).toFixed(2)} anos`);
  }

  // Mostra que a paginacao esta disponivel, sem ainda segui-la em loop -
  // isso fica para quando a coleta dos 1000 repositorios for implementada.
  console.log(`\nExiste proxima pagina: ${busca.pageInfo.hasNextPage ? "sim" : "nao"}`);
  if (busca.pageInfo.hasNextPage) {
    console.log(`Cursor para continuar (pageInfo.endCursor): ${busca.pageInfo.endCursor}`);
  }

  // Exporta o resultado da validacao para CSV: nome do repositorio, data de
  // criacao (createdAt, bruta), a idade em anos decimais (util para calcular
  // mediana depois) e a mesma idade em um unico texto legivel
  // ("x anos, y meses e z dias").
  const linhasDoCSV = resultados.map((r) => [
    r.nameWithOwner,
    r.createdAt,
    r.idade.anosDecimais.toFixed(2),
    formatarIdade(r.idade),
  ]);
  const conteudoDoCSV = gerarCSV(
    ["repositorio", "data_criacao", "idade_anos", "idade_detalhada"],
    linhasDoCSV
  );
  writeFileSync(CAMINHO_DO_CSV, conteudoDoCSV, "utf8");
  console.log(`\nCSV de validacao gravado em: ${CAMINHO_DO_CSV}`);
}

main().catch((erro) => {
  console.error("\n[ERRO] " + erro.message);
  process.exitCode = 1;
});
