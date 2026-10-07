import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { criarCacheEmDisco } from "../src/github/cache.js";
import { ErroGitHub, criarClienteGitHub, lerToken } from "../src/github/cliente.js";
import { pastaTemporaria, respostaJSON } from "./apoio/api-falsa.js";

const TOKEN = "token-falso-de-teste";

// Fetch roteirizado: devolve as respostas da lista, em ordem.
function fetchRoteirizado(respostas) {
  const chamadas = [];
  const fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const proxima = respostas.shift();
    if (proxima === undefined) throw new Error("fetch chamado mais vezes que o previsto");
    if (proxima instanceof Error) throw proxima;
    return typeof proxima === "function" ? proxima() : proxima;
  };
  return { fetch, chamadas };
}

// Relogio falso: esperar() avanca o tempo em vez de dormir.
function relogio(inicio = 1_700_000_000_000) {
  const esperas = [];
  let agora = inicio;
  return {
    esperas,
    agora: () => agora,
    esperar: async (ms) => { esperas.push(ms); agora += ms; },
  };
}

function cliente(respostas, extra = {}) {
  const roteiro = fetchRoteirizado(respostas);
  const tempo = relogio();
  const c = criarClienteGitHub({ token: TOKEN, fetch: roteiro.fetch, esperar: tempo.esperar, agora: tempo.agora, ...extra });
  return { c, roteiro, tempo };
}

test("lerToken: ausente, vazio ou marcador do .env.example -> erro explicativo", () => {
  assert.throws(() => lerToken({}), /Token do GitHub ausente/);
  assert.throws(() => lerToken({ GITHUB_TOKEN: "   " }), /Token do GitHub ausente/);
  assert.throws(() => lerToken({ GITHUB_TOKEN: "coloque_seu_token_aqui" }), /Token do GitHub ausente/);
  assert.equal(lerToken({ GITHUB_TOKEN: "  abc  " }), "abc");
});

test("criarClienteGitHub: exige token", () => {
  assert.throws(() => criarClienteGitHub({}), /token obrigatorio/);
});

