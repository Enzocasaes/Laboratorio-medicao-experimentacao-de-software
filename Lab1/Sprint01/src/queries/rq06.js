/**
 * RQ06 - "Sistemas populares possuem um alto percentual de issues fechadas?"
 * Metrica: razao entre issues fechadas e total de issues.
 *
 * Este arquivo contem APENAS o texto da consulta GraphQL. Ele nao faz
 * requisicao nenhuma: quem envia a query para o GitHub e o modulo src/github.js
 * (mesmo padrao de src/queries/rq02.js).
 *
 * ---------------------------------------------------------------------------
 * COMO A RAZAO E OBTIDA
 * ---------------------------------------------------------------------------
 * A razao pedida no enunciado e (issues fechadas) / (total de issues). Os dois
 * numeros vem prontos do GitHub como "totalCount" da conexao "issues" - nao ha
 * paginacao das issues individuais, so importa a contagem.
 *
 * Como precisamos da MESMA conexao "issues" com dois filtros diferentes na
 * mesma consulta, usamos ALIAS do GraphQL para nomear cada uma:
 *
 *   issuesTotal    -> issues sem filtro de estado = TODAS as issues
 *                     (abertas + fechadas). No enum IssueState os estados sao
 *                     apenas OPEN e CLOSED, entao "sem filtro" cobre o total.
 *
 *   issuesFechadas -> issues(states: CLOSED) = apenas as fechadas. O filtro e
 *                     feito no SERVIDOR do GitHub, entao ja vem so a contagem
 *                     que interessa.
 *
 * O calculo da razao (e o cuidado com repositorios de 0 issues, para nao
 * dividir por zero) fica no script testar-rq06.js.
 *
 * ---------------------------------------------------------------------------
 * VARIAVEIS GRAPHQL
 * ---------------------------------------------------------------------------
 * Assim como em rq02.js, a query declara "$owner" e "$name" (String!,
 * obrigatorias), enviadas via "variables" no corpo JSON da requisicao.
 */
export const QUERY_RQ06 = `
  query RepositorioRQ06($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      nameWithOwner
      issuesTotal: issues {
        totalCount
      }
      issuesFechadas: issues(states: CLOSED) {
        totalCount
      }
    }
  }
`;
