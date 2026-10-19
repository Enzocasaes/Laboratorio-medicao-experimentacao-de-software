// Testes nao parametricos das RQ 05 e RQ 06, sem dependencias.
//
// O pipeline e' Node puro (sem npm install), entao os testes que o enunciado
// pede estao implementados aqui, seguindo as MESMAS definicoes do scipy.stats,
// para scripts/conferir_rq05_rq06.py refazer as contas com a biblioteca e
// comparar:
//
//   spearman      scipy.stats.spearmanr      (p pela distribuicao t, n - 2 gl)
//   kruskalWallis scipy.stats.kruskal        (H com correcao de empates, qui-quadrado)
//   mannWhitney   scipy.stats.mannwhitneyu   (method="asymptotic", com correcao
//                                             de continuidade e de empates)
//   holm          statsmodels multipletests(method="holm")
//
// Por que nao parametricos: as metricas DORA sao muito assimetricas (a RQ 01 vai
// de 0,1 a 28 deploys/semana, com mediana 0,5), e os testes por postos nao
// dependem de normalidade nem sao arrastados por poucos repositorios extremos -
// o mesmo motivo de reportar mediana e IQR, e nao media e desvio-padrao.

import { percentil } from "./rq01a04.js";

// ---- quartis -----------------------------------------------------------------

// Cortes Q1/Q2/Q3 com o mesmo percentil (interpolacao linear do numpy) da
// descritiva das RQ 01-04.
export function cortesQuartis(valores) {
  const numeros = valores.filter(Number.isFinite);
  if (numeros.length === 0) return null;
  return [0.25, 0.5, 0.75].map((p) => percentil(numeros, p));
}

// Quartil de um valor: "Q1" se <= corte 1, "Q2" se <= corte 2, "Q3" se
// <= corte 3, senao "Q4". Valores empatados no corte ficam no quartil de
// baixo, entao os grupos podem ter tamanhos diferentes (o CSV registra o n).
export function quartilDe(valor, cortes) {
  if (!Number.isFinite(valor) || cortes === null) return null;
  if (valor <= cortes[0]) return "Q1";
  if (valor <= cortes[1]) return "Q2";
  if (valor <= cortes[2]) return "Q3";
  return "Q4";
}

export const QUARTIS = Object.freeze(["Q1", "Q2", "Q3", "Q4"]);

// ---- funcoes especiais -----------------------------------------------------

// ln(Gamma(x)) pela aproximacao de Lanczos (g = 7, n = 9): erro relativo ~1e-15.
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const y = x - 1;
  let soma = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i += 1) soma += LANCZOS[i] / (y + i);
  const t = y + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(soma);
}

const EPS = 1e-15;
const MAX_ITERACOES = 1000;
const MINUSCULO = 1e-300;

// Gamma incompleta regularizada superior Q(a, x) = 1 - P(a, x).
// Serie para x < a + 1 e fracao continua (Lentz) no resto, como no Numerical Recipes.
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  const prefixo = Math.exp(-x + a * Math.log(x) - lnGamma(a));
  if (x < a + 1) {
    let termo = 1 / a;
    let soma = termo;
    for (let n = 1; n < MAX_ITERACOES; n += 1) {
      termo *= x / (a + n);
      soma += termo;
      if (Math.abs(termo) < Math.abs(soma) * EPS) break;
    }
    return Math.max(0, 1 - soma * prefixo);
  }
  let b = x + 1 - a;
  let c = 1 / MINUSCULO;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX_ITERACOES; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < MINUSCULO) d = MINUSCULO;
    c = b + an / c;
    if (Math.abs(c) < MINUSCULO) c = MINUSCULO;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return prefixo * h;
}

function fracaoContinuaBeta(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < MINUSCULO) d = MINUSCULO;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < MAX_ITERACOES; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < MINUSCULO) d = MINUSCULO;
    c = 1 + aa / c;
    if (Math.abs(c) < MINUSCULO) c = MINUSCULO;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < MINUSCULO) d = MINUSCULO;
    c = 1 + aa / c;
    if (Math.abs(c) < MINUSCULO) c = MINUSCULO;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

// Beta incompleta regularizada I_x(a, b).
export function betaRegularizada(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const prefixo = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (prefixo * fracaoContinuaBeta(a, b, x)) / a;
  return 1 - (prefixo * fracaoContinuaBeta(b, a, 1 - x)) / b;
}

// P(X >= x) para qui-quadrado com `gl` graus de liberdade.
export const quiQuadradoSF = (x, gl) => gammaQ(gl / 2, x / 2);

