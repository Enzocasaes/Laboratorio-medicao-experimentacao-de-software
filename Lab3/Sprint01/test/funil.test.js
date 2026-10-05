import { test } from "node:test";
import assert from "node:assert/strict";
import { SELECAO_PADRAO } from "../src/config.js";
import { aplicarCriterios, construirFunil, definirAmostraFinal } from "../src/selecao/funil.js";
import { ETAPAS, MOTIVOS, STATUS, excluir } from "../src/selecao/modelo.js";

const selecao = { ...SELECAO_PADRAO, quantidadeDeCandidatos: 6, tamanhoAlvoDaAmostra: 2 };

function registro(rank, extra = {}) {
  return {
    rank,
    id: rank,
    full_name: `org/r${rank}`,
    has_github_actions: true,
    releases_in_window: null,
    valid_workflow_runs: null,
    status: STATUS.PENDENTE,
    excluded_at_stage: null,
    exclusion_reason: null,
    ...extra,
  };
}

const semActions = (rank) =>
  excluir(registro(rank, { has_github_actions: false }), ETAPAS.ACTIONS, MOTIVOS.SEM_ACTIONS);

const linha = (funil, etapa) => funil.find((l) => l.stage === etapa);

// ---- criterio minimo -----------------------------------------------------

test("aplicarCriterios: >= 5 releases e >= 50 runs -> elegivel", () => {
  const r = aplicarCriterios(registro(1), { releases_in_window: 5, valid_workflow_runs: 50 }, selecao);
  assert.equal(r.status, STATUS.ELEGIVEL);
});

test("aplicarCriterios: poucas releases -> excluido na etapa de releases, com motivo", () => {
  const r = aplicarCriterios(registro(1), { releases_in_window: 4, valid_workflow_runs: 500 }, selecao);
  assert.equal(r.status, STATUS.EXCLUIDO);
  assert.equal(r.excluded_at_stage, ETAPAS.RELEASES);
  assert.equal(r.exclusion_reason, "fewer_than_5_releases_in_window");
});

test("aplicarCriterios: poucos runs -> excluido na etapa de runs", () => {
  const r = aplicarCriterios(registro(1), { releases_in_window: 12, valid_workflow_runs: 49 }, selecao);
  assert.equal(r.excluded_at_stage, ETAPAS.RUNS);
  assert.equal(r.exclusion_reason, "fewer_than_50_valid_workflow_runs_in_window");
});

test("aplicarCriterios: contagem ausente deixa pendente; B e C podem informar em momentos diferentes", () => {
  const soReleases = aplicarCriterios(registro(1), { releases_in_window: 9 }, selecao);
  assert.equal(soReleases.status, STATUS.PENDENTE);
  const depoisRuns = aplicarCriterios(soReleases, { valid_workflow_runs: 80 }, selecao);
  assert.equal(depoisRuns.status, STATUS.ELEGIVEL);
  assert.equal(depoisRuns.releases_in_window, 9);
});

test("aplicarCriterios: reavaliar com contagens novas refaz a decisao", () => {
  const excluido = aplicarCriterios(registro(1), { releases_in_window: 2, valid_workflow_runs: 80 }, selecao);
  const corrigido = aplicarCriterios(excluido, { releases_in_window: 7 }, selecao);
  assert.equal(corrigido.status, STATUS.ELEGIVEL);
  assert.equal(corrigido.exclusion_reason, null);
});

test("aplicarCriterios: quem ja saiu por falta de Actions nao volta", () => {
  const r = aplicarCriterios(semActions(1), { releases_in_window: 50, valid_workflow_runs: 500 }, selecao);
  assert.equal(r.excluded_at_stage, ETAPAS.ACTIONS);
});

test("aplicarCriterios: contagem negativa ou nao inteira e' erro", () => {
  assert.throws(() => aplicarCriterios(registro(1), { releases_in_window: -1 }, selecao), /releases_in_window/);
  assert.throws(() => aplicarCriterios(registro(1), { valid_workflow_runs: "50" }, selecao), /valid_workflow_runs/);
});

// ---- amostra final -------------------------------------------------------

test("definirAmostraFinal: os N elegiveis de melhor rank entram; o resto sai com motivo", () => {
  const registros = [3, 1, 2].map((rank) => ({ ...registro(rank), status: STATUS.ELEGIVEL }));
  const { registros: final, definida } = definirAmostraFinal(registros, 2);
  assert.equal(definida, true);
  const porRank = Object.fromEntries(final.map((r) => [r.rank, r]));
  assert.equal(porRank[1].status, STATUS.INCLUIDO);
  assert.equal(porRank[2].status, STATUS.INCLUIDO);
  assert.equal(porRank[3].status, STATUS.EXCLUIDO);
  assert.equal(porRank[3].exclusion_reason, MOTIVOS.FORA_DA_AMOSTRA);
});

