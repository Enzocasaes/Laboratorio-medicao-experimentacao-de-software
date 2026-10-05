import { test } from "node:test";
import assert from "node:assert/strict";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { buscarCandidatos, compararCandidatos, consultaDaFatia } from "../src/selecao/busca.js";
import { criarApiFalsa, repo, respostaJSON } from "./apoio/api-falsa.js";

function clientePara(api) {
  return criarClienteGitHub({ token: "t", fetch: api.fetch, esperar: async () => {} });
}

// n repositorios com estrelas decrescentes a partir de `topo`, de `passo` em `passo`.
function gerarRepos(n, topo, passo = 1) {
  return Array.from({ length: n }, (_, i) => repo(`org/repo-${String(i).padStart(3, "0")}`, topo - i * passo, { id: i + 1 }));
}

const nomes = (candidatos) => candidatos.map((c) => c.full_name);

test("consultaDaFatia: primeira fatia usa a consulta do enunciado; as seguintes, faixa fechada", () => {
  assert.equal(consultaDaFatia(1000, null), "stars:>1000");
  assert.equal(consultaDaFatia(1000, 5432), "stars:1001..5432");
});

test("compararCandidatos: estrelas desc, empate por full_name (sem diferenciar caixa)", () => {
  const lista = [
    { id: 3, full_name: "b/x", stargazers_count: 10 },
    { id: 1, full_name: "A/y", stargazers_count: 10 },
    { id: 2, full_name: "c/z", stargazers_count: 99 },
  ];
  assert.deepEqual(nomes(lista.sort(compararCandidatos)), ["c/z", "A/y", "b/x"]);
});

test("uma fatia so', com paginacao seguindo o Link rel=next", async () => {
  const api = criarApiFalsa({ repos: gerarRepos(25, 5000) });
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 25, porPagina: 10 });
  assert.equal(r.candidatos.length, 25);
  assert.equal(r.fatias.length, 1);
  assert.equal(r.fatias[0].pages, 3);
  assert.equal(r.fatias[0].query, "stars:>1000");
  const paginas = api.chamadas.map((c) => new URL(c.url).searchParams.get("page"));
  assert.deepEqual(paginas, [null, "2", "3"]);
});

test("fatiamento: com limite por consulta, reune os N com mais estrelas em varias fatias", async () => {
  const repos = gerarRepos(40, 9000, 10);
  const api = criarApiFalsa({ repos, limiteDaBusca: 10 }); // simula o teto de 1.000 da API
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 35, porPagina: 5 });
  const esperado = [...repos].sort(compararCandidatos).slice(0, 35);
  assert.deepEqual(nomes(r.candidatos), nomes(esperado));
  assert.ok(r.fatias.length >= 4);
  assert.equal(r.fatias[1].query, `stars:1001..${repos[9].stargazers_count}`);
  // nenhum repositorio repetido
  assert.equal(new Set(r.candidatos.map((c) => c.id)).size, 35);
});

test("fatiamento: nao perde empates na fronteira entre fatias", async () => {
  // 3 repositorios com 3000 estrelas; o limite (3) corta a 1a fatia no meio deles.
  const repos = [
    repo("a/topo", 9000, { id: 1 }),
    ...Array.from({ length: 3 }, (_, i) => repo(`empate/r${i}`, 3000, { id: 10 + i })),
    repo("z/baixo", 2000, { id: 99 }),
  ];
  const api = criarApiFalsa({ repos, limiteDaBusca: 3 });
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 5, porPagina: 100 });
  assert.deepEqual(nomes(r.candidatos), ["a/topo", "empate/r0", "empate/r1", "empate/r2", "z/baixo"]);
  assert.equal(r.fatias.some((f) => f.truncated), false);
});

test("fatiamento: fatia parada num empate que cabe no limite NAO e' marcada como truncada", async () => {
  // A 2a fatia devolve so' os 6 empatados (limite 6), o teto nao desce;
  // a consulta exata confirma que nao ha mais nenhum com 3000 estrelas.
  const repos = [
    repo("a/topo", 9000, { id: 1 }),
    ...Array.from({ length: 6 }, (_, i) => repo(`empate/r${i}`, 3000, { id: 10 + i })),
    repo("z/baixo", 2000, { id: 99 }),
  ];
  const api = criarApiFalsa({ repos, limiteDaBusca: 6 });
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 8, porPagina: 100 });
  assert.equal(r.candidatos.length, 8);
  assert.equal(r.fatias.some((f) => f.truncated), false);
  assert.deepEqual(r.fatias[1].ties_at_ceiling, { stars: 3000, collected: 6, total_count: 6 });
  assert.ok(api.chamadas.some((c) => new URL(c.url).searchParams.get("q") === "stars:3000"));
});

