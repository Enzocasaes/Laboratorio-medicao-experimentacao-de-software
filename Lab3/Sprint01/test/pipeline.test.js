import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerArgumentos, main } from "../src/pipeline.js";
import { logSilencioso } from "../src/log.js";
import { criarApiFalsa, pastaTemporaria, repo } from "./apoio/api-falsa.js";

function configTemporaria() {
  const pasta = pastaTemporaria();
  const caminho = join(pasta, "config.json");
  writeFileSync(
    caminho,
    JSON.stringify({
      janela: { inicio: "2025-01-01", fim: "2025-12-31" },
      selecao: { quantidadeDeCandidatos: 2, tamanhoAlvoDaAmostra: 1 },
    })
  );
  return { pasta, caminho };
}

// O token vem do ambiente; os testes trocam e restauram a variavel.
async function comToken(valor, fn) {
  const anterior = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = valor;
  try {
    return await fn();
  } finally {
    if (anterior === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = anterior;
  }
}

test("lerArgumentos: padroes e flags", () => {
  assert.deepEqual(lerArgumentos([]), { config: "config.json", etapa: null, semCache: false, limite: null });
  assert.deepEqual(lerArgumentos(["--config", "x.json", "--etapa", "repositorios", "--sem-cache", "--limite", "20"]), {
    config: "x.json",
    etapa: "repositorios",
    semCache: true,
    limite: 20,
  });
  assert.throws(() => lerArgumentos(["--config"]), /--config exige um valor/);
  assert.throws(() => lerArgumentos(["--etapa", "--sem-cache"]), /--etapa exige um valor/);
  assert.throws(() => lerArgumentos(["--qualquer"]), /argumento desconhecido/);
});

test("lerArgumentos: --limite exige um inteiro >= 1", () => {
  assert.throws(() => lerArgumentos(["--limite"]), /--limite exige um valor/);
  assert.throws(() => lerArgumentos(["--limite", "0"]), /--limite exige um inteiro >= 1/);
  assert.throws(() => lerArgumentos(["--limite", "2.5"]), /--limite exige um inteiro >= 1/);
  assert.throws(() => lerArgumentos(["--limite", "cem"]), /--limite exige um inteiro >= 1/);
});

test("main: etapa inexistente lista as disponiveis", async () => {
  await assert.rejects(
    main(["--etapa", "nada"], { log: logSilencioso }),
    /etapa desconhecida: nada \(disponiveis: repositorios, releases, leadtime\)/
  );
});

test("main: sem GITHUB_TOKEN falha antes de qualquer requisicao", async () => {
  const { caminho } = configTemporaria();
  const api = criarApiFalsa();
  await comToken("", () =>
    assert.rejects(main(["--config", caminho], { log: logSilencioso, fetch: api.fetch }), /Token do GitHub ausente/)
  );
  assert.equal(api.chamadas.length, 0);
});

test("main: executa a etapa de repositorios com um unico comando e grava cache e saidas", async () => {
  const { pasta, caminho } = configTemporaria();
  const api = criarApiFalsa({ repos: [repo("a/um", 5000), repo("b/dois", 4000)] });
  await comToken("token-falso", () => main(["--config", caminho, "--etapa", "repositorios"], { log: logSilencioso, fetch: api.fetch }));
  assert.ok(existsSync(join(pasta, "data", "processed", "selection_funnel.csv")));
  assert.ok(existsSync(join(pasta, "data", "cache", "search")));
  assert.equal(api.chamadas[0].cabecalhos.Authorization, "Bearer token-falso");
});

test("main: --sem-cache nao grava cache em disco", async () => {
  const { pasta, caminho } = configTemporaria();
  const api = criarApiFalsa({ repos: [repo("a/um", 5000)] });
  await comToken("token-falso", () => main(["--config", caminho, "--sem-cache"], { log: logSilencioso, fetch: api.fetch }));
  assert.equal(existsSync(join(pasta, "data", "cache")), false);
  assert.ok(existsSync(join(pasta, "data", "raw", "repositories.json")));
});
