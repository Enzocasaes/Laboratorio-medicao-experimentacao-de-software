export const QUERY_RQ03 = `
  query RepositorioRQ03($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      releases { totalCount }
    }
  }
`;