test("definirAmostraFinal: com pendentes, nao define (a amostra poderia mudar)", () => {
  const registros = [{ ...registro(1), status: STATUS.ELEGIVEL }, registro(2)];
  const { registros: final, definida } = definirAmostraFinal(registros, 1);
  assert.equal(definida, false);
  assert.equal(final, registros);
});

test("definirAmostraFinal: e' idempotente e reconsidera quem ficou fora do corte", () => {
  const registros = [1, 2, 3].map((rank) => ({ ...registro(rank), status: STATUS.ELEGIVEL }));
  const primeira = definirAmostraFinal(registros, 1).registros;
  const segunda = definirAmostraFinal(primeira, 2).registros;
  assert.deepEqual(segunda.map((r) => r.status), [STATUS.INCLUIDO, STATUS.INCLUIDO, STATUS.EXCLUIDO]);
});

// ---- funil ---------------------------------------------------------------

test("construirFunil: so' a etapa de selecao executada -> releases/runs pendentes", () => {
  const registros = [registro(1), registro(2), semActions(3), registro(4), semActions(5)];
  registros.push(excluir(registro(6, { has_github_actions: null }), ETAPAS.ACTIONS, "actions_http_404"));
  const funil = construirFunil(registros, selecao);

  assert.deepEqual(funil.map((l) => l.stage), ["candidates", "has_github_actions", "min_releases", "min_workflow_runs", "final_sample"]);
  assert.deepEqual(linha(funil, ETAPAS.CANDIDATOS), {
    order: 1,
    stage: "candidates",
    description: "Candidatos da busca stars:>1000 (os 6 com mais estrelas)",
    entered: 6,
    remaining: 6,
    excluded: 0,
    pending: 0,
    complete: true,
    exclusion_reasons: "",
  });
  const actions = linha(funil, ETAPAS.ACTIONS);
  assert.equal(actions.remaining, 3);
  assert.equal(actions.excluded, 3);
  assert.equal(actions.exclusion_reasons, "no_github_actions:2;actions_http_404:1");
  assert.equal(actions.complete, true);
  const releases = linha(funil, ETAPAS.RELEASES);
  assert.equal(releases.entered, 3);
  assert.equal(releases.pending, 3);
  assert.equal(releases.complete, false);
  assert.equal(linha(funil, ETAPAS.AMOSTRA).complete, false);
});

test("construirFunil: pipeline completo -> todas as etapas fecham e batem as contas", () => {
  let registros = [
    registro(1),
    registro(2),
    semActions(3),
    registro(4),
    registro(5),
    registro(6),
  ];
  const contagens = {
    1: { releases_in_window: 10, valid_workflow_runs: 300 },
    2: { releases_in_window: 3, valid_workflow_runs: 300 },
    4: { releases_in_window: 8, valid_workflow_runs: 20 },
    5: { releases_in_window: 6, valid_workflow_runs: 60 },
    6: { releases_in_window: 30, valid_workflow_runs: 900 },
  };
  registros = registros.map((r) => (contagens[r.rank] ? aplicarCriterios(r, contagens[r.rank], selecao) : r));
  registros = definirAmostraFinal(registros, selecao.tamanhoAlvoDaAmostra).registros;
  const funil = construirFunil(registros, selecao);

  assert.deepEqual(
    funil.map((l) => [l.stage, l.entered, l.remaining, l.excluded, l.pending, l.complete]),
    [
      ["candidates", 6, 6, 0, 0, true],
      ["has_github_actions", 6, 5, 1, 0, true],
      ["min_releases", 5, 4, 1, 0, true],
      ["min_workflow_runs", 4, 3, 1, 0, true],
      ["final_sample", 3, 2, 1, 0, true],
    ]
  );
  assert.equal(linha(funil, ETAPAS.AMOSTRA).exclusion_reasons, "beyond_target_sample_size:1");
  for (const l of funil) assert.equal(l.entered, l.remaining + l.excluded + l.pending);
});

test("construirFunil: lista vazia gera o funil zerado", () => {
  const funil = construirFunil([], selecao);
  assert.equal(funil.length, 5);
  assert.ok(funil.every((l) => l.entered === 0 && l.complete));
});
