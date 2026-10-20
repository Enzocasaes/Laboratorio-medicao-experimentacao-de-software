// Coleta das TAGS de um repositorio, para a variante C3 da RQ 07 (unidade de
// deploy = tag, e nao release publicada).
//
// O PROBLEMA DAS TAGS: `GET /repos/{owner}/{repo}/tags` devolve nome e commit,
// mas NAO devolve data (secao 4 do enunciado: "Tags nao trazem data: use a data
// do commit apontado pela tag"). Entao cada tag custa uma requisicao a mais,
// para buscar o commit.
//
// COMO O CUSTO E' CONTIDO:
//   1. Tag cujo nome ja e' de uma RELEASE coletada reaproveita a data dela -
//      zero requisicoes. Em repositorio que publica release para toda tag,
//      isso cobre quase tudo.
//   2. As demais sao buscadas da mais recente para a mais antiga (a ordem em
//      que a API lista), com teto configuravel por repositorio. Ao atingir o
//      teto, a coleta e' marcada como truncada, em vez de fingir que acabou.
//   3. Assim que `paradaPorIdade` tags seguidas caem ANTES do inicio da
//      janela, a coleta do repositorio para: tags mais antigas nao entram em
//      nenhuma metrica da janela.
//
// Respostas 4xx viram `erro` registravel, como nas demais coletas.

import { caminhoDoRepositorio } from "../github/caminhos.js";
import { estaNaJanela } from "../janela.js";
import { logSilencioso } from "../log.js";

export const TAGS_POR_PAGINA = 100;
export const MAX_PAGINAS_DE_TAGS = 10; // 1.000 tags por repositorio
export const MAX_COMMITS_DE_TAG = 150; // requisicoes de data por repositorio
export const PARADA_POR_IDADE = 10; // tags seguidas antes da janela -> para

function textoOuNulo(valor) {
  return typeof valor === "string" && valor !== "" ? valor : null;
}

export function ehItemDeTagValido(item) {
  return item !== null && typeof item === "object" && typeof item.name === "string" && item.name !== "";
}

// Item de GET /tags -> registro normalizado (ainda sem data).
export function criarTag(item) {
  return {
    tag_name: item.name,
    sha: textoOuNulo(item.commit?.sha),
    commit_date: null,
    date_source: null, // "release" | "commit" | null
    in_window: false,
  };
}

// Data do commit apontado pela tag. Usa committer.date (quando o commit entrou
// na historia), e nao author.date: para "deploy = tag", o que importa e' quando
// aquele ponto passou a existir no repositorio.
async function dataDoCommit(cliente, fullName, sha) {
  const resposta = await cliente.get(`${caminhoDoRepositorio(fullName)}/commits/${sha}`);
  if (resposta.status !== 200) return { data: null, erro: `commit_http_${resposta.status}` };
  const commit = resposta.corpo?.commit;
  const data = textoOuNulo(commit?.committer?.date) ?? textoOuNulo(commit?.author?.date);
  return { data, erro: data === null ? "commit_sem_data" : null };
}

async function listarTags(cliente, fullName, { porPagina, maxPaginas, log }) {
  const tags = [];
  let paginas = 0;
  let invalidos = 0;

  let resposta = await cliente.get(`${caminhoDoRepositorio(fullName)}/tags`, { per_page: porPagina });
  for (;;) {
    if (resposta.status !== 200) return { tags, paginas, invalidos, truncada: false, erro: `tags_http_${resposta.status}` };
    if (!Array.isArray(resposta.corpo)) return { tags, paginas, invalidos, truncada: false, erro: "tags_unexpected_response" };

    paginas += 1;
    for (const item of resposta.corpo) {
      if (!ehItemDeTagValido(item)) {
        invalidos += 1;
        log.aviso(`${fullName}: item de tag sem nome ignorado`);
        continue;
      }
      tags.push(criarTag(item));
    }

    if (!resposta.links.next) break;
    if (paginas >= maxPaginas) {
      log.aviso(`${fullName}: ${maxPaginas} paginas de tags lidas; listagem truncada`);
      return { tags, paginas, invalidos, truncada: true, erro: null };
    }
    resposta = await cliente.get(resposta.links.next);
  }

  return { tags, paginas, invalidos, truncada: false, erro: null };
}

// Coleta as tags e resolve a data de cada uma. `datasDeReleases` e' um mapa
// { tag_name: published_at } das releases ja coletadas do repositorio.
export async function coletarTags(
  cliente,
  fullName,
  janela,
  {
    datasDeReleases = new Map(),
    porPagina = TAGS_POR_PAGINA,
    maxPaginas = MAX_PAGINAS_DE_TAGS,
    maxCommits = MAX_COMMITS_DE_TAG,
    paradaPorIdade = PARADA_POR_IDADE,
    log = logSilencioso,
  } = {}
) {
  const listadas = await listarTags(cliente, fullName, { porPagina, maxPaginas, log });
  if (listadas.erro !== null) {
    return { tags: [], paginas: listadas.paginas, itensInvalidos: listadas.invalidos, commitsPedidos: 0, truncada: false, erro: listadas.erro };
  }

  let commitsPedidos = 0;
  let antigasSeguidas = 0;
  let truncada = listadas.truncada;
  const comData = [];

  for (const tag of listadas.tags) {
    const daRelease = datasDeReleases.get(tag.tag_name);
    if (daRelease) {
      tag.commit_date = daRelease;
      tag.date_source = "release"; // de graca: a release ja trouxe a data
    } else if (tag.sha === null) {
      tag.date_source = null;
    } else if (commitsPedidos >= maxCommits) {
      truncada = true;
      log.aviso(`${fullName}: teto de ${maxCommits} datas de commit atingido; tags restantes ficam sem data`);
      comData.push(tag);
      break;
    } else {
      commitsPedidos += 1;
      const { data } = await dataDoCommit(cliente, fullName, tag.sha);
      tag.commit_date = data;
      tag.date_source = data === null ? null : "commit";
    }

    tag.in_window = tag.commit_date !== null && estaNaJanela(tag.commit_date, janela);
    comData.push(tag);

    // Tags muito antigas nao entram em nenhuma metrica: assim que varias
    // seguidas caem antes da janela, parar economiza o resto do historico.
    if (tag.commit_date !== null && Date.parse(tag.commit_date) < janela.inicioMs) {
      antigasSeguidas += 1;
      if (antigasSeguidas >= paradaPorIdade) break;
    } else {
      antigasSeguidas = 0;
    }
  }

  return {
    tags: comData,
    paginas: listadas.paginas,
    itensInvalidos: listadas.invalidos,
    commitsPedidos,
    truncada,
    erro: null,
  };
}
