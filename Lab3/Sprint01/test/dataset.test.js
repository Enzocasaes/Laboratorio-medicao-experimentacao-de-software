// Consolidação do dataset e dicionário de dados: junção das três etapas,
// coluna derivada da RQ 01, colunas faltantes quando uma etapa não terminou e
// a garantia de que o dicionário descreve exatamente as colunas do CSV.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { COLUNAS_DATASET, NOMES_DAS_COLUNAS } from "../src/dataset/colunas.js";
import {
  executarDataset,
  frequenciaDeDeploy,
  gerarDicionarioCSV,
  gerarDicionarioMarkdown,
  lerPorRepositorio,
  montarLinha,
  repositoriosDoDataset,
} from "../src/dataset/index.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

const JANELA = criarJanela("2025-10-22", "2026-10-22"); // 366 dias

function escreverCSV(caminho, cabecalho, linhas) {
  mkdirSync(join(caminho, ".."), { recursive: true });
  writeFileSync(caminho, [cabecalho.join(","), ...linhas.map((l) => l.join(","))].join("\n") + "\n");
}

function prepararDados(pasta, { comLeadTime = true, comRuns = true } = {}) {
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });

  escreverCSV(
    join(processados, "repositories.csv"),
    ["rank", "full_name", "html_url", "stars", "language", "default_branch", "status", "releases_in_window"],
    [
      ["1", "a/incluido", "https://github.com/a/incluido", "5000", "Go", "main", "included", "52"],
      ["2", "a/outro", "https://github.com/a/outro", "4000", "Rust", "main", "included", "6"],
      ["3", "a/fora", "https://github.com/a/fora", "3000", "C", "main", "excluded", "1"],
    ]
  );

  if (comLeadTime) {
    escreverCSV(
      join(processados, "lead_time.csv"),
      ["full_name", "releases_in_window", "releases_evaluated", "lead_time_release_median_days", "lead_time_commit_median_days", "errors"],
      [
        ["a/incluido", "52", "52", "0.5", "0.2", ""],
        ["a/outro", "6", "5", "9.75", "4.5", "compare_http_404:1"],
      ]
    );
  }

  if (comRuns) {
    escreverCSV(
      join(processados, "dora_runs.csv"),
      ["full_name", "valid_workflow_runs", "successful_runs", "failed_runs", "change_failure_rate_ci", "recovery_median_hours", "error"],
      [
        ["a/incluido", "900", "800", "100", "0.1111", "1.5", ""],
        ["a/outro", "120", "100", "20", "0.1667", "20", ""],
      ]
    );
  }

  return { config: { janela: JANELA, diretorios: { saida: join(pasta, "data") } }, processados };
}

function lerSaida(caminho) {
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((coluna, i) => [coluna, linha[i]])));
}

// ---- coluna derivada da RQ 01 --------------------------------------------

test("frequenciaDeDeploy: releases na janela / semanas da janela", () => {
  // 366 dias = 52,2857 semanas; 52 releases -> ~0,9946 por semana
  assert.equal(frequenciaDeDeploy(52, JANELA), 0.9945);
  assert.equal(frequenciaDeDeploy(0, JANELA), 0);
});

test("frequenciaDeDeploy: sem contagem de releases devolve null, nao zero", () => {
  assert.equal(frequenciaDeDeploy(null, JANELA), null);
});

// ---- junção --------------------------------------------------------------

test("montarLinha: junta repositorio, lead time e runs na ordem das colunas", () => {
  const linha = montarLinha({
    repositorio: { full_name: "a/b", rank: "1", stars: "5000" },
    leadtime: { releases_in_window: "52", lead_time_release_median_days: "0.5", errors: "" },
    runs: { valid_workflow_runs: "900", change_failure_rate_ci: "0.1111", error: "" },
    janela: JANELA,
  });

  assert.equal(linha.length, NOMES_DAS_COLUNAS.length);
  assert.equal(linha[NOMES_DAS_COLUNAS.indexOf("full_name")], "a/b");
  assert.equal(linha[NOMES_DAS_COLUNAS.indexOf("lead_time_release_median_days")], "0.5");
  assert.equal(linha[NOMES_DAS_COLUNAS.indexOf("change_failure_rate_ci")], "0.1111");
  assert.equal(linha[NOMES_DAS_COLUNAS.indexOf("deployment_frequency_per_week")], 0.9945);
});

test("montarLinha: etapa que nao rodou deixa as colunas vazias, sem quebrar", () => {
  const linha = montarLinha({ repositorio: { full_name: "a/b" }, janela: JANELA });
  assert.equal(linha[NOMES_DAS_COLUNAS.indexOf("recovery_median_hours")], "");
  assert.equal(linha[NOMES_DAS_COLUNAS.indexOf("deployment_frequency_per_week")], "");
});

