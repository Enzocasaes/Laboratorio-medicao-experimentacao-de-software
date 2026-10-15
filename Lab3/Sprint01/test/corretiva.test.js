// Heuristica de release corretiva e CFR (b), com fixtures montadas a mao.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INCREMENTO,
  SITUACAO_CFR,
  TIPO_DE_COMMIT,
  VERSOES,
  avaliarFalhas,
  classificarCommit,
  incrementoDeVersao,
  lerVersao,
  preverTodas,
  resumirCFREntrega,
  sinaisDaRelease,
  tituloDoCommit,
  versaoPorId,
} from "../src/releases/corretiva.js";
import { criarJanela } from "../src/janela.js";

const rel = (tag, publicadaEm, extra = {}) => ({
  release_id: extra.release_id ?? tag,
  tag_name: tag,
  published_at: publicadaEm,
  in_window: extra.in_window ?? true,
  is_deploy: true,
  ...extra,
});
const commits = (...mensagens) => mensagens.map((mensagem, i) => ({ sha: `c${i}`, data: "2025-01-01T00:00:00Z", mensagem }));

// ---- versao semantica ------------------------------------------------------

test("lerVersao: prefixos, sufixos, CalVer e quatro componentes", () => {
  assert.deepEqual(lerVersao("v2.3.1"), { prefixo: "", numeros: [2, 3, 1], sufixo: "" });
  assert.deepEqual(lerVersao("1.2"), { prefixo: "", numeros: [1, 2], sufixo: "" });
  assert.deepEqual(lerVersao("release-1.2.3"), { prefixo: "release-", numeros: [1, 2, 3], sufixo: "" });
  assert.deepEqual(lerVersao("@scope/pkg@1.2.3"), { prefixo: "@scope/pkg@", numeros: [1, 2, 3], sufixo: "" });
  assert.deepEqual(lerVersao("1.2.3-rc.1"), { prefixo: "", numeros: [1, 2, 3], sufixo: "-rc.1" });
  assert.deepEqual(lerVersao("2025.10.1").numeros, [2025, 10, 1]);
  assert.deepEqual(lerVersao("1.2.3.4").numeros, [1, 2, 3, 4]);
  for (const tag of ["nightly", "v1", "r42", "", null]) assert.equal(lerVersao(tag), null, String(tag));
});

test("incrementoDeVersao: qual componente mudou", () => {
  assert.equal(incrementoDeVersao("v2.3.0", "v2.3.1"), INCREMENTO.PATCH);
  assert.equal(incrementoDeVersao("v2.3.1", "v2.4.0"), INCREMENTO.MINOR);
  assert.equal(incrementoDeVersao("v2.4.0", "v3.0.0"), INCREMENTO.MAJOR);
  assert.equal(incrementoDeVersao("1.2", "1.2.1"), INCREMENTO.PATCH, "componente ausente conta como 0");
  assert.equal(incrementoDeVersao("1.2.3.4", "1.2.3.5"), INCREMENTO.PATCH);
  assert.equal(incrementoDeVersao("v1.2.3-beta", "v1.2.3"), INCREMENTO.IGUAL);
  assert.equal(incrementoDeVersao("v2.0.0", "v1.9.4"), INCREMENTO.RETROCESSO, "correcao numa linha antiga");
  assert.equal(incrementoDeVersao("core@1.2.3", "cli@1.2.4"), INCREMENTO.DESCONHECIDO, "pacotes diferentes de um monorepo");
  assert.equal(incrementoDeVersao("nightly-1", "nightly-2"), INCREMENTO.DESCONHECIDO);
});

// ---- mensagens de commit -------------------------------------------------

