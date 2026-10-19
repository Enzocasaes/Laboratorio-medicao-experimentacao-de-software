// Etapa "analise" (Passo 4, RQ 01 a RQ 04): estatistica descritiva das quatro
// metricas DORA e a classificacao de referencia (combinacao C1) de cada
// repositorio da amostra final.
//
// Offline: le data/processed/dataset.csv e nao toca a rede.
//
// Reporta MEDIANA e IQR, e nao media e desvio-padrao, como manda a secao 5 do
// enunciado: as distribuicoes de metricas de repositorio sao muito assimetricas
// (alguns poucos repositorios com milhares de releases puxam a media).
//
// Saidas (em <diretorios.saida>):
//   processed/dora_classificacao.csv  uma linha por repositorio, com a categoria
//                                     em cada metrica e a categoria geral
//   processed/analise_rq01_rq04.csv   uma linha por metrica: n, mediana, IQR,
//                                     minimo, maximo e distribuicao por categoria
//   ../docs/analise-rq01-rq04.md      o mesmo resumo em texto, para o artigo

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV, lerCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { CATEGORIAS, classificarRepositorio, distribuicao } from "./dora.js";

// As quatro metricas da combinacao C1, na ordem das RQs.
export const METRICAS = Object.freeze([
  { chave: "deployment_frequency", rq: "RQ 01", rotulo: "Deployment frequency", coluna: "deployment_frequency_per_week", unidade: "releases/semana", melhor: "maior" },
  { chave: "lead_time", rq: "RQ 02", rotulo: "Lead time for changes (a)", coluna: "lead_time_release_median_days", unidade: "dias", melhor: "menor" },
  { chave: "change_failure_rate", rq: "RQ 03", rotulo: "Change failure rate (a)", coluna: "change_failure_rate_ci", unidade: "proporcao 0-1", melhor: "menor" },
  { chave: "time_to_restore", rq: "RQ 04", rotulo: "Tempo de recuperacao", coluna: "recovery_median_hours", unidade: "horas", melhor: "menor" },
]);

// Variantes obrigatorias das RQ 02 e RQ 03 e a censura da RQ 04. Elas entram
// na DESCRITIVA, mas nao na classificacao: a tabela DORA e' aplicada sobre a
// combinacao C1 (release + lead time (a) + CFR (a)). Comparar as variantes e'
// justamente o que a RQ 07 vai medir; aqui elas aparecem para a discussao de
// por que (a) e (b) divergem.
export const COMPLEMENTARES = Object.freeze([
  { rq: "RQ 02", rotulo: "Lead time for changes (b), por commit", coluna: "lead_time_commit_median_days", unidade: "dias" },
  { rq: "RQ 03", rotulo: "Change failure rate (b), proxy de entrega", coluna: "change_failure_rate_delivery", unidade: "proporcao 0-1" },
  { rq: "RQ 04", rotulo: "Proporcao de episodios censurados", coluna: "recovery_censored_ratio", unidade: "proporcao 0-1" },
]);

export const COLUNAS_CLASSIFICACAO = Object.freeze([
  "full_name",
  "rank",
  "stars",
  "language",
  "deployment_frequency_per_week",
  "deployment_frequency_category",
  "lead_time_release_median_days",
  "lead_time_category",
  "change_failure_rate_ci",
  "change_failure_rate_category",
  "recovery_median_hours",
  "time_to_restore_category",
  "dora_score",
  "dora_category",
  "metricas_classificadas",
]);

export const COLUNAS_RESUMO = Object.freeze([
  "rq",
  "papel",
  "metrica",
  "coluna",
  "unidade",
  "n",
  "sem_valor",
  "mediana",
  "q1",
  "q3",
  "iqr",
  "minimo",
  "maximo",
  "elite",
  "high",
  "medium",
  "low",
  "sem_classificacao",
]);

