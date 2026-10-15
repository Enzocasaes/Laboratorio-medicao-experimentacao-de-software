// Etapa "corretiva" de ponta a ponta: previsoes no contrato da validacao,
// detalhe por release, CFR (b) por repositorio e retomada pelo cache.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { criarCacheEmDisco } from "../src/github/cache.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import { VERSOES } from "../src/releases/corretiva.js";
import { executarCorretiva, executarReleases } from "../src/releases/index.js";
import { executarSelecao } from "../src/selecao/index.js";
import { avaliarHeuristica } from "../src/validacao/heuristica.js";
import { commit, criarApiFalsa, pastaTemporaria, release, repo } from "./apoio/api-falsa.js";

function configPara(pasta, versao = "v3-patch-e-commits") {
  return {
    janela: criarJanela("2025-01-01", "2025-12-31"),
    selecao: { estrelasAcimaDe: 1000, quantidadeDeCandidatos: 1, tamanhoAlvoDaAmostra: 1, minimoDeReleases: 5, minimoDeWorkflowRuns: 50 },
    coleta: { releasesPorPagina: 100, maxPaginasDeReleases: 20, commitsPorPagina: 100, maxCommitsPorRelease: 1000 },
    heuristica: { versao, diasParaCorrecao: 7 },
    diretorios: { cache: join(pasta, "cache"), saida: join(pasta, "data") },
  };
}

// v1.0.0 -> v1.0.1 em 2 dias, com "fix: crash"     => v1.0.0 FALHOU
// v1.0.1 -> v1.1.0 em 29 dias                       => nao falhou
// v1.1.0 -> v1.1.1 em 3 dias, patch sem fix         => nao falhou na v3 (falha na v1)
// v1.1.1 -> v1.2.0 em 28 dias                       => nao falhou
// v1.2.0 -> v1.2.1 em 5 dias, comparacao com erro   => indeterminada na v3
// v1.2.1 em 2025-12-28                              => censurada
const PUBLICACOES = [
  ["v0.9.0", "2024-12-01T12:00:00Z", null],
  ["v1.0.0", "2025-01-10T12:00:00Z", ["feat: primeira versao"]],
  ["v1.0.1", "2025-01-12T12:00:00Z", ["fix: crash ao abrir arquivo", "chore(release): 1.0.1"]],
  ["v1.1.0", "2025-02-10T12:00:00Z", ["feat: exportar csv"]],
  ["v1.1.1", "2025-02-13T12:00:00Z", ["refactor: simplifica parser"]],
  ["v1.2.0", "2025-03-13T12:00:00Z", ["feat: tema escuro", "fix: alinhamento"]],
  ["v1.2.1", "2025-03-18T12:00:00Z", "erro"],
  ["v1.3.0", "2025-12-28T12:00:00Z", ["feat: x"]],
];

async function cenario(versao) {
  const pasta = pastaTemporaria();
  const config = configPara(pasta, versao);
  const comparacoes = {};
  for (let i = 1; i < PUBLICACOES.length; i += 1) {
    const [tag, publicadaEm, mensagens] = PUBLICACOES[i];
    if (mensagens === "erro") continue; // sem comparacao -> 404 (tag apagada)
    comparacoes[`${PUBLICACOES[i - 1][0]}...${tag}`] = mensagens.map((mensagem, j) => commit(`${tag}-${j}`, publicadaEm, { mensagem }));
  }
  const api = criarApiFalsa({
    repos: [repo("a/app", 5000)],
    releases: { "a/app": PUBLICACOES.map(([tag, publicadaEm]) => release(tag, publicadaEm, { id: Number(tag.replace(/\D/g, "")) })) },
    comparacoes: { "a/app": comparacoes },
  });
  const cliente = criarClienteGitHub({ token: "t", cache: criarCacheEmDisco(config.diretorios.cache), fetch: api.fetch, esperar: async () => {} });
  await executarSelecao({ config, cliente, log: logSilencioso });
  await executarReleases({ config, cliente, log: logSilencioso });
  const resultado = await executarCorretiva({ config, cliente, log: logSilencioso, agora: () => new Date("2026-01-05T00:00:00Z") });
  return { pasta, api, cliente, config, resultado };
}

