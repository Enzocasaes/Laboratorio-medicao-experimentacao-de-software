// Etapa "runs" do pipeline (Pessoa C): workflow runs do default branch,
// change failure rate (RQ 03 a) e tempo de recuperacao (RQ 04).
//
// Roda DEPOIS de "releases": quem ficou abaixo de 5 releases ja saiu do funil,
// e a lista de repositoriosParaColeta() traz so' quem ainda disputa a amostra
// final - cada repositorio aqui custa ~12 requisicoes (uma por mes da janela),
// entao nao vale gastar com quem ja foi excluido.
//
// Ao final, devolve `valid_workflow_runs` ao funil (atualizarCriterios), que
// aplica o criterio minimo de 50 runs validos e, quando nao resta nenhum
// pendente, fecha a amostra final.
//
// Saidas (em <diretorios.saida>):
//   processed/workflow_runs.csv     uma linha por run coletado (dado bruto)
//   processed/recovery_episodes.csv uma linha por episodio de falha (RQ 04)
//   processed/dora_runs.csv         uma linha por repositorio (CFR + recuperacao)
//   raw/workflow_runs.json          fatias mensais, contagens e erros, para auditoria

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { atualizarCriterios, repositoriosParaColeta } from "../selecao/index.js";
import { coletarWorkflowRuns, fatiasMensais } from "./coleta.js";
import {
  COLUNAS_DORA_RUNS,
  COLUNAS_EPISODIOS,
  episodiosDeFalha,
  paraLinhaDoraCSV,
  paraLinhaEpisodioCSV,
  resumirRepositorio,
} from "./metricas.js";
import { COLUNAS_RUNS, contarRuns, paraLinhaRunCSV } from "./modelo.js";

