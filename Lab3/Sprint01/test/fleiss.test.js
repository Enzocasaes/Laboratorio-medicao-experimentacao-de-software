// Kappa de Fleiss: exemplos com resultado conhecido (Wikipedia/Fleiss 1971 e
// casos feitos no papel), dados incompletos, categorias invalidas e os casos
// em que o kappa nao e' definido.

import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarKappa, kappaDaDimensao, kappaDeFleiss, tabelaDeFrequencias } from "../src/validacao/fleiss.js";

const perto = (obtido, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(obtido - esperado) <= tolerancia, `esperado ${esperado}, obtido ${obtido}`);

// Exemplo classico da pagina "Fleiss' kappa" da Wikipedia: 10 unidades,
// 14 avaliadores, 5 categorias. Valores publicados: P = 0,378, Pe = 0,213, kappa = 0,210.
const WIKIPEDIA = [
  [0, 0, 0, 0, 14],
  [0, 2, 6, 4, 2],
  [0, 0, 3, 5, 6],
  [0, 3, 9, 2, 0],
  [2, 2, 8, 1, 1],
  [7, 7, 0, 0, 0],
  [3, 2, 6, 3, 0],
  [2, 5, 3, 2, 2],
  [6, 5, 2, 1, 0],
  [0, 2, 2, 3, 7],
];

test("kappaDeFleiss: exemplo da Wikipedia (kappa = 0,210)", () => {
  const r = kappaDeFleiss(WIKIPEDIA);
  assert.equal(r.unidades, 10);
  assert.equal(r.avaliadoresPorUnidade, 14);
  perto(r.concordanciaObservada, 0.378, 5e-4);
  perto(r.concordanciaEsperada, 0.213, 5e-4);
  perto(r.kappa, 0.20993, 1e-5);
  // p_j publicados: 0,143 0,200 0,279 0,150 0,229
  [0.143, 0.2, 0.279, 0.15, 0.229].forEach((p, j) => perto(r.proporcoesPorCategoria[j], p, 5e-4));
});

test("kappaDeFleiss: tres avaliadores, conta feita no papel (kappa = 1/3)", () => {
  // P_i = 1, 1, 1/3, 1/3 -> P = 2/3; p = (0,5; 0,5) -> Pe = 0,5; kappa = (2/3 - 1/2) / (1/2)
  const r = kappaDeFleiss([[3, 0], [0, 3], [2, 1], [1, 2]]);
  perto(r.concordanciaObservada, 2 / 3);
  perto(r.concordanciaEsperada, 0.5);
  perto(r.kappa, 1 / 3);
});

test("kappaDeFleiss: concordancia total com mais de uma categoria -> kappa = 1", () => {
  perto(kappaDeFleiss([[3, 0, 0], [0, 3, 0], [0, 0, 3]]).kappa, 1);
});

test("kappaDeFleiss: desacordo sistematico -> kappa negativo (-1/3)", () => {
  // P_i = 1/3 em todas; Pe = 0,5 -> (1/3 - 1/2) / (1/2)
  perto(kappaDeFleiss([[2, 1], [1, 2], [2, 1], [1, 2]]).kappa, -1 / 3);
});

test("kappaDeFleiss: concordancia percentual alta nao vira kappa alto quando a categoria domina", () => {
  // 9 de 10 unidades unanimes em "nao" e uma 2x1: % de acordo alta, kappa baixo.
  const tabela = [...Array(9).fill([0, 3]), [1, 2]];
  const r = kappaDeFleiss(tabela);
  perto(r.concordanciaObservada, (9 + 1 / 3) / 10);
  assert.ok(r.kappa < 0); // Pe ~ 0,934 > P ~ 0,933
});

test("kappaDeFleiss: todos na mesma categoria -> kappa indefinido (null), nao NaN", () => {
  const r = kappaDeFleiss([[3, 0], [3, 0]]);
  assert.equal(r.kappa, null);
  assert.match(r.motivo, /unica categoria/);
  perto(r.concordanciaObservada, 1);
});

