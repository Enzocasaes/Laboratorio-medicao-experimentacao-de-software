// Etapa "validacao" de ponta a ponta, em pasta temporaria: sorteio da
// amostra-ouro -> planilhas -> rotulos -> kappa -> consenso -> reuniao ->
// heuristica, mais os relatorios gerados e a verificacao de reprodutibilidade.
//
// ATENCAO: os rotulos e as previsoes daqui sao FIXTURES DE TESTE (ficticios),
// escolhidos para dar valores conferidos no papel. Nao sao avaliacoes humanas
// nem saida da heuristica real.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validarConfig } from "../src/config.js";
import { gerarCSV, lerTabelaCSV } from "../src/csv.js";
import { logSilencioso } from "../src/log.js";
import { executarAmostraOuro, montarAmostra, ordemCanonica } from "../src/validacao/amostra-ouro.js";
import { caminhosDaValidacao, executarValidacao, gerarRelatorio, parseArgs, verificarReproducao } from "../src/validacao/index.js";
import { pastaTemporaria } from "./apoio/api-falsa.js";

const perto = (obtido, esperado, tolerancia = 1e-4) =>
  assert.ok(Math.abs(Number(obtido) - esperado) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);

const AVALIADORES = ["enzo", "caue", "leo"];
const NOMES = ["o/alfa", "o/beta", "o/gama", "o/delta", "o/epsilon"];

function config(pasta) {
  return {
    validacao: { semente: 42, repositoriosNaAmostraOuro: 3, releasesPorRepositorio: 2, avaliadores: AVALIADORES, limiarF1: 0.7 },
    diretorios: { saida: join(pasta, "data") },
  };
}

function escreverCSV(caminho, colunas, objetos) {
  mkdirSync(join(caminho, ".."), { recursive: true });
  writeFileSync(caminho, gerarCSV(colunas, objetos.map((o) => colunas.map((c) => o[c] ?? ""))));
}

function prepararColeta(pasta, { ordemInvertida = false } = {}) {
  const processados = join(pasta, "data", "processed");
  const repos = NOMES.map((nome, i) => ({ rank: i + 1, id: 100 + i, full_name: nome, html_url: `https://github.com/${nome}`, stars: 5000 - i, language: "Go", status: "included" }));
  escreverCSV(join(processados, "repositories.csv"), Object.keys(repos[0]), ordemInvertida ? [...repos].reverse() : repos);
  const releases = NOMES.flatMap((nome, i) =>
    [1, 2, 3].map((j) => ({ full_name: nome, release_id: `${i}${j}`, tag_name: `v${j}`, name: `v${j}`, published_at: `2026-0${j}-1${i}T00:00:00Z`, html_url: "", in_window: "true", is_deploy: "true" }))
  );
  escreverCSV(join(processados, "releases.csv"), Object.keys(releases[0]), releases);
}

// Preenche a planilha de um avaliador linha a linha (linha i = release i da amostra).
function preencher(pasta, nome, { tipo, entrega, corretiva }) {
  const caminho = join(pasta, "data", "processed", `rotulos_${nome}.csv`);
  const { cabecalho, registros } = lerTabelaCSV(caminho);
  registros.forEach((r, i) => {
    r.tipo_do_projeto = tipo[Math.floor(i / 2)];
    r.releases_sao_entrega_real = entrega;
    r.release_corretiva = corretiva[i];
  });
  writeFileSync(caminho, gerarCSV(cabecalho, registros.map((r) => cabecalho.map((c) => r[c]))));
}

