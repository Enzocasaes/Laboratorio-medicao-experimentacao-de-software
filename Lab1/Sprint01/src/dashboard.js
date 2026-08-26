import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lerCSV } from "./csv.js";
import { calcularMediana, contarPorCategoria } from "./estatisticas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_DADOS = path.join(__dirname, "..", "data");
const ARQUIVO_SAIDA = path.join(__dirname, "..", "dashboard.html");

// Uma entrada por RQ: onde ler, que coluna(s) usar e como mostrar.
// O painel só inclui a seção de uma RQ se o CSV correspondente existir em data/.
const CONFIG_RQS = [
  {
    chave: "rq01",
    arquivo: "rq01Validation.csv",
    titulo: "RQ01 — Idade dos repositórios",
    pergunta: "Sistemas populares são maduros/antigos?",
    tipo: "histograma",
    coluna: "idade_anos",
    unidade: "anos",
    casasDecimais: 1,
  },
  {
    chave: "rq02",
    arquivo: "rq02Validation.csv",
    titulo: "RQ02 — Pull requests aceitas",
    pergunta: "Recebem muita contribuição externa?",
    tipo: "histograma",
    coluna: "pull_requests_aceitas",
    unidade: "PRs",
    casasDecimais: 0,
  },
  {
    chave: "rq03",
    arquivo: "rq03Validation.csv",
    titulo: "RQ03 — Total de releases",
    pergunta: "Lançam releases com frequência?",
    tipo: "histograma",
    coluna: "total_releases",
    unidade: "releases",
    casasDecimais: 0,
  },
  {
    chave: "rq04",
    arquivo: "rq04Validation.csv",
    titulo: "RQ04 — Dias desde a última atualização",
    pergunta: "São atualizados com frequência?",
    tipo: "histograma",
    coluna: "dias_desde_atualizacao",
    unidade: "dias",
    casasDecimais: 0,
  },
  {
    chave: "rq05",
    arquivo: "rq05Validation.csv",
    titulo: "RQ05 — Linguagem primária",
    pergunta: "Usam as linguagens mais populares?",
    tipo: "categorico",
    coluna: "linguagem_primaria",
  },
  {
    chave: "rq06",
    arquivo: "rq06Validation.csv",
    titulo: "RQ06 — Percentual de issues fechadas",
    pergunta: "Têm alto percentual de issues fechadas?",
    tipo: "histograma",
    coluna: "razao_fechadas",
    unidade: "%",
    casasDecimais: 0,
    escala100: true,
  },
  {
    chave: "rq07",
    arquivo: "rq07PorLinguagem.csv",
    titulo: "RQ07 — Métricas por linguagem",
    pergunta: "Como as métricas variam por linguagem?",
    tipo: "tabela",
  },
];

function principal() {
  const secoes = CONFIG_RQS.map(construirSecao).filter(Boolean);

  if (secoes.length === 0) {
    console.error(
      "Nenhum CSV encontrado em data/. Rode 'npm run minerar:todas' (ou uma RQ específica) antes de gerar o painel."
    );
    process.exitCode = 1;
    return;
  }

  const html = montarHTML(secoes);
  fs.writeFileSync(ARQUIVO_SAIDA, html, "utf-8");
  console.log(`Painel gerado em ${path.relative(process.cwd(), ARQUIVO_SAIDA)} (${secoes.length} RQ(s)).`);
  console.log("Abra o arquivo direto no navegador (duplo clique) — não precisa de servidor.");
}

function construirSecao(config) {
  const caminho = path.join(DIR_DADOS, config.arquivo);
  if (!fs.existsSync(caminho)) return null;

  const texto = fs.readFileSync(caminho, "utf-8");
  const { cabecalho, linhas } = lerCSV(texto);
  if (linhas.length === 0) return null;

  const indice = (nome) => cabecalho.indexOf(nome);

  if (config.tipo === "histograma") {
    const col = indice(config.coluna);
    let valores = linhas
      .map((linha) => Number(linha[col]))
      .filter((valor) => Number.isFinite(valor));
    if (config.escala100) valores = valores.map((v) => v * 100);

    return {
      chave: config.chave,
      titulo: config.titulo,
      pergunta: config.pergunta,
      tipo: "histograma",
      unidade: config.unidade,
      casasDecimais: config.casasDecimais,
      ...construirHistograma(valores, config.casasDecimais),
    };
  }

  if (config.tipo === "categorico") {
    const col = indice(config.coluna);
    const valores = linhas.map((linha) => linha[col] || "Sem linguagem");
    return {
      chave: config.chave,
      titulo: config.titulo,
      pergunta: config.pergunta,
      tipo: "categorico",
      ...construirCategorico(valores),
    };
  }

  // tabela: usa o CSV como está, formatando números com 1 casa decimal
  return {
    chave: config.chave,
    titulo: config.titulo,
    pergunta: config.pergunta,
    tipo: "tabela",
    cabecalho,
    linhas: linhas.map((linha) =>
      linha.map((celula) => {
        const numero = Number(celula);
        return Number.isFinite(numero) && celula.trim() !== "" && !/[a-zA-Z]/.test(celula)
          ? formatarNumero(numero, 1)
          : celula;
      })
    ),
  };
}