test("kappaDeFleiss: sem unidades ou com 1 avaliador -> indefinido", () => {
  assert.equal(kappaDeFleiss([]).kappa, null);
  assert.match(kappaDeFleiss([]).motivo, /nenhuma unidade/);
  assert.equal(kappaDeFleiss([[1, 0], [0, 1]]).kappa, null);
});

test("kappaDeFleiss: numero de avaliacoes diferente entre unidades e' erro", () => {
  assert.throws(() => kappaDeFleiss([[3, 0], [1, 1]]), /mesmo numero/);
  assert.throws(() => kappaDeFleiss([[3, -1, 1]]), /contagem invalida/);
});

test("tabelaDeFrequencias: agrega por categoria e exclui unidades incompletas (casos completos)", () => {
  const { tabela, incluidas, excluidas } = tabelaDeFrequencias(
    [
      { id: "a", rotulos: ["sim", "sim", "nao"] },
      { id: "b", rotulos: ["sim", null, "sim"] },
      { id: "c", rotulos: ["nao", "nao", "nao"] },
    ],
    ["sim", "nao"]
  );
  assert.deepEqual(tabela, [[2, 1], [0, 3]]);
  assert.deepEqual(incluidas, ["a", "c"]);
  assert.deepEqual(excluidas, [{ id: "b", rotulosValidos: 2, avaliadores: 3 }]);
});

test("tabelaDeFrequencias: categoria fora da lista e' erro (deve ser filtrada antes)", () => {
  assert.throws(() => tabelaDeFrequencias([{ id: "a", rotulos: ["sim", "talvez", "nao"] }], ["sim", "nao"]), /categoria desconhecida.*talvez/);
});

test("tabelaDeFrequencias: categoria nunca usada vira coluna de zeros e nao muda o kappa", () => {
  const unidades = [
    { id: "a", rotulos: ["sim", "sim", "nao"] },
    { id: "b", rotulos: ["nao", "nao", "nao"] },
  ];
  const sem = kappaDaDimensao(unidades, ["sim", "nao"]);
  const com = kappaDaDimensao(unidades, ["sim", "nao", "incerto"]);
  assert.deepEqual(com.tabela, [[2, 1, 0], [0, 3, 0]]);
  perto(com.kappa, sem.kappa);
});

test("kappaDaDimensao: devolve kappa, interpretacao e a contabilidade das exclusoes", () => {
  const r = kappaDaDimensao(
    [
      { id: "1", rotulos: ["sim", "sim", "sim"] },
      { id: "2", rotulos: ["nao", "nao", "nao"] },
      { id: "3", rotulos: [null, null, null] },
    ],
    ["sim", "nao"]
  );
  perto(r.kappa, 1);
  assert.equal(r.interpretacao, "quase perfeita");
  assert.equal(r.unidadesTotais, 3);
  assert.equal(r.unidades, 2);
  assert.deepEqual(r.unidadesIncluidas, ["1", "2"]);
  assert.equal(r.unidadesExcluidas.length, 1);
});

test("interpretarKappa: faixas de Landis & Koch (1977)", () => {
  assert.equal(interpretarKappa(-0.1), "pobre");
  assert.equal(interpretarKappa(0), "leve");
  assert.equal(interpretarKappa(0.2), "leve");
  assert.equal(interpretarKappa(0.21), "razoavel");
  assert.equal(interpretarKappa(0.4), "razoavel");
  assert.equal(interpretarKappa(0.5), "moderada");
  assert.equal(interpretarKappa(0.61), "substancial");
  assert.equal(interpretarKappa(0.81), "quase perfeita");
  assert.equal(interpretarKappa(null), "indefinido");
  assert.equal(interpretarKappa(Number.NaN), "indefinido");
});
