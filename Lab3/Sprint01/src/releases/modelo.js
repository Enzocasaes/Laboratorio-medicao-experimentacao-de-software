// Modelo de uma release do GitHub, na definicao operacional da secao 3 do
// enunciado.
//
// DEPLOY (unidade de entrega) = release PUBLICADA:
//   draft = false, prerelease = false e published_at preenchido.
// Pre-releases e rascunhos ficam FORA da definicao principal; eles continuam
// no CSV, classificados, porque a variante C2 da RQ 07 ("release +
// pre-release") precisa deles sem uma nova coleta.
//
// Os nomes dos campos sao os mesmos da API, em snake_case, como no modelo da
// selecao (src/selecao/modelo.js).

import { estaNaJanela } from "../janela.js";

export const COLUNAS_RELEASES = Object.freeze([
  "full_name",
  "release_id",
  "tag_name",
  "name",
  "draft",
  "prerelease",
  "published_at",
  "created_at",
  "target_commitish",
  "html_url",
  "in_window",
  "is_deploy",
  "deploy_index",
]);

// Um item de GET /releases so' serve se identificar a release sem ambiguidade.
export function ehItemDeReleaseValido(item) {
  return item !== null && typeof item === "object" && Number.isInteger(item.id);
}

// Release publicada (ver o cabecalho). Recebe o registro ja normalizado.
export function ehDeployRelease(release) {
  return release.draft === false && release.prerelease === false && release.published_at !== null;
}

// Item de GET /repos/{owner}/{repo}/releases -> registro normalizado.
// draft/prerelease ausentes contam como false: a API sempre envia os dois, e
// tratar a ausencia como "rascunho" descartaria release boa por engano.
export function criarRelease(item, janela) {
  const publicadaEm = typeof item.published_at === "string" && item.published_at !== "" ? item.published_at : null;
  const release = {
    release_id: item.id,
    tag_name: typeof item.tag_name === "string" && item.tag_name !== "" ? item.tag_name : null,
    name: item.name ?? null,
    draft: item.draft === true,
    prerelease: item.prerelease === true,
    published_at: publicadaEm,
    created_at: item.created_at ?? null,
    target_commitish: item.target_commitish ?? null,
    html_url: item.html_url ?? null,
  };
  release.is_deploy = ehDeployRelease(release);
  release.in_window = publicadaEm !== null && estaNaJanela(publicadaEm, janela);
  // Posicao na sequencia de deploys do repositorio; preenchida por
  // sequenciaDeDeploys() (src/releases/leadtime.js). null para quem nao e' deploy.
  release.deploy_index = null;
  return release;
}

// Contagens por repositorio. `releases_in_window` e' a que alimenta o critario
// minimo de 5 releases do funil (src/selecao/funil.js); as outras existem para
// as variantes da RQ 07 e para o relato de quantas releases foram vistas.
export function contarReleases(releases) {
  const contagens = {
    releases_total: releases.length,
    releases_in_window: 0,
    prereleases_in_window: 0,
    published_releases_in_window: 0,
    drafts_total: 0,
  };
  for (const release of releases) {
    if (release.draft) contagens.drafts_total += 1;
    if (!release.in_window) continue;
    if (release.is_deploy) contagens.releases_in_window += 1;
    else if (release.prerelease && !release.draft) contagens.prereleases_in_window += 1;
  }
  contagens.published_releases_in_window = contagens.releases_in_window + contagens.prereleases_in_window;
  return contagens;
}

export function paraLinhaReleaseCSV(fullName, release) {
  return COLUNAS_RELEASES.map((coluna) => (coluna === "full_name" ? fullName : release[coluna]));
}