test("tituloDoCommit: primeira linha, ou o titulo do PR num merge", () => {
  assert.equal(tituloDoCommit("fix: crash ao abrir arquivo\n\ncorpo longo"), "fix: crash ao abrir arquivo");
  assert.equal(tituloDoCommit("Merge pull request #12 from user/branch\n\nFix null pointer on startup"), "Fix null pointer on startup");
  assert.equal(tituloDoCommit("Merge pull request #12 from user/fix-branch"), "Merge pull request #12 from user/fix-branch");
  assert.equal(tituloDoCommit(null), "");
});

test("classificarCommit: revert, hotfix e fix (os sinais do enunciado)", () => {
  assert.equal(classificarCommit('Revert "feat: novo parser"'), TIPO_DE_COMMIT.REVERT);
  assert.equal(classificarCommit("rollback the cache change"), TIPO_DE_COMMIT.REVERT);
  assert.equal(classificarCommit("hotfix: login quebrado"), TIPO_DE_COMMIT.HOTFIX);
  assert.equal(classificarCommit("Hot-fix for the installer"), TIPO_DE_COMMIT.HOTFIX);
  for (const m of ["fix: crash ao abrir arquivo", "fix(parser): handle empty input", "Fixes #123", "Fixed race in scheduler", "bugfix for windows paths", "Address regression in 2.3", "Crash when config is missing"]) {
    assert.equal(classificarCommit(m), TIPO_DE_COMMIT.FIX, m);
  }
});

test("classificarCommit: palavras parecidas, manutencao e ruido nao contam como correcao", () => {
  for (const m of ["Add prefix option", "Update test fixtures", "fixup! wip", "feat: suffix support", "Refactor bugtracker links"]) {
    assert.equal(classificarCommit(m), TIPO_DE_COMMIT.OUTRO, m);
  }
  for (const m of ["docs: fix broken link", "Fix typo in README", "style: fix formatting", "fix lint", "test: fix flaky test"]) {
    assert.equal(classificarCommit(m), TIPO_DE_COMMIT.OUTRO, m);
  }
  for (const m of ["chore(deps): bump lodash from 4.17.20 to 4.17.21", "Bump actions/checkout from 3 to 4", "fix(deps): update dependency react to v18.3.1", "build(deps-dev): bump vite"]) {
    assert.equal(classificarCommit(m), TIPO_DE_COMMIT.DEPENDENCIA, m);
  }
  for (const m of ["chore(release): 1.2.3", "Release v1.2.3", "Bump version to 2.0.1", "v1.2.3", "Prepare release 4.1"]) {
    assert.equal(classificarCommit(m), TIPO_DE_COMMIT.RELEASE, m);
  }
});

test("classificarCommit: atualizacao de dependencia por vulnerabilidade conta como correcao", () => {
  assert.equal(classificarCommit("chore(deps): bump undici to fix CVE-2025-12345"), TIPO_DE_COMMIT.FIX);
  assert.equal(classificarCommit("Bump x from 1 to 2 (GHSA-abcd-1234-wxyz)"), TIPO_DE_COMMIT.FIX);
});

// ---- sinais e versoes ------------------------------------------------------

test("sinaisDaRelease: conta os commits e calcula a proporcao corretiva sem dependencias", () => {
  const s = sinaisDaRelease({
    release: rel("v2.3.1", "2025-05-12T00:00:00Z"),
    base: rel("v2.3.0", "2025-05-10T00:00:00Z"),
    commits: commits("fix: crash ao abrir arquivo", "chore(deps): bump a from 1 to 2", "chore(release): 2.3.1", "refactor: x"),
  });
  assert.equal(s.version_increment, INCREMENTO.PATCH);
  assert.equal(s.commits_read, 4);
  assert.deepEqual([s.commits_fix, s.commits_dependency, s.commits_release], [1, 1, 1]);
  assert.equal(s.corrective_share, 0.5, "1 fix entre 2 commits que mudam codigo");
});

