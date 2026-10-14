// Validacao estrutural das planilhas de rotulos: normalizacao das categorias,
// rotulo ausente x invalido x inconsistente, linhas faltando/sobrando/
// duplicadas e a situacao de cada avaliador. Nenhum rotulo e' adivinhado.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIMENSOES,
  consolidarCelulas,
  idDaUnidade,
  normalizarRotulo,
  situacaoDoAvaliador,
  unidadesDaAmostra,
  validarPlanilha,
} from "../src/validacao/rotulos.js";

// Amostra de TESTE (ficticia): 2 repositorios, 2 releases cada.
const AMOSTRA = [
  { full_name: "a/um", repo_id: "1", release_id: "11", tag_name: "v1.0.1", release_url: "u11", repo_url: "ra" },
  { full_name: "a/um", repo_id: "1", release_id: "12", tag_name: "v1.0.0", release_url: "u12", repo_url: "ra" },
  { full_name: "b/dois", repo_id: "2", release_id: "21", tag_name: "2.1", release_url: "u21", repo_url: "rb" },
  { full_name: "b/dois", repo_id: "2", release_id: "22", tag_name: "2.0", release_url: "u22", repo_url: "rb" },
];
const CABECALHO = ["full_name", "release_id", "tag_name", "tipo_do_projeto", "releases_sao_entrega_real", "release_corretiva", "observacao"];

function planilha(linhas, cabecalho = CABECALHO) {
  return { cabecalho, registros: linhas };
}
function linha(base, tipo, entrega, corretiva, extra = {}) {
  return { full_name: base.full_name, release_id: base.release_id, tag_name: base.tag_name, tipo_do_projeto: tipo, releases_sao_entrega_real: entrega, release_corretiva: corretiva, observacao: "", ...extra };
}

test("DIMENSOES: as tres dimensoes e categorias do enunciado", () => {
  assert.deepEqual(DIMENSOES.map((d) => [d.nome, d.unidade, d.categorias.length]), [
    ["tipo_do_projeto", "repositorio", 4],
    ["releases_sao_entrega_real", "repositorio", 3],
    ["release_corretiva", "release", 2],
  ]);
});

test("normalizarRotulo: aceita variacoes de escrita, maiusculas e acentos", () => {
  for (const bruto of ["Biblioteca/Framework", "biblioteca framework", "biblioteca_framework", " BIBLIOTECA ", "framework"]) {
    assert.equal(normalizarRotulo("tipo_do_projeto", bruto).rotulo, "biblioteca_framework", bruto);
  }
  assert.equal(normalizarRotulo("tipo_do_projeto", "Aplicação/Serviço").rotulo, "aplicacao_servico");
  assert.equal(normalizarRotulo("tipo_do_projeto", "ferramenta CLI").rotulo, "ferramenta_cli");
  assert.equal(normalizarRotulo("releases_sao_entrega_real", "Não").rotulo, "nao");
  assert.equal(normalizarRotulo("releases_sao_entrega_real", "INCERTO").rotulo, "incerto");
  assert.equal(normalizarRotulo("release_corretiva", "S").rotulo, "sim");
});

test("normalizarRotulo: vazio e' ausente; fora da lista e' invalido (sem palpite)", () => {
  assert.equal(normalizarRotulo("release_corretiva", "").estado, "ausente");
  assert.equal(normalizarRotulo("release_corretiva", "   ").estado, "ausente");
  assert.equal(normalizarRotulo("release_corretiva", undefined).estado, "ausente");
  assert.deepEqual(normalizarRotulo("release_corretiva", "talvez"), { estado: "invalido", rotulo: null, bruto: "talvez" });
  assert.equal(normalizarRotulo("release_corretiva", "incerto").estado, "invalido"); // so' existe na dimensao (ii)
  assert.equal(normalizarRotulo("release_corretiva", "1").estado, "invalido");
});

test("idDaUnidade e unidadesDaAmostra: repositorio por full_name, release por full_name@release_id", () => {
  assert.equal(idDaUnidade("tipo_do_projeto", AMOSTRA[0]), "a/um");
  assert.equal(idDaUnidade("release_corretiva", AMOSTRA[0]), "a/um@11");
  const u = unidadesDaAmostra(AMOSTRA);
  assert.deepEqual([...u.tipo_do_projeto.keys()], ["a/um", "b/dois"]);
  assert.deepEqual([...u.release_corretiva.keys()], ["a/um@11", "a/um@12", "b/dois@21", "b/dois@22"]);
  assert.equal(u.release_corretiva.get("a/um@11").url, "u11");
  assert.equal(u.tipo_do_projeto.get("b/dois").repo_id, "2");
});

test("consolidarCelulas: rotulo de repositorio pode vir em uma linha so', mas nao pode divergir", () => {
  assert.equal(consolidarCelulas("tipo_do_projeto", ["biblioteca", "", ""]).rotulo, "biblioteca_framework");
  assert.equal(consolidarCelulas("tipo_do_projeto", ["biblioteca", "Biblioteca/Framework"]).estado, "valido");
  assert.equal(consolidarCelulas("tipo_do_projeto", ["biblioteca", "cli"]).estado, "inconsistente");
  assert.equal(consolidarCelulas("tipo_do_projeto", ["biblioteca", "xpto"]).estado, "invalido");
  assert.equal(consolidarCelulas("tipo_do_projeto", ["", ""]).estado, "ausente");
});

