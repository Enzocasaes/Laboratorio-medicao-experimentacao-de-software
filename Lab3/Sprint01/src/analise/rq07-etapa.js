// Etapa "sensibilidade" (RQ 07): roda a analise das tres combinacoes sobre o
// dataset e grava os resultados. Offline - nao toca a rede.
//
// Saidas (em <diretorios.saida>):
//   processed/rq07_classificacao.csv  uma linha por repositorio, com a
//                                     categoria em cada combinacao
//   processed/rq07_sensibilidade.csv  uma linha por par de combinacoes
//   ../docs/analise-rq07.md           o relatorio para o artigo

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gerarCSV, lerCSV } from "../csv.js";
import { logSilencioso } from "../log.js";
import { CATEGORIAS } from "./dora.js";
import {
  COMBINACOES,
  classificarCombinacoes,
  compararCombinacoes,
  distribuicaoPorCombinacao,
} from "./rq07.js";

export const COLUNAS_CLASSIFICACAO = Object.freeze([
  "full_name",
  "rank",
  ...COMBINACOES.flatMap((c) => [
    `${c.id}_categoria`,
    `${c.id}_metricas`,
    `${c.id}_frequencia`,
    `${c.id}_lead_time`,
    `${c.id}_cfr`,
  ]),
]);

export const COLUNAS_SENSIBILIDADE = Object.freeze([
  "par",
  "n",
  "mudaram",
  "mudaram_percentual",
  "distancia_media",
  "distancia_maxima",
  "kappa_ponderado",
  "interpretacao",
  "concordancia_exata",
]);

