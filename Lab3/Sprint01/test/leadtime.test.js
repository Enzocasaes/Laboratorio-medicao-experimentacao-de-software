// Funcoes de calculo do lead time (RQ 02). Fixtures pequenas, feitas a mao,
// com o resultado conferido no papel - inclusive o exemplo numerico da secao 5
// do enunciado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarJanela } from "../src/janela.js";
import {
  AVALIACAO,
  avaliarRelease,
  horasEntre,
  iqr,
  mediana,
  paresParaAvaliar,
  percentil,
  resumirRepositorio,
  sequenciaDeDeploys,
} from "../src/releases/leadtime.js";
import { contarReleases, criarRelease } from "../src/releases/modelo.js";
import { release } from "./apoio/api-falsa.js";

const janela = criarJanela("2025-01-01", "2025-12-31");
const rel = (tag, publishedAt, extra = {}) => criarRelease(release(tag, publishedAt, extra), janela);
// Commit ja normalizado, como src/releases/commits.js entrega: { sha, data }.
// A leitura de commit.author.date e' testada em test/releases-commits.test.js.
const commit = (sha, data) => ({ sha, data });
const DIA = 24;

// ---- estatistica ---------------------------------------------------------

test("mediana: numero impar de valores -> o do meio", () => {
  assert.equal(mediana([24, 312, 120]), 120);
});

test("mediana: numero par de valores -> media dos dois do meio", () => {
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
});

test("mediana: lista vazia -> null (e nao 0: nao ha o que medir)", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([Number.NaN]), null);
});

test("mediana: um unico valor -> ele mesmo", () => {
  assert.equal(mediana([7.5]), 7.5);
});

