// Kappa de Fleiss (Fleiss, 1971) - concordancia entre N avaliadores corrigida
// pelo acaso (secao 6 do enunciado). Funcoes PURAS, sem disco nem rede.
//
// Mesma conta de `statsmodels.stats.inter_rater.fleiss_kappa(table, method="fleiss")`
// aplicada a saida de `aggregate_raters`, para que a analise em Python da
// Sprint 03 possa conferir os numeros:
//
//   n_ij  = quantos avaliadores puseram a unidade i na categoria j
//   n     = avaliadores por unidade (igual para todas as unidades)
//   N     = unidades
//   p_j   = soma_i n_ij / (N * n)                        proporcao da categoria j
//   P_i   = (soma_j n_ij^2 - n) / (n * (n - 1))          concordancia na unidade i
//   P_obs = media dos P_i                                concordancia observada
//   P_esp = soma_j p_j^2                                 concordancia esperada ao acaso
//   kappa = (P_obs - P_esp) / (1 - P_esp)
//
// DADOS INCOMPLETOS: a formula exige o mesmo n em todas as unidades. A regra
// adotada e' a de CASOS COMPLETOS: so' entram unidades com rotulo valido de
// TODOS os avaliadores; as demais sao contadas e listadas como excluidas, e
// nunca preenchidas com um palpite. Rotulo fora das categorias da dimensao
// conta como ausente (quem decide isso e' src/validacao/rotulos.js).

// Agrega os rotulos de cada unidade em contagens por categoria (o equivalente
// do `aggregate_raters`). `unidades` e' uma lista de { id, rotulos: [..] }, um
// rotulo por avaliador, com null para ausente/invalido.
export function tabelaDeFrequencias(unidades, categorias) {
  const indice = new Map(categorias.map((categoria, j) => [categoria, j]));
  const tabela = [];
  const incluidas = [];
  const excluidas = [];

  for (const unidade of unidades) {
    const validos = unidade.rotulos.filter((rotulo) => rotulo !== null && rotulo !== undefined);
    const foraDaLista = validos.filter((rotulo) => !indice.has(rotulo));
    if (foraDaLista.length > 0) {
      throw new Error(`categoria desconhecida na unidade ${unidade.id}: ${foraDaLista.join(", ")}`);
    }
    if (validos.length < unidade.rotulos.length) {
      excluidas.push({ id: unidade.id, rotulosValidos: validos.length, avaliadores: unidade.rotulos.length });
      continue;
    }
    const linha = categorias.map(() => 0);
    for (const rotulo of validos) linha[indice.get(rotulo)] += 1;
    tabela.push(linha);
    incluidas.push(unidade.id);
  }

  return { categorias: [...categorias], tabela, incluidas, excluidas };
}

// Kappa de Fleiss a partir da tabela unidades x categorias.
// Devolve kappa = null (com o motivo) quando ele nao e' definido, em vez de NaN.
export function kappaDeFleiss(tabela) {
  const N = tabela.length;
  if (N === 0) {
    return { kappa: null, motivo: "nenhuma unidade com rotulos completos", unidades: 0, avaliadoresPorUnidade: null };
  }
  const n = tabela[0].reduce((soma, x) => soma + x, 0);
  for (const [i, linha] of tabela.entries()) {
    if (linha.some((x) => !Number.isInteger(x) || x < 0)) throw new Error(`linha ${i} da tabela tem contagem invalida`);
    const soma = linha.reduce((s, x) => s + x, 0);
    if (soma !== n) throw new Error(`a unidade ${i} tem ${soma} avaliacoes e a primeira tem ${n}: o kappa de Fleiss exige o mesmo numero`);
  }
  if (n < 2) {
    return { kappa: null, motivo: "e' preciso ao menos 2 avaliadores por unidade", unidades: N, avaliadoresPorUnidade: n };
  }

  const k = tabela[0].length;
  const proporcoes = Array.from({ length: k }, (_, j) => tabela.reduce((s, linha) => s + linha[j], 0) / (N * n));
  const concordanciaPorUnidade = tabela.map((linha) => (linha.reduce((s, x) => s + x * x, 0) - n) / (n * (n - 1)));
  const concordanciaObservada = concordanciaPorUnidade.reduce((s, x) => s + x, 0) / N;
  const concordanciaEsperada = proporcoes.reduce((s, p) => s + p * p, 0);

  const base = {
    unidades: N,
    avaliadoresPorUnidade: n,
    proporcoesPorCategoria: proporcoes,
    concordanciaObservada,
    concordanciaEsperada,
  };
  // Todos os avaliadores usaram uma unica categoria em todas as unidades:
  // P_esp = 1 e a formula vira 0/0 (o statsmodels devolve NaN). A concordancia
  // e' total, mas nao ha como separa-la do acaso.
  if (1 - concordanciaEsperada < 1e-12) {
    return { ...base, kappa: null, motivo: "todas as avaliacoes caem numa unica categoria (concordancia esperada = 1): kappa indefinido" };
  }
  return { ...base, kappa: (concordanciaObservada - concordanciaEsperada) / (1 - concordanciaEsperada), motivo: null };
}

// Interpretacao de Landis & Koch (1977), a que o enunciado manda usar.
export function interpretarKappa(kappa) {
  if (kappa === null || kappa === undefined || Number.isNaN(kappa)) return "indefinido";
  if (kappa < 0) return "pobre";
  if (kappa <= 0.2) return "leve";
  if (kappa <= 0.4) return "razoavel";
  if (kappa <= 0.6) return "moderada";
  if (kappa <= 0.8) return "substancial";
  return "quase perfeita";
}

// Atalho: rotulos por unidade -> kappa, com a contabilidade das exclusoes.
export function kappaDaDimensao(unidades, categorias) {
  const { tabela, incluidas, excluidas } = tabelaDeFrequencias(unidades, categorias);
  const resultado = kappaDeFleiss(tabela);
  return {
    ...resultado,
    interpretacao: interpretarKappa(resultado.kappa),
    categorias: [...categorias],
    tabela,
    unidadesTotais: unidades.length,
    unidadesIncluidas: incluidas,
    unidadesExcluidas: excluidas,
  };
}
