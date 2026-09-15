import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarNotas } from "./solucao-referencia.js";

test("colapsa espacos multiplos em um so", () => {
  assert.equal(normalizarNotas("a    b"), "a b");
});

test("remove espacos/tabs no fim da linha", () => {
  assert.equal(normalizarNotas("- item   \t"), "- item");
});

test("converte '* ' em '- ' apos colapsar a indentacao", () => {
  assert.equal(normalizarNotas("  * item"), " - item");
});

test("capitaliza a primeira letra do titulo", () => {
  assert.equal(normalizarNotas("# ola mundo"), "# Ola mundo");
});

test("titulo ja capitalizado nao muda", () => {
  assert.equal(normalizarNotas("# Ola mundo"), "# Ola mundo");
});

test("linha comecando com '#' sem espaco nao e titulo", () => {
  assert.equal(normalizarNotas("#tag"), "#tag");
});

test("colapsa duas ou mais linhas em branco em exatamente uma", () => {
  assert.equal(normalizarNotas("a\n\n\n\nb"), "a\n\nb");
});

test("remove linhas em branco no inicio e no fim", () => {
  assert.equal(normalizarNotas("\n\n# titulo\nconteudo\n\n\n"), "# Titulo\nconteudo");
});

test("exemplo completo do enunciado", () => {
  const entrada = "#   titulo principal\n*  primeiro item\n*    segundo item   \n\n\n- terceiro item";
  const esperado = "# Titulo principal\n- primeiro item\n- segundo item\n\n- terceiro item";
  assert.equal(normalizarNotas(entrada), esperado);
});

test("texto de uma linha so, sem blocos", () => {
  assert.equal(normalizarNotas("# ola"), "# Ola");
});

test("linha comum, sem marcador, fica inalterada", () => {
  assert.equal(normalizarNotas("apenas um paragrafo comum"), "apenas um paragrafo comum");
});

test("preserva o separador de um unico bloco entre varios blocos", () => {
  assert.equal(normalizarNotas("a\n\nb\n\n\n\nc"), "a\n\nb\n\nc");
});
