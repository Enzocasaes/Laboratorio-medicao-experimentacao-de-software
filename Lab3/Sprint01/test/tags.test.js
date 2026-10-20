// Coleta de tags (variante C3 da RQ 07). O ponto central é o custo: a API não
// devolve a data da tag, então cada tag que não for release custa uma
// requisição. Os testes cobrem as duas economias (data vinda da release e
// parada por idade) e os dois tetos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarCacheEmMemoria } from "../src/github/cache.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import { coletarTags, criarTag, ehItemDeTagValido } from "../src/tags/coleta.js";
import { criarApiFalsa, respostaJSON, tag } from "./apoio/api-falsa.js";

const JANELA = criarJanela("2025-10-01", "2026-09-30");

function clienteCom(api) {
  return criarClienteGitHub({
    token: "t",
    cache: criarCacheEmMemoria(),
    log: logSilencioso,
    fetch: api.fetch,
    esperar: async () => {},
  });
}

const contarChamadas = (api, trecho) => api.chamadas.filter((c) => c.caminho.includes(trecho)).length;

// ---- modelo --------------------------------------------------------------

test("ehItemDeTagValido: exige nome", () => {
  assert.equal(ehItemDeTagValido({ name: "v1", commit: { sha: "abc" } }), true);
  assert.equal(ehItemDeTagValido({ commit: { sha: "abc" } }), false);
  assert.equal(ehItemDeTagValido(null), false);
});

test("criarTag: normaliza e comeca sem data", () => {
  const t = criarTag(tag("v1.0", "abc123"));
  assert.equal(t.tag_name, "v1.0");
  assert.equal(t.sha, "abc123");
  assert.equal(t.commit_date, null);
  assert.equal(t.date_source, null);
  assert.equal(t.in_window, false);
});

// ---- economia de requisições ---------------------------------------------

test("tag que ja e' release usa a data da release, sem pedir o commit", async () => {
  const api = criarApiFalsa({ tags: { "a/b": [tag("v1.0", "sha1")] }, commits: { sha1: "2026-01-10T00:00:00Z" } });
  const datasDeReleases = new Map([["v1.0", "2026-02-02T00:00:00Z"]]);

  const r = await coletarTags(clienteCom(api), "a/b", JANELA, { datasDeReleases });

  assert.equal(r.tags[0].commit_date, "2026-02-02T00:00:00Z"); // a da release, nao a do commit
  assert.equal(r.tags[0].date_source, "release");
  assert.equal(r.commitsPedidos, 0);
  assert.equal(contarChamadas(api, "/commits/"), 0);
});

test("tag sem release busca a data no commit", async () => {
  const api = criarApiFalsa({ tags: { "a/b": [tag("v1.0", "sha1")] }, commits: { sha1: "2026-01-10T00:00:00Z" } });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA);

  assert.equal(r.tags[0].commit_date, "2026-01-10T00:00:00Z");
  assert.equal(r.tags[0].date_source, "commit");
  assert.equal(r.tags[0].in_window, true);
  assert.equal(r.commitsPedidos, 1);
});

test("tag fora da janela fica in_window = false", async () => {
  const api = criarApiFalsa({ tags: { "a/b": [tag("antiga", "sha1")] }, commits: { sha1: "2024-01-01T00:00:00Z" } });
  const r = await coletarTags(clienteCom(api), "a/b", JANELA);
  assert.equal(r.tags[0].in_window, false);
});

test("parada por idade: 10 tags seguidas antes da janela encerram o repositorio", async () => {
  const lista = [];
  const commits = {};
  for (let i = 0; i < 30; i += 1) {
    lista.push(tag(`v${i}`, `sha${i}`));
    commits[`sha${i}`] = "2024-05-01T00:00:00Z"; // todas antigas
  }
  const api = criarApiFalsa({ tags: { "a/b": lista }, commits });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA, { porPagina: 100 });

  assert.equal(r.commitsPedidos, 10); // parou nas 10 primeiras antigas
  assert.equal(r.tags.length, 10);
});

