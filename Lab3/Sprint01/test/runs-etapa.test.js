// Etapa "runs" de ponta a ponta, sobre a selecao gravada em disco: contagem
// devolvida ao funil (criterio de 50 runs validos), CSVs gerados, --limite,
// erro de coleta e retomada pelo cache.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { criarCacheEmDisco } from "../src/github/cache.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import { executarRuns } from "../src/runs/index.js";
import { atualizarCriterios, executarSelecao } from "../src/selecao/index.js";
import { criarApiFalsa, pastaTemporaria, repo, respostaJSON, workflowRun } from "./apoio/api-falsa.js";

const MINIMO_DE_RUNS = 50;

function configPara(pasta) {
  return {
    janela: criarJanela("2025-01-01", "2025-03-31"),
    selecao: {
      estrelasAcimaDe: 1000,
      quantidadeDeCandidatos: 2,
      tamanhoAlvoDaAmostra: 2,
      minimoDeReleases: 5,
      minimoDeWorkflowRuns: MINIMO_DE_RUNS,
    },
    coleta: {
      releasesPorPagina: 100,
      maxPaginasDeReleases: 20,
      commitsPorPagina: 100,
      maxCommitsPorRelease: 1000,
      runsPorPagina: 100,
      maxPaginasDeRunsPorMes: 10,
    },
    diretorios: { cache: join(pasta, "cache"), saida: join(pasta, "data") },
  };
}

// "a/ativo": 60 runs validos (54 sucessos + 6 falhas, uma falha por semana,
// recuperada 2 h depois) -> passa no criterio de 50.
// "a/parado": 10 runs validos -> excluido por menos de 50.
function runsSemanais({ quantidade, comFalhas = true, workflowId = 1, idBase = 0 }) {
  const runs = [];
  const inicio = Date.parse("2025-01-02T00:00:00Z");
  for (let i = 0; i < quantidade; i += 1) {
    const quando = new Date(inicio + i * 12 * 60 * 60 * 1000); // de 12 em 12 horas
    const falha = comFalhas && i > 0 && i % 10 === 0;
    runs.push(
      workflowRun(quando.toISOString().replace(".000Z", "Z"), falha ? "failure" : "success", {
        id: idBase + i + 1,
        workflow_id: workflowId,
        updated_at: new Date(quando.getTime() + 10 * 60 * 1000).toISOString().replace(".000Z", "Z"),
      })
    );
  }
  return runs;
}

function apiDoCenario(extra = {}) {
  return criarApiFalsa({
    repos: [repo("a/ativo", 5000), repo("a/parado", 4000)],
    runs: {
      "a/ativo": runsSemanais({ quantidade: 60 }),
      "a/parado": runsSemanais({ quantidade: 10, comFalhas: false, idBase: 1000 }),
    },
    ...extra,
  });
}

