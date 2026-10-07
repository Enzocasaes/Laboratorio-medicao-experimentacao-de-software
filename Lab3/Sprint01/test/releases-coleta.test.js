// Coleta das releases de um repositorio: paginacao, regra de parada, filtro da
// janela e erros registraveis.

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { criarJanela } from "../src/janela.js";
import { coletarReleases } from "../src/releases/coleta.js";
import { criarRelease, ehItemDeReleaseValido } from "../src/releases/modelo.js";
import { criarApiFalsa, release, respostaJSON } from "./apoio/api-falsa.js";

const janela = criarJanela("2025-01-01", "2025-12-31");

function clientePara(api) {
  return criarClienteGitHub({ token: "t", fetch: api.fetch, esperar: async () => {} });
}

// ---- normalizacao de um item -------------------------------------------

test("criarRelease: classifica deploy e janela a partir dos campos da API", () => {
  const r = criarRelease(release("v1.0", "2025-03-01T10:00:00Z", { id: 42, name: "Versao 1" }), janela);
  assert.equal(r.release_id, 42);
  assert.equal(r.tag_name, "v1.0");
  assert.equal(r.name, "Versao 1");
  assert.equal(r.draft, false);
  assert.equal(r.prerelease, false);
  assert.equal(r.is_deploy, true);
  assert.equal(r.in_window, true);
  assert.equal(r.deploy_index, null);
});

test("criarRelease: draft e prerelease nao sao deploy", () => {
  const rascunho = criarRelease(release("v2", null, { draft: true, published_at: null }), janela);
  assert.equal(rascunho.is_deploy, false);
  assert.equal(rascunho.in_window, false);

  const pre = criarRelease(release("v2-rc1", "2025-03-01T00:00:00Z", { prerelease: true }), janela);
  assert.equal(pre.is_deploy, false);
  assert.equal(pre.in_window, true, "pre-release publicada na janela continua marcada como da janela");
});

test("criarRelease: janela e' inclusiva nas duas pontas (dia de inicio e dia de fim)", () => {
  assert.equal(criarRelease(release("a", "2025-01-01T00:00:00Z"), janela).in_window, true);
  assert.equal(criarRelease(release("b", "2025-12-31T23:59:59Z"), janela).in_window, true);
  assert.equal(criarRelease(release("c", "2024-12-31T23:59:59Z"), janela).in_window, false);
  assert.equal(criarRelease(release("d", "2026-01-01T00:00:00Z"), janela).in_window, false);
});

test("criarRelease: tag vazia e campos ausentes viram null", () => {
  const r = criarRelease({ id: 1, tag_name: "", published_at: "2025-03-01T00:00:00Z" }, janela);
  assert.equal(r.tag_name, null);
  assert.equal(r.name, null);
  assert.equal(r.target_commitish, null);
  assert.equal(r.html_url, null);
});

test("ehItemDeReleaseValido: exige id inteiro", () => {
  assert.equal(ehItemDeReleaseValido(release("v1", "2025-01-02T00:00:00Z")), true);
  assert.equal(ehItemDeReleaseValido(null), false);
  assert.equal(ehItemDeReleaseValido({ id: "1" }), false);
});

// ---- paginacao e regra de parada ----------------------------------------

test("coletarReleases: pede per_page=100 e normaliza a pagina unica", async () => {
  const api = criarApiFalsa({
    releases: {
      "a/b": [release("v1.0", "2024-12-01T00:00:00Z"), release("v1.1", "2025-02-01T00:00:00Z")],
    },
  });
  const coletado = await coletarReleases(clientePara(api), "a/b", janela);

  assert.equal(coletado.erro, null);
  assert.equal(coletado.releases.length, 2);
  assert.equal(coletado.paginas, 1);
  assert.equal(coletado.temPredecessor, true, "v1.0 e' anterior a janela");
  assert.match(api.chamadas[0].caminho, /^\/repos\/a\/b\/releases\?per_page=100$/);
});

test("coletarReleases: segue o Link next ate achar a release anterior a janela", async () => {
  // 5 releases dentro da janela e uma antes dela, 2 por pagina.
  const lista = [
    release("v2.4", "2025-11-01T00:00:00Z"),
    release("v2.3", "2025-09-01T00:00:00Z"),
    release("v2.2", "2025-07-01T00:00:00Z"),
    release("v2.1", "2025-05-01T00:00:00Z"),
    release("v2.0", "2025-03-01T00:00:00Z"),
    release("v1.9", "2024-10-01T00:00:00Z"),
  ];
  const api = criarApiFalsa({ releases: { "a/b": lista } });
  const coletado = await coletarReleases(clientePara(api), "a/b", janela, { porPagina: 2 });

  assert.equal(coletado.paginas, 3, "para na pagina em que v1.9 aparece");
  assert.equal(coletado.releases.length, 6);
  assert.equal(coletado.temPredecessor, true);
  assert.equal(api.chamadas.length, 3);
});

