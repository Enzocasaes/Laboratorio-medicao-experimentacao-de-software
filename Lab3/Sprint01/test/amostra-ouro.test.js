// Amostra-ouro da validação manual: sorteio reproduzível (semente fixa),
// 5 releases por repositório, planilha com links e as proteções contra
// sortear cedo demais ou apagar rótulos já preenchidos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerCSV } from "../src/csv.js";
import { logSilencioso } from "../src/log.js";
import {
  COLUNAS_AMOSTRA_OURO,
  COLUNAS_DE_ROTULO,
  criarSorteio,
  embaralhar,
  executarAmostraOuro,
  montarAmostra,
  parseArgs,
  releasesRotulaveis,
  sortear,
} from "../src/validacao/amostra-ouro.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

const VALIDACAO = { semente: 42, repositoriosNaAmostraOuro: 3, releasesPorRepositorio: 2 };

// ---- sorteio -------------------------------------------------------------

test("criarSorteio: mesma semente -> mesma sequencia (reprodutivel)", () => {
  const a = criarSorteio(42);
  const b = criarSorteio(42);
  const primeiros = [a(), a(), a()];
  assert.deepEqual(primeiros, [b(), b(), b()]);
  assert.ok(primeiros.every((v) => v >= 0 && v < 1));
});

test("criarSorteio: sementes diferentes -> sequencias diferentes", () => {
  assert.notDeepEqual([criarSorteio(1)(), criarSorteio(1)()], [criarSorteio(2)(), criarSorteio(2)()]);
});

test("embaralhar: nao altera a lista original e mantem todos os itens", () => {
  const original = [1, 2, 3, 4, 5];
  const embaralhada = embaralhar(original, criarSorteio(7));
  assert.deepEqual(original, [1, 2, 3, 4, 5]);
  assert.deepEqual([...embaralhada].sort(), [1, 2, 3, 4, 5]);
});

test("sortear: devolve a quantidade pedida; com menos itens, devolve todos", () => {
  assert.equal(sortear([1, 2, 3, 4, 5], 3, criarSorteio(42)).length, 3);
  assert.equal(sortear([1, 2], 5, criarSorteio(42)).length, 2);
});

// ---- montagem da planilha ------------------------------------------------

function repositorio(nome, rank) {
  return { full_name: nome, rank: String(rank), stars: "1000", language: "Go", html_url: `https://github.com/${nome}`, status: "included" };
}

function release(nome, tag, data, extra = {}) {
  return {
    full_name: nome,
    release_id: `${nome}-${tag}`,
    tag_name: tag,
    name: tag,
    published_at: data,
    is_deploy: "true",
    in_window: "true",
    html_url: "",
    ...extra,
  };
}

const REPOSITORIOS = [repositorio("a/um", 1), repositorio("a/dois", 2), repositorio("a/tres", 3), repositorio("a/quatro", 4)];
const RELEASES = REPOSITORIOS.flatMap((r) =>
  ["v1", "v2", "v3", "v4"].map((tag, i) => release(r.full_name, tag, `2026-0${i + 1}-10T00:00:00Z`))
);

test("montarAmostra: sorteia a quantidade pedida de repositorios e releases", () => {
  const { repositorios, linhas } = montarAmostra({
    repositorios: REPOSITORIOS,
    releases: RELEASES,
    quantidadeDeRepositorios: VALIDACAO.repositoriosNaAmostraOuro,
    releasesPorRepositorio: VALIDACAO.releasesPorRepositorio,
    semente: VALIDACAO.semente,
  });

  assert.equal(repositorios.length, 3);
  assert.equal(linhas.length, 6); // 3 repositorios x 2 releases
  assert.deepEqual(
    repositorios.map((r) => Number(r.rank)),
    [...repositorios.map((r) => Number(r.rank))].sort((a, b) => a - b)
  );
});

test("montarAmostra: o mesmo sorteio se repete com a mesma semente", () => {
  const argumentos = {
    repositorios: REPOSITORIOS,
    releases: RELEASES,
    quantidadeDeRepositorios: 3,
    releasesPorRepositorio: 2,
    semente: 42,
  };
  const primeira = montarAmostra(argumentos);
  const segunda = montarAmostra(argumentos);
  assert.deepEqual(primeira.linhas, segunda.linhas);

  const outraSemente = montarAmostra({ ...argumentos, semente: 7 });
  assert.notDeepEqual(
    primeira.linhas.map((l) => l.full_name + l.tag_name),
    outraSemente.linhas.map((l) => l.full_name + l.tag_name)
  );
});

test("montarAmostra: monta o link direto da release quando a API nao trouxe", () => {
  const { linhas } = montarAmostra({
    repositorios: [repositorio("a/um", 1)],
    releases: [release("a/um", "v9", "2026-02-01T00:00:00Z")],
    quantidadeDeRepositorios: 1,
    releasesPorRepositorio: 1,
    semente: 42,
  });
  assert.equal(linhas[0].release_url, "https://github.com/a/um/releases/tag/v9");
});

test("montarAmostra: repositorio sem release rotulavel e' reportado, nao quebra", () => {
  const { linhas, semReleases } = montarAmostra({
    repositorios: [repositorio("a/um", 1), repositorio("a/vazio", 2)],
    releases: [release("a/um", "v1", "2026-02-01T00:00:00Z")],
    quantidadeDeRepositorios: 2,
    releasesPorRepositorio: 2,
    semente: 42,
  });
  assert.deepEqual(semReleases, ["a/vazio"]);
  assert.equal(linhas.length, 1);
});