function csv(pasta, nome) {
  const { cabecalho, linhas } = lerCSV(readFileSync(join(pasta, "data", "processed", nome), "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((coluna, i) => [coluna, linha[i]])));
}

function json(pasta, nome) {
  return JSON.parse(readFileSync(join(pasta, "data", "raw", nome), "utf8"));
}

async function prepararSelecao(pasta, api) {
  const config = configPara(pasta);
  const cliente = criarClienteGitHub({
    token: "t",
    cache: criarCacheEmDisco(config.diretorios.cache, { log: logSilencioso }),
    log: logSilencioso,
    fetch: api.fetch,
    esperar: async () => {},
  });
  await executarSelecao({ config, cliente, log: logSilencioso });
  return { config, cliente };
}

// No pipeline real, "releases" roda antes e ja deixou a contagem de releases
// no funil; sem ela o criterio de runs nem chega a ser avaliado (o registro
// fica pendente pela contagem que falta).
function comReleasesContadas(config, contagens) {
  return atualizarCriterios(config.diretorios.saida, contagens);
}

test("etapa runs: conta runs validos, devolve ao funil e aplica o criterio minimo", async (t) => {
  const pasta = pastaTemporaria();
  const api = apiDoCenario();
  const { config, cliente } = await prepararSelecao(pasta, api);
  comReleasesContadas(config, {
    "a/ativo": { releases_in_window: 8 },
    "a/parado": { releases_in_window: 6 },
  });

  const { resumos, selecao } = await executarRuns({ config, cliente, log: logSilencioso });

  const ativo = resumos.find((r) => r.full_name === "a/ativo");
  const parado = resumos.find((r) => r.full_name === "a/parado");
  assert.equal(ativo.valid_workflow_runs, 60);
  assert.equal(ativo.failed_runs, 5);
  assert.equal(ativo.change_failure_rate_ci, Number((5 / 60).toFixed(4)));
  assert.equal(parado.valid_workflow_runs, 10);

  const registroAtivo = selecao.registros.find((r) => r.full_name === "a/ativo");
  const registroParado = selecao.registros.find((r) => r.full_name === "a/parado");
  assert.equal(registroAtivo.valid_workflow_runs, 60);
  assert.equal(registroParado.valid_workflow_runs, 10);
  assert.equal(registroParado.status, "excluded");
  assert.match(registroParado.exclusion_reason, new RegExp(String(MINIMO_DE_RUNS)));
});

test("etapa runs: grava os tres CSVs e o JSON de auditoria com as fatias mensais", async (t) => {
  const pasta = pastaTemporaria();
  const api = apiDoCenario();
  const { config, cliente } = await prepararSelecao(pasta, api);

  await executarRuns({ config, cliente, log: logSilencioso });

  const dora = csv(pasta, "dora_runs.csv");
  assert.equal(dora.length, 2);
  assert.deepEqual(
    dora.map((l) => l.full_name),
    ["a/ativo", "a/parado"]
  );

  const runs = csv(pasta, "workflow_runs.csv");
  assert.equal(runs.length, 70);
  assert.equal(runs[0].classification, "success");

  const episodios = csv(pasta, "recovery_episodes.csv");
  assert.equal(episodios.length, 5); // uma falha a cada 10 runs em "a/ativo"
  assert.equal(episodios[0].censored, "0");
  assert.equal(episodios[0].prior_success, "1");

  const auditoria = json(pasta, "workflow_runs.json");
  assert.equal(auditoria.repositorios.length, 2);
  assert.equal(auditoria.repositorios[0].slices.length, 3); // 3 meses na janela
  assert.equal(auditoria.observation_window.start, "2025-01-01");
  assert.match(auditoria.definicoes.episodio_de_falha, /primeira falha apos um sucesso/);
});

test("etapa runs: --limite processa so' os primeiros e deixa o resto pendente", async (t) => {
  const pasta = pastaTemporaria();
  const api = apiDoCenario();
  const { config, cliente } = await prepararSelecao(pasta, api);

  const { selecao } = await executarRuns({ config, cliente, log: logSilencioso, limite: 1 });

  const registroParado = selecao.registros.find((r) => r.full_name === "a/parado");
  assert.equal(registroParado.valid_workflow_runs, null);
  assert.equal(registroParado.status, "pending");
  assert.equal(selecao.final_sample_defined, false);
});

test("etapa runs: erro de coleta deixa o repositorio pendente, sem contar zero runs", async (t) => {
  const pasta = pastaTemporaria();
  const api = apiDoCenario({
    antes: (url) =>
      url.pathname === "/repos/a/parado/actions/runs" ? respostaJSON(404, { message: "Not Found" }) : null,
  });
  const { config, cliente } = await prepararSelecao(pasta, api);

  const { resumos, selecao } = await executarRuns({ config, cliente, log: logSilencioso });

  const parado = resumos.find((r) => r.full_name === "a/parado");
  assert.equal(parado.error, "runs_http_404");
  const registro = selecao.registros.find((r) => r.full_name === "a/parado");
  assert.equal(registro.valid_workflow_runs, null);
  assert.equal(registro.status, "pending");
});

test("etapa runs: a segunda execucao vem do cache em disco", async (t) => {
  const pasta = pastaTemporaria();
  const api = apiDoCenario();
  const { config, cliente } = await prepararSelecao(pasta, api);

  await executarRuns({ config, cliente, log: logSilencioso });
  const requisicoes = api.chamadas.length;

  const clienteNovo = criarClienteGitHub({
    token: "t",
    cache: criarCacheEmDisco(config.diretorios.cache, { log: logSilencioso }),
    log: logSilencioso,
    fetch: api.fetch,
    esperar: async () => {},
  });
  const segunda = await executarRuns({ config, cliente: clienteNovo, log: logSilencioso });

  assert.equal(api.chamadas.length, requisicoes);
  assert.equal(segunda.resumos.find((r) => r.full_name === "a/ativo").valid_workflow_runs, 60);
});

test("etapa runs: sem a contagem de releases o registro segue pendente (ordem das etapas)", async (t) => {
  const pasta = pastaTemporaria();
  const api = apiDoCenario();
  const { config, cliente } = await prepararSelecao(pasta, api);

  const { selecao } = await executarRuns({ config, cliente, log: logSilencioso });

  const registro = selecao.registros.find((r) => r.full_name === "a/parado");
  assert.equal(registro.valid_workflow_runs, 10); // a contagem de C foi gravada
  assert.equal(registro.status, "pending"); // mas falta a de B para decidir
});
