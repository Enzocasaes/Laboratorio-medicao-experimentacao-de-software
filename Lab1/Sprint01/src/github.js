/**
 * Comunicacao HTTP com a API GraphQL do GitHub.
 *
 * Nenhuma biblioteca externa e usada aqui: nem Octokit, nem axios, nem
 * node-fetch. A requisicao e feita com a funcao "fetch", que e nativa do
 * Node.js a partir da versao 18.
 *
 * Diferenca importante em relacao a API REST: na API GraphQL o GitHub expoe
 * UM UNICO endpoint (https://api.github.com/graphql) e ele responde SEMPRE a
 * requisicoes POST. Nao existe "/repos/facebook/react" na URL - o que se quer
 * buscar vai descrito na query, dentro do corpo da requisicao.
 */

/** Unico endereco da API GraphQL do GitHub. */
const URL_API_GRAPHQL = "https://api.github.com/graphql";

/**
 * Envia uma query GraphQL para o GitHub e devolve o objeto "data" da resposta.
 *
 * @param {string} query     Texto da consulta GraphQL (ver src/queries/).
 * @param {object} variaveis Valores das variaveis declaradas na query.
 * @returns {Promise<object>} O conteudo do campo "data" do JSON de resposta.
 * @throws {Error} Com mensagem explicativa em qualquer falha.
 */
export async function executarQueryGraphQL(query, variaveis = {}) {
  // ------------------------------------------------------------------
  // 1) Token de autenticacao
  // ------------------------------------------------------------------
  // O token e lido de process.env (carregado do .env por src/env.js).
  // A API GraphQL do GitHub NAO aceita requisicoes anonimas: sem token a
  // resposta e sempre 401.
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error(
      "Token do GitHub ausente.\n" +
        "  Crie o arquivo .env na raiz do projeto (pode copiar o .env.example)\n" +
        "  e preencha a linha: GITHUB_TOKEN=seu_token_aqui\n" +
        "  Gere o token em: GitHub > Settings > Developer settings >\n" +
        "  Personal access tokens > Tokens (classic)."
    );
  }

  // ------------------------------------------------------------------
  // 2) Corpo da requisicao
  // ------------------------------------------------------------------
  // O corpo e um JSON com dois campos: "query" (o texto da consulta) e
  // "variables" (os valores das variaveis declaradas na consulta).
  const corpoDaRequisicao = JSON.stringify({ query, variables: variaveis });

  // ------------------------------------------------------------------
  // 3) Envio da requisicao HTTP
  // ------------------------------------------------------------------
  let resposta;
  try {
    resposta = await fetch(URL_API_GRAPHQL, {
      method: "POST",
      headers: {
        // "Bearer <token>" e o formato exigido pelo GitHub para autenticacao.
        // E por este cabecalho que o token e enviado - ele nunca aparece na URL.
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json",
        // O GitHub exige um User-Agent identificando a aplicacao;
        // sem ele a requisicao pode ser recusada com 403.
        "User-Agent": "lab01-experimentacao-software",
      },
      body: corpoDaRequisicao,
    });
  } catch (erroDeRede) {
    // Cai aqui quando nem chegou a existir resposta: sem internet, DNS, proxy...
    throw new Error(`Falha de rede ao acessar ${URL_API_GRAPHQL}: ${erroDeRede.message}`);
  }

  // Lemos o corpo como texto primeiro. Assim, se a resposta nao for um JSON
  // valido (por exemplo, uma pagina de erro em HTML), conseguimos mostrar o
  // conteudo bruto na mensagem de erro em vez de esconder o problema.
  const textoDaResposta = await resposta.text();

  // ------------------------------------------------------------------
  // 4) Erros de HTTP (status fora da faixa 2xx)
  // ------------------------------------------------------------------
  if (!resposta.ok) {
    let dica = "";
    if (resposta.status === 401) {
      dica = "\n  (401 = token invalido, expirado ou mal copiado)";
    } else if (resposta.status === 403 || resposta.status === 429) {
      dica = "\n  (403/429 = limite de requisicoes atingido; aguarde e tente novamente)";
    }
    throw new Error(
      `Erro HTTP ${resposta.status} ${resposta.statusText} ao consultar a API do GitHub.${dica}\n` +
        `  Resposta: ${textoDaResposta.slice(0, 500)}`
    );
  }

  // ------------------------------------------------------------------
  // 5) Conversao do texto para JSON
  // ------------------------------------------------------------------
  let respostaEmJson;
  try {
    respostaEmJson = JSON.parse(textoDaResposta);
  } catch {
    throw new Error(
      `A API respondeu com status ${resposta.status}, mas o corpo nao e um JSON valido.\n` +
        `  Resposta: ${textoDaResposta.slice(0, 500)}`
    );
  }

  // ------------------------------------------------------------------
  // 6) Erros do proprio GraphQL
  // ------------------------------------------------------------------
  // Detalhe importante do GraphQL: um erro de consulta (campo inexistente,
  // repositorio nao encontrado, permissao negada) normalmente vem com
  // status HTTP 200 e um array "errors" no corpo. Por isso a verificacao
  // do passo 4 nao e suficiente.
  if (Array.isArray(respostaEmJson.errors) && respostaEmJson.errors.length > 0) {
    const mensagens = respostaEmJson.errors
      .map((erro, indice) => `  [${indice + 1}] ${erro.type ? erro.type + ": " : ""}${erro.message}`)
      .join("\n");
    throw new Error(`A API GraphQL retornou erro(s):\n${mensagens}`);
  }

  if (!respostaEmJson.data) {
    throw new Error(
      `A resposta da API nao contem o campo "data".\n  Resposta: ${textoDaResposta.slice(0, 500)}`
    );
  }

  return respostaEmJson.data;
}