test("sinaisDaRelease: sem comparacao, os sinais de commit ficam null", () => {
  const primeira = sinaisDaRelease({ release: rel("v1.0.0", "2025-01-01T00:00:00Z") });
  assert.equal(primeira.version_increment, null);
  assert.equal(primeira.commits_available, false);
  assert.equal(primeira.corrective_share, null);

  const comErro = sinaisDaRelease({ release: rel("v1.0.1", "2025-01-02T00:00:00Z"), base: rel("v1.0.0", "2025-01-01T00:00:00Z"), erro: "compare_http_404" });
  assert.equal(comErro.commits_available, false);
  assert.equal(comErro.version_increment, INCREMENTO.PATCH);
});

test("versoes: o exemplo do enunciado (2.3.0 -> 2.3.1 com 'fix: crash') e' corretivo em todas", () => {
  const s = sinaisDaRelease({ release: rel("v2.3.1", "2025-05-12T00:00:00Z"), base: rel("v2.3.0", "2025-05-10T00:00:00Z"), commits: commits("fix: crash ao abrir arquivo") });
  assert.deepEqual(preverTodas(s), Object.fromEntries(VERSOES.map((v) => [v.id, true])));
});

test("versoes: cada regra separa um caso diferente", () => {
  const base = rel("v1.2.0", "2025-01-01T00:00:00Z");
  const prever = (tag, ...mensagens) => preverTodas(sinaisDaRelease({ release: rel(tag, "2025-01-03T00:00:00Z"), base, commits: commits(...mensagens) }));

  // patch sem nenhum commit de correcao: so' a v1 (semver) diz "sim"
  assert.deepEqual(prever("v1.2.1", "feat: nova opcao", "refactor: x"), {
    "v1-semver-patch": true, "v2-commits-fix": false, "v3-patch-e-commits": false, "v4-maioria-corretiva": false,
  });
  // minor com 1 fix entre 4 features: v2 diz "sim" (basta um fix), v4 nao (nao e' maioria)
  assert.deepEqual(prever("v1.3.0", "fix: x", "feat: a", "feat: b", "feat: c"), {
    "v1-semver-patch": false, "v2-commits-fix": true, "v3-patch-e-commits": false, "v4-maioria-corretiva": false,
  });
  // minor que e' quase so' correcao: a v4 aceita (o guia: "uma minor pode ser corretiva")
  assert.equal(prever("v1.3.0", "fix: x", "fix: y", "docs: z")["v4-maioria-corretiva"], true);
  // major nunca e' corretiva na v4
  assert.equal(prever("v2.0.0", "fix: x")["v4-maioria-corretiva"], false);
});

test("versoes: tag sem versao numerica deixa as regras de semver sem previsao", () => {
  const s = sinaisDaRelease({ release: rel("nightly-2", "2025-01-03T00:00:00Z"), base: rel("nightly-1", "2025-01-01T00:00:00Z"), commits: commits("fix: x") });
  const p = preverTodas(s);
  assert.equal(p["v1-semver-patch"], null);
  assert.equal(p["v3-patch-e-commits"], null);
  assert.equal(p["v2-commits-fix"], true);
  assert.equal(p["v4-maioria-corretiva"], true);
});

test("versaoPorId: versao desconhecida e' erro com a lista das disponiveis", () => {
  assert.equal(versaoPorId("v1-semver-patch").id, "v1-semver-patch");
  assert.throws(() => versaoPorId("v9"), /disponiveis: v1-semver-patch, /);
});

// ---- CFR (b) ---------------------------------------------------------------

const janela = criarJanela("2025-01-01", "2025-12-31");

test("avaliarFalhas: o exemplo do enunciado (v2.3.0 falhou, v2.4.0 nao)", () => {
  const deploys = [
    rel("v2.3.0", "2025-05-10T00:00:00Z"),
    rel("v2.3.1", "2025-05-12T00:00:00Z"),
    rel("v2.4.0", "2025-06-01T00:00:00Z"),
    rel("v2.5.0", "2025-06-20T00:00:00Z"),
  ];
  const corretivas = new Set(["v2.3.1"]);
  const avaliacoes = avaliarFalhas(deploys, (r) => corretivas.has(r.tag_name), janela);
  assert.deepEqual(
    avaliacoes.map((a) => [a.release.tag_name, a.situacao]),
    [["v2.3.0", "failed"], ["v2.3.1", "not_failed"], ["v2.4.0", "not_failed"], ["v2.5.0", "not_failed"]]
  );
  assert.equal(avaliacoes[0].dias_ate_seguinte, 2);
});

