/** Mediana de uma lista de numeros. Usada para resumir a idade dos repositorios. */
export function calcularMediana(numeros) {
  const ordenados = [...numeros].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

/**
 * Conta quantas vezes cada valor categorico aparece (ex.: linguagem primaria).
 * Devolve os pares [valor, quantidade] ordenados do mais frequente para o
 * menos frequente. Usada no resumo de metricas categoricas (RQ05).
 */
export function contarPorCategoria(valores) {
  const contagem = new Map();
  for (const valor of valores) {
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}
