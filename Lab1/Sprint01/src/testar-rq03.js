import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { QUERY_RQ03 } from "./queries/rq03.js";
import { separarOwnerENome } from "./repositorio.js";
import { calcularMediana } from "./estatisticas.js";
import { gerarCSV } from "./csv.js";

const QUANTIDADE = 8;
const CAMINHO_DO_CSV = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "rq03Validation.csv");

async function main() {
  carregarEnv();
  const dados = await executarQueryGraphQL(QUERY_BUSCAR_POPULARES, { quantidade: QUANTIDADE, cursor: null });
  const repositorios = dados.search?.nodes;
  if (!Array.isArray(repositorios)) throw new Error('Resposta sem "search.nodes".');
  const resultados = [];
  for (const item of repositorios) {
    if (!item?.nameWithOwner) continue;
    const repositorio = (await executarQueryGraphQL(QUERY_RQ03, separarOwnerENome(item.nameWithOwner))).repository;
    const total = repositorio?.releases?.totalCount;
    if (typeof total !== "number") throw new Error(`Resposta sem releases para ${item.nameWithOwner}.`);
    resultados.push([repositorio.nameWithOwner, total]);
    console.log(`OK ${repositorio.nameWithOwner}: ${total} releases`);
  }
  console.log(`Processados: ${resultados.length}/${repositorios.length}`);
  console.log(`Mediana de releases: ${calcularMediana(resultados.map((linha) => linha[1]))}`);
  writeFileSync(CAMINHO_DO_CSV, gerarCSV(["repositorio", "total_releases"], resultados), "utf8");
}
main().catch((erro) => { console.error(`[ERRO] ${erro.message}`); process.exitCode = 1; });