// Rotulos de TESTE. Contas feitas no papel:
//   release_corretiva -> unidades (sim,nao): [3,0] [2,1] [0,3] [0,3] [2,1] [0,3]
//     P = 14/18, Pe = 170/324, kappa = 82/154 = 0,53247 (moderada)
//   tipo_do_projeto   -> repo1 unanime, repo2 1-1-1, repo3 2x1
//     P = 4/9, Pe = 39/81, kappa = -3/42 = -0,07143 (pobre)
//   releases_sao_entrega_real -> todos "sim": Pe = 1, kappa indefinido
const ROTULOS = {
  enzo: { tipo: ["biblioteca", "biblioteca", "biblioteca"], entrega: "sim", corretiva: ["sim", "sim", "nao", "nao", "sim", "nao"] },
  caue: { tipo: ["Biblioteca/Framework", "cli", "biblioteca"], entrega: "Sim", corretiva: ["sim", "sim", "nao", "nao", "nao", "nao"] },
  leo: { tipo: ["framework", "aplicacao", "outro"], entrega: "sim", corretiva: ["sim", "nao", "nao", "nao", "sim", "nao"] },
};

async function cenario({ preenchidos = AVALIADORES } = {}) {
  const pasta = pastaTemporaria();
  prepararColeta(pasta);
  const cfg = config(pasta);
  const sorteio = await executarAmostraOuro({ config: cfg, log: logSilencioso });
  for (const nome of preenchidos) preencher(pasta, nome, ROTULOS[nome]);
  return { pasta, cfg, sorteio };
}

const ler = (caminho) => lerTabelaCSV(caminho).registros;

test("executarValidacao: antes do sorteio, so' registra a pendencia (sem kappa, consenso ou F1)", () => {
  const pasta = pastaTemporaria();
  const r = executarValidacao({ config: config(pasta), log: logSilencioso });
  assert.equal(r.situacao, "amostra_nao_sorteada");
  assert.ok(r.pendencias.some((p) => /npm run amostra:ouro/.test(p)));
  assert.ok(r.pendencias.some((p) => /sorteio bloqueado: Nao ha .*repositories\.csv/.test(p)));
  assert.equal(existsSync(r.caminhos.kappa), false);
  const relatorio = readFileSync(r.caminhos.relatorio, "utf8");
  assert.match(relatorio, /amostra-ouro ainda não sorteada/);
  assert.match(relatorio, /Nenhum kappa, consenso ou F1 foi calculado/);
  assert.equal(JSON.parse(readFileSync(r.caminhos.json, "utf8")).situacao, "amostra_nao_sorteada");
});

test("executarValidacao: planilhas em branco -> tudo pendente, nada inventado", async () => {
  const { cfg } = await cenario({ preenchidos: [] });
  const r = executarValidacao({ config: cfg, log: logSilencioso });
  assert.equal(r.situacao, "pendente");
  assert.deepEqual(r.avaliadores.map((a) => a.situacao), ["nao_iniciado", "nao_iniciado", "nao_iniciado"]);
  for (const k of r.concordancia) {
    assert.equal(k.kappa_fleiss, null);
    assert.equal(k.unidades_validas, 0);
  }
  const consenso = ler(r.caminhos.consenso);
  assert.equal(consenso.length, 3 + 3 + 6);
  assert.ok(consenso.every((l) => l.status === "sem_consenso" && l.rotulo_consenso === "" && l.motivo_sem_consenso === "rotulos_incompletos"));
  assert.equal(r.heuristica.situacao, "aguardando_previsoes");
  assert.ok(r.pendencias.some((p) => /Pessoa B/.test(p)));
});

test("executarValidacao: kappa por dimensao confere com a conta no papel", async () => {
  const { cfg } = await cenario();
  const r = executarValidacao({ config: cfg, log: logSilencioso });
  const k = Object.fromEntries(ler(r.caminhos.kappa).map((l) => [l.dimensao, l]));

  perto(k.release_corretiva.kappa_fleiss, 82 / 154);
  perto(k.release_corretiva.concordancia_observada, 14 / 18);
  perto(k.release_corretiva.concordancia_esperada, 170 / 324);
  assert.equal(k.release_corretiva.interpretacao, "moderada");
  assert.equal(k.release_corretiva.unidades_validas, "6");

  perto(k.tipo_do_projeto.kappa_fleiss, -3 / 42);
  assert.equal(k.tipo_do_projeto.interpretacao, "pobre");

  assert.equal(k.releases_sao_entrega_real.kappa_fleiss, "");
  assert.match(k.releases_sao_entrega_real.observacao, /unica categoria/);
  assert.deepEqual(r.avaliadores.map((a) => a.situacao), ["completo", "completo", "completo"]);
});