test("validarPlanilha: planilha completa e correta -> todos validos, sem problemas", () => {
  const v = validarPlanilha(
    "enzo",
    planilha([linha(AMOSTRA[0], "biblioteca", "nao", "sim"), linha(AMOSTRA[1], "biblioteca", "nao", "nao"), linha(AMOSTRA[2], "cli", "sim", "nao"), linha(AMOSTRA[3], "", "", "Sim")]),
    AMOSTRA
  );
  assert.deepEqual(v.problemas, []);
  assert.equal(v.rotulos.tipo_do_projeto.get("b/dois").rotulo, "ferramenta_cli");
  assert.equal(v.rotulos.release_corretiva.get("b/dois@22").rotulo, "sim");
  assert.deepEqual(v.resumo.release_corretiva, { esperados: 4, validos: 4, ausentes: 0, invalidos: 0, inconsistentes: 0 });
  assert.equal(situacaoDoAvaliador(v), "completo");
});

test("validarPlanilha: arquivo inexistente -> tudo ausente e avaliador nao iniciado", () => {
  const v = validarPlanilha("leo", null, AMOSTRA);
  assert.equal(v.existe, false);
  assert.equal(v.problemas[0].tipo, "arquivo_ausente");
  assert.equal(v.resumo.tipo_do_projeto.ausentes, 2);
  assert.equal(situacaoDoAvaliador(v), "nao_iniciado");
});

test("validarPlanilha: planilha em branco (recem-gerada) -> nao iniciado, sem rotulos validos", () => {
  const v = validarPlanilha("caue", planilha(AMOSTRA.map((b) => linha(b, "", "", ""))), AMOSTRA);
  assert.equal(situacaoDoAvaliador(v), "nao_iniciado");
  assert.equal(v.resumo.release_corretiva.ausentes, 4);
  assert.deepEqual(v.problemas, []);
});

test("validarPlanilha: invalidos e inconsistentes viram problema e ficam sem rotulo", () => {
  const v = validarPlanilha(
    "enzo",
    planilha([linha(AMOSTRA[0], "biblioteca", "nao", "talvez"), linha(AMOSTRA[1], "cli", "nao", "nao"), linha(AMOSTRA[2], "app", "sim", "nao"), linha(AMOSTRA[3], "app", "sim", "")]),
    AMOSTRA
  );
  const tipos = v.problemas.map((p) => `${p.tipo}:${p.unidade_id}`).sort();
  assert.deepEqual(tipos, ["rotulo_inconsistente:a/um", "rotulo_invalido:a/um@11", "rotulo_invalido:b/dois"]);
  assert.equal(v.rotulos.tipo_do_projeto.get("a/um").rotulo, null);
  assert.equal(v.rotulos.release_corretiva.get("a/um@11").estado, "invalido");
  assert.equal(v.rotulos.release_corretiva.get("b/dois@22").estado, "ausente");
  assert.equal(situacaoDoAvaliador(v), "parcial");
});

test("validarPlanilha: linha fora da amostra, faltando, duplicada e tag alterada sao apontadas", () => {
  const v = validarPlanilha(
    "enzo",
    planilha([
      linha(AMOSTRA[0], "biblioteca", "nao", "sim"),
      linha(AMOSTRA[0], "biblioteca", "nao", "nao"), // duplicada, com valor diferente
      linha(AMOSTRA[2], "cli", "sim", "nao", { tag_name: "editada" }),
      linha({ full_name: "z/intruso", release_id: "99", tag_name: "x" }, "cli", "sim", "nao"),
      {}, // linha vazia no fim do arquivo: ignorada
    ]),
    AMOSTRA
  );
  const tipos = new Set(v.problemas.map((p) => p.tipo));
  for (const tipo of ["linha_duplicada", "identificacao_divergente", "linha_fora_da_amostra", "linha_ausente"]) assert.ok(tipos.has(tipo), tipo);
  assert.equal(v.problemas.filter((p) => p.tipo === "linha_ausente").length, 2); // a/um@12 e b/dois@22
  assert.equal(v.rotulos.release_corretiva.get("a/um@11").estado, "inconsistente");
  assert.equal(v.rotulos.release_corretiva.has("z/intruso@99"), false);
});

test("validarPlanilha: coluna de rotulo removida -> problema e dimensao inteira ausente", () => {
  const cabecalho = CABECALHO.filter((c) => c !== "release_corretiva");
  const v = validarPlanilha("enzo", planilha(AMOSTRA.map((b) => linha(b, "cli", "sim", undefined)), cabecalho), AMOSTRA);
  assert.match(v.problemas.find((p) => p.tipo === "coluna_ausente").detalhe, /release_corretiva/);
  assert.equal(v.resumo.release_corretiva.ausentes, 4);
  assert.equal(v.resumo.tipo_do_projeto.validos, 2);
});
