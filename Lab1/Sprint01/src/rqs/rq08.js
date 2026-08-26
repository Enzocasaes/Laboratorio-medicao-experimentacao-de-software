import { correlacaoPearson } from "../estatisticas.js";
import { converterUpdatedAt, calcularDiasDesdeAtualizacao } from "../tempo-atualizacao.js";

// RQ08 (inovacao do grupo, nao faz parte do enunciado): sera que a
// popularidade (estrelas) e um bom proxy para as demais caracteristicas do
// repositorio, ou sao dimensoes independentes? Nenhuma das RQ01-07 usa o
// numero de estrelas como variavel - so como criterio de amostragem.
export const RQ08 = {
  chave: "rq08",
  titulo: "RQ08 (inovacao) - correlacao entre estrelas e as demais metricas",
  arquivoCSV: "rq08Correlacao.csv",
  cabecalhoCSV: ["repositorio", "estrelas", "pull_requests_aceitas", "total_releases", "dias_desde_atualizacao"],

  analisar(repositorios, { agora }) {
    const linhas = [];
    const estrelas = [];
    const prsPorRepo = [];
    const releasesPorRepo = [];
    const diasPorRepo = [];

    for (const repo of repositorios) {
      const est = repo.stargazerCount;
      const prs = repo.pullRequests?.totalCount;
      const releases = repo.releases?.totalCount;
      if (typeof est !== "number" || typeof prs !== "number" || typeof releases !== "number") continue;

      const dias = calcularDiasDesdeAtualizacao(converterUpdatedAt(repo.updatedAt), agora);

      linhas.push([repo.nameWithOwner, est, prs, releases, dias.toFixed(2)]);
      estrelas.push(est);
      prsPorRepo.push(prs);
      releasesPorRepo.push(releases);
      diasPorRepo.push(dias);
    }

    const rPrs = correlacaoPearson(estrelas, prsPorRepo);
    const rReleases = correlacaoPearson(estrelas, releasesPorRepo);
    const rDias = correlacaoPearson(estrelas, diasPorRepo);

    console.log(`Processados: ${linhas.length}/${repositorios.length}`);
    console.log("\nCorrelacao de Pearson entre estrelas e cada metrica (-1 a 1):");
    console.log(`  estrelas x pull_requests_aceitas      : r = ${rPrs.toFixed(3)}`);
    console.log(`  estrelas x total_releases              : r = ${rReleases.toFixed(3)}`);
    console.log(`  estrelas x dias_desde_atualizacao       : r = ${rDias.toFixed(3)}`);
    console.log(
      "\n(|r| < 0.1 praticamente nula, 0.1-0.3 fraca, 0.3-0.5 moderada, > 0.5 forte - correlacao nao implica causalidade)"
    );

    return linhas;
  },
};
