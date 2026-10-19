// Classificacao DORA de referencia (combinacao C1 do enunciado) - Passo 4.
//
// Os cortes abaixo sao os FIXADOS PELA DISCIPLINA (secao 5, RQ 07), adaptados
// dos relatorios Accelerate State of DevOps. Eles nao sao recalculados a partir
// dos dados: a tabela e' a mesma para toda a turma, para os resultados serem
// comparaveis entre grupos.
//
//   Deployment frequency  Elite >= 7/semana | High >= 1 e < 7/semana
//                         Medium >= 1/mes e < 1/semana | Low < 1/mes
//   Lead time (mediana)   Elite < 1 dia | High 1 a < 7 dias
//                         Medium 7 a < 30 dias | Low >= 30 dias
//   Change failure rate   Elite <= 15% | High > 15% e <= 30%
//                         Medium > 30% e <= 45% | Low > 45%
//   Recuperacao (mediana) Elite < 1 h | High 1 h a < 1 dia
//                         Medium 1 dia a < 1 semana | Low >= 1 semana
//
// CATEGORIA GERAL: 4 pontos para Elite, 3 High, 2 Medium, 1 Low em cada
// metrica; a categoria e' a MEDIANA dos quatro valores, ARREDONDADA PARA BAIXO.
// Exemplo do enunciado: (4, 3, 3, 1) -> mediana 3 -> High.
//
// METRICA NAO MEDIDA: um repositorio cujo CI nunca quebrou na janela nao tem
// tempo de recuperacao. Ele NAO vira "Low" (seria puni-lo por nao ter falhado)
// nem "Elite" (nao foi medido): a metrica fica fora da mediana, e a coluna
// `metricas_classificadas` registra sobre quantas a categoria foi calculada.
//
// A combinacao usada aqui e' a C1 da RQ 07 (deploy = release publicada, lead
// time = variante (a), CFR = variante (a), proxy de CI). As outras combinacoes
// reusam `classificarRepositorio` passando outras colunas - e' por isso que a
// funcao recebe os valores, e nao o registro inteiro.

export const CATEGORIAS = Object.freeze(["Elite", "High", "Medium", "Low"]);

export const PONTOS = Object.freeze({ Elite: 4, High: 3, Medium: 2, Low: 1 });

const HORAS_POR_DIA = 24;
const HORAS_POR_SEMANA = 7 * HORAS_POR_DIA;
// "1 por mes" convertido para semanas: 12 deploys em 52,1775 semanas (365,25 dias).
const POR_SEMANA_1_POR_MES = 12 / 52.1775;

function numero(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Cada classificador devolve a categoria ou null quando a metrica nao foi medida.
export function classificarFrequencia(porSemana) {
  const v = numero(porSemana);
  if (v === null) return null;
  if (v >= 7) return "Elite";
  if (v >= 1) return "High";
  if (v >= POR_SEMANA_1_POR_MES) return "Medium";
  return "Low";
}

export function classificarLeadTime(dias) {
  const v = numero(dias);
  if (v === null) return null;
  if (v < 1) return "Elite";
  if (v < 7) return "High";
  if (v < 30) return "Medium";
  return "Low";
}

export function classificarCFR(proporcao) {
  const v = numero(proporcao);
  if (v === null) return null;
  if (v <= 0.15) return "Elite";
  if (v <= 0.3) return "High";
  if (v <= 0.45) return "Medium";
  return "Low";
}

export function classificarRecuperacao(horas) {
  const v = numero(horas);
  if (v === null) return null;
  if (v < 1) return "Elite";
  if (v < HORAS_POR_DIA) return "High";
  if (v < HORAS_POR_SEMANA) return "Medium";
  return "Low";
}

// Mediana dos pontos, arredondada para baixo -> categoria geral.
// Com numero par de metricas a mediana cai entre dois valores; o arredondamento
// para baixo do enunciado resolve o empate pelo lado conservador.
export function categoriaGeral(categorias) {
  const pontos = categorias.filter((c) => c !== null && c !== undefined).map((c) => PONTOS[c]);
  if (pontos.length === 0) return { categoria: null, pontos: null, metricas: 0 };
  pontos.sort((a, b) => a - b);
  const meio = Math.floor(pontos.length / 2);
  const mediana =
    pontos.length % 2 === 0 ? (pontos[meio - 1] + pontos[meio]) / 2 : pontos[meio];
  const pontuacao = Math.floor(mediana);
  return {
    categoria: CATEGORIAS.find((c) => PONTOS[c] === pontuacao) ?? null,
    pontos: pontuacao,
    metricas: pontos.length,
  };
}

// Classifica um repositorio nas quatro metricas e no geral.
// Recebe os valores ja extraidos (e nao a linha do CSV) porque a RQ 07 chama
// esta mesma funcao com as colunas das outras combinacoes.
export function classificarRepositorio({ frequenciaPorSemana, leadTimeDias, cfr, recuperacaoHoras }) {
  const porMetrica = {
    deployment_frequency: classificarFrequencia(frequenciaPorSemana),
    lead_time: classificarLeadTime(leadTimeDias),
    change_failure_rate: classificarCFR(cfr),
    time_to_restore: classificarRecuperacao(recuperacaoHoras),
  };
  const geral = categoriaGeral(Object.values(porMetrica));
  return { porMetrica, ...geral };
}

// Quantos repositorios em cada categoria (inclui os sem classificacao).
export function distribuicao(categorias) {
  const contagem = Object.fromEntries(CATEGORIAS.map((c) => [c, 0]));
  contagem.sem_classificacao = 0;
  for (const c of categorias) {
    if (c === null || c === undefined) contagem.sem_classificacao += 1;
    else contagem[c] += 1;
  }
  return contagem;
}