test("get: envia o token no Authorization e devolve corpo, status e links", async () => {
  const { c, roteiro } = cliente([
    respostaJSON(200, [{ id: 1 }], { link: '<https://api.github.com/x?page=2>; rel="next"' }),
  ]);
  const r = await c.get("/repos/a/b/contributors", { per_page: 1, anon: "true" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, [{ id: 1 }]);
  assert.equal(r.links.next, "https://api.github.com/x?page=2");
  assert.equal(r.doCache, false);
  assert.equal(roteiro.chamadas[0].opcoes.headers.Authorization, `Bearer ${TOKEN}`);
  assert.match(roteiro.chamadas[0].url, /per_page=1/);
});

test("get: segunda chamada igual vem do cache, sem ir a rede", async () => {
  const { c, roteiro } = cliente([respostaJSON(200, { total_count: 2 })]);
  await c.get("/repos/a/b/actions/workflows", { per_page: 1 });
  const r = await c.get("/repos/a/b/actions/workflows", { per_page: 1 });
  assert.equal(r.doCache, true);
  assert.deepEqual(r.corpo, { total_count: 2 });
  assert.equal(roteiro.chamadas.length, 1);
  assert.deepEqual(c.estatisticas, { requisicoes: 1, doCache: 1, esperasPorLimite: 0, novasTentativas: 0 });
});

test("get: o token nunca e' gravado no cache em disco", async () => {
  const dir = pastaTemporaria();
  const { c } = cliente([respostaJSON(200, { ok: true })], { cache: criarCacheEmDisco(dir) });
  await c.get("/rate_limit");
  const arquivos = readdirSync(dir, { recursive: true }).filter((a) => a.endsWith(".json"));
  assert.equal(arquivos.length, 1);
  assert.equal(readFileSync(join(dir, arquivos[0]), "utf8").includes(TOKEN), false);
});

test("get: 404 e' devolvido ao chamador (nao lanca) e fica no cache", async () => {
  const { c, roteiro } = cliente([respostaJSON(404, { message: "Not Found" })]);
  const r = await c.get("/repos/sumiu/repo/actions/workflows");
  assert.equal(r.status, 404);
  assert.equal(r.corpo.message, "Not Found");
  await c.get("/repos/sumiu/repo/actions/workflows");
  assert.equal(roteiro.chamadas.length, 1);
});

test("get: 500 e' repetido com backoff exponencial 1s, 2s e depois tem sucesso", async () => {
  const { c, tempo, roteiro } = cliente([
    respostaJSON(500, { message: "erro" }),
    respostaJSON(502, { message: "erro" }),
    respostaJSON(200, { ok: true }),
  ]);
  const r = await c.get("/x");
  assert.equal(r.status, 200);
  assert.deepEqual(tempo.esperas, [1000, 2000]);
  assert.equal(roteiro.chamadas.length, 3);
  assert.equal(c.estatisticas.novasTentativas, 2);
});

test("get: 5xx persistente esgota as tentativas, lanca ErroGitHub e NAO grava cache", async () => {
  const respostas = Array.from({ length: 4 }, () => respostaJSON(503, {}));
  const { c, tempo } = cliente(respostas, { maxTentativas: 3 });
  await assert.rejects(c.get("/x"), (erro) => erro instanceof ErroGitHub && erro.status === 503 && /3 novas tentativas/.test(erro.message));
  assert.deepEqual(tempo.esperas, [1000, 2000, 4000]);
  // nova chamada vai a rede de novo (o 503 nao ficou no cache)
  const seguinte = cliente([respostaJSON(200, {})]);
  assert.equal((await seguinte.c.get("/x")).status, 200);
});

test("get: erro de rede e' repetido com backoff e depois lanca", async () => {
  const { c, tempo } = cliente([new Error("ECONNRESET"), respostaJSON(200, { ok: 1 })]);
  assert.equal((await c.get("/x")).status, 200);
  assert.deepEqual(tempo.esperas, [1000]);

  const falha = cliente([new Error("ECONNRESET"), new Error("ECONNRESET")], { maxTentativas: 1 });
  await assert.rejects(falha.c.get("/x"), /Falha de rede em \/x apos 1 novas tentativas: ECONNRESET/);
});

test("get: requisicao sem resposta e' abortada pelo timeout e repetida", async () => {
  let chamadas = 0;
  // 1a chamada: nunca responde, so' termina quando o sinal de timeout aborta.
  const fetch = (url, { signal }) => {
    chamadas += 1;
    if (chamadas === 1) {
      // O timer do AbortSignal.timeout nao segura o processo vivo (na rede de
      // verdade, o socket aberto segura); este setTimeout faz esse papel.
      const vivo = setTimeout(() => {}, 5000);
      return new Promise((_, rejeitar) =>
        signal.addEventListener("abort", () => {
          clearTimeout(vivo);
          rejeitar(signal.reason);
        })
      );
    }
    return Promise.resolve(respostaJSON(200, { ok: true }));
  };
  const tempo = relogio();
  const avisos = [];
  const c = criarClienteGitHub({
    token: TOKEN,
    fetch,
    esperar: tempo.esperar,
    agora: tempo.agora,
    timeoutMs: 20,
    log: { debug() {}, aviso: (m) => avisos.push(m) },
  });
  const r = await c.get("/x");
  assert.equal(r.status, 200);
  assert.equal(chamadas, 2);
  assert.match(avisos[0], /sem resposta em 0.02s/);
});

test("get: 401 lanca imediatamente com dica sobre o token (sem expor o token)", async () => {
  const { c, roteiro } = cliente([respostaJSON(401, { message: "Bad credentials" })]);
  await assert.rejects(c.get("/x"), (erro) => erro.status === 401 && /GITHUB_TOKEN/.test(erro.message) && !erro.message.includes(TOKEN));
  assert.equal(roteiro.chamadas.length, 1);
});

test("rate limit: 403 com X-RateLimit-Remaining 0 espera ate o reset e repete", async () => {
  const tempo = relogio(1_700_000_000_000);
  const reset = Math.floor(tempo.agora() / 1000) + 120; // cota renova em 2 minutos
  const roteiro = fetchRoteirizado([
    respostaJSON(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset), "x-ratelimit-resource": "core" }),
    respostaJSON(200, { ok: true }, { "x-ratelimit-remaining": "4999" }),
  ]);
  const c = criarClienteGitHub({ token: TOKEN, fetch: roteiro.fetch, esperar: tempo.esperar, agora: tempo.agora });
  const r = await c.get("/repos/a/b");
  assert.equal(r.status, 200);
  assert.equal(tempo.esperas.length, 1);
  assert.equal(tempo.agora() >= reset * 1000, true, "so' repete depois do reset");
  assert.equal(c.estatisticas.esperasPorLimite, 1);
});

