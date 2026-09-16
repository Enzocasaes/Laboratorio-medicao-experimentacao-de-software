import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularTarifa } from "./solucao-referencia.js";

const tabela = { toleranciaMin: 15, tarifaMinima: 8, tarifaPorHora: 5, tetoDiario: 40 };

test("permanencia dentro da tolerancia e gratuita", () => {
  assert.equal(calcularTarifa("08:00", "08:10", tabela), 0);
});

test("exatamente no limite da tolerancia ainda e gratuita", () => {
  assert.equal(calcularTarifa("08:00", "08:15", tabela), 0);
});

test("acima da tolerancia e ate 1h cobra a tarifa minima", () => {
  assert.equal(calcularTarifa("08:00", "08:45", tabela), 8);
});

test("exatamente 1h cobra so a tarifa minima", () => {
  assert.equal(calcularTarifa("08:00", "09:00", tabela), 8);
});

test("1h01min cobra tarifa minima mais uma hora iniciada", () => {
  assert.equal(calcularTarifa("08:00", "09:01", tabela), 13);
});

test("2h15min cobra tarifa minima mais duas horas iniciadas", () => {
  assert.equal(calcularTarifa("08:00", "10:15", tabela), 18);
});

test("3h exatas cobram tarifa minima mais duas horas", () => {
  assert.equal(calcularTarifa("08:00", "11:00", tabela), 18);
});

test("valor nunca ultrapassa o teto diario", () => {
  assert.equal(calcularTarifa("08:00", "20:00", tabela), 40);
});

test("horario em formato invalido lanca erro", () => {
  assert.throws(() => calcularTarifa("8:00", "09:00", tabela), Error);
  assert.throws(() => calcularTarifa("08:00", "25:00", tabela), Error);
});

test("saida no mesmo horario ou antes da entrada lanca erro", () => {
  assert.throws(() => calcularTarifa("09:00", "09:00", tabela), Error);
  assert.throws(() => calcularTarifa("09:00", "08:00", tabela), Error);
});

test("campo negativo na tabela lanca erro", () => {
  assert.throws(() => calcularTarifa("08:00", "09:00", { ...tabela, tarifaPorHora: -5 }), Error);
});

test("arredonda o resultado para 2 casas decimais", () => {
  const tabelaFracionaria = { toleranciaMin: 15, tarifaMinima: 8.333, tarifaPorHora: 5, tetoDiario: 40 };
  assert.equal(calcularTarifa("08:00", "08:45", tabelaFracionaria), 8.33);
});