test("executarValidacao: consenso, pendentes e decisao de reuniao registrada pelo grupo", async () => {
  const { pasta, cfg } = await cenario();
  const r1 = executarValidacao({ config: cfg, log: logSilencioso });
  assert.deepEqual(r1.consenso.tipo_do_projeto, { unidades: 3, unanimidade: 1, maioria_simples: 1, reuniao: 0, sem_consenso: 1, divergentes: 2, empates: 1, incompletos: 0 });
  assert.deepEqual(r1.consenso.release_corretiva, { unidades: 6, unanimidade: 4, maioria_simples: 2, reuniao: 0, sem_consenso: 0, divergentes: 2, empates: 0, incompletos: 0 });

  // Os rotulos originais de cada avaliador ficam preservados no consenso...
  const empate = ler(r1.caminhos.consenso).find((l) => l.dimensao === "tipo_do_projeto" && l.status === "sem_consenso");
  assert.deepEqual([empate.rotulo_enzo, empate.rotulo_caue, empate.rotulo_leo], ["biblioteca_framework", "ferramenta_cli", "aplicacao_servico"]);
  // ...e as planilhas dos avaliadores nao sao alteradas.
  assert.match(readFileSync(join(pasta, "data", "processed", "rotulos_caue.csv"), "utf8"), /Biblioteca\/Framework/);

  // Pendentes: 1 bloqueante (1-1-1) + 2 divergentes por maioria em cada dimensao com divergencia.
  const pendentes = ler(r1.caminhos.pendentes);
  assert.equal(pendentes.filter((p) => p.situacao.startsWith("bloqueante")).length, 1);
  assert.equal(pendentes.filter((p) => p.situacao === "revisar:maioria_simples").length, 3);
  assert.ok(pendentes.every((p) => p.rotulo_consenso === "" && p.justificativa === ""));

  // O grupo decide o empate em reuniao: copia a linha e preenche.
  const decisao = { ...pendentes.find((p) => p.situacao.startsWith("bloqueante")), rotulo_consenso: "ferramenta_cli", justificativa: "binario de linha de comando", participantes: "enzo, caue, leo", data_reuniao: "2026-10-20" };
  escreverCSV(join(pasta, "data", "processed", "consenso_reuniao.csv"), Object.keys(decisao), [decisao]);
  const r2 = executarValidacao({ config: cfg, log: logSilencioso });
  assert.equal(r2.consenso.tipo_do_projeto.reuniao, 1);
  assert.equal(r2.consenso.tipo_do_projeto.sem_consenso, 0);
  assert.deepEqual(r2.decisoes_de_reuniao, { registradas: 1, aplicadas: 1, rejeitadas: 0 });
  const resolvido = ler(r2.caminhos.consenso).find((l) => l.unidade_id === decisao.unidade_id && l.dimensao === "tipo_do_projeto");
  assert.equal(resolvido.metodo, "reuniao");
  assert.equal(resolvido.decisao_automatica, "false");
  assert.equal(ler(r2.caminhos.pendentes).filter((p) => p.situacao.startsWith("bloqueante")).length, 0);
});

