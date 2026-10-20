// Etapa "rq08" (bonus): rework rate.
//
//   RQ 08. Qual a proporcao de releases corretivas (rework rate) dos
//          repositorios, e como ela se relaciona com as demais metricas DORA?
//
// Offline: le so' data/processed/dataset.csv.
//
// rework_rate = corrective_releases / releases_classified: a proporcao de
// deploys da janela que a heuristica classificou como corretivos. Ao contrario
// do CFR (b), nao exige que a correcao saia em ate 7 dias. Campo vazio = nao
// medido (nenhuma release classificada), nunca zero.
//
// Analises:
//   descritiva   n, mediana, IQR, extremos e quantos ficaram sem medida
//   robustez     a mesma descritiva so' com >= 10 releases classificadas: uma
//                taxa com 2 ou 3 releases no denominador salta entre 0 e 1
//   correlacoes  Spearman do rework rate com CFR (b), CFR (a), frequencia e
//                tempo de recuperacao. Os 4 pares formam UMA familia,
//                corrigida por Holm
//   quartis      rework rate por quartil de frequencia (como na RQ 05), com
//                Kruskal-Wallis e epsilon^2 como leitura complementar (fora da
//                familia: repete, por grupos, o par frequencia x rework)
//   diferenca    CFR (b) - rework rate por repositorio: quanto do retrabalho
//                fica fora da janela de 7 dias do CFR (b)
//
// Saidas:
//   processed/analise_rq08.csv          uma linha por par: n, rho, IC 95%, p, p (Holm)
//   processed/analise_rq08_quartis.csv  rework rate por quartil de frequencia
//   ../docs/analise-rq08.md             o mesmo resumo em texto, para o artigo

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { arredondar, descritiva, lerDataset } from "./rq01a04.js";
import {
  cortesQuartis,
  holm,
  kruskalWallis,
  magnitudeEpsilon2,
  magnitudeRho,
  QUARTIS,
  quartilDe,
  significativos4,
  spearman,
} from "./estatistica.js";

export const ALFA = 0.05;
export const MINIMO_CLASSIFICADAS = 10;

const REWORK = "rework_rate";
const FREQUENCIA = "deployment_frequency_per_week";

