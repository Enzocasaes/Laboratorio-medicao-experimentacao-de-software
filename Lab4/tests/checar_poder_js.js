/* Roda `src/poder.js` fora do navegador, contra um DOM mínimo (Lab04, bônus).
 *
 * O arquivo `src/poder.js` só é exercitado de verdade quando alguém abre o
 * dashboard. Um erro de JavaScript ali não quebra a página — o bloco
 * interativo simplesmente fica vazio, e ninguém percebe até a apresentação.
 * Este script evita isso: monta o mínimo de DOM que o gráfico usa, carrega o
 * JSON de verdade (lido do `dashboard/index.html` gerado), executa o módulo e
 * confere que ele desenhou as curvas e escreveu a leitura.
 *
 * Uso:  node tests/checar_poder_js.js
 * Sai com código 1 e uma mensagem na primeira coisa que não bater.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const LAB4 = path.resolve(__dirname, "..");
const pagina = fs.readFileSync(path.join(LAB4, "dashboard", "index.html"), "utf8");
const codigo = fs.readFileSync(path.join(LAB4, "src", "poder.js"), "utf8");

const marcaInicio = '<script type="application/json" id="dados-poder">';
const inicio = pagina.indexOf(marcaInicio);
if (inicio < 0) {
  console.error("o dashboard gerado nao tem o JSON do grafico interativo");
  process.exit(1);
}
const json = pagina.slice(inicio + marcaInicio.length,
                          pagina.indexOf("</script>", inicio));

// ------------------------------------------------------------ DOM mínimo

function criarNo(nome) {
  return {
    nome: nome,
    atributos: {},
    filhos: [],
    style: {},
    textContent: "",
    innerHTML: "",
    ouvintes: {},
    setAttribute: function (chave, valor) { this.atributos[chave] = String(valor); },
    getAttribute: function (chave) { return this.atributos[chave]; },
    appendChild: function (filho) { this.filhos.push(filho); return filho; },
    addEventListener: function (evento, funcao) { this.ouvintes[evento] = funcao; },
    getBoundingClientRect: function () { return { left: 0, width: 760 }; },
    querySelector: function (seletor) {
      var classe = seletor.replace(".", "");
      for (var i = 0; i < this.filhos.length; i++) {
        if ((this.filhos[i].atributos["class"] || "") === classe) return this.filhos[i];
      }
      return null;
    }
  };
}

const porId = {};
["poder-interativo", "poder-controles", "poder-leitura"].forEach(function (id) {
  porId[id] = criarNo("div");
});
const tela = criarNo("div");
tela.setAttribute("class", "tela-poder");
porId["poder-interativo"].appendChild(tela);
porId["dados-poder"] = { textContent: json };

global.document = {
  getElementById: function (id) { return porId[id] || null; },
  createElementNS: function (_ns, nome) { return criarNo(nome); },
  createElement: function (nome) { return criarNo(nome); }
};
global.window = { matchMedia: function () { return { matches: false }; } };

// --------------------------------------------------------------- execução

try {
  new Function(codigo)();
} catch (erro) {
  console.error("o modulo lancou excecao ao iniciar:", erro.message);
  process.exit(1);
}

function exigir(condicao, mensagem) {
  if (!condicao) { console.error("FALHOU: " + mensagem); process.exit(1); }
  console.log("ok   " + mensagem);
}

const dados = JSON.parse(json);
const svg = tela.filhos[0];
exigir(svg && svg.nome === "svg", "o grafico foi criado como <svg>");

const camadas = svg.filhos;
exigir(camadas.length === 3, "as tres camadas (fundo, dados, marcador) existem");

const curvas = camadas[1].filhos.filter(function (no) {
  return no.nome === "path" && no.atributos.fill === "none";
});
exigir(curvas.length === 2, "desenhou uma curva para cada teste");
exigir(camadas[1].filhos.filter(function (no) { return no.nome === "circle"; }).length
       === 2 * dados.efeitos.length,
       "marcou todos os " + dados.efeitos.length + " pontos simulados das duas curvas");

const leitura = porId["poder-leitura"].innerHTML;
exigir(leitura.indexOf("teste t pareado") >= 0 && leitura.indexOf("Wilcoxon pareado") >= 0,
       "a leitura mostra os dois testes");
exigir(/IC \d/.test(leitura), "a leitura traz o intervalo de confianca");
exigir(svg.atributos["tabindex"] === "0", "o grafico recebe foco pelo teclado");

// o teclado move o ponto lido
const antes = porId["poder-leitura"].innerHTML;
svg.ouvintes["keydown"]({ key: "ArrowRight", preventDefault: function () {} });
exigir(porId["poder-leitura"].innerHTML !== antes,
       "a seta para a direita move o ponto lido");

// e o valor lido e o do JSON, nao um recalculo
svg.ouvintes["keydown"]({ key: "End", preventDefault: function () {} });
const ultimo = dados.series[dados.cenarios[0].id + "|30"];
const esperado = (ultimo.t.taxa[dados.efeitos.length - 1] * 100).toFixed(1).replace(".", ",");
exigir(porId["poder-leitura"].innerHTML.indexOf(esperado + "%") >= 0,
       "o numero mostrado e exatamente o do CSV (" + esperado + "%)");

console.log("\ntodas as checagens passaram");
