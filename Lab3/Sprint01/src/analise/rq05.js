// Etapa "rq05" (S03, Pessoa B): frequencia de deploy x taxa de falha.
//
//   RQ 05. Repositorios com maior frequencia de deploy apresentam maior ou
//          menor taxa de falha?
//
// Offline: le data/processed/dataset.csv e data/processed/release_corretiva.csv.
//
// Correlacao de SPEARMAN (por postos), e nao de Pearson: as duas metricas sao
// muito assimetricas e a relacao esperada e' monotona, nao linear. Cada par usa
// os repositorios em que as duas metricas foram medidas.
//
// Os pares formam UMA familia de testes, corrigida por Holm:
//   principal   frequencia x CFR (a) e frequencia x CFR (b) - as duas
//               variantes da hipotese H5
//   robustez    CFR (b) so' com >= 10 releases avaliadas: uma taxa com 2 ou 3
//               releases no denominador salta entre 0 e 1 e deixa o rho ruidoso
//   mecanismo   o CFR (b) e' o produto de duas proporcoes por repositorio:
//                 oportunidade = releases avaliadas cuja seguinte saiu em <= 7 dias
//                 condicional  = dessas, quantas a seguinte foi corretiva
//               (CFR (b) = oportunidade x condicional). Quem publica mais tem,
//               por construcao, mais releases com a seguinte em ate 7 dias. Se
//               a correlacao com o CFR (b) vier toda da oportunidade e sumir na
//               condicional, ela e' artefato da definicao - o que a H5 preve.
//   complementar frequencia x tempo de recuperacao (a outra metrica de
//               estabilidade do DORA)
//
// Saidas:
//   processed/analise_rq05.csv          uma linha por par: n, rho, IC 95%, p, p (Holm)
//   processed/analise_rq05_quartis.csv  CFR (a) e (b) por quartil de frequencia
//   processed/rq05_decomposicao.csv     oportunidade e condicional por repositorio
//   ../docs/analise-rq05.md             o mesmo resumo em texto, para o artigo

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV, lerTabelaCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { arredondar, descritiva, lerDataset } from "./rq01a04.js";
import { cortesQuartis, holm, magnitudeRho, QUARTIS, quartilDe, significativos4, spearman } from "./estatistica.js";

export const ALFA = 0.05;
export const MINIMO_AVALIADAS = 10;
const DIAS_PADRAO = 7;

