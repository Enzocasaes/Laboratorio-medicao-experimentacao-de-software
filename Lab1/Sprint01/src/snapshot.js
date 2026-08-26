import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_PROJETOS_DO_REPOSITORIO, QUERY_ITENS_DO_PROJETO } from "./queries/projeto-board.js";
import { gerarCSV } from "./csv.js";
import { contarPorCategoria } from "./estatisticas.js";

const REPOSITORIO_DO_GRUPO = {
  owner: "Enzocasaes",
  name: "Laboratorio-medicao-experimentacao-de-software",
};

const CABECALHO_CSV = [
  "snapshot_date",
  "sprint",
  "number",
  "title",
  "repository",
  "state",
  "status_column",
  "assignee",
];

const SEM_COLUNA = "Sem coluna";
const PAUSA_ENTRE_PAGINAS_MS = 500;

// A serie de snapshots atravessa o semestre e alimenta os Labs 04 e 05, por isso
// fica na raiz do repositorio e nao dentro da pasta deste laboratorio.
const DIRETORIO_DE_SNAPSHOTS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "sprint_snapshots"
);

function esperar(milissegundos) {
  return new Promise((resolver) => setTimeout(resolver, milissegundos));
}

function dataDeHoje() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

async function descobrirNumeroDoProjeto(numeroInformado) {
  if (numeroInformado !== undefined) return numeroInformado;

  const dados = await executarQueryGraphQL(QUERY_PROJETOS_DO_REPOSITORIO, REPOSITORIO_DO_GRUPO);
  const projetos = dados.repository?.projectsV2?.nodes ?? [];

  if (projetos.length === 0) {
    throw new Error(
      "Nenhum GitHub Projects (v2) vinculado ao repositorio.\n" +
        "  Abra o Project no GitHub e use o menu > Settings > Manage access\n" +
        "  para vincula-lo ao repositorio do grupo."
    );
  }

  if (projetos.length > 1) {
    const lista = projetos.map((p) => `    ${p.number} - ${p.title}`).join("\n");
    throw new Error(
      `O repositorio tem ${projetos.length} projetos vinculados. Informe qual usar:\n` +
        "  npm run snapshot -- <sprint> <numero>\n" +
        `${lista}`
    );
  }

  return projetos[0].number;
}

async function coletarItensDoProjeto(numeroDoProjeto) {
  const itens = [];
  let cursor = null;
  let tituloDoProjeto = "";

  while (true) {
    const dados = await executarQueryGraphQL(QUERY_ITENS_DO_PROJETO, {
      ...REPOSITORIO_DO_GRUPO,
      numero: numeroDoProjeto,
      cursor,
    });

    const projeto = dados.repository?.projectV2;
    if (!projeto) {
      throw new Error(`Projeto numero ${numeroDoProjeto} nao encontrado no repositorio.`);
    }

    tituloDoProjeto = projeto.title;
    const pagina = projeto.items;
    itens.push(...(pagina.nodes ?? []));
    console.log(`Buscados: ${itens.length}/${pagina.totalCount} itens do board`);

    if (!pagina.pageInfo?.hasNextPage) break;
    cursor = pagina.pageInfo.endCursor;
    await esperar(PAUSA_ENTRE_PAGINAS_MS);
  }

  return { tituloDoProjeto, itens };
}

function converterItemEmLinha(item, { snapshotDate, sprint }) {
  const conteudo = item.content;
  const coluna = item.fieldValueByName?.name ?? SEM_COLUNA;

  // Cartao de rascunho: existe so no board, sem issue nem PR por tras.
  const ehRascunho = conteudo.__typename === "DraftIssue";

  return [
    snapshotDate,
    sprint,
    ehRascunho ? "" : conteudo.number,
    conteudo.title,
    ehRascunho ? "" : (conteudo.repository?.nameWithOwner ?? ""),
    ehRascunho ? "DRAFT" : conteudo.state,
    coluna,
    (conteudo.assignees?.nodes ?? []).map((pessoa) => pessoa.login).join(";"),
  ];
}

async function main() {
  carregarEnv();

  const sprint = process.argv[2];
  if (!sprint) {
    console.error("Informe a sprint. Ex.: npm run snapshot -- S02");
    console.error("Opcionalmente, o numero do projeto: npm run snapshot -- S02 1");
    process.exitCode = 1;
    return;
  }

  const numeroInformado = process.argv[3] === undefined ? undefined : Number(process.argv[3]);
  if (numeroInformado !== undefined && !Number.isInteger(numeroInformado)) {
    console.error(`Numero de projeto invalido: "${process.argv[3]}".`);
    process.exitCode = 1;
    return;
  }

  const snapshotDate = dataDeHoje();
  console.log(`Snapshot do board - sprint ${sprint}, data ${snapshotDate}\n`);

  const numeroDoProjeto = await descobrirNumeroDoProjeto(numeroInformado);
  const { tituloDoProjeto, itens } = await coletarItensDoProjeto(numeroDoProjeto);
  console.log(`\nProjeto: ${tituloDoProjeto} (numero ${numeroDoProjeto})\n`);

  const linhas = [];
  const colunas = [];
  for (const item of itens) {
    if (!item.content) {
      console.log("PULADO item sem conteudo acessivel (cartao removido ou sem permissao)");
      continue;
    }
    const linha = converterItemEmLinha(item, { snapshotDate, sprint });
    linhas.push(linha);
    colunas.push(linha[6]);

    const identificacao = linha[2] === "" ? "(rascunho)" : `#${linha[2]}`;
    console.log(`OK    ${identificacao.padEnd(12)} ${linha[6].padEnd(12)} ${linha[3]}`);
  }

  if (linhas.length === 0) {
    throw new Error("O board nao tem nenhum item para exportar.");
  }

  if (!existsSync(DIRETORIO_DE_SNAPSHOTS)) mkdirSync(DIRETORIO_DE_SNAPSHOTS, { recursive: true });

  const caminho = resolve(DIRETORIO_DE_SNAPSHOTS, `snapshot_${sprint}_${snapshotDate}.csv`);
  if (existsSync(caminho)) {
    console.log(`\nJa existia um snapshot desta sprint em ${snapshotDate}; sera sobrescrito.`);
  }
  writeFileSync(caminho, gerarCSV(CABECALHO_CSV, linhas), "utf8");

  console.log(`\nItens exportados: ${linhas.length}`);
  console.log("Contagem por coluna do board:");
  for (const [coluna, quantidade] of contarPorCategoria(colunas)) {
    console.log(`  ${coluna.padEnd(20)} ${quantidade}`);
  }
  console.log(`\nCSV gravado em: ${caminho}`);
}

main().catch((erro) => {
  // O escopo public_repo, suficiente para minerar repositorios, nao da acesso ao
  // Projects v2 - e o tropeco mais provavel na primeira execucao deste script.
  if (erro.message.includes("INSUFFICIENT_SCOPES") || erro.message.includes("read:project")) {
    console.error(
      "\n[ERRO] O token do GitHub nao tem permissao para ler o Projects (v2).\n" +
        "  O escopo public_repo, usado para minerar repositorios, nao basta aqui.\n" +
        "  Adicione o escopo read:project ao token:\n" +
        "    GitHub > Settings > Developer settings > Personal access tokens\n" +
        "    > Tokens (classic) > seu token > marque read:project > Update token\n" +
        "  Depois atualize o GITHUB_TOKEN no arquivo .env e rode de novo."
    );
    process.exitCode = 1;
    return;
  }
  console.error("\n[ERRO] " + erro.message);
  process.exitCode = 1;
});
