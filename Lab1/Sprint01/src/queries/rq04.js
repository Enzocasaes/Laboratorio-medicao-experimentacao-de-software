export const QUERY_RQ04 = `
  query RepositorioRQ04($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      updatedAt
    }
  }
`;
