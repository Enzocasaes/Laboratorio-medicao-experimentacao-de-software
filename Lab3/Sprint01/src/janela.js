// Janela de observacao (secao 3 do enunciado): 12 meses com inicio e fim
// fixados pelo professor. As datas entram no config.json como "AAAA-MM-DD" e
// sao interpretadas em UTC, porque todas as datas da API do GitHub vem em UTC.
//
// Convencao: o dia de "fim" esta DENTRO da janela. Internamente a janela e'
// o intervalo semiaberto [inicio 00:00Z, dia seguinte ao fim 00:00Z), o mesmo
// recorte do filtro "created=AAAA-MM-DD..AAAA-MM-DD" da API, que e' inclusivo
// nas duas pontas. Este modulo e' compartilhado: B e C devem usar
// estaNaJanela() para filtrar releases e workflow runs.

export const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_POR_ANO = 365.25; // media que considera anos bissextos (mesma do Lab01)

const FORMATO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

// "AAAA-MM-DD" -> milissegundos (UTC, 00:00). Rejeita formatos frouxos
// ("2025-1-1") e datas que nao existem no calendario ("2025-02-30").
export function lerDataISO(texto, nomeDoCampo = "data") {
  if (typeof texto !== "string" || !FORMATO_DATA.test(texto)) {
    throw new Error(`${nomeDoCampo} invalida: "${texto}" (use o formato AAAA-MM-DD)`);
  }
  const [, ano, mes, dia] = texto.match(FORMATO_DATA).map(Number);
  const ms = Date.UTC(ano, mes - 1, dia);
  const data = new Date(ms);
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    throw new Error(`${nomeDoCampo} invalida: "${texto}" nao existe no calendario`);
  }
  return ms;
}

export function criarJanela(inicio, fim) {
  const inicioMs = lerDataISO(inicio, "janela.inicio");
  const fimMs = lerDataISO(fim, "janela.fim");
  if (fimMs < inicioMs) {
    throw new Error(`janela.fim (${fim}) e' anterior a janela.inicio (${inicio})`);
  }
  const fimExclusivoMs = fimMs + DIA_MS;
  return {
    inicio,
    fim,
    inicioMs,
    fimExclusivoMs,
    dias: Math.round((fimExclusivoMs - inicioMs) / DIA_MS),
  };
}

function paraMs(data) {
  if (data instanceof Date) return data.getTime();
  if (typeof data === "string" && data !== "") return Date.parse(data);
  return Number.NaN;
}

// true se o instante (ISO 8601 da API ou Date) cai dentro da janela.
export function estaNaJanela(data, janela) {
  const ms = paraMs(data);
  if (Number.isNaN(ms)) return false;
  return ms >= janela.inicioMs && ms < janela.fimExclusivoMs;
}

// Idade do repositorio em relacao ao FIM da janela (e nao a data da execucao):
// assim a idade nao muda conforme o dia em que a coleta roda, e todos os
// repositorios sao medidos no mesmo instante de referencia.
//
// posicao indica onde a criacao cai em relacao a janela:
//   before_window  -> repositorio observado durante a janela inteira
//   within_window  -> criado durante a janela (exposicao menor que 12 meses)
//   after_window   -> criado depois do fim (idade negativa; nao tem dados na janela)
export function calcularIdade(createdAt, janela) {
  const criadoMs = paraMs(createdAt);
  if (Number.isNaN(criadoMs)) {
    return { idadeDias: null, idadeAnos: null, posicao: null };
  }
  const diferencaMs = janela.fimExclusivoMs - criadoMs;
  let posicao = "before_window";
  if (criadoMs >= janela.fimExclusivoMs) posicao = "after_window";
  else if (criadoMs >= janela.inicioMs) posicao = "within_window";
  return {
    idadeDias: Math.floor(diferencaMs / DIA_MS),
    idadeAnos: Number((diferencaMs / (DIAS_POR_ANO * DIA_MS)).toFixed(2)),
    posicao,
  };
}
