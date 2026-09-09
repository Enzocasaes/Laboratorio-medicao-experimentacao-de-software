// Estatisticas descritivas usadas no experimento (reaproveitadas do Lab01).
// O desenho e' within-subject com N pequeno: preferimos mediana + IQR a
// media + desvio-padrao.

export function calcularMediana(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

export function calcularQuartis(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const inferior = ordenados.slice(0, meio);
  const superior = ordenados.length % 2 === 0 ? ordenados.slice(meio) : ordenados.slice(meio + 1);
  return { q1: calcularMediana(inferior), q3: calcularMediana(superior) };
}

// Deteccao de outliers pelo metodo do intervalo interquartil (IQR * 1.5), o
// mesmo criterio usado no desenho de boxplots. Devolve os indices dos valores
// fora dos limites - eles sao REPORTADOS, nunca removidos automaticamente.
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