test("executarValidacao: avalia previsoes de teste da heuristica e separa os erros para a Pessoa B", async () => {
  const { pasta, cfg, sorteio } = await cenario();
  // Previsoes de TESTE: "sim" nas releases 0 e 2 -> VP, FN, FP, VN, FN, VN.
  const previsoes = sorteio.linhas.map((l, i) => ({ full_name: l.full_name, release_id: l.release_id, tag_name: l.tag_name, corretiva_prevista: i === 0 || i === 2 ? "sim" : "nao", versao_heuristica: "fixture-de-teste" }));
  previsoes.push({ full_name: "fora/da-amostra", release_id: "1", tag_name: "v1", corretiva_prevista: "sim", versao_heuristica: "fixture-de-teste" });
  escreverCSV(join(pasta, "data", "processed", "heuristica_corretiva.csv"), Object.keys(previsoes[0]), previsoes);

  const r = executarValidacao({ config: cfg, log: logSilencioso });
  const [m] = ler(r.caminhos.heuristicaMetricas);
  assert.deepEqual([m.vp, m.fp, m.fn, m.vn], ["1", "1", "2", "2"]);
  perto(m.precisao, 0.5);
  perto(m.recall, 1 / 3);
  perto(m.f1, 0.4);
  assert.equal(m.situacao, "refinar");
  assert.equal(r.heuristica.previsoes_fora_da_amostra, 1);
  assert.ok(r.pendencias.some((p) => /F1 = 0.4 < 0.7, refinar/.test(p)));

  const erros = ler(r.caminhos.heuristicaErros);
  assert.deepEqual(erros.map((e) => e.classe).sort(), ["fn", "fn", "fp"]);
  assert.ok(erros.every((e) => e.url.startsWith("https://github.com/")));
  assert.equal(ler(r.caminhos.heuristicaAvaliacao).length, 6);
  assert.match(readFileSync(r.caminhos.relatorio, "utf8"), /\| fixture-de-teste \| 6 \| 1 \| 1 \| 2 \| 2 \| 0,500 \| 0,333 \| 0,400 \| refinar \|/);
});

test("executarValidacao: rotulo invalido vira problema e a unidade sai do kappa", async () => {
  const { pasta, cfg } = await cenario();
  preencher(pasta, "leo", { ...ROTULOS.leo, corretiva: ["talvez", ...ROTULOS.leo.corretiva.slice(1)] });
  const r = executarValidacao({ config: cfg, log: logSilencioso });
  const problemas = ler(r.caminhos.problemas);
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].tipo, "rotulo_invalido");
  assert.equal(problemas[0].avaliador, "leo");
  const k = ler(r.caminhos.kappa).find((l) => l.dimensao === "release_corretiva");
  assert.equal(k.unidades_validas, "5");
  assert.equal(k.unidades_excluidas, "1");
  assert.match(k.observacao, /preliminar/);
  assert.equal(r.avaliadores.find((a) => a.avaliador === "leo").situacao, "parcial");
});

test("verificarReproducao: refaz o sorteio e detecta dados alterados depois dele", async () => {
  const { pasta, cfg, sorteio } = await cenario({ preenchidos: [] });
  assert.equal(verificarReproducao(cfg, sorteio.linhas.map((l) => ({ ...l, release_id: String(l.release_id) }))).situacao, "reproduzida");

  const caminho = join(pasta, "data", "processed", "releases.csv");
  const tabela = lerTabelaCSV(caminho);
  const sorteada = sorteio.linhas[0];
  const restantes = tabela.registros.filter((r) => !(r.full_name === sorteada.full_name && r.release_id === String(sorteada.release_id)));
  writeFileSync(caminho, gerarCSV(tabela.cabecalho, restantes.map((r) => tabela.cabecalho.map((c) => r[c]))));
  const r = executarValidacao({ config: cfg, log: logSilencioso });
  assert.equal(r.amostra.reproducao.situacao, "divergente");
  assert.match(readFileSync(r.caminhos.relatorio, "utf8"), /Reprodutibilidade do sorteio: \*\*divergente\*\*/);

  writeFileSync(join(pasta, "data", "processed", "repositories.csv"), "rank,full_name,status\n");
  assert.equal(verificarReproducao(cfg, sorteio.linhas).situacao, "nao_verificavel");
});

