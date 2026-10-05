// Leitura do cabecalho Link da paginacao REST do GitHub:
//   <https://api.github.com/...&page=2>; rel="next", <https://...&page=34>; rel="last"
// https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api

// Devolve { next, last, prev, first } com as URLs presentes (ausente -> nao aparece).
export function interpretarLink(cabecalho) {
  const rels = {};
  if (typeof cabecalho !== "string" || cabecalho.trim() === "") return rels;
  for (const parte of cabecalho.split(",")) {
    const encontrado = parte.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (!encontrado) continue;
    const [, url, nomes] = encontrado;
    for (const rel of nomes.split(/\s+/)) rels[rel] = url;
  }
  return rels;
}

// Numero do parametro "page" de uma URL de paginacao, ou null.
export function numeroDaPagina(url) {
  if (typeof url !== "string") return null;
  try {
    const pagina = Number(new URL(url).searchParams.get("page"));
    return Number.isInteger(pagina) && pagina > 0 ? pagina : null;
  } catch {
    return null;
  }
}
