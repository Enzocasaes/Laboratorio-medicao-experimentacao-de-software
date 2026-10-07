// Lead time for changes (RQ 02), nas DUAS variantes obrigatorias.
//
// Definicao operacional (secao 3 e RQ 02 do enunciado):
//   - a release anterior de R e' a release imediatamente anterior na sequencia
//     de DEPLOYS do repositorio (releases publicadas, nao-draft e
//     nao-prerelease), ordenada por published_at. Ela pode estar FORA da
//     janela; se R e' a primeira release da historia, R e' ignorada.
//   - os commits de R vem de compare/{anterior}...{R}, e a data de um commit e'
//     commit.author.date.
//   - (a) POR RELEASE: published_at(R) - data do commit mais antigo de R.
//         Valor do repositorio = mediana das suas releases da janela.
//   - (b) POR COMMIT: published_at(R) - data do commit, para cada commit.
//         Valor do repositorio = mediana de TODOS os commits de TODAS as
//         releases.
//
// Exemplo do enunciado: v1.1 publicada em 15/03 com commits de 02/03, 10/03 e
// 14/03 -> (a) = 13 dias; (b) contribui com 13, 5 e 1 dias.
//
// Este modulo e' PURO: nenhuma funcao aqui faz requisicao, le arquivo ou olha o
// relogio. E' o modulo coberto pelos testes com fixtures (test/leadtime.test.js).

export const HORA_MS = 60 * 60 * 1000;
const HORAS_POR_DIA = 24;

// Situacao de uma release diante do calculo de lead time.
export const AVALIACAO = Object.freeze({
  AVALIADA: "evaluated", // entrou nas duas variantes
  SEM_ANTERIOR: "no_predecessor", // primeira release da historia: ignorada (enunciado)
  SEM_COMMITS: "no_new_commits", // comparacao sem nenhum commit com data
  SEM_TAG: "missing_tag_name", // release (ou a anterior) sem tag: nao da para comparar
  ERRO: "error", // a comparacao falhou (ver o motivo em `error`)
});

export function arredondar(valor, casas = 3) {
  if (valor === null || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

// Percentil com interpolacao linear - o mesmo metodo padrao do numpy
// (`np.percentile`, method="linear"), para que a analise em Python da Sprint 03
// reproduza exatamente estes numeros.
export function percentil(valores, p) {
  const ordenado = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (ordenado.length === 0) return null;
  const posicao = (ordenado.length - 1) * p;
  const abaixo = Math.floor(posicao);
  const acima = Math.ceil(posicao);
  if (abaixo === acima) return ordenado[abaixo];
  return ordenado[abaixo] + (ordenado[acima] - ordenado[abaixo]) * (posicao - abaixo);
}

// Mediana (e nao media): as distribuicoes de metricas de repositorio sao muito
// assimetricas e a media e' distorcida pelos extremos (secao 5 do enunciado).
export function mediana(valores) {
  return percentil(valores, 0.5);
}

// Intervalo interquartil: Q3 - Q1. Reportado junto da mediana em toda RQ.
export function iqr(valores) {
  const q1 = percentil(valores, 0.25);
  const q3 = percentil(valores, 0.75);
  return q1 === null || q3 === null ? null : q3 - q1;
}

// Horas decimais entre dois instantes ISO 8601. null se alguma data nao parseia.
// Pode ser NEGATIVO: rebase e squash merge reescrevem author.date, e um commit
// pode acabar com data posterior ao release que o contem.
export function horasEntre(inicio, fim) {
  const inicioMs = Date.parse(inicio);
  const fimMs = Date.parse(fim);
  if (Number.isNaN(inicioMs) || Number.isNaN(fimMs)) return null;
  return (fimMs - inicioMs) / HORA_MS;
}

// Sequencia de deploys do repositorio: releases publicadas (is_deploy),
// ordenadas por published_at crescente, empate pelo id (ordem deterministica,
// independente da ordem em que a API devolveu).
//
// Marca `deploy_index` (1, 2, 3...) nas releases recebidas - e' o unico efeito
// deste modulo sobre os seus argumentos, e existe para que o CSV de releases
// mostre a posicao de cada deploy.
export function sequenciaDeDeploys(releases) {
  const deploys = releases
    .filter((r) => r.is_deploy)
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at) || a.release_id - b.release_id);
  deploys.forEach((release, indice) => {
    release.deploy_index = indice + 1;
  });
  return deploys;
}

