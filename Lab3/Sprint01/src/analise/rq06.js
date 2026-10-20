// Etapa "rq06" (S03, Pessoa B): caracteristicas do repositorio x desempenho DORA.
//
//   RQ 06. Quais caracteristicas dos repositorios estao associadas a um melhor
//          desempenho DORA?
//
// Offline: le data/processed/dataset.csv e, se existir, data/processed/consenso.csv
// (tipo do projeto rotulado na amostra-ouro).
//
// FATORES
//   linguagem        linguagem principal; C e C++ juntas (a H6 fala em "C/C++"),
//                    e linguagens com menos de 10 repositorios em "Outras"
//   contribuidores   quartis
//   idade            quartis (anos no fim da janela)
//   popularidade     quartis de estrelas
//   tipo do projeto  consenso da validacao manual - so' os 60 repositorios da
//                    amostra-ouro; fica de fora enquanto o consenso nao existir
//
// METRICAS: as quatro da combinacao C1 (as mesmas da classificacao de
// referencia) e a pontuacao DORA geral (1 = Low ... 4 = Elite).
//
// TESTES, em duas familias corrigidas por Holm separadamente:
//   omnibus     Kruskal-Wallis de cada fator x metrica; efeito = epsilon^2.
//               Responde "o fator esta associado a metrica?".
//   contrastes  Mann-Whitney planejado ANTES de ver os dados, a partir da H6:
//               Q4 x Q1 em cada fator por quartis (os extremos) e cada
//               linguagem de publicacao automatizada x C/C++ na frequencia;
//               efeito = delta de Cliff. Responde "em que sentido?".
//   exploratoria (fora das familias): contribuidores e idade sao correlacionados
//               (projetos antigos acumulam contribuidores), entao o efeito de um
//               pode ser o do outro. O Spearman parcial de cada um com as
//               metricas, controlando o outro, separa os dois.
//   Fazer todos os pares de grupos multiplicaria os testes (21 so' entre as 7
//   linguagens) e diluiria o poder sem responder nada que a H6 pergunte.
//
// Saidas:
//   processed/analise_rq06_testes.csv      Kruskal-Wallis: H, gl, p, p (Holm), epsilon^2
//   processed/analise_rq06_contrastes.csv  Mann-Whitney: U, p, p (Holm), delta de Cliff
//   processed/analise_rq06_grupos.csv      mediana e IQR de cada metrica em cada grupo
//   processed/analise_rq06_confusao.csv    exploratoria: correlacao entre os fatores
//                                          numericos e Spearman parcial contribuidores/idade
//   ../docs/analise-rq06.md                o mesmo resumo em texto, para o artigo

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV, lerTabelaCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { arredondar, classificarAmostra, descritiva, lerDataset, mediana } from "./rq01a04.js";
import {
  cortesQuartis,
  holm,
  kruskalWallis,
  magnitudeCliff,
  magnitudeEpsilon2,
  mannWhitney,
  QUARTIS,
  quartilDe,
  significativos4,
  spearman,
  spearmanParcial,
} from "./estatistica.js";

export const ALFA = 0.05;
export const MINIMO_POR_LINGUAGEM = 10;
export const MINIMO_POR_TIPO = 5;

