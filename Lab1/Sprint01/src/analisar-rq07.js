import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_BUSCAR_POPULARES } from "./queries/busca-populares.js";
import { gerarCSV } from "./csv.js";
import { calcularMediana } from "./estatisticas.js";
import { calcularDiasDesdeAtualizacao, converterUpdatedAt } from "./tempo-atualizacao.js";

const QUANTIDADE = 100;
const TAMANHO_DO_LOTE = 10;
const CAMINHO_DO_CSV = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "rq07PorLinguagem.csv");

async function main() {
  carregarEnv();
  const repositorios = [];
  let cursor = null;
  while (repositorios.length < QUANTIDADE) {
    const dados = await executarQueryGraphQL(QUERY_BUSCAR_POPULARES, { quantidade: Math.min(TAMANHO_DO_LOTE, QUANTIDADE - repositorios.length), cursor });
    const busca = dados.search;
    if (!Array.isArray(busca?.nodes)) throw new Error('Resposta sem "search.nodes".');
    repositorios.push(...busca.nodes);
    console.log(`Lote recebido: ${repositorios.length}/${QUANTIDADE} repositorios.`);
    if (!busca.pageInfo?.hasNextPage) break;
    cursor = busca.pageInfo.endCursor;
  }
  const agora = new Date();
  const grupos = new Map();
  for (const repositorio of repositorios) {
    const linguagem = repositorio?.primaryLanguage?.name ?? "Sem linguagem primaria";
    const prs = repositorio?.pullRequests?.totalCount;
    const releases = repositorio?.releases?.totalCount;
    if (typeof prs !== "number" || typeof releases !== "number") continue;
    const dias = calcularDiasDesdeAtualizacao(converterUpdatedAt(repositorio.updatedAt), agora);
    const grupo = grupos.get(linguagem) ?? { prs: [], releases: [], dias: [] };
    grupo.prs.push(prs); grupo.releases.push(releases); grupo.dias.push(dias);
    grupos.set(linguagem, grupo);
  }
  const resumo = [...grupos.entries()].map(([linguagem, grupo]) => [
    linguagem, grupo.prs.length, calcularMediana(grupo.prs), calcularMediana(grupo.releases), calcularMediana(grupo.dias).toFixed(2),
  ]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log("Linguagem | Repositorios | Mediana PRs | Mediana releases | Mediana dias sem atualizacao");
  resumo.forEach((linha) => console.log(linha.join(" | ")));
  writeFileSync(CAMINHO_DO_CSV, gerarCSV(["linguagem_primaria", "quantidade_repositorios", "mediana_pull_requests_aceitas", "mediana_releases", "mediana_dias_desde_atualizacao"], resumo), "utf8");
  console.log(`CSV da RQ07 gravado em: ${CAMINHO_DO_CSV}`);
}
main().catch((erro) => { console.error(`[ERRO] ${erro.message}`); process.exitCode = 1; });
