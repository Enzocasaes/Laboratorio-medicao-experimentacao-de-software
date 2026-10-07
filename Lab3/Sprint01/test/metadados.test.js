import { test } from "node:test";
import assert from "node:assert/strict";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { criarJanela } from "../src/janela.js";
import { COLUNAS, STATUS, criarRegistro, ehItemDeBuscaValido, paraLinhaCSV } from "../src/selecao/modelo.js";
import { contarContribuidores, verificarGitHubActions } from "../src/selecao/verificacoes.js";
import { criarApiFalsa, repo, respostaJSON } from "./apoio/api-falsa.js";

const janela = criarJanela("2025-01-01", "2025-12-31");

function clientePara(api) {
  return criarClienteGitHub({ token: "t", fetch: api.fetch, esperar: async () => {} });
}

// ---- parsing do item da busca --------------------------------------------

test("criarRegistro: extrai os metadados do item da busca", () => {
  const item = repo("facebook/react", 230000, {
    id: 10270250,
    language: "JavaScript",
    created_at: "2013-05-24T16:15:54Z",
    default_branch: "main",
    _coletadoEm: "2026-10-05T12:00:00.000Z",
  });
  const r = criarRegistro(item, { rank: 1, janela });
  assert.equal(r.owner, "facebook");
  assert.equal(r.name, "react");
  assert.equal(r.full_name, "facebook/react");
  assert.equal(r.html_url, "https://github.com/facebook/react");
  assert.equal(r.default_branch, "main");
  assert.equal(r.stars, 230000);
  assert.equal(r.language, "JavaScript");
  assert.equal(r.age_years, 12.61);
  assert.equal(r.created_relative_to_window, "before_window");
  assert.equal(r.status, STATUS.PENDENTE);
  assert.equal(r.contributors, null);
  assert.equal(r.releases_in_window, null);
  assert.equal(r.valid_workflow_runs, null);
  assert.equal(r.collected_at, "2026-10-05T12:00:00.000Z");
  assert.deepEqual(r.metadata_errors, []);
});

test("criarRegistro: default branch diferente de main e' preservado", () => {
  const r = criarRegistro(repo("torvalds/linux", 1e5, { default_branch: "master" }), { rank: 1, janela });
  assert.equal(r.default_branch, "master");
});

test("criarRegistro: repositorio sem linguagem principal -> language null", () => {
  const r = criarRegistro(repo("x/docs", 5000, { language: null }), { rank: 1, janela });
  assert.equal(r.language, null);
  const semCampo = { ...repo("x/docs2", 5000) };
  delete semCampo.language;
  assert.equal(criarRegistro(semCampo, { rank: 2, janela }).language, null);
});

test("criarRegistro: sem default_branch ou created_at invalido -> registrado em metadata_errors", () => {
  const r = criarRegistro(repo("x/y", 5000, { default_branch: "", created_at: "lixo" }), { rank: 1, janela });
  assert.equal(r.default_branch, null);
  assert.equal(r.age_days, null);
  assert.deepEqual(r.metadata_errors, ["missing_default_branch", "invalid_created_at"]);
});

test("criarRegistro: owner/name sao derivados do full_name se faltarem", () => {
  const item = { id: 1, full_name: "dono/nome", stargazers_count: 2000, default_branch: "main", created_at: "2020-01-01T00:00:00Z" };
  const r = criarRegistro(item, { rank: 1, janela });
  assert.equal(r.owner, "dono");
  assert.equal(r.name, "nome");
  assert.equal(r.html_url, "https://github.com/dono/nome");
});

test("ehItemDeBuscaValido: exige id, full_name owner/name e estrelas", () => {
  assert.equal(ehItemDeBuscaValido(repo("a/b", 10)), true);
  assert.equal(ehItemDeBuscaValido(null), false);
  assert.equal(ehItemDeBuscaValido({ ...repo("a/b", 10), id: "1" }), false);
  assert.equal(ehItemDeBuscaValido({ ...repo("a/b", 10), full_name: "sem-barra" }), false);
  assert.equal(ehItemDeBuscaValido({ ...repo("a/b", 10), stargazers_count: undefined }), false);
});

test("paraLinhaCSV: segue a ordem de COLUNAS e junta metadata_errors", () => {
  const r = criarRegistro(repo("a/b", 10, { default_branch: "" }), { rank: 7, janela });
  const linha = paraLinhaCSV(r);
  assert.equal(linha.length, COLUNAS.length);
  assert.equal(linha[COLUNAS.indexOf("rank")], 7);
  assert.equal(linha[COLUNAS.indexOf("metadata_errors")], "missing_default_branch");
});

// ---- GitHub Actions ------------------------------------------------------

