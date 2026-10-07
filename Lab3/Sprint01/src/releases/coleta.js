// Coleta das releases de um repositorio (GET /repos/{owner}/{repo}/releases).
//
// Quantas paginas ler? Nao basta parar no inicio da janela: o lead time da
// release mais antiga DA JANELA precisa da release ANTERIOR a ela, que quase
// sempre esta fora da janela (RQ 02). Entao a paginacao segue ate encontrar a
// primeira deploy release publicada ANTES do inicio da janela - esse e' o
// predecessor que falta - ou ate a ultima pagina.
//
// Repositorios muito antigos tem centenas de releases, todas depois do
// predecessor que interessa; por isso ha um teto de paginas (`maxPaginas`).
// Quando ele e' atingido sem predecessor, a coleta e' marcada como truncada em
// vez de fingir que a lista acabou.
//
// Respostas 4xx viram `erro` (texto registravel), nunca excecao - o mesmo
// padrao de src/selecao/verificacoes.js. Falhas de rede e 5xx persistentes
// sobem como ErroGitHub, lancadas pelo cliente, e a execucao e' retomada pelo
// cache.

import { caminhoDoRepositorio } from "../github/caminhos.js";
import { logSilencioso } from "../log.js";
import { criarRelease, ehItemDeReleaseValido } from "./modelo.js";

export const RELEASES_POR_PAGINA = 100; // maximo aceito pela API
export const MAX_PAGINAS_DE_RELEASES = 20; // 2.000 releases por repositorio

function temPredecessor(releases, janela) {
  return releases.some((r) => r.is_deploy && Date.parse(r.published_at) < janela.inicioMs);
}

export async function coletarReleases(
  cliente,
  fullName,
  janela,
  { porPagina = RELEASES_POR_PAGINA, maxPaginas = MAX_PAGINAS_DE_RELEASES, log = logSilencioso } = {}
) {
  const releases = [];
  let paginas = 0;
  let itensInvalidos = 0;

  const vazio = (erro) => ({
    releases,
    paginas,
    itensInvalidos,
    truncada: false,
    temPredecessor: false,
    erro,
  });

  let resposta = await cliente.get(`${caminhoDoRepositorio(fullName)}/releases`, { per_page: porPagina });
  for (;;) {
    if (resposta.status !== 200) return vazio(`releases_http_${resposta.status}`);
    if (!Array.isArray(resposta.corpo)) return vazio("releases_unexpected_response");

    paginas += 1;
    for (const item of resposta.corpo) {
      if (!ehItemDeReleaseValido(item)) {
        itensInvalidos += 1;
        log.aviso(`${fullName}: item de release sem id ignorado`);
        continue;
      }
      releases.push(criarRelease(item, janela));
    }

    if (temPredecessor(releases, janela)) break;
    if (!resposta.links.next) break;
    if (paginas >= maxPaginas) {
      log.aviso(`${fullName}: ${maxPaginas} paginas de releases lidas sem alcancar o inicio da janela; coleta truncada`);
      return { releases, paginas, itensInvalidos, truncada: true, temPredecessor: false, erro: null };
    }
    resposta = await cliente.get(resposta.links.next);
  }

  return {
    releases,
    paginas,
    itensInvalidos,
    truncada: false,
    temPredecessor: temPredecessor(releases, janela),
    erro: null,
  };
}
