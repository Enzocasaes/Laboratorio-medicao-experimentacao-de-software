// Lab02 - Passo 6: Dashboard de Visualizacao.
//
// Le data/trials.csv + data/metricas.csv (o mesmo par que o Passo 4 usa) e
// gera um dashboard HTML autocontido (SVG inline, sem dependencias - mesma
// filosofia zero-dependencia do resto do instrumental) comparando com-ia vs
// sem-ia em: tempo (RQ1), taxa de sucesso (RQ2), complexidade e duplicacao
// (RQ3a/RQ3b), LOC (controle) e indice de manutenibilidade (exploratorio).
//
// Uso:
//   node src/dashboard.js                  -> dashboard/index.html
//   node src/dashboard.js --dados <dir>     -> outro diretorio de dados
//   node src/dashboard.js --saida <arquivo>

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarTrials, montarParesPorKata } from "./analise.js";
import { calcularMediana, calcularQuartis, detectarOutliers } from "./estatisticas.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_DADOS_PADRAO = process.env.LAB02_DATA_DIR || join(AQUI, "..", "data");

// paleta categorica validada (dataviz skill): slot 1 azul = com-ia, slot 2
// laranja = sem-ia, ordem fixa - nunca trocar por kata/metrica.
const COR_COM_IA = "#2a78d6";
const COR_SEM_IA = "#eb6834";
const COR_PENDENTE = "#898781"; // muted ink - kata sem par fechado ainda

const METRICAS = [
  {
    campo: "duracao_segundos", rq: "RQ1", titulo: "Tempo ate verde (time-to-green)",
    direcaoBoa: "menor", formatar: formatarSegundos,
  },
  {
    campo: "taxa_sucesso", rq: "RQ2", titulo: "Taxa de sucesso dos testes de aceitacao",
    direcaoBoa: "maior", escala: (v) => v * 100, formatar: (v) => `${v.toFixed(0)}%`,
  },
  {
    campo: "complexidade_ciclomatica_media", rq: "RQ3a", titulo: "Complexidade ciclomatica media / funcao (McCabe)",
    direcaoBoa: null, formatar: (v) => v.toFixed(2),
  },
  {
    campo: "duplicacao_percentual", rq: "RQ3b", titulo: "Duplicacao de codigo (% de linhas)",
    direcaoBoa: null, formatar: (v) => `${v.toFixed(1)}%`,
  },
  {
    campo: "loc", rq: "RQ3 (controle)", titulo: "LOC (linhas de codigo)",
    direcaoBoa: null, formatar: (v) => `${Math.round(v)}`,
  },
  {
    campo: "indice_manutenibilidade", rq: "RQ3 (exploratorio)", titulo: "Indice de Manutenibilidade (MI)",
    direcaoBoa: "maior", formatar: (v) => v.toFixed(1),
  },
];

// -------------------------------------------------------------- formatacao