test("fatiamento: mais empates que o limite da busca -> registra truncamento e termina", async () => {
  const repos = Array.from({ length: 6 }, (_, i) => repo(`empate/r${i}`, 3000, { id: i + 1 }));
  repos.push(repo("z/baixo", 2000, { id: 99 }));
  const avisos = [];
  const api = criarApiFalsa({ repos, limiteDaBusca: 3 });
  const r = await buscarCandidatos(clientePara(api), {
    estrelasAcimaDe: 1000,
    quantidade: 7,
    log: { info() {}, aviso: (m) => avisos.push(m) },
  });
  assert.equal(r.fatias.some((f) => f.truncated), true);
  assert.ok(avisos.some((m) => /os demais ficaram de fora/.test(m)));
  assert.ok(nomes(r.candidatos).includes("z/baixo"), "segue para as faixas abaixo do empate");
  assert.equal(r.candidatos.length, 4); // 3 empatados alcancaveis + z/baixo
});

test("selecao deterministica: mesma entrada -> mesmos candidatos, mesmo com empates", async () => {
  const repos = [repo("b/b", 5000, { id: 2 }), repo("a/a", 5000, { id: 1 }), repo("c/c", 5000, { id: 3 })];
  const r1 = await buscarCandidatos(clientePara(criarApiFalsa({ repos })), { estrelasAcimaDe: 1000, quantidade: 2 });
  const r2 = await buscarCandidatos(clientePara(criarApiFalsa({ repos: [...repos].reverse() })), { estrelasAcimaDe: 1000, quantidade: 2 });
  assert.deepEqual(nomes(r1.candidatos), ["a/a", "b/b"]);
  assert.deepEqual(nomes(r2.candidatos), nomes(r1.candidatos));
});

test("menos repositorios que o pedido: devolve todos e para", async () => {
  const api = criarApiFalsa({ repos: gerarRepos(3, 4000) });
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 100 });
  assert.equal(r.candidatos.length, 3);
  assert.equal(r.fatias.length, 1);
});

test("busca vazia: nenhum candidato, sem erro", async () => {
  const api = criarApiFalsa({ repos: [] });
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 10 });
  assert.deepEqual(r.candidatos, []);
  assert.equal(r.fatias[0].total_count, 0);
});

test("respeita o minimo de estrelas (estritamente acima)", async () => {
  const repos = [repo("a/a", 1001, { id: 1 }), repo("b/b", 1000, { id: 2 }), repo("c/c", 999, { id: 3 })];
  const r = await buscarCandidatos(clientePara(criarApiFalsa({ repos })), { estrelasAcimaDe: 1000, quantidade: 10 });
  assert.deepEqual(nomes(r.candidatos), ["a/a"]);
});

test("item malformado na busca e' ignorado e contado (nao derruba a coleta)", async () => {
  const api = criarApiFalsa({
    antes: (url) =>
      url.pathname === "/search/repositories"
        ? respostaJSON(200, { total_count: 2, items: [repo("a/a", 5000, { id: 1 }), { id: "x", full_name: null }] })
        : null,
  });
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 10, log: { info() {}, aviso() {} } });
  assert.deepEqual(nomes(r.candidatos), ["a/a"]);
  assert.equal(r.itensInvalidos, 1);
});

test("incomplete_results = true fica registrado na fatia", async () => {
  const api = criarApiFalsa({
    antes: () => respostaJSON(200, { total_count: 1, incomplete_results: true, items: [repo("a/a", 5000)] }),
  });
  const r = await buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 1 });
  assert.equal(r.fatias[0].incomplete_results, true);
});

test("erro HTTP na busca (ex.: 422) interrompe com ErroGitHub", async () => {
  const api = criarApiFalsa({ antes: () => respostaJSON(422, { message: "Validation Failed" }) });
  await assert.rejects(
    buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 1 }),
    /busca "stars:>1000" falhou: HTTP 422 - Validation Failed/
  );
});

test("resposta 200 sem items interrompe com erro claro", async () => {
  const api = criarApiFalsa({ antes: () => respostaJSON(200, { message: "estranho" }) });
  await assert.rejects(buscarCandidatos(clientePara(api), { estrelasAcimaDe: 1000, quantidade: 1 }), /falhou: HTTP 200/);
});