test("avaliarFalhas: corretiva depois de 7 dias nao conta; exatamente 7 dias conta", () => {
  const deploys = [rel("a", "2025-03-01T00:00:00Z"), rel("b", "2025-03-08T00:00:00Z"), rel("c", "2025-03-15T00:00:01Z")];
  const avaliacoes = avaliarFalhas(deploys, () => true, janela);
  assert.deepEqual(avaliacoes.map((a) => a.situacao), ["failed", "not_failed", "not_failed"]);
});

test("avaliarFalhas: so' a release seguinte imediata e' olhada", () => {
  // a -> b (feature, 1 dia) -> c (corretiva, 2 dias depois de a): c corrige b, nao a.
  const deploys = [rel("a", "2025-03-01T00:00:00Z"), rel("b", "2025-03-02T00:00:00Z"), rel("c", "2025-03-03T00:00:00Z")];
  const avaliacoes = avaliarFalhas(deploys, (r) => r.tag_name === "c", janela);
  assert.deepEqual(avaliacoes.map((a) => a.situacao), ["not_failed", "failed", "not_failed"]);
});

test("avaliarFalhas: ultimos 7 dias da janela sao censurados; seguinte sem previsao deixa indeterminada", () => {
  const deploys = [
    rel("antiga", "2024-12-30T00:00:00Z", { in_window: false }),
    rel("a", "2025-06-01T00:00:00Z"),
    rel("b", "2025-06-03T00:00:00Z"),
    rel("c", "2025-12-24T23:59:59Z"),
    rel("d", "2025-12-25T00:00:00Z"), // fim exclusivo 2026-01-01 - 7 dias: censurada
    rel("depois", "2026-01-02T00:00:00Z", { in_window: false }),
  ];
  const previsto = { b: null, d: true };
  const avaliacoes = avaliarFalhas(deploys, (r) => (Object.hasOwn(previsto, r.tag_name) ? previsto[r.tag_name] : false), janela);
  assert.deepEqual(
    avaliacoes.map((a) => [a.release.tag_name, a.situacao]),
    [["a", "undetermined"], ["b", "not_failed"], ["c", "failed"], ["d", "censored"]],
    "releases fora da janela nao sao avaliadas, mas servem de seguinte"
  );
});

test("resumirCFREntrega: censuradas e indeterminadas ficam fora do denominador", () => {
  const avaliacoes = ["failed", "not_failed", "not_failed", "not_failed", "censored", "undetermined"].map((situacao) => ({ situacao }));
  const r = resumirCFREntrega("a/b", "v3-patch-e-commits", avaliacoes, [true, false, null, false, true, false]);
  assert.equal(r.cfr_delivery_evaluated, 4);
  assert.equal(r.cfr_delivery_failed, 1);
  assert.equal(r.change_failure_rate_delivery, 0.25);
  assert.equal(r.cfr_delivery_censored, 1);
  assert.equal(r.cfr_delivery_undetermined, 1);
  assert.equal(r.deploys_in_window, 6);
  assert.equal(r.corrective_releases, 2);
  assert.equal(r.releases_classified, 5);
  assert.equal(r.rework_rate, 0.4);
});

test("resumirCFREntrega: sem release avaliada o CFR e' vazio, nao zero", () => {
  const r = resumirCFREntrega("a/b", "v1-semver-patch", [{ situacao: "censored" }], [null]);
  assert.equal(r.change_failure_rate_delivery, null);
  assert.equal(r.rework_rate, null);
});
