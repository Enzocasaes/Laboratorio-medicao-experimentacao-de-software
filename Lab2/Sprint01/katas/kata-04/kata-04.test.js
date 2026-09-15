import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarCupom } from "./solucao-referencia.js";

const cupomBase = {
  tipo: "percentual",
  valor: 10,
  valorMinimoCompra: 0,
  categoriasElegiveis: null,
  limiteDesconto: null,
  hoje: "2026-01-10",
  validoAte: "2026-01-31",
};

test("desconto percentual sem restricao de categoria", () => {
  const carrinho = [{ preco: 100, quantidade: 1, categoria: "livros" }];
  const resultado = aplicarCupom(carrinho, cupomBase);
  assert.equal(resultado.aplicavel, true);
  assert.equal(resultado.desconto, 10);
  assert.equal(resultado.total, 90);
});

test("recusa quando nenhum item e elegivel pela categoria", () => {
  const carrinho = [{ preco: 100, quantidade: 1, categoria: "livros" }];
  const cupom = { ...cupomBase, categoriasElegiveis: ["eletronicos"] };
  const resultado = aplicarCupom(carrinho, cupom);
  assert.equal(resultado.aplicavel, false);
  assert.equal(resultado.motivo, "nenhum item do carrinho e elegivel");
});

test("desconto fixo e limitado ao total elegivel", () => {
  const carrinho = [{ preco: 30, quantidade: 1, categoria: "livros" }];
  const cupom = { ...cupomBase, tipo: "fixo", valor: 50 };
  const resultado = aplicarCupom(carrinho, cupom);
  assert.equal(resultado.desconto, 30);
  assert.equal(resultado.total, 0);
});

test("limiteDesconto limita o desconto percentual", () => {
  const carrinho = [{ preco: 1000, quantidade: 1, categoria: "livros" }];
  const cupom = { ...cupomBase, valor: 50, limiteDesconto: 20 };
  const resultado = aplicarCupom(carrinho, cupom);
  assert.equal(resultado.desconto, 20);
});

test("cupom expirado e recusado", () => {
  const carrinho = [{ preco: 100, quantidade: 1, categoria: "livros" }];
  const cupom = { ...cupomBase, hoje: "2026-02-01", validoAte: "2026-01-31" };
  const resultado = aplicarCupom(carrinho, cupom);
  assert.equal(resultado.aplicavel, false);
  assert.equal(resultado.motivo, "cupom expirado");
});

test("hoje igual a validoAte ainda e valido", () => {
  const carrinho = [{ preco: 100, quantidade: 1, categoria: "livros" }];
  const cupom = { ...cupomBase, hoje: "2026-01-31", validoAte: "2026-01-31" };
  assert.equal(aplicarCupom(carrinho, cupom).aplicavel, true);
});

test("recusa quando o total nao atinge o minimo de compra", () => {
  const carrinho = [{ preco: 20, quantidade: 1, categoria: "livros" }];
  const cupom = { ...cupomBase, valorMinimoCompra: 50 };
  const resultado = aplicarCupom(carrinho, cupom);
  assert.equal(resultado.aplicavel, false);
  assert.equal(resultado.motivo, "valor minimo de compra nao atingido");
});

test("desconto incide so sobre a subtotal elegivel em carrinho misto", () => {
  const carrinho = [
    { preco: 100, quantidade: 1, categoria: "livros" },
    { preco: 200, quantidade: 1, categoria: "eletronicos" },
  ];
  const cupom = { ...cupomBase, categoriasElegiveis: ["eletronicos"] };
  const resultado = aplicarCupom(carrinho, cupom);
  assert.equal(resultado.desconto, 20);
  assert.equal(resultado.total, 280);
});

test("tipo de cupom invalido lanca erro", () => {
  const carrinho = [{ preco: 100, quantidade: 1, categoria: "livros" }];
  assert.throws(() => aplicarCupom(carrinho, { ...cupomBase, tipo: "outro" }), Error);
});

test("valor negativo lanca erro", () => {
  const carrinho = [{ preco: 100, quantidade: 1, categoria: "livros" }];
  assert.throws(() => aplicarCupom(carrinho, { ...cupomBase, valor: -5 }), Error);
});

test("arredonda desconto e total para 2 casas decimais", () => {
  const carrinho = [{ preco: 33.33, quantidade: 1, categoria: "livros" }];
  const resultado = aplicarCupom(carrinho, cupomBase);
  assert.equal(resultado.desconto, 3.33);
  assert.equal(resultado.total, 30);
});

test("soma corretamente varios itens da mesma categoria elegivel", () => {
  const carrinho = [
    { preco: 10, quantidade: 3, categoria: "livros" },
    { preco: 5, quantidade: 2, categoria: "livros" },
  ];
  const resultado = aplicarCupom(carrinho, cupomBase);
  assert.equal(resultado.desconto, 4);
  assert.equal(resultado.total, 36);
});
