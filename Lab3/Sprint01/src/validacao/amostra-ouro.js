// Amostra-ouro da validacao manual (secao 6 do enunciado): sorteia 60
// repositorios da amostra final e 5 releases de cada um, e gera a planilha que
// cada integrante preenche sozinho.
//
// REPRODUTIBILIDADE: o sorteio usa um gerador pseudoaleatorio proprio com
// SEMENTE FIXA (config.validacao.semente), e nao Math.random(), que nao aceita
// semente. Mesma semente + mesmo dataset = mesmo sorteio, em qualquer maquina -
// e' o equivalente do `df.sample(n=60, random_state=42)` que o enunciado pede.
//
// O sorteio sai da AMOSTRA FINAL: rodar isto antes de a coleta fechar sortearia
// de uma lista que ainda vai mudar, e a rotulagem feita viraria lixo.
//
// Cada integrante recebe uma copia da planilha, em branco, com link direto para
// cada release. Os tres rotulam SEM ver a saida da heuristica e SEM conversar
// entre si - e' isso que faz o kappa de Fleiss medir alguma coisa.

import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { carregarConfig } from "../config.js";
import { gerarCSV, lerTabelaCSV } from "../csv.js";
import { criarLog, logSilencioso } from "../log.js";

export const COLUNAS_AMOSTRA_OURO = Object.freeze([
  "repo_index",
  "repo_id", // id do repositorio na API: identifica a unidade mesmo se ele for renomeado
  "full_name",
  "repo_url",
  "stars",
  "language",
  "release_index",
  "release_id",
  "tag_name",
  "release_name",
  "published_at",
  "release_url",
]);

// Colunas que o avaliador preenche. As duas primeiras sao por REPOSITORIO
// (repetem em todas as linhas dele); a terceira e' por release.
export const COLUNAS_DE_ROTULO = Object.freeze([
  "tipo_do_projeto", // biblioteca/framework | aplicacao/servico | ferramenta cli | outro
  "releases_sao_entrega_real", // sim | nao | incerto
  "release_corretiva", // sim | nao
  "observacao",
]);

