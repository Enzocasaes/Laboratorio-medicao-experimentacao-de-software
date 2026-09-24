import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverData } from "./solucao.js";

test("soma dias corridos", () => {
  assert.equal(resolverData("+3 dias", "2026-01-30"), "2026-02-02");
});

test("subtrai semanas", () => {
  assert.equal(resolverData("-2 semanas", "2026-01-30"), "2026-01-16");
});

test("proxima ocorrencia de um dia da semana, a partir de uma sexta", () => {
  assert.equal(resolverData("proxima segunda", "2026-02-06"), "2026-02-09");
});

test("ultimo dia do mes", () => {
  assert.equal(resolverData("ultimo dia do mes", "2026-02-10"), "2026-02-28");
});

test("soma dias uteis pulando fins de semana", () => {
  assert.equal(resolverData("+5 dias uteis", "2026-02-06"), "2026-02-13");
});

test("subtrai dias uteis", () => {
  assert.equal(resolverData("-1 dias uteis", "2026-02-09"), "2026-02-06");
});

test("+0 dias devolve a propria base", () => {
  assert.equal(resolverData("+0 dias", "2026-01-30"), "2026-01-30");
});

test("soma de dias atravessa a virada do ano corretamente", () => {
  assert.equal(resolverData("+2 dias", "2029-12-31"), "2030-01-02");
});

test("ultimo dia de fevereiro em ano bissexto", () => {
  assert.equal(resolverData("ultimo dia do mes", "2028-02-10"), "2028-02-29");
});

test("'proxima <dia>' quando a base ja e' aquele dia avanca para a semana seguinte", () => {
  assert.equal(resolverData("proxima segunda", "2026-02-09"), "2026-02-16");
});

test("expressao invalida lanca erro com mensagem padronizada", () => {
  assert.throws(() => resolverData("+3 meses", "2026-01-30"), {
    message: 'expressao de data invalida: "+3 meses"',
  });
});

test("ignora espacos nas pontas e maiusculas/minusculas", () => {
  assert.equal(resolverData("  +3 DIAS  ", "2026-01-30"), "2026-02-02");
});
