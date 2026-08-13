/**
 * Busca automatica dos repositorios com mais estrelas do GitHub, via o campo
 * "search" da API GraphQL - sem precisar de uma lista de nomes escrita a mao.
 *
 * ---------------------------------------------------------------------------
 * COMO A BUSCA FUNCIONA
 * ---------------------------------------------------------------------------
 *
 *   search(query: "...", type: REPOSITORY, first: N, after: cursor)
 *
 *   query        -> string na MESMA sintaxe da busca do site github.com/search.
 *                   "stars:>1 sort:stars-desc" pede repositorios com mais de
 *                   1 estrela, ja ordenados da maior quantidade de estrelas
 *                   para a menor. Nao ha um campo separado de "ordenar por
 *                   estrelas": a ordenacao faz parte do texto da busca.
 *
 *   type         -> o campo "search" e generico (pode buscar repositorios,
 *                   issues, pull requests, usuarios...). REPOSITORY restringe
 *                   o resultado a repositorios.
 *
 *   first        -> quantos resultados trazer nesta chamada. O GitHub limita
 *                   a no maximo 100 por chamada.
 *
 *   after        -> cursor de paginacao (ver "PAGINACAO" abaixo). Na primeira
 *                   chamada e enviado como null.
 *
 * ---------------------------------------------------------------------------
 * CAMPOS PEDIDOS NA RESPOSTA
 * ---------------------------------------------------------------------------
 *
 *   repositoryCount        -> quantos repositorios no total casam com a busca
 *                              (nao apenas os desta pagina).
 *
 *   pageInfo.hasNextPage   -> se existe uma proxima pagina de resultados.
 *   pageInfo.endCursor     -> o "cursor" a usar em "after" para pedir a
 *                              proxima pagina. Estes dois campos ainda nao sao
 *                              usados em loop nesta etapa (isso e paginacao,
 *                              tarefa da Lab01S02) - por enquanto so mostramos
 *                              o valor, para deixar claro que ele existe.
 *
 *   nodes                  -> a lista de repositorios encontrados. Como
 *                              "search" pode devolver tipos diferentes
 *                              (Repository, Issue, User...), e obrigatorio
 *                              usar o fragmento "... on Repository" para
 *                              acessar campos especificos de repositorio.
 *                              Dentro dele pedimos os MESMOS campos da RQ01
 *                              (ver src/queries/rq01.js): name, nameWithOwner
 *                              e createdAt.
 */
export const QUERY_BUSCAR_POPULARES = `
  query BuscarRepositoriosPopulares($quantidade: Int!, $cursor: String) {
    search(query: "stars:>1 sort:stars-desc", type: REPOSITORY, first: $quantidade, after: $cursor) {
      repositoryCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Repository {
          name
          nameWithOwner
          createdAt
          updatedAt
          primaryLanguage {
            name
          }
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
      }
    }
  }
`;
