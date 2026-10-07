// Montagem dos caminhos da API que dependem do nome do repositorio.
//
// "owner/name" vem da busca e pode conter caracteres que precisam de escape na
// URL (pontos, sinais de mais, til). Centralizar aqui garante que a selecao
// (A), as releases (B) e os workflow runs (C) escapem do mesmo jeito - e que a
// chave do cache de um repositorio seja sempre a mesma.

export function caminhoDoRepositorio(fullName) {
  const [dono, nome] = fullName.split("/");
  return `/repos/${encodeURIComponent(dono)}/${encodeURIComponent(nome)}`;
}

// basehead do endpoint compare: "{base}...{head}", com cada ref escapada.
// Tags podem conter barra ("release/1.2"), que precisa virar %2F para nao
// mudar o caminho da URL. Os tres pontos ficam literais, como a API exige.
export function baseHead(tagBase, tagHead) {
  return `${encodeURIComponent(tagBase)}...${encodeURIComponent(tagHead)}`;
}
