// Commits incluidos numa release, pela comparacao com a release anterior
// (GET /repos/{owner}/{repo}/compare/{base}...{head}).
//
// Sem parametro de paginacao o endpoint devolve no maximo 250 commits
// (enunciado, secao 4), por isso a leitura sempre usa per_page/page e segue o
// rel="next" do cabecalho Link. `total_commits` da resposta diz o tamanho real
// da comparacao, o que permite detectar truncamento sem adivinhar.
//
// Comparacoes enormes (merge de um branch de anos, importacao de historico)
// custariam dezenas de paginas por release, entao ha um teto de commits
// (`maxCommits`). Ao atingi-lo a release e' marcada como `truncada`: ela sai da
// variante (b) do lead time, mas PERMANECE na variante (a), porque o compare
// devolve os commits em ordem cronologica crescente e o commit mais antigo -
// o unico que a variante (a) usa - esta na primeira pagina.
//
// Respostas 4xx viram `erro` registravel: tag apagada depois da release vira
// 404, e comparacao invalida vira 422. Nenhuma das duas derruba a coleta.

import { baseHead, caminhoDoRepositorio } from "../github/caminhos.js";
import { logSilencioso } from "../log.js";

export const COMMITS_POR_PAGINA = 100; // maximo aceito pela API
export const MAX_COMMITS_POR_RELEASE = 1000;

// Item de `commits` -> { sha, data }. data = commit.author.date (secao 3 do
// enunciado: quando a mudanca foi escrita), nao committer.date.
function criarCommit(item) {
  return {
    sha: typeof item?.sha === "string" ? item.sha : null,
    data: typeof item?.commit?.author?.date === "string" ? item.commit.author.date : null,
  };
}

export async function coletarCommitsEntreReleases(
  cliente,
  fullName,
  tagBase,
  tagHead,
  { porPagina = COMMITS_POR_PAGINA, maxCommits = MAX_COMMITS_POR_RELEASE, log = logSilencioso } = {}
) {
  const commits = [];
  let total = null;
  let paginas = 0;
  let truncada = false;

  const caminho = `${caminhoDoRepositorio(fullName)}/compare/${baseHead(tagBase, tagHead)}`;
  let resposta = await cliente.get(caminho, { per_page: porPagina });

  for (;;) {
    if (resposta.status !== 200) {
      return { commits, total, paginas, truncada, erro: `compare_http_${resposta.status}` };
    }
    if (!Array.isArray(resposta.corpo?.commits)) {
      return { commits, total, paginas, truncada, erro: "compare_unexpected_response" };
    }

    paginas += 1;
    if (total === null && Number.isInteger(resposta.corpo.total_commits)) total = resposta.corpo.total_commits;
    for (const item of resposta.corpo.commits) commits.push(criarCommit(item));

    if (commits.length >= maxCommits) {
      truncada = true;
      log.aviso(`${fullName} ${tagBase}...${tagHead}: ${commits.length} commits lidos (teto ${maxCommits}); comparacao truncada`);
      break;
    }
    if (!resposta.links.next) break;
    resposta = await cliente.get(resposta.links.next);
  }

  // A API disse que a comparacao tem mais commits do que conseguimos ler
  // (teto, ou paginacao que terminou antes): registra, nao esconde.
  if (Number.isInteger(total) && commits.length < total) truncada = true;

  return { commits, total: total ?? commits.length, paginas, truncada, erro: null };
}