// Pares (release anterior, release) das releases da JANELA que podem ser
// avaliadas. A anterior vem da sequencia completa, entao pode estar fora da
// janela. A primeira release da historia entra com anterior = null, para ser
// contada como ignorada em vez de desaparecer.
export function paresParaAvaliar(deploys, { apenasDaJanela = true } = {}) {
  const pares = [];
  deploys.forEach((release, indice) => {
    if (apenasDaJanela && !release.in_window) return;
    pares.push({ release, base: indice === 0 ? null : deploys[indice - 1] });
  });
  return pares;
}

// Lead time de UMA release, a partir dos commits ja coletados.
// Devolve a linha de release_commits.csv mais `horas` (um valor por commit, a
// variante (b)), que o resumo do repositorio consome e descarta.
export function avaliarRelease({ release, base = null, commits = [], commitsTotal = null, truncada = false, erro = null }) {
  const linha = {
    release_id: release.release_id,
    tag_name: release.tag_name,
    published_at: release.published_at,
    base_tag: base?.tag_name ?? null,
    commits_total: commitsTotal,
    commits_fetched: commits.length,
    oldest_commit_date: null,
    lead_time_hours: null,
    truncated: truncada,
    negative_commits: 0,
    error: erro,
    status: AVALIACAO.AVALIADA,
    horas: [],
  };

  if (base === null) {
    linha.status = AVALIACAO.SEM_ANTERIOR;
    return linha;
  }
  if (release.tag_name === null || base.tag_name === null) {
    linha.status = AVALIACAO.SEM_TAG;
    linha.error = erro ?? AVALIACAO.SEM_TAG;
    return linha;
  }
  if (erro !== null) {
    linha.status = AVALIACAO.ERRO;
    return linha;
  }

  let maisAntigoMs = null;
  for (const commit of commits) {
    const valor = horasEntre(commit.data, release.published_at);
    if (valor === null) continue;
    linha.horas.push(arredondar(valor));
    if (valor < 0) linha.negative_commits += 1;
    const commitMs = Date.parse(commit.data);
    if (maisAntigoMs === null || commitMs < maisAntigoMs) {
      maisAntigoMs = commitMs;
      linha.oldest_commit_date = commit.data;
    }
  }

  if (linha.horas.length === 0) {
    linha.status = AVALIACAO.SEM_COMMITS;
    linha.oldest_commit_date = null;
    return linha;
  }

  // Variante (a): o commit MAIS ANTIGO da release. Vem do minimo sobre os
  // commits lidos, e nao da posicao na lista, para nao depender da ordem em
  // que a API devolveu a comparacao.
  linha.lead_time_hours = arredondar(horasEntre(linha.oldest_commit_date, release.published_at));
  return linha;
}

function resumirMotivos(contagem) {
  return [...contagem.entries()]
    .sort(([ma, a], [mb, b]) => b - a || (ma < mb ? -1 : 1))
    .map(([motivo, n]) => `${motivo}:${n}`)
    .join(";");
}

export const COLUNAS_LEAD_TIME = Object.freeze([
  "full_name",
  "releases_total",
  "releases_in_window",
  "prereleases_in_window",
  "published_releases_in_window",
  "releases_evaluated",
  "releases_skipped_no_predecessor",
  "releases_without_commits",
  "releases_with_error",
  "truncated_releases",
  "commits_used",
  "negative_lead_time_commits",
  "lead_time_release_median_hours",
  "lead_time_release_median_days",
  "lead_time_release_iqr_hours",
  "lead_time_commit_median_hours",
  "lead_time_commit_median_days",
  "lead_time_commit_iqr_hours",
  "errors",
]);