function construirHistograma(valores, casasDecimais) {
  const total = valores.length;
  const ordenados = [...valores].sort((a, b) => a - b);
  const min = ordenados[0];
  const max = ordenados[ordenados.length - 1];
  const mediana = calcularMediana(valores);

  // Cauda longa (ex.: PRs aceitas, releases): histograma linear deixaria quase
  // tudo numa única barra. Nesses casos, agrupa em escala log10(x+1).
  const usaEscalaLog = max / Math.max(mediana, 1) > 15;

  const NUM_BINS = 12;
  const transformar = usaEscalaLog ? (x) => Math.log10(x + 1) : (x) => x;
  const destransformar = usaEscalaLog ? (y) => 10 ** y - 1 : (y) => y;

  const tMin = transformar(min);
  const tMax = transformar(max);
  const largura = tMax - tMin || 1;

  const contagens = new Array(NUM_BINS).fill(0);
  for (const valor of valores) {
    const t = transformar(valor);
    let indice = Math.floor(((t - tMin) / largura) * NUM_BINS);
    if (indice >= NUM_BINS) indice = NUM_BINS - 1;
    if (indice < 0) indice = 0;
    contagens[indice] += 1;
  }

  const bins = contagens.map((contagem, i) => {
    const de = destransformar(tMin + (largura * i) / NUM_BINS);
    const ate = destransformar(tMin + (largura * (i + 1)) / NUM_BINS);
    return {
      rotulo: `${formatarNumero(de, casasDecimais)}–${formatarNumero(ate, casasDecimais)}`,
      contagem,
    };
  });

  return {
    escalaLog: usaEscalaLog,
    stats: {
      total,
      min: formatarNumero(min, casasDecimais),
      mediana: formatarNumero(mediana, casasDecimais),
      max: formatarNumero(max, casasDecimais),
    },
    bins,
  };
}

function construirCategorico(valores) {
  const total = valores.length;
  const contagemOrdenada = contarPorCategoria(valores); // [[categoria, contagem], ...] desc

  const LIMITE = 8;
  const principais = contagemOrdenada.slice(0, LIMITE);
  const resto = contagemOrdenada.slice(LIMITE);
  const restoTotal = resto.reduce((soma, [, contagem]) => soma + contagem, 0);

  const bins = principais.map(([categoria, contagem]) => ({ rotulo: categoria, contagem }));
  if (restoTotal > 0) bins.push({ rotulo: `Outras (${resto.length})`, contagem: restoTotal });

  return {
    stats: {
      total,
      categorias: contagemOrdenada.length,
    },
    bins,
  };
}

function formatarNumero(numero, casasDecimais = 0) {
  return numero.toLocaleString("pt-BR", {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  });
}

