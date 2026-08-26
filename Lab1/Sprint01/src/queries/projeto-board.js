export const QUERY_PROJETOS_DO_REPOSITORIO = `
  query ProjetosDoRepositorio($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      projectsV2(first: 10) {
        nodes {
          number
          title
        }
      }
    }
  }
`;

export const QUERY_ITENS_DO_PROJETO = `
  query ItensDoProjeto($owner: String!, $name: String!, $numero: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      projectV2(number: $numero) {
        title
        items(first: 100, after: $cursor) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
            content {
              __typename
              ... on Issue {
                number
                title
                state
                repository {
                  nameWithOwner
                }
                assignees(first: 10) {
                  nodes {
                    login
                  }
                }
              }
              ... on PullRequest {
                number
                title
                state
                repository {
                  nameWithOwner
                }
                assignees(first: 10) {
                  nodes {
                    login
                  }
                }
              }
              ... on DraftIssue {
                title
              }
            }
          }
        }
      }
    }
  }
`;
