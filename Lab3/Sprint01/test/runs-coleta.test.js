// Coleta de workflow runs: fatiamento mensal da janela, filtros da URL,
// paginacao, deteccao do teto de 1.000 resultados por consulta, deduplicacao e
// tratamento de erro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarCacheEmMemoria } from "../src/github/cache.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { criarJanela } from "../src/janela.js";
import { logSilencioso } from "../src/log.js";
import { coletarWorkflowRuns, fatiasMensais, TETO_DA_CONSULTA } from "../src/runs/coleta.js";
import { criarApiFalsa, respostaJSON, workflowRun } from "./apoio/api-falsa.js";

function clienteCom(api) {
  return criarClienteGitHub({
    token: "t",
    cache: criarCacheEmMemoria(),
    log: logSilencioso,
    fetch: api.fetch,
    esperar: async () => {},
  });
}

// ---- fatias mensais ------------------------------------------------------

test("fatiasMensais: 12 fatias numa janela de 12 meses", () => {
  const fatias = fatiasMensais(criarJanela("2025-01-01", "2025-12-31"));
  assert.equal(fatias.length, 12);
  assert.deepEqual(fatias[0], { inicio: "2025-01-01", fim: "2025-01-31" });
  assert.deepEqual(fatias[11], { inicio: "2025-12-01", fim: "2025-12-31" });
});

test("fatiasMensais: recorta a primeira e a ultima fatia pelas datas da janela", () => {
  const fatias = fatiasMensais(criarJanela("2025-10-22", "2026-10-22"));
  assert.deepEqual(fatias[0], { inicio: "2025-10-22", fim: "2025-10-31" });
  assert.deepEqual(fatias.at(-1), { inicio: "2026-10-01", fim: "2026-10-22" });
  assert.equal(fatias.length, 13); // outubro aparece nas duas pontas, recortado
});

test("fatiasMensais: fevereiro bissexto termina no dia 29", () => {
  const fatias = fatiasMensais(criarJanela("2024-02-01", "2024-03-01"));
  assert.deepEqual(fatias[0], { inicio: "2024-02-01", fim: "2024-02-29" });
});

test("fatiasMensais: janela de um dia vira uma fatia", () => {
  assert.deepEqual(fatiasMensais(criarJanela("2025-05-10", "2025-05-10")), [
    { inicio: "2025-05-10", fim: "2025-05-10" },
  ]);
});

// ---- coleta --------------------------------------------------------------

const JANELA = criarJanela("2025-01-01", "2025-03-31");

test("coletarWorkflowRuns: pede uma consulta por mes, com branch, event e created", async () => {
  const api = criarApiFalsa({
    runs: {
      "a/b": [
        workflowRun("2025-01-10T10:00:00Z", "success", { id: 1 }),
        workflowRun("2025-02-10T10:00:00Z", "failure", { id: 2 }),
        workflowRun("2025-03-10T10:00:00Z", "success", { id: 3 }),
      ],
    },
  });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA, { branch: "main" });

  assert.equal(resultado.erro, null);
  assert.equal(resultado.runs.length, 3);
  assert.equal(resultado.fatias.length, 3);
  assert.deepEqual(
    resultado.fatias.map((f) => `${f.inicio}..${f.fim}:${f.runs}`),
    ["2025-01-01..2025-01-31:1", "2025-02-01..2025-02-28:1", "2025-03-01..2025-03-31:1"]
  );

  const primeira = new URL(api.chamadas[0].url);
  assert.equal(primeira.pathname, "/repos/a/b/actions/runs");
  assert.equal(primeira.searchParams.get("branch"), "main");
  assert.equal(primeira.searchParams.get("event"), "push");
  assert.equal(primeira.searchParams.get("created"), "2025-01-01..2025-01-31");
});

test("coletarWorkflowRuns: nao traz runs de fora da janela", async () => {
  const api = criarApiFalsa({
    runs: {
      "a/b": [
        workflowRun("2024-12-31T23:00:00Z", "success", { id: 1 }),
        workflowRun("2025-02-10T10:00:00Z", "success", { id: 2 }),
        workflowRun("2025-04-01T00:00:00Z", "success", { id: 3 }),
      ],
    },
  });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA);
  assert.deepEqual(resultado.runs.map((r) => r.run_id), [2]);
});

test("coletarWorkflowRuns: segue a paginacao dentro de uma fatia", async () => {
  const muitos = Array.from({ length: 7 }, (_, i) =>
    workflowRun(`2025-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`, "success", { id: i + 1 })
  );
  const api = criarApiFalsa({ runs: { "a/b": muitos } });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA, { porPagina: 3 });

  assert.equal(resultado.runs.length, 7);
  assert.equal(resultado.fatias[0].pages, 3); // 3 + 3 + 1
  assert.equal(resultado.truncada, false);
});

