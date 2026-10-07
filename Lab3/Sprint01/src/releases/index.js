// Etapas "releases" e "leadtime" do pipeline (Pessoa B).
//
//   releases  -> lista as releases de cada repositorio da selecao, conta as
//                publicadas na janela e devolve a contagem ao funil
//                (atualizarCriterios), aplicando o criterio de >= 5 releases.
//   leadtime  -> para os repositorios que passaram nesse criterio, compara
//                cada release com a anterior e calcula o lead time (RQ 02).
//
// As duas sao separadas de proposito: `releases` custa ~1 requisicao por
// repositorio e precisa rodar nos 1.321 candidatos para que o corte da amostra
// final seja correto; `leadtime` custa 1 requisicao por RELEASE e so' faz
// sentido em quem sobreviveu ao filtro.
//
// Saidas (em <diretorios.saida>):
//   processed/releases.csv         uma linha por release coletada
//   processed/release_commits.csv  uma linha por release avaliada (lead time (a))
//   processed/lead_time.csv        uma linha por repositorio (variantes (a) e (b))
//   raw/releases.json              resumo da coleta por repositorio
//   raw/lead_time.json             detalhe por release, para auditoria

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { STATUS } from "../selecao/modelo.js";
import { atualizarCriterios, carregarSelecao, repositoriosParaColeta } from "../selecao/index.js";
import { coletarReleases } from "./coleta.js";
import { coletarCommitsEntreReleases } from "./commits.js";
import {
  COLUNAS_LEAD_TIME,
  COLUNAS_RELEASE_COMMITS,
  avaliarRelease,
  paraLinhaLeadTimeCSV,
  paraLinhaReleaseCommitsCSV,
  paresParaAvaliar,
  resumirRepositorio,
  sequenciaDeDeploys,
} from "./leadtime.js";
import { COLUNAS_RELEASES, contarReleases, paraLinhaReleaseCSV } from "./modelo.js";