export function caminhosDeSaida(dirSaida) {
  return {
    runsJson: join(dirSaida, "raw", "workflow_runs.json"),
    runs: join(dirSaida, "processed", "workflow_runs.csv"),
    episodios: join(dirSaida, "processed", "recovery_episodes.csv"),
    dora: join(dirSaida, "processed", "dora_runs.csv"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

function alvos(registros, limite) {
  const ordenados = [...registros].sort((a, b) => a.rank - b.rank);
  return limite ? ordenados.slice(0, limite) : ordenados;
}

export async function executarRuns({ config, cliente, log = logSilencioso, limite = null, agora = () => new Date() }) {
  const { janela, coleta, selecao, diretorios } = config;
  const registros = alvos(repositoriosParaColeta(diretorios.saida), limite);
  const semContagemDeReleases = registros.filter((r) => r.releases_in_window === null).length;
  if (semContagemDeReleases > 0) {
    log.aviso(
      `${semContagemDeReleases} repositorios ainda sem contagem de releases; rodar a etapa "releases" antes economiza requisicoes`
    );
  }
  const meses = fatiasMensais(janela).length;
  log.info(
    `${registros.length} repositorios para coletar workflow runs em ${meses} fatias mensais${limite ? ` (--limite ${limite})` : ""}`
  );

  const linhasDeRuns = [];
  const linhasDeEpisodios = [];
  const resumos = [];
  const porRepositorio = [];
  const contagensParaOFunil = {};
  let comErro = 0;
  let comFatiaTruncada = 0;

  for (const [indice, registro] of registros.entries()) {
    const prefixo = `[${indice + 1}/${registros.length}] ${registro.full_name}`;
    const branch = registro.default_branch ?? "main";

    const coletado = await coletarWorkflowRuns(cliente, registro.full_name, janela, {
      branch,
      porPagina: coleta.runsPorPagina,
      maxPaginas: coleta.maxPaginasDeRunsPorMes,
      log,
    });

    const contagens = contarRuns(coletado.runs, { defaultBranch: branch });
    const episodios = episodiosDeFalha(coletado.runs, { defaultBranch: branch });
    const fatiasTruncadas = coletado.fatias.filter((f) => f.truncated).length;

    const resumo = resumirRepositorio({
      fullName: registro.full_name,
      rank: registro.rank,
      defaultBranch: branch,
      contagens,
      episodios,
      fatiasTruncadas,
      erro: coletado.erro,
    });
    resumos.push(resumo);

    for (const run of coletado.runs) linhasDeRuns.push(paraLinhaRunCSV(registro.full_name, run));
    for (const episodio of episodios) linhasDeEpisodios.push(paraLinhaEpisodioCSV(registro.full_name, episodio));

    porRepositorio.push({
      full_name: registro.full_name,
      rank: registro.rank,
      default_branch: branch,
      slices: coletado.fatias,
      pages: coletado.paginas,
      invalid_items: coletado.itensInvalidos,
      truncated: coletado.truncada,
      error: coletado.erro,
      counts: contagens,
    });

    if (coletado.erro !== null) {
      // Sem a janela inteira nao ha contagem confiavel: contar os runs das
      // fatias que vieram excluiria o repositorio por "menos de 50 runs" sem
      // ter medido. Ele segue pendente no funil.
      comErro += 1;
      log.aviso(`${prefixo}: workflow runs indisponiveis (${coletado.erro}); segue pendente no funil`);
      continue;
    }

    if (fatiasTruncadas > 0) comFatiaTruncada += 1;
    contagensParaOFunil[registro.full_name] = { valid_workflow_runs: contagens.valid_workflow_runs };
    log.info(
      `${prefixo}: ${contagens.valid_workflow_runs} runs validos ` +
        `(${contagens.successful_runs} ok, ${contagens.failed_runs} falhas, ${contagens.ignored_runs} ignorados), ` +
        `CFR ${resumo.change_failure_rate_ci ?? "?"}, ` +
        `recuperacao ${resumo.recovery_median_hours ?? "?"} h em ${resumo.recovery_episodes} episodio(s)` +
        `${resumo.recovery_episodes_censored ? `, ${resumo.recovery_episodes_censored} censurado(s)` : ""}`
    );
  }

  const caminhos = caminhosDeSaida(diretorios.saida);
  escrever(caminhos.runs, gerarCSV(COLUNAS_RUNS, linhasDeRuns));
  escrever(caminhos.episodios, gerarCSV(COLUNAS_EPISODIOS, linhasDeEpisodios));
  escrever(caminhos.dora, gerarCSV(COLUNAS_DORA_RUNS, resumos.map(paraLinhaDoraCSV)));
  escrever(
    caminhos.runsJson,
    JSON.stringify(
      {
        generated_at: agora().toISOString(),
        observation_window: { start: janela.inicio, end: janela.fim, days: janela.dias },
        coleta,
        limite,
        definicoes: {
          runs_considerados: "default branch, event=push, dentro da janela",
          sucesso: "conclusion = success",
          falha: "conclusion em failure, timed_out, startup_failure",
          ignorados: "cancelled, skipped, neutral, action_required, stale ou conclusion vazia",
          change_failure_rate_ci: "falhas / (falhas + sucessos) - proxy de CI, RQ 03 (a)",
          episodio_de_falha:
            "por workflow: comeca na primeira falha apos um sucesso e termina no proximo sucesso; " +
            "tempo = updated_at do sucesso - run_started_at da primeira falha",
          censura:
            "episodio sem sucesso ate o fim da janela entra como censored=1, fora da mediana; " +
            "falhas sem sucesso anterior entram como prior_success=0 e nao formam episodio",
          unidade: "horas",
        },
        repositorios: porRepositorio,
      },
      null,
      2
    ) + "\n"
  );

  const atualizada = atualizarCriterios(diretorios.saida, contagensParaOFunil);
  const acimaDoMinimo = Object.values(contagensParaOFunil).filter(
    (c) => c.valid_workflow_runs >= selecao.minimoDeWorkflowRuns
  ).length;
  const episodiosTotais = resumos.reduce((total, r) => total + r.recovery_episodes, 0);
  const censurados = resumos.reduce((total, r) => total + r.recovery_episodes_censored, 0);
  log.info(
    `etapa concluida: ${Object.keys(contagensParaOFunil).length} repositorios contados, ` +
      `${acimaDoMinimo} com >= ${selecao.minimoDeWorkflowRuns} runs validos, ${comErro} com erro de coleta, ` +
      `${comFatiaTruncada} com alguma fatia mensal truncada`
  );
  log.info(
    `recuperacao: ${episodiosTotais} episodios de falha, ${censurados} censurados ` +
      `(${episodiosTotais === 0 ? 0 : Math.round((censurados / episodiosTotais) * 100)}%)`
  );
  log.info(`saidas: ${caminhos.dora}, ${caminhos.episodios}, ${caminhos.runs}, ${caminhos.runsJson}`);
  return { resumos, porRepositorio, selecao: atualizada };
}
