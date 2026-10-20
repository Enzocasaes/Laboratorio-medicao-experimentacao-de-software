// RQ 07 - ANALISE DE SENSIBILIDADE: o quanto a classificacao DORA de um
// repositorio depende da definicao operacional escolhida.
//
// Tres combinacoes, como o enunciado sugere (secao 5, RQ 07):
//
//   | Combinacao      | Unidade de deploy      | Lead time | CFR |
//   |-----------------|------------------------|-----------|-----|
//   | C1 (referencia) | release publicada      | (a)       | (a) |
//   | C2              | release + pre-release  | (b)       | (b) |
//   | C3              | tag                    | (b)       | (a) |
//
// O tempo de recuperacao (RQ 04) NAO muda entre as combinacoes: ele sai dos
// workflow runs, que nao dependem da unidade de deploy. Isso e' proposital -
// mantem a comparacao focada no que a definicao realmente altera, e esta
// registrado no relatorio para nao parecer esquecimento.
//
// Para cada par de combinacoes sao calculados:
//   - a % de repositorios que MUDAM de categoria;
//   - o KAPPA DE COHEN PONDERADO (pesos lineares), que leva em conta que as
//     categorias sao ordenadas: trocar Elite por High pesa menos que trocar
//     Elite por Low.
//
// A classificacao em si reusa src/analise/dora.js - a mesma funcao da RQ 01-04,
// para as duas analises nao divergirem.

import { CATEGORIAS, classificarRepositorio } from "./dora.js";

const DIAS_POR_SEMANA = 7;

export const COMBINACOES = Object.freeze([
  {
    id: "C1",
    rotulo: "C1 (referencia): release · lead time (a) · CFR (a)",
    deploy: "release publicada",
    leadTime: "(a) por release",
    cfr: "(a) proxy de CI",
  },
  {
    id: "C2",
    rotulo: "C2: release + pre-release · lead time (b) · CFR (b)",
    deploy: "release + pre-release",
    leadTime: "(b) por commit",
    cfr: "(b) proxy de entrega",
  },
  {
    id: "C3",
    rotulo: "C3: tag · lead time (b) · CFR (a)",
    deploy: "tag",
    leadTime: "(b) por commit",
    cfr: "(a) proxy de CI",
  },
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

function porSemana(quantidade, semanas) {
  if (quantidade === null || !(semanas > 0)) return null;
  return arredondar(quantidade / semanas);
}

// Valores de cada combinacao para um repositorio. `tagsNaJanela` vem da etapa
// "tags"; sem ela, C3 fica sem frequencia de deploy e o repositorio e'
// classificado pelas metricas restantes (e isso aparece no relatorio).
export function valoresDaCombinacao(repositorio, combinacao, { semanas, tagsNaJanela = null }) {
  const releases = numero(repositorio.releases_in_window);
  const prereleases = numero(repositorio.prereleases_in_window) ?? 0;
  const leadA = numero(repositorio.lead_time_release_median_days);
  const leadB = numero(repositorio.lead_time_commit_median_days);
  const cfrA = numero(repositorio.change_failure_rate_ci);
  const cfrB = numero(repositorio.change_failure_rate_delivery);
  const recuperacao = numero(repositorio.recovery_median_hours);

  if (combinacao.id === "C1") {
    return { frequenciaPorSemana: porSemana(releases, semanas), leadTimeDias: leadA, cfr: cfrA, recuperacaoHoras: recuperacao };
  }
  if (combinacao.id === "C2") {
    const total = releases === null ? null : releases + prereleases;
    return { frequenciaPorSemana: porSemana(total, semanas), leadTimeDias: leadB, cfr: cfrB, recuperacaoHoras: recuperacao };
  }
  return { frequenciaPorSemana: porSemana(tagsNaJanela, semanas), leadTimeDias: leadB, cfr: cfrA, recuperacaoHoras: recuperacao };
}

// Classifica cada repositorio nas tres combinacoes.
export function classificarCombinacoes(repositorios, { janela, tagsPorRepositorio = new Map() }) {
  const semanas = janela.dias / DIAS_POR_SEMANA;
  return repositorios.map((r) => {
    const linha = { full_name: r.full_name, rank: r.rank };
    for (const combinacao of COMBINACOES) {
      const valores = valoresDaCombinacao(r, combinacao, {
        semanas,
        tagsNaJanela: tagsPorRepositorio.get(r.full_name) ?? null,
      });
      const { categoria, metricas } = classificarRepositorio(valores);
      linha[`${combinacao.id}_categoria`] = categoria;
      linha[`${combinacao.id}_metricas`] = metricas;
      linha[`${combinacao.id}_frequencia`] = valores.frequenciaPorSemana;
      linha[`${combinacao.id}_lead_time`] = valores.leadTimeDias;
      linha[`${combinacao.id}_cfr`] = valores.cfr;
    }
    return linha;
  });
}

// ---- kappa de Cohen ponderado (pesos lineares) ---------------------------

// As categorias sao ORDENADAS (Low < Medium < High < Elite): trocar Elite por
// High e' um erro menor que trocar Elite por Low. O kappa simples trata as
// duas trocas igual; o ponderado linear da' peso proporcional a distancia.
export const ORDEM = Object.freeze(["Low", "Medium", "High", "Elite"]);

export function kappaPonderado(paresA, paresB) {
  const k = ORDEM.length;
  const validos = paresA
    .map((a, i) => [a, paresB[i]])
    .filter(([a, b]) => ORDEM.includes(a) && ORDEM.includes(b));
  const n = validos.length;
  if (n === 0) return { kappa: null, n: 0, concordancia_exata: null };

  const indice = (c) => ORDEM.indexOf(c);
  const peso = (i, j) => 1 - Math.abs(i - j) / (k - 1);

  const matriz = Array.from({ length: k }, () => new Array(k).fill(0));
  const margemA = new Array(k).fill(0);
  const margemB = new Array(k).fill(0);
  for (const [a, b] of validos) {
    matriz[indice(a)][indice(b)] += 1;
    margemA[indice(a)] += 1;
    margemB[indice(b)] += 1;
  }

  let observada = 0;
  let esperada = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      observada += peso(i, j) * (matriz[i][j] / n);
      esperada += peso(i, j) * ((margemA[i] / n) * (margemB[j] / n));
    }
  }

  const kappa = esperada === 1 ? 1 : (observada - esperada) / (1 - esperada);
  const exatas = validos.filter(([a, b]) => a === b).length;
  return {
    kappa: arredondar(kappa),
    n,
    concordancia_exata: arredondar(exatas / n),
    concordancia_ponderada: arredondar(observada),
    esperada_ponderada: arredondar(esperada),
  };
}