test("percentil: interpolacao linear, igual ao padrao do numpy", () => {
  assert.equal(percentil([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(percentil([1, 2, 3, 4], 0.75), 3.25);
  assert.equal(percentil([1, 2, 3, 4, 5], 0.5), 3);
});

test("iqr: Q3 - Q1; null quando nao ha valores", () => {
  assert.equal(iqr([1, 2, 3, 4]), 1.5);
  assert.equal(iqr([]), null);
});

test("horasEntre: diferenca em horas decimais, negativa quando o fim e' antes", () => {
  assert.equal(horasEntre("2025-03-02T00:00:00Z", "2025-03-15T00:00:00Z"), 13 * DIA);
  assert.equal(horasEntre("2025-03-15T00:00:00Z", "2025-03-15T01:30:00Z"), 1.5);
  assert.equal(horasEntre("2025-03-16T00:00:00Z", "2025-03-15T00:00:00Z"), -DIA);
  assert.equal(horasEntre("lixo", "2025-03-15T00:00:00Z"), null);
  assert.equal(horasEntre(null, "2025-03-15T00:00:00Z"), null);
});

// ---- sequencia de deploys ------------------------------------------------

test("sequenciaDeDeploys: ignora draft e prerelease e ordena por published_at", () => {
  const releases = [
    rel("v2.0", "2025-06-01T00:00:00Z"),
    rel("v1.0", "2025-01-10T00:00:00Z"),
    rel("v3.0-rc1", "2025-07-01T00:00:00Z", { prerelease: true }),
    rel("v4.0-draft", null, { draft: true, published_at: null }),
    rel("v1.5", "2025-03-01T00:00:00Z"),
  ];
  const deploys = sequenciaDeDeploys(releases);
  assert.deepEqual(
    deploys.map((r) => r.tag_name),
    ["v1.0", "v1.5", "v2.0"]
  );
  assert.deepEqual(
    deploys.map((r) => r.deploy_index),
    [1, 2, 3]
  );
  // quem nao e' deploy fica sem indice
  assert.equal(releases.find((r) => r.tag_name === "v3.0-rc1").deploy_index, null);
});

test("sequenciaDeDeploys: empate em published_at e' desempatado pelo id", () => {
  const deploys = sequenciaDeDeploys([
    rel("b", "2025-05-01T00:00:00Z", { id: 20 }),
    rel("a", "2025-05-01T00:00:00Z", { id: 10 }),
  ]);
  assert.deepEqual(
    deploys.map((r) => r.tag_name),
    ["a", "b"]
  );
});

test("paresParaAvaliar: so' releases da janela, com a anterior que pode estar fora dela", () => {
  const deploys = sequenciaDeDeploys([
    rel("v0.9", "2024-11-01T00:00:00Z"), // antes da janela
    rel("v1.0", "2025-02-01T00:00:00Z"),
    rel("v1.1", "2025-03-15T00:00:00Z"),
  ]);
  const pares = paresParaAvaliar(deploys);
  assert.deepEqual(
    pares.map((p) => [p.base?.tag_name ?? null, p.release.tag_name]),
    [
      ["v0.9", "v1.0"],
      ["v1.0", "v1.1"],
    ]
  );
});

test("paresParaAvaliar: a primeira release da historia entra com anterior null", () => {
  const deploys = sequenciaDeDeploys([rel("v1.0", "2025-02-01T00:00:00Z"), rel("v1.1", "2025-03-01T00:00:00Z")]);
  const pares = paresParaAvaliar(deploys);
  assert.equal(pares[0].base, null);
  assert.equal(pares[1].base.tag_name, "v1.0");
});

// ---- lead time de uma release --------------------------------------------

// Exemplo da secao 5 do enunciado: v1.1 publicada em 15/03 com commits de
// 02/03, 10/03 e 14/03. Variante (a) = 13 dias; variante (b) contribui com
// 13, 5 e 1 dias.
test("avaliarRelease: reproduz o exemplo do enunciado (13 dias na variante a)", () => {
  const avaliacao = avaliarRelease({
    release: rel("v1.1", "2025-03-15T00:00:00Z"),
    base: rel("v1.0", "2025-03-01T00:00:00Z"),
    commits: [
      commit("c1", "2025-03-02T00:00:00Z"),
      commit("c2", "2025-03-10T00:00:00Z"),
      commit("c3", "2025-03-14T00:00:00Z"),
    ],
    commitsTotal: 3,
  });
  assert.equal(avaliacao.status, AVALIACAO.AVALIADA);
  assert.equal(avaliacao.oldest_commit_date, "2025-03-02T00:00:00Z");
  assert.equal(avaliacao.lead_time_hours, 13 * DIA);
  assert.deepEqual(avaliacao.horas, [13 * DIA, 5 * DIA, 1 * DIA]);
  assert.equal(avaliacao.base_tag, "v1.0");
  assert.equal(avaliacao.negative_commits, 0);
});

test("avaliarRelease: o commit mais antigo vem do minimo, nao da posicao na lista", () => {
  const avaliacao = avaliarRelease({
    release: rel("v1.1", "2025-03-15T00:00:00Z"),
    base: rel("v1.0", "2025-03-01T00:00:00Z"),
    commits: [commit("c1", "2025-03-14T00:00:00Z"), commit("c2", "2025-03-02T00:00:00Z")],
    commitsTotal: 2,
  });
  assert.equal(avaliacao.oldest_commit_date, "2025-03-02T00:00:00Z");
  assert.equal(avaliacao.lead_time_hours, 13 * DIA);
});

test("avaliarRelease: sem release anterior -> ignorada (enunciado), sem lead time", () => {
  const avaliacao = avaliarRelease({ release: rel("v1.0", "2025-02-01T00:00:00Z"), base: null });
  assert.equal(avaliacao.status, AVALIACAO.SEM_ANTERIOR);
  assert.equal(avaliacao.lead_time_hours, null);
  assert.deepEqual(avaliacao.horas, []);
});

test("avaliarRelease: release sem commits novos -> fora das duas variantes", () => {
  const avaliacao = avaliarRelease({
    release: rel("v1.1", "2025-03-15T00:00:00Z"),
    base: rel("v1.0", "2025-03-01T00:00:00Z"),
    commits: [],
    commitsTotal: 0,
  });
  assert.equal(avaliacao.status, AVALIACAO.SEM_COMMITS);
  assert.equal(avaliacao.lead_time_hours, null);
  assert.equal(avaliacao.oldest_commit_date, null);
});

test("avaliarRelease: commit sem author.date e' ignorado, os outros contam", () => {
  const avaliacao = avaliarRelease({
    release: rel("v1.1", "2025-03-15T00:00:00Z"),
    base: rel("v1.0", "2025-03-01T00:00:00Z"),
    commits: [commit("c1", null), commit("c2", "2025-03-14T00:00:00Z")],
    commitsTotal: 2,
  });
  assert.equal(avaliacao.status, AVALIACAO.AVALIADA);
  assert.equal(avaliacao.commits_fetched, 2);
  assert.deepEqual(avaliacao.horas, [1 * DIA]);
  assert.equal(avaliacao.lead_time_hours, 1 * DIA);
});

test("avaliarRelease: lead time negativo (rebase) e' mantido e contado", () => {
  const avaliacao = avaliarRelease({
    release: rel("v1.1", "2025-03-15T00:00:00Z"),
    base: rel("v1.0", "2025-03-01T00:00:00Z"),
    commits: [commit("c1", "2025-03-16T00:00:00Z"), commit("c2", "2025-03-10T00:00:00Z")],
    commitsTotal: 2,
  });
  assert.equal(avaliacao.negative_commits, 1);
  assert.deepEqual(avaliacao.horas, [-DIA, 5 * DIA]);
  assert.equal(avaliacao.lead_time_hours, 5 * DIA, "a variante (a) usa o commit mais antigo");
});

test("avaliarRelease: release ou anterior sem tag -> nao da para comparar", () => {
  const semTag = avaliarRelease({
    release: rel("", "2025-03-15T00:00:00Z", { tag_name: "" }),
    base: rel("v1.0", "2025-03-01T00:00:00Z"),
  });
  assert.equal(semTag.status, AVALIACAO.SEM_TAG);
  assert.equal(semTag.error, "missing_tag_name");

  const anteriorSemTag = avaliarRelease({
    release: rel("v1.1", "2025-03-15T00:00:00Z"),
    base: rel("", "2025-03-01T00:00:00Z", { tag_name: null }),
  });
  assert.equal(anteriorSemTag.status, AVALIACAO.SEM_TAG);
});

test("avaliarRelease: erro da comparacao fica registrado na release", () => {
  const avaliacao = avaliarRelease({
    release: rel("v1.1", "2025-03-15T00:00:00Z"),
    base: rel("v1.0", "2025-03-01T00:00:00Z"),
    erro: "compare_http_404",
  });
  assert.equal(avaliacao.status, AVALIACAO.ERRO);
  assert.equal(avaliacao.error, "compare_http_404");
  assert.equal(avaliacao.lead_time_hours, null);
});

// ---- resumo do repositorio -----------------------------------------------

function avaliacoesDeExemplo() {
  const base = rel("v1.0", "2025-01-10T00:00:00Z");
  return [
    // 13 dias (commits de 13, 5 e 1 dias)
    avaliarRelease({
      release: rel("v1.1", "2025-03-15T00:00:00Z"),
      base,
      commits: [
        commit("a", "2025-03-02T00:00:00Z"),
        commit("b", "2025-03-10T00:00:00Z"),
        commit("c", "2025-03-14T00:00:00Z"),
      ],
      commitsTotal: 3,
    }),
    // 3 dias (commits de 3 e 1 dias)
    avaliarRelease({
      release: rel("v1.2", "2025-04-04T00:00:00Z"),
      base: rel("v1.1", "2025-03-15T00:00:00Z"),
      commits: [commit("d", "2025-04-01T00:00:00Z"), commit("e", "2025-04-03T00:00:00Z")],
      commitsTotal: 2,
    }),
    // 1 dia
    avaliarRelease({
      release: rel("v1.3", "2025-05-02T00:00:00Z"),
      base: rel("v1.2", "2025-04-04T00:00:00Z"),
      commits: [commit("f", "2025-05-01T00:00:00Z")],
      commitsTotal: 1,
    }),
  ];
}

test("resumirRepositorio: mediana das duas variantes", () => {
  const contagens = contarReleases([]);
  const resumo = resumirRepositorio("a/b", { ...contagens, releases_in_window: 3 }, avaliacoesDeExemplo());

  assert.equal(resumo.releases_evaluated, 3);
  // variante (a): medianas por release = 13, 3, 1 dias -> mediana 3 dias
  assert.equal(resumo.lead_time_release_median_days, 3);
  assert.equal(resumo.lead_time_release_median_hours, 3 * DIA);
  // variante (b): 13, 5, 1, 3, 1, 1 dias -> ordenado 1,1,1,3,5,13 -> mediana 2 dias
  assert.equal(resumo.commits_used, 6);
  assert.equal(resumo.lead_time_commit_median_days, 2);
  assert.equal(resumo.lead_time_commit_median_hours, 2 * DIA);
  assert.equal(resumo.errors, "");
});

test("resumirRepositorio: release truncada entra na variante (a) e sai da (b)", () => {
  const avaliacoes = avaliacoesDeExemplo();
  const truncada = avaliarRelease({
    release: rel("v2.0", "2025-06-01T00:00:00Z"),
    base: rel("v1.3", "2025-05-02T00:00:00Z"),
    commits: [commit("g", "2025-01-01T00:00:00Z")],
    commitsTotal: 9000,
    truncada: true,
  });
  const resumo = resumirRepositorio("a/b", contarReleases([]), [...avaliacoes, truncada]);

  assert.equal(resumo.truncated_releases, 1);
  assert.equal(resumo.releases_evaluated, 4);
  // (a) passa a ter 4 valores: 1, 3, 13, 151 dias -> mediana (3 + 13) / 2 = 8
  assert.equal(resumo.lead_time_release_median_days, 8);
  // (b) continua com os 6 commits das releases nao truncadas
  assert.equal(resumo.commits_used, 6);
  assert.equal(resumo.lead_time_commit_median_days, 2);
});

test("resumirRepositorio: conta ignoradas, sem commits e erros, com os motivos", () => {
  const resumo = resumirRepositorio("a/b", contarReleases([]), [
    avaliarRelease({ release: rel("v1.0", "2025-01-10T00:00:00Z"), base: null }),
    avaliarRelease({
      release: rel("v1.1", "2025-02-01T00:00:00Z"),
      base: rel("v1.0", "2025-01-10T00:00:00Z"),
      commits: [],
      commitsTotal: 0,
    }),
    avaliarRelease({
      release: rel("v1.2", "2025-03-01T00:00:00Z"),
      base: rel("v1.1", "2025-02-01T00:00:00Z"),
      erro: "compare_http_404",
    }),
    avaliarRelease({
      release: rel("v1.3", "2025-04-01T00:00:00Z"),
      base: rel("v1.2", "2025-03-01T00:00:00Z"),
      erro: "compare_http_404",
    }),
    avaliarRelease({
      release: rel("", "2025-05-01T00:00:00Z", { tag_name: null }),
      base: rel("v1.3", "2025-04-01T00:00:00Z"),
    }),
  ]);

  assert.equal(resumo.releases_skipped_no_predecessor, 1);
  assert.equal(resumo.releases_without_commits, 1);
  assert.equal(resumo.releases_with_error, 3);
  assert.equal(resumo.releases_evaluated, 0);
  // motivos ordenados por frequencia, depois alfabeticamente
  assert.equal(resumo.errors, "compare_http_404:2;missing_tag_name:1");
  assert.equal(resumo.lead_time_release_median_hours, null, "sem release avaliada nao ha mediana");
  assert.equal(resumo.lead_time_commit_median_hours, null);
});

test("resumirRepositorio: repositorio com uma unica release nao tem lead time", () => {
  const deploys = sequenciaDeDeploys([rel("v1.0", "2025-05-01T00:00:00Z")]);
  const avaliacoes = paresParaAvaliar(deploys).map((par) => avaliarRelease(par));
  const resumo = resumirRepositorio("a/so-uma", contarReleases(deploys), avaliacoes);

  assert.equal(resumo.releases_in_window, 1);
  assert.equal(resumo.releases_skipped_no_predecessor, 1);
  assert.equal(resumo.releases_evaluated, 0);
  assert.equal(resumo.lead_time_release_median_hours, null);
});

// ---- contagens do modelo -------------------------------------------------

test("contarReleases: separa deploy, pre-release e rascunho dentro da janela", () => {
  const releases = [
    rel("v1.0", "2025-02-01T00:00:00Z"),
    rel("v1.1", "2025-03-01T00:00:00Z"),
    rel("v2.0-rc1", "2025-04-01T00:00:00Z", { prerelease: true }),
    rel("v0.9", "2024-12-01T00:00:00Z"), // fora da janela
    rel("rascunho", null, { draft: true, published_at: null }),
  ];
  assert.deepEqual(contarReleases(releases), {
    releases_total: 5,
    releases_in_window: 2,
    prereleases_in_window: 1,
    published_releases_in_window: 3,
    drafts_total: 1,
  });
});
