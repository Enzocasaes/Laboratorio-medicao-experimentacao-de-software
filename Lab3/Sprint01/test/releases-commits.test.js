// Commits entre duas releases (endpoint compare): paginacao, escape das tags,
// deteccao de truncamento e erros registraveis.

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseHead } from "../src/github/caminhos.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { coletarCommitsEntreReleases } from "../src/releases/commits.js";
import { commit, criarApiFalsa, respostaJSON } from "./apoio/api-falsa.js";

function clientePara(api) {
  return criarClienteGitHub({ token: "t", fetch: api.fetch, esperar: async () => {} });
}

const tresCommits = [
  commit("c1", "2025-03-02T00:00:00Z"),
  commit("c2", "2025-03-10T00:00:00Z"),
  commit("c3", "2025-03-14T00:00:00Z"),
];

test("baseHead: monta {base}...{head} escapando cada ref", () => {
  assert.equal(baseHead("v1.0", "v1.1"), "v1.0...v1.1");
  assert.equal(baseHead("release/1.2", "release/1.3"), "release%2F1.2...release%2F1.3");
});

test("coletarCommitsEntreReleases: le author.date de cada commit", async () => {
  const api = criarApiFalsa({ comparacoes: { "a/b": { "v1.0...v1.1": tresCommits } } });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1");

  assert.equal(coletado.erro, null);
  assert.equal(coletado.total, 3);
  assert.equal(coletado.truncada, false);
  assert.deepEqual(coletado.commits, [
    { sha: "c1", data: "2025-03-02T00:00:00Z" },
    { sha: "c2", data: "2025-03-10T00:00:00Z" },
    { sha: "c3", data: "2025-03-14T00:00:00Z" },
  ]);
  assert.match(api.chamadas[0].caminho, /^\/repos\/a\/b\/compare\/v1\.0\.\.\.v1\.1\?per_page=100$/);
});

test("coletarCommitsEntreReleases: commit sem author.date vira data null", async () => {
  const api = criarApiFalsa({
    comparacoes: { "a/b": { "v1.0...v1.1": [{ sha: "c1" }, commit("c2", "2025-03-10T00:00:00Z")] } },
  });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1");
  assert.deepEqual(coletado.commits[0], { sha: "c1", data: null });
});

test("coletarCommitsEntreReleases: segue o Link next em todas as paginas", async () => {
  const api = criarApiFalsa({ comparacoes: { "a/b": { "v1.0...v1.1": tresCommits } } });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1", { porPagina: 1 });

  assert.equal(coletado.paginas, 3);
  assert.equal(coletado.commits.length, 3);
  assert.equal(coletado.truncada, false);
  assert.equal(api.chamadas.length, 3);
});

test("coletarCommitsEntreReleases: tag com barra e' escapada na URL", async () => {
  const api = criarApiFalsa({ comparacoes: { "a/b": { "release/1.2...release/1.3": tresCommits } } });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "release/1.2", "release/1.3");

  assert.equal(coletado.erro, null, "a API falsa achou a comparacao, logo o escape e' reversivel");
  assert.equal(coletado.commits.length, 3);
  assert.match(api.chamadas[0].caminho, /compare\/release%2F1\.2\.\.\.release%2F1\.3/);
});

test("coletarCommitsEntreReleases: teto de commits marca truncada e para de paginar", async () => {
  const muitos = Array.from({ length: 10 }, (_, i) => commit(`c${i}`, `2025-03-0${i + 1}T00:00:00Z`));
  const api = criarApiFalsa({ comparacoes: { "a/b": { "v1.0...v1.1": muitos } } });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1", {
    porPagina: 2,
    maxCommits: 4,
  });

  assert.equal(coletado.truncada, true);
  assert.equal(coletado.commits.length, 4);
  assert.equal(coletado.paginas, 2, "nao continua paginando depois do teto");
  assert.equal(coletado.total, 10, "total_commits informa o tamanho real da comparacao");
});

test("coletarCommitsEntreReleases: total_commits maior que os commits lidos -> truncada", async () => {
  const api = criarApiFalsa({
    comparacoes: { "a/b": { "v1.0...v1.1": { commits: tresCommits, total_commits: 5000 } } },
  });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1");

  assert.equal(coletado.truncada, true);
  assert.equal(coletado.total, 5000);
  assert.equal(coletado.commits.length, 3);
});

test("coletarCommitsEntreReleases: comparacao sem commits novos", async () => {
  const api = criarApiFalsa({ comparacoes: { "a/b": { "v1.0...v1.1": [] } } });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1");

  assert.deepEqual(coletado.commits, []);
  assert.equal(coletado.total, 0);
  assert.equal(coletado.truncada, false);
  assert.equal(coletado.erro, null);
});

test("coletarCommitsEntreReleases: tag apagada (404) vira motivo registravel", async () => {
  const api = criarApiFalsa({ comparacoes: { "a/b": {} } });
  const coletado = await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "sumiu");

  assert.equal(coletado.erro, "compare_http_404");
  assert.deepEqual(coletado.commits, []);
});

test("coletarCommitsEntreReleases: comparacao invalida (422) vira motivo registravel", async () => {
  const api = criarApiFalsa({
    comparacoes: { "a/b": { "v1.0...v1.1": respostaJSON(422, { message: "Validation Failed" }) } },
  });
  assert.equal(
    (await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1")).erro,
    "compare_http_422"
  );
});

test("coletarCommitsEntreReleases: corpo sem o campo commits -> resposta inesperada", async () => {
  const api = criarApiFalsa({
    comparacoes: { "a/b": { "v1.0...v1.1": respostaJSON(200, { status: "identical" }) } },
  });
  assert.equal(
    (await coletarCommitsEntreReleases(clientePara(api), "a/b", "v1.0", "v1.1")).erro,
    "compare_unexpected_response"
  );
});
