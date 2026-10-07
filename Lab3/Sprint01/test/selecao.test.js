import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validarConfig } from "../src/config.js";
import { lerCSV } from "../src/csv.js";
import { criarCacheEmDisco } from "../src/github/cache.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { COLUNAS_FUNIL } from "../src/selecao/funil.js";
import {
  atualizarCriterios,
  caminhosDeSaida,
  carregarSelecao,
  executarSelecao,
  repositoriosParaColeta,
} from "../src/selecao/index.js";
import { COLUNAS, STATUS } from "../src/selecao/modelo.js";
import { criarApiFalsa, pastaTemporaria, repo, respostaJSON } from "./apoio/api-falsa.js";

const REPOS = [
  repo("org/alfa", 90000, { id: 1, language: "TypeScript" }),
  repo("org/bravo", 80000, { id: 2, language: null }),
  repo("org/charlie", 70000, { id: 3, default_branch: "master" }),
  repo("org/delta", 60000, { id: 4 }),
  repo("org/echo", 50000, { id: 5, created_at: "2025-07-01T00:00:00Z" }),
  repo("org/foxtrot", 40000, { id: 6 }),
];

// Funcao: cada Response so' pode ser lida uma vez, entao cada teste recebe novas.
const opcoesApi = () => ({
  repos: REPOS,
  actions: { "org/bravo": 0, "org/delta": respostaJSON(404, { message: "Not Found" }) },
  contribuidores: {
    "org/alfa": 1234,
    "org/charlie": respostaJSON(403, { message: "The history or contributor list is too large to list contributors for this repository via the API." }),
    "org/echo": 0,
  },
});

function preparar({ quantidade = 6, tamanho = 2 } = {}) {
  const pasta = pastaTemporaria();
  const config = validarConfig(
    {
      janela: { inicio: "2025-01-01", fim: "2025-12-31" },
      selecao: { quantidadeDeCandidatos: quantidade, tamanhoAlvoDaAmostra: tamanho },
      diretorios: { cache: "cache", saida: "data" },
    },
    { baseDir: pasta }
  );
  return { pasta, config };
}

function clientePara(api, config, extra = {}) {
  return criarClienteGitHub({
    token: "t",
    fetch: api.fetch,
    cache: criarCacheEmDisco(config.diretorios.cache),
    esperar: async () => {},
    ...extra,
  });
}

function lerTabela(caminho) {
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  return { cabecalho, linhas: linhas.map((l) => Object.fromEntries(cabecalho.map((c, i) => [c, l[i]]))) };
}

test("executarSelecao: coleta completa gera JSON, CSVs e funil coerentes", async () => {
  const { config } = preparar();
  const api = criarApiFalsa(opcoesApi());
  const resultado = await executarSelecao({ config, cliente: clientePara(api, config), agora: () => new Date("2026-10-05T00:00:00Z") });

  const porNome = Object.fromEntries(resultado.registros.map((r) => [r.full_name, r]));
  assert.equal(porNome["org/alfa"].contributors, 1234);
  assert.equal(porNome["org/alfa"].status, STATUS.PENDENTE);
  assert.equal(porNome["org/bravo"].exclusion_reason, "no_github_actions");
  assert.equal(porNome["org/bravo"].contributors, null, "nao gasta chamada de contribuidores com descartados");
  assert.equal(porNome["org/charlie"].default_branch, "master");
  assert.deepEqual(porNome["org/charlie"].metadata_errors, ["contributors_list_too_large"]);
  assert.equal(porNome["org/charlie"].status, STATUS.PENDENTE, "falta de metadado nao exclui");
  assert.equal(porNome["org/delta"].exclusion_reason, "actions_http_404");
  assert.equal(porNome["org/echo"].contributors, 0);
  assert.equal(porNome["org/echo"].created_relative_to_window, "within_window");

  const caminhos = caminhosDeSaida(config.diretorios.saida);
  for (const caminho of Object.values(caminhos)) assert.ok(existsSync(caminho), caminho);

  const candidatos = lerTabela(caminhos.candidatos);
  assert.deepEqual(candidatos.cabecalho, [...COLUNAS]);
  assert.equal(candidatos.linhas.length, 6);
  assert.equal(candidatos.linhas[1].language, "", "linguagem ausente vira campo vazio");

  const seguem = lerTabela(caminhos.repositorios);
  assert.deepEqual(seguem.linhas.map((l) => l.full_name), ["org/alfa", "org/charlie", "org/echo", "org/foxtrot"]);

  const funil = lerTabela(caminhos.funil);
  assert.deepEqual(funil.cabecalho, [...COLUNAS_FUNIL]);
  const actions = funil.linhas.find((l) => l.stage === "has_github_actions");
  assert.equal(actions.entered, "6");
  assert.equal(actions.remaining, "4");
  assert.equal(actions.excluded, "2");
  assert.equal(actions.exclusion_reasons, "actions_http_404:1;no_github_actions:1");
  assert.equal(funil.linhas.find((l) => l.stage === "min_releases").pending, "4");

  const json = JSON.parse(readFileSync(caminhos.json, "utf8"));
  assert.equal(json.generated_at, "2026-10-05T00:00:00.000Z");
  assert.deepEqual(json.observation_window, { start: "2025-01-01", end: "2025-12-31", days: 365 });
  assert.equal(json.search_slices[0].query, "stars:>1000");
  assert.equal(json.registros.length, 6);
});

