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

    let falhas = 0;
    for (const repo of repositorios) {
      const est = repo.stargazerCount;
      const prs = repo.pullRequests?.totalCount;
      const releases = repo.releases?.totalCount;
      if (typeof est !== "number" || typeof prs !== "number" || typeof releases !== "number") continue;

      // calcularDiasDesdeAtualizacao lanca erro se updatedAt for invalido ou
      // (por causa de deriva de relogio entre esta maquina e o servidor do
      // GitHub) vier "no futuro" em relacao a `agora`. Isso e uma condicao de
      // 1 repositorio, entao isolamos por repositorio - sem o try/catch, uma
      // unica falha derrubaria a analise inteira e nenhum CSV seria gravado.
      let dias;
      try {
        dias = calcularDiasDesdeAtualizacao(converterUpdatedAt(repo.updatedAt), agora);
      } catch (erro) {
        console.log(`FALHA ${repo.nameWithOwner.padEnd(30)} ${erro.message}`);
        falhas += 1;
        continue;
      }

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
    if (falhas > 0) console.log(`Falhas (data invalida ou no futuro): ${falhas}`);
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
