// Cliente HTTP minimo da API REST do GitHub, escrito a mao sobre o fetch
// nativo (o enunciado proibe bibliotecas prontas de acesso a API, como PyGithub).
//
// Responsabilidades - e somente estas:
//   1. autenticar com o token lido de GITHUB_TOKEN (nunca registrado em log/cache);
//   2. consultar o cache antes de ir a rede e gravar cada resposta definitiva;
//   3. respeitar o rate limit (X-RateLimit-Remaining / X-RateLimit-Reset e
//      Retry-After), esperando a renovacao da cota quando ela acaba;
//   4. repetir falhas temporarias (5xx e erro de rede) com backoff exponencial
//      1 s, 2 s, 4 s, 8 s, 16 s, ate o limite de tentativas.
//
// Respostas 2xx e 4xx (404, 403 "lista grande demais", 422...) sao devolvidas
// ao chamador com o status, para que ele registre o motivo; nao sao
// mascaradas nem engolidas. So' 401 (token invalido) e falhas que persistem
// depois das novas tentativas viram excecao.
//
// O cliente e' generico (qualquer endpoint GET): a coleta de releases (B) e de
// workflow runs (C) deve reutiliza-lo, em vez de criar outro.

import { chaveDaRequisicao, criarCacheEmMemoria } from "./cache.js";
import { interpretarLink } from "./link.js";
import { logSilencioso } from "../log.js";

export const URL_BASE = "https://api.github.com";
const MAX_ESPERAS_POR_LIMITE = 10;
const ESPERA_LIMITE_SECUNDARIO_MS = 60_000; // docs do GitHub: aguarde ao menos 1 minuto

export class ErroGitHub extends Error {
  constructor(mensagem, { status = null, url = null } = {}) {
    super(mensagem);
    this.name = "ErroGitHub";
    this.status = status;
    this.url = url;
  }
}

export function lerToken(ambiente = process.env) {
  const token = typeof ambiente.GITHUB_TOKEN === "string" ? ambiente.GITHUB_TOKEN.trim() : "";
  if (token === "" || token === "coloque_seu_token_aqui") {
    throw new Error(
      "Token do GitHub ausente.\n" +
        "  Defina a variavel de ambiente GITHUB_TOKEN, ou copie .env.example para .env\n" +
        "  e preencha a linha GITHUB_TOKEN=seu_token_aqui.\n" +
        "  Gere o token em: GitHub > Settings > Developer settings >\n" +
        "  Personal access tokens > Tokens (classic) (escopo public_repo)."
    );
  }
  return token;
}

const esperarPadrao = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// A API de busca tem cota propria (30 req/min), separada da cota "core".
function recursoDaUrl(url) {
  return new URL(url).pathname.startsWith("/search/") ? "search" : "core";
}