// p bilateral da normal padrao: P(|Z| >= |z|) = erfc(|z| / sqrt 2) = Q(1/2, z^2 / 2).
export const normalBilateral = (z) => (z === 0 ? 1 : gammaQ(0.5, (z * z) / 2));

// p bilateral da t de Student: P(|T| >= |t|) = I_{gl/(gl+t^2)}(gl/2, 1/2).
export const tBilateral = (t, gl) => betaRegularizada(gl / (gl + t * t), gl / 2, 0.5);

// ---- postos ----------------------------------------------------------------

// Postos com media nos empates (scipy.stats.rankdata, method="average") e os
// tamanhos dos grupos empatados, usados nas correcoes de empate.
export function postos(valores) {
  const ordem = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const resultado = new Array(valores.length);
  const empates = [];
  let i = 0;
  while (i < ordem.length) {
    let j = i;
    while (j + 1 < ordem.length && ordem[j + 1][0] === ordem[i][0]) j += 1;
    const posto = (i + j + 2) / 2; // postos comecam em 1
    for (let k = i; k <= j; k += 1) resultado[ordem[k][1]] = posto;
    if (j > i) empates.push(j - i + 1);
    i = j + 1;
  }
  return { postos: resultado, empates };
}

const somaEmpates = (empates) => empates.reduce((s, t) => s + (t ** 3 - t), 0);

function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null; // variavel constante: correlacao indefinida
  return sxy / Math.sqrt(sxx * syy);
}

// ---- testes ----------------------------------------------------------------

const Z_975 = 1.959963984540054;

// Correlacao de Spearman entre pares (x, y). Pares com algum lado ausente
// (null) ficam de fora: cada correlacao usa todos os repositorios em que as
// duas metricas foram medidas.
// IC de 95% pela transformacao de Fisher com o erro-padrao de Bonett e Wright
// (2000), sqrt((1 + rho^2 / 2) / (n - 3)), proprio para o rho de Spearman.
export function spearman(xs, ys) {
  const pares = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pares.length;
  const vazio = { n, rho: null, p: null, ic_inf: null, ic_sup: null };
  if (n < 4) return vazio;
  const rho = pearson(postos(pares.map((p) => p[0])).postos, postos(pares.map((p) => p[1])).postos);
  if (rho === null) return vazio;
  const gl = n - 2;
  const p = Math.abs(rho) >= 1 ? 0 : tBilateral(rho * Math.sqrt(gl / (1 - rho * rho)), gl);
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, rho)));
  const ep = Math.sqrt((1 + (rho * rho) / 2) / (n - 3));
  return { n, rho, p, ic_inf: Math.tanh(z - Z_975 * ep), ic_sup: Math.tanh(z + Z_975 * ep) };
}

// Correlacao parcial de Spearman entre x e y controlando z: a formula de
// primeira ordem aplicada aos tres rho de Spearman, usando so' os casos com
// as tres variaveis medidas. p pela t com n - 3 graus de liberdade.
export function spearmanParcial(xs, ys, zs) {
  const casos = xs.map((x, i) => [x, ys[i], zs[i]]).filter((c) => c.every(Number.isFinite));
  const n = casos.length;
  if (n < 5) return { n, rho: null, p: null };
  const coluna = (j) => casos.map((c) => c[j]);
  const rxy = spearman(coluna(0), coluna(1)).rho;
  const rxz = spearman(coluna(0), coluna(2)).rho;
  const ryz = spearman(coluna(1), coluna(2)).rho;
  if (rxy === null || rxz === null || ryz === null) return { n, rho: null, p: null };
  const denominador = Math.sqrt((1 - rxz * rxz) * (1 - ryz * ryz));
  if (denominador === 0) return { n, rho: null, p: null };
  const rho = (rxy - rxz * ryz) / denominador;
  const gl = n - 3;
  const p = Math.abs(rho) >= 1 ? 0 : tBilateral(rho * Math.sqrt(gl / (1 - rho * rho)), gl);
  return { n, rho, p };
}

// Kruskal-Wallis para k grupos (listas de numeros). Tamanho de efeito:
// epsilon^2 = H / (n - 1) (Tomczak e Tomczak, 2014), entre 0 e 1.
export function kruskalWallis(grupos) {
  const validos = grupos.map((g) => g.filter(Number.isFinite)).filter((g) => g.length > 0);
  const n = validos.reduce((s, g) => s + g.length, 0);
  const k = validos.length;
  if (k < 2 || n <= k) return { n, k, h: null, gl: k - 1, p: null, epsilon2: null };
  const todos = validos.flat();
  const { postos: r, empates } = postos(todos);
  let inicio = 0;
  let soma = 0;
  for (const g of validos) {
    const somaPostos = r.slice(inicio, inicio + g.length).reduce((s, v) => s + v, 0);
    soma += (somaPostos * somaPostos) / g.length;
    inicio += g.length;
  }
  const correcao = 1 - somaEmpates(empates) / (n ** 3 - n);
  if (correcao === 0) return { n, k, h: null, gl: k - 1, p: null, epsilon2: null }; // todos iguais
  const h = ((12 / (n * (n + 1))) * soma - 3 * (n + 1)) / correcao;
  return { n, k, h, gl: k - 1, p: quiQuadradoSF(h, k - 1), epsilon2: h / (n - 1) };
}