// Uma linha de lead_time.csv a partir das avaliacoes das releases do repositorio.
//
// Variante (a): mediana do lead time das releases avaliadas.
// Variante (b): mediana dos commits das releases avaliadas, EXCETO as
// truncadas - nelas falta parte dos commits, o que puxaria a mediana para os
// mais antigos. A release truncada continua na variante (a), onde so' o commit
// mais antigo importa.
export function resumirRepositorio(fullName, contagens, avaliacoes) {
  const porRelease = [];
  const porCommit = [];
  const motivos = new Map();
  const resumo = {
    full_name: fullName,
    releases_total: contagens.releases_total,
    releases_in_window: contagens.releases_in_window,
    prereleases_in_window: contagens.prereleases_in_window,
    published_releases_in_window: contagens.published_releases_in_window,
    releases_evaluated: 0,
    releases_skipped_no_predecessor: 0,
    releases_without_commits: 0,
    releases_with_error: 0,
    truncated_releases: 0,
    commits_used: 0,
    negative_lead_time_commits: 0,
  };

  for (const avaliacao of avaliacoes) {
    if (avaliacao.status === AVALIACAO.AVALIADA) {
      resumo.releases_evaluated += 1;
      resumo.negative_lead_time_commits += avaliacao.negative_commits;
      porRelease.push(avaliacao.lead_time_hours);
      if (avaliacao.truncated) {
        resumo.truncated_releases += 1;
      } else {
        for (const valor of avaliacao.horas) porCommit.push(valor);
      }
      continue;
    }
    if (avaliacao.status === AVALIACAO.SEM_ANTERIOR) resumo.releases_skipped_no_predecessor += 1;
    else if (avaliacao.status === AVALIACAO.SEM_COMMITS) resumo.releases_without_commits += 1;
    else resumo.releases_with_error += 1;
    if (avaliacao.error !== null) motivos.set(avaliacao.error, (motivos.get(avaliacao.error) ?? 0) + 1);
  }

  resumo.commits_used = porCommit.length;
  const medianaRelease = mediana(porRelease);
  const medianaCommit = mediana(porCommit);
  resumo.lead_time_release_median_hours = arredondar(medianaRelease);
  resumo.lead_time_release_median_days = arredondar(medianaRelease === null ? null : medianaRelease / HORAS_POR_DIA);
  resumo.lead_time_release_iqr_hours = arredondar(iqr(porRelease));
  resumo.lead_time_commit_median_hours = arredondar(medianaCommit);
  resumo.lead_time_commit_median_days = arredondar(medianaCommit === null ? null : medianaCommit / HORAS_POR_DIA);
  resumo.lead_time_commit_iqr_hours = arredondar(iqr(porCommit));
  resumo.errors = resumirMotivos(motivos);
  return resumo;
}

export function paraLinhaLeadTimeCSV(resumo) {
  return COLUNAS_LEAD_TIME.map((coluna) => resumo[coluna]);
}

export const COLUNAS_RELEASE_COMMITS = Object.freeze([
  "full_name",
  "release_id",
  "tag_name",
  "published_at",
  "base_tag",
  "commits_total",
  "commits_fetched",
  "oldest_commit_date",
  "lead_time_hours",
  "lead_time_days",
  "truncated",
  "negative_commits",
  "status",
  "error",
]);

export function paraLinhaReleaseCommitsCSV(fullName, avaliacao) {
  return COLUNAS_RELEASE_COMMITS.map((coluna) => {
    if (coluna === "full_name") return fullName;
    if (coluna === "lead_time_days") {
      return avaliacao.lead_time_hours === null ? null : arredondar(avaliacao.lead_time_hours / HORAS_POR_DIA);
    }
    return avaliacao[coluna];
  });
}