function formatarSegundos(s) {
  const total = Math.round(s);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

function escaparHTML(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// -------------------------------------------------------------- geometria

// Bins as posicoes-y proximas para espalhar pontos que colidiriam (beeswarm
// simplificado - suficiente para N=6 por grupo).
function escalaLinear(dominio, imagem) {
  const [d0, d1] = dominio;
  const [i0, i1] = imagem;
  if (d1 === d0) return () => (i0 + i1) / 2;
  return (v) => i0 + ((v - d0) / (d1 - d0)) * (i1 - i0);
}

// path de uma barra com cantos arredondados so' no topo (base quadrada, encostada
// no eixo) - "4px rounded data-end, square at the baseline" (mark spec).
function barraArredondada(x, largura, yTopo, yBase, raio) {
  if (yBase - yTopo <= 0.5) return "";
  const r = Math.min(raio, largura / 2, yBase - yTopo);
  const x0 = x, x1 = x + largura;
  return `M ${x0.toFixed(1)} ${yBase.toFixed(1)} L ${x0.toFixed(1)} ${(yTopo + r).toFixed(1)} ` +
    `Q ${x0.toFixed(1)} ${yTopo.toFixed(1)} ${(x0 + r).toFixed(1)} ${yTopo.toFixed(1)} ` +
    `L ${(x1 - r).toFixed(1)} ${yTopo.toFixed(1)} Q ${x1.toFixed(1)} ${yTopo.toFixed(1)} ${x1.toFixed(1)} ${(yTopo + r).toFixed(1)} ` +
    `L ${x1.toFixed(1)} ${yBase.toFixed(1)} Z`;
}

function ticksNicos(min, max, alvo = 4) {
  if (min === max) return [min];
  const bruto = (max - min) / alvo;
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const candidatos = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  const passo = candidatos.find((c) => (max - min) / c <= alvo) ?? candidatos.at(-1);
  const inicio = Math.ceil(min / passo) * passo;
  const ticks = [];
  for (let v = inicio; v <= max + 1e-9; v += passo) ticks.push(Number(v.toFixed(6)));
  if (ticks.length === 0 || ticks[0] > min) ticks.unshift(Number(min.toFixed(6)));
  return ticks;
}

// -------------------------------------------------------------- grafico: barras (mediana + IQR) por tratamento

function graficoBarras(metrica, valoresComIA, valoresSemIA) {
  const L = 420, ALT = 260;
  const MARGEM = { topo: 30, base: 40, esq: 48, dir: 20 };
  const plotX0 = MARGEM.esq, plotX1 = L - MARGEM.dir;
  const plotY0 = MARGEM.topo, plotY1 = ALT - MARGEM.base;

  const escala = metrica.escala ?? ((v) => v);
  const comIA = valoresComIA.map(escala);
  const semIA = valoresSemIA.map(escala);
  const todos = [...comIA, ...semIA];

  const vMax = todos.length ? Math.max(...todos) : 1;
  const dominioMax = Math.max(vMax * 1.2, vMax === 0 ? 1 : vMax * 1.2, 1e-9);
  const y = escalaLinear([0, dominioMax], [plotY1, plotY0]);

  const ticks = ticksNicos(0, dominioMax);
  const svgTicks = ticks.map((t) => {
    const yy = y(t);
    return `<line x1="${plotX0}" x2="${plotX1}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>` +
      `<text x="${plotX0 - 6}" y="${yy.toFixed(1)}" text-anchor="end" dominant-baseline="middle" class="tick">${escaparHTML(metrica.formatar(t))}</text>`;
  }).join("");

  const centroComIA = plotX0 + (plotX1 - plotX0) * 0.28;
  const centroSemIA = plotX0 + (plotX1 - plotX0) * 0.72;
  const larguraBarra = 64;
  const yBase = y(0);

  function barra(centro, valores, cor, rotulo) {
    const x0 = centro - larguraBarra / 2;
    if (valores.length === 0) {
      return `<text x="${centro}" y="${(plotY0 + plotY1) / 2}" text-anchor="middle" class="tick">sem dados</text>` +
        `<text x="${centro}" y="${plotY1 + 20}" text-anchor="middle" class="tick-x">${rotulo}</text>`;
    }
    const { q1, q3 } = calcularQuartis(valores);
    const mediana = calcularMediana(valores);
    const yTopo = y(mediana);

    const temVariacao = q3 - q1 > (dominioMax * 0.002);
    const yQ1 = y(q1), yQ3 = y(q3);
    const capLargura = 12;
    const whisker = temVariacao ? `
      <line x1="${centro}" x2="${centro}" y1="${yQ1.toFixed(1)}" y2="${yQ3.toFixed(1)}" stroke="var(--surface)" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="${(centro - capLargura / 2).toFixed(1)}" x2="${(centro + capLargura / 2).toFixed(1)}" y1="${yQ1.toFixed(1)}" y2="${yQ1.toFixed(1)}" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/>
      <line x1="${(centro - capLargura / 2).toFixed(1)}" x2="${(centro + capLargura / 2).toFixed(1)}" y1="${yQ3.toFixed(1)}" y2="${yQ3.toFixed(1)}" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/>
    ` : "";

    return `
      <path d="${barraArredondada(x0, larguraBarra, yTopo, yBase, 4)}" fill="${cor}"><title>${rotulo}: mediana ${escaparHTML(metrica.formatar(mediana))} (IQR ${escaparHTML(metrica.formatar(q1))}-${escaparHTML(metrica.formatar(q3))}, n=${valores.length})</title></path>
      ${whisker}
      <text x="${centro}" y="${(yTopo - 10).toFixed(1)}" text-anchor="middle" class="rotulo-valor">${escaparHTML(metrica.formatar(mediana))}</text>
      <text x="${centro}" y="${plotY1 + 20}" text-anchor="middle" class="tick-x">${rotulo}</text>
    `;
  }

  return `
    <svg viewBox="0 0 ${L} ${ALT}" role="img" aria-label="${escaparHTML(metrica.titulo)}: com-ia vs sem-ia, barras com mediana e IQR">
      ${svgTicks}
      <line x1="${plotX0}" x2="${plotX1}" y1="${yBase.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="var(--axis)" stroke-width="1"/>
      ${barra(centroComIA, comIA, COR_COM_IA, "com-ia")}
      ${barra(centroSemIA, semIA, COR_SEM_IA, "sem-ia")}
    </svg>
  `;
}

// -------------------------------------------------------------- grafico: pequenos multiplos de barras por kata (tempo, pareado)

function graficoBarrasPorKata(paresPorKata) {
  const COLUNAS = 3;
  const facetW = 195, facetH = 172, gapX = 14, gapY = 8;
  const linhas = Math.ceil(paresPorKata.length / COLUNAS);
  const L = COLUNAS * facetW + (COLUNAS - 1) * gapX;
  const ALT = linhas * facetH + (linhas - 1) * gapY;

  const larguraBarra = 42;
  const raioTopo = 4;

  const facetas = paresPorKata.map((p, i) => {
    const col = i % COLUNAS, linha = Math.floor(i / COLUNAS);
    const x0 = col * (facetW + gapX), y0 = linha * (facetH + gapY);

    const plotY0 = y0 + 30, plotY1 = y0 + facetH - 26;
    const centroComIA = x0 + facetW * 0.34, centroSemIA = x0 + facetW * 0.68;

    const disponiveis = [p.xComIA, p.xSemIA].filter((v) => v !== null);
    const dominioMax = disponiveis.length ? Math.max(...disponiveis) * (disponiveis.length === 1 ? 1.35 : 1.2) : 1;
    const y = escalaLinear([0, dominioMax], [plotY1, plotY0]);
    const yBase = y(0);

    function barraOuPendente(centro, valor, cor, rotulo) {
      if (valor === null) {
        return `
          <line x1="${(centro - larguraBarra / 2).toFixed(1)}" x2="${(centro + larguraBarra / 2).toFixed(1)}" y1="${yBase.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="var(--muted)" stroke-width="2" stroke-dasharray="2 3"/>
          <text x="${centro.toFixed(1)}" y="${(yBase - 8).toFixed(1)}" text-anchor="middle" class="tick pendente">pendente</text>
          <text x="${centro.toFixed(1)}" y="${(plotY1 + 16).toFixed(1)}" text-anchor="middle" class="tick-x">${rotulo}</text>
        `;
      }
      const yTopo = y(valor);
      return `
        <path d="${barraArredondada(centro - larguraBarra / 2, larguraBarra, yTopo, yBase, raioTopo)}" fill="${cor}"><title>${rotulo}: ${escaparHTML(formatarSegundos(valor))}</title></path>
        <text x="${centro.toFixed(1)}" y="${(yTopo - 7).toFixed(1)}" text-anchor="middle" class="rotulo-valor">${escaparHTML(formatarSegundos(valor))}</text>
        <text x="${centro.toFixed(1)}" y="${(plotY1 + 16).toFixed(1)}" text-anchor="middle" class="tick-x">${rotulo}</text>
      `;
    }

    return `
      <text x="${(x0 + facetW / 2).toFixed(1)}" y="${(y0 + 14).toFixed(1)}" text-anchor="middle" class="tick-x">${escaparHTML(p.kata)}</text>
      <line x1="${(x0 + 10).toFixed(1)}" x2="${(x0 + facetW - 10).toFixed(1)}" y1="${yBase.toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="var(--axis)" stroke-width="1"/>
      ${barraOuPendente(centroComIA, p.xComIA, COR_COM_IA, "com-ia")}
      ${barraOuPendente(centroSemIA, p.xSemIA, COR_SEM_IA, "sem-ia")}
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${L} ${ALT}" role="img" aria-label="Tempo ate verde por kata, com-ia vs sem-ia (pareado)">
      ${facetas}
    </svg>
  `;
}

// -------------------------------------------------------------- tabela de dados

function tabelaDados(trials) {
  const colunas = ["trial_id", "participante", "kata", "tratamento", "ordem", "duracao_hms", "sucesso", "testes_passando", "testes_total", "complexidade_ciclomatica_media", "duplicacao_percentual", "loc", "indice_manutenibilidade"];
  const cabecalho = colunas.map((c) => `<th>${escaparHTML(c)}</th>`).join("");
  const linhas = [...trials].sort((a, b) => a.participante.localeCompare(b.participante) || Number(a.ordem) - Number(b.ordem))
    .map((t) => `<tr>${colunas.map((c) => `<td>${escaparHTML(t[c] ?? "")}</td>`).join("")}</tr>`).join("");
  return `<table><caption>Todos os trials coletados (dado bruto por tras dos graficos)</caption><thead><tr>${cabecalho}</tr></thead><tbody>${linhas}</tbody></table>`;
}

// -------------------------------------------------------------- montagem do HTML

function montarHTML(trials) {
  const participantes = [...new Set(trials.map((t) => t.participante))].sort();
  const katas = [...new Set(trials.map((t) => t.kata))].sort();

  const cartoes = METRICAS.map((m) => {
    const comIA = trials.filter((t) => t.tratamento === "com-ia" && t[m.campo] !== undefined && t[m.campo] !== "").map((t) => Number(t[m.campo]));
    const semIA = trials.filter((t) => t.tratamento === "sem-ia" && t[m.campo] !== undefined && t[m.campo] !== "").map((t) => Number(t[m.campo]));
    if (comIA.length === 0 && semIA.length === 0) return "";
    const direcao = m.direcaoBoa === "menor" ? "menor e melhor" : m.direcaoBoa === "maior" ? "maior e melhor" : "sem direcao esperada";
    return `
      <section class="cartao">
        <h3>${escaparHTML(m.titulo)} <span class="rq">${escaparHTML(m.rq)}</span></h3>
        <p class="legenda-direcao">${escaparHTML(direcao)} · n=${comIA.length} com-ia, ${semIA.length} sem-ia</p>
        ${graficoBarras(m, comIA, semIA)}
      </section>
    `;
  }).join("");

  const paresTempo = paresPorKataCompletosEIncompletos(trials, "duracao_segundos");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lab02 - Dashboard IA vs. codificacao manual</title>
<style>
  :root {
    color-scheme: light;
    --surface: #fcfcfb; --plano: #f3f2ee; --texto: #0b0b0b; --texto-2: #52514e;
    --muted: #898781; --grid: #e7e6e0; --axis: #c3c2b7; --borda: rgba(11,11,11,0.09);
    --sombra: 0 1px 2px rgba(11,11,11,0.04), 0 8px 24px -12px rgba(11,11,11,0.12);
    --sombra-hover: 0 1px 2px rgba(11,11,11,0.05), 0 16px 32px -14px rgba(11,11,11,0.18);
    --aviso: #fab219; --aviso-fundo: #fff8e8;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --surface: #1e1e1d; --plano: #101010; --texto: #ffffff; --texto-2: #c3c2b7;
      --muted: #8f8d86; --grid: #2f2f2d; --axis: #45443f; --borda: rgba(255,255,255,0.09);
      --sombra: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5);
      --sombra-hover: 0 1px 2px rgba(0,0,0,0.35), 0 16px 32px -14px rgba(0,0,0,0.6);
      --aviso: #c98500; --aviso-fundo: #2a2114;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface: #1e1e1d; --plano: #101010; --texto: #ffffff; --texto-2: #c3c2b7;
    --muted: #8f8d86; --grid: #2f2f2d; --axis: #45443f; --borda: rgba(255,255,255,0.09);
    --sombra: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5);
    --sombra-hover: 0 1px 2px rgba(0,0,0,0.35), 0 16px 32px -14px rgba(0,0,0,0.6);
    --aviso: #c98500; --aviso-fundo: #2a2114;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0; padding: 0 20px 72px; background: var(--plano); color: var(--texto);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.45;
    background-image:
      linear-gradient(90deg, ${COR_COM_IA}, ${COR_SEM_IA});
    background-repeat: no-repeat;
    background-size: 100% 5px;
  }
  .container { max-width: 1180px; margin: 0 auto; padding-top: 32px; }
  header.topo { margin-bottom: 28px; }
  .overline { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
  h1 { font-size: 1.85rem; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.01em; }
  h2 { font-size: 1.15rem; font-weight: 700; margin: 40px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--grid); }
  h3 { font-size: 0.97rem; font-weight: 600; margin: 0 0 2px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .rq { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em; color: var(--muted); background: var(--plano); border: 1px solid var(--borda); border-radius: 999px; padding: 1px 8px; }
  p.subtitulo { color: var(--texto-2); margin: 0; max-width: 72ch; font-size: 0.96rem; }
  p.aviso {
    display: flex; gap: 10px; align-items: flex-start;
    background: var(--aviso-fundo); border: 1px solid var(--borda); border-left: 4px solid var(--aviso);
    border-radius: 10px; padding: 12px 16px; color: var(--texto-2); max-width: 78ch; font-size: 0.88rem;
    margin: 20px 0 0;
  }
  svg.icone-aviso { width: 18px; height: 18px; flex: none; margin-top: 2px; }
  p.aviso strong { color: var(--texto); }
  p.aviso code { background: var(--surface); border: 1px solid var(--borda); border-radius: 4px; padding: 1px 5px; font-size: 0.85em; }
  .legenda-topo { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 20px 0 0; }
  .chip {
    display: inline-flex; align-items: center; gap: 7px; font-size: 0.82rem; color: var(--texto-2);
    background: var(--surface); border: 1px solid var(--borda); border-radius: 999px; padding: 5px 12px 5px 10px;
  }
  .chip .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; }
  .cartao {
    background: var(--surface); border: 1px solid var(--borda); border-radius: 14px; padding: 18px 20px 14px;
    box-shadow: var(--sombra); transition: box-shadow .18s ease, transform .18s ease;
  }
  .cartao:hover { box-shadow: var(--sombra-hover); transform: translateY(-1px); }
  .legenda-direcao { color: var(--muted); font-size: 0.78rem; margin: 2px 0 10px; }
  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .tick { fill: var(--muted); font-size: 10.5px; }
  .tick-x { fill: var(--texto-2); font-size: 12px; font-weight: 600; }
  .tick.pendente { fill: var(--muted); font-style: italic; font-size: 11px; }
  .rotulo-valor { font-size: 12.5px; font-weight: 700; fill: var(--texto); }
  table { border-collapse: collapse; width: 100%; font-size: 0.8rem; margin-top: 4px; }
  caption { text-align: left; color: var(--texto-2); font-size: 0.85rem; margin-bottom: 8px; }
  th, td { border-bottom: 1px solid var(--grid); padding: 7px 10px; text-align: left; white-space: nowrap; }
  th { color: var(--muted); font-weight: 700; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; position: sticky; top: 0; background: var(--surface); }
  tbody tr:nth-child(even) { background: color-mix(in srgb, var(--plano) 55%, var(--surface)); }
  tbody tr:hover { background: var(--plano); }
  details { margin-top: 40px; }
  details section.cartao { margin-top: 12px; padding: 16px 18px; }
  summary { cursor: pointer; color: var(--texto-2); font-weight: 600; font-size: 0.9rem; padding: 4px 0; }
  summary:hover { color: var(--texto); }
  .rolagem { overflow-x: auto; }
  footer.rodape { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--grid); color: var(--muted); font-size: 0.78rem; }
</style>
</head>
<body>
<div class="container">
  <header class="topo">
    <p class="overline">Lab02 · Passo 6</p>
    <h1>Dashboard de visualização — IA vs. codificação manual</h1>
    <p class="subtitulo">${trials.length} trials coletados · participantes: ${escaparHTML(participantes.join(", ") || "-")} · katas: ${escaparHTML(katas.join(", ") || "-")}.</p>

    ${avisoDadosParciais(participantes, paresTempo)}

    <div class="legenda-topo">
      <span class="chip"><span class="swatch" style="background:${COR_COM_IA}"></span>com-ia</span>
      <span class="chip"><span class="swatch" style="background:${COR_SEM_IA}"></span>sem-ia</span>
      <span class="chip"><span class="swatch" style="background:${COR_PENDENTE}; opacity:.55"></span>par pendente (falta o outro tratamento naquele kata)</span>
    </div>
  </header>

  <h2>Comparação por tratamento (RQ1–RQ3)</h2>
  <div class="grade">
    ${cartoes}
  </div>

  <h2>Tempo até verde por kata, pareado (unidade de análise do Passo 4)</h2>
  <section class="cartao">
    <div class="rolagem">${graficoBarrasPorKata(paresTempo)}</div>
  </section>

  <details>
    <summary>Ver tabela de dados bruta</summary>
    <section class="cartao">
      <div class="rolagem">${tabelaDados(trials)}</div>
    </section>
  </details>

  <footer class="rodape">Gerado por <code>npm run dashboard</code> (src/dashboard.js) a partir de data/trials.csv + data/metricas.csv — regenere sempre que a coleta mudar.</footer>
</div>
</body>
</html>`;
}

function paresPorKataCompletosEIncompletos(trials, campo) {
  const { pares, incompletos } = montarParesPorKata(trials, campo);
  const porKata = new Map();
  for (const p of pares) porKata.set(p.kata, { kata: p.kata, xComIA: p.xComIA, xSemIA: p.xSemIA });
  for (const inc of incompletos) {
    const doKata = trials.filter((t) => t.kata === inc.kata);
    const comIA = doKata.filter((t) => t.tratamento === "com-ia").map((t) => Number(t[campo])).filter((v) => Number.isFinite(v));
    const semIA = doKata.filter((t) => t.tratamento === "sem-ia").map((t) => Number(t[campo])).filter((v) => Number.isFinite(v));
    porKata.set(inc.kata, {
      kata: inc.kata,
      xComIA: comIA.length ? calcularMediana(comIA) : null,
      xSemIA: semIA.length ? calcularMediana(semIA) : null,
    });
  }
  return [...porKata.values()].sort((a, b) => a.kata.localeCompare(b.kata));
}

function avisoDadosParciais(participantes, paresTempo) {
  const pendentes = paresTempo.filter((p) => p.xComIA === null || p.xSemIA === null);
  if (participantes.length >= 3 && pendentes.length === 0) return "";
  const faltandoKatas = pendentes.map((p) => p.kata).join(", ");
  const icone = `<svg class="icone-aviso" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2 1 18h18L10 2Z" fill="none" stroke="var(--aviso)" stroke-width="1.6" stroke-linejoin="round"/><line x1="10" y1="8" x2="10" y2="12" stroke="var(--aviso)" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="15" r="1" fill="var(--aviso)"/></svg>`;
  return `<p class="aviso">${icone}<span><strong>Dados parciais:</strong> ${participantes.length} de 3 participantes coletados
    (matriz completa = P1 Enzo, P2 Cauê, P3 Leonardo). ${pendentes.length
      ? `Os katas ${escaparHTML(faltandoKatas)} ainda não têm os dois tratamentos fechados — não entram no par tempo × kata abaixo.`
      : ""}
    Os gráficos abaixo são descritivos (mediana/IQR); a leitura inferencial (Wilcoxon + Holm) fica para quando a coleta fechar
    (ver <code>npm run analise</code>).</span></p>`;
}

// -------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const opcoes = { dirDados: DIR_DADOS_PADRAO, arqSaida: join(AQUI, "..", "dashboard", "index.html") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dados") opcoes.dirDados = argv[++i];
    else if (argv[i] === "--saida") opcoes.arqSaida = argv[++i];
  }
  return opcoes;
}

function main(argv) {
  const opcoes = parseArgs(argv);
  const trials = carregarTrials(opcoes.dirDados);

  if (trials.length === 0) {
    console.log(`nenhum trial encontrado em ${join(opcoes.dirDados, "trials.csv")} - rode os trials antes.`);
    return 1;
  }

  const html = montarHTML(trials);
  mkdirSync(dirname(opcoes.arqSaida), { recursive: true });
  writeFileSync(opcoes.arqSaida, html);

  console.log(`dashboard gerado: ${opcoes.arqSaida}`);
  console.log(`  ${trials.length} trials | participantes: ${[...new Set(trials.map((t) => t.participante))].sort().join(", ")}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
