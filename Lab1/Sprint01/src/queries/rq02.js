/**
 * RQ02 - "Sistemas populares recebem muita contribuicao externa?"
 * Metrica: total de Pull Requests aceitas.
 *
 * Este arquivo contem APENAS o texto da consulta GraphQL. Ele nao faz
 * requisicao nenhuma: quem envia a query para o GitHub e o modulo src/github.js
 * (mesmo padrao de src/queries/rq01.js).
 *
 * ---------------------------------------------------------------------------
 * O QUE SIGNIFICA "PULL REQUEST ACEITA" NESTE TRABALHO
 * ---------------------------------------------------------------------------
 * O enunciado define a metrica como "total de Pull Requests aceitas" e a
 * operacionaliza como PRs cujo estado e MERGED. No GraphQL do GitHub, o campo
 * "state" de uma Pull Request assume um dos tres valores do enum
 * PullRequestState: OPEN, CLOSED ou MERGED. Uma PR fechada sem merge (CLOSED)
 * foi rejeitada/abandonada, nao aceita - por isso so contamos MERGED.
 *
 * ---------------------------------------------------------------------------
 * CAMPOS PEDIDOS NA CONSULTA
 * ---------------------------------------------------------------------------
 *
 *   name          -> nome do repositorio, sem o dono. Ex.: "react"
 *
 *   nameWithOwner -> nome completo "dono/repositorio", usado na saida e no CSV
 *                    (mesmo motivo do rq01.js: "react" sozinho e ambiguo).
 *
 *   pullRequests(states: MERGED) -> a CONEXAO de Pull Requests do repositorio,
 *                    filtrada pelo argumento "states" para trazer somente as
 *                    que estao com state = MERGED. O filtro e feito no
 *                    SERVIDOR do GitHub, entao a API ja devolve apenas a
 *                    contagem das PRs que interessam.
 *
 *   totalCount    -> quantidade total de itens que casam com a conexao acima,
 *                    contada pelo proprio GitHub. Ele NAO exige buscar os nos
 *                    (a lista de PRs em si) - basta pedir "totalCount" dentro
 *                    da conexao para obter o numero pronto, em uma unica
 *                    requisicao, sem paginacao. Por isso esta consulta NAO
 *                    pede "nodes" nem "edges" de pullRequests: nesta RQ so
 *                    importa a quantidade, nao os dados de cada PR individual.
 *
 * ---------------------------------------------------------------------------
 * USO POSTERIOR (coleta dos 100 repositorios)
 * ---------------------------------------------------------------------------
 * Quando a coleta oficial reunir todas as RQs em uma unica query (ver
 * README), o campo "pullRequests(states: MERGED) { totalCount }" pode ser
 * simplesmente acrescentado dentro do mesmo bloco "repository { ... }" usado
 * pela RQ01, sem precisar de uma segunda requisicao por repositorio.
 *
 * ---------------------------------------------------------------------------
 * VARIAVEIS GRAPHQL
 * ---------------------------------------------------------------------------
 * Assim como em rq01.js, a query declara "$owner" e "$name" (String!,
 * obrigatorias), enviadas via "variables" no corpo JSON da requisicao - o que
 * permite reaproveitar a mesma query para qualquer repositorio.
 */
export const QUERY_RQ02 = `
  query RepositorioRQ02($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      nameWithOwner
      pullRequests(states: MERGED) {
        totalCount
      }
    }
  }
`;
