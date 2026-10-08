import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SELECAO_PADRAO, carregarConfig, validarConfig } from "../src/config.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

const JANELA = { inicio: "2025-01-01", fim: "2025-12-31" };

test("validarConfig: sem janela -> erro explicando que as datas sao do professor", () => {
  assert.throws(() => validarConfig({}), /defina janela.inicio e janela.fim/);
  assert.throws(() => validarConfig({ janela: { inicio: "2025-01-01" } }), /defina janela.inicio e janela.fim/);
});

test("validarConfig: datas com marcador ou invalidas sao rejeitadas", () => {
  assert.throws(() => validarConfig({ janela: { inicio: "AAAA-MM-DD", fim: "AAAA-MM-DD" } }), /janela.inicio invalida/);
  assert.throws(() => validarConfig({ janela: { inicio: "2025-01-01", fim: "2025-02-30" } }), /janela.fim invalida/);
});

test("validarConfig: aplica os padroes da selecao (criterio oficial 5 releases / 50 runs)", () => {
  const config = validarConfig({ janela: JANELA }, { baseDir: "/projeto" });
  assert.deepEqual(config.selecao, { ...SELECAO_PADRAO });
  assert.equal(config.selecao.minimoDeReleases, 5);
  assert.equal(config.selecao.minimoDeWorkflowRuns, 50);
  assert.equal(config.janela.dias, 365);
});

test("validarConfig: diretorios relativos sao resolvidos a partir da pasta do config", () => {
  const config = validarConfig({ janela: JANELA, diretorios: { cache: "c", saida: "../saida" } }, { baseDir: "/projeto/lab" });
  // resolve() nos dois lados: no Windows o caminho absoluto ganha a unidade
  // ("C:\projeto\lab\c") e a comparacao literal falharia so' la'.
  assert.equal(config.diretorios.cache, resolve("/projeto/lab", "c"));
  assert.equal(config.diretorios.saida, resolve("/projeto/lab", "../saida"));
});

test("validarConfig: numeros invalidos sao rejeitados com o nome do campo", () => {
  const casos = [
    [{ quantidadeDeCandidatos: 0 }, /quantidadeDeCandidatos/],
    [{ quantidadeDeCandidatos: 10.5 }, /quantidadeDeCandidatos/],
    [{ tamanhoAlvoDaAmostra: "100" }, /tamanhoAlvoDaAmostra/],
    [{ estrelasAcimaDe: -1 }, /estrelasAcimaDe/],
    [{ minimoDeReleases: -5 }, /minimoDeReleases/],
    [{ quantidadeDeCandidatos: 50, tamanhoAlvoDaAmostra: 100 }, /nao pode ser maior/],
  ];
  for (const [selecao, erro] of casos) {
    assert.throws(() => validarConfig({ janela: JANELA, selecao }), erro);
  }
  assert.throws(() => validarConfig(null), /objeto JSON/);
});

test("carregarConfig: le o arquivo e resolve caminhos relativos a ele", () => {
  const pasta = pastaTemporaria();
  const caminho = join(pasta, "config.json");
  writeFileSync(caminho, JSON.stringify({ janela: JANELA, selecao: { quantidadeDeCandidatos: 300 } }));
  const config = carregarConfig(caminho);
  assert.equal(config.selecao.quantidadeDeCandidatos, 300);
  assert.equal(config.diretorios.saida, join(pasta, "data"));
});

test("carregarConfig: arquivo ausente ou JSON invalido -> mensagem clara", () => {
  const pasta = pastaTemporaria();
  assert.throws(() => carregarConfig(join(pasta, "nao-existe.json")), /Nao foi possivel ler o arquivo de configuracao/);
  const quebrado = join(pasta, "quebrado.json");
  writeFileSync(quebrado, "{ janela: ");
  assert.throws(() => carregarConfig(quebrado), /nao e' um JSON valido/);
});