// Landis & Koch, a mesma escala usada no kappa de Fleiss da validacao manual.
export function interpretarKappa(kappa) {
  if (kappa === null) return "sem dados";
  if (kappa < 0) return "pobre";
  if (kappa <= 0.2) return "leve";
  if (kappa <= 0.4) return "razoavel";
  if (kappa <= 0.6) return "moderada";
  if (kappa <= 0.8) return "substancial";
  return "quase perfeita";
}

// Comparacao par a par das combinacoes.
export function compararCombinacoes(classificados) {
  const pares = [];
  for (let i = 0; i < COMBINACOES.length; i += 1) {
    for (let j = i + 1; j < COMBINACOES.length; j += 1) {
      const a = COMBINACOES[i];
      const b = COMBINACOES[j];
      const catsA = classificados.map((c) => c[`${a.id}_categoria`]);
      const catsB = classificados.map((c) => c[`${b.id}_categoria`]);
      const k = kappaPonderado(catsA, catsB);
      const mudaram = catsA.filter((cat, idx) => ORDEM.includes(cat) && ORDEM.includes(catsB[idx]) && cat !== catsB[idx]).length;
      // Quantas categorias de distancia, em media, nos que mudaram.
      const distancias = catsA
        .map((cat, idx) => [cat, catsB[idx]])
        .filter(([x, y]) => ORDEM.includes(x) && ORDEM.includes(y) && x !== y)
        .map(([x, y]) => Math.abs(ORDEM.indexOf(x) - ORDEM.indexOf(y)));
      pares.push({
        par: `${a.id} x ${b.id}`,
        n: k.n,
        mudaram,
        mudaram_percentual: k.n === 0 ? null : arredondar(mudaram / k.n),
        distancia_media: distancias.length === 0 ? 0 : arredondar(distancias.reduce((s, d) => s + d, 0) / distancias.length),
        distancia_maxima: distancias.length === 0 ? 0 : Math.max(...distancias),
        kappa_ponderado: k.kappa,
        interpretacao: interpretarKappa(k.kappa),
        concordancia_exata: k.concordancia_exata,
      });
    }
  }
  return pares;
}

// Distribuicao das categorias em cada combinacao, para a tabela do artigo.
export function distribuicaoPorCombinacao(classificados) {
  return COMBINACOES.map((combinacao) => {
    const contagem = Object.fromEntries(CATEGORIAS.map((c) => [c, 0]));
    let semClassificacao = 0;
    for (const linha of classificados) {
      const categoria = linha[`${combinacao.id}_categoria`];
      if (categoria === null || categoria === undefined) semClassificacao += 1;
      else contagem[categoria] += 1;
    }
    return { id: combinacao.id, rotulo: combinacao.rotulo, ...contagem, sem_classificacao: semClassificacao };
  });
}