test("coletarWorkflowRuns: fatia acima do teto da API e' marcada como truncada", async () => {
  // total_count informa 1.200, mas a API so' entrega 1.000 por consulta.
  const api = criarApiFalsa({
    runs: {
      "a/b": [workflowRun("2025-01-10T10:00:00Z", "success", { id: 1 })],
    },
    antes: (url) => {
      if (url.pathname !== "/repos/a/b/actions/runs") return null;
      if (url.searchParams.get("created") !== "2025-01-01..2025-01-31") return null;
      return respostaJSON(200, {
        total_count: TETO_DA_CONSULTA + 200,
        workflow_runs: [workflowRun("2025-01-10T10:00:00Z", "success", { id: 1 })],
      });
    },
  });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA);

  assert.equal(resultado.truncada, true);
  assert.equal(resultado.fatias[0].truncated, true);
  assert.equal(resultado.fatias[0].total_count, 1200);
  assert.equal(resultado.fatias[1].truncated, false);
});

test("coletarWorkflowRuns: teto de paginas por fatia interrompe e marca truncada", async () => {
  const muitos = Array.from({ length: 10 }, (_, i) =>
    workflowRun(`2025-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`, "success", { id: i + 1 })
  );
  const api = criarApiFalsa({ runs: { "a/b": muitos } });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA, { porPagina: 2, maxPaginas: 2 });

  assert.equal(resultado.fatias[0].truncated, true);
  assert.equal(resultado.fatias[0].pages, 2);
  assert.equal(resultado.truncada, true);
});

test("coletarWorkflowRuns: o mesmo run em duas fatias entra uma vez so'", async () => {
  const repetido = workflowRun("2025-02-01T00:00:00Z", "success", { id: 99 });
  const api = criarApiFalsa({ runs: { "a/b": [repetido] } });
  // A fatia de janeiro tambem devolve o run de fevereiro (fronteira de mes).
  const original = api.fetch;
  const fetchComRepeticao = async (url, opcoes) => {
    const resposta = await original(url, opcoes);
    const endereco = new URL(url);
    if (endereco.searchParams.get("created") === "2025-01-01..2025-01-31") {
      return respostaJSON(200, { total_count: 1, workflow_runs: [repetido] });
    }
    return resposta;
  };

  const resultado = await coletarWorkflowRuns(clienteCom({ ...api, fetch: fetchComRepeticao }), "a/b", JANELA);

  assert.equal(resultado.runs.length, 1);
  assert.equal(resultado.fatias[0].runs, 1);
  assert.equal(resultado.fatias[1].runs, 0); // ja estava visto
});

test("coletarWorkflowRuns: item sem id e' ignorado e contado", async () => {
  const api = criarApiFalsa({
    runs: { "a/b": [] },
    antes: (url) =>
      url.pathname === "/repos/a/b/actions/runs"
        ? respostaJSON(200, { total_count: 2, workflow_runs: [{ sem: "id" }, workflowRun("2025-01-05T10:00:00Z", "success", { id: 5 })] })
        : null,
  });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA);
  assert.equal(resultado.itensInvalidos, 3); // uma vez por fatia
  assert.equal(resultado.runs.length, 1);
});

test("coletarWorkflowRuns: 404 vira erro registravel e interrompe a coleta", async () => {
  const api = criarApiFalsa({ runs: { "a/b": respostaJSON(404, { message: "Not Found" }) } });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA);

  assert.equal(resultado.erro, "runs_http_404");
  assert.equal(resultado.runs.length, 0);
  assert.equal(resultado.fatias.length, 1); // parou na primeira fatia
  assert.equal(resultado.fatias[0].error, "runs_http_404");
});

test("coletarWorkflowRuns: corpo sem workflow_runs vira erro registravel", async () => {
  const api = criarApiFalsa({
    runs: { "a/b": [] },
    antes: (url) => (url.pathname === "/repos/a/b/actions/runs" ? respostaJSON(200, { total_count: 0 }) : null),
  });

  const resultado = await coletarWorkflowRuns(clienteCom(api), "a/b", JANELA);
  assert.equal(resultado.erro, "runs_unexpected_response");
});

test("coletarWorkflowRuns: a segunda execucao vem do cache, sem tocar a rede", async () => {
  const api = criarApiFalsa({ runs: { "a/b": [workflowRun("2025-01-10T10:00:00Z", "success", { id: 1 })] } });
  const cliente = criarClienteGitHub({
    token: "t",
    cache: criarCacheEmMemoria(),
    log: logSilencioso,
    fetch: api.fetch,
    esperar: async () => {},
  });

  await coletarWorkflowRuns(cliente, "a/b", JANELA);
  const requisicoes = api.chamadas.length;
  const segunda = await coletarWorkflowRuns(cliente, "a/b", JANELA);

  assert.equal(api.chamadas.length, requisicoes);
  assert.equal(segunda.runs.length, 1);
});