test("repositoriosDoDataset: so' a amostra final, em ordem de rank", () => {
  const repositorios = new Map([
    ["b", { full_name: "b", rank: "2", status: "included" }],
    ["a", { full_name: "a", rank: "1", status: "included" }],
    ["c", { full_name: "c", rank: "3", status: "excluded" }],
  ]);
  assert.deepEqual(repositoriosDoDataset(repositorios).map((r) => r.full_name), ["a", "b"]);
});

test("repositoriosDoDataset: antes de a amostra fechar, usa os elegiveis", () => {
  const repositorios = new Map([
    ["a", { full_name: "a", rank: "1", status: "eligible" }],
    ["b", { full_name: "b", rank: "2", status: "pending" }],
  ]);
  assert.deepEqual(repositoriosDoDataset(repositorios).map((r) => r.full_name), ["a"]);
});

test("lerPorRepositorio: arquivo inexistente vira mapa vazio (etapa ainda nao rodou)", () => {
  assert.equal(lerPorRepositorio(join(pastaTemporaria(), "nao-existe.csv")).size, 0);
});

// ---- etapa ---------------------------------------------------------------

test("executarDataset: gera uma linha por repositorio da amostra final", async () => {
  const pasta = pastaTemporaria();
  const { config } = prepararDados(pasta);

  const resultado = await executarDataset({ config, log: logSilencioso });

  assert.equal(resultado.linhas, 2);
  const dataset = lerSaida(resultado.caminhos.dataset);
  assert.deepEqual(dataset.map((l) => l.full_name), ["a/incluido", "a/outro"]);
  assert.equal(dataset[0].deployment_frequency_per_week, "0.9945");
  assert.equal(dataset[0].change_failure_rate_ci, "0.1111");
  assert.equal(dataset[1].leadtime_errors, "compare_http_404:1");
});

test("executarDataset: avisa quantos repositorios ainda nao tem runs", async () => {
  const pasta = pastaTemporaria();
  const { config } = prepararDados(pasta, { comRuns: false });

  const resultado = await executarDataset({ config, log: logSilencioso });

  assert.equal(resultado.semRuns, 2);
  assert.equal(resultado.semLeadTime, 0);
  const dataset = lerSaida(resultado.caminhos.dataset);
  assert.equal(dataset[0].change_failure_rate_ci, ""); // vazio, nao zero
  assert.equal(dataset[0].lead_time_release_median_days, "0.5"); // o que existe continua
});

test("executarDataset: sem a selecao, explica qual etapa rodar antes", async () => {
  const pasta = pastaTemporaria();
  const config = { janela: JANELA, diretorios: { saida: join(pasta, "data") } };

  await assert.rejects(() => executarDataset({ config, log: logSilencioso }), /coletar:repositorios/);
});

// ---- dicionário ----------------------------------------------------------

test("dicionario: descreve exatamente as colunas do dataset, sem sobra nem falta", async () => {
  const pasta = pastaTemporaria();
  const { config } = prepararDados(pasta);
  const resultado = await executarDataset({ config, log: logSilencioso });

  const dicionario = lerSaida(resultado.caminhos.dicionarioCSV);
  assert.deepEqual(dicionario.map((l) => l.coluna), [...NOMES_DAS_COLUNAS]);

  const { cabecalho } = lerCSV(readFileSync(resultado.caminhos.dataset, "utf8"));
  assert.deepEqual(cabecalho, [...NOMES_DAS_COLUNAS]);
});

test("dicionario: toda coluna tem tipo, unidade e formula ou origem", () => {
  for (const coluna of COLUNAS_DATASET) {
    assert.ok(coluna.tipo, `${coluna.nome} sem tipo`);
    assert.ok(coluna.unidade, `${coluna.nome} sem unidade`);
    assert.ok(coluna.descricao, `${coluna.nome} sem descricao`);
    assert.ok(coluna.formula ?? coluna.origem ?? coluna.de === "repositorio", `${coluna.nome} sem formula/origem`);
  }
});

test("dicionario em CSV e Markdown trazem as mesmas colunas", () => {
  const csv = gerarDicionarioCSV();
  const md = gerarDicionarioMarkdown({ janela: JANELA, geradoEm: "2026-10-13T00:00:00Z", totalDeLinhas: 300 });
  for (const nome of NOMES_DAS_COLUNAS) {
    assert.match(csv, new RegExp(nome.replace(/_/g, "_")));
    assert.ok(md.includes(`\`${nome}\``), `${nome} fora do Markdown`);
  }
  assert.match(md, /Janela de observação: \*\*2025-10-22 a 2026-10-22\*\*/);
  assert.match(md, /Linhas: \*\*300\*\*/);
});
