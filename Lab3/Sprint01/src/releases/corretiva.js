// Heuristica de release corretiva e change failure rate, variante (b) - proxy
// de entrega (RQ 03 b e secao 6 do enunciado; Pessoa B, S02).
//
// RELEASE CORRETIVA: "aquela cujo objetivo principal e' corrigir um defeito
// recente". A heuristica olha dois sinais da release R em relacao a anterior
// (a mesma release anterior do lead time: deploy imediatamente antes na
// sequencia por published_at):
//   - incremento de versao (SemVer): major, minor, patch...;
//   - mensagens dos commits de compare/{anterior}...{R}: revert, hotfix, fix.
// Cada combinacao desses sinais e' uma VERSAO da heuristica (VERSOES abaixo).
// Todas sao calculadas para toda release e avaliadas contra a amostra-ouro
// (src/validacao/heuristica.js); a versao usada no CFR (b) vem de
// config.heuristica.versao. "Se o F1 ficar abaixo de 0,70, refine a heuristica
// e reavalie": refinar = acrescentar uma versao aqui, rodar a etapa e a
// validacao de novo, e documentar o F1 de cada versao no artigo.
//
// CFR (b): R FALHOU se a release SEGUINTE (o proximo deploy) for corretiva e
// sair em ate 7 dias depois de R. O enunciado define "seguida em ate 7 dias por
// uma release corretiva" e o exemplo usa a seguinte imediata; uma corretiva
// que vem depois de outra release corrige a release mais recente, nao R.
//   CFR = releases que falharam / releases avaliadas
// Releases dos ultimos 7 dias da janela sao CENSURADAS (ainda nao se sabe se
// havera correcao) e ficam fora do denominador. Seguinte em ate 7 dias mas sem
// classificacao possivel (comparacao com erro) deixa R INDETERMINADA: tambem
// fora do denominador, e contada a parte.
//
// Este modulo e' PURO, como src/releases/leadtime.js: nenhuma requisicao,
// leitura de arquivo ou relogio. Coberto por test/corretiva.test.js.

import { DIA_MS } from "../janela.js";

export const DIAS_PARA_CORRECAO = 7;

// ---- versao semantica ------------------------------------------------------

// Tag -> { prefixo, numeros, sufixo }, ou null quando nao ha versao numerica
// com ao menos dois componentes. Aceita "v1.2.3", "1.2", "release-1.2.3",
// "pkg@1.2.3", "1.2.3-rc.1", "2025.10.1" (CalVer) e "1.2.3.4". O prefixo
// separa pacotes de um monorepo: "core@1.2.3" e "cli@1.2.4" nao sao a mesma
// linha de versoes.
const PADRAO_VERSAO = /^(.*?)[vV]?(\d+(?:\.\d+)+)([-+].*)?$/;

export function lerVersao(tag) {
  if (typeof tag !== "string") return null;
  const achado = PADRAO_VERSAO.exec(tag.trim());
  if (!achado) return null;
  return {
    prefixo: achado[1].toLowerCase(),
    numeros: achado[2].split(".").map(Number),
    sufixo: achado[3] ?? "",
  };
}

export const INCREMENTO = Object.freeze({
  MAJOR: "major",
  MINOR: "minor",
  PATCH: "patch", // o primeiro componente que muda e' o terceiro ou depois
  IGUAL: "same", // mesmos numeros (so' o sufixo muda, ex.: 1.2.3-beta -> 1.2.3)
  RETROCESSO: "backport", // versao menor que a anterior: correcao numa linha antiga
  DESCONHECIDO: "unknown", // tag sem versao numerica, ou de outro pacote
});