function numero(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// ---- decomposicao do CFR (b) ------------------------------------------------

// Por repositorio, a partir de release_corretiva.csv (um deploy da janela por
// linha). So' entram as releases AVALIADAS no CFR (b) (failed ou not_failed):
// censuradas e indeterminadas ja estao fora do denominador do proprio CFR.
// Devolve Map full_name -> { avaliadas, com_seguinte_no_prazo, falharam,
// oportunidade, condicional }.
export function decomporCFREntrega(registros, { dias = DIAS_PADRAO } = {}) {
  const porRepositorio = new Map();
  for (const r of registros) {
    if (r.cfr_delivery_status !== "failed" && r.cfr_delivery_status !== "not_failed") continue;
    const atual = porRepositorio.get(r.full_name) ?? { avaliadas: 0, com_seguinte_no_prazo: 0, falharam: 0 };
    atual.avaliadas += 1;
    const diasAteSeguinte = numero(r.days_to_next);
    // Toda falha tem a seguinte no prazo; o teste explicito protege contra o
    // arredondamento de days_to_next (3 casas) num caso de exatamente 7 dias.
    if (r.cfr_delivery_status === "failed" || (diasAteSeguinte !== null && diasAteSeguinte <= dias)) {
      atual.com_seguinte_no_prazo += 1;
    }
    if (r.cfr_delivery_status === "failed") atual.falharam += 1;
    porRepositorio.set(r.full_name, atual);
  }
  for (const d of porRepositorio.values()) {
    d.oportunidade = d.avaliadas === 0 ? null : d.com_seguinte_no_prazo / d.avaliadas;
    // Sem nenhuma seguinte no prazo, a condicional nao existe (nao e' zero).
    d.condicional = d.com_seguinte_no_prazo === 0 ? null : d.falharam / d.com_seguinte_no_prazo;
  }
  return porRepositorio;
}

// ---- pares --------------------------------------------------------------------

const FREQUENCIA = { coluna: "deployment_frequency_per_week", rotulo: "Deployment frequency (releases/semana)" };

// `valor(r)` extrai a metrica de uma linha ja enriquecida com a decomposicao;
// `filtro(r)` (opcional) restringe os repositorios do par.
export const PARES = Object.freeze([
  {
    id: "freq_x_cfr_ci",
    papel: "principal",
    rotulo: "CFR (a), proxy de CI",
    coluna: "change_failure_rate_ci",
    valor: (r) => numero(r.change_failure_rate_ci),
  },
  {
    id: "freq_x_cfr_entrega",
    papel: "principal",
    rotulo: "CFR (b), proxy de entrega",
    coluna: "change_failure_rate_delivery",
    valor: (r) => numero(r.change_failure_rate_delivery),
  },
  {
    id: "freq_x_cfr_entrega_min10",
    papel: "robustez",
    rotulo: `CFR (b), so' com >= ${MINIMO_AVALIADAS} releases avaliadas`,
    coluna: "change_failure_rate_delivery",
    valor: (r) => numero(r.change_failure_rate_delivery),
    filtro: (r) => (numero(r.cfr_delivery_evaluated) ?? 0) >= MINIMO_AVALIADAS,
  },
  {
    id: "freq_x_oportunidade",
    papel: "mecanismo",
    rotulo: "Oportunidade: releases com a seguinte em <= 7 dias",
    coluna: "oportunidade",
    valor: (r) => r.decomposicao?.oportunidade ?? null,
  },
  {
    id: "freq_x_condicional",
    papel: "mecanismo",
    rotulo: "Condicional: seguinte corretiva, dado que saiu em <= 7 dias",
    coluna: "condicional",
    valor: (r) => r.decomposicao?.condicional ?? null,
  },
  {
    id: "freq_x_recuperacao",
    papel: "complementar",
    rotulo: "Tempo de recuperacao (horas)",
    coluna: "recovery_median_hours",
    valor: (r) => numero(r.recovery_median_hours),
  },
]);

export function correlacionar(repositorios) {
  const linhas = PARES.map((par) => {
    const base = par.filtro ? repositorios.filter(par.filtro) : repositorios;
    const resultado = spearman(
      base.map((r) => numero(r[FREQUENCIA.coluna])),
      base.map((r) => par.valor(r))
    );
    return { par, ...resultado };
  });
  const ajustados = holm(linhas.map((l) => l.p));
  return linhas.map((l, i) => ({
    id: l.par.id,
    papel: l.par.papel,
    x: FREQUENCIA.coluna,
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

// Mediana e IQR do CFR (a) e (b) por quartil de frequencia: a leitura
// descritiva da mesma pergunta, para o grafico/tabela do artigo.
export function porQuartilDeFrequencia(repositorios) {
  const frequencias = repositorios.map((r) => numero(r[FREQUENCIA.coluna]));
  const cortes = cortesQuartis(frequencias);
  if (cortes === null) return []; // dataset vazio: nao ha quartis
  return QUARTIS.map((quartil, i) => {
    const doQuartil = repositorios.filter((_, j) => quartilDe(frequencias[j], cortes) === quartil);
    const ci = descritiva(doQuartil.map((r) => numero(r.change_failure_rate_ci)));
    const entrega = descritiva(doQuartil.map((r) => numero(r.change_failure_rate_delivery)));
    return {
      quartil,
      freq_de: i === 0 ? arredondar(Math.min(...frequencias.filter(Number.isFinite))) : arredondar(cortes[i - 1]),
      freq_ate: i === 3 ? arredondar(Math.max(...frequencias.filter(Number.isFinite))) : arredondar(cortes[i]),
      n: doQuartil.length,
      cfr_ci_n: ci.n,
      cfr_ci_mediana: ci.mediana,
      cfr_ci_q1: ci.q1,
      cfr_ci_q3: ci.q3,
      cfr_entrega_n: entrega.n,
      cfr_entrega_mediana: entrega.mediana,
      cfr_entrega_q1: entrega.q1,
      cfr_entrega_q3: entrega.q3,
    };
  });
}

// ---- relatorio ----------------------------------------------------------------

export const COLUNAS_RQ05 = Object.freeze([
  "id", "papel", "x", "y", "descricao", "n", "rho", "ic95_inf", "ic95_sup", "p", "p_holm", "magnitude", "significativo_holm",
]);

export const COLUNAS_QUARTIS = Object.freeze([
  "quartil", "freq_de", "freq_ate", "n",
  "cfr_ci_n", "cfr_ci_mediana", "cfr_ci_q1", "cfr_ci_q3",
  "cfr_entrega_n", "cfr_entrega_mediana", "cfr_entrega_q1", "cfr_entrega_q3",
]);

export const COLUNAS_DECOMPOSICAO = Object.freeze([
  "full_name", "deployment_frequency_per_week", "avaliadas", "com_seguinte_no_prazo", "falharam",
  "oportunidade", "condicional", "change_failure_rate_delivery",
]);

const formatarP = (p) => (p === null ? "—" : p < 0.0001 ? "< 0,0001" : String(p).replace(".", ","));
const virgula = (v, casas = 3) => (v === null || v === undefined ? "—" : Number(v).toFixed(casas).replace(".", ","));
const porcento = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

function leitura(linha) {
  if (linha.rho === null) return "não calculada";
  const sentido = linha.rho > 0 ? "positiva" : "negativa";
  const sig = linha.significativo_holm ? "significativa após Holm" : "não significativa após Holm";
  return `${linha.magnitude}${linha.magnitude === "nula" ? "" : ` ${sentido}`}, ${sig}`;
}

export function gerarRelatorioMarkdown({ correlacoes, quartis, total, geradoEm, janela }) {
  const l = [
    "# RQ 05 — frequência de deploy × taxa de falha",
    "",
    "> Arquivo **gerado** por `npm run analise:rq05`. Não edite à mão.",
    "",
    `- Amostra: **${total} repositórios** (amostra final da S02).`,
    `- Janela: **${janela.inicio} a ${janela.fim}**.`,
    `- Gerado em: ${geradoEm}.`,
    "",
    "Correlação de **Spearman** (por postos): as duas métricas são muito",
    "assimétricas e a relação esperada é monótona, não linear. IC de 95% pela",
    "transformação de Fisher (erro-padrão de Bonett e Wright, 2000). Os seis",
    `pares formam uma família, corrigida por **Holm** (α = ${String(ALFA).replace(".", ",")}).`,
    "Magnitude de |ρ|: < 0,1 nula, < 0,3 fraca, < 0,5 moderada, ≥ 0,5 forte.",
    "",
    "## Correlações",
    "",
    "| Papel | Frequência × … | n | ρ | IC 95% | p | p (Holm) | Leitura |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const c of correlacoes) {
    l.push(
      `| ${c.papel} | ${c.descricao} | ${c.n} | **${virgula(c.rho)}** | ${virgula(c.ic95_inf)} a ${virgula(c.ic95_sup)} | ` +
        `${formatarP(c.p)} | ${formatarP(c.p_holm)} | ${leitura(c)} |`
    );
  }

  l.push(
    "",
    "**Decomposição do CFR (b).** Por repositório, CFR (b) = *oportunidade* ×",
    "*condicional*: a oportunidade é a proporção de releases avaliadas cuja",
    "seguinte saiu em até 7 dias; a condicional é, dessas, a proporção em que a",
    "seguinte foi corretiva. Quem publica mais tem, por construção, mais releases",
    "com a seguinte em até 7 dias. Se a correlação com o CFR (b) vier da",
    "oportunidade e não aparecer na condicional, ela é um efeito da definição da",
    "métrica, e não evidência de que publicar mais causa mais falhas.",
    "",
    "## CFR por quartil de frequência",
    "",
    "| Quartil | Frequência (releases/semana) | n | CFR (a) mediana | CFR (a) IQR | CFR (b) mediana | CFR (b) IQR |",
    "|---|---|---|---|---|---|---|"
  );
  for (const q of quartis) {
    l.push(
      `| ${q.quartil} | ${virgula(q.freq_de)} a ${virgula(q.freq_ate)} | ${q.n} | ${porcento(q.cfr_ci_mediana)} | ` +
        `${porcento(q.cfr_ci_q1)} – ${porcento(q.cfr_ci_q3)} | ${porcento(q.cfr_entrega_mediana)} | ` +
        `${porcento(q.cfr_entrega_q1)} – ${porcento(q.cfr_entrega_q3)} |`
    );
  }

  l.push(
    "",
    "## Como refazer",
    "",
    "```bash",
    "cd Lab3/Sprint01",
    "npm run analise:rq05",
    "python scripts/conferir_rq05_rq06.py   # opcional: confere com o scipy",
    "```",
    ""
  );
  return l.join("\n");
}

// ---- etapa --------------------------------------------------------------------

export function caminhosDeSaida(dirSaida) {
  return {
    dataset: join(dirSaida, "processed", "dataset.csv"),
    corretiva: join(dirSaida, "processed", "release_corretiva.csv"),
    correlacoes: join(dirSaida, "processed", "analise_rq05.csv"),
    quartis: join(dirSaida, "processed", "analise_rq05_quartis.csv"),
    decomposicao: join(dirSaida, "processed", "rq05_decomposicao.csv"),
    relatorio: join(dirSaida, "..", "docs", "analise-rq05.md"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

const csv = (colunas, linhas) => gerarCSV(colunas, linhas.map((r) => colunas.map((c) => r[c] ?? "")));

export async function executarRQ05({ config, log = logSilencioso, agora = () => new Date() }) {
  const caminhos = caminhosDeSaida(config.diretorios.saida);
  const repositorios = lerDataset(caminhos.dataset);
  if (repositorios.length === 0) log.aviso("dataset.csv nao tem nenhum repositorio: a RQ 05 sai vazia");

  const corretiva = lerTabelaCSV(caminhos.corretiva);
  if (corretiva === null) log.aviso(`nao ha ${caminhos.corretiva}: a decomposicao do CFR (b) sai vazia (rode "npm run corretiva")`);
  const decomposicao = decomporCFREntrega(corretiva?.registros ?? [], { dias: config.heuristica?.diasParaCorrecao ?? DIAS_PADRAO });
  const enriquecidos = repositorios.map((r) => ({ ...r, decomposicao: decomposicao.get(r.full_name) ?? null }));

  const correlacoes = correlacionar(enriquecidos);
  const quartis = porQuartilDeFrequencia(repositorios);
  const linhasDecomposicao = enriquecidos.map((r) => ({
    full_name: r.full_name,
    deployment_frequency_per_week: r.deployment_frequency_per_week,
    avaliadas: r.decomposicao?.avaliadas ?? 0,
    com_seguinte_no_prazo: r.decomposicao?.com_seguinte_no_prazo ?? 0,
    falharam: r.decomposicao?.falharam ?? 0,
    oportunidade: arredondar(r.decomposicao?.oportunidade ?? null),
    condicional: arredondar(r.decomposicao?.condicional ?? null),
    change_failure_rate_delivery: r.change_failure_rate_delivery,
  }));

  escrever(caminhos.correlacoes, csv(COLUNAS_RQ05, correlacoes));
  escrever(caminhos.quartis, csv(COLUNAS_QUARTIS, quartis));
  escrever(caminhos.decomposicao, csv(COLUNAS_DECOMPOSICAO, linhasDecomposicao));
  escrever(
    caminhos.relatorio,
    gerarRelatorioMarkdown({ correlacoes, quartis, total: repositorios.length, geradoEm: agora().toISOString(), janela: config.janela })
  );

  for (const c of correlacoes) {
    log.info(`RQ 05 ${c.id}: n=${c.n} rho=${c.rho} IC95=[${c.ic95_inf}, ${c.ic95_sup}] p=${c.p} p_holm=${c.p_holm} (${c.magnitude})`);
  }
  log.info(`saidas: ${caminhos.correlacoes}, ${caminhos.quartis}, ${caminhos.decomposicao}, ${caminhos.relatorio}`);
  return { correlacoes, quartis, decomposicao: linhasDecomposicao, caminhos };
}
