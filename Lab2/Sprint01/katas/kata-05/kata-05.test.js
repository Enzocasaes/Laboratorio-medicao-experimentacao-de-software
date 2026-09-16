import { test } from "node:test";
import assert from "node:assert/strict";
import { classificar } from "./solucao-referencia.js";

test("ordena por pontos decrescente", () => {
  const resultado = classificar([
    { nome: "A", pontos: 5, vitorias: 1, saldo: 0 },
    { nome: "B", pontos: 10, vitorias: 1, saldo: 0 },
  ]);
  assert.deepEqual(resultado.map((r) => r.nome), ["B", "A"]);
});

test("empate em pontos desempata por vitorias", () => {
  const resultado = classificar([
    { nome: "A", pontos: 10, vitorias: 1, saldo: 0 },
    { nome: "B", pontos: 10, vitorias: 3, saldo: 0 },
  ]);
  assert.deepEqual(resultado.map((r) => r.nome), ["B", "A"]);
});

test("empate em pontos e vitorias desempata por saldo", () => {
  const resultado = classificar([
    { nome: "A", pontos: 10, vitorias: 3, saldo: 2 },
    { nome: "B", pontos: 10, vitorias: 3, saldo: 8 },
  ]);
  assert.deepEqual(resultado.map((r) => r.nome), ["B", "A"]);
});

test("empate total desempata a exibicao por nome, mas mantem a mesma posicao", () => {
  const resultado = classificar([
    { nome: "Zeca", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "Ana", pontos: 10, vitorias: 3, saldo: 5 },
  ]);
  assert.deepEqual(resultado.map((r) => r.nome), ["Ana", "Zeca"]);
  assert.deepEqual(resultado.map((r) => r.posicao), [1, 1]);
});

test("apos um empate duplo, a proxima posicao pula (1,1,3)", () => {
  const resultado = classificar([
    { nome: "A", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "B", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "C", pontos: 7, vitorias: 1, saldo: 1 },
  ]);
  assert.deepEqual(resultado.map((r) => r.posicao), [1, 1, 3]);
});

test("empate triplo produz o padrao 1,1,1,4", () => {
  const resultado = classificar([
    { nome: "A", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "B", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "C", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "D", pontos: 7, vitorias: 1, saldo: 1 },
  ]);
  assert.deepEqual(resultado.map((r) => r.posicao), [1, 1, 1, 4]);
});

test("exemplo do enunciado com quatro participantes", () => {
  const resultado = classificar([
    { nome: "Ana", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "Bruno", pontos: 10, vitorias: 3, saldo: 5 },
    { nome: "Carla", pontos: 10, vitorias: 2, saldo: 8 },
    { nome: "Davi", pontos: 7, vitorias: 1, saldo: 1 },
  ]);
  assert.deepEqual(resultado, [
    { nome: "Ana", posicao: 1 },
    { nome: "Bruno", posicao: 1 },
    { nome: "Carla", posicao: 3 },
    { nome: "Davi", posicao: 4 },
  ]);
});

test("lista vazia devolve lista vazia", () => {
  assert.deepEqual(classificar([]), []);
});

test("um unico participante fica na posicao 1", () => {
  const resultado = classificar([{ nome: "A", pontos: 1, vitorias: 0, saldo: 0 }]);
  assert.deepEqual(resultado, [{ nome: "A", posicao: 1 }]);
});

test("campo numerico invalido lanca erro", () => {
  assert.throws(() => classificar([{ nome: "A", pontos: "10", vitorias: 0, saldo: 0 }]), Error);
});

test("nome vazio lanca erro", () => {
  assert.throws(() => classificar([{ nome: "", pontos: 1, vitorias: 0, saldo: 0 }]), Error);
});

test("nomes duplicados lancam erro", () => {
  assert.throws(
    () => classificar([
      { nome: "A", pontos: 1, vitorias: 0, saldo: 0 },
      { nome: "A", pontos: 2, vitorias: 0, saldo: 0 },
    ]),
    Error,
  );
});