// Que componente mudou de `anterior` para `atual` (tags).
export function incrementoDeVersao(tagAnterior, tagAtual) {
  const a = lerVersao(tagAnterior);
  const b = lerVersao(tagAtual);
  if (a === null || b === null || a.prefixo !== b.prefixo) return INCREMENTO.DESCONHECIDO;
  const tamanho = Math.max(a.numeros.length, b.numeros.length);
  for (let i = 0; i < tamanho; i += 1) {
    const x = a.numeros[i] ?? 0;
    const y = b.numeros[i] ?? 0;
    if (x === y) continue;
    if (y < x) return INCREMENTO.RETROCESSO;
    return i === 0 ? INCREMENTO.MAJOR : i === 1 ? INCREMENTO.MINOR : INCREMENTO.PATCH;
  }
  return INCREMENTO.IGUAL;
}

// ---- mensagens de commit -------------------------------------------------

// Titulo de um commit: a primeira linha. Em merge de pull request a primeira
// linha e' "Merge pull request #12 from user/branch" e o titulo do PR vem
// depois - e' ele que diz o que a mudanca faz.
export function tituloDoCommit(mensagem) {
  const linhas = String(mensagem ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length === 0) return "";
  if (/^merge pull request #\d+/i.test(linhas[0]) && linhas.length > 1) return linhas[1];
  return linhas[0];
}

export const TIPO_DE_COMMIT = Object.freeze({
  REVERT: "revert",
  HOTFIX: "hotfix",
  FIX: "fix",
  DEPENDENCIA: "dependency", // atualizacao de dependencia: fora da proporcao
  RELEASE: "release", // commit de preparacao da release: fora da proporcao
  OUTRO: "other",
});

const RE_REVERT = /^revert\b|\brevert(s|ed|ing)?\b|\broll[\s-]?back\b/i;
const RE_HOTFIX = /\bhot[\s-]?fix(es|ed|ing)?\b/i;
// Vulnerabilidade corrigida conta como correcao mesmo vinda de um bot de
// dependencias (guia de rotulagem: "sim se a release existe por causa da
// vulnerabilidade").
const RE_SEGURANCA = /\bcve-\d{4}-\d+|\bghsa-[a-z0-9]{4}-|\bsecurity (fix|patch|vulnerabilit)/i;
const RE_DEPENDENCIA =
  /^(chore|build|fix|ci|deps)(\([^)]*deps[^)]*\))?!?:\s*(bump|update|upgrade)\b|^\w+\(deps(-dev)?\)|^bump\b.*\bfrom\b.*\bto\b|\bupdate (dependency|dependencies|deps)\b|^update (module|rust crate|gem) /i;
const RE_RELEASE =
  /^(chore|build)\(release\)|^(chore|build):\s*(release|prepare|bump version)|^(release|prepare (for )?release|bump version|version bump)\b|^v?\d+\.\d+(\.\d+)*$/i;
// Correcao "de manutencao" nao e' defeito em versao publicada (guia: typo,
// documentacao, testes, formatacao).
const RE_FIX_TRIVIAL = /^(docs|style|test|tests)(\([^)]*\))?!?:|\bfix(es|ed)? (a |the )?(typos?|spelling|lint(ing)?|format(ting)?|docs?|documentation|readme|comments?)\b/i;
const RE_FIX = /\b(bug[\s-]?)?fix(es|ed|ing)?\b|\bregressions?\b|\bcrash(es|ed|ing)?\b/i;

export function classificarCommit(mensagem) {
  const titulo = tituloDoCommit(mensagem);
  if (RE_REVERT.test(titulo)) return TIPO_DE_COMMIT.REVERT;
  if (RE_HOTFIX.test(titulo)) return TIPO_DE_COMMIT.HOTFIX;
  if (RE_SEGURANCA.test(titulo)) return TIPO_DE_COMMIT.FIX;
  if (RE_DEPENDENCIA.test(titulo)) return TIPO_DE_COMMIT.DEPENDENCIA;
  if (RE_RELEASE.test(titulo)) return TIPO_DE_COMMIT.RELEASE;
  if (RE_FIX_TRIVIAL.test(titulo)) return TIPO_DE_COMMIT.OUTRO;
  if (RE_FIX.test(titulo)) return TIPO_DE_COMMIT.FIX;
  return TIPO_DE_COMMIT.OUTRO;
}

// ---- sinais de uma release ---------------------------------------------

