/**
 * RQ05 - "Sistemas populares sao escritos nas linguagens mais populares?"
 * Metrica: linguagem primaria de cada repositorio.
 *
 * Este arquivo contem APENAS o texto da consulta GraphQL. Ele nao faz
 * requisicao nenhuma: quem envia a query para o GitHub e o modulo src/github.js
 * (mesmo padrao de src/queries/rq02.js).
 *
 * ---------------------------------------------------------------------------
 * O QUE E "LINGUAGEM PRIMARIA" E QUAL A REFERENCIA DE "MAIS POPULARES"
 * ---------------------------------------------------------------------------
 * O GitHub detecta automaticamente as linguagens de um repositorio (via a
 * biblioteca Linguist) e elege como "primaria" aquela com maior volume de
 * codigo. Esse dado vem pronto no campo "primaryLanguage".
 *
 * O enunciado exige DEFINIR e REFERENCIAR explicitamente a fonte usada para
 * "linguagens mais populares", mantendo a MESMA referencia por todo o
 * laboratorio. A fonte escolhida pelo grupo e o **GitHub Octoverse** (relatorio
 * anual "State of the Octoverse", https://octoverse.github.com), por ser a
 * mesma plataforma que estamos minerando. A discussao dos resultados compara a
 * linguagem primaria observada aqui com o ranking de linguagens desse relatorio.
 *
 * ---------------------------------------------------------------------------
 * CAMPOS PEDIDOS NA CONSULTA
 * ---------------------------------------------------------------------------
 *
 *   name          -> nome do repositorio, sem o dono. Ex.: "react"
 *
 *   nameWithOwner -> nome completo "dono/repositorio", usado na saida e no CSV
 *                    (mesmo motivo do rq02.js: "react" sozinho e ambiguo).
 *
 *   primaryLanguage { name } -> a linguagem primaria detectada pelo GitHub.
 *                    Pode vir NULL quando o repositorio nao tem codigo com
 *                    linguagem reconhecida (ex.: so documentacao/markdown) -
 *                    esse caso e tratado no script testar-rq05.js.
 *
 * ---------------------------------------------------------------------------
 * VARIAVEIS GRAPHQL
 * ---------------------------------------------------------------------------
 * Assim como em rq02.js, a query declara "$owner" e "$name" (String!,
 * obrigatorias), enviadas via "variables" no corpo JSON da requisicao - o que
 * permite reaproveitar a mesma query para qualquer repositorio.
 */
export const QUERY_RQ05 = `
  query RepositorioRQ05($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      nameWithOwner
      primaryLanguage {
        name
      }
    }
  }
`;
