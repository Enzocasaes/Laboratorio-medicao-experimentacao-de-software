// Lab02 - S01: validacao dos katas candidatos.
//
// Confere, para cada kata do katas.manifest.json, duas familias de regras:
//
//   (a) EQUIVALENCIA DE DIFICULDADE
//       - nº de testes de aceitacao dentro de [8, 12];
//       - LOC da solucao de referencia dentro de [40, 80];
//       - sem dependencias externas e sem I/O de rede/arquivo;
//       - o conjunto dos 6 katas e' homogeneo: amplitude (max-min) de testes
//         <= 4 e de LOC <= 40, e nenhum kata e' outlier (IQR x 1,5) do conjunto.
//
//   (b) BAIXA INDEXACAO  (protocolo em ../Docs/ValidacaoDosKatas.md)
//       - resultados no Google para as frases distintivas <= 10;
//       - arquivos no GitHub code search <= 5;
//       - o assistente de IA NAO reconhece/recita a solucao canonica.
//       Enquanto os campos hits_* estiverem nulos, o kata fica PENDENTE
//       (nao reprova - falta a medicao manual).
//
// Quando existe a pasta katas/<id>/ (enunciado.md, solucao-referencia.js,
// *.test.js), o script MEDE o LOC e o nº de testes reais e compara com o
// planejado no manifesto. Caso contrario, usa os valores planejados.
//
// Uso:
//   node src/validar-katas.js
//   node src/validar-katas.js --manifest katas.manifest.json --katas-dir katas
//
// Saida: relatorio no terminal + data/validacao-katas.csv
// Codigo de saida: 0 se nenhum kata REPROVADO (PENDENTE e' aceito); 1 caso contrario.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calcularMediana, detectarOutliers } from "./estatisticas.js";
import { gerarCSV } from "./csv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const PASTA_DADOS = process.env.LAB02_DATA_DIR
  ? resolve(process.env.LAB02_DATA_DIR)
  : join(RAIZ, "data");
const ARQ_CSV = join(PASTA_DADOS, "validacao-katas.csv");

// --------------------------------------------------------------------------
// funcoes puras (exportadas para teste)

export function parseArgs(lista) {
  const args = {};
  for (let i = 0; i < lista.length; i += 1) {
    if (!lista[i].startsWith("--")) continue;
    const chave = lista[i].slice(2);
    const proximo = lista[i + 1];
    if (proximo === undefined || proximo.startsWith("--")) args[chave] = true;
    else { args[chave] = proximo; i += 1; }
  }
  return args;
}

// LOC = linhas nao vazias que nao sao comentario (// ou dentro de /* */).
export function contarLOC(codigo) {
  const semBloco = codigo.replace(/\/\*[\s\S]*?\*\//g, "");
  return semBloco
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0 && !linha.startsWith("//"))
    .length;
}