export function caminhosDeSaida(dirSaida) {
  return {
    classificacao: join(dirSaida, "processed", "rq07_classificacao.csv"),
    sensibilidade: join(dirSaida, "processed", "rq07_sensibilidade.csv"),
    relatorio: join(dirSaida, "..", "docs", "analise-rq07.md"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

function registrosDeCSV(caminho) {
  if (!existsSync(caminho)) return [];
  const { cabecalho, linhas } = lerCSV(readFileSync(caminho, "utf8"));
  return linhas.map((linha) => Object.fromEntries(cabecalho.map((c, i) => [c, linha[i]])));
}

// { full_name -> tags na janela }, da etapa "tags". Sem o arquivo, C3 fica sem
// frequencia de deploy - o relatorio avisa, em vez de inventar zero.
export function tagsPorRepositorio(dirSaida) {
  const mapa = new Map();
  for (const r of registrosDeCSV(join(dirSaida, "processed", "tags_resumo.csv"))) {
    const n = Number(r.tags_in_window);
    if (Number.isFinite(n)) mapa.set(r.full_name, n);
  }
  return mapa;
}

const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

export function gerarRelatorioMarkdown({ distribuicoes, comparacoes, total, semTags, geradoEm, janela }) {
  const linhas = [
    "# RQ 07 — análise de sensibilidade das definições operacionais",
    "",
    "> Arquivo **gerado** por `npm run analise:sensibilidade`. Não edite à mão.",
    "",
    `- Amostra: **${total} repositórios**. Janela: ${janela.inicio} a ${janela.fim}.`,
    `- Gerado em: ${geradoEm}.`,
    "",
    "## As três combinações",
    "",
    "| Combinação | Unidade de deploy | Lead time | CFR |",
    "|---|---|---|---|",
    ...COMBINACOES.map((c) => `| **${c.id}** | ${c.deploy} | ${c.leadTime} | ${c.cfr} |`),
    "",
    "O **tempo de recuperação (RQ 04) é o mesmo nas três**: ele vem dos workflow",
    "runs e não depende da unidade de deploy. Manter essa métrica fixa isola o",
    "efeito do que realmente muda entre as combinações.",
    "",
    "## Distribuição das categorias",
    "",
    "| Combinação | Elite | High | Medium | Low | Sem classificação |",
    "|---|---|---|---|---|---|",
    ...distribuicoes.map(
      (d) => `| ${d.id} | ${d.Elite} | ${d.High} | ${d.Medium} | ${d.Low} | ${d.sem_classificacao} |`
    ),
    "",
    "## Quanto muda de uma definição para outra",
    "",
    "| Par | n | Mudaram de categoria | Distância média | Máxima | Kappa ponderado | Concordância |",
    "|---|---|---|---|---|---|---|",
    ...comparacoes.map(
      (c) =>
        `| ${c.par} | ${c.n} | **${c.mudaram}** (${pct(c.mudaram_percentual)}) | ${c.distancia_media} | ` +
        `${c.distancia_maxima} | **${c.kappa_ponderado}** | ${c.interpretacao} |`
    ),
    "",
    "O **kappa ponderado** (pesos lineares) leva em conta que as categorias são",
    "ordenadas: trocar Elite por High pesa menos do que trocar Elite por Low. A",
    "escala de interpretação é a de Landis & Koch, a mesma do kappa de Fleiss da",
    "validação manual.",
    "",
  ];

  if (semTags > 0) {
    linhas.push(
      `> **Atenção:** ${semTags} repositórios estão sem contagem de tags, então em C3`,
      "> eles são classificados apenas pelas métricas restantes. Rode",
      "> `npm run coletar:tags` para completar.",
      ""
    );
  }

  linhas.push("## Como refazer", "", "```bash", "cd Lab3/Sprint01", "npm run coletar:tags", "npm run analise:sensibilidade", "```", "");
  return linhas.join("\n");
}

export async function executarSensibilidade({ config, log = logSilencioso, agora = () => new Date() }) {
  const { janela, diretorios } = config;
  const caminhoDataset = join(diretorios.saida, "processed", "dataset.csv");
  if (!existsSync(caminhoDataset)) {
    throw new Error(`Nao ha ${caminhoDataset}: rode antes a etapa "dataset" (npm run dataset).`);
  }

  const repositorios = registrosDeCSV(caminhoDataset);
  const tags = tagsPorRepositorio(diretorios.saida);
  if (tags.size === 0) {
    log.aviso('nenhuma contagem de tags encontrada: C3 sai sem frequencia de deploy (rode "npm run coletar:tags")');
  }

  const classificados = classificarCombinacoes(repositorios, { janela, tagsPorRepositorio: tags });
  const comparacoes = compararCombinacoes(classificados);
  const distribuicoes = distribuicaoPorCombinacao(classificados);
  const semTags = repositorios.filter((r) => !tags.has(r.full_name)).length;

  const caminhos = caminhosDeSaida(diretorios.saida);
  escrever(
    caminhos.classificacao,
    gerarCSV(COLUNAS_CLASSIFICACAO, classificados.map((c) => COLUNAS_CLASSIFICACAO.map((coluna) => c[coluna] ?? "")))
  );
  escrever(
    caminhos.sensibilidade,
    gerarCSV(COLUNAS_SENSIBILIDADE, comparacoes.map((c) => COLUNAS_SENSIBILIDADE.map((coluna) => c[coluna] ?? "")))
  );
  escrever(
    caminhos.relatorio,
    gerarRelatorioMarkdown({
      distribuicoes,
      comparacoes,
      total: repositorios.length,
      semTags,
      geradoEm: agora().toISOString(),
      janela,
    })
  );

  for (const d of distribuicoes) {
    log.info(
      `${d.id}: Elite ${d.Elite}, High ${d.High}, Medium ${d.Medium}, Low ${d.Low}` +
        (d.sem_classificacao ? `, ${d.sem_classificacao} sem classificacao` : "")
    );
  }
  for (const c of comparacoes) {
    log.info(
      `${c.par}: ${c.mudaram} de ${c.n} mudaram de categoria (${pct(c.mudaram_percentual)}), ` +
        `kappa ponderado ${c.kappa_ponderado} (${c.interpretacao})`
    );
  }
  log.info(`saidas: ${caminhos.classificacao}, ${caminhos.sensibilidade}, ${caminhos.relatorio}`);

  return { classificados, comparacoes, distribuicoes, semTags, caminhos, categorias: CATEGORIAS };
}