test("rate limit: 429 com Retry-After espera os segundos indicados", async () => {
  const { c, tempo } = cliente([
    respostaJSON(429, { message: "secondary rate limit" }, { "retry-after": "30" }),
    respostaJSON(200, {}),
  ]);
  assert.equal((await c.get("/search/repositories", { q: "stars:>1000" })).status, 200);
  assert.deepEqual(tempo.esperas, [30_000]);
});

test("rate limit: 429 sem cabecalhos espera 1 minuto (recomendacao do GitHub)", async () => {
  const { c, tempo } = cliente([respostaJSON(429, {}), respostaJSON(200, {})]);
  await c.get("/x");
  assert.deepEqual(tempo.esperas, [60_000]);
});

test("rate limit: cota zerada numa resposta 200 faz a PROXIMA requisicao esperar", async () => {
  const tempo = relogio(1_700_000_000_000);
  const reset = Math.floor(tempo.agora() / 1000) + 60;
  const roteiro = fetchRoteirizado([
    respostaJSON(200, { a: 1 }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset), "x-ratelimit-resource": "core" }),
    respostaJSON(200, { b: 2 }),
  ]);
  const c = criarClienteGitHub({ token: TOKEN, fetch: roteiro.fetch, esperar: tempo.esperar, agora: tempo.agora });
  await c.get("/a");
  assert.equal(tempo.esperas.length, 0);
  await c.get("/b");
  assert.equal(tempo.esperas.length, 1);
  assert.equal(tempo.agora(), reset * 1000 + 1000);
});

test("rate limit: a cota da busca e' separada da cota core", async () => {
  const tempo = relogio(1_700_000_000_000);
  const reset = Math.floor(tempo.agora() / 1000) + 60;
  const roteiro = fetchRoteirizado([
    respostaJSON(200, { items: [] }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset), "x-ratelimit-resource": "search" }),
    respostaJSON(200, {}),
  ]);
  const c = criarClienteGitHub({ token: TOKEN, fetch: roteiro.fetch, esperar: tempo.esperar, agora: tempo.agora });
  await c.get("/search/repositories", { q: "stars:>1000" });
  await c.get("/repos/a/b"); // core: nao precisa esperar
  assert.equal(tempo.esperas.length, 0);
});

test("rate limit: 403 sem sinais de limite e' um 'proibido' de verdade e volta ao chamador", async () => {
  const { c, tempo } = cliente([respostaJSON(403, { message: "contributor list is too large" }, { "x-ratelimit-remaining": "4000" })]);
  const r = await c.get("/repos/torvalds/linux/contributors");
  assert.equal(r.status, 403);
  assert.equal(tempo.esperas.length, 0);
});

test("rate limit: limite que nunca libera vira erro depois de 10 esperas", async () => {
  const respostas = Array.from({ length: 11 }, () => respostaJSON(429, {}, { "retry-after": "1" }));
  const { c } = cliente(respostas);
  await assert.rejects(c.get("/x"), /persistiu apos 10 esperas/);
});

test("get: segue URL absoluta da API (rel=next) mas recusa outro host", async () => {
  const { c, roteiro } = cliente([respostaJSON(200, [])]);
  await c.get("https://api.github.com/search/repositories?q=stars%3A%3E1000&page=2");
  assert.match(roteiro.chamadas[0].url, /page=2/);
  await assert.rejects(c.get("https://evil.example.com/roubar"), /fora da API do GitHub recusada/);
  assert.equal(roteiro.chamadas.length, 1);
});

test("get: 204 sem corpo -> corpo null", async () => {
  const { c } = cliente([respostaJSON(204)]);
  const r = await c.get("/repos/a/vazio/contributors");
  assert.equal(r.status, 204);
  assert.equal(r.corpo, null);
});

test("get: 200 com corpo que nao e' JSON -> ErroGitHub (resposta inesperada)", async () => {
  const { c } = cliente([new Response("<html>proxy</html>", { status: 200 })]);
  await assert.rejects(c.get("/x"), /nao e' JSON/);
});

test("get: 4xx com corpo nao-JSON devolve o texto", async () => {
  const { c } = cliente([new Response("Not Found", { status: 404 })]);
  const r = await c.get("/x");
  assert.equal(r.corpo, "Not Found");
});
