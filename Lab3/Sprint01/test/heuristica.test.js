// Avaliacao da heuristica de release corretiva frente ao consenso.
//
// ATENCAO: todas as previsoes deste arquivo sao FIXTURES DE TESTE, montadas a
// mao. Elas NAO sao saida da heuristica real da Pessoa B, que ainda nao existe
// no repositorio; servem so' para conferir a interface e as contas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarHeuristica, metricas, normalizarPrevisao } from "../src/validacao/heuristica.js";

const perto = (obtido, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(obtido - esperado) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);

function consensoDeTeste(id, rotulo, extra = {}) {
  const [fullName, releaseId] = id.split("@");
  return {
    unidade_id: id,
    full_name: fullName,
    release_id: releaseId,
    tag_name: `t${releaseId}`,
    url: `https://github.com/${fullName}/releases/tag/t${releaseId}`,
    status: rotulo === null ? "sem_consenso" : "consenso",
    rotulo_consenso: rotulo,
    metodo: rotulo === null ? null : "unanimidade",
    ...extra,
  };
}
const previsaoDeTeste = (id, valor, versao = "fixture-v1", extra = {}) => {
  const [fullName, releaseId] = id.split("@");
  return { full_name: fullName, release_id: releaseId, tag_name: `t${releaseId}`, corretiva_prevista: valor, versao_heuristica: versao, ...extra };
};

test("metricas: o exemplo da secao 6 (P = 30/40, R = 30/50, F1 ~ 0,67)", () => {
  const m = metricas({ vp: 30, fp: 10, fn: 20, vn: 40 });
  perto(m.precisao, 0.75);
  perto(m.recall, 0.6);
  perto(m.f1, (2 * 0.75 * 0.6) / (0.75 + 0.6)); // 0,6667
  perto(m.acuracia, 0.7);
  assert.equal(m.avaliadas, 100);
});

test("metricas: divisao por zero vira null, nao 0", () => {
  const semPositivosPrevistos = metricas({ vp: 0, fp: 0, fn: 3, vn: 7 });
  assert.equal(semPositivosPrevistos.precisao, null);
  assert.equal(semPositivosPrevistos.recall, 0);
  assert.equal(semPositivosPrevistos.f1, 0);
  const vazio = metricas({ vp: 0, fp: 0, fn: 0, vn: 0 });
  assert.equal(vazio.f1, null);
  assert.equal(vazio.acuracia, null);
  assert.equal(metricas({ vp: 0, fp: 0, fn: 0, vn: 5 }).f1, null); // so' negativos: F1 indefinido
});

test("normalizarPrevisao: sim/nao, booleanos e 0/1; o resto e' invalido", () => {
  for (const v of ["sim", "SIM", "true", "1", true, 1]) assert.equal(normalizarPrevisao(v), true, String(v));
  for (const v of ["nao", "não", "false", "0", false, 0]) assert.equal(normalizarPrevisao(v), false, String(v));
  for (const v of ["", "talvez", null, undefined]) assert.equal(normalizarPrevisao(v), null, String(v));
});

test("avaliarHeuristica: reproduz o exemplo da secao 6 com previsoes de teste", () => {
  const consenso = [];
  const previsoes = [];
  let n = 0;
  const adicionar = (quantos, real, previsto) => {
    for (let i = 0; i < quantos; i += 1) {
      const id = `r/x@${(n += 1)}`;
      consenso.push(consensoDeTeste(id, real));
      previsoes.push(previsaoDeTeste(id, previsto));
    }
  };
  adicionar(30, "sim", "sim"); // VP
  adicionar(10, "nao", "sim"); // FP
  adicionar(20, "sim", "nao"); // FN
  adicionar(40, "nao", "nao"); // VN

  const { versoes } = avaliarHeuristica({ consenso, previsoes, limiarF1: 0.7 });
  assert.equal(versoes.length, 1);
  const [v] = versoes;
  assert.deepEqual([v.vp, v.fp, v.fn, v.vn], [30, 10, 20, 40]);
  perto(v.f1, 0.6666666666666666);
  assert.equal(v.situacao, "refinar"); // F1 < 0,70 -> refinar
  assert.equal(v.casos.filter((c) => c.classe === "fp").length, 10);
});

