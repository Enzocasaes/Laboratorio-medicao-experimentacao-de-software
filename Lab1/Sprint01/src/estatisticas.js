export function calcularMediana(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

export function contarPorCategoria(valores) {
  const contagem = new Map();
  for (const valor of valores) {
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}

export function calcularQuartis(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const inferior = ordenados.slice(0, meio);
  const superior = ordenados.length % 2 === 0 ? ordenados.slice(meio) : ordenados.slice(meio + 1);
  return { q1: calcularMediana(inferior), q3: calcularMediana(superior) };
}

// Deteccao de outliers pelo metodo do intervalo interquartil (IQR * 1.5), o
// mesmo criterio usado no desenho de boxplots.
export function detectarOutliers(numeros) {
  const { q1, q3 } = calcularQuartis(numeros);
  const iqr = q3 - q1;
  const limiteInferior = q1 - 1.5 * iqr;
  const limiteSuperior = q3 + 1.5 * iqr;

  const indices = [];
  numeros.forEach((valor, indice) => {
    if (valor < limiteInferior || valor > limiteSuperior) indices.push(indice);
  });

  return { q1, q3, iqr, limiteInferior, limiteSuperior, indices };
}

// Coeficiente de correlacao de Pearson: mede o quanto duas variaveis andam
// juntas de forma linear, de -1 (inversa perfeita) a 1 (direta perfeita).
// Correlacao nao implica causalidade - so diz se ha (ou nao) uma tendencia
// conjunta nos dados.
export function correlacaoPearson(x, y) {
  if (x.length !== y.length || x.length === 0) {
    throw new Error("correlacaoPearson exige dois vetores do mesmo tamanho e nao vazios.");
  }

  const n = x.length;
  const mediaX = x.reduce((soma, v) => soma + v, 0) / n;
  const mediaY = y.reduce((soma, v) => soma + v, 0) / n;

  let covariancia = 0;
  let varianciaX = 0;
  let varianciaY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mediaX;
    const dy = y[i] - mediaY;
    covariancia += dx * dy;
    varianciaX += dx * dx;
    varianciaY += dy * dy;
  }

  const denominador = Math.sqrt(varianciaX * varianciaY);
  return denominador === 0 ? 0 : covariancia / denominador;
}
