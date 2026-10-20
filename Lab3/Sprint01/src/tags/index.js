// Etapa "tags" do pipeline (Pessoa C, S03): coleta as tags dos repositorios da
// AMOSTRA FINAL, com a data do commit de cada uma, para a variante C3 da
// RQ 07 (unidade de deploy = tag).
//
// So' roda na amostra final (300 repositorios), e nao nos 703 do funil: a
// RQ 07 compara combinacoes de definicoes SOBRE A MESMA amostra.
//
// Saidas (em <diretorios.saida>):
//   processed/tags.csv       uma linha por tag coletada
//   processed/tags_resumo.csv uma linha por repositorio (contagens e custo)
//   raw/tags.json            relato por repositorio, para auditoria

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV, lerCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { coletarTags } from "./coleta.js";

export const COLUNAS_TAGS = Object.freeze([
  "full_name",
  "tag_name",
  "sha",
  "commit_date",
  "date_source",
  "in_window",
]);

export const COLUNAS_RESUMO = Object.freeze([
  "full_name",
  "rank",
  "tags_total",
  "tags_in_window",
  "tags_sem_data",
  "datas_de_release",
  "datas_de_commit",
  "commits_pedidos",
  "pages",
  "truncated",
  "error",
]);

export function caminhosDeSaida(dirSaida) {
  return {
    tags: join(dirSaida, "processed", "tags.csv"),
    resumo: join(dirSaida, "processed", "tags_resumo.csv"),
    json: join(dirSaida, "raw", "tags.json"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

function registrosDeCSV(caminho) {
  if (!existsSync(caminho)) return [];
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((c, i) => [c, linha[i]])));
}

// Repositorios da amostra final, em ordem de rank.
export function repositoriosDaAmostra(dirSaida) {
  const caminho = join(dirSaida, "processed", "dataset.csv");
  if (!existsSync(caminho)) {
    throw new Error(`Nao ha ${caminho}: rode antes a etapa "dataset" (npm run dataset).`);
  }
  return registrosDeCSV(caminho).sort((a, b) => Number(a.rank) - Number(b.rank));
}

// { full_name -> Map(tag_name -> published_at) } das releases ja coletadas:
// toda tag que ja e' release nao custa requisicao nenhuma.
export function datasDeReleasesPorRepositorio(dirSaida) {
  const porRepositorio = new Map();
  for (const r of registrosDeCSV(join(dirSaida, "processed", "releases.csv"))) {
    if (!r.tag_name || !r.published_at) continue;
    if (!porRepositorio.has(r.full_name)) porRepositorio.set(r.full_name, new Map());
    porRepositorio.get(r.full_name).set(r.tag_name, r.published_at);
  }
  return porRepositorio;
}

export async function executarTags({ config, cliente, log = logSilencioso, limite = null, agora = () => new Date() }) {
  const { janela, coleta, diretorios } = config;
  const todos = repositoriosDaAmostra(diretorios.saida);
  const registros = limite ? todos.slice(0, limite) : todos;
  const datasDeReleases = datasDeReleasesPorRepositorio(diretorios.saida);

  log.info(`${registros.length} repositorios da amostra final para coletar tags${limite ? ` (--limite ${limite})` : ""}`);

  const linhasDeTags = [];
  const resumos = [];
  let comErro = 0;
  let commitsTotais = 0;

  for (const [indice, registro] of registros.entries()) {
    const prefixo = `[${indice + 1}/${registros.length}] ${registro.full_name}`;
    const coletado = await coletarTags(cliente, registro.full_name, janela, {
      datasDeReleases: datasDeReleases.get(registro.full_name) ?? new Map(),
      porPagina: coleta.tagsPorPagina,
      maxPaginas: coleta.maxPaginasDeTags,
      maxCommits: coleta.maxCommitsDeTag,
      log,
    });

    for (const tag of coletado.tags) {
      linhasDeTags.push(COLUNAS_TAGS.map((coluna) => (coluna === "full_name" ? registro.full_name : tag[coluna])));
    }

    const naJanela = coletado.tags.filter((t) => t.in_window).length;
    const semData = coletado.tags.filter((t) => t.commit_date === null).length;
    const deRelease = coletado.tags.filter((t) => t.date_source === "release").length;
    const deCommit = coletado.tags.filter((t) => t.date_source === "commit").length;
    commitsTotais += coletado.commitsPedidos;

    resumos.push({
      full_name: registro.full_name,
      rank: registro.rank,
      tags_total: coletado.tags.length,
      tags_in_window: naJanela,
      tags_sem_data: semData,
      datas_de_release: deRelease,
      datas_de_commit: deCommit,
      commits_pedidos: coletado.commitsPedidos,
      pages: coletado.paginas,
      truncated: coletado.truncada ? 1 : 0,
      error: coletado.erro,
    });

    if (coletado.erro !== null) {
      comErro += 1;
      log.aviso(`${prefixo}: tags indisponiveis (${coletado.erro})`);
      continue;
    }
    log.info(
      `${prefixo}: ${coletado.tags.length} tags (${naJanela} na janela), ` +
        `${deRelease} com data de release, ${coletado.commitsPedidos} requisicoes de commit` +
        (coletado.truncada ? " [truncada]" : "")
    );
  }

  const caminhos = caminhosDeSaida(diretorios.saida);
  escrever(caminhos.tags, gerarCSV(COLUNAS_TAGS, linhasDeTags));
  escrever(caminhos.resumo, gerarCSV(COLUNAS_RESUMO, resumos.map((r) => COLUNAS_RESUMO.map((c) => r[c] ?? ""))));
  escrever(
    caminhos.json,
    JSON.stringify(
      {
        generated_at: agora().toISOString(),
        observation_window: { start: janela.inicio, end: janela.fim, days: janela.dias },
        coleta,
        limite,
        definicoes: {
          unidade: "tag do repositorio (variante C3 da RQ 07)",
          data_da_tag:
            "published_at da release de mesmo nome, quando existe; senao committer.date do commit apontado pela tag",
          teto: "maxCommitsDeTag requisicoes de data por repositorio; o excedente fica sem data e marca truncated",
        },
        repositorios: resumos,
      },
      null,
      2
    ) + "\n"
  );

  const naJanela = resumos.reduce((total, r) => total + r.tags_in_window, 0);
  const truncados = resumos.filter((r) => r.truncated === 1).length;
  log.info(
    `etapa concluida: ${linhasDeTags.length} tags coletadas, ${naJanela} na janela, ` +
      `${commitsTotais} requisicoes de data de commit, ${truncados} repositorios truncados, ${comErro} com erro`
  );
  log.info(`saidas: ${caminhos.tags}, ${caminhos.resumo}, ${caminhos.json}`);
  return { resumos, tags: linhasDeTags.length, commitsTotais };
}