export function criarClienteGitHub({
  token,
  cache = criarCacheEmMemoria(),
  fetch: fetchFn = globalThis.fetch,
  esperar = esperarPadrao,
  agora = Date.now,
  log = logSilencioso,
  maxTentativas = 5,
  esperaBaseMs = 1000,
  urlBase = URL_BASE,
} = {}) {
  if (!token) throw new Error("criarClienteGitHub: token obrigatorio (use lerToken())");

  const origemDaApi = new URL(urlBase).origin;
  const bloqueadoAte = {}; // recurso -> instante (ms) em que a cota renova
  const estatisticas = { requisicoes: 0, doCache: 0, esperasPorLimite: 0, novasTentativas: 0 };

  function montarUrl(caminhoOuUrl, parametros = {}) {
    const url = new URL(caminhoOuUrl, urlBase);
    // URLs absolutas (ex.: rel="next" do Link) so' sao aceitas se forem da
    // propria API - o token nunca e' enviado a outro host.
    if (url.origin !== origemDaApi) {
      throw new ErroGitHub(`URL fora da API do GitHub recusada: ${url.origin}`);
    }
    for (const [nome, valor] of Object.entries(parametros)) {
      if (valor !== undefined && valor !== null) url.searchParams.set(nome, String(valor));
    }
    return url.toString();
  }

  async function respeitarCota(recurso) {
    const falta = (bloqueadoAte[recurso] ?? 0) - agora();
    if (falta <= 0) return;
    estatisticas.esperasPorLimite += 1;
    log.aviso(`rate limit (${recurso}) esgotado; aguardando ${Math.ceil(falta / 1000)}s pela renovacao da cota`);
    await esperar(falta);
  }

  function registrarCota(cabecalhos, recursoPadrao) {
    const restante = cabecalhos.get("x-ratelimit-remaining");
    if (restante === null) return;
    const recurso = cabecalhos.get("x-ratelimit-resource") ?? recursoPadrao;
    const reset = Number(cabecalhos.get("x-ratelimit-reset"));
    log.debug(`rate limit ${recurso}: ${restante} restantes`);
    if (restante === "0" && Number.isFinite(reset) && reset > 0) {
      bloqueadoAte[recurso] = Math.max(bloqueadoAte[recurso] ?? 0, reset * 1000 + 1000);
    }
  }

  // ms a esperar se a resposta indica rate limit (primario ou secundario), senao null.
  // Um 403 sem esses sinais e' um "proibido" de verdade e volta ao chamador.
  function esperaPorLimite(resposta) {
    if (resposta.status !== 403 && resposta.status !== 429) return null;
    const retryAfter = resposta.headers.get("retry-after");
    if (retryAfter !== null && Number.isFinite(Number(retryAfter))) return Number(retryAfter) * 1000;
    if (resposta.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(resposta.headers.get("x-ratelimit-reset"));
      if (Number.isFinite(reset) && reset > 0) return Math.max(reset * 1000 + 1000 - agora(), 1000);
      return ESPERA_LIMITE_SECUNDARIO_MS;
    }
    return resposta.status === 429 ? ESPERA_LIMITE_SECUNDARIO_MS : null;
  }

  async function recuar(motivo, chave, tentativa) {
    const espera = esperaBaseMs * 2 ** tentativa;
    estatisticas.novasTentativas += 1;
    log.aviso(`${motivo} em ${chave}; nova tentativa ${tentativa + 1}/${maxTentativas} em ${espera / 1000}s`);
    await esperar(espera);
  }

  async function get(caminhoOuUrl, parametros) {
    const url = montarUrl(caminhoOuUrl, parametros);
    const chave = chaveDaRequisicao(url);

    const emCache = cache.ler(chave);
    if (emCache) {
      estatisticas.doCache += 1;
      log.debug(`cache: ${chave}`);
      return { ...emCache, links: interpretarLink(emCache.link), doCache: true };
    }

    const recurso = recursoDaUrl(url);
    let tentativa = 0;
    let esperasPorLimite = 0;
    for (;;) {
      await respeitarCota(recurso);

      let resposta;
      try {
        estatisticas.requisicoes += 1;
        resposta = await fetchFn(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "lab03-metricas-dora",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
      } catch (erro) {
        if (tentativa >= maxTentativas) {
          throw new ErroGitHub(`Falha de rede em ${chave} apos ${maxTentativas} novas tentativas: ${erro.message}`, { url: chave });
        }
        await recuar(`falha de rede (${erro.message})`, chave, tentativa);
        tentativa += 1;
        continue;
      }

      registrarCota(resposta.headers, recurso);

      if (resposta.status === 401) {
        throw new ErroGitHub("HTTP 401: token invalido, expirado ou sem permissao (confira GITHUB_TOKEN)", { status: 401, url: chave });
      }

      const espera = esperaPorLimite(resposta);
      if (espera !== null) {
        if (esperasPorLimite >= MAX_ESPERAS_POR_LIMITE) {
          throw new ErroGitHub(`HTTP ${resposta.status} por rate limit em ${chave} persistiu apos ${MAX_ESPERAS_POR_LIMITE} esperas`, { status: resposta.status, url: chave });
        }
        esperasPorLimite += 1;
        bloqueadoAte[recurso] = Math.max(bloqueadoAte[recurso] ?? 0, agora() + espera);
        log.aviso(`HTTP ${resposta.status} (rate limit) em ${chave}`);
        continue;
      }

      if (resposta.status >= 500) {
        if (tentativa >= maxTentativas) {
          throw new ErroGitHub(`HTTP ${resposta.status} em ${chave} apos ${maxTentativas} novas tentativas`, { status: resposta.status, url: chave });
        }
        await recuar(`HTTP ${resposta.status}`, chave, tentativa);
        tentativa += 1;
        continue;
      }

      const texto = await resposta.text();
      let corpo = null;
      if (texto !== "") {
        try {
          corpo = JSON.parse(texto);
        } catch {
          if (resposta.ok) {
            throw new ErroGitHub(`HTTP ${resposta.status} em ${chave} com corpo que nao e' JSON: ${texto.slice(0, 200)}`, { status: resposta.status, url: chave });
          }
          corpo = texto;
        }
      }

      const resultado = {
        url: chave,
        status: resposta.status,
        corpo,
        link: resposta.headers.get("link"),
        coletadoEm: new Date(agora()).toISOString(),
      };
      cache.gravar(chave, resultado);
      return { ...resultado, links: interpretarLink(resultado.link), doCache: false };
    }
  }

  return { get, estatisticas };
}