function numero(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function arredondar(valor, casas = 4) {
  if (valor === null || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

// Percentil com interpolacao linear - o mesmo metodo padrao do numpy
// (`np.percentile`, method="linear"), para a analise em Python reproduzir
// exatamente estes numeros. Mesma definicao ja usada no lead time (RQ 02).
export function percentil(valores, p) {
  const ordenado = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (ordenado.length === 0) return null;
  const posicao = (ordenado.length - 1) * p;
  const abaixo = Math.floor(posicao);
  const acima = Math.ceil(posicao);
  if (abaixo === acima) return ordenado[abaixo];
  return ordenado[abaixo] + (ordenado[acima] - ordenado[abaixo]) * (posicao - abaixo);
}

export const mediana = (valores) => percentil(valores, 0.5);

// Mediana, IQR e extremos de uma lista. `n` conta so' os valores medidos.
export function descritiva(valores) {
  const numeros = valores.filter((v) => v !== null && Number.isFinite(v));
  if (numeros.length === 0) {
    return { n: 0, mediana: null, q1: null, q3: null, iqr: null, minimo: null, maximo: null };
  }
  const q1 = percentil(numeros, 0.25);
  const q3 = percentil(numeros, 0.75);
  return {
    n: numeros.length,
    mediana: arredondar(mediana(numeros)),
    q1: arredondar(q1),
    q3: arredondar(q3),
    iqr: arredondar(q3 - q1),
    minimo: arredondar(Math.min(...numeros)),
    maximo: arredondar(Math.max(...numeros)),
  };
}

export function lerDataset(caminho) {
  if (!existsSync(caminho)) {
    throw new Error(`Nao ha ${caminho}: rode antes a etapa "dataset" (npm run dataset).`);
  }
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((coluna, i) => [coluna, linha[i]])));
}

// Classifica todos os repositorios e devolve as linhas do CSV de classificacao.
export function classificarAmostra(repositorios) {
  return repositorios.map((r) => {
    const valores = {
      frequenciaPorSemana: numero(r.deployment_frequency_per_week),
      leadTimeDias: numero(r.lead_time_release_median_days),
      cfr: numero(r.change_failure_rate_ci),
      recuperacaoHoras: numero(r.recovery_median_hours),
    };
    const { porMetrica, categoria, pontos, metricas } = classificarRepositorio(valores);
    return {
      full_name: r.full_name,
      rank: r.rank,
      stars: r.stars,
      language: r.language,
      deployment_frequency_per_week: r.deployment_frequency_per_week,
      deployment_frequency_category: porMetrica.deployment_frequency,
      lead_time_release_median_days: r.lead_time_release_median_days,
      lead_time_category: porMetrica.lead_time,
      change_failure_rate_ci: r.change_failure_rate_ci,
      change_failure_rate_category: porMetrica.change_failure_rate,
      recovery_median_hours: r.recovery_median_hours,
      time_to_restore_category: porMetrica.time_to_restore,
      dora_score: pontos,
      dora_category: categoria,
      metricas_classificadas: metricas,
    };
  });
}

// Uma linha por metrica: descritiva + distribuicao das categorias.
export function resumirMetricas(repositorios, classificados) {
  return METRICAS.map((metrica) => {
    const valores = repositorios.map((r) => numero(r[metrica.coluna]));
    const estatisticas = descritiva(valores);
    const dist = distribuicao(classificados.map((c) => c[`${metrica.chave}_category`]));
    return {
      rq: metrica.rq,
      papel: "principal (C1)",
      metrica: metrica.rotulo,
      coluna: metrica.coluna,
      unidade: metrica.unidade,
      ...estatisticas,
      sem_valor: repositorios.length - estatisticas.n,
      elite: dist.Elite,
      high: dist.High,
      medium: dist.Medium,
      low: dist.Low,
      sem_classificacao: dist.sem_classificacao,
    };
  });
}

// Descritiva das variantes obrigatorias e da censura. Sem distribuicao de
// categorias: a tabela DORA nao se aplica a elas.
export function resumirComplementares(repositorios) {
  return COMPLEMENTARES.map((metrica) => {
    const valores = repositorios.map((r) => numero(r[metrica.coluna]));
    const estatisticas = descritiva(valores);
    return {
      rq: metrica.rq,
      papel: "complementar",
      metrica: metrica.rotulo,
      coluna: metrica.coluna,
      unidade: metrica.unidade,
      ...estatisticas,
      sem_valor: repositorios.length - estatisticas.n,
      elite: "",
      high: "",
      medium: "",
      low: "",
      sem_classificacao: "",
    };
  });
}

// ---- relatorio -----------------------------------------------------------

const pct = (parte, total) => (total === 0 ? "0%" : `${((parte / total) * 100).toFixed(1)}%`);

export function gerarRelatorioMarkdown({ resumos, complementares = [], classificados, geral, geradoEm, janela }) {
  const total = classificados.length;
  const linhas = [
    "# RQ 01 a RQ 04 — descritiva e classificação DORA",
    "",
    "> Arquivo **gerado** por `npm run analise:dora`. Não edite à mão.",
    "",
    `- Amostra: **${total} repositórios** (amostra final da S02).`,
    `- Janela: **${janela.inicio} a ${janela.fim}**.`,
    `- Gerado em: ${geradoEm}.`,
    "",
    "Mediana e IQR, e não média e desvio-padrão: as distribuições são muito",
    "assimétricas e a média seria puxada por poucos repositórios extremos",
    "(seção 5 do enunciado).",
    "",
    "## Descritiva por métrica",
    "",
    "| RQ | Métrica | n | Mediana | IQR (Q1–Q3) | Mín | Máx |",
    "|---|---|---|---|---|---|---|",
  ];

  for (const r of resumos) {
    linhas.push(
      `| ${r.rq} | ${r.metrica} (${r.unidade}) | ${r.n} | **${r.mediana}** | ${r.q1} – ${r.q3} | ${r.minimo} | ${r.maximo} |`
    );
  }

  linhas.push("", "## Variantes obrigatórias e censura (fora da classificação)", "");
  linhas.push(
    "O enunciado exige duas variantes em RQ 02 e RQ 03, e a proporção de",
    "episódios censurados em RQ 04. A tabela DORA é aplicada apenas sobre a",
    "combinação C1 (release + lead time (a) + CFR (a)); estas entram na",
    "descritiva e na discussão.",
    "",
    "| RQ | Métrica | n | Mediana | IQR (Q1–Q3) | Mín | Máx |",
    "|---|---|---|---|---|---|---|"
  );
  for (const r of complementares) {
    linhas.push(
      `| ${r.rq} | ${r.metrica} (${r.unidade}) | ${r.n} | **${r.mediana}** | ${r.q1} – ${r.q3} | ${r.minimo} | ${r.maximo} |`
    );
  }

  linhas.push(
    "",
    "## Distribuição das categorias por métrica",
    "",
    "| RQ | Métrica | Elite | High | Medium | Low | Não medida |",
    "|---|---|---|---|---|---|---|"
  );
  for (const r of resumos) {
    linhas.push(
      `| ${r.rq} | ${r.metrica} | ${r.elite} (${pct(r.elite, total)}) | ${r.high} (${pct(r.high, total)}) | ` +
        `${r.medium} (${pct(r.medium, total)}) | ${r.low} (${pct(r.low, total)}) | ${r.sem_classificacao} |`
    );
  }

  linhas.push(
    "",
    "## Categoria geral (combinação C1)",
    "",
    "Mediana dos quatro pontos (Elite 4, High 3, Medium 2, Low 1), arredondada",
    "para baixo. Repositórios sem alguma métrica medida são classificados pelas",
    "que têm, e a coluna `metricas_classificadas` registra quantas foram.",
    "",
    "| Categoria | Repositórios | % |",
    "|---|---|---|"
  );
  for (const categoria of CATEGORIAS) {
    linhas.push(`| ${categoria} | ${geral[categoria]} | ${pct(geral[categoria], total)} |`);
  }
  if (geral.sem_classificacao > 0) {
    linhas.push(`| sem classificação | ${geral.sem_classificacao} | ${pct(geral.sem_classificacao, total)} |`);
  }

  linhas.push("", "## Como refazer", "", "```bash", "cd Lab3/Sprint01", "npm run analise:dora", "```", "");
  return linhas.join("\n");
}

// ---- etapa ---------------------------------------------------------------

export function caminhosDeSaida(dirSaida) {
  return {
    classificacao: join(dirSaida, "processed", "dora_classificacao.csv"),
    resumo: join(dirSaida, "processed", "analise_rq01_rq04.csv"),
    relatorio: join(dirSaida, "..", "docs", "analise-rq01-rq04.md"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

export async function executarAnaliseDora({ config, log = logSilencioso, agora = () => new Date() }) {
  const { janela, diretorios } = config;
  const repositorios = lerDataset(join(diretorios.saida, "processed", "dataset.csv"));
  // Dataset so' com cabecalho = amostra final vazia (todos os candidatos caíram
  // no funil). Sai relatorio vazio com aviso, em vez de derrubar o pipeline -
  // mesmo tratamento da etapa "dataset".
  if (repositorios.length === 0) {
    log.aviso("dataset.csv nao tem nenhum repositorio: a analise sai vazia (rode a coleta antes)");
  }

  const classificados = classificarAmostra(repositorios);
  const resumos = resumirMetricas(repositorios, classificados);
  const complementares = resumirComplementares(repositorios);
  const todasAsLinhas = [...resumos, ...complementares];
  const geral = distribuicao(classificados.map((c) => c.dora_category));

  const caminhos = caminhosDeSaida(diretorios.saida);
  escrever(
    caminhos.classificacao,
    gerarCSV(COLUNAS_CLASSIFICACAO, classificados.map((c) => COLUNAS_CLASSIFICACAO.map((coluna) => c[coluna] ?? "")))
  );
  escrever(
    caminhos.resumo,
    gerarCSV(COLUNAS_RESUMO, todasAsLinhas.map((r) => COLUNAS_RESUMO.map((coluna) => r[coluna] ?? "")))
  );
  escrever(
    caminhos.relatorio,
    gerarRelatorioMarkdown({ resumos, complementares, classificados, geral, geradoEm: agora().toISOString(), janela })
  );

  for (const r of resumos) {
    log.info(
      `${r.rq} ${r.metrica}: n=${r.n} mediana=${r.mediana} IQR=${r.q1}..${r.q3} | ` +
        `Elite ${r.elite}, High ${r.high}, Medium ${r.medium}, Low ${r.low}` +
        (r.sem_classificacao ? `, ${r.sem_classificacao} sem medida` : "")
    );
  }
  for (const r of complementares) {
    log.info(`${r.rq} ${r.metrica}: n=${r.n} mediana=${r.mediana} IQR=${r.q1}..${r.q3}`);
  }
  log.info(
    `categoria geral: Elite ${geral.Elite}, High ${geral.High}, Medium ${geral.Medium}, Low ${geral.Low}` +
      (geral.sem_classificacao ? `, ${geral.sem_classificacao} sem classificacao` : "")
  );
  log.info(`saidas: ${caminhos.classificacao}, ${caminhos.resumo}, ${caminhos.relatorio}`);

  return { classificados, resumos, complementares, geral, caminhos };
}