export function contarTestes(codigo) {
  const casos = codigo.match(/\b(?:it|test)\s*\(/g);
  return casos ? casos.length : 0;
}

// Avalia UM kata contra as regras. `medido` e' opcional ({loc_solucao_referencia,
// num_testes_aceitacao} ou null). Nao toca em disco.
export function avaliarKata(kata, regras, medido = null) {
  const R = regras;
  const testes = medido?.num_testes_aceitacao ?? kata.planejado.num_testes_aceitacao;
  const loc = medido?.loc_solucao_referencia ?? kata.planejado.loc_solucao_referencia;
  const origem = medido && (medido.num_testes_aceitacao != null || medido.loc_solucao_referencia != null)
    ? "medido"
    : "planejado";

  // (a) dificuldade
  const motivos = [];
  if (!(testes >= R.testes_aceitacao_min && testes <= R.testes_aceitacao_max)) {
    motivos.push(`testes=${testes} fora de [${R.testes_aceitacao_min},${R.testes_aceitacao_max}]`);
  }
  if (!(loc >= R.loc_solucao_referencia_min && loc <= R.loc_solucao_referencia_max)) {
    motivos.push(`loc=${loc} fora de [${R.loc_solucao_referencia_min},${R.loc_solucao_referencia_max}]`);
  }
  if ((kata.planejado.dependencias_externas ?? 0) !== 0) motivos.push("possui dependencias externas");
  if (kata.planejado.io_rede_ou_arquivo === true) motivos.push("faz I/O de rede/arquivo");
  if (kata.autoral !== true) motivos.push("nao e' autoral");
  if (origem === "medido" && medido.num_testes_aceitacao != null
      && Math.abs(medido.num_testes_aceitacao - kata.planejado.num_testes_aceitacao) > 2) {
    motivos.push(`testes medidos (${medido.num_testes_aceitacao}) divergem do planejado (${kata.planejado.num_testes_aceitacao})`);
  }
  const statusDificuldade = motivos.length ? "REPROVADO" : "OK";

  // (b) indexacao
  const ix = kata.indexacao ?? {};
  const motivosIx = [];
  let statusIndexacao;
  if (ix.hits_google == null || ix.hits_github_code == null) {
    statusIndexacao = "PENDENTE";
    motivosIx.push("faltam hits_google e/ou hits_github_code (medir a mao)");
  } else {
    if (ix.hits_google > R.hits_google_max) motivosIx.push(`hits_google=${ix.hits_google} > ${R.hits_google_max}`);
    if (ix.hits_github_code > R.hits_github_code_max) motivosIx.push(`hits_github_code=${ix.hits_github_code} > ${R.hits_github_code_max}`);
    if (ix.reconhecido_pelo_assistente === true) motivosIx.push("assistente reconhece/recita a solucao canonica");
    statusIndexacao = motivosIx.length ? "REPROVADO" : "OK";
  }

  let statusFinal;
  if (statusDificuldade === "REPROVADO" || statusIndexacao === "REPROVADO") statusFinal = "REPROVADO";
  else if (statusIndexacao === "PENDENTE") statusFinal = "PENDENTE";
  else statusFinal = "APROVADO";

  return { kata, origem, testes, loc, statusDificuldade, statusIndexacao, statusFinal, motivos: [...motivos, ...motivosIx] };
}

// Homogeneidade do CONJUNTO de katas ja avaliados.
export function avaliarConjunto(itens, regras) {
  const vetTestes = itens.map((l) => l.testes);
  const vetLoc = itens.map((l) => l.loc);
  const amplitude = (v) => Math.max(...v) - Math.min(...v);
  const outliersTestes = detectarOutliers(vetTestes).indices;
  const outliersLoc = detectarOutliers(vetLoc).indices;
  const amplitudeTestes = amplitude(vetTestes);
  const amplitudeLoc = amplitude(vetLoc);
  const conjuntoOk =
    amplitudeTestes <= regras.amplitude_testes_max &&
    amplitudeLoc <= regras.amplitude_loc_max &&
    outliersTestes.length === 0 &&
    outliersLoc.length === 0;
  return { vetTestes, vetLoc, amplitudeTestes, amplitudeLoc, outliersTestes, outliersLoc, conjuntoOk };
}

// --------------------------------------------------------------------------
// acesso a disco

function lerArquivosCom(pasta, filtro) {
  return readdirSync(pasta)
    .filter((nome) => filtro(nome))
    .map((nome) => join(pasta, nome))
    .filter((caminho) => statSync(caminho).isFile());
}

// Mede LOC e nº de testes reais se a pasta katas/<id>/ existir.
export function medirKata(katasDir, id) {
  const pasta = join(katasDir, id);
  if (!existsSync(pasta) || !statSync(pasta).isDirectory()) return null;

  const arqsSolucao = lerArquivosCom(pasta, (n) => /^(solucao-referencia|solucao|referencia)\.(m?js|ts)$/.test(n));
  const arqsTeste = lerArquivosCom(pasta, (n) => /\.(test|spec)\.(m?js|ts)$/.test(n) || /^(testes?|spec)\.(m?js|ts)$/.test(n));

  const loc = arqsSolucao.reduce((soma, arq) => soma + contarLOC(readFileSync(arq, "utf8")), 0);
  const numTestes = arqsTeste.reduce((soma, arq) => soma + contarTestes(readFileSync(arq, "utf8")), 0);

  return {
    loc_solucao_referencia: arqsSolucao.length ? loc : null,
    num_testes_aceitacao: arqsTeste.length ? numTestes : null,
    tem_enunciado: existsSync(join(pasta, "enunciado.md")),
    arquivos_solucao: arqsSolucao.length,
    arquivos_teste: arqsTeste.length,
  };
}

const rotulo = (s) => ({ APROVADO: "APROVADO ", PENDENTE: "PENDENTE ", REPROVADO: "REPROVADO", OK: "OK       " }[s] ?? s);

// --------------------------------------------------------------------------
// orquestracao (CLI). Devolve o codigo de saida.

export function main(argv) {
  const args = parseArgs(argv);
  // caminhos relativos resolvem contra a raiz do Sprint01; absolutos passam direto
  const caminhoManifesto = resolve(RAIZ, args.manifest ?? "katas.manifest.json");
  const katasDir = resolve(RAIZ, args["katas-dir"] ?? "katas");

  if (!existsSync(caminhoManifesto)) {
    console.error(`erro: manifesto nao encontrado em ${caminhoManifesto}`);
    return 1;
  }

  const manifesto = JSON.parse(readFileSync(caminhoManifesto, "utf8"));
  const R = manifesto.regras;
  const temPastaKatas = existsSync(katasDir);

  console.log(`validacao de katas - manifesto: ${caminhoManifesto}`);
  console.log(temPastaKatas
    ? `medindo LOC/testes reais em ${katasDir}/<id>/ quando a pasta existir\n`
    : `pasta ${katasDir}/ ausente - usando os valores PLANEJADOS do manifesto\n`);

  const linhas = manifesto.katas.map((kata) =>
    avaliarKata(kata, R, temPastaKatas ? medirKata(katasDir, kata.id) : null));
  const houveReprovado = linhas.some((l) => l.statusFinal === "REPROVADO");
  const conjunto = avaliarConjunto(linhas, R);

  console.log("id        titulo                                    origem     testes  loc   dificuldade  indexacao   final");
  for (const l of linhas) {
    console.log(
      `${l.kata.id.padEnd(9)} ${l.kata.titulo.slice(0, 40).padEnd(41)} ${l.origem.padEnd(10)} ` +
      `${String(l.testes).padEnd(6)}  ${String(l.loc).padEnd(4)}  ${rotulo(l.statusDificuldade).padEnd(11)}  ` +
      `${rotulo(l.statusIndexacao).padEnd(10)}  ${rotulo(l.statusFinal)}`,
    );
    for (const m of l.motivos) console.log(`          - ${m}`);
  }

  console.log("\nhomogeneidade do conjunto (equivalencia de dificuldade entre os katas):");
  console.log(`  testes : min=${Math.min(...conjunto.vetTestes)} mediana=${calcularMediana(conjunto.vetTestes)} max=${Math.max(...conjunto.vetTestes)} amplitude=${conjunto.amplitudeTestes} (limite ${R.amplitude_testes_max})`);
  console.log(`  loc    : min=${Math.min(...conjunto.vetLoc)} mediana=${calcularMediana(conjunto.vetLoc)} max=${Math.max(...conjunto.vetLoc)} amplitude=${conjunto.amplitudeLoc} (limite ${R.amplitude_loc_max})`);
  console.log(`  outliers (IQR x 1,5): testes=${conjunto.outliersTestes.map((i) => linhas[i].kata.id).join(",") || "nenhum"}  loc=${conjunto.outliersLoc.map((i) => linhas[i].kata.id).join(",") || "nenhum"}`);
  console.log(`  conjunto homogeneo: ${conjunto.conjuntoOk ? "SIM" : "NAO"}`);

  const aprovados = linhas.filter((l) => l.statusFinal === "APROVADO").length;
  const pendentes = linhas.filter((l) => l.statusFinal === "PENDENTE").length;
  const reprovados = linhas.filter((l) => l.statusFinal === "REPROVADO").length;
  console.log(`\nresumo: ${aprovados} aprovado(s), ${pendentes} pendente(s), ${reprovados} reprovado(s) de ${linhas.length}.`);
  if (pendentes) console.log("        pendentes so serao APROVADOS apos preencher indexacao.hits_* no manifesto (ver ../Docs/ValidacaoDosKatas.md).");
  if (!conjunto.conjuntoOk) console.log("        AJUSTAR: o conjunto ainda nao e' homogeneo o bastante - reescrever o(s) kata(s) fora da faixa.");

  const cabecalho = [
    "id", "titulo", "dominio", "autoral", "origem_metricas",
    "num_testes", "loc_solucao_referencia", "dependencias_externas", "io_rede_ou_arquivo",
    "hits_google", "hits_github_code", "reconhecido_pelo_assistente",
    "status_dificuldade", "status_indexacao", "status_final", "motivos",
  ];
  const linhasCSV = linhas.map((l) => [
    l.kata.id, l.kata.titulo, l.kata.dominio ?? "", l.kata.autoral ? "sim" : "nao", l.origem,
    l.testes, l.loc, l.kata.planejado.dependencias_externas ?? 0, l.kata.planejado.io_rede_ou_arquivo ? "sim" : "nao",
    l.kata.indexacao?.hits_google ?? "", l.kata.indexacao?.hits_github_code ?? "", l.kata.indexacao?.reconhecido_pelo_assistente ?? "",
    l.statusDificuldade, l.statusIndexacao, l.statusFinal, l.motivos.join("; "),
  ]);
  writeFileSync(ARQ_CSV, gerarCSV(cabecalho, linhasCSV));
  console.log(`\nCSV: ${ARQ_CSV}`);

  return houveReprovado ? 1 : 0;
}

// so dispara o CLI quando executado como script (nao quando importado por um teste)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