export function caminhosDeSaida(dirSaida) {
  return {
    releasesJson: join(dirSaida, "raw", "releases.json"),
    leadTimeJson: join(dirSaida, "raw", "lead_time.json"),
    releases: join(dirSaida, "processed", "releases.csv"),
    releaseCommits: join(dirSaida, "processed", "release_commits.csv"),
    leadTime: join(dirSaida, "processed", "lead_time.csv"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

// Ordena por rank e, com --limite, pega os N primeiros (os de mais estrelas).
// Os nao processados continuam `pending` no funil, em vez de serem contados
// como se nao tivessem releases.
function alvos(registros, limite) {
  const ordenados = [...registros].sort((a, b) => a.rank - b.rank);
  return limite ? ordenados.slice(0, limite) : ordenados;
}

// ---- etapa "releases" ----------------------------------------------------

export async function executarReleases({ config, cliente, log = logSilencioso, limite = null, agora = () => new Date() }) {
  const { janela, coleta, diretorios } = config;
  const registros = alvos(repositoriosParaColeta(diretorios.saida), limite);
  log.info(`${registros.length} repositorios para coletar releases${limite ? ` (--limite ${limite})` : ""}`);

  const linhasDeReleases = [];
  const porRepositorio = [];
  const contagensParaOFunil = {};
  let comErro = 0;

  for (const [indice, registro] of registros.entries()) {
    const prefixo = `[${indice + 1}/${registros.length}] ${registro.full_name}`;
    const coletado = await coletarReleases(cliente, registro.full_name, janela, {
      porPagina: coleta.releasesPorPagina,
      maxPaginas: coleta.maxPaginasDeReleases,
      log,
    });

    sequenciaDeDeploys(coletado.releases); // marca deploy_index
    const contagens = contarReleases(coletado.releases);
    for (const release of coletado.releases) linhasDeReleases.push(paraLinhaReleaseCSV(registro.full_name, release));

    porRepositorio.push({
      full_name: registro.full_name,
      rank: registro.rank,
      ...contagens,
      pages: coletado.paginas,
      invalid_items: coletado.itensInvalidos,
      truncated: coletado.truncada,
      has_predecessor: coletado.temPredecessor,
      error: coletado.erro,
    });

    if (coletado.erro !== null) {
      // Sem resposta nao ha contagem: o repositorio fica `pending` no funil.
      // Contar 0 releases seria excluí-lo por "menos de 5 releases", o que
      // nao foi medido - e' erro de coleta, nao caracteristica do repositorio.
      comErro += 1;
      log.aviso(`${prefixo}: releases indisponiveis (${coletado.erro}); segue pendente no funil`);
      continue;
    }

    contagensParaOFunil[registro.full_name] = { releases_in_window: contagens.releases_in_window };
    log.info(
      `${prefixo}: ${contagens.releases_in_window} releases na janela ` +
        `(${contagens.releases_total} no total, ${coletado.paginas} pagina(s)` +
        `${coletado.temPredecessor ? "" : ", sem release anterior a janela"})`
    );
  }

  const caminhos = caminhosDeSaida(diretorios.saida);
  escrever(caminhos.releases, gerarCSV(COLUNAS_RELEASES, linhasDeReleases));
  escrever(
    caminhos.releasesJson,
    JSON.stringify(
      {
        generated_at: agora().toISOString(),
        observation_window: { start: janela.inicio, end: janela.fim, days: janela.dias },
        coleta,
        limite,
        repositorios: porRepositorio,
      },
      null,
      2
    ) + "\n"
  );

  const atualizada = atualizarCriterios(diretorios.saida, contagensParaOFunil);
  const comReleases = Object.values(contagensParaOFunil).filter(
    (c) => c.releases_in_window >= config.selecao.minimoDeReleases
  ).length;
  log.info(
    `etapa concluida: ${Object.keys(contagensParaOFunil).length} repositorios contados, ` +
      `${comReleases} com >= ${config.selecao.minimoDeReleases} releases na janela, ${comErro} com erro de coleta`
  );
  log.info(`saidas: ${caminhos.releases}, ${caminhos.releasesJson}`);
  return { porRepositorio, selecao: atualizada };
}

// ---- etapa "leadtime" ----------------------------------------------------

// Repositorios aptos ao lead time: nao excluidos e com a contagem de releases
// ja feita e acima do minimo. Sem isso, as chamadas de `compare` (as mais caras
// do laboratorio) seriam gastas em repositorios que vao sair do funil.
export function repositoriosParaLeadTime(dirSaida) {
  const dados = carregarSelecao(dirSaida);
  const minimo = dados.selecao.minimoDeReleases;
  return dados.registros.filter(
    (r) => r.status !== STATUS.EXCLUIDO && r.releases_in_window !== null && r.releases_in_window >= minimo
  );
}

export async function executarLeadTime({ config, cliente, log = logSilencioso, limite = null, agora = () => new Date() }) {
  const { janela, coleta, diretorios } = config;
  const registros = alvos(repositoriosParaLeadTime(diretorios.saida), limite);
  if (registros.length === 0) {
    log.aviso('nenhum repositorio com a contagem de releases feita; rode antes a etapa "releases"');
  }
  log.info(`${registros.length} repositorios para calcular lead time${limite ? ` (--limite ${limite})` : ""}`);

  const linhasDeCommits = [];
  const resumos = [];
  const detalhe = [];

  for (const [indice, registro] of registros.entries()) {
    const prefixo = `[${indice + 1}/${registros.length}] ${registro.full_name}`;
    // Vem inteiro do cache em disco (a etapa "releases" ja pediu estas
    // paginas): uma fonte de verdade so', sem reparsear o CSV.
    const coletado = await coletarReleases(cliente, registro.full_name, janela, {
      porPagina: coleta.releasesPorPagina,
      maxPaginas: coleta.maxPaginasDeReleases,
      log,
    });
    const deploys = sequenciaDeDeploys(coletado.releases);
    const contagens = contarReleases(coletado.releases);

    const avaliacoes = [];
    for (const { release, base } of paresParaAvaliar(deploys)) {
      if (base === null || release.tag_name === null || base.tag_name === null) {
        avaliacoes.push(avaliarRelease({ release, base }));
        continue;
      }
      const commits = await coletarCommitsEntreReleases(cliente, registro.full_name, base.tag_name, release.tag_name, {
        porPagina: coleta.commitsPorPagina,
        maxCommits: coleta.maxCommitsPorRelease,
        log,
      });
      avaliacoes.push(
        avaliarRelease({
          release,
          base,
          commits: commits.commits,
          commitsTotal: commits.total,
          truncada: commits.truncada,
          erro: commits.erro,
        })
      );
    }

    const resumo = resumirRepositorio(registro.full_name, contagens, avaliacoes);
    resumos.push(resumo);
    for (const avaliacao of avaliacoes) {
      linhasDeCommits.push(paraLinhaReleaseCommitsCSV(registro.full_name, avaliacao));
    }
    // `horas` tem um valor por commit (pode ser milhares): fica fora do JSON.
    detalhe.push({
      full_name: registro.full_name,
      rank: registro.rank,
      releases: avaliacoes.map(({ horas, ...resto }) => resto),
    });

    const avaliadas = resumo.releases_evaluated;
    log.info(
      `${prefixo}: ${avaliadas} de ${contagens.releases_in_window} releases avaliadas, ` +
        `lead time (a) ${resumo.lead_time_release_median_days ?? "?"} d / (b) ${resumo.lead_time_commit_median_days ?? "?"} d` +
        `${resumo.errors ? ` [${resumo.errors}]` : ""}`
    );
  }

  const caminhos = caminhosDeSaida(diretorios.saida);
  escrever(caminhos.releaseCommits, gerarCSV(COLUNAS_RELEASE_COMMITS, linhasDeCommits));
  escrever(caminhos.leadTime, gerarCSV(COLUNAS_LEAD_TIME, resumos.map(paraLinhaLeadTimeCSV)));
  escrever(
    caminhos.leadTimeJson,
    JSON.stringify(
      {
        generated_at: agora().toISOString(),
        observation_window: { start: janela.inicio, end: janela.fim, days: janela.dias },
        coleta,
        limite,
        definicoes: {
          deploy: "release com draft=false, prerelease=false e published_at preenchido",
          release_anterior: "release imediatamente anterior na sequencia de deploys, ordenada por published_at",
          data_do_commit: "commit.author.date",
          variante_a: "published_at(R) - data do commit mais antigo de R; valor do repositorio = mediana das releases",
          variante_b: "published_at(R) - data de cada commit; valor do repositorio = mediana de todos os commits",
          unidade: "horas",
        },
        repositorios: detalhe,
      },
      null,
      2
    ) + "\n"
  );

  const avaliadas = resumos.reduce((total, r) => total + r.releases_evaluated, 0);
  const semAnterior = resumos.reduce((total, r) => total + r.releases_skipped_no_predecessor, 0);
  const negativos = resumos.reduce((total, r) => total + r.negative_lead_time_commits, 0);
  log.info(
    `etapa concluida: ${avaliadas} releases avaliadas em ${resumos.length} repositorios, ` +
      `${semAnterior} ignoradas por nao ter release anterior, ${negativos} commits com lead time negativo`
  );
  log.info(`saidas: ${caminhos.leadTime}, ${caminhos.releaseCommits}, ${caminhos.leadTimeJson}`);
  return { resumos, detalhe };
}
