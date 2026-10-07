// Etapas "releases" e "leadtime" de ponta a ponta, sobre a selecao gravada em
// disco: contagem devolvida ao funil, CSVs gerados, --limite e retomada pelo cache.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { criarCacheEmDisco } from "../src/github/cache.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import { executarLeadTime, executarReleases, repositoriosParaLeadTime } from "../src/releases/index.js";
import { executarSelecao } from "../src/selecao/index.js";
import { commit, criarApiFalsa, pastaTemporaria, release, repo, respostaJSON } from "./apoio/api-falsa.js";

const DIA = 24;

function configPara(pasta) {
  return {
    janela: criarJanela("2025-01-01", "2025-12-31"),
    selecao: {
      estrelasAcimaDe: 1000,
      quantidadeDeCandidatos: 2,
      tamanhoAlvoDaAmostra: 2,
      minimoDeReleases: 5,
      minimoDeWorkflowRuns: 50,
    },
    coleta: { releasesPorPagina: 100, maxPaginasDeReleases: 20, commitsPorPagina: 100, maxCommitsPorRelease: 1000 },
    diretorios: { cache: join(pasta, "cache"), saida: join(pasta, "data") },
  };
}

// "a/muitas": 6 releases na janela (v1.0 a v1.5) e uma anterior a ela (v0.9),
// cada release com um unico commit feito 24 h antes -> lead time 1 dia em toda
// release, nas duas variantes. A comparacao de v1.5 nao existe (tag apagada),
// para exercitar o caminho de erro.
// "a/poucas": 4 releases na janela -> abaixo do minimo de 5, deve ser excluida.
const PUBLICACOES = [
  ["v0.9", "2024-12-01T12:00:00Z"],
  ["v1.0", "2025-01-10T12:00:00Z"],
  ["v1.1", "2025-02-10T12:00:00Z"],
  ["v1.2", "2025-03-10T12:00:00Z"],
  ["v1.3", "2025-04-10T12:00:00Z"],
  ["v1.4", "2025-05-10T12:00:00Z"],
  ["v1.5", "2025-06-10T12:00:00Z"],
];

function umDiaAntes(iso) {
  return new Date(Date.parse(iso) - DIA * 60 * 60 * 1000).toISOString().replace(".000Z", "Z");
}

function apiDoCenario() {
  const comparacoes = {};
  for (let i = 1; i < PUBLICACOES.length - 1; i += 1) {
    const [tagAnterior] = PUBLICACOES[i - 1];
    const [tag, publicadaEm] = PUBLICACOES[i];
    comparacoes[`${tagAnterior}...${tag}`] = [commit(`c-${tag}`, umDiaAntes(publicadaEm))];
  }
  // v1.4...v1.5 fica de fora de proposito -> 404 (tag apagada).

  return criarApiFalsa({
    repos: [repo("a/muitas", 5000), repo("a/poucas", 4000)],
    releases: {
      "a/muitas": PUBLICACOES.map(([tag, publicadaEm]) => release(tag, publicadaEm)),
      "a/poucas": [
        release("p1", "2025-02-01T00:00:00Z"),
        release("p2", "2025-03-01T00:00:00Z"),
        release("p3", "2025-04-01T00:00:00Z"),
        release("p4", "2025-05-01T00:00:00Z"),
      ],
    },
    comparacoes: { "a/muitas": comparacoes },
  });
}

