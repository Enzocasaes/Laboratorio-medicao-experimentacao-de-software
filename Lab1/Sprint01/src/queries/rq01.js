export const QUERY_RQ01 = `
  query RepositorioRQ01($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      nameWithOwner
      createdAt
    }
  }
`;
