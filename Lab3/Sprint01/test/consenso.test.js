// Consolidacao do consenso: unanimidade, maioria simples, empate 1-1-1,
// rotulos incompletos, decisoes de reuniao (validas e invalidas) e a
// preservacao dos rotulos originais de cada avaliador.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METODOS,
  MOTIVOS_SEM_CONSENSO,
  consolidarDimensao,
  descreverVotos,
  regraAutomatica,
  resumirConsenso,
  validarDecisoes,
} from "../src/validacao/consenso.js";
import { DIMENSOES_POR_NOME, DIMENSOES } from "../src/validacao/rotulos.js";

const TIPO = DIMENSOES_POR_NOME.tipo_do_projeto;
const AVALIADORES = ["enzo", "caue", "leo"];

test("regraAutomatica: tres iguais -> unanimidade", () => {
  const r = regraAutomatica(["sim", "sim", "sim"]);
  assert.equal(r.status, "consenso");
  assert.equal(r.rotulo, "sim");
  assert.equal(r.metodo, METODOS.UNANIMIDADE);
});

test("regraAutomatica: 2 x 1 -> maioria simples, marcada como divergente revisavel", () => {
  const r = regraAutomatica(["sim", "nao", "sim"]);
  assert.equal(r.rotulo, "sim");
  assert.equal(r.metodo, METODOS.MAIORIA);
  assert.match(r.justificativa, /2 de 3/);
});

test("regraAutomatica: 1-1-1 -> sem consenso (nao inventa rotulo)", () => {
  const r = regraAutomatica(["biblioteca_framework", "aplicacao_servico", "ferramenta_cli"]);
  assert.equal(r.status, "sem_consenso");
  assert.equal(r.rotulo, null);
  assert.equal(r.motivo, MOTIVOS_SEM_CONSENSO.EMPATE);
});

test("regraAutomatica: avaliacao faltando -> sem consenso, mesmo se os outros dois concordam", () => {
  const r = regraAutomatica(["sim", "sim", null]);
  assert.equal(r.status, "sem_consenso");
  assert.equal(r.motivo, MOTIVOS_SEM_CONSENSO.INCOMPLETO);
  assert.match(r.justificativa, /2 de 3/);
});

test("regraAutomatica: com quatro avaliadores, 2 x 2 nao e' maioria", () => {
  assert.equal(regraAutomatica(["sim", "sim", "nao", "nao"]).status, "sem_consenso");
  assert.equal(regraAutomatica(["sim", "sim", "sim", "nao"]).metodo, METODOS.MAIORIA);
});

test("descreverVotos: contagem ordenada, sem os ausentes", () => {
  assert.equal(descreverVotos(["nao", "sim", "sim"], ["sim", "nao"]), "sim:2;nao:1");
  assert.equal(descreverVotos(["nao", null, "sim"], ["sim", "nao"]), "sim:1;nao:1");
  assert.equal(descreverVotos([null, null], ["sim", "nao"]), "");
});

function unidades(ids) {
  return new Map(ids.map((id) => [id, { id, full_name: id, release_id: "", tag_name: "", url: `https://github.com/${id}` }]));
}
function porAvaliador(rotulos) {
  // rotulos: { id: [enzo, caue, leo] }
  return Object.fromEntries(
    AVALIADORES.map((nome, i) => [nome, new Map(Object.entries(rotulos).map(([id, r]) => [id, { rotulo: r[i] }]))])
  );
}

const ROTULOS = {
  "a/unanime": ["outro", "outro", "outro"],
  "a/maioria": ["ferramenta_cli", "ferramenta_cli", "aplicacao_servico"],
  "a/empate": ["biblioteca_framework", "aplicacao_servico", "ferramenta_cli"],
  "a/faltando": ["outro", null, "outro"],
};