test("verificarGitHubActions: total_count > 0 -> usa Actions", async () => {
  const api = criarApiFalsa({ actions: { "a/b": 4 } });
  assert.deepEqual(await verificarGitHubActions(clientePara(api), "a/b"), { possuiActions: true, totalWorkflows: 4, erro: null });
  assert.match(api.chamadas[0].caminho, /^\/repos\/a\/b\/actions\/workflows\?per_page=1$/);
});

test("verificarGitHubActions: total_count = 0 -> nao usa Actions", async () => {
  const api = criarApiFalsa({ actions: { "a/b": 0 } });
  assert.deepEqual(await verificarGitHubActions(clientePara(api), "a/b"), { possuiActions: false, totalWorkflows: 0, erro: null });
});

test("verificarGitHubActions: 404 e 403 viram motivo registravel", async () => {
  const api = criarApiFalsa({ actions: { "a/sumiu": respostaJSON(404, { message: "Not Found" }), "a/bloq": respostaJSON(403, { message: "Forbidden" }) } });
  const cliente = clientePara(api);
  assert.equal((await verificarGitHubActions(cliente, "a/sumiu")).erro, "actions_http_404");
  assert.equal((await verificarGitHubActions(cliente, "a/bloq")).erro, "actions_http_403");
});

test("verificarGitHubActions: 200 sem total_count -> resposta inesperada", async () => {
  const api = criarApiFalsa({ actions: { "a/b": respostaJSON(200, { workflows: [] }) } });
  assert.equal((await verificarGitHubActions(clientePara(api), "a/b")).erro, "actions_unexpected_response");
});

// ---- contribuidores ------------------------------------------------------

test("contarContribuidores: total = ultima pagina do Link (per_page=1&anon=true)", async () => {
  const api = criarApiFalsa({ contribuidores: { "a/b": 532 } });
  assert.deepEqual(await contarContribuidores(clientePara(api), "a/b"), { contribuidores: 532, erro: null });
  const pedido = new URL(api.chamadas[0].url);
  assert.equal(pedido.searchParams.get("per_page"), "1");
  assert.equal(pedido.searchParams.get("anon"), "true");
  assert.equal(api.chamadas.length, 1, "nao baixa a lista inteira");
});

test("contarContribuidores: sem cabecalho Link e 1 item -> 1", async () => {
  const api = criarApiFalsa({ contribuidores: { "a/b": 1 } });
  assert.deepEqual(await contarContribuidores(clientePara(api), "a/b"), { contribuidores: 1, erro: null });
});

test("contarContribuidores: lista vazia (200 []) -> 0", async () => {
  const api = criarApiFalsa({ contribuidores: { "a/b": 0 } });
  assert.deepEqual(await contarContribuidores(clientePara(api), "a/b"), { contribuidores: 0, erro: null });
});

test("contarContribuidores: repositorio vazio (204) -> 0", async () => {
  const api = criarApiFalsa({ contribuidores: { "a/b": respostaJSON(204) } });
  assert.deepEqual(await contarContribuidores(clientePara(api), "a/b"), { contribuidores: 0, erro: null });
});

test("contarContribuidores: historico grande demais (403) -> null com motivo", async () => {
  const api = criarApiFalsa({
    contribuidores: {
      "torvalds/linux": respostaJSON(403, {
        message: "The history or contributor list is too large to list contributors for this repository via the API.",
      }),
    },
  });
  assert.deepEqual(await contarContribuidores(clientePara(api), "torvalds/linux"), { contribuidores: null, erro: "contributors_list_too_large" });
});

test("contarContribuidores: 404 e corpo inesperado -> null com motivo", async () => {
  const api = criarApiFalsa({
    contribuidores: { "a/sumiu": respostaJSON(404, { message: "Not Found" }), "a/estranho": respostaJSON(200, { nao: "lista" }) },
  });
  const cliente = clientePara(api);
  assert.equal((await contarContribuidores(cliente, "a/sumiu")).erro, "contributors_http_404");
  assert.equal((await contarContribuidores(cliente, "a/estranho")).erro, "contributors_unexpected_response");
});

test("contarContribuidores: Link com next mas sem last, ou last sem page -> nao chuta", async () => {
  const api = criarApiFalsa({
    contribuidores: {
      "a/sem-last": respostaJSON(200, [{}], { link: '<https://api.github.com/x?page=2>; rel="next"' }),
      "a/last-ruim": respostaJSON(200, [{}], { link: '<https://api.github.com/x?per_page=1>; rel="last"' }),
    },
  });
  const cliente = clientePara(api);
  assert.equal((await contarContribuidores(cliente, "a/sem-last")).erro, "contributors_missing_last_page");
  assert.equal((await contarContribuidores(cliente, "a/last-ruim")).erro, "contributors_invalid_link_header");
});
