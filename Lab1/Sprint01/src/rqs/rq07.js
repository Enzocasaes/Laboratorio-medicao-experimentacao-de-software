/**
 * RQ07 (bonus) - metricas por linguagem primaria.
 *
 * Diferente das RQ01-06 (uma linha por repositorio), esta RQ e AGREGADA:
 * agrupa os repositorios por linguagem primaria e resume, para cada grupo, a
 * mediana de PRs aceitas, de releases e de dias desde a ultima atualizacao.
 *
 * Por isso ela expoe "analisar(repos)" em vez de "extrair/resumir": recebe a
 * lista inteira ja coletada e devolve as linhas do CSV (uma por linguagem).
 */
import { calcularMediana } from "../estatisticas.js";
import { converterUpdatedAt, calcularDiasDesdeAtualizacao } from "../tempo-atualizacao.js";

const SEM_LINGUAGEM = "Sem linguagem primaria";

export const RQ07 = {
  chave: "rq07",
  titulo: "RQ07 - metricas por linguagem primaria",
  arquivoCSV: "rq07PorLinguagem.csv",
  cabecalhoCSV: [
    "linguagem_primaria",
    "quantidade_repositorios",
    "mediana_pull_requests_aceitas",
    "mediana_releases",
    "mediana_dias_desde_atualizacao",
  ],

  analisar(repositorios, { agora }) {
    const grupos = new Map();
    for (const repo of repositorios) {
      const prs = repo.pullRequests?.totalCount;
      const releases = repo.releases?.totalCount;
      if (typeof prs !== "number" || typeof releases !== "number") continue;

      const linguagem = repo.primaryLanguage?.name ?? SEM_LINGUAGEM;
      const dias = calcularDiasDesdeAtualizacao(converterUpdatedAt(repo.updatedAt), agora);

      const grupo = grupos.get(linguagem) ?? { prs: [], releases: [], dias: [] };
      grupo.prs.push(prs);
      grupo.releases.push(releases);
      grupo.dias.push(dias);
      grupos.set(linguagem, grupo);
    }

    const linhas = [...grupos.entries()]
      .map(([linguagem, g]) => [
        linguagem,
        g.prs.length,
        calcularMediana(g.prs),
        calcularMediana(g.releases),
        calcularMediana(g.dias).toFixed(2),
      ])
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

    console.log("Linguagem | Repos | Mediana PRs | Mediana releases | Mediana dias");
    for (const linha of linhas) console.log(linha.join(" | "));

    return linhas;
  },
};