// Sinais de R a partir da comparacao com a anterior. `commitsDisponiveis` e'
// false quando nao ha comparacao (primeira release, tag ausente, erro): as
// versoes que dependem de commits ficam sem previsao, em vez de "nao".
export function sinaisDaRelease({ release, base = null, commits = [], erro = null, truncada = false }) {
  const contagem = { revert: 0, hotfix: 0, fix: 0, dependency: 0, release: 0, other: 0 };
  const comparavel = base !== null && release.tag_name !== null && base.tag_name !== null && erro === null;
  if (comparavel) for (const c of commits) contagem[classificarCommit(c.mensagem)] += 1;

  const corretivos = contagem.revert + contagem.hotfix + contagem.fix;
  const relevantes = corretivos + contagem.other;
  return {
    base_tag: base?.tag_name ?? null,
    version_increment: base === null ? null : incrementoDeVersao(base.tag_name, release.tag_name),
    commits_available: comparavel,
    commits_read: comparavel ? commits.length : null,
    commits_revert: comparavel ? contagem.revert : null,
    commits_hotfix: comparavel ? contagem.hotfix : null,
    commits_fix: comparavel ? contagem.fix : null,
    commits_dependency: comparavel ? contagem.dependency : null,
    commits_release: comparavel ? contagem.release : null,
    // Proporcao de commits corretivos entre os que mudam codigo (sem
    // dependencias e sem preparacao de release). Release sem nenhum commit
    // relevante (so' bump de dependencia, ou re-tag) tem proporcao 0.
    corrective_share: comparavel ? (relevantes === 0 ? 0 : corretivos / relevantes) : null,
    truncated: truncada,
    error: erro,
  };
}

// ---- versoes da heuristica -------------------------------------------------

// Cada versao recebe os sinais e devolve true (corretiva), false, ou null
// (sem como decidir: a release fica fora da avaliacao e do CFR).
// Ordem = ordem em que foram propostas; NAO apague versoes ja avaliadas, o
// artigo precisa do F1 de cada uma.
const ehPatch = (s) => s.version_increment === INCREMENTO.PATCH;
const semVersao = (s) => s.version_increment === null || s.version_increment === INCREMENTO.DESCONHECIDO;
const temCommitCorretivo = (s) => s.commits_revert + s.commits_hotfix + s.commits_fix > 0;

export const VERSOES = Object.freeze([
  {
    id: "v1-semver-patch",
    descricao: "corretiva se a versao muda so' no patch (2.3.0 -> 2.3.1)",
    prever: (s) => (semVersao(s) ? null : ehPatch(s)),
  },
  {
    id: "v2-commits-fix",
    descricao: "corretiva se ha algum commit com revert, hotfix ou fix no titulo entre as duas releases",
    prever: (s) => (s.commits_available ? temCommitCorretivo(s) : null),
  },
  {
    id: "v3-patch-e-commits",
    descricao: "corretiva se muda so' o patch E ha commit com revert, hotfix ou fix (o exemplo do enunciado)",
    prever: (s) => (semVersao(s) || !s.commits_available ? null : ehPatch(s) && temCommitCorretivo(s)),
  },
  {
    id: "v4-maioria-corretiva",
    descricao:
      "corretiva se ao menos metade dos commits que mudam codigo (sem dependencias e preparacao de release) " +
      "e' revert/hotfix/fix e a versao nao muda o major; tag sem versao numerica decide so' pelos commits",
    prever: (s) => (s.commits_available ? s.version_increment !== INCREMENTO.MAJOR && s.corrective_share >= 0.5 && temCommitCorretivo(s) : null),
  },
]);

export const IDS_DAS_VERSOES = Object.freeze(VERSOES.map((v) => v.id));

export function versaoPorId(id) {
  const versao = VERSOES.find((v) => v.id === id);
  if (!versao) throw new Error(`versao de heuristica desconhecida: ${id} (disponiveis: ${IDS_DAS_VERSOES.join(", ")})`);
  return versao;
}

