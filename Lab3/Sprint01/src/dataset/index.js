// Etapa "dataset" (Pessoa C, S02): junta as saidas das etapas de coleta
// num unico CSV - uma linha por repositorio da amostra final - e gera o
// DICIONARIO DE DADOS a partir da mesma lista de colunas (src/dataset/colunas.js),
// para que documentacao e arquivo nao possam divergir.
//
// Nao vai a rede: so' le os CSVs ja coletados. Pode ser rodada quantas vezes
// quiser, inclusive antes de as etapas de B e C terminarem - as colunas que
// ainda nao existem ficam vazias, e o relatorio diz quantas faltam.
//
// Saidas (em <diretorios.saida>):
//   processed/dataset.csv             uma linha por repositorio da amostra final
//   processed/dataset_dicionario.csv  o dicionario em CSV (para o artigo/planilha)
//   ../docs/dicionario-de-dados.md    o dicionario em Markdown (para o README)

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV, lerCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { COLUNAS_DATASET, NOMES_DAS_COLUNAS } from "./colunas.js";

const DIAS_POR_SEMANA = 7;

export function caminhosDeSaida(dirSaida) {
  return {
    dataset: join(dirSaida, "processed", "dataset.csv"),
    dicionarioCSV: join(dirSaida, "processed", "dataset_dicionario.csv"),
    dicionarioMD: join(dirSaida, "..", "docs", "dicionario-de-dados.md"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

// Le um CSV ja coletado e devolve { "owner/nome": linha }. Arquivo inexistente
// vira mapa vazio: a etapa correspondente ainda nao rodou.
export function lerPorRepositorio(caminho) {
  if (!existsSync(caminho)) return new Map();
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  const indiceDoNome = cabecalho.indexOf("full_name");
  if (indiceDoNome === -1) return new Map();
  return new Map(
    linhas.map((linha) => [linha[indiceDoNome], Object.fromEntries(cabecalho.map((coluna, i) => [coluna, linha[i]]))])
  );
}

function arredondar(valor, casas = 3) {
  if (valor === null || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function inteiro(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// RQ 01: releases publicadas na janela / semanas da janela. O denominador e' o
// mesmo para todos os repositorios (o enunciado usa ~52,1 semanas em 12 meses).
export function frequenciaDeDeploy(releasesNaJanela, janela) {
  const semanas = janela.dias / DIAS_POR_SEMANA;
  if (releasesNaJanela === null || semanas <= 0) return null;
  return arredondar(releasesNaJanela / semanas, 4);
}

// Monta uma linha do dataset a partir das tres fontes.
export function montarLinha({ repositorio, leadtime = {}, runs = {}, corretiva = {}, janela }) {
  const releasesNaJanela = inteiro(leadtime.releases_in_window ?? repositorio.releases_in_window);
  const valores = {
    ...repositorio,
    ...leadtime,
    ...runs,
    ...corretiva,
    releases_in_window: releasesNaJanela ?? "",
    window_weeks: arredondar(janela.dias / DIAS_POR_SEMANA, 2),
    deployment_frequency_per_week: frequenciaDeDeploy(releasesNaJanela, janela),
    leadtime_errors: leadtime.errors ?? "",
    runs_error: runs.error ?? "",
  };
  return NOMES_DAS_COLUNAS.map((coluna) => valores[coluna] ?? "");
}

// Quais repositorios entram: os da amostra final (`included`). Antes de a
// amostra fechar, caem aqui os que ja sao `eligible`, para dar para conferir o
// dataset parcial durante a coleta.
export function repositoriosDoDataset(repositorios) {
  const incluidos = [...repositorios.values()].filter((r) => r.status === "included");
  const base = incluidos.length > 0 ? incluidos : [...repositorios.values()].filter((r) => r.status === "eligible");
  return base.sort((a, b) => Number(a.rank) - Number(b.rank));
}

// ---- dicionario de dados -------------------------------------------------

const COLUNAS_DO_DICIONARIO = Object.freeze(["coluna", "tipo", "unidade", "rq", "fonte", "formula_ou_origem", "descricao"]);

function fonteLegivel(de) {
  return (
    {
      repositorio: "processed/repositories.csv (etapa repositorios)",
      leadtime: "processed/lead_time.csv (etapa leadtime)",
      runs: "processed/dora_runs.csv (etapa runs)",
      corretiva: "processed/cfr_entrega.csv (etapa corretiva)",
      derivada: "calculada em src/dataset/index.js",
    }[de] ?? de
  );
}

export function gerarDicionarioCSV() {
  return gerarCSV(
    COLUNAS_DO_DICIONARIO,
    COLUNAS_DATASET.map((c) => [
      c.nome,
      c.tipo,
      c.unidade,
      c.rq,
      fonteLegivel(c.de),
      c.formula ?? c.origem ?? "",
      c.descricao,
    ])
  );
}

export function gerarDicionarioMarkdown({ janela, geradoEm, totalDeLinhas }) {
  const linhas = [
    "# Dicionário de dados — `data/processed/dataset.csv`",
    "",
    "> Arquivo **gerado** por `npm run dataset` a partir de",
    "> [`src/dataset/colunas.js`](../src/dataset/colunas.js). Não edite à mão:",
    "> a mesma lista descreve e constrói o CSV, para documentação e dado não",
    "> divergirem.",
    "",
    `- Janela de observação: **${janela.inicio} a ${janela.fim}** (${janela.dias} dias, ${(janela.dias / DIAS_POR_SEMANA).toFixed(2)} semanas).`,
    `- Linhas: **${totalDeLinhas}** (uma por repositório da amostra final).`,
    `- Gerado em: ${geradoEm}.`,
    "",
    "Toda data vem da API em UTC (ISO 8601). Campo vazio significa **não medido**",
    "— e nunca zero: a diferença está descrita na coluna.",
    "",
    "| Coluna | Tipo | Unidade | RQ | Fonte | Fórmula / origem | Descrição |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const c of COLUNAS_DATASET) {
    const formula = c.formula ? `\`${c.formula}\`` : (c.origem ?? "—");
    linhas.push(
      `| \`${c.nome}\` | ${c.tipo} | ${c.unidade} | ${c.rq} | ${fonteLegivel(c.de)} | ${formula} | ${c.descricao} |`
    );
  }

  linhas.push(
    "",
    "## Outros arquivos da coleta",
    "",
    "| Arquivo | Conteúdo | Dicionário |",
    "|---|---|---|",
    "| `processed/candidates.csv` | todos os candidatos da busca, inclusive os descartados | README, *Colunas de candidates.csv* |",
    "| `processed/repositories.csv` | os que seguem no pipeline | idem |",
    "| `processed/selection_funnel.csv` | funil de seleção (Metodologia do artigo) | README, *Colunas de selection_funnel.csv* |",
    "| `processed/releases.csv` | uma linha por release coletada | README, *Colunas de releases.csv* |",
    "| `processed/release_commits.csv` | uma linha por release avaliada no lead time | README |",
    "| `processed/lead_time.csv` | uma linha por repositório (RQ 02) | README |",
    "| `processed/workflow_runs.csv` | uma linha por execução de CI | README |",
    "| `processed/recovery_episodes.csv` | uma linha por episódio de falha (RQ 04) | README |",
    "| `processed/dora_runs.csv` | uma linha por repositório (RQ 03 a e RQ 04) | README |",
    "| `processed/release_corretiva.csv` | uma linha por deploy da janela: sinais da heurística, previsão de cada versão e situação no CFR (b) | README, *Heurística de release corretiva* |",
    "| `processed/heuristica_corretiva.csv` | previsões de todas as versões da heurística (entrada da validação) | README, *Validação manual* |",
    "| `processed/cfr_entrega.csv` | uma linha por repositório (RQ 03 b e rework rate) | README |",
    "| `processed/amostra_ouro.csv` | releases sorteadas para a validação manual | README, *Validação manual* |",
    ""
  );

  return linhas.join("\n");
}

// ---- etapa ---------------------------------------------------------------

export async function executarDataset({ config, log = logSilencioso, agora = () => new Date() }) {
  const { janela, diretorios } = config;
  const processados = join(diretorios.saida, "processed");

  const arquivoDeRepositorios = join(processados, "repositories.csv");
  if (!existsSync(arquivoDeRepositorios)) {
    throw new Error(`Nao ha ${arquivoDeRepositorios}: rode antes a etapa "repositorios" (npm run coletar:repositorios).`);
  }
  // Arquivo presente mas sem linhas e' diferente de arquivo ausente: significa
  // que todos os candidatos foram descartados pelo funil. O dataset sai vazio
  // (com cabecalho) e o aviso explica, em vez de o pipeline quebrar.
  const repositorios = lerPorRepositorio(arquivoDeRepositorios);
  if (repositorios.size === 0) {
    log.aviso("nenhum repositorio na selecao: todos foram descartados pelo funil; dataset sai so' com o cabecalho");
  }
  const leadtime = lerPorRepositorio(join(processados, "lead_time.csv"));
  const runs = lerPorRepositorio(join(processados, "dora_runs.csv"));
  const corretiva = lerPorRepositorio(join(processados, "cfr_entrega.csv"));

  const alvos = repositoriosDoDataset(repositorios);
  const linhas = alvos.map((repositorio) =>
    montarLinha({
      repositorio,
      leadtime: leadtime.get(repositorio.full_name) ?? {},
      runs: runs.get(repositorio.full_name) ?? {},
      corretiva: corretiva.get(repositorio.full_name) ?? {},
      janela,
    })
  );

  const semLeadTime = alvos.filter((r) => !leadtime.has(r.full_name)).length;
  const semRuns = alvos.filter((r) => !runs.has(r.full_name)).length;
  const semCorretiva = alvos.filter((r) => !corretiva.has(r.full_name)).length;

  const caminhos = caminhosDeSaida(diretorios.saida);
  escrever(caminhos.dataset, gerarCSV(NOMES_DAS_COLUNAS, linhas));
  escrever(caminhos.dicionarioCSV, gerarDicionarioCSV());
  escrever(
    caminhos.dicionarioMD,
    gerarDicionarioMarkdown({ janela, geradoEm: agora().toISOString(), totalDeLinhas: linhas.length })
  );

  log.info(`dataset: ${linhas.length} repositorios x ${NOMES_DAS_COLUNAS.length} colunas`);
  if (semLeadTime > 0) log.aviso(`${semLeadTime} repositorios sem lead time (etapa "leadtime" incompleta)`);
  if (semRuns > 0) log.aviso(`${semRuns} repositorios sem workflow runs (etapa "runs" incompleta)`);
  if (semCorretiva > 0) log.aviso(`${semCorretiva} repositorios sem CFR (b) (etapa "corretiva" incompleta)`);
  log.info(`saidas: ${caminhos.dataset}, ${caminhos.dicionarioCSV}, ${caminhos.dicionarioMD}`);

  return { linhas: linhas.length, colunas: NOMES_DAS_COLUNAS.length, semLeadTime, semRuns, semCorretiva, caminhos };
}
