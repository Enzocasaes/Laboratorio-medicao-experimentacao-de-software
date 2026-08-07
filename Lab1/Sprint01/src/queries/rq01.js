/**
 * RQ01 - "Sistemas populares sao maduros/antigos?"
 * Metrica: idade do repositorio, calculada a partir da data de criacao.
 *
 * Este arquivo contem APENAS o texto da consulta GraphQL. Ele nao faz
 * requisicao nenhuma: quem envia a query para o GitHub e o modulo src/github.js.
 *
 * ---------------------------------------------------------------------------
 * CAMPOS PEDIDOS NA CONSULTA (todos existem no tipo "Repository" da API v4)
 * ---------------------------------------------------------------------------
 *
 *   name          -> nome do repositorio, sem o dono. Ex.: "react"
 *
 *   nameWithOwner -> nome completo, no formato "dono/repositorio".
 *                    Ex.: "facebook/react". E o identificador que usamos na
 *                    saida do programa, pois "react" sozinho seria ambiguo.
 *
 *   createdAt     -> data/hora em que o repositorio foi criado no GitHub.
 *                    Tipo GraphQL "DateTime": string ISO 8601 em UTC,
 *                    no formato "2013-05-24T16:15:54Z".
 *                    ESTE e o unico dado necessario para a RQ01. A API NAO
 *                    devolve a idade pronta - o calculo e feito no JavaScript
 *                    (ver src/index.js).
 *
 * Nenhum campo das RQ02..RQ06 (pull requests, releases, pushedAt, linguagem,
 * issues) e solicitado aqui: a consulta pede so o minimo da RQ01.
 *
 * ---------------------------------------------------------------------------
 * VARIAVEIS GRAPHQL
 * ---------------------------------------------------------------------------
 * A query declara duas variaveis, "$owner" e "$name", ambas do tipo String!
 * (o "!" significa obrigatorio). Os valores sao enviados separadamente, no
 * campo "variables" do corpo JSON da requisicao. Isso e melhor do que montar
 * a string da query com concatenacao, porque evita erros de escape e permite
 * reaproveitar a MESMA query para qualquer repositorio.
 */
export const QUERY_RQ01 = `
  query RepositorioRQ01($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      nameWithOwner
      createdAt
    }
  }
`;
