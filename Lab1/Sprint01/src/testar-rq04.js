import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { QUERY_RQ04 } from "./queries/rq04.js";
import { separarOwnerENome } from "./repositorio.js";
import { calcularMediana } from "./estatisticas.js";
import { gerarCSV } from "./csv.js";
import { calcularDiasDesdeAtualizacao, converterUpdatedAt } from "./tempo-atualizacao.js";

const QUANTIDADE = 8;
const CAMINHO_DO_CSV = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "rq04Validation.csv");

async function main() {
  carregarEnv();
  const dados = await executarQueryGraphQL(QUERY_BUSCAR_POPULARES, { quantidade: QUANTIDADE, cursor: null });
  const repositorios = dados.search?.nodes;
  if (!Array.isArray(repositorios)) throw new Error('Resposta sem "search.nodes".');
  const agora = new Date();
  const resultados = [];
  for (const item of repositorios) {
    if (!item?.nameWithOwner) continue;
    const repositorio = (await executarQueryGraphQL(QUERY_RQ04, separarOwnerENome(item.nameWithOwner))).repository;
    const dias = calcularDiasDesdeAtualizacao(converterUpdatedAt(repositorio?.updatedAt), agora);
    resultados.push([repositorio.nameWithOwner, repositorio.updatedAt, dias.toFixed(2)]);
    console.log(`OK ${repositorio.nameWithOwner}: ${dias.toFixed(2)} dias`);
  }
  console.log(`Processados: ${resultados.length}/${repositorios.length}`);
  console.log(`Mediana de dias: ${calcularMediana(resultados.map((linha) => Number(linha[2]))).toFixed(2)}`);
  writeFileSync(CAMINHO_DO_CSV, gerarCSV(["repositorio", "data_ultima_atualizacao", "dias_desde_atualizacao"], resultados), "utf8");
}
main().catch((erro) => { console.error(`[ERRO] ${erro.message}`); process.exitCode = 1; });
