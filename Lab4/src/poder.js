/* Gráfico de poder interativo do Lab04 (bônus da Sprint 02).
 *
 * O G4 estático, acima deste bloco, mostra as seis condições que respondem à
 * pergunta do laboratório. Este desenha QUALQUER uma das vinte combinações de
 * cenário × tamanho de amostra e deixa ler ponto a ponto: o poder exato dos
 * dois testes num dado efeito, com o intervalo de confiança e a diferença
 * entre eles.
 *
 * Os números vêm do mesmo CSV que alimenta o G4 — `data/resultados_q2.csv`,
 * embutido na página como JSON por `src/dashboard.py`. Nada é recalculado
 * aqui: se o gráfico discordasse do SVG ao lado, um dos dois estaria mentindo.
 *
 * Sem dependências e sem build: o dashboard continua sendo um arquivo que abre
 * com dois cliques. Sem JavaScript, a seção 5 continua inteira — este bloco
 * simplesmente não aparece.
 */
(function () {
  "use strict";

  var fonte = document.getElementById("dados-poder");
  var raiz = document.getElementById("poder-interativo");
  if (!fonte || !raiz) return;

  var D = JSON.parse(fonte.textContent);
  var AZUL = "#1a6aa8", LARANJA = "#d97706";
  var TINTA = "#1f2328", FRACA = "#5b6472", GRADE = "#dde3ea", EIXO = "#94a3b8";
  var REFERENCIA = "#b42318", ALVO = "#475569";
  var FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  var NS = "http://www.w3.org/2000/svg";

  var L = 760, A = 330, ESQ = 58, DIR = L - 18, BASE = A - 46, TOPO = 24;
  var animar = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var estado = {
    cenario: D.cenarios[0].id,
    n: D.tamanhos.indexOf(30) >= 0 ? 30 : D.tamanhos[0],
    indice: Math.min(3, D.efeitos.length - 1)
  };

  // ---------------------------------------------------------------- dados

  function serie() {
    return D.series[estado.cenario + "|" + estado.n];
  }
  function cenarioAtual() {
    for (var i = 0; i < D.cenarios.length; i++) {
      if (D.cenarios[i].id === estado.cenario) return D.cenarios[i];
    }
    return D.cenarios[0];
  }
  function px(e) {
    return ESQ + (e / D.efeitos[D.efeitos.length - 1]) * (DIR - ESQ);
  }
  function py(p) {
    return BASE - p * (BASE - TOPO);
  }
  function pct(v, casas) {
    return (v * 100).toFixed(casas === undefined ? 1 : casas).replace(".", ",") + "%";
  }
  function num(v, casas) {
    return v.toFixed(casas).replace(".", ",");
  }

  // ------------------------------------------------------------ desenho

  function elemento(nome, atributos) {
    var no = document.createElementNS(NS, nome);
    for (var chave in atributos) {
      if (Object.prototype.hasOwnProperty.call(atributos, chave)) {
        no.setAttribute(chave, atributos[chave]);
      }
    }
    return no;
  }

  function texto(x, y, conteudo, opcoes) {
    opcoes = opcoes || {};
    var no = elemento("text", {
      x: x, y: y, "font-family": FONTE,
      "font-size": opcoes.tamanho || 10,
      fill: opcoes.cor || TINTA,
      "text-anchor": opcoes.ancora || "start"
    });
    if (opcoes.negrito) no.setAttribute("font-weight", "600");
    no.textContent = conteudo;
    return no;
  }

  function caminho(pontos) {
    return pontos.map(function (p, i) {
      return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1);
    }).join(" ");
  }

  function pontosDa(valores) {
    return D.efeitos.map(function (e, i) { return [px(e), py(valores[i])]; });
  }

  var svg = elemento("svg", {
    viewBox: "0 0 " + L + " " + A, width: "100%", role: "img",
    "aria-label": "Curvas de poder interativas dos dois testes"
  });
  var camadaFundo = elemento("g", {});
  var camadaDados = elemento("g", {});
  var camadaMarcador = elemento("g", {});
  svg.appendChild(camadaFundo);
  svg.appendChild(camadaDados);
  svg.appendChild(camadaMarcador);

  function desenharFundo() {
    camadaFundo.textContent = "";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
      camadaFundo.appendChild(elemento("line", {
        x1: ESQ, y1: py(p), x2: DIR, y2: py(p), stroke: GRADE, "stroke-width": 1
      }));
      camadaFundo.appendChild(texto(ESQ - 8, py(p) + 3.5, pct(p, 0),
        { tamanho: 9.5, cor: FRACA, ancora: "end" }));
    });
    // as duas réguas: o alvo de poder e o nível nominal
    camadaFundo.appendChild(elemento("line", {
      x1: ESQ, y1: py(D.alvo), x2: DIR, y2: py(D.alvo),
      stroke: ALVO, "stroke-width": 1.2, "stroke-dasharray": "2 3"
    }));
    camadaFundo.appendChild(texto(DIR, py(D.alvo) - 6, pct(D.alvo, 0) + " de poder",
      { tamanho: 9.5, cor: ALVO, ancora: "end" }));
    camadaFundo.appendChild(elemento("line", {
      x1: ESQ, y1: py(D.alfa), x2: DIR, y2: py(D.alfa),
      stroke: REFERENCIA, "stroke-width": 1.4, "stroke-dasharray": "7 4"
    }));
    camadaFundo.appendChild(texto(DIR, py(D.alfa) - 6, "α = " + pct(D.alfa, 0),
      { tamanho: 9.5, cor: REFERENCIA, ancora: "end" }));

    camadaFundo.appendChild(elemento("line", {
      x1: ESQ, y1: BASE, x2: DIR, y2: BASE, stroke: EIXO, "stroke-width": 1
    }));
    D.efeitos.forEach(function (e) {
      camadaFundo.appendChild(elemento("line", {
        x1: px(e), y1: BASE, x2: px(e), y2: BASE + 4, stroke: EIXO, "stroke-width": 1
      }));
      camadaFundo.appendChild(texto(px(e), BASE + 16, num(e, 2),
        { tamanho: 9, cor: FRACA, ancora: "middle" }));
    });
    camadaFundo.appendChild(texto((ESQ + DIR) / 2, A - 8,
      "tamanho do efeito δ = μ_d / σ_d (em desvios das diferenças)",
      { tamanho: 10, cor: FRACA, ancora: "middle" }));
  }

  function desenharCurvas() {
    camadaDados.textContent = "";
    var s = serie();
    [["t", AZUL, s.t], ["w", LARANJA, s.w]].forEach(function (item) {
      var cor = item[1], dados = item[2];
      var superiores = pontosDa(dados.sup);
      var inferiores = pontosDa(dados.inf);
      camadaDados.appendChild(elemento("path", {
        d: caminho(superiores) + " " + caminho(inferiores.slice().reverse()).replace(/^M/, "L") + " Z",
        fill: cor, "fill-opacity": 0.16, stroke: "none"
      }));
      var linha = elemento("path", {
        d: caminho(pontosDa(dados.taxa)), fill: "none", stroke: cor,
        "stroke-width": 2, "stroke-linejoin": "round"
      });
      // a curva cuja H0 já era falsa em δ = 0 não é poder: entra pontilhada
      if (dados.h0_falsa_em_zero) linha.setAttribute("stroke-dasharray", "6 3");
      if (animar) {
        linha.style.transition = "d 180ms ease-out";
      }
      camadaDados.appendChild(linha);
      pontosDa(dados.taxa).forEach(function (p) {
        camadaDados.appendChild(elemento("circle", {
          cx: p[0], cy: p[1], r: 2.8, fill: cor, stroke: "white", "stroke-width": 1.2
        }));
      });
    });
  }

  function desenharMarcador() {
    camadaMarcador.textContent = "";
    var s = serie(), i = estado.indice, x = px(D.efeitos[i]);
    camadaMarcador.appendChild(elemento("line", {
      x1: x, y1: TOPO - 6, x2: x, y2: BASE, stroke: TINTA,
      "stroke-width": 1, "stroke-opacity": 0.35
    }));
    [[AZUL, s.t], [LARANJA, s.w]].forEach(function (item) {
      camadaMarcador.appendChild(elemento("circle", {
        cx: x, cy: py(item[1].taxa[i]), r: 5.4, fill: item[0],
        stroke: "white", "stroke-width": 2
      }));
    });
    camadaMarcador.appendChild(texto(x, TOPO - 10, "δ = " + num(D.efeitos[i], 2),
      { tamanho: 10, cor: TINTA, ancora: "middle", negrito: true }));
  }

  // ------------------------------------------------------------ leitura

  function atualizarLeitura() {
    var s = serie(), i = estado.indice, c = cenarioAtual();
    var taxaT = s.t.taxa[i], taxaW = s.w.taxa[i];
    var diferenca = (taxaW - taxaT) * 100;
    var h0T = i === 0, h0W = i === 0 && !s.w.h0_falsa_em_zero;

    function bloco(nome, cor, dados, h0) {
      return '<div class="linha-leitura">'
        + '<span class="marca" style="background:' + cor + '"></span>'
        + '<span class="nome">' + nome + "</span>"
        + '<span class="valor">' + pct(dados.taxa[i]) + "</span>"
        + '<span class="ic">IC ' + pct(dados.inf[i]) + "–" + pct(dados.sup[i]) + "</span>"
        + '<span class="tipo">' + (h0 ? "erro tipo I" : (i === 0 ? "H₀ do teste já falsa" : "poder")) + "</span>"
        + "</div>";
    }

    var conclusao;
    if (i === 0) {
      conclusao = "Sem efeito nenhum. Aqui a taxa não é poder: é a taxa de erro "
        + "tipo I, e o que se espera é que fique perto de " + pct(D.alfa, 0) + ".";
    } else if (Math.abs(diferenca) < 1) {
      conclusao = "Diferença de " + num(Math.abs(diferenca), 1) + " p.p. entre os dois "
        + "testes — dentro do ruído de " + D.repeticoes.toLocaleString("pt-BR")
        + " simulações. Neste ponto, tanto faz qual deles é usado.";
    } else if (diferenca > 0) {
      conclusao = "O Wilcoxon encontra o efeito " + num(diferenca, 1) + " p.p. mais "
        + "vezes que o t nos mesmos conjuntos.";
    } else {
      conclusao = "O teste t encontra o efeito " + num(-diferenca, 1) + " p.p. mais "
        + "vezes que o Wilcoxon nos mesmos conjuntos.";
    }

    function mde(valor) {
      return valor === null ? "não alcança na grade" : "δ = " + num(valor, 2)
        + " (" + num(valor * D.desvio, 2) + " s)";
    }

    document.getElementById("poder-leitura").innerHTML =
      '<div class="cabecalho-leitura">' + c.nome + " · n = " + estado.n + "</div>"
      + bloco("teste t pareado", AZUL, s.t, h0T)
      + bloco("Wilcoxon pareado", LARANJA, s.w, h0W)
      + '<p class="conclusao-leitura">' + conclusao + "</p>"
      + '<p class="mde-leitura"><b>Para 80% de poder</b><br>'
      + "t: " + mde(s.t.mde) + "<br>Wilcoxon: " + mde(s.w.mde) + "</p>";

    svg.setAttribute("aria-label",
      "Curvas de poder, " + c.nome + ", n = " + estado.n + ". Em δ = "
      + num(D.efeitos[i], 2) + ", o teste t rejeita " + pct(taxaT)
      + " e o Wilcoxon " + pct(taxaW) + ".");
  }

  function redesenhar() {
    desenharCurvas();
    desenharMarcador();
    atualizarLeitura();
  }

  // ------------------------------------------------------------ controles

  function montarControles() {
    var barra = document.getElementById("poder-controles");
    var seletorCenario = document.createElement("select");
    seletorCenario.id = "poder-cenario";
    seletorCenario.setAttribute("aria-label", "cenário");
    D.cenarios.forEach(function (c) {
      var opcao = document.createElement("option");
      opcao.value = c.id;
      opcao.textContent = c.nome;
      seletorCenario.appendChild(opcao);
    });
    seletorCenario.value = estado.cenario;
    seletorCenario.addEventListener("change", function () {
      estado.cenario = this.value;
      redesenhar();
    });

    var seletorN = document.createElement("select");
    seletorN.id = "poder-n";
    seletorN.setAttribute("aria-label", "tamanho da amostra");
    D.tamanhos.forEach(function (n) {
      var opcao = document.createElement("option");
      opcao.value = n;
      opcao.textContent = "n = " + n + (n === 30 ? " (o tamanho real)" : "");
      seletorN.appendChild(opcao);
    });
    seletorN.value = estado.n;
    seletorN.addEventListener("change", function () {
      estado.n = parseInt(this.value, 10);
      redesenhar();
    });

    barra.appendChild(rotulado("Cenário", seletorCenario));
    barra.appendChild(rotulado("Amostra", seletorN));
  }

  function rotulado(nome, controle) {
    var caixa = document.createElement("label");
    caixa.className = "campo";
    var span = document.createElement("span");
    span.textContent = nome;
    caixa.appendChild(span);
    caixa.appendChild(controle);
    return caixa;
  }

  function indiceMaisProximo(clienteX) {
    var caixa = svg.getBoundingClientRect();
    var x = (clienteX - caixa.left) / caixa.width * L;
    var melhor = 0, menor = Infinity;
    D.efeitos.forEach(function (e, i) {
      var distancia = Math.abs(px(e) - x);
      if (distancia < menor) { menor = distancia; melhor = i; }
    });
    return melhor;
  }

  function mover(indice) {
    indice = Math.max(0, Math.min(D.efeitos.length - 1, indice));
    if (indice === estado.indice) return;
    estado.indice = indice;
    desenharMarcador();
    atualizarLeitura();
  }

  svg.addEventListener("mousemove", function (evento) {
    mover(indiceMaisProximo(evento.clientX));
  });
  svg.addEventListener("touchmove", function (evento) {
    if (evento.touches.length) {
      mover(indiceMaisProximo(evento.touches[0].clientX));
      evento.preventDefault();
    }
  }, { passive: false });

  // o mesmo ponto a ponto pelo teclado, para quem não usa mouse
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("role", "img");
  svg.addEventListener("keydown", function (evento) {
    var teclas = {
      ArrowRight: estado.indice + 1, ArrowLeft: estado.indice - 1,
      Home: 0, End: D.efeitos.length - 1
    };
    if (teclas[evento.key] === undefined) return;
    mover(teclas[evento.key]);
    evento.preventDefault();
  });

  montarControles();
  raiz.querySelector(".tela-poder").appendChild(svg);
  desenharFundo();
  redesenhar();
})();