// Gerador pseudoaleatorio com semente (mulberry32): 32 bits, deterministico e
// curto o bastante para caber no artigo como "o sorteio pode ser refeito".
export function criarSorteio(semente) {
  let estado = semente >>> 0;
  return function proximo() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Embaralhamento de Fisher-Yates com o sorteio semeado. Nao altera a entrada.
export function embaralhar(itens, proximo) {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(proximo() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Sorteia `quantidade` itens (ou todos, se houver menos).
export function sortear(itens, quantidade, proximo) {
  return embaralhar(itens, proximo).slice(0, quantidade);
}

function lerCSVComoObjetos(caminho) {
  return lerTabelaCSV(caminho)?.registros ?? [];
}

// A populacao do sorteio e' posta numa ordem canonica (rank, depois
// full_name) ANTES de embaralhar: assim o resultado depende so' da semente e
// do conteudo do dataset, e nao da ordem em que as linhas estao no CSV.
export function ordemCanonica(repositorios) {
  return [...repositorios].sort(
    (a, b) => Number(a.rank) - Number(b.rank) || String(a.full_name).localeCompare(String(b.full_name))
  );
}

function sha256(caminho) {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex");
}

// Releases que podem ser rotuladas: deploy releases publicadas na janela (as
// mesmas que contam como entrega nas metricas), ordenadas da mais nova para a
// mais antiga, que e' como o avaliador vai ler as notas no GitHub.
export function releasesRotulaveis(releases, fullName) {
  return releases
    .filter((r) => r.full_name === fullName && r.is_deploy === "true" && r.in_window === "true")
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

// Monta as linhas da planilha: um bloco por repositorio, com as releases
// sorteadas dentro dele.
export function montarAmostra({ repositorios, releases, quantidadeDeRepositorios, releasesPorRepositorio, semente }) {
  const proximo = criarSorteio(semente);
  const sorteados = sortear(ordemCanonica(repositorios), quantidadeDeRepositorios, proximo).sort(
    (a, b) => Number(a.rank) - Number(b.rank)
  );

  const linhas = [];
  const semReleases = [];
  const releasesDisponiveis = {};

  for (const [indice, repositorio] of sorteados.entries()) {
    const candidatas = releasesRotulaveis(releases, repositorio.full_name);
    releasesDisponiveis[repositorio.full_name] = candidatas.length;
    if (candidatas.length === 0) {
      semReleases.push(repositorio.full_name);
      continue;
    }
    const escolhidas = sortear(candidatas, releasesPorRepositorio, proximo).sort(
      (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)
    );

    for (const [posicao, release] of escolhidas.entries()) {
      linhas.push({
        repo_index: indice + 1,
        repo_id: repositorio.id ?? "",
        full_name: repositorio.full_name,
        repo_url: repositorio.html_url ?? `https://github.com/${repositorio.full_name}`,
        stars: repositorio.stars ?? "",
        language: repositorio.language ?? "",
        release_index: posicao + 1,
        release_id: release.release_id,
        tag_name: release.tag_name,
        release_name: release.name ?? "",
        published_at: release.published_at,
        // Link direto para a pagina da release: o avaliador abre, le as notas e
        // os commits, e decide. Sem isto, sao 300 buscas manuais por pessoa.
        release_url:
          release.html_url && release.html_url !== ""
            ? release.html_url
            : `https://github.com/${repositorio.full_name}/releases/tag/${release.tag_name}`,
      });
    }
  }

  return { repositorios: sorteados, linhas, semReleases, releasesDisponiveis };
}

// Le repositories.csv e releases.csv e devolve a populacao do sorteio, ou um
// erro explicando qual etapa falta. Compartilhado pelo sorteio e pela
// verificacao de reprodutibilidade (src/validacao/index.js).
export function carregarPopulacao(dirSaida) {
  const processados = join(dirSaida, "processed");
  const caminhoRepos = join(processados, "repositories.csv");
  const caminhoReleases = join(processados, "releases.csv");
  const todos = lerCSVComoObjetos(caminhoRepos);
  const releases = lerCSVComoObjetos(caminhoReleases);
  // Mensagens com caminho relativo: elas vao parar em arquivos versionados.
  if (todos.length === 0) throw new Error(`Nao ha processed/repositories.csv: rode a etapa "repositorios".`);
  if (releases.length === 0) throw new Error(`Nao ha processed/releases.csv: rode a etapa "releases".`);

  const finais = todos.filter((r) => r.status === "included");
  if (finais.length === 0) {
    throw new Error(
      'A amostra final ainda nao foi fechada (nenhum repositorio com status "included"). ' +
        "Rode a coleta ate o fim antes de sortear a amostra-ouro: sortear de uma lista que ainda vai mudar " +
        "invalida a rotulagem."
    );
  }
  return {
    finais,
    releases,
    entradas: {
      "processed/repositories.csv": sha256(caminhoRepos),
      "processed/releases.csv": sha256(caminhoReleases),
    },
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

export function caminhosDeSaida(dirSaida, avaliadores = []) {
  return {
    amostra: join(dirSaida, "processed", "amostra_ouro.csv"),
    // Registro do sorteio: semente, algoritmo, populacao, hash das entradas e
    // os sorteados - o que um replicador precisa para refazer e conferir.
    registro: join(dirSaida, "raw", "amostra_ouro.json"),
    rotulos: Object.fromEntries(
      avaliadores.map((nome) => [nome, join(dirSaida, "processed", `rotulos_${nome}.csv`)])
    ),
  };
}

export async function executarAmostraOuro({
  config,
  log = logSilencioso,
  avaliadores = config.validacao.avaliadores ?? ["enzo", "caue", "leo"],
  sobrescrever = false,
}) {
  const { diretorios, validacao } = config;
  const { finais, releases, entradas } = carregarPopulacao(diretorios.saida);

  const { repositorios, linhas, semReleases, releasesDisponiveis } = montarAmostra({
    repositorios: finais,
    releases,
    quantidadeDeRepositorios: validacao.repositoriosNaAmostraOuro,
    releasesPorRepositorio: validacao.releasesPorRepositorio,
    semente: validacao.semente,
  });

  const caminhos = caminhosDeSaida(diretorios.saida, avaliadores);
  escrever(
    caminhos.amostra,
    gerarCSV(COLUNAS_AMOSTRA_OURO, linhas.map((linha) => COLUNAS_AMOSTRA_OURO.map((coluna) => linha[coluna])))
  );

  escrever(
    caminhos.registro,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        criterio:
          'populacao = repositorios com status "included" em processed/repositories.csv (amostra final); ' +
          "releases rotulaveis = deploy releases (is_deploy) publicadas na janela (in_window), de processed/releases.csv",
        algoritmo:
          "populacao em ordem canonica (rank, full_name); embaralhamento de Fisher-Yates com o gerador mulberry32 " +
          "semeado; os N primeiros repositorios; depois, com o mesmo gerador, as releases de cada repositorio na ordem do rank",
        semente: validacao.semente,
        repositorios_pedidos: validacao.repositoriosNaAmostraOuro,
        releases_por_repositorio: validacao.releasesPorRepositorio,
        tamanho_da_populacao: finais.length,
        entradas_sha256: entradas,
        avaliadores,
        repositorios_sorteados: repositorios.map((r, i) => ({
          repo_index: i + 1,
          repo_id: r.id ?? "",
          full_name: r.full_name,
          rank: Number(r.rank),
          releases_rotulaveis: releasesDisponiveis[r.full_name] ?? 0,
          releases_sorteadas: linhas.filter((l) => l.full_name === r.full_name).length,
        })),
        sem_releases_rotulaveis: semReleases,
        total_de_releases: linhas.length,
      },
      null,
      2
    ) + "\n"
  );

  const colunas = [...COLUNAS_AMOSTRA_OURO, ...COLUNAS_DE_ROTULO];
  for (const [nome, caminho] of Object.entries(caminhos.rotulos)) {
    if (existsSync(caminho) && !sobrescrever) {
      // Nunca apagar rotulos ja preenchidos por engano.
      log.aviso(`${caminho} ja existe e foi mantido (use --sobrescrever para recriar)`);
      continue;
    }
    escrever(
      caminho,
      gerarCSV(
        colunas,
        linhas.map((linha) => colunas.map((coluna) => linha[coluna] ?? ""))
      )
    );
  }

  log.info(
    `amostra-ouro: ${repositorios.length} repositorios sorteados (semente ${validacao.semente}), ` +
      `${linhas.length} releases para rotular (${validacao.releasesPorRepositorio} por repositorio)`
  );
  if (semReleases.length > 0) {
    log.aviso(`${semReleases.length} repositorios sorteados sem release rotulavel na janela: ${semReleases.join(", ")}`);
  }
  log.info(`saidas: ${caminhos.amostra}, ${Object.values(caminhos.rotulos).join(", ")}`);
  log.info("antes de rotular, cada avaliador le docs/guia-de-rotulagem.md");

  return { repositorios, linhas, semReleases, caminhos };
}

// ---- CLI -----------------------------------------------------------------

export function parseArgs(argv) {
  // avaliadores = null -> usa config.validacao.avaliadores
  const args = { config: "config.json", avaliadores: null, sobrescrever: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) throw new Error("--config exige um valor");
      args.config = valor;
      i += 1;
    } else if (arg === "--avaliadores") {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) throw new Error("--avaliadores exige uma lista separada por virgula");
      args.avaliadores = valor
        .split(",")
        .map((nome) => nome.trim().toLowerCase())
        .filter((nome) => nome !== "");
      if (args.avaliadores.length === 0) throw new Error("--avaliadores exige ao menos um nome");
      i += 1;
    } else if (arg === "--sobrescrever") {
      args.sobrescrever = true;
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  return args;
}

export async function main(argv = process.argv.slice(2), { log = criarLog() } = {}) {
  const args = parseArgs(argv);
  const config = carregarConfig(args.config);
  return executarAmostraOuro({
    config,
    log,
    avaliadores: args.avaliadores ?? config.validacao.avaliadores,
    sobrescrever: args.sobrescrever,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(`Erro: ${erro.message}`);
    process.exit(1);
  });
}
