import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarCSV, linhaCSV, lerCSV } from "../src/csv.js";

test("gerarCSV: cabecalho + linhas, terminando com quebra de linha", () => {
  const csv = gerarCSV(["a", "b"], [[1, 2], [3, 4]]);
  assert.equal(csv, "a,b\n1,2\n3,4\n");
});

test("linhaCSV: uma linha unica ja com \\n", () => {
  assert.equal(linhaCSV(["x", "y", "z"]), "x,y,z\n");
});

test("escaping: campo com virgula vira aspas", () => {
  assert.equal(linhaCSV(["usou IA, com virgula", 3]), '"usou IA, com virgula",3\n');
});

test("escaping: aspas internas sao duplicadas", () => {
  assert.equal(linhaCSV(['ele disse "oi"']), '"ele disse ""oi"""\n');
});

test("escaping: quebra de linha dentro do campo forca aspas", () => {
  assert.equal(linhaCSV(["linha1\nlinha2"]), '"linha1\nlinha2"\n');
});

test("lerCSV: separa cabecalho e linhas", () => {
  const { cabecalho, linhas } = lerCSV("a,b,c\n1,2,3\n4,5,6\n");
  assert.deepEqual(cabecalho, ["a", "b", "c"]);
  assert.deepEqual(linhas, [["1", "2", "3"], ["4", "5", "6"]]);
});

test("lerCSV: respeita campos entre aspas com virgula e aspas escapadas", () => {
  const { linhas } = lerCSV('h1,h2\n"a, b","c ""d"""\n');
  assert.deepEqual(linhas, [["a, b", 'c "d"']]);
});

test("lerCSV: ignora CRLF", () => {
  const { linhas } = lerCSV("a,b\r\n1,2\r\n");
  assert.deepEqual(linhas, [["1", "2"]]);
});

test("round-trip: lerCSV(gerarCSV(x)) preserva os dados como texto", () => {
  const cabecalho = ["trial_id", "obs", "n"];
  const dados = [
    ["P1_kata-03_com-ia", "usou IA, e aspas \"aqui\"", "7"],
    ["P2_kata-01_sem-ia", "", "0"],
  ];
  const { cabecalho: c2, linhas } = lerCSV(gerarCSV(cabecalho, dados));
  assert.deepEqual(c2, cabecalho);
  assert.deepEqual(linhas, dados);
});