test("consolidarDimensao: preserva os rotulos de cada avaliador e aplica o protocolo", () => {
  const linhas = consolidarDimensao({ dimensao: TIPO, unidades: unidades(Object.keys(ROTULOS)), avaliadores: AVALIADORES, porAvaliador: porAvaliador(ROTULOS) });
  const por = Object.fromEntries(linhas.map((l) => [l.unidade_id, l]));

  assert.deepEqual(por["a/maioria"].rotulos, { enzo: "ferramenta_cli", caue: "ferramenta_cli", leo: "aplicacao_servico" });
  assert.equal(por["a/unanime"].metodo, METODOS.UNANIMIDADE);
  assert.equal(por["a/unanime"].divergente, false);
  assert.equal(por["a/maioria"].rotulo_consenso, "ferramenta_cli");
  assert.equal(por["a/maioria"].decisao_automatica, true);
  assert.equal(por["a/maioria"].divergente, true);
  assert.equal(por["a/empate"].status, "sem_consenso");
  assert.equal(por["a/empate"].decisao_automatica, null);
  assert.equal(por["a/faltando"].motivo_sem_consenso, MOTIVOS_SEM_CONSENSO.INCOMPLETO);
  assert.equal(por["a/faltando"].divergente, false);

  assert.deepEqual(resumirConsenso(linhas), {
    unidades: 4, unanimidade: 1, maioria_simples: 1, reuniao: 0, sem_consenso: 2, divergentes: 2, empates: 1, incompletos: 1,
  });
});

test("consolidarDimensao: decisao de reuniao resolve o empate e fica registrada como humana", () => {
  const { decisoes, problemas } = validarDecisoes(
    [{ dimensao: "tipo_do_projeto", unidade_id: "a/empate", rotulo_consenso: "biblioteca_framework", justificativa: "README diz 'library'", participantes: "enzo, caue, leo", data_reuniao: "2026-10-20" }],
    { dimensoes: DIMENSOES, unidades: { tipo_do_projeto: unidades(Object.keys(ROTULOS)) } }
  );
  assert.deepEqual(problemas, []);
  const linhas = consolidarDimensao({ dimensao: TIPO, unidades: unidades(Object.keys(ROTULOS)), avaliadores: AVALIADORES, porAvaliador: porAvaliador(ROTULOS), decisoes });
  const empate = linhas.find((l) => l.unidade_id === "a/empate");
  assert.equal(empate.status, "consenso");
  assert.equal(empate.metodo, METODOS.REUNIAO);
  assert.equal(empate.decisao_automatica, false);
  assert.equal(empate.regra_automatica, null); // a regra sozinha nao decidia
  assert.match(empate.justificativa, /README.*2026-10-20.*enzo, caue, leo/);
  assert.deepEqual(empate.rotulos, { enzo: "biblioteca_framework", caue: "aplicacao_servico", leo: "ferramenta_cli" });
});

test("validarDecisoes: rejeita (e aponta) decisao incompleta, fora da amostra ou conflitante", () => {
  const contexto = { dimensoes: DIMENSOES, unidades: { tipo_do_projeto: unidades(["a/x", "a/y"]), release_corretiva: unidades(["a/x@1"]) } };
  const base = { dimensao: "tipo_do_projeto", unidade_id: "a/x", rotulo_consenso: "outro", justificativa: "ok", participantes: "todos" };
  const { decisoes, problemas } = validarDecisoes(
    [
      { ...base, dimensao: "inexistente" },
      { ...base, unidade_id: "z/fora" },
      { ...base, rotulo_consenso: "app" },
      { ...base, justificativa: " " },
      { ...base, participantes: "" },
      { ...base, unidade_id: "a/y" },
      { ...base, unidade_id: "a/y", rotulo_consenso: "ferramenta_cli" }, // conflita com a anterior
      { ...base, dimensao: "release_corretiva", unidade_id: "a/x@1", rotulo_consenso: "sim" },
      { ...base, dimensao: "release_corretiva", unidade_id: "a/x@1", rotulo_consenso: "sim" }, // repetida igual: ok
    ],
    contexto
  );
  assert.deepEqual([...decisoes.keys()], ["release_corretiva|a/x@1"]);
  assert.equal(problemas.length, 6);
  assert.ok(problemas.every((p) => p.tipo === "decisao_invalida"));
  assert.match(problemas.map((p) => p.detalhe).join("\n"), /dimensao desconhecida[\s\S]*nao esta na amostra[\s\S]*fora das categorias[\s\S]*justificativa vazia[\s\S]*participantes vazio[\s\S]*rotulo diferente/);
});