test("avaliarHeuristica: sem consenso, sem previsao, previsao invalida e conflito ficam fora da conta", () => {
  const consenso = [
    consensoDeTeste("a/b@1", "sim"),
    consensoDeTeste("a/b@2", "nao"),
    consensoDeTeste("a/b@3", null), // sem consenso
    consensoDeTeste("a/b@4", "sim"), // sem previsao
    consensoDeTeste("a/b@5", "nao"), // previsao invalida
    consensoDeTeste("a/b@6", "sim"), // previsoes conflitantes
  ];
  const previsoes = [
    previsaoDeTeste("a/b@1", "sim"),
    previsaoDeTeste("a/b@2", "nao"),
    previsaoDeTeste("a/b@3", "sim"),
    previsaoDeTeste("a/b@5", "talvez"),
    previsaoDeTeste("a/b@6", "sim"),
    previsaoDeTeste("a/b@6", "nao"),
    previsaoDeTeste("z/fora@9", "sim"), // fora da amostra-ouro: ignorada
  ];
  const r = avaliarHeuristica({ consenso, previsoes });
  const [v] = r.versoes;
  assert.deepEqual([v.vp, v.fp, v.fn, v.vn], [1, 0, 0, 1]);
  assert.equal(v.avaliadas, 2);
  assert.equal(v.sem_consenso, 1);
  assert.equal(v.sem_previsao, 3); // @4 sem previsao, @5 invalida, @6 conflito
  assert.equal(v.situacao, "aprovada");
  assert.equal(r.previsoesForaDaAmostra, 1);
  assert.deepEqual(r.problemas.map((p) => p.tipo).sort(), ["previsao_conflitante", "previsao_invalida"]);
  const classe = Object.fromEntries(v.casos.map((c) => [c.unidade_id, c.classe]));
  assert.deepEqual(classe, {
    "a/b@1": "vp", "a/b@2": "vn", "a/b@3": "sem_consenso", "a/b@4": "sem_previsao", "a/b@5": "previsao_invalida", "a/b@6": "previsao_invalida",
  });
});

test("avaliarHeuristica: cada versao da heuristica e' avaliada separadamente", () => {
  const consenso = [consensoDeTeste("a/b@1", "sim"), consensoDeTeste("a/b@2", "nao")];
  const previsoes = [
    previsaoDeTeste("a/b@1", "sim", "v2-semver+commits"),
    previsaoDeTeste("a/b@2", "nao", "v2-semver+commits"),
    previsaoDeTeste("a/b@1", "nao", "v1-semver"),
    previsaoDeTeste("a/b@2", "sim", "v1-semver"),
  ];
  const { versoes } = avaliarHeuristica({ consenso, previsoes });
  assert.deepEqual(versoes.map((v) => [v.versao, v.f1, v.situacao]), [
    ["v1-semver", 0, "refinar"],
    ["v2-semver+commits", 1, "aprovada"],
  ]);
});

test("avaliarHeuristica: associa pela tag quando a previsao nao traz release_id", () => {
  const consenso = [consensoDeTeste("a/b@7", "sim")];
  const { versoes } = avaliarHeuristica({ consenso, previsoes: [previsaoDeTeste("a/b@7", "sim", "", { release_id: "" })] });
  assert.equal(versoes[0].versao, "sem_versao");
  assert.equal(versoes[0].vp, 1);
});

test("avaliarHeuristica: nenhuma release com consenso -> F1 indefinido", () => {
  const { versoes } = avaliarHeuristica({ consenso: [consensoDeTeste("a/b@1", null)], previsoes: [previsaoDeTeste("a/b@1", "sim")] });
  assert.equal(versoes[0].f1, null);
  assert.equal(versoes[0].situacao, "indefinido");
});