test("releasesRotulaveis: so' deploy releases da janela, da mais nova para a mais antiga", () => {
  const releases = [
    release("a/um", "antiga", "2026-01-01T00:00:00Z"),
    release("a/um", "nova", "2026-05-01T00:00:00Z"),
    release("a/um", "pre", "2026-03-01T00:00:00Z", { is_deploy: "false" }),
    release("a/um", "fora", "2024-01-01T00:00:00Z", { in_window: "false" }),
    release("b/outro", "de-outro", "2026-04-01T00:00:00Z"),
  ];
  assert.deepEqual(releasesRotulaveis(releases, "a/um").map((r) => r.tag_name), ["nova", "antiga"]);
});

// ---- etapa ---------------------------------------------------------------

function prepararDados(pasta, { status = "included" } = {}) {
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });

  const cabecalhoRepos = ["rank", "full_name", "html_url", "stars", "language", "status"];
  writeFileSync(
    join(processados, "repositories.csv"),
    [
      cabecalhoRepos.join(","),
      ...REPOSITORIOS.map((r) => [r.rank, r.full_name, r.html_url, r.stars, r.language, status].join(",")),
    ].join("\n") + "\n"
  );

  const cabecalhoReleases = ["full_name", "release_id", "tag_name", "name", "published_at", "html_url", "in_window", "is_deploy"];
  writeFileSync(
    join(processados, "releases.csv"),
    [
      cabecalhoReleases.join(","),
      ...RELEASES.map((r) =>
        [r.full_name, r.release_id, r.tag_name, r.name, r.published_at, r.html_url, r.in_window, r.is_deploy].join(",")
      ),
    ].join("\n") + "\n"
  );

  return { janela: null, validacao: VALIDACAO, diretorios: { saida: join(pasta, "data") } };
}

function lerSaida(caminho) {
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  return { cabecalho, registros: linhas.map((l) => Object.fromEntries(cabecalho.map((c, i) => [c, l[i]]))) };
}

test("executarAmostraOuro: gera a planilha base e uma copia por avaliador", async () => {
  const pasta = pastaTemporaria();
  const config = prepararDados(pasta);

  const resultado = await executarAmostraOuro({ config, log: logSilencioso, avaliadores: ["enzo", "caue", "leo"] });

  const base = lerSaida(resultado.caminhos.amostra);
  assert.deepEqual(base.cabecalho, [...COLUNAS_AMOSTRA_OURO]);
  assert.equal(base.registros.length, 6);
  assert.match(base.registros[0].release_url, /^https:\/\/github\.com\//);

  for (const nome of ["enzo", "caue", "leo"]) {
    const planilha = lerSaida(resultado.caminhos.rotulos[nome]);
    assert.deepEqual(planilha.cabecalho, [...COLUNAS_AMOSTRA_OURO, ...COLUNAS_DE_ROTULO]);
    assert.equal(planilha.registros.length, 6);
    assert.equal(planilha.registros[0].release_corretiva, ""); // em branco para o avaliador
  }
});

test("executarAmostraOuro: nao sorteia antes de a amostra final fechar", async () => {
  const pasta = pastaTemporaria();
  const config = prepararDados(pasta, { status: "eligible" });

  await assert.rejects(() => executarAmostraOuro({ config, log: logSilencioso }), /amostra final ainda nao foi fechada/);
});

test("executarAmostraOuro: nao apaga rotulos ja preenchidos", async () => {
  const pasta = pastaTemporaria();
  const config = prepararDados(pasta);
  await executarAmostraOuro({ config, log: logSilencioso, avaliadores: ["caue"] });

  const caminho = join(pasta, "data", "processed", "rotulos_caue.csv");
  writeFileSync(caminho, "ja,preenchido\n1,2\n");
  await executarAmostraOuro({ config, log: logSilencioso, avaliadores: ["caue"] });
  assert.equal(readFileSync(caminho, "utf8"), "ja,preenchido\n1,2\n");

  await executarAmostraOuro({ config, log: logSilencioso, avaliadores: ["caue"], sobrescrever: true });
  assert.notEqual(readFileSync(caminho, "utf8"), "ja,preenchido\n1,2\n");
});

test("executarAmostraOuro: sem releases coletadas, explica qual etapa rodar", async () => {
  const pasta = pastaTemporaria();
  const processados = join(pasta, "data", "processed");
  mkdirSync(processados, { recursive: true });
  writeFileSync(join(processados, "repositories.csv"), "rank,full_name,status\n1,a/um,included\n");
  const config = { validacao: VALIDACAO, diretorios: { saida: join(pasta, "data") } };

  await assert.rejects(() => executarAmostraOuro({ config, log: logSilencioso }), /releases\.csv/);
});

// ---- CLI -----------------------------------------------------------------

test("parseArgs: avaliadores padrao e lista por virgula", () => {
  assert.equal(parseArgs([]).avaliadores, null); // null -> config.validacao.avaliadores
  assert.deepEqual(parseArgs(["--avaliadores", "Ana, Bia"]).avaliadores, ["ana", "bia"]);
  assert.equal(parseArgs(["--sobrescrever"]).sobrescrever, true);
  assert.equal(parseArgs(["--config", "outro.json"]).config, "outro.json");
});

test("parseArgs: argumento desconhecido ou sem valor e' rejeitado", () => {
  assert.throws(() => parseArgs(["--nada"]), /argumento desconhecido/);
  assert.throws(() => parseArgs(["--config"]), /--config exige um valor/);
  assert.throws(() => parseArgs(["--avaliadores", ","]), /ao menos um nome/);
});