function csv(pasta, nome) {
  const { cabecalho, linhas } = lerCSV(readFileSync(join(pasta, "data", "processed", nome), "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((coluna, i) => [coluna, linha[i]])));
}

test("executarCorretiva: CFR (b) com falha, censura e indeterminada", async () => {
  const { pasta } = await cenario();
  const [linha] = csv(pasta, "cfr_entrega.csv");
  assert.equal(linha.full_name, "a/app");
  assert.equal(linha.corrective_heuristic, "v3-patch-e-commits");
  assert.equal(linha.deploys_in_window, "7");
  assert.equal(linha.cfr_delivery_censored, "1");
  assert.equal(linha.cfr_delivery_undetermined, "1");
  assert.equal(linha.cfr_delivery_evaluated, "5");
  assert.equal(linha.cfr_delivery_failed, "1");
  assert.equal(linha.change_failure_rate_delivery, "0.2");

  const status = Object.fromEntries(csv(pasta, "release_corretiva.csv").map((l) => [l.tag_name, l.cfr_delivery_status]));
  assert.deepEqual(status, {
    "v1.0.0": "failed", "v1.0.1": "not_failed", "v1.1.0": "not_failed", "v1.1.1": "not_failed", "v1.2.0": "undetermined", "v1.2.1": "not_failed", "v1.3.0": "censored",
  });
});

test("executarCorretiva: a versao escolhida no config muda o CFR (b)", async () => {
  const { pasta } = await cenario("v1-semver-patch");
  const [linha] = csv(pasta, "cfr_entrega.csv");
  // v1 so' olha o semver: v1.1.1 e v1.2.1 tambem viram corretivas
  assert.equal(linha.cfr_delivery_failed, "3");
  assert.equal(linha.cfr_delivery_undetermined, "0");
  assert.equal(linha.change_failure_rate_delivery, "0.5");
});

test("executarCorretiva: heuristica_corretiva.csv segue o contrato da validacao, com todas as versoes", async () => {
  const { pasta } = await cenario();
  const previsoes = csv(pasta, "heuristica_corretiva.csv");
  assert.deepEqual(Object.keys(previsoes[0]), ["full_name", "release_id", "tag_name", "corretiva_prevista", "versao_heuristica"]);
  assert.deepEqual([...new Set(previsoes.map((p) => p.versao_heuristica))].sort(), VERSOES.map((v) => v.id).sort());

  const de = (tag, versao) => previsoes.find((p) => p.tag_name === tag && p.versao_heuristica === versao)?.corretiva_prevista;
  assert.equal(de("v1.0.1", "v3-patch-e-commits"), "sim");
  assert.equal(de("v1.1.1", "v1-semver-patch"), "sim");
  assert.equal(de("v1.1.1", "v3-patch-e-commits"), "nao");
  assert.equal(de("v1.2.1", "v3-patch-e-commits"), undefined, "comparacao com erro: sem previsao, em vez de 'nao'");
  assert.equal(de("v1.2.1", "v1-semver-patch"), "sim", "o semver nao depende da comparacao");

  // A validacao (Pessoa A) consome o arquivo sem problema de formato.
  const consenso = [{ unidade_id: "a/app@101", full_name: "a/app", release_id: "101", tag_name: "v1.0.1", status: "consenso", rotulo_consenso: "sim" }];
  const { versoes, problemas } = avaliarHeuristica({ consenso, previsoes });
  assert.equal(problemas.length, 0);
  assert.ok(versoes.every((v) => v.vp === 1));
});

test("executarCorretiva: detalhe por release traz os sinais e a previsao de cada versao", async () => {
  const { pasta } = await cenario();
  const v101 = csv(pasta, "release_corretiva.csv").find((l) => l.tag_name === "v1.0.1");
  assert.equal(v101.base_tag, "v1.0.0");
  assert.equal(v101.version_increment, "patch");
  assert.equal(v101.commits_read, "2");
  assert.equal(v101.commits_fix, "1");
  assert.equal(v101.commits_release, "1");
  assert.equal(v101.corrective_share, "1");
  for (const v of VERSOES) assert.equal(v101[`corrective_${v.id}`], "sim", v.id);

  const bruto = JSON.parse(readFileSync(join(pasta, "data", "raw", "cfr_entrega.json"), "utf8"));
  assert.equal(bruto.versao_usada_no_cfr, "v3-patch-e-commits");
  assert.equal(bruto.versoes.length, VERSOES.length);
});

test("executarCorretiva: segunda execucao nao vai a rede (mesmas comparacoes do cache)", async () => {
  const { api, cliente, config } = await cenario();
  const antes = api.chamadas.length;
  await executarCorretiva({ config, cliente, log: logSilencioso });
  assert.equal(api.chamadas.length, antes);
});
