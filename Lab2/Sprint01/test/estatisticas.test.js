import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularMediana, calcularQuartis, detectarOutliers } from "../src/estatisticas.js";

test("calcularMediana: numero impar de elementos", () => {
  assert.equal(calcularMediana([3, 1, 2]), 2);
});

test("calcularMediana: numero par de elementos = media dos dois centrais", () => {
  assert.equal(calcularMediana([1, 2, 3, 4]), 2.5);
});

test("calcularMediana: um unico elemento", () => {
  assert.equal(calcularMediana([42]), 42);
});

test("calcularMediana: nao depende da ordem de entrada e aceita negativos", () => {
  assert.equal(calcularMediana([10, -5, 3, -1, 7]), 3);
});

test("calcularMediana: nao muta o array recebido", () => {
  const entrada = [5, 1, 3];
  calcularMediana(entrada);
  assert.deepEqual(entrada, [5, 1, 3]);
});

test("calcularQuartis: conjunto par", () => {
  // [1,2,3,4,5,6,7,8] -> inferior [1..4] q1=2.5 ; superior [5..8] q3=6.5
  assert.deepEqual(calcularQuartis([1, 2, 3, 4, 5, 6, 7, 8]), { q1: 2.5, q3: 6.5 });
});

test("calcularQuartis: conjunto impar exclui o elemento central", () => {
  // [1..7] -> inferior [1,2,3] q1=2 ; superior [5,6,7] q3=6
  assert.deepEqual(calcularQuartis([1, 2, 3, 4, 5, 6, 7]), { q1: 2, q3: 6 });
});

test("detectarOutliers: conjunto homogeneo nao tem outliers", () => {
  const r = detectarOutliers([10, 11, 12, 10, 11, 12]);
  assert.deepEqual(r.indices, []);
});

test("detectarOutliers: identifica o indice do valor extremo", () => {
  const r = detectarOutliers([10, 11, 12, 10, 11, 100]);
  assert.deepEqual(r.indices, [5]);
  assert.ok(r.limiteSuperior < 100);
});

test("detectarOutliers: devolve q1, q3, iqr e limites coerentes", () => {
  const r = detectarOutliers([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.q1, 2.5);
  assert.equal(r.q3, 6.5);
  assert.equal(r.iqr, 4);
  assert.equal(r.limiteInferior, 2.5 - 6);
  assert.equal(r.limiteSuperior, 6.5 + 6);
});
