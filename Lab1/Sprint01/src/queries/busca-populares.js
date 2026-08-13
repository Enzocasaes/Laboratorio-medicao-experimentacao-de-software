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
