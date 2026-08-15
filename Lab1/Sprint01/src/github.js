const URL_API_GRAPHQL = "https://api.github.com/graphql";
const TENTATIVAS_EM_FALHA_TEMPORARIA = 5;

function esperar(milissegundos) {
  return new Promise((resolver) => setTimeout(resolver, milissegundos));
}

export async function executarQueryGraphQL(query, variaveis = {}) {
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

  const corpoDaRequisicao = JSON.stringify({ query, variables: variaveis });

  let resposta;
  let ultimoErroDeRede;
  for (let tentativa = 0; tentativa <= TENTATIVAS_EM_FALHA_TEMPORARIA; tentativa += 1) {
    resposta = undefined;
    try {
      resposta = await fetch(URL_API_GRAPHQL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": "application/json",
          "User-Agent": "lab01-experimentacao-software",
        },
        body: corpoDaRequisicao,
      });
    } catch (erroDeRede) {
      ultimoErroDeRede = erroDeRede;
    }
    const falhaTemporaria = !resposta || [502, 503, 504].includes(resposta.status);
    if (!falhaTemporaria || tentativa === TENTATIVAS_EM_FALHA_TEMPORARIA) break;
    const esperaEmSegundos = Math.min(2 ** (tentativa + 1), 30);
    console.log(`Resposta temporariamente indisponivel; nova tentativa em ${esperaEmSegundos}s...`);
    await esperar(esperaEmSegundos * 1000);
  }
  if (!resposta) {
    throw new Error(`Falha de rede ao acessar ${URL_API_GRAPHQL}: ${ultimoErroDeRede?.message ?? "sem resposta"}`);
  }

  const textoDaResposta = await resposta.text();

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

  let respostaEmJson;
  try {
    respostaEmJson = JSON.parse(textoDaResposta);
  } catch {
    throw new Error(
      `A API respondeu com status ${resposta.status}, mas o corpo nao e um JSON valido.\n` +
        `  Resposta: ${textoDaResposta.slice(0, 500)}`
    );
  }

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