// { "v1-semver-patch": true|false|null, ... } para uma release.
export function preverTodas(sinais) {
  return Object.fromEntries(VERSOES.map((v) => [v.id, v.prever(sinais)]));
}

// ---- CFR (b) ---------------------------------------------------------------

export const SITUACAO_CFR = Object.freeze({
  FALHOU: "failed",
  NAO_FALHOU: "not_failed",
  CENSURADA: "censored", // publicada nos ultimos 7 dias da janela
  INDETERMINADA: "undetermined", // seguinte em ate 7 dias, mas sem classificacao
});

// deploys: sequencia completa do repositorio (sequenciaDeDeploys), inclusive
// fora da janela. corretiva(release) -> true | false | null, pela versao
// escolhida. Devolve uma entrada por deploy DA JANELA.
export function avaliarFalhas(deploys, corretiva, janela, { dias = DIAS_PARA_CORRECAO } = {}) {
  const prazoMs = dias * DIA_MS;
  const inicioDaCensuraMs = janela.fimExclusivoMs - prazoMs;
  const avaliacoes = [];
  deploys.forEach((release, indice) => {
    if (!release.in_window) return;
    const publicadaMs = Date.parse(release.published_at);
    const seguinte = deploys[indice + 1] ?? null;
    const diasAteSeguinte = seguinte === null ? null : (Date.parse(seguinte.published_at) - publicadaMs) / DIA_MS;
    let situacao;
    if (publicadaMs >= inicioDaCensuraMs) situacao = SITUACAO_CFR.CENSURADA;
    else if (seguinte === null || diasAteSeguinte > dias) situacao = SITUACAO_CFR.NAO_FALHOU;
    else {
      const valor = corretiva(seguinte);
      situacao = valor === null ? SITUACAO_CFR.INDETERMINADA : valor ? SITUACAO_CFR.FALHOU : SITUACAO_CFR.NAO_FALHOU;
    }
    avaliacoes.push({ release, seguinte, dias_ate_seguinte: diasAteSeguinte, situacao });
  });
  return avaliacoes;
}

function arredondar(valor, casas = 4) {
  if (valor === null || !Number.isFinite(valor)) return null;
  return Math.round(valor * 10 ** casas) / 10 ** casas;
}

export const COLUNAS_CFR_ENTREGA = Object.freeze([
  "full_name",
  "corrective_heuristic",
  "deploys_in_window",
  "cfr_delivery_evaluated",
  "cfr_delivery_failed",
  "cfr_delivery_censored",
  "cfr_delivery_undetermined",
  "change_failure_rate_delivery",
  "corrective_releases",
  "releases_classified",
  "rework_rate",
]);

// Linha de cfr_entrega.csv. `corretivasDaJanela`: previsoes (true/false/null)
// da versao escolhida para os deploys da janela - base do rework rate (RQ 08,
// bonus): corretivas / releases classificadas.
export function resumirCFREntrega(fullName, versao, avaliacoes, corretivasDaJanela) {
  const conta = (s) => avaliacoes.filter((a) => a.situacao === s).length;
  const falhou = conta(SITUACAO_CFR.FALHOU);
  const avaliadas = falhou + conta(SITUACAO_CFR.NAO_FALHOU);
  const classificadas = corretivasDaJanela.filter((v) => v !== null);
  const corretivas = classificadas.filter(Boolean).length;
  return {
    full_name: fullName,
    corrective_heuristic: versao,
    deploys_in_window: avaliacoes.length,
    cfr_delivery_evaluated: avaliadas,
    cfr_delivery_failed: falhou,
    cfr_delivery_censored: conta(SITUACAO_CFR.CENSURADA),
    cfr_delivery_undetermined: conta(SITUACAO_CFR.INDETERMINADA),
    // Sem release avaliada a taxa e' null (nao medida), nunca 0.
    change_failure_rate_delivery: avaliadas === 0 ? null : arredondar(falhou / avaliadas),
    corrective_releases: corretivas,
    releases_classified: classificadas.length,
    rework_rate: classificadas.length === 0 ? null : arredondar(corretivas / classificadas.length),
  };
}
