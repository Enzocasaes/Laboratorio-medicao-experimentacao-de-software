import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularIdade, criarJanela, estaNaJanela, lerDataISO } from "../src/janela.js";

const janela = criarJanela("2025-01-01", "2025-12-31");

test("lerDataISO: le AAAA-MM-DD em UTC", () => {
  assert.equal(lerDataISO("2025-03-15"), Date.UTC(2025, 2, 15));
  assert.equal(lerDataISO("2024-02-29"), Date.UTC(2024, 1, 29)); // bissexto
});

test("lerDataISO: rejeita formatos frouxos, vazios e datas inexistentes", () => {
  for (const invalida of ["2025-1-1", "01/02/2025", "2025-01-01T00:00:00Z", "", "AAAA-MM-DD", null, undefined, 20250101]) {
    assert.throws(() => lerDataISO(invalida, "janela.inicio"), /janela\.inicio invalida/);
  }
  assert.throws(() => lerDataISO("2025-02-29"), /nao existe no calendario/);
  assert.throws(() => lerDataISO("2025-13-01"), /nao existe no calendario/);
  assert.throws(() => lerDataISO("2025-04-31"), /nao existe no calendario/);
});

test("criarJanela: fim inclusivo -> intervalo semiaberto de 365 dias", () => {
  assert.equal(janela.inicioMs, Date.UTC(2025, 0, 1));
  assert.equal(janela.fimExclusivoMs, Date.UTC(2026, 0, 1));
  assert.equal(janela.dias, 365);
});

test("criarJanela: fim antes do inicio e' erro", () => {
  assert.throws(() => criarJanela("2025-12-31", "2025-01-01"), /anterior a janela.inicio/);
});

test("estaNaJanela: as duas pontas sao inclusivas no nivel de dia", () => {
  assert.equal(estaNaJanela("2025-01-01T00:00:00Z", janela), true);
  assert.equal(estaNaJanela("2025-12-31T23:59:59Z", janela), true);
  assert.equal(estaNaJanela("2024-12-31T23:59:59Z", janela), false);
  assert.equal(estaNaJanela("2026-01-01T00:00:00Z", janela), false);
  assert.equal(estaNaJanela(new Date("2025-06-01T00:00:00Z"), janela), true);
});

test("estaNaJanela: data invalida ou ausente nunca esta na janela", () => {
  assert.equal(estaNaJanela("nao-e-data", janela), false);
  assert.equal(estaNaJanela(null, janela), false);
  assert.equal(estaNaJanela("", janela), false);
});

test("calcularIdade: medida em relacao ao fim da janela, nao a data da execucao", () => {
  const idade = calcularIdade("2015-01-01T00:00:00Z", janela);
  assert.equal(idade.idadeDias, 4018); // 2015-01-01 -> 2026-01-01
  assert.equal(idade.idadeAnos, 11);
  assert.equal(idade.posicao, "before_window");
});

test("calcularIdade: repositorio criado logo antes do inicio da janela", () => {
  const idade = calcularIdade("2024-12-31T23:59:59Z", janela);
  assert.equal(idade.posicao, "before_window");
  assert.equal(idade.idadeDias, 365);
});

test("calcularIdade: criado exatamente no inicio da janela conta como dentro dela", () => {
  const idade = calcularIdade("2025-01-01T00:00:00Z", janela);
  assert.equal(idade.posicao, "within_window");
  assert.equal(idade.idadeDias, 365);
  assert.equal(idade.idadeAnos, 1);
});

test("calcularIdade: criado no ultimo instante do fim da janela", () => {
  const idade = calcularIdade("2025-12-31T23:00:00Z", janela);
  assert.equal(idade.posicao, "within_window");
  assert.equal(idade.idadeDias, 0);
  assert.equal(idade.idadeAnos, 0);
});

test("calcularIdade: criado depois da janela tem idade negativa e e' sinalizado", () => {
  const idade = calcularIdade("2026-01-11T00:00:00Z", janela);
  assert.equal(idade.posicao, "after_window");
  assert.equal(idade.idadeDias, -10);
});

test("calcularIdade: created_at invalido ou ausente -> nulos", () => {
  assert.deepEqual(calcularIdade("ontem", janela), { idadeDias: null, idadeAnos: null, posicao: null });
  assert.deepEqual(calcularIdade(undefined, janela), { idadeDias: null, idadeAnos: null, posicao: null });
});