test("retomada: execucao interrompida continua de onde parou, sem repetir chamadas", async () => {
  const { config } = preparar();

  // 1a execucao: a API cai (500 persistente) ao chegar no 4o repositorio.
  const instavel = criarApiFalsa({
    ...opcoesApi(),
    antes: (url) => (url.pathname.startsWith("/repos/org/delta/") ? respostaJSON(500, {}) : null),
  });
  await assert.rejects(
    executarSelecao({ config, cliente: clientePara(instavel, config, { maxTentativas: 1 }) }),
    /HTTP 500/
  );
  assert.equal(existsSync(caminhosDeSaida(config.diretorios.saida).json), false, "nenhuma saida parcial");
  const feitasNaPrimeira = new Set(instavel.chamadas.filter((c) => !c.caminho.includes("org/delta")).map((c) => c.caminho));

  // 2a execucao, API normal: so' faz o que faltou.
  const estavel = criarApiFalsa(opcoesApi());
  const cliente = clientePara(estavel, config);
  await executarSelecao({ config, cliente });
  const repetidas = estavel.chamadas.filter((c) => feitasNaPrimeira.has(c.caminho));
  assert.deepEqual(repetidas, [], "nenhuma chamada ja respondida foi refeita");
  assert.ok(estavel.chamadas.some((c) => c.caminho.startsWith("/repos/org/delta/actions/workflows")));
  assert.ok(cliente.estatisticas.doCache > 0);

  // 3a execucao: tudo do cache.
  const terceira = criarApiFalsa(opcoesApi());
  await executarSelecao({ config, cliente: clientePara(terceira, config) });
  assert.equal(terceira.chamadas.length, 0);
});

test("executarSelecao: busca com menos repositorios que o pedido apenas avisa", async () => {
  const { config } = preparar({ quantidade: 50, tamanho: 2 });
  const avisos = [];
  const log = { debug() {}, info() {}, erro() {}, aviso: (m) => avisos.push(m) };
  const resultado = await executarSelecao({ config, cliente: clientePara(criarApiFalsa(opcoesApi()), config), log });
  assert.equal(resultado.registros.length, 6);
  assert.ok(avisos.some((m) => /menos candidatos \(6\) que o configurado \(50\)/.test(m)));
});

test("interface B/C: repositoriosParaColeta devolve so' quem segue, com o necessario para coletar", async () => {
  const { config } = preparar();
  await executarSelecao({ config, cliente: clientePara(criarApiFalsa(opcoesApi()), config) });
  const lista = repositoriosParaColeta(config.diretorios.saida);
  assert.deepEqual(lista.map((r) => r.full_name), ["org/alfa", "org/charlie", "org/echo", "org/foxtrot"]);
  for (const r of lista) {
    assert.ok(r.owner && r.name && r.default_branch, r.full_name);
  }
  assert.equal(carregarSelecao(config.diretorios.saida).janela.fimExclusivoMs, Date.UTC(2026, 0, 1));
});

test("interface B/C: atualizarCriterios aplica 5 releases / 50 runs e fecha o funil", async () => {
  const { config } = preparar({ tamanho: 2 });
  await executarSelecao({ config, cliente: clientePara(criarApiFalsa(opcoesApi()), config) });
  const dir = config.diretorios.saida;

  // B informou releases de todos; C ainda nao informou o org/foxtrot.
  const parcial = atualizarCriterios(dir, {
    "org/alfa": { releases_in_window: 12, valid_workflow_runs: 400 },
    "org/charlie": { releases_in_window: 2, valid_workflow_runs: 400 },
    "org/echo": { releases_in_window: 6, valid_workflow_runs: 51 },
    "org/foxtrot": { releases_in_window: 8 },
  });
  assert.equal(parcial.final_sample_defined, false);

  const final = atualizarCriterios(dir, { "org/foxtrot": { valid_workflow_runs: 70 } });
  assert.equal(final.final_sample_defined, true);
  const status = Object.fromEntries(final.registros.map((r) => [r.full_name, [r.status, r.exclusion_reason]]));
  assert.deepEqual(status["org/alfa"], [STATUS.INCLUIDO, null]);
  assert.deepEqual(status["org/charlie"], [STATUS.EXCLUIDO, "fewer_than_5_releases_in_window"]);
  assert.deepEqual(status["org/echo"], [STATUS.INCLUIDO, null]);
  assert.deepEqual(status["org/foxtrot"], [STATUS.EXCLUIDO, "beyond_target_sample_size"]);

  const funil = lerTabela(caminhosDeSaida(dir).funil).linhas;
  assert.deepEqual(
    funil.map((l) => [l.stage, l.remaining, l.complete]),
    [
      ["candidates", "6", "true"],
      ["has_github_actions", "4", "true"],
      ["min_releases", "3", "true"],
      ["min_workflow_runs", "3", "true"],
      ["final_sample", "2", "true"],
    ]
  );
});

test("interface B/C: contagem de repositorio fora da selecao e' rejeitada", async () => {
  const { config } = preparar();
  await executarSelecao({ config, cliente: clientePara(criarApiFalsa(opcoesApi()), config) });
  assert.throws(() => atualizarCriterios(config.diretorios.saida, { "intruso/repo": { releases_in_window: 9 } }), /fora da selecao: intruso\/repo/);
});

test("carregarSelecao: sem a etapa executada -> erro orientando a rodar 'repositorios'", () => {
  assert.throws(() => carregarSelecao(join(pastaTemporaria(), "data")), /rode antes a etapa "repositorios"/);
});