function numero(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// `melhor`: sentido em que a metrica indica desempenho melhor.
export const METRICAS = Object.freeze([
  { coluna: "deployment_frequency_per_week", rotulo: "Deployment frequency", unidade: "releases/semana", melhor: "maior" },
  { coluna: "lead_time_release_median_days", rotulo: "Lead time (a)", unidade: "dias", melhor: "menor" },
  { coluna: "change_failure_rate_ci", rotulo: "CFR (a)", unidade: "proporcao 0-1", melhor: "menor" },
  { coluna: "recovery_median_hours", rotulo: "Tempo de recuperacao", unidade: "horas", melhor: "menor" },
  { coluna: "dora_score", rotulo: "Pontuacao DORA geral", unidade: "1 (Low) a 4 (Elite)", melhor: "maior" },
]);

// ---- fatores ------------------------------------------------------------------

const C_E_CPP = new Set(["C", "C++"]);

// Linguagem -> grupo. C e C++ viram "C/C++"; o que tiver menos de `minimo`
// repositorios (inclusive sem linguagem) vai para "Outras".
export function agruparLinguagens(linguagens, { minimo = MINIMO_POR_LINGUAGEM } = {}) {
  const base = linguagens.map((l) => {
    const nome = (l ?? "").trim();
    if (nome === "") return null;
    return C_E_CPP.has(nome) ? "C/C++" : nome;
  });
  const contagem = new Map();
  for (const b of base) if (b !== null) contagem.set(b, (contagem.get(b) ?? 0) + 1);
  return base.map((b) => (b !== null && contagem.get(b) >= minimo ? b : "Outras"));
}

// Tipo do projeto por consenso: Map full_name -> rotulo. So' unidades com
// consenso (unanimidade, maioria ou reuniao) entram.
export function tiposPorConsenso(registros) {
  const tipos = new Map();
  for (const r of registros ?? []) {
    if (r.dimensao === "tipo_do_projeto" && r.status === "consenso" && r.rotulo_consenso) {
      tipos.set(r.full_name, r.rotulo_consenso);
    }
  }
  return tipos;
}

function porQuartis(coluna) {
  return (repositorios) => {
    const valores = repositorios.map((r) => numero(r[coluna]));
    const cortes = cortesQuartis(valores);
    return { grupos: valores.map((v) => quartilDe(v, cortes)), ordem: QUARTIS, cortes };
  };
}

// Cada fator devolve o grupo de cada repositorio (null = fora do fator) e a
// ordem de exibicao dos grupos.
export const FATORES = Object.freeze([
  {
    id: "linguagem",
    rotulo: "Linguagem principal",
    agrupar: (repositorios) => {
      const grupos = agruparLinguagens(repositorios.map((r) => r.language));
      const contagem = new Map();
      for (const g of grupos) contagem.set(g, (contagem.get(g) ?? 0) + 1);
      const ordem = [...contagem.keys()].filter((g) => g !== "Outras").sort((a, b) => contagem.get(b) - contagem.get(a) || a.localeCompare(b));
      if (contagem.has("Outras")) ordem.push("Outras");
      return { grupos, ordem, cortes: null };
    },
  },
  { id: "contribuidores", rotulo: "Contribuidores (quartis)", coluna: "contributors", agrupar: porQuartis("contributors") },
  { id: "idade", rotulo: "Idade em anos (quartis)", coluna: "age_years", agrupar: porQuartis("age_years") },
  { id: "popularidade", rotulo: "Estrelas (quartis)", coluna: "stars", agrupar: porQuartis("stars") },
  {
    id: "tipo_do_projeto",
    rotulo: "Tipo do projeto (consenso, amostra-ouro)",
    agrupar: (repositorios) => {
      const brutos = repositorios.map((r) => r.tipo_do_projeto ?? null);
      const contagem = new Map();
      for (const b of brutos) if (b !== null) contagem.set(b, (contagem.get(b) ?? 0) + 1);
      // Tipos raros juntam-se a "outro", que ja e' a categoria residual do guia.
      const grupos = brutos.map((b) => (b === null ? null : contagem.get(b) >= MINIMO_POR_TIPO ? b : "outro"));
      const ordem = [...new Set(grupos.filter((g) => g !== null))].sort();
      return { grupos, ordem, cortes: null };
    },
  },
]);

// Contrastes planejados a partir da H6. `esperado`: sinal esperado do delta de
// Cliff (grupo_a x grupo_b) na metrica; null = sem expectativa na hipotese.
// Os fatores por quartis comparam Q4 x Q1 em todas as metricas.
const ESPERADO_Q4_X_Q1 = {
  contribuidores: {
    deployment_frequency_per_week: 1, // mais contribuidores -> mais deploys
    lead_time_release_median_days: -1, // -> lead time menor
    change_failure_rate_ci: 1, // -> CFR (a) maior
  },
  idade: { deployment_frequency_per_week: -1 }, // mais antigos -> menos deploys
};

export const LINGUAGENS_AUTOMATIZADAS = Object.freeze(["TypeScript", "JavaScript", "Go", "Rust"]);

export function planejarContrastes(fatoresAgrupados) {
  const contrastes = [];
  for (const fator of FATORES) {
    const agrupado = fatoresAgrupados.get(fator.id);
    if (!agrupado || agrupado.ordem.length < 2) continue;
    if (agrupado.ordem === QUARTIS) {
      for (const m of METRICAS) {
        contrastes.push({ fator: fator.id, metrica: m.coluna, grupo_a: "Q4", grupo_b: "Q1", esperado: ESPERADO_Q4_X_Q1[fator.id]?.[m.coluna] ?? null });
      }
    } else if (fator.id === "linguagem" && agrupado.ordem.includes("C/C++")) {
      for (const linguagem of LINGUAGENS_AUTOMATIZADAS) {
        if (!agrupado.ordem.includes(linguagem)) continue;
        contrastes.push({ fator: "linguagem", metrica: "deployment_frequency_per_week", grupo_a: linguagem, grupo_b: "C/C++", esperado: 1 });
      }
    }
  }
  return contrastes;
}

// ---- analise ------------------------------------------------------------------

// Linhas do dataset + pontuacao DORA (C1) + tipo do projeto (quando houver).
export function prepararRepositorios(repositorios, tipos = new Map()) {
  const classificados = classificarAmostra(repositorios);
  return repositorios.map((r, i) => ({
    ...r,
    dora_score: classificados[i].dora_score,
    tipo_do_projeto: tipos.get(r.full_name) ?? null,
  }));
}

function valoresDoGrupo(repositorios, grupos, grupo, coluna) {
  return repositorios.filter((_, i) => grupos[i] === grupo).map((r) => numero(r[coluna])).filter((v) => v !== null);
}

function melhorEPior(medianas, melhor) {
  const validas = medianas.filter((m) => m.mediana !== null);
  if (validas.length === 0) return { melhor_grupo: null, pior_grupo: null };
  const ordenadas = [...validas].sort((a, b) => (melhor === "maior" ? b.mediana - a.mediana : a.mediana - b.mediana));
  return { melhor_grupo: ordenadas[0].grupo, pior_grupo: ordenadas.at(-1).grupo };
}

export function analisar(repositorios) {
  const fatoresAgrupados = new Map();
  for (const fator of FATORES) {
    const agrupado = fator.agrupar(repositorios);
    if (agrupado.ordem.length >= 2) fatoresAgrupados.set(fator.id, agrupado);
  }

  const grupos = [];
  const testes = [];
  for (const fator of FATORES) {
    const agrupado = fatoresAgrupados.get(fator.id);
    if (!agrupado) continue;
    for (const m of METRICAS) {
      const listas = agrupado.ordem.map((g) => valoresDoGrupo(repositorios, agrupado.grupos, g, m.coluna));
      const medianas = agrupado.ordem.map((g, j) => {
        const d = descritiva(listas[j]);
        grupos.push({ fator: fator.id, grupo: g, metrica: m.coluna, n: d.n, mediana: d.mediana, q1: d.q1, q3: d.q3 });
        return { grupo: g, mediana: listas[j].length ? mediana(listas[j]) : null };
      });
      const kw = kruskalWallis(listas);
      testes.push({
        fator: fator.id,
        metrica: m.coluna,
        melhor: m.melhor,
        n: kw.n,
        grupos: kw.k,
        h: kw.h,
        gl: kw.gl,
        p: kw.p,
        epsilon2: kw.epsilon2,
        ...melhorEPior(medianas, m.melhor),
      });
    }
  }
  const pTestes = holm(testes.map((t) => t.p));

  const contrastes = planejarContrastes(fatoresAgrupados).map((c) => {
    const agrupado = fatoresAgrupados.get(c.fator);
    const a = valoresDoGrupo(repositorios, agrupado.grupos, c.grupo_a, c.metrica);
    const b = valoresDoGrupo(repositorios, agrupado.grupos, c.grupo_b, c.metrica);
    const mw = mannWhitney(a, b);
    const melhor = METRICAS.find((m) => m.coluna === c.metrica).melhor;
    // Quem tem desempenho melhor: delta > 0 = grupo_a maior; se "menor e'
    // melhor", o sentido se inverte. Empate exato (delta 0) nao favorece ninguem.
    let favorece = null;
    if (mw.delta !== null && mw.delta !== 0) {
      const aMaior = mw.delta > 0;
      favorece = aMaior === (melhor === "maior") ? c.grupo_a : c.grupo_b;
    }
    return {
      ...c,
      n_a: mw.n1,
      n_b: mw.n2,
      mediana_a: a.length ? mediana(a) : null,
      mediana_b: b.length ? mediana(b) : null,
      u: mw.u,
      p: mw.p,
      delta: mw.delta,
      favorece,
    };
  });
  const pContrastes = holm(contrastes.map((c) => c.p));

  return {
    fatoresAgrupados,
    grupos,
    testes: testes.map((t, i) => ({
      ...t,
      h: arredondar(t.h),
      p: significativos4(t.p),
      p_holm: significativos4(pTestes[i]),
      epsilon2: arredondar(t.epsilon2),
      magnitude: magnitudeEpsilon2(t.epsilon2),
      significativo_holm: pTestes[i] === null ? null : pTestes[i] < ALFA,
    })),
    contrastes: contrastes.map((c, i) => {
      const significativo = pContrastes[i] === null ? null : pContrastes[i] < ALFA;
      let hipotese = null;
      if (c.esperado !== null && c.delta !== null) {
        if (!significativo) hipotese = "nao_confirmada";
        else hipotese = Math.sign(c.delta) === c.esperado ? "confirmada" : "contrariada";
      }
      return {
        ...c,
        mediana_a: arredondar(c.mediana_a),
        mediana_b: arredondar(c.mediana_b),
        u: arredondar(c.u, 1),
        p: significativos4(c.p),
        p_holm: significativos4(pContrastes[i]),
        delta: arredondar(c.delta),
        magnitude: magnitudeCliff(c.delta),
        significativo_holm: significativo,
        esperado: c.esperado === null ? null : c.esperado > 0 ? "a > b" : "a < b",
        hipotese,
      };
    }),
  };
}

// Exploratoria: confusao entre contribuidores e idade (e estrelas). Nao entra
// em nenhuma familia de Holm: serve para interpretar os testes acima.
const FATORES_NUMERICOS = Object.freeze([
  { coluna: "contributors", rotulo: "Contribuidores" },
  { coluna: "age_years", rotulo: "Idade" },
  { coluna: "stars", rotulo: "Estrelas" },
]);

export function analisarConfusao(repositorios) {
  const col = (c) => repositorios.map((r) => numero(r[c]));
  const linhas = [];
  for (let i = 0; i < FATORES_NUMERICOS.length; i += 1) {
    for (let j = i + 1; j < FATORES_NUMERICOS.length; j += 1) {
      const a = FATORES_NUMERICOS[i];
      const b = FATORES_NUMERICOS[j];
      const r = spearman(col(a.coluna), col(b.coluna));
      linhas.push({ tipo: "entre_fatores", x: a.coluna, y: b.coluna, controle: null, n: r.n, rho: r.rho, p: r.p });
    }
  }
  const pares = [["contributors", "age_years"], ["age_years", "contributors"]];
  for (const m of METRICAS) {
    for (const [fator, controle] of pares) {
      const simples = spearman(col(fator), col(m.coluna));
      const parcial = spearmanParcial(col(fator), col(m.coluna), col(controle));
      linhas.push({ tipo: "simples", x: fator, y: m.coluna, controle: null, n: simples.n, rho: simples.rho, p: simples.p });
      linhas.push({ tipo: "parcial", x: fator, y: m.coluna, controle, n: parcial.n, rho: parcial.rho, p: parcial.p });
    }
  }
  return linhas.map((l) => ({ ...l, rho: arredondar(l.rho), p: significativos4(l.p) }));
}

// ---- relatorio ----------------------------------------------------------------

export const COLUNAS_TESTES = Object.freeze([
  "fator", "metrica", "melhor", "n", "grupos", "h", "gl", "p", "p_holm", "epsilon2", "magnitude", "significativo_holm", "melhor_grupo", "pior_grupo",
]);
export const COLUNAS_CONTRASTES = Object.freeze([
  "fator", "metrica", "grupo_a", "grupo_b", "n_a", "n_b", "mediana_a", "mediana_b", "u", "p", "p_holm", "delta", "magnitude",
  "significativo_holm", "favorece", "esperado", "hipotese",
]);
export const COLUNAS_GRUPOS = Object.freeze(["fator", "grupo", "metrica", "n", "mediana", "q1", "q3"]);
export const COLUNAS_CONFUSAO = Object.freeze(["tipo", "x", "y", "controle", "n", "rho", "p"]);

const formatarP = (p) => (p === null ? "—" : p < 0.0001 ? "< 0,0001" : String(p).replace(".", ","));
const virgula = (v, casas = 3) => (v === null || v === undefined ? "—" : Number(v).toFixed(casas).replace(".", ","));
const rotuloMetrica = (coluna) => METRICAS.find((m) => m.coluna === coluna).rotulo;
const rotuloFator = (id) => FATORES.find((f) => f.id === id).rotulo;

function descreverCortes(fatoresAgrupados) {
  const linhas = [];
  for (const fator of FATORES) {
    const agrupado = fatoresAgrupados.get(fator.id);
    if (!agrupado?.cortes) continue;
    const [c1, c2, c3] = agrupado.cortes.map((c) => virgula(c, 2));
    linhas.push(`- ${fator.rotulo} (\`${fator.coluna}\`): Q1 ≤ ${c1} < Q2 ≤ ${c2} < Q3 ≤ ${c3} < Q4.`);
  }
  return linhas;
}

export function gerarRelatorioMarkdown({ resultado, confusao = [], total, comTipo, geradoEm, janela }) {
  const { fatoresAgrupados, grupos, testes, contrastes } = resultado;
  const l = [
    "# RQ 06 — características do repositório × desempenho DORA",
    "",
    "> Arquivo **gerado** por `npm run analise:rq06`. Não edite à mão.",
    "",
    `- Amostra: **${total} repositórios** (amostra final da S02).`,
    `- Janela: **${janela.inicio} a ${janela.fim}**.`,
    `- Gerado em: ${geradoEm}.`,
    "",
    "Métricas da combinação C1 e a pontuação DORA geral (1 = Low … 4 = Elite).",
    "Testes por postos, sem suposição de normalidade, em duas famílias corrigidas",
    `por **Holm** separadamente (α = ${String(ALFA).replace(".", ",")}):`,
    "",
    "- **omnibus**: Kruskal–Wallis por fator × métrica, efeito ε² (< 0,01",
    "  desprezível, < 0,08 pequeno, < 0,26 médio, ≥ 0,26 grande);",
    "- **contrastes planejados** a partir da H6: Mann–Whitney Q4 × Q1 nos fatores",
    "  por quartis e cada linguagem de publicação automatizada × C/C++ na",
    "  frequência; efeito = delta de Cliff (|δ| < 0,147 desprezível, < 0,33",
    "  pequeno, < 0,474 médio, ≥ 0,474 grande).",
    "",
    "### Grupos",
    "",
    `- Linguagem: C e C++ juntas; linguagens com menos de ${MINIMO_POR_LINGUAGEM} repositórios em "Outras".`,
    ...descreverCortes(fatoresAgrupados),
  ];
  if (comTipo === 0) {
    l.push("- **Tipo do projeto: pendente.** Ainda não há consenso da validação manual (`processed/consenso.csv`); rode `npm run validacao` e depois esta etapa.");
  } else {
    l.push(`- Tipo do projeto: consenso da amostra-ouro, ${comTipo} repositórios; tipos com menos de ${MINIMO_POR_TIPO} em "outro".`);
  }

  l.push(
    "",
    "## Kruskal–Wallis (omnibus)",
    "",
    "| Fator | Métrica | n | H | gl | p | p (Holm) | ε² | Melhor grupo (mediana) |",
    "|---|---|---|---|---|---|---|---|---|"
  );
  for (const t of testes) {
    const sig = t.significativo_holm ? "**" : "";
    l.push(
      `| ${rotuloFator(t.fator)} | ${rotuloMetrica(t.metrica)} | ${t.n} | ${virgula(t.h, 2)} | ${t.gl} | ${formatarP(t.p)} | ` +
        `${sig}${formatarP(t.p_holm)}${sig} | ${virgula(t.epsilon2)} (${t.magnitude ?? "—"}) | ${t.melhor_grupo ?? "—"} |`
    );
  }

  l.push(
    "",
    "## Contrastes planejados (Mann–Whitney)",
    "",
    "δ > 0: o grupo A tende a ter valores **maiores** que o B. *Favorece*: o grupo",
    "com desempenho melhor, já considerando se a métrica é melhor quando maior ou",
    "menor. *H6*: resultado frente à expectativa da hipótese, quando havia uma.",
    "",
    "| Fator | Métrica | A × B | n (A/B) | Mediana A | Mediana B | p (Holm) | δ de Cliff | Favorece | H6 |",
    "|---|---|---|---|---|---|---|---|---|---|"
  );
  const textoHipotese = { confirmada: "confirmada", contrariada: "**contrariada**", nao_confirmada: "não confirmada" };
  for (const c of contrastes) {
    const sig = c.significativo_holm ? "**" : "";
    l.push(
      `| ${rotuloFator(c.fator)} | ${rotuloMetrica(c.metrica)} | ${c.grupo_a} × ${c.grupo_b} | ${c.n_a}/${c.n_b} | ` +
        `${virgula(c.mediana_a)} | ${virgula(c.mediana_b)} | ${sig}${formatarP(c.p_holm)}${sig} | ` +
        `${virgula(c.delta)} (${c.magnitude ?? "—"}) | ${c.favorece ?? "—"} | ${c.hipotese ? textoHipotese[c.hipotese] : "—"} |`
    );
  }

  l.push("", "## Mediana (IQR) por grupo", "");
  for (const fator of FATORES) {
    const agrupado = fatoresAgrupados.get(fator.id);
    if (!agrupado) continue;
    l.push(`### ${fator.rotulo}`, "", `| Grupo | n | ${METRICAS.map((m) => `${m.rotulo} (${m.unidade})`).join(" | ")} |`, `|---|---|${METRICAS.map(() => "---").join("|")}|`);
    for (const g of agrupado.ordem) {
      const celulas = METRICAS.map((m) => {
        const linha = grupos.find((x) => x.fator === fator.id && x.grupo === g && x.metrica === m.coluna);
        return linha.n === 0 ? "—" : `${virgula(linha.mediana)} (${virgula(linha.q1)}–${virgula(linha.q3)})`;
      });
      const n = agrupado.grupos.filter((x) => x === g).length;
      l.push(`| ${g} | ${n} | ${celulas.join(" | ")} |`);
    }
    l.push("");
  }

  if (confusao.length > 0) {
    const nomeColuna = (c) => FATORES_NUMERICOS.find((f) => f.coluna === c)?.rotulo ?? rotuloMetrica(c);
    l.push(
      "## Exploratória: contribuidores × idade",
      "",
      "Fora das famílias de Holm; serve para interpretar os testes acima. Fatores",
      "correlacionados entre si podem levar o efeito um do outro: o ρ parcial",
      "mede a associação de um fator com a métrica **mantida a idade (ou os",
      "contribuidores) constante**.",
      "",
      "| Fatores | n | ρ | p |",
      "|---|---|---|---|"
    );
    for (const c of confusao.filter((x) => x.tipo === "entre_fatores")) {
      l.push(`| ${nomeColuna(c.x)} × ${nomeColuna(c.y)} | ${c.n} | ${virgula(c.rho)} | ${formatarP(c.p)} |`);
    }
    l.push("", "| Métrica | Fator | ρ simples | ρ parcial (controlando o outro) | p (parcial) |", "|---|---|---|---|---|");
    for (const m of METRICAS) {
      for (const fator of ["contributors", "age_years"]) {
        const simples = confusao.find((x) => x.tipo === "simples" && x.x === fator && x.y === m.coluna);
        const parcial = confusao.find((x) => x.tipo === "parcial" && x.x === fator && x.y === m.coluna);
        l.push(`| ${m.rotulo} | ${nomeColuna(fator)} | ${virgula(simples.rho)} | ${virgula(parcial.rho)} | ${formatarP(parcial.p)} |`);
      }
    }
    l.push("");
  }

  l.push(
    "## Como refazer",
    "",
    "```bash",
    "cd Lab3/Sprint01",
    "npm run analise:rq06",
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
    consenso: join(dirSaida, "processed", "consenso.csv"),
    testes: join(dirSaida, "processed", "analise_rq06_testes.csv"),
    contrastes: join(dirSaida, "processed", "analise_rq06_contrastes.csv"),
    grupos: join(dirSaida, "processed", "analise_rq06_grupos.csv"),
    confusao: join(dirSaida, "processed", "analise_rq06_confusao.csv"),
    relatorio: join(dirSaida, "..", "docs", "analise-rq06.md"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

const csv = (colunas, linhas) => gerarCSV(colunas, linhas.map((r) => colunas.map((c) => r[c] ?? "")));

export async function executarRQ06({ config, log = logSilencioso, agora = () => new Date() }) {
  const caminhos = caminhosDeSaida(config.diretorios.saida);
  const dataset = lerDataset(caminhos.dataset);
  if (dataset.length === 0) log.aviso("dataset.csv nao tem nenhum repositorio: a RQ 06 sai vazia");

  const tipos = tiposPorConsenso(lerTabelaCSV(caminhos.consenso)?.registros);
  const repositorios = prepararRepositorios(dataset, tipos);
  const comTipo = repositorios.filter((r) => r.tipo_do_projeto !== null).length;
  if (comTipo === 0) log.aviso("sem consenso de tipo do projeto (processed/consenso.csv): o fator fica de fora - rode \"npm run validacao\"");

  const resultado = analisar(repositorios);
  const confusao = analisarConfusao(repositorios);
  escrever(caminhos.testes, csv(COLUNAS_TESTES, resultado.testes));
  escrever(caminhos.contrastes, csv(COLUNAS_CONTRASTES, resultado.contrastes));
  escrever(caminhos.grupos, csv(COLUNAS_GRUPOS, resultado.grupos));
  escrever(caminhos.confusao, csv(COLUNAS_CONFUSAO, confusao));
  escrever(
    caminhos.relatorio,
    gerarRelatorioMarkdown({ resultado, confusao, total: repositorios.length, comTipo, geradoEm: agora().toISOString(), janela: config.janela })
  );

  const significativos = resultado.testes.filter((t) => t.significativo_holm);
  log.info(`RQ 06: ${resultado.testes.length} testes de Kruskal-Wallis, ${significativos.length} significativos apos Holm`);
  for (const t of significativos) {
    log.info(`  ${t.fator} x ${t.metrica}: H=${t.h} p_holm=${t.p_holm} epsilon2=${t.epsilon2} (${t.magnitude}), melhor ${t.melhor_grupo}`);
  }
  const contrastesSig = resultado.contrastes.filter((c) => c.significativo_holm);
  log.info(`RQ 06: ${resultado.contrastes.length} contrastes planejados, ${contrastesSig.length} significativos apos Holm`);
  for (const c of contrastesSig) {
    log.info(`  ${c.fator} ${c.grupo_a} x ${c.grupo_b} em ${c.metrica}: delta=${c.delta} (${c.magnitude}) p_holm=${c.p_holm} favorece ${c.favorece}`);
  }
  log.info(`saidas: ${caminhos.testes}, ${caminhos.contrastes}, ${caminhos.grupos}, ${caminhos.confusao}, ${caminhos.relatorio}`);
  return { ...resultado, confusao, caminhos };
}