test("amostra-ouro: repo_id na planilha e registro do sorteio com semente, criterio e hash das entradas", async () => {
  const { sorteio } = await cenario({ preenchidos: [] });
  assert.ok(sorteio.linhas.every((l) => /^10\d$/.test(String(l.repo_id))));
  const registro = JSON.parse(readFileSync(sorteio.caminhos.registro, "utf8"));
  assert.equal(registro.semente, 42);
  assert.equal(registro.tamanho_da_populacao, 5);
  assert.equal(registro.repositorios_sorteados.length, 3);
  assert.ok(registro.repositorios_sorteados.every((r) => r.releases_rotulaveis === 3 && r.releases_sorteadas === 2));
  assert.match(registro.entradas_sha256["processed/releases.csv"], /^[0-9a-f]{64}$/);
  assert.deepEqual(registro.avaliadores, AVALIADORES);
  assert.match(registro.criterio, /status "included"/);
});

test("amostra-ouro: o sorteio nao depende da ordem das linhas no CSV", async () => {
  const a = pastaTemporaria();
  const b = pastaTemporaria();
  prepararColeta(a);
  prepararColeta(b, { ordemInvertida: true });
  const ra = await executarAmostraOuro({ config: config(a), log: logSilencioso });
  const rb = await executarAmostraOuro({ config: config(b), log: logSilencioso });
  assert.deepEqual(ra.linhas, rb.linhas);
  assert.deepEqual(ordemCanonica([{ rank: "2", full_name: "b" }, { rank: "1", full_name: "z" }, { rank: "1", full_name: "a" }]).map((r) => r.full_name), ["a", "z", "b"]);
  assert.ok(montarAmostra({ repositorios: [], releases: [], quantidadeDeRepositorios: 3, releasesPorRepositorio: 2, semente: 1 }).linhas.length === 0);
});

test("gerarRelatorio: situacao concluida sem pendencias", () => {
  const md = gerarRelatorio({
    generated_at: "x", situacao: "concluida", parametros: { semente: 42, repositorios_na_amostra_ouro: 60, releases_por_repositorio: 5, avaliadores: AVALIADORES, limiar_f1: 0.7 },
    amostra: { repositorios: 60, releases: 300, reproducao: { situacao: "reproduzida", detalhe: "ok" } },
    avaliadores: [], problemas_por_tipo: {}, concordancia: [], consenso: {}, decisoes_de_reuniao: { registradas: 0, aplicadas: 0, rejeitadas: 0 },
    heuristica: { situacao: "avaliada", versoes: [], previsoes_fora_da_amostra: 0, problemas: [] }, pendencias: [],
  });
  assert.match(md, /\*\*Situação: concluída\.\*\*/);
  assert.match(md, /## Pendências\n\nNenhuma\./);
});

test("caminhosDaValidacao e parseArgs", () => {
  const c = caminhosDaValidacao("/d", ["ana"]);
  assert.match(c.rotulos.ana, /rotulos_ana\.csv$/);
  assert.match(c.relatorio, /docs[\\/]validacao-manual\.md$/);
  assert.deepEqual(parseArgs([]), { config: "config.json" });
  assert.deepEqual(parseArgs(["--config", "x.json"]), { config: "x.json" });
  assert.throws(() => parseArgs(["--config"]), /exige um valor/);
  assert.throws(() => parseArgs(["--x"]), /argumento desconhecido/);
});

test("config: validacao.avaliadores e validacao.limiarF1 sao validados", () => {
  const base = { janela: { inicio: "2025-01-01", fim: "2025-12-31" } };
  const padrao = validarConfig(base).validacao;
  assert.deepEqual(padrao.avaliadores, ["enzo", "caue", "leo"]);
  assert.equal(padrao.limiarF1, 0.7);
  assert.throws(() => validarConfig({ ...base, validacao: { avaliadores: ["so-um"] } }), /ao menos 2 nomes/);
  assert.throws(() => validarConfig({ ...base, validacao: { avaliadores: ["Ana", "bia"] } }), /letras minusculas/);
  assert.throws(() => validarConfig({ ...base, validacao: { avaliadores: ["ana", "ana"] } }), /repetidos/);
  assert.throws(() => validarConfig({ ...base, validacao: { limiarF1: 1.5 } }), /\(0, 1\]/);
  assert.throws(() => validarConfig({ ...base, validacao: { limiarF1: "0.7" } }), /\(0, 1\]/);
});
