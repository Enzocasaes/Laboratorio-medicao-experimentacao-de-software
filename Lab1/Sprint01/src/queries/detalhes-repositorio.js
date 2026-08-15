export function construirQueryDetalhesDosRepositorios(quantidade) {
  const declaracoesDeVariaveis = [];
  const camposPorRepositorio = [];

  for (let indice = 0; indice < quantidade; indice += 1) {
    declaracoesDeVariaveis.push(`$owner${indice}: String!, $name${indice}: String!`);
    camposPorRepositorio.push(`
      r${indice}: repository(owner: $owner${indice}, name: $name${indice}) {
        releases {
          totalCount
        }
        pullRequests(states: MERGED) {
          totalCount
        }
        issuesTotal: issues {
          totalCount
        }
        issuesFechadas: issues(states: CLOSED) {
          totalCount
        }
      }
    `);
  }

  return `
    query DetalhesDosRepositorios(${declaracoesDeVariaveis.join(", ")}) {
      ${camposPorRepositorio.join("\n")}
    }
  `;
}
