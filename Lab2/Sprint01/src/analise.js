// Passo 4 - Analise de resultados: teste de Wilcoxon signed-rank pareado.
//
// Unidade pareada = o KATA (ver Desenho do Experimento, secao (A) Convencoes):
// para cada kata k, x_k^IA = mediana da metrica entre os trials com-ia daquele
// kata e x_k^manual = mediana entre os trials sem-ia; D_k = x_k^IA - x_k^manual.
// Com 3 integrantes x 6 katas sao esperados 6 pares por hipotese.
//
// Hipoteses cobertas aqui: H1 (RQ1, tempo) e H2 (RQ2, taxa de sucesso). O
// script tambem calcula H3a/H3b (RQ3) quando ha metricas estaticas, porque a
// correcao de Holm exige a familia completa das 4 hipoteses - a interpretacao
// da RQ3 fica com o integrante responsavel por ela.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lerCSV, gerarCSV } from "./csv.js";
import { calcularMediana, calcularQuartis, detectarOutliers } from "./estatisticas.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_DADOS = process.env.LAB02_DATA_DIR || join(AQUI, "..", "data");

export const ALFA = 0.05;
export const TIME_BOX_SEGUNDOS = 2100;

// As 4 hipoteses do desenho. `familiaHolm` marca as que entram na correcao de
// Holm (as 4), `dono` registra quem conduz a leitura de cada uma na S03.
export const HIPOTESES = [
  { id: "H1", rq: "RQ1", campo: "duracao_segundos", rotulo: "time-to-green (s)", direcaoEsperada: "menor", dono: "RQ1/RQ2" },
  { id: "H2", rq: "RQ2", campo: "taxa_sucesso", rotulo: "taxa de sucesso dos testes", direcaoEsperada: "maior", dono: "RQ1/RQ2" },
  { id: "H3a", rq: "RQ3a", campo: "complexidade_ciclomatica_media", rotulo: "complexidade ciclomatica media/funcao", direcaoEsperada: null, dono: "RQ3" },
  { id: "H3b", rq: "RQ3b", campo: "duplicacao_percentual", rotulo: "duplicacao (% de linhas)", direcaoEsperada: null, dono: "RQ3" },
];

// Metricas que acompanham a RQ3 mas NAO entram na familia de Holm: o desenho
// fixou 4 hipoteses, e ampliar a familia depois de ver os dados seria
// "fishing" (ameaca G4). LOC e' controle OBRIGATORIO sempre que se reporta
// complexidade ou duplicacao - codigo de IA pode ser mais verboso, e sem
// normalizar por LOC a leitura engana. As demais sao leitura de apoio: o
// Wilcoxon delas e' calculado so' para dimensionar o efeito, nunca para
// decidir hipotese.
export const METRICAS_APOIO = [
  { campo: "loc", rotulo: "LOC (linhas de codigo)", papel: "controle obrigatorio" },
  { campo: "indice_manutenibilidade", rotulo: "indice de manutenibilidade (MI)", papel: "aprofundamento" },
  { campo: "num_funcoes", rotulo: "numero de funcoes", papel: "complementar" },
  { campo: "complexidade_ciclomatica_max", rotulo: "complexidade ciclomatica maxima", papel: "complementar" },
];

// ---------------------------------------------------------------- dados

// Le trials.csv e, se existir, completa cada trial com as metricas estaticas
// (metricas.csv). Nao usa trials-com-metricas.csv para nao depender da ordem em
// que os dois CSVs foram gerados.
export function carregarTrials(dirDados = DIR_DADOS) {
  const arqTrials = join(dirDados, "trials.csv");
  if (!existsSync(arqTrials)) return [];

  const trials = registrosDeCSV(arqTrials);
  const arqMetricas = join(dirDados, "metricas.csv");
  if (!existsSync(arqMetricas)) return trials;

  const porId = new Map(registrosDeCSV(arqMetricas).map((m) => [m.trial_id, m]));
  return trials.map((t) => ({ ...porId.get(t.trial_id), ...t }));
}

