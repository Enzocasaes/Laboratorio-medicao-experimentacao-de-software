import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { relative, sep } from "node:path";
import {
  caminhoNoCache,
  chaveDaRequisicao,
  criarCacheEmDisco,
  criarCacheEmMemoria,
} from "../src/github/cache.js";
import { interpretarLink, numeroDaPagina } from "../src/github/link.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

// ---- cabecalho Link -------------------------------------------------------

test("interpretarLink: extrai next/last/prev/first", () => {
  const link =
    '<https://api.github.com/repositories/1/contributors?per_page=1&anon=true&page=2>; rel="next", ' +
    '<https://api.github.com/repositories/1/contributors?per_page=1&anon=true&page=532>; rel="last"';
  const rels = interpretarLink(link);
  assert.equal(numeroDaPagina(rels.next), 2);
  assert.equal(numeroDaPagina(rels.last), 532);
  assert.equal(rels.prev, undefined);
});

test("interpretarLink: cabecalho ausente, vazio ou malformado -> objeto vazio", () => {
  assert.deepEqual(interpretarLink(null), {});
  assert.deepEqual(interpretarLink(undefined), {});
  assert.deepEqual(interpretarLink(""), {});
  assert.deepEqual(interpretarLink("lixo sem formato"), {});
});

test("numeroDaPagina: URL sem page, page invalido ou nao-URL -> null", () => {
  assert.equal(numeroDaPagina("https://api.github.com/x?per_page=1"), null);
  assert.equal(numeroDaPagina("https://api.github.com/x?page=abc"), null);
  assert.equal(numeroDaPagina("https://api.github.com/x?page=0"), null);
  assert.equal(numeroDaPagina("nao e url"), null);
  assert.equal(numeroDaPagina(undefined), null);
});

// ---- cache ----------------------------------------------------------------

test("chaveDaRequisicao: independe da ordem dos parametros e do host", () => {
  const a = chaveDaRequisicao("https://api.github.com/repos/a/b/contributors?per_page=1&anon=true");
  const b = chaveDaRequisicao("https://api.github.com/repos/a/b/contributors?anon=true&per_page=1");
  assert.equal(a, b);
  assert.equal(a, "/repos/a/b/contributors?anon=true&per_page=1");
  assert.equal(chaveDaRequisicao("https://api.github.com/rate_limit"), "/rate_limit");
});

test("caminhoNoCache: caminho legivel por repositorio/endpoint, sem caracteres perigosos", () => {
  // O separador depende do sistema (\ no Windows, / no Linux/macOS): o teste
  // normaliza antes de comparar, senao passa so' em metade das maquinas.
  const paraBarras = (caminho) => relative("/c", caminho).split(sep).join("/");

  assert.match(
    paraBarras(caminhoNoCache("/c", "/search/repositories?q=stars%3A1001..5000&page=2")),
    /^search\/repositories\/[A-Za-z0-9._=&-]+__[0-9a-f]{10}\.json$/
  );
  assert.match(
    paraBarras(caminhoNoCache("/c", "/repos/facebook/react/actions/workflows?per_page=1")),
    /^repos\/facebook\/react\/actions\/workflows\/per_page=1__/
  );
});

test("caminhoNoCache: chaves diferentes que limpam igual nao colidem (hash)", () => {
  assert.notEqual(caminhoNoCache("/c", "/x?q=a:b"), caminhoNoCache("/c", "/x?q=a_b"));
});

test("cache em disco: inexistente -> null; gravado -> lido por outra instancia (retomada)", () => {
  const dir = pastaTemporaria();
  const chave = "/repos/a/b/actions/workflows?per_page=1";
  assert.equal(criarCacheEmDisco(dir).ler(chave), null);
  criarCacheEmDisco(dir).gravar(chave, { status: 200, corpo: { total_count: 2 } });
  assert.deepEqual(criarCacheEmDisco(dir).ler(chave), { status: 200, corpo: { total_count: 2 } });
});

test("cache em disco: gravacao atomica nao deixa arquivo temporario", () => {
  const dir = pastaTemporaria();
  const cache = criarCacheEmDisco(dir);
  cache.gravar("/rate_limit", { status: 200 });
  const arquivos = readdirSync(dir, { recursive: true });
  assert.equal(arquivos.some((a) => a.endsWith(".tmp")), false);
  assert.ok(existsSync(caminhoNoCache(dir, "/rate_limit")));
});

test("cache em disco: arquivo corrompido e' tratado como ausente (com aviso)", () => {
  const dir = pastaTemporaria();
  const cache = criarCacheEmDisco(dir, {
    log: { aviso: (m) => avisos.push(m) },
  });
  const avisos = [];
  cache.gravar("/x", { ok: true });
  writeFileSync(caminhoNoCache(dir, "/x"), '{"truncado": ');
  assert.equal(cache.ler("/x"), null);
  assert.match(avisos[0], /cache corrompido/);
});

test("cache em memoria: devolve copias (alterar o retorno nao altera o cache)", () => {
  const cache = criarCacheEmMemoria();
  assert.equal(cache.ler("/a"), null);
  cache.gravar("/a", { lista: [1] });
  cache.ler("/a").lista.push(2);
  assert.deepEqual(cache.ler("/a"), { lista: [1] });
});