function csv(pasta, nome) {
  const { cabecalho, linhas } = lerCSV(readFileSync(join(pasta, "data", "processed", nome), "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((coluna, i) => [coluna, linha[i]])));
}

// Roda a selecao (Pessoa A) para que as etapas de B tenham o que ler.
async function cenario({ limite = null } = {}) {
  const pasta = pastaTemporaria();
  const config = configPara(pasta);
  const api = apiDoCenario();
  const cache = criarCacheEmDisco(config.diretorios.cache);
  const cliente = criarClienteGitHub({ token: "t", cache, fetch: api.fetch, esperar: async () => {} });

  await executarSelecao({ config, cliente, log: logSilencioso });
  const releases = await executarReleases({ config, cliente, log: logSilencioso, limite });
  return { pasta, config, api, cache, cliente, releases };
}

// ---- etapa "releases" ----------------------------------------------------

test("executarReleases: conta as releases da janela e fecha a etapa do funil", async () => {
  const { pasta } = await cenario();

  const funil = csv(pasta, "selection_funnel.csv").find((l) => l.stage === "min_releases");
  assert.equal(funil.entered, "2");
  assert.equal(funil.remaining, "1", "so' a/muitas tem >= 5 releases");
  assert.equal(funil.excluded, "1");
  assert.equal(funil.pending, "0");
  assert.equal(funil.complete, "true");
  assert.equal(funil.exclusion_reasons, "fewer_than_5_releases_in_window:1");
});

test("executarReleases: grava releases_in_window nos CSVs da selecao", async () => {
  const { pasta } = await cenario();
  const candidatos = csv(pasta, "candidates.csv");

  const muitas = candidatos.find((r) => r.full_name === "a/muitas");
  assert.equal(muitas.releases_in_window, "6");
  assert.equal(muitas.status, "pending", "ainda falta a contagem de workflow runs (Pessoa C)");

  const poucas = candidatos.find((r) => r.full_name === "a/poucas");
  assert.equal(poucas.releases_in_window, "4");
  assert.equal(poucas.status, "excluded");
  assert.equal(poucas.exclusion_reason, "fewer_than_5_releases_in_window");
});

test("executarReleases: releases.csv tem uma linha por release, com deploy_index", async () => {
  const { pasta } = await cenario();
  const linhas = csv(pasta, "releases.csv");

  assert.equal(linhas.length, PUBLICACOES.length + 4);
  const muitas = linhas.filter((l) => l.full_name === "a/muitas");
  assert.equal(muitas.length, 7);
  const v10 = muitas.find((l) => l.tag_name === "v1.0");
  assert.equal(v10.in_window, "true");
  assert.equal(v10.is_deploy, "true");
  assert.equal(v10.deploy_index, "2", "v0.9 e' o deploy 1, fora da janela");
  assert.equal(muitas.find((l) => l.tag_name === "v0.9").in_window, "false");
});

test("executarReleases: resumo por repositorio no raw/releases.json", async () => {
  const { pasta, releases } = await cenario();
  const bruto = JSON.parse(readFileSync(join(pasta, "data", "raw", "releases.json"), "utf8"));

  assert.equal(bruto.observation_window.start, "2025-01-01");
  const muitas = bruto.repositorios.find((r) => r.full_name === "a/muitas");
  assert.equal(muitas.releases_in_window, 6);
  assert.equal(muitas.releases_total, 7);
  assert.equal(muitas.has_predecessor, true);
  assert.equal(muitas.error, null);
  assert.equal(releases.porRepositorio.length, 2);
});

test("executarReleases: --limite processa so' os primeiros por estrelas", async () => {
  const { pasta } = await cenario({ limite: 1 });
  const candidatos = csv(pasta, "candidates.csv");

  assert.equal(candidatos.find((r) => r.full_name === "a/muitas").releases_in_window, "6");
  assert.equal(candidatos.find((r) => r.full_name === "a/poucas").releases_in_window, "");

  const funil = csv(pasta, "selection_funnel.csv").find((l) => l.stage === "min_releases");
  assert.equal(funil.pending, "1", "o nao processado continua pendente, nao e' contado como sem releases");
  assert.equal(funil.complete, "false");
});

test("executarReleases: repositorio com releases indisponiveis continua pendente", async () => {
  const pasta = pastaTemporaria();
  const config = configPara(pasta);
  const api = criarApiFalsa({
    repos: [repo("a/sumiu", 5000)],
    releases: { "a/sumiu": respostaJSON(404, { message: "Not Found" }) },
  });
  const cliente = criarClienteGitHub({ token: "t", fetch: api.fetch, esperar: async () => {} });

  await executarSelecao({ config, cliente, log: logSilencioso });
  await executarReleases({ config, cliente, log: logSilencioso });

  const registro = csv(pasta, "candidates.csv").find((r) => r.full_name === "a/sumiu");
  assert.equal(registro.status, "pending");
  assert.equal(registro.releases_in_window, "", "erro de coleta nao e' o mesmo que zero releases");

  const bruto = JSON.parse(readFileSync(join(pasta, "data", "raw", "releases.json"), "utf8"));
  assert.equal(bruto.repositorios[0].error, "releases_http_404");
});

// Caso comum na coleta real: o repositorio usa Actions mas nao publica
// release nenhuma (so' tags, ou nada). Zero e' uma medicao valida, diferente
// do erro de coleta do teste acima.
test("executarReleases: repositorio sem nenhuma release e' excluido com motivo", async () => {
  const pasta = pastaTemporaria();
  const config = configPara(pasta);
  const api = criarApiFalsa({ repos: [repo("a/sem-release", 5000)], releases: { "a/sem-release": [] } });
  const cliente = criarClienteGitHub({ token: "t", fetch: api.fetch, esperar: async () => {} });

  await executarSelecao({ config, cliente, log: logSilencioso });
  await executarReleases({ config, cliente, log: logSilencioso });

  const registro = csv(pasta, "candidates.csv").find((r) => r.full_name === "a/sem-release");
  assert.equal(registro.releases_in_window, "0");
  assert.equal(registro.status, "excluded");
  assert.equal(registro.exclusion_reason, "fewer_than_5_releases_in_window");
});

test("executarReleases: segunda execucao nao vai a rede (retomada pelo cache)", async () => {
  const { config, cache, api } = await cenario();
  const chamadasAntes = api.chamadas.length;

  const outroCliente = criarClienteGitHub({ token: "t", cache, fetch: api.fetch, esperar: async () => {} });
  await executarReleases({ config, cliente: outroCliente, log: logSilencioso });

  assert.equal(outroCliente.estatisticas.requisicoes, 0);
  assert.ok(outroCliente.estatisticas.doCache > 0);
  assert.equal(api.chamadas.length, chamadasAntes, "nenhuma requisicao nova");
});

// ---- etapa "leadtime" ----------------------------------------------------

test("repositoriosParaLeadTime: so' quem passou no minimo de releases", async () => {
  const { pasta, config } = await cenario();
  const aptos = repositoriosParaLeadTime(config.diretorios.saida);
  assert.deepEqual(
    aptos.map((r) => r.full_name),
    ["a/muitas"]
  );
  assert.ok(pasta);
});

test("executarLeadTime: calcula as duas variantes e registra a tag apagada", async () => {
  const { pasta, config, cliente } = await cenario();
  await executarLeadTime({ config, cliente, log: logSilencioso });

  const [linha] = csv(pasta, "lead_time.csv");
  assert.equal(linha.full_name, "a/muitas");
  assert.equal(linha.releases_in_window, "6");
  assert.equal(linha.releases_evaluated, "5", "v1.5 falhou na comparacao");
  assert.equal(linha.releases_with_error, "1");
  assert.equal(linha.errors, "compare_http_404:1");
  assert.equal(linha.releases_skipped_no_predecessor, "0", "v1.0 tem v0.9 como anterior, fora da janela");
  assert.equal(linha.lead_time_release_median_hours, "24");
  assert.equal(linha.lead_time_release_median_days, "1");
  assert.equal(linha.lead_time_commit_median_hours, "24");
  assert.equal(linha.commits_used, "5");
  assert.equal(linha.negative_lead_time_commits, "0");
});

test("executarLeadTime: release_commits.csv tem uma linha por release avaliada", async () => {
  const { pasta, config, cliente } = await cenario();
  await executarLeadTime({ config, cliente, log: logSilencioso });

  const linhas = csv(pasta, "release_commits.csv");
  assert.equal(linhas.length, 6, "as 6 releases da janela, inclusive a que falhou");

  const v11 = linhas.find((l) => l.tag_name === "v1.1");
  assert.equal(v11.base_tag, "v1.0");
  assert.equal(v11.status, "evaluated");
  assert.equal(v11.commits_total, "1");
  assert.equal(v11.oldest_commit_date, "2025-02-09T12:00:00Z");
  assert.equal(v11.lead_time_hours, "24");
  assert.equal(v11.lead_time_days, "1");

  const v15 = linhas.find((l) => l.tag_name === "v1.5");
  assert.equal(v15.status, "error");
  assert.equal(v15.error, "compare_http_404");
  assert.equal(v15.lead_time_hours, "");
});

test("executarLeadTime: nao gasta chamada compare em repositorio excluido", async () => {
  const { config, cliente } = await cenario();
  const antes = cliente.estatisticas.requisicoes;
  await executarLeadTime({ config, cliente, log: logSilencioso });

  const novas = cliente.estatisticas.requisicoes - antes;
  assert.equal(novas, 6, "6 comparacoes de a/muitas; nenhuma de a/poucas");
});

test("executarLeadTime: sem a etapa de releases, avisa e nao gera linha nenhuma", async () => {
  const pasta = pastaTemporaria();
  const config = configPara(pasta);
  const api = apiDoCenario();
  const cliente = criarClienteGitHub({ token: "t", fetch: api.fetch, esperar: async () => {} });

  await executarSelecao({ config, cliente, log: logSilencioso });
  const resultado = await executarLeadTime({ config, cliente, log: logSilencioso });

  assert.deepEqual(resultado.resumos, []);
  assert.equal(csv(pasta, "lead_time.csv").length, 0);
});