test("parada por idade: tag recente no meio zera a contagem", async () => {
  const lista = [];
  const commits = {};
  for (let i = 0; i < 12; i += 1) {
    lista.push(tag(`v${i}`, `sha${i}`));
    commits[`sha${i}`] = i === 5 ? "2026-03-01T00:00:00Z" : "2024-05-01T00:00:00Z";
  }
  const api = criarApiFalsa({ tags: { "a/b": lista }, commits });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA, { porPagina: 100 });

  // 5 antigas + 1 recente (zera) + 6 antigas = para no fim da lista
  assert.equal(r.tags.length, 12);
  assert.equal(r.tags.filter((t) => t.in_window).length, 1);
});

// ---- tetos e paginação ---------------------------------------------------

test("paginacao: segue o Link ate o fim", async () => {
  const lista = Array.from({ length: 7 }, (_, i) => tag(`v${i}`, `sha${i}`));
  const commits = Object.fromEntries(lista.map((t, i) => [`sha${i}`, "2026-02-01T00:00:00Z"]));
  const api = criarApiFalsa({ tags: { "a/b": lista }, commits });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA, { porPagina: 3 });

  assert.equal(r.tags.length, 7);
  assert.equal(r.paginas, 3);
});

test("teto de datas de commit: marca truncada e para de pedir", async () => {
  const lista = Array.from({ length: 10 }, (_, i) => tag(`v${i}`, `sha${i}`));
  const commits = Object.fromEntries(lista.map((t, i) => [`sha${i}`, "2026-02-01T00:00:00Z"]));
  const api = criarApiFalsa({ tags: { "a/b": lista }, commits });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA, { porPagina: 100, maxCommits: 3 });

  assert.equal(r.commitsPedidos, 3);
  assert.equal(r.truncada, true);
  assert.equal(contarChamadas(api, "/commits/"), 3);
});

test("teto de paginas: listagem truncada", async () => {
  const lista = Array.from({ length: 10 }, (_, i) => tag(`v${i}`, `sha${i}`));
  const commits = Object.fromEntries(lista.map((t, i) => [`sha${i}`, "2026-02-01T00:00:00Z"]));
  const api = criarApiFalsa({ tags: { "a/b": lista }, commits });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA, { porPagina: 2, maxPaginas: 2 });

  assert.equal(r.truncada, true);
  assert.equal(r.paginas, 2);
});

// ---- erros ---------------------------------------------------------------

test("404 na listagem vira erro registravel, sem excecao", async () => {
  const api = criarApiFalsa({ tags: { "a/b": respostaJSON(404, { message: "Not Found" }) } });
  const r = await coletarTags(clienteCom(api), "a/b", JANELA);
  assert.equal(r.erro, "tags_http_404");
  assert.equal(r.tags.length, 0);
});

test("commit inexistente deixa a tag sem data, e as outras continuam", async () => {
  const api = criarApiFalsa({
    tags: { "a/b": [tag("v1", "sumiu"), tag("v2", "sha2")] },
    commits: { sha2: "2026-02-01T00:00:00Z" },
  });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA, { porPagina: 100 });

  assert.equal(r.tags[0].commit_date, null);
  assert.equal(r.tags[0].date_source, null);
  assert.equal(r.tags[1].commit_date, "2026-02-01T00:00:00Z");
  assert.equal(r.erro, null);
});

test("item de tag sem nome e' contado e ignorado", async () => {
  const api = criarApiFalsa({
    tags: { "a/b": [] },
    antes: (url) => (url.pathname === "/repos/a/b/tags" ? respostaJSON(200, [{ commit: { sha: "x" } }]) : null),
  });

  const r = await coletarTags(clienteCom(api), "a/b", JANELA);
  assert.equal(r.itensInvalidos, 1);
  assert.equal(r.tags.length, 0);
});

test("segunda execucao vem do cache, sem tocar a rede", async () => {
  const api = criarApiFalsa({ tags: { "a/b": [tag("v1", "sha1")] }, commits: { sha1: "2026-02-01T00:00:00Z" } });
  const cliente = criarClienteGitHub({
    token: "t",
    cache: criarCacheEmMemoria(),
    log: logSilencioso,
    fetch: api.fetch,
    esperar: async () => {},
  });

  await coletarTags(cliente, "a/b", JANELA);
  const antes = api.chamadas.length;
  const segunda = await coletarTags(cliente, "a/b", JANELA);

  assert.equal(api.chamadas.length, antes);
  assert.equal(segunda.tags[0].commit_date, "2026-02-01T00:00:00Z");
});