// Mann-Whitney bilateral, aproximacao normal com correcao de continuidade e de
// empates (scipy: mannwhitneyu(x, y, method="asymptotic")). Devolve U de x.
// Tamanho de efeito: delta de Cliff = P(X > Y) - P(X < Y), entre -1 e 1;
// positivo quando x tende a ser MAIOR que y. Sai de U sem outra passada:
// delta = 2U / (n1 n2) - 1.
export function mannWhitney(xs, ys) {
  const x = xs.filter(Number.isFinite);
  const y = ys.filter(Number.isFinite);
  const n1 = x.length;
  const n2 = y.length;
  if (n1 === 0 || n2 === 0) return { n1, n2, u: null, p: null, delta: null };
  const n = n1 + n2;
  const { postos: r, empates } = postos([...x, ...y]);
  const r1 = r.slice(0, n1).reduce((s, v) => s + v, 0);
  const u = r1 - (n1 * (n1 + 1)) / 2;
  const delta = (2 * u) / (n1 * n2) - 1;
  const media = (n1 * n2) / 2;
  const variancia = ((n1 * n2) / 12) * (n + 1 - somaEmpates(empates) / (n * (n - 1)));
  if (variancia <= 0) return { n1, n2, u, p: 1, delta };
  const z = (Math.max(u, n1 * n2 - u) - media - 0.5) / Math.sqrt(variancia);
  return { n1, n2, u, p: Math.min(1, normalBilateral(Math.max(0, z))), delta };
}

// Correcao de Holm-Bonferroni para uma FAMILIA de testes. Recebe os p-valores
// na ordem original (null = teste nao realizado, fica null) e devolve os
// ajustados na mesma ordem. Controla a taxa de erro por familia sem a perda
// de poder do Bonferroni simples.
export function holm(ps) {
  const realizados = ps.map((p, i) => [p, i]).filter(([p]) => p !== null && Number.isFinite(p));
  realizados.sort((a, b) => a[0] - b[0]);
  const m = realizados.length;
  const ajustados = new Array(ps.length).fill(null);
  let maximo = 0;
  realizados.forEach(([p, i], posicao) => {
    maximo = Math.max(maximo, Math.min(1, (m - posicao) * p));
    ajustados[i] = maximo;
  });
  return ajustados;
}

// p-valor com 4 algarismos significativos. Arredondar para casas decimais
// gravaria "0" no CSV para p = 1e-21, e p = 0 e' uma afirmacao diferente.
export function significativos4(p) {
  if (p === null || !Number.isFinite(p)) return null;
  return Number(p.toPrecision(4));
}

// ---- magnitude (rotulos para o texto do artigo) -----------------------------

// |rho|: < 0,1 nula; < 0,3 fraca; < 0,5 moderada; >= 0,5 forte (Cohen, 1988) -
// o mesmo corte de 0,3 da hipotese H5.
export function magnitudeRho(rho) {
  if (rho === null) return null;
  const a = Math.abs(rho);
  if (a < 0.1) return "nula";
  if (a < 0.3) return "fraca";
  if (a < 0.5) return "moderada";
  return "forte";
}

// epsilon^2: < 0,01 desprezivel; < 0,08 pequeno; < 0,26 medio; >= 0,26 grande
// (os cortes de eta^2 de Cohen, usuais para epsilon^2).
export function magnitudeEpsilon2(e2) {
  if (e2 === null) return null;
  if (e2 < 0.01) return "desprezivel";
  if (e2 < 0.08) return "pequeno";
  if (e2 < 0.26) return "medio";
  return "grande";
}

// |delta| de Cliff: < 0,147 desprezivel; < 0,33 pequeno; < 0,474 medio;
// >= 0,474 grande (Romano et al., 2006).
export function magnitudeCliff(delta) {
  if (delta === null) return null;
  const a = Math.abs(delta);
  if (a < 0.147) return "desprezivel";
  if (a < 0.33) return "pequeno";
  if (a < 0.474) return "medio";
  return "grande";
}