function registrosDeCSV(arquivo) {
  const { cabecalho, linhas } = lerCSV(readFileSync(arquivo, "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((c, i) => [c, linha[i]])));
}

function numero(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- pareamento

// Monta um par por kata: mediana da celula com-ia x mediana da celula sem-ia.
// Katas sem os dois tratamentos NAO viram par (e sao devolvidos em `incompletos`
// para o relatorio dizer o que falta coletar).
export function montarParesPorKata(trials, campo) {
  const katas = [...new Set(trials.map((t) => t.kata))].sort();
  const pares = [];
  const incompletos = [];

  for (const kata of katas) {
    const doKata = trials.filter((t) => t.kata === kata);
    const comIA = doKata.filter((t) => t.tratamento === "com-ia").map((t) => numero(t[campo])).filter((v) => v !== null);
    const semIA = doKata.filter((t) => t.tratamento === "sem-ia").map((t) => numero(t[campo])).filter((v) => v !== null);

    if (comIA.length === 0 || semIA.length === 0) {
      incompletos.push({ kata, nComIA: comIA.length, nSemIA: semIA.length });
      continue;
    }

    const xComIA = calcularMediana(comIA);
    const xSemIA = calcularMediana(semIA);
    pares.push({ kata, xComIA, xSemIA, diferenca: xComIA - xSemIA, nComIA: comIA.length, nSemIA: semIA.length });
  }

  return { pares, incompletos };
}

// Pareamento secundario do desenho (descritivo, sem inferencia): um par por
// integrante, mediana dos 3 trials com-ia x mediana dos 3 sem-ia.
export function montarParesPorIntegrante(trials, campo) {
  const participantes = [...new Set(trials.map((t) => t.participante))].sort();
  const pares = [];

  for (const participante of participantes) {
    const dele = trials.filter((t) => t.participante === participante);
    const comIA = dele.filter((t) => t.tratamento === "com-ia").map((t) => numero(t[campo])).filter((v) => v !== null);
    const semIA = dele.filter((t) => t.tratamento === "sem-ia").map((t) => numero(t[campo])).filter((v) => v !== null);
    if (comIA.length === 0 || semIA.length === 0) continue;

    const xComIA = calcularMediana(comIA);
    const xSemIA = calcularMediana(semIA);
    pares.push({ participante, xComIA, xSemIA, diferenca: xComIA - xSemIA });
  }

  return pares;
}

// ---------------------------------------------------------------- Wilcoxon

// Postos das magnitudes |D|, com posto medio nos empates (regra do desenho).
export function postosComEmpate(valores) {
  const indexados = valores.map((valor, indice) => ({ valor, indice })).sort((a, b) => a.valor - b.valor);
  const postos = new Array(valores.length);
  let i = 0;

  while (i < indexados.length) {
    let j = i;
    while (j + 1 < indexados.length && indexados[j + 1].valor === indexados[i].valor) j += 1;
    const postoMedio = (i + 1 + (j + 1)) / 2; // postos sao 1-based
    for (let k = i; k <= j; k += 1) postos[indexados[k].indice] = postoMedio;
    i = j + 1;
  }

  return postos;
}

// Distribuicao exata de W+ sob H0 por enumeracao dos 2^n sinais possiveis.
// Com empates de posto a enumeracao e' um teste de permutacao (os postos
// observados sao mantidos fixos e so' os sinais sao sorteados) - por isso o
// resultado e' exato tambem na presenca de empates.
function pExatoPorEnumeracao(postos, wObservado) {
  const n = postos.length;
  const centro = postos.reduce((s, p) => s + p, 0) / 2; // E[W+] sob H0
  const desvioObservado = Math.abs(wObservado - centro);
  const total = 2 ** n;

  let extremosBilateral = 0;
  let menorOuIgual = 0;
  let maiorOuIgual = 0;

  for (let mascara = 0; mascara < total; mascara += 1) {
    let w = 0;
    for (let i = 0; i < n; i += 1) if (mascara & (1 << i)) w += postos[i];
    if (Math.abs(w - centro) >= desvioObservado - 1e-9) extremosBilateral += 1;
    if (w <= wObservado + 1e-9) menorOuIgual += 1;
    if (w >= wObservado - 1e-9) maiorOuIgual += 1;
  }

  return {
    bilateral: extremosBilateral / total,
    unilateralInferior: menorOuIgual / total,
    unilateralSuperior: maiorOuIgual / total,
  };
}

// Wilcoxon signed-rank pareado, bilateral, alfa = 0,05.
// - pares com D = 0 sao descartados (reduzem n), conforme o desenho;
// - p exato por enumeracao ate `maxEnumeracao` pares; acima disso, aproximacao
//   normal com correcao de empates;
// - tamanho de efeito r = |Z| / raiz(n), sempre reportado junto do p.
export function wilcoxonPareado(diferencas, { maxEnumeracao = 20 } = {}) {
  const descartadosZero = diferencas.filter((d) => d === 0).length;
  const usadas = diferencas.filter((d) => d !== 0);
  const n = usadas.length;

  const base = {
    nPares: diferencas.length,
    n,
    descartadosZero,
    medianaDiferencas: diferencas.length ? calcularMediana(diferencas) : null,
  };

  if (n === 0) {
    return { ...base, suficiente: false, motivo: diferencas.length === 0 ? "nenhum par formado" : "todas as diferencas sao zero" };
  }

  const postos = postosComEmpate(usadas.map(Math.abs));
  const wMais = usadas.reduce((soma, d, i) => (d > 0 ? soma + postos[i] : soma), 0);
  const wMenos = usadas.reduce((soma, d, i) => (d < 0 ? soma + postos[i] : soma), 0);

  const centro = (n * (n + 1)) / 4;
  const empates = contarEmpates(postos);
  const correcaoEmpates = empates.reduce((s, t) => s + (t ** 3 - t), 0) / 48;
  const variancia = (n * (n + 1) * (2 * n + 1)) / 24 - correcaoEmpates;
  const z = variancia > 0 ? (wMais - centro) / Math.sqrt(variancia) : 0;

  const pNormalBilateral = Math.min(1, 2 * (1 - fdaNormalPadrao(Math.abs(z))));
  const exato = n <= maxEnumeracao ? pExatoPorEnumeracao(postos, wMais) : null;

  // p unilateral na direcao observada (confirmatorio-fraco, como pede o desenho)
  const pUnilateral = exato
    ? (wMais < centro ? exato.unilateralInferior : exato.unilateralSuperior)
    : Math.min(1, pNormalBilateral / 2);

  return {
    ...base,
    suficiente: true,
    wMais,
    wMenos,
    estatistica: Math.min(wMais, wMenos), // V reportado nas tabelas
    z,
    r: Math.abs(z) / Math.sqrt(n),
    exato: Boolean(exato),
    pBilateral: exato ? exato.bilateral : pNormalBilateral,
    pUnilateral,
    pNormalBilateral,
    menorPAtingivel: exato ? 2 / 2 ** n : null, // piso do teste exato com esse n
    rejeitaH0: (exato ? exato.bilateral : pNormalBilateral) < ALFA,
  };
}

function contarEmpates(postos) {
  const contagem = new Map();
  for (const p of postos) contagem.set(p, (contagem.get(p) || 0) + 1);
  return [...contagem.values()].filter((c) => c > 1);
}

// Aproximacao de Abramowitz & Stegun 26.2.17 para a FDA da normal padrao.
export function fdaNormalPadrao(x) {
  const sinal = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sinal * y);
}

// Correcao de Holm-Bonferroni sobre a familia das 4 hipoteses. Devolve os p
// ajustados na ordem de entrada (mantendo a monotonicidade do procedimento).
export function ajustarHolm(pValores) {
  const validos = pValores.map((p, i) => ({ p, i })).filter(({ p }) => Number.isFinite(p));
  const ordenados = [...validos].sort((a, b) => a.p - b.p);
  const m = ordenados.length;
  const ajustados = new Array(pValores.length).fill(null);

  let maiorAteAqui = 0;
  ordenados.forEach(({ p, i }, posicao) => {
    const ajustado = Math.min(1, (m - posicao) * p);
    maiorAteAqui = Math.max(maiorAteAqui, ajustado);
    ajustados[i] = maiorAteAqui;
  });

  return ajustados;
}

// ---------------------------------------------------------------- descritiva

export function descritivaPorTratamento(trials, campo) {
  const resumo = {};

  for (const tratamento of ["com-ia", "sem-ia"]) {
    const valores = trials.filter((t) => t.tratamento === tratamento).map((t) => numero(t[campo])).filter((v) => v !== null);
    if (valores.length === 0) {
      resumo[tratamento] = { n: 0 };
      continue;
    }
    const { q1, q3 } = calcularQuartis(valores);
    const outliers = detectarOutliers(valores);
    resumo[tratamento] = {
      n: valores.length,
      mediana: calcularMediana(valores),
      q1,
      q3,
      iqr: q3 - q1,
      minimo: Math.min(...valores),
      maximo: Math.max(...valores),
      outliers: outliers.indices.map((i) => valores[i]),
    };
  }

  return resumo;
}

// ---------------------------------------------------------------- analise

export function analisar(trials, { hipoteses = HIPOTESES } = {}) {
  const resultados = hipoteses.map((h) => {
    const { pares, incompletos } = montarParesPorKata(trials, h.campo);
    const teste = wilcoxonPareado(pares.map((p) => p.diferenca));
    return {
      ...h,
      pares,
      katasIncompletos: incompletos,
      teste,
      descritiva: descritivaPorTratamento(trials, h.campo),
      paresPorIntegrante: montarParesPorIntegrante(trials, h.campo),
    };
  });

  const ajustados = ajustarHolm(resultados.map((r) => (r.teste.suficiente ? r.teste.pBilateral : NaN)));
  resultados.forEach((r, i) => { r.pHolm = ajustados[i]; r.rejeitaH0ComHolm = ajustados[i] !== null && ajustados[i] < ALFA; });

  // metricas de apoio da RQ3: mesmo pareamento, FORA da correcao de Holm
  const apoio = METRICAS_APOIO.map((m) => {
    const { pares, incompletos } = montarParesPorKata(trials, m.campo);
    return {
      ...m,
      pares,
      katasIncompletos: incompletos,
      teste: wilcoxonPareado(pares.map((p) => p.diferenca)),
      descritiva: descritivaPorTratamento(trials, m.campo),
      paresPorIntegrante: montarParesPorIntegrante(trials, m.campo),
    };
  });

  const censurados = trials.filter((t) => numero(t.censurado) === 1).length;
  return {
    resultados,
    apoio,
    trials: trials.length,
    censurados,
    participantes: [...new Set(trials.map((t) => t.participante))].sort(),
    katas: [...new Set(trials.map((t) => t.kata))].sort(),
  };
}

// ---------------------------------------------------------------- saida

const fmt = (v, casas = 2) => (v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(casas));
const fmtP = (p) => (p === null || p === undefined || Number.isNaN(p) ? "-" : p < 0.001 ? "<0.001" : p.toFixed(4));

export function relatorioTexto(analise, { somenteRQ = null } = {}) {
  const linhas = [];
  const alvo = somenteRQ ? analise.resultados.filter((r) => somenteRQ.includes(r.rq)) : analise.resultados;

  linhas.push(`analise inferencial - Wilcoxon signed-rank pareado (bilateral, alfa = ${ALFA})`);
  linhas.push(`trials: ${analise.trials} | participantes: ${analise.participantes.join(", ") || "-"} | censurados: ${analise.censurados}`);
  linhas.push("unidade pareada: kata (mediana da celula com-ia - mediana da celula sem-ia)\n");

  for (const r of alvo) {
    linhas.push(`## ${r.id} (${r.rq}) - ${r.rotulo}`);

    const d = r.descritiva;
    for (const t of ["com-ia", "sem-ia"]) {
      const s = d[t];
      linhas.push(s.n === 0
        ? `  ${t.padEnd(6)} sem dados`
        : `  ${t.padEnd(6)} n=${s.n}  mediana=${fmt(s.mediana)}  IQR=${fmt(s.q1)}..${fmt(s.q3)}  min=${fmt(s.minimo)}  max=${fmt(s.maximo)}${s.outliers.length ? `  outliers: ${s.outliers.map((v) => fmt(v)).join(", ")}` : ""}`);
    }

    if (r.pares.length) {
      linhas.push("  pares por kata (com-ia | sem-ia | D):");
      for (const p of r.pares) {
        linhas.push(`    ${p.kata}  ${fmt(p.xComIA)} | ${fmt(p.xSemIA)} | ${p.diferenca > 0 ? "+" : ""}${fmt(p.diferenca)}`);
      }
    }

    if (r.katasIncompletos.length) {
      const faltando = r.katasIncompletos.map((k) => `${k.kata} (com-ia:${k.nComIA}, sem-ia:${k.nSemIA})`).join("; ");
      linhas.push(`  katas sem os dois tratamentos, fora do teste: ${faltando}`);
    }

    const t = r.teste;
    if (!t.suficiente) {
      linhas.push(`  RESULTADO INDISPONIVEL: ${t.motivo} -> nao ha como testar H0.`);
    } else {
      linhas.push(`  n=${t.n} pares${t.descartadosZero ? ` (${t.descartadosZero} com D=0 descartado(s))` : ""}  V=${fmt(t.estatistica, 1)}  Z=${fmt(t.z, 3)}  r=${fmt(t.r, 3)}`);
      linhas.push(`  mediana das diferencas = ${fmt(t.medianaDiferencas)}`);
      linhas.push(`  p bilateral ${t.exato ? "(exato)" : "(aprox. normal)"} = ${fmtP(t.pBilateral)}  |  p unilateral = ${fmtP(t.pUnilateral)}  |  p Holm = ${fmtP(r.pHolm)}`);
      linhas.push(`  decisao (p Holm < ${ALFA}): ${r.rejeitaH0ComHolm ? `REJEITA ${t.id || r.id}0` : `nao rejeita ${r.id}0`}`);
      if (t.menorPAtingivel !== null && t.menorPAtingivel >= ALFA) {
        linhas.push(`  AVISO: com n=${t.n} o menor p bilateral atingivel e' ${fmtP(t.menorPAtingivel)} >= ${ALFA} - o teste nao pode rejeitar H0, qualquer que seja o resultado.`);
      }
    }

    if (r.paresPorIntegrante.length) {
      const porInt = r.paresPorIntegrante.map((p) => `${p.participante}: ${p.diferenca > 0 ? "+" : ""}${fmt(p.diferenca)}`).join("  ");
      linhas.push(`  [descritivo, sem inferencia] D por integrante -> ${porInt}`);
    }

    linhas.push("");
  }

  // As metricas de apoio so' fazem sentido junto da RQ3.
  const mostrarApoio = analise.apoio
    && (somenteRQ === null || alvo.some((r) => r.rq.startsWith("RQ3")));
  if (mostrarApoio) {
    linhas.push("## RQ3 - metricas de apoio (FORA da familia de Holm)");
    linhas.push("   LOC acompanha H3a/H3b como controle obrigatorio; as demais sao leitura");
    linhas.push("   de apoio. O p abaixo dimensiona o efeito, NAO decide hipotese.\n");

    for (const m of analise.apoio) {
      linhas.push(`  ${m.rotulo}  [${m.papel}]`);
      const d = m.descritiva;
      for (const t of ["com-ia", "sem-ia"]) {
        const sd = d[t];
        linhas.push(sd.n === 0
          ? `    ${t.padEnd(6)} sem dados`
          : `    ${t.padEnd(6)} n=${sd.n}  mediana=${fmt(sd.mediana)}  IQR=${fmt(sd.q1)}..${fmt(sd.q3)}  min=${fmt(sd.minimo)}  max=${fmt(sd.maximo)}${sd.outliers.length ? `  outliers: ${sd.outliers.map((v) => fmt(v)).join(", ")}` : ""}`);
      }
      if (m.pares.length) {
        linhas.push(`    D por kata: ${m.pares.map((p) => `${p.kata}=${p.diferenca > 0 ? "+" : ""}${fmt(p.diferenca)}`).join("  ")}`);
      }
      const t = m.teste;
      linhas.push(t.suficiente
        ? `    n=${t.n}  mediana(D)=${fmt(t.medianaDiferencas)}  r=${fmt(t.r, 3)}  p bilateral=${fmtP(t.pBilateral)}  (referencia, sem Holm)`
        : `    sem teste: ${t.motivo}`);
      if (m.paresPorIntegrante.length) {
        linhas.push(`    D por integrante: ${m.paresPorIntegrante.map((p) => `${p.participante}=${p.diferenca > 0 ? "+" : ""}${fmt(p.diferenca)}`).join("  ")}`);
      }
      linhas.push("");
    }
  }

  return linhas.join("\n");
}

export function gerarCSVApoio(analise) {
  const cabecalho = [
    "metrica", "papel", "n_pares", "mediana_com_ia", "mediana_sem_ia",
    "iqr_com_ia", "iqr_sem_ia", "mediana_diferencas", "r", "p_bilateral_referencia", "testavel",
  ];
  const linhas = (analise.apoio ?? []).map((m) => {
    const t = m.teste;
    const d = m.descritiva;
    const iqr = (g) => (g.n === 0 ? "" : `${g.q1}..${g.q3}`);
    return [
      m.campo, m.papel, t.nPares, d["com-ia"].mediana ?? "", d["sem-ia"].mediana ?? "",
      iqr(d["com-ia"]), iqr(d["sem-ia"]),
      t.suficiente ? t.medianaDiferencas : "", t.suficiente ? t.r : "",
      t.suficiente ? t.pBilateral : "", t.suficiente ? 1 : 0,
    ];
  });
  return gerarCSV(cabecalho, linhas);
}

export function gerarCSVResultados(analise) {
  const cabecalho = [
    "hipotese", "rq", "metrica", "n_pares", "n_usado", "pares_descartados_d0",
    "mediana_diferencas", "mediana_com_ia", "mediana_sem_ia", "v", "z", "r",
    "p_bilateral", "p_unilateral", "p_holm", "metodo_p", "rejeita_h0_holm", "alfa",
  ];

  const linhas = analise.resultados.map((r) => {
    const t = r.teste;
    const d = r.descritiva;
    return [
      r.id, r.rq, r.campo, t.nPares, t.n ?? 0, t.descartadosZero ?? 0,
      t.medianaDiferencas ?? "", d["com-ia"].mediana ?? "", d["sem-ia"].mediana ?? "",
      t.suficiente ? t.estatistica : "", t.suficiente ? t.z : "", t.suficiente ? t.r : "",
      t.suficiente ? t.pBilateral : "", t.suficiente ? t.pUnilateral : "", r.pHolm ?? "",
      t.suficiente ? (t.exato ? "exato" : "aproximacao normal") : "indisponivel",
      t.suficiente ? (r.rejeitaH0ComHolm ? 1 : 0) : "", ALFA,
    ];
  });

  return gerarCSV(cabecalho, linhas);
}

export function gerarCSVPares(analise) {
  const cabecalho = ["hipotese", "rq", "metrica", "kata", "x_com_ia", "x_sem_ia", "diferenca", "n_trials_com_ia", "n_trials_sem_ia"];
  const linhas = analise.resultados.flatMap((r) =>
    r.pares.map((p) => [r.id, r.rq, r.campo, p.kata, p.xComIA, p.xSemIA, p.diferenca, p.nComIA, p.nSemIA]));
  return gerarCSV(cabecalho, linhas);
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const opcoes = { rq: ["RQ1", "RQ2"], dirDados: DIR_DADOS, escrever: true };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--todas") opcoes.rq = null;
    else if (arg === "--rq3") opcoes.rq = ["RQ3a", "RQ3b"];
    else if (arg === "--rq") opcoes.rq = String(argv[++i]).toUpperCase().split(",");
    else if (arg === "--dados") opcoes.dirDados = argv[++i];
    else if (arg === "--sem-csv") opcoes.escrever = false;
    else if (arg === "--ajuda" || arg === "-h") opcoes.ajuda = true;
  }

  return opcoes;
}

function main(argv) {
  const opcoes = parseArgs(argv);

  if (opcoes.ajuda) {
    console.log(`analise - Wilcoxon pareado das hipoteses do Lab02 (Passo 4)

  node src/analise.js                 # RQ1 e RQ2 (padrao)
  node src/analise.js --todas         # as 4 hipoteses (inclui RQ3)
  node src/analise.js --rq3           # so' a RQ3 (H3a, H3b + metricas de apoio)
  node src/analise.js --rq RQ1        # so' uma
  node src/analise.js --dados <dir>   # outro diretorio de dados
  node src/analise.js --sem-csv       # so' imprime, nao grava CSV`);
    return 0;
  }

  const trials = carregarTrials(opcoes.dirDados);
  if (trials.length === 0) {
    console.log(`nenhum trial encontrado em ${join(opcoes.dirDados, "trials.csv")} - rode os trials antes (ver README).`);
    return 1;
  }

  const analise = analisar(trials);
  console.log(relatorioTexto(analise, { somenteRQ: opcoes.rq }));

  if (opcoes.escrever) {
    mkdirSync(opcoes.dirDados, { recursive: true });
    const arqResultados = join(opcoes.dirDados, "analise-wilcoxon.csv");
    const arqPares = join(opcoes.dirDados, "analise-pares.csv");
    writeFileSync(arqResultados, gerarCSVResultados(analise));
    const arqApoio = join(opcoes.dirDados, "analise-rq3-apoio.csv");
    writeFileSync(arqPares, gerarCSVPares(analise));
    writeFileSync(arqApoio, gerarCSVApoio(analise));
    console.log(`CSV: ${arqResultados}`);
    console.log(`CSV: ${arqPares}`);
    console.log(`CSV: ${arqApoio}`);
  }

  const semDados = analise.resultados.filter((r) => opcoes.rq === null || opcoes.rq.includes(r.rq)).some((r) => !r.teste.suficiente);
  return semDados ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