test("coletarReleases: para na ultima pagina quando nao existe release anterior a janela", async () => {
  const api = criarApiFalsa({
    releases: { "a/novo": [release("v1.1", "2025-06-01T00:00:00Z"), release("v1.0", "2025-05-01T00:00:00Z")] },
  });
  const coletado = await coletarReleases(clientePara(api), "a/novo", janela, { porPagina: 1 });

  assert.equal(coletado.paginas, 2);
  assert.equal(coletado.temPredecessor, false);
  assert.equal(coletado.truncada, false);
  assert.equal(coletado.releases.length, 2);
});

test("coletarReleases: teto de paginas marca a coleta como truncada", async () => {
  const lista = Array.from({ length: 10 }, (_, i) =>
    release(`v${i}`, `2025-0${(i % 9) + 1}-01T00:00:00Z`, { id: 100 + i })
  );
  const api = criarApiFalsa({ releases: { "a/b": lista } });
  const coletado = await coletarReleases(clientePara(api), "a/b", janela, { porPagina: 1, maxPaginas: 3 });

  assert.equal(coletado.truncada, true);
  assert.equal(coletado.paginas, 3);
  assert.equal(coletado.erro, null, "truncada nao e' erro: a coleta parcial fica registrada");
});

test("coletarReleases: rascunho nao serve de release anterior a janela", async () => {
  const api = criarApiFalsa({
    releases: {
      "a/b": [
        release("v1.1", "2025-06-01T00:00:00Z"),
        release("rascunho-antigo", null, { draft: true, published_at: null, created_at: "2024-01-01T00:00:00Z" }),
      ],
    },
  });
  const coletado = await coletarReleases(clientePara(api), "a/b", janela, { porPagina: 2 });
  assert.equal(coletado.temPredecessor, false);
});

test("coletarReleases: item sem id e' contado como invalido e ignorado", async () => {
  const api = criarApiFalsa({
    releases: { "a/b": respostaJSON(200, [{ tag_name: "sem-id" }, release("v1.0", "2024-12-01T00:00:00Z")]) },
  });
  const coletado = await coletarReleases(clientePara(api), "a/b", janela);

  assert.equal(coletado.itensInvalidos, 1);
  assert.equal(coletado.releases.length, 1);
});

// ---- erros ---------------------------------------------------------------

test("coletarReleases: 404 e 403 viram motivo registravel, sem excecao", async () => {
  const api = criarApiFalsa({
    releases: {
      "a/sumiu": respostaJSON(404, { message: "Not Found" }),
      "a/bloq": respostaJSON(403, { message: "Forbidden" }),
    },
  });
  const cliente = clientePara(api);
  assert.equal((await coletarReleases(cliente, "a/sumiu", janela)).erro, "releases_http_404");
  assert.equal((await coletarReleases(cliente, "a/bloq", janela)).erro, "releases_http_403");
});

test("coletarReleases: corpo que nao e' lista -> resposta inesperada", async () => {
  const api = criarApiFalsa({ releases: { "a/b": respostaJSON(200, { message: "nao e' lista" }) } });
  assert.equal((await coletarReleases(clientePara(api), "a/b", janela)).erro, "releases_unexpected_response");
});

test("coletarReleases: repositorio sem nenhuma release -> lista vazia, sem erro", async () => {
  const api = criarApiFalsa({ releases: { "a/vazio": [] } });
  const coletado = await coletarReleases(clientePara(api), "a/vazio", janela);
  assert.deepEqual(coletado.releases, []);
  assert.equal(coletado.erro, null);
  assert.equal(coletado.temPredecessor, false);
});

test("coletarReleases: nome do repositorio com caracteres especiais e' escapado", async () => {
  const api = criarApiFalsa({ releases: { "a/c++": [release("v1", "2024-12-01T00:00:00Z")] } });
  const coletado = await coletarReleases(clientePara(api), "a/c++", janela);
  assert.equal(coletado.erro, null);
  assert.match(api.chamadas[0].caminho, /\/repos\/a\/c%2B%2B\/releases/);
});
