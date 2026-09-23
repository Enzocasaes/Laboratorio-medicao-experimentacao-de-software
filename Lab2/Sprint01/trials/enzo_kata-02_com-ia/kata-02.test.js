import { test } from "node:test";
import assert from "node:assert/strict";
import { alocarReservas } from "./solucao.js";

test("aceita um unico pedido", () => {
  const { alocadas, recusadas } = alocarReservas([{ sala: "A", inicioMin: 0, fimMin: 30 }]);
  assert.equal(alocadas.length, 1);
  assert.equal(recusadas.length, 0);
});

test("aceita pedidos adjacentes (fim exclusivo)", () => {
  const { alocadas, recusadas } = alocarReservas([
    { sala: "A", inicioMin: 0, fimMin: 60 },
    { sala: "A", inicioMin: 60, fimMin: 90 },
  ]);
  assert.equal(alocadas.length, 2);
  assert.equal(recusadas.length, 0);
});

test("recusa pedido que sobrepoe um ja aceito na mesma sala", () => {
  const { alocadas, recusadas } = alocarReservas([
    { sala: "A", inicioMin: 0, fimMin: 60 },
    { sala: "A", inicioMin: 30, fimMin: 45 },
  ]);
  assert.equal(alocadas.length, 1);
  assert.equal(recusadas.length, 1);
});

test("salas diferentes nunca conflitam", () => {
  const { alocadas } = alocarReservas([
    { sala: "A", inicioMin: 0, fimMin: 60 },
    { sala: "B", inicioMin: 0, fimMin: 60 },
  ]);
  assert.equal(alocadas.length, 2);
});

test("preserva a ordem original em alocadas", () => {
  const reservas = [
    { sala: "A", inicioMin: 0, fimMin: 10 },
    { sala: "B", inicioMin: 0, fimMin: 10 },
    { sala: "A", inicioMin: 20, fimMin: 30 },
  ];
  const { alocadas } = alocarReservas(reservas);
  assert.deepEqual(alocadas, reservas);
});

test("preserva a ordem original em recusadas", () => {
  const reservas = [
    { sala: "A", inicioMin: 0, fimMin: 60 },
    { sala: "A", inicioMin: 10, fimMin: 20 },
    { sala: "A", inicioMin: 15, fimMin: 25 },
  ];
  const { recusadas } = alocarReservas(reservas);
  assert.deepEqual(recusadas, [reservas[1], reservas[2]]);
});

test("lista vazia devolve alocadas e recusadas vazias", () => {
  assert.deepEqual(alocarReservas([]), { alocadas: [], recusadas: [] });
});

test("lanca erro quando inicioMin >= fimMin", () => {
  assert.throws(() => alocarReservas([{ sala: "A", inicioMin: 30, fimMin: 30 }]), Error);
});

test("lanca erro quando sala e invalida ou inicioMin/fimMin estao fora de [0,1439]", () => {
  assert.throws(() => alocarReservas([{ sala: "", inicioMin: 0, fimMin: 30 }]), Error);
  assert.throws(() => alocarReservas([{ sala: "A", inicioMin: -1, fimMin: 30 }]), Error);
  assert.throws(() => alocarReservas([{ sala: "A", inicioMin: 0, fimMin: 1440 }]), Error);
});

test("varios pedidos sequenciais sem sobreposicao sao todos aceitos", () => {
  const { alocadas } = alocarReservas([
    { sala: "A", inicioMin: 0, fimMin: 30 },
    { sala: "A", inicioMin: 30, fimMin: 60 },
    { sala: "A", inicioMin: 60, fimMin: 90 },
  ]);
  assert.equal(alocadas.length, 3);
});

test("pedido totalmente contido em outro ja aceito e recusado", () => {
  const { alocadas, recusadas } = alocarReservas([
    { sala: "A", inicioMin: 0, fimMin: 100 },
    { sala: "A", inicioMin: 20, fimMin: 40 },
  ]);
  assert.equal(alocadas.length, 1);
  assert.equal(recusadas.length, 1);
});

test("terceiro pedido nao conflita com os ja aceitos apos uma recusa no meio", () => {
  const { alocadas, recusadas } = alocarReservas([
    { sala: "A", inicioMin: 0, fimMin: 60 },
    { sala: "A", inicioMin: 30, fimMin: 90 },
    { sala: "A", inicioMin: 60, fimMin: 120 },
  ]);
  assert.equal(alocadas.length, 2);
  assert.equal(recusadas.length, 1);
  assert.equal(alocadas[1].inicioMin, 60);
});