function numero(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// ---- descritiva -----------------------------------------------------------------

// Descritiva do rework rate em `repositorios`; `sem_medida` conta os que nao
// tem o campo (nao entram no n nem nos percentis).
export function descreverRework(repositorios) {
  const valores = repositorios.map((r) => numero(r[REWORK]));
  return { total: repositorios.length, sem_medida: valores.filter((v) => v === null).length, ...descritiva(valores) };
}

export const comMinimoClassificadas = (r) => (numero(r.releases_classified) ?? 0) >= MINIMO_CLASSIFICADAS;

// ---- pares ----------------------------------------------------------------------

export const PARES = Object.freeze([
  { id: "rework_x_cfr_entrega", rotulo: "CFR (b), proxy de entrega", coluna: "change_failure_rate_delivery" },
  { id: "rework_x_cfr_ci", rotulo: "CFR (a), proxy de CI", coluna: "change_failure_rate_ci" },
  { id: "rework_x_frequencia", rotulo: "Deployment frequency (releases/semana)", coluna: FREQUENCIA },
  { id: "rework_x_recuperacao", rotulo: "Tempo de recuperacao (horas)", coluna: "recovery_median_hours" },
]);

export function correlacionar(repositorios) {
  const linhas = PARES.map((par) => ({
    par,
    ...spearman(
      repositorios.map((r) => numero(r[REWORK])),
      repositorios.map((r) => numero(r[par.coluna]))
    ),
  }));
  const ajustados = holm(linhas.map((l) => l.p));
  return linhas.map((l, i) => ({
    id: l.par.id,
    x: REWORK,
    y: l.par.coluna,
    descricao: l.par.rotulo,
    n: l.n,
    rho: arredondar(l.rho),
    ic95_inf: arredondar(l.ic_inf),
    ic95_sup: arredondar(l.ic_sup),
    p: significativos4(l.p),
    p_holm: significativos4(ajustados[i]),
    magnitude: magnitudeRho(l.rho),
    significativo_holm: ajustados[i] === null ? null : ajustados[i] < ALFA,
  }));
}

// ---- quartis de frequencia ------------------------------------------------------

// Mesmos cortes da RQ 05 (quartis da frequencia sobre todos os repositorios).
// Devolve as linhas da tabela e o Kruskal-Wallis do rework entre os quartis.
export function porQuartilDeFrequencia(repositorios) {
  const frequencias = repositorios.map((r) => numero(r[FREQUENCIA]));
  const cortes = cortesQuartis(frequencias);
  if (cortes === null) return { quartis: [], kruskal: kruskalWallis([]) };
  const grupos = QUARTIS.map((quartil) =>
    repositorios.filter((_, j) => quartilDe(frequencias[j], cortes) === quartil)
  );
  const finitas = frequencias.filter(Number.isFinite);
  const quartis = QUARTIS.map((quartil, i) => {
    const rework = descritiva(grupos[i].map((r) => numero(r[REWORK])));
    return {
      quartil,
      freq_de: i === 0 ? arredondar(Math.min(...finitas)) : arredondar(cortes[i - 1]),
      freq_ate: i === 3 ? arredondar(Math.max(...finitas)) : arredondar(cortes[i]),
      n: grupos[i].length,
      rework_n: rework.n,
      rework_mediana: rework.mediana,
      rework_q1: rework.q1,
      rework_q3: rework.q3,
    };
  });
  const kw = kruskalWallis(grupos.map((g) => g.map((r) => numero(r[REWORK])).filter((v) => v !== null)));
  return { quartis, kruskal: { ...kw, magnitude: magnitudeEpsilon2(kw.epsilon2) } };
}

// ---- CFR (b) - rework -----------------------------------------------------------

// Por repositorio com as duas taxas medidas. Negativo = ha mais releases
// corretivas do que o CFR (b) atribui a falhas corrigidas em ate 7 dias.
// Os denominadores diferem (releases avaliadas no CFR (b) x classificadas no
// rework), entao a diferenca e' uma aproximacao, nao uma identidade.
export function diferencaCFRRework(repositorios) {
  const diferencas = repositorios
    .map((r) => {
      const cfr = numero(r.change_failure_rate_delivery);
      const rework = numero(r[REWORK]);
      return cfr === null || rework === null ? null : cfr - rework;
    })
    .filter((d) => d !== null);
  return {
    ...descritiva(diferencas),
    negativos: diferencas.filter((d) => d < 0).length,
    zeros: diferencas.filter((d) => d === 0).length,
    positivos: diferencas.filter((d) => d > 0).length,
  };
}

// ---- relatorio ------------------------------------------------------------------

export const COLUNAS_RQ08 = Object.freeze([
  "id", "x", "y", "descricao", "n", "rho", "ic95_inf", "ic95_sup", "p", "p_holm", "magnitude", "significativo_holm",
]);

export const COLUNAS_QUARTIS = Object.freeze([
  "quartil", "freq_de", "freq_ate", "n", "rework_n", "rework_mediana", "rework_q1", "rework_q3",
]);

const formatarP = (p) => (p === null ? "—" : p < 0.0001 ? "< 0,0001" : String(p).replace(".", ","));
const virgula = (v, casas = 3) => (v === null || v === undefined ? "—" : Number(v).toFixed(casas).replace(".", ","));
const porcento = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const pontos = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")} p.p.`);

function leitura(linha) {
  if (linha.rho === null) return "não calculada";
  const sentido = linha.rho > 0 ? "positiva" : "negativa";
  const sig = linha.significativo_holm ? "significativa após Holm" : "não significativa após Holm";
  return `${linha.magnitude}${linha.magnitude === "nula" ? "" : ` ${sentido}`}, ${sig}`;
}

function linhaDescritiva(rotulo, d) {
  return (
    `| ${rotulo} | ${d.total} | ${d.n} | ${d.sem_medida} | **${porcento(d.mediana)}** | ` +
    `${porcento(d.q1)} – ${porcento(d.q3)} | ${porcento(d.minimo)} | ${porcento(d.maximo)} |`
  );
}

// Versoes distintas da coluna corrective_heuristic (normalmente uma so').
export function versoesDaHeuristica(repositorios) {
  return [...new Set(repositorios.map((r) => String(r.corrective_heuristic ?? "").trim()).filter(Boolean))].sort();
}

export function gerarRelatorioMarkdown({ geral, robustez, correlacoes, quartis, kruskal, diferenca, heuristica, total, geradoEm, janela }) {
  const versao = heuristica.length === 0 ? "não informada" : heuristica.map((v) => `\`${v}\``).join(", ");
  const l = [
    "# RQ 08 (bônus) — rework rate",
    "",
    "> Arquivo **gerado** por `npm run analise:rq08`. Não edite à mão.",
    "",
    `- Amostra: **${total} repositórios** (amostra final da S02).`,
    `- Janela: **${janela.inicio} a ${janela.fim}**.`,
    `- Gerado em: ${geradoEm}.`,
    `- Heurística de release corretiva: ${versao} (coluna \`corrective_heuristic\`).`,
    "",
    "> **Atenção:** esta versão da heurística ainda **não foi validada** pela",
    "> amostra-ouro (ver `docs/validacao-manual.md`). O rework rate depende",
    "> inteiramente dela; trate os números abaixo como provisórios.",
    "",
    "**Rework rate** = `corrective_releases / releases_classified`: a proporção de",
    "deploys da janela classificados como corretivos. Ao contrário do CFR (b), não",
    "exige que a correção saia em até 7 dias. Campo vazio = não medido (nenhuma",
    "release classificada), nunca zero: esses repositórios ficam fora do cálculo.",
    "",
    "## Descritiva",
    "",
    "| Recorte | Repositórios | n medido | Sem medida | Mediana | IQR (Q1 – Q3) | Mín | Máx |",
    "|---|---|---|---|---|---|---|---|",
    linhaDescritiva("Todos", geral),
    linhaDescritiva(`Robustez: ≥ ${MINIMO_CLASSIFICADAS} releases classificadas`, robustez),
    "",
    "Correlação de **Spearman** (por postos). IC de 95% pela transformação de",
    "Fisher (erro-padrão de Bonett e Wright, 2000). Os quatro pares formam uma",
    `família, corrigida por **Holm** (α = ${String(ALFA).replace(".", ",")}). Magnitude de |ρ|:`,
    "< 0,1 nula, < 0,3 fraca, < 0,5 moderada, ≥ 0,5 forte. Cada par usa os",
    "repositórios em que as duas métricas foram medidas.",
    "",
    "## Correlações",
    "",
    "| Rework rate × … | n | ρ | IC 95% | p | p (Holm) | Leitura |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const c of correlacoes) {
    l.push(
      `| ${c.descricao} | ${c.n} | **${virgula(c.rho)}** | ${virgula(c.ic95_inf)} a ${virgula(c.ic95_sup)} | ` +
        `${formatarP(c.p)} | ${formatarP(c.p_holm)} | ${leitura(c)} |`
    );
  }

  l.push(
    "",
    "## Rework rate por quartil de frequência",
    "",
    "| Quartil | Frequência (releases/semana) | n | n medido | Rework mediana | Rework IQR |",
    "|---|---|---|---|---|---|"
  );
  for (const q of quartis) {
    l.push(
      `| ${q.quartil} | ${virgula(q.freq_de)} a ${virgula(q.freq_ate)} | ${q.n} | ${q.rework_n} | ` +
        `${porcento(q.rework_mediana)} | ${porcento(q.rework_q1)} – ${porcento(q.rework_q3)} |`
    );
  }
  l.push(
    "",
    kruskal.h === null
      ? "Kruskal-Wallis entre os quartis: não calculado."
      : `Kruskal-Wallis entre os quartis: H = ${virgula(kruskal.h)} (${kruskal.gl} gl), ` +
          `p = ${formatarP(significativos4(kruskal.p))}, ε² = ${virgula(kruskal.epsilon2)} (${kruskal.magnitude}). ` +
          "Leitura complementar, fora da família de Holm: repete, por grupos, o par frequência × rework.",
    "",
    "## CFR (b) − rework rate",
    "",
    "Por repositório com as duas taxas medidas. Valores negativos indicam releases",
    "corretivas que o CFR (b) não conta como falha — em geral porque saíram mais de",
    "7 dias depois da release anterior. Os denominadores diferem (releases",
    "avaliadas no CFR (b) × classificadas no rework), então a diferença é uma",
    "aproximação.",
    "",
    "| n | Mediana | IQR (Q1 – Q3) | Mín | Máx | < 0 | = 0 | > 0 |",
    "|---|---|---|---|---|---|---|---|",
    `| ${diferenca.n} | **${pontos(diferenca.mediana)}** | ${pontos(diferenca.q1)} – ${pontos(diferenca.q3)} | ` +
      `${pontos(diferenca.minimo)} | ${pontos(diferenca.maximo)} | ${diferenca.negativos} | ${diferenca.zeros} | ${diferenca.positivos} |`,
    "",
    "## Como refazer",
    "",
    "```bash",
    "cd Lab3/Sprint01",
    "npm run analise:rq08",
    "python scripts/conferir_rq08.py   # opcional: confere com o scipy",
    "```",
    ""
  );
  return l.join("\n");
}

// ---- etapa ----------------------------------------------------------------------

export function caminhosDeSaida(dirSaida) {
  return {
    dataset: join(dirSaida, "processed", "dataset.csv"),
    correlacoes: join(dirSaida, "processed", "analise_rq08.csv"),
    quartis: join(dirSaida, "processed", "analise_rq08_quartis.csv"),
    relatorio: join(dirSaida, "..", "docs", "analise-rq08.md"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

const csv = (colunas, linhas) => gerarCSV(colunas, linhas.map((r) => colunas.map((c) => r[c] ?? "")));

export async function executarRQ08({ config, log = logSilencioso, agora = () => new Date() }) {
  const caminhos = caminhosDeSaida(config.diretorios.saida);
  const repositorios = lerDataset(caminhos.dataset);
  if (repositorios.length === 0) log.aviso("dataset.csv nao tem nenhum repositorio: a RQ 08 sai vazia");

  const geral = descreverRework(repositorios);
  const robustez = descreverRework(repositorios.filter(comMinimoClassificadas));
  const correlacoes = correlacionar(repositorios);
  const { quartis, kruskal } = porQuartilDeFrequencia(repositorios);
  const diferenca = diferencaCFRRework(repositorios);
  const heuristica = versoesDaHeuristica(repositorios);
  if (heuristica.length > 1) log.aviso(`dataset mistura versoes da heuristica corretiva: ${heuristica.join(", ")}`);

  escrever(caminhos.correlacoes, csv(COLUNAS_RQ08, correlacoes));
  escrever(caminhos.quartis, csv(COLUNAS_QUARTIS, quartis));
  escrever(
    caminhos.relatorio,
    gerarRelatorioMarkdown({
      geral, robustez, correlacoes, quartis, kruskal, diferenca, heuristica,
      total: repositorios.length, geradoEm: agora().toISOString(), janela: config.janela,
    })
  );

  log.info(`RQ 08 rework rate: n=${geral.n} (sem medida: ${geral.sem_medida}) mediana=${geral.mediana} IQR=[${geral.q1}, ${geral.q3}]`);
  for (const c of correlacoes) {
    log.info(`RQ 08 ${c.id}: n=${c.n} rho=${c.rho} IC95=[${c.ic95_inf}, ${c.ic95_sup}] p=${c.p} p_holm=${c.p_holm} (${c.magnitude})`);
  }
  log.info(`saidas: ${caminhos.correlacoes}, ${caminhos.quartis}, ${caminhos.relatorio}`);
  return { geral, robustez, correlacoes, quartis, kruskal, diferenca, heuristica, caminhos };
}