function montarHTML(secoes) {
  const dadosJSON = JSON.stringify(secoes);
  const nav = secoes
    .map((s) => `<a href="#${s.chave}">${s.chave.toUpperCase()}</a>`)
    .join("\n        ");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Painel — Repositórios populares do GitHub</title>
<style>
  .viz-root {
    color-scheme: light;
    --surface-1:      #fcfcfb;
    --page-plane:     #f9f9f7;
    --text-primary:   #0b0b0b;
    --text-secondary: #52514e;
    --text-muted:     #898781;
    --grid:           #e1e0d9;
    --axis:           #c3c2b7;
    --series-1:       #2a78d6;
    --series-1-wash:  rgba(42, 120, 214, 0.12);
    --border:         rgba(11, 11, 11, 0.10);
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1:      #1a1a19;
      --page-plane:     #0d0d0d;
      --text-primary:   #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted:     #898781;
      --grid:           #2c2c2a;
      --axis:           #383835;
      --series-1:       #3987e5;
      --series-1-wash:  rgba(57, 135, 229, 0.16);
      --border:         rgba(255, 255, 255, 0.10);
    }
  }
  :root[data-theme="dark"] .viz-root {
    color-scheme: dark;
    --surface-1:      #1a1a19;
    --page-plane:     #0d0d0d;
    --text-primary:   #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted:     #898781;
    --grid:           #2c2c2a;
    --axis:           #383835;
    --series-1:       #3987e5;
    --series-1-wash:  rgba(57, 135, 229, 0.16);
    --border:         rgba(255, 255, 255, 0.10);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page-plane);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .page { max-width: 960px; margin: 0 auto; padding: 32px 20px 80px; }

  header.top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitulo { color: var(--text-secondary); font-size: 14px; margin: 0; }
  .theme-toggle {
    border: 1px solid var(--border); background: var(--surface-1); color: var(--text-secondary);
    border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer;
  }

  nav.rqs { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 32px; }
  nav.rqs a {
    font-size: 12px; color: var(--text-secondary); text-decoration: none;
    border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px;
  }
  nav.rqs a:hover { color: var(--series-1); border-color: var(--series-1); }

  section.rq {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px;
    padding: 20px 24px 24px; margin-bottom: 20px; scroll-margin-top: 16px;
  }
  section.rq h2 { font-size: 16px; margin: 0 0 2px; }
  section.rq .pergunta { color: var(--text-secondary); font-size: 13px; margin: 0 0 16px; }

  .kpis { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
  .kpi .label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
  .kpi .value { font-size: 20px; font-weight: 600; }

  .chart-head { display: flex; justify-content: space-between; align-items: center; }
  .escala-nota { font-size: 11px; color: var(--text-muted); }
  .view-toggle {
    border: 1px solid var(--border); background: transparent; color: var(--text-secondary);
    border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer;
  }
  .view-toggle:hover { color: var(--series-1); border-color: var(--series-1); }

  svg.chart { width: 100%; height: 220px; overflow: visible; display: block; margin-top: 8px; }
  svg.chart .grid-line { stroke: var(--grid); stroke-width: 1; }
  svg.chart .axis-line { stroke: var(--axis); stroke-width: 1; }
  svg.chart .bar { fill: var(--series-1); }
  svg.chart .hit { fill: transparent; cursor: pointer; }
  svg.chart .hit:hover + .bar, svg.chart .hit:focus + .bar { fill: var(--series-1); opacity: 0.8; }
  svg.chart text { fill: var(--text-muted); font-size: 10px; font-family: inherit; }
  svg.chart text.axis-label-y { fill: var(--text-secondary); }

  .tooltip {
    position: fixed; pointer-events: none; background: var(--text-primary); color: var(--surface-1);
    font-size: 12px; padding: 6px 9px; border-radius: 6px; z-index: 10; opacity: 0; transition: opacity 0.1s;
    white-space: nowrap;
  }
  .tooltip.show { opacity: 1; }
  .tooltip .tt-value { font-weight: 600; }

  table.data-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  table.data-table th, table.data-table td {
    text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--grid);
    font-variant-numeric: tabular-nums;
  }
  table.data-table th { color: var(--text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; }
  table.data-table tbody tr:hover { background: var(--series-1-wash); }
  .table-wrap { max-height: 360px; overflow: auto; }

  footer { color: var(--text-muted); font-size: 12px; margin-top: 24px; }
</style>
</head>
<body>
<div class="viz-root page">
  <header class="top">
    <div>
      <h1>Repositórios populares do GitHub — Lab01</h1>
      <p class="subtitulo">Distribuições calculadas a partir dos CSVs em <code>data/</code>. Gerado por <code>npm run dashboard</code>.</p>
    </div>
    <button class="theme-toggle" id="theme-toggle" type="button">Alternar tema</button>
  </header>

  <nav class="rqs">
        ${nav}
  </nav>

  <main id="secoes"></main>

  <footer>Página estática, sem dependências e sem back-end — os dados ficam embutidos no HTML no momento da geração.</footer>
</div>

<div class="tooltip" id="tooltip"></div>

<script>
const DADOS = ${dadosJSON};
</script>
<script>
(function () {
  "use strict";

  const raizTema = document.documentElement;
  document.getElementById("theme-toggle").addEventListener("click", function () {
    const atual = raizTema.getAttribute("data-theme");
    raizTema.setAttribute("data-theme", atual === "dark" ? "light" : "dark");
  });

  const tooltip = document.getElementById("tooltip");
  function mostrarTooltip(evento, rotulo, valor) {
    tooltip.innerHTML = "";
    const spanValor = document.createElement("span");
    spanValor.className = "tt-value";
    spanValor.textContent = valor;
    tooltip.appendChild(spanValor);
    tooltip.appendChild(document.createTextNode(" — " + rotulo));
    tooltip.classList.add("show");
    posicionarTooltip(evento);
  }
  function posicionarTooltip(evento) {
    const x = evento.clientX ?? (evento.target.getBoundingClientRect().left + 8);
    const y = evento.clientY ?? evento.target.getBoundingClientRect().top;
    tooltip.style.left = x + 12 + "px";
    tooltip.style.top = y + 12 + "px";
  }
  function esconderTooltip() {
    tooltip.classList.remove("show");
  }

  const NS = "http://www.w3.org/2000/svg";
  function criarSVG(nomeTag, atributos) {
    const el = document.createElementNS(NS, nomeTag);
    for (const chave in atributos) el.setAttribute(chave, atributos[chave]);
    return el;
  }

  function desenharBarras(container, bins, formatarValor) {
    const largura = 880;
    const altura = 180;
    const margemBaixo = 26;
    const margemEsq = 4;
    const areaAltura = altura - margemBaixo;

    const svg = criarSVG("svg", {
      class: "chart",
      viewBox: "0 0 " + largura + " " + altura,
      preserveAspectRatio: "none",
      role: "img",
    });

    const maxContagem = Math.max(...bins.map((b) => b.contagem), 1);
    const passosGrade = 4;
    for (let i = 0; i <= passosGrade; i++) {
      const y = areaAltura - (areaAltura * i) / passosGrade;
      svg.appendChild(criarSVG("line", { class: "grid-line", x1: margemEsq, x2: largura, y1: y, y2: y }));
      const rotuloY = Math.round((maxContagem * i) / passosGrade);
      const textoY = criarSVG("text", { class: "axis-label-y", x: 0, y: y - 4 });
      textoY.textContent = rotuloY;
      svg.appendChild(textoY);
    }
    svg.appendChild(criarSVG("line", { class: "axis-line", x1: margemEsq, x2: largura, y1: areaAltura, y2: areaAltura }));

    const n = bins.length;
    const slot = (largura - margemEsq) / n;
    const gap = 2;
    const larguraBarra = Math.max(2, Math.min(24, slot - gap));

    bins.forEach((bin, i) => {
      const centroX = margemEsq + slot * i + slot / 2;
      const x = centroX - larguraBarra / 2;
      const h = maxContagem === 0 ? 0 : (bin.contagem / maxContagem) * areaAltura;
      const y = areaAltura - h;
      const r = Math.min(4, h);

      const path =
        h <= 0
          ? ""
          : "M " + x + " " + (y + r) +
            " Q " + x + " " + y + " " + (x + r) + " " + y +
            " L " + (x + larguraBarra - r) + " " + y +
            " Q " + (x + larguraBarra) + " " + y + " " + (x + larguraBarra) + " " + (y + r) +
            " L " + (x + larguraBarra) + " " + areaAltura +
            " L " + x + " " + areaAltura + " Z";

      if (path) {
        const barra = criarSVG("path", { class: "bar", d: path });
        svg.appendChild(barra);
      }

      const hit = criarSVG("rect", {
        class: "hit",
        x: centroX - slot / 2,
        y: 0,
        width: slot,
        height: altura,
        tabindex: "0",
      });
      hit.addEventListener("pointermove", (ev) => mostrarTooltip(ev, bin.rotulo, formatarValor(bin.contagem)));
      hit.addEventListener("pointerleave", esconderTooltip);
      hit.addEventListener("focus", (ev) => mostrarTooltip(ev, bin.rotulo, formatarValor(bin.contagem)));
      hit.addEventListener("blur", esconderTooltip);
      svg.appendChild(hit);

      // rótulo do eixo X: primeiro, meio e último, para não poluir
      if (i === 0 || i === n - 1 || i === Math.floor(n / 2)) {
        const textoX = criarSVG("text", { x: centroX, y: altura - 6, "text-anchor": "middle" });
        textoX.textContent = bin.rotulo;
        svg.appendChild(textoX);
      }
    });

    container.appendChild(svg);
  }

  function desenharTabela(container, cabecalho, linhas) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const tabela = document.createElement("table");
    tabela.className = "data-table";

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    cabecalho.forEach((titulo) => {
      const th = document.createElement("th");
      th.textContent = titulo;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tabela.appendChild(thead);

    const tbody = document.createElement("tbody");
    linhas.forEach((linha) => {
      const tr = document.createElement("tr");
      linha.forEach((valor) => {
        const td = document.createElement("td");
        td.textContent = valor;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tabela.appendChild(tbody);

    wrap.appendChild(tabela);
    container.appendChild(wrap);
  }

  function criarSecaoHistogramaOuCategorico(rq) {
    const section = document.createElement("section");
    section.className = "rq";
    section.id = rq.chave;

    const h2 = document.createElement("h2");
    h2.textContent = rq.titulo;
    section.appendChild(h2);

    const pergunta = document.createElement("p");
    pergunta.className = "pergunta";
    pergunta.textContent = rq.pergunta;
    section.appendChild(pergunta);

    if (rq.stats) {
      const kpis = document.createElement("div");
      kpis.className = "kpis";
      const entradas =
        rq.tipo === "histograma"
          ? [
              ["Repositórios", rq.stats.total],
              ["Mínimo", rq.stats.min + (rq.unidade ? " " + rq.unidade : "")],
              ["Mediana", rq.stats.mediana + (rq.unidade ? " " + rq.unidade : "")],
              ["Máximo", rq.stats.max + (rq.unidade ? " " + rq.unidade : "")],
            ]
          : [
              ["Repositórios", rq.stats.total],
              ["Linguagens distintas", rq.stats.categorias],
            ];
      entradas.forEach(([rotulo, valor]) => {
        const kpi = document.createElement("div");
        kpi.className = "kpi";
        const l = document.createElement("div");
        l.className = "label";
        l.textContent = rotulo;
        const v = document.createElement("div");
        v.className = "value";
        v.textContent = valor;
        kpi.appendChild(l);
        kpi.appendChild(v);
        kpis.appendChild(kpi);
      });
      section.appendChild(kpis);
    }

    const chartHead = document.createElement("div");
    chartHead.className = "chart-head";
    const nota = document.createElement("span");
    nota.className = "escala-nota";
    nota.textContent = rq.escalaLog
      ? "Faixas em escala logarítmica (cauda longa) — contagem de repositórios por faixa"
      : "Contagem de repositórios por faixa";
    const botao = document.createElement("button");
    botao.className = "view-toggle";
    botao.type = "button";
    botao.textContent = "Ver tabela";
    chartHead.appendChild(nota);
    chartHead.appendChild(botao);
    section.appendChild(chartHead);

    const corpoChart = document.createElement("div");
    desenharBarras(corpoChart, rq.bins, (v) => v + (rq.tipo === "categorico" ? " repositórios" : " repositórios"));
    section.appendChild(corpoChart);

    const corpoTabela = document.createElement("div");
    corpoTabela.style.display = "none";
    desenharTabela(corpoTabela, ["Faixa", "Repositórios"], rq.bins.map((b) => [b.rotulo, String(b.contagem)]));
    section.appendChild(corpoTabela);

    botao.addEventListener("click", () => {
      const mostrandoTabela = corpoTabela.style.display !== "none";
      corpoTabela.style.display = mostrandoTabela ? "none" : "block";
      corpoChart.style.display = mostrandoTabela ? "block" : "none";
      botao.textContent = mostrandoTabela ? "Ver tabela" : "Ver gráfico";
    });

    return section;
  }

  function criarSecaoTabela(rq) {
    const section = document.createElement("section");
    section.className = "rq";
    section.id = rq.chave;

    const h2 = document.createElement("h2");
    h2.textContent = rq.titulo;
    section.appendChild(h2);

    const pergunta = document.createElement("p");
    pergunta.className = "pergunta";
    pergunta.textContent = rq.pergunta;
    section.appendChild(pergunta);

    desenharTabela(section, rq.cabecalho, rq.linhas);
    return section;
  }

  const main = document.getElementById("secoes");
  DADOS.forEach((rq) => {
    const section = rq.tipo === "tabela" ? criarSecaoTabela(rq) : criarSecaoHistogramaOuCategorico(rq);
    main.appendChild(section);
  });
})();
</script>
</body>
</html>
`;
}

principal();
