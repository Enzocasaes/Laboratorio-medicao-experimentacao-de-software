// Lab02 - S01: verificacao do AMBIENTE de execucao dos trials.
//
// O Passo 2 do enunciado exige preparar o ambiente (linguagem, IDE, assistente
// de IA, cronometro, scripts de metricas). Este script confere, antes de cada
// sessao de coleta, que a maquina esta' no mesmo estado descrito em
// ../Docs/Ambiente.md - a ameaca I6 (diferenca de ambiente entre integrantes)
// so' e' contida se todo mundo rodar os trials na mesma configuracao.
//
// Uso:
//   node src/verificar-ambiente.js
//
// Codigo de saida: 0 se todos os itens OBRIGATORIOS passam; 1 caso contrario.
// Itens opcionais viram AVISO e nao derrubam o codigo de saida.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const DOCS = join(RAIZ, "..", "Docs");
const PASTA_DADOS = process.env.LAB02_DATA_DIR
  ? resolve(process.env.LAB02_DATA_DIR)
  : join(RAIZ, "data");

export const NODE_MINIMO = 18;

// --------------------------------------------------------------------------
// funcoes puras (exportadas para teste)

export function versaoMaiorDoNode(versao) {
  return Number(String(versao).replace(/^v/, "").split(".")[0]);
}

// Ambiente.md nasce com lacunas "[preencher ...]" (IDE, ferramenta de IA e
// versao). Elas precisam estar fechadas ANTES da coleta, senao o Relatorio
// Final nao consegue descrever o ambiente (exigencia de replicacao do Passo 5).
export function lacunasPendentes(texto) {
  const achados = texto.match(/\[preencher[^\]]*\]/gi);
  return achados ? [...new Set(achados)] : [];
}

// --------------------------------------------------------------------------

const OK = "OK   ";
const FALHA = "FALHA";
const AVISO = "AVISO";

export function main() {
  const itens = [];
  const registrar = (situacao, titulo, detalhe) => itens.push({ situacao, titulo, detalhe });

  // (1) runtime
  const maior = versaoMaiorDoNode(process.version);
  registrar(
    maior >= NODE_MINIMO ? OK : FALHA,
    "Node.js",
    `${process.version} (minimo exigido: v${NODE_MINIMO})`,
  );

  const arqNvmrc = join(RAIZ, ".nvmrc");
  registrar(
    existsSync(arqNvmrc) ? OK : AVISO,
    ".nvmrc",
    existsSync(arqNvmrc) ? `fixa a versao em ${readFileSync(arqNvmrc, "utf8").trim()}` : "ausente",
  );

  // (2) zero dependencias: nenhum npm install deve ter rodado
  const temNodeModules = existsSync(join(RAIZ, "node_modules"));
  registrar(
    temNodeModules ? AVISO : OK,
    "sem dependencias",
    temNodeModules
      ? "node_modules/ existe - o projeto nao usa dependencias; remova para garantir o mesmo ambiente"
      : "nenhum node_modules/ (o projeto roda so' com a biblioteca padrao do Node)",
  );

  const pacote = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  registrar(
    pacote.type === "module" ? OK : FALHA,
    "package.json",
    `type=${pacote.type}, engines.node=${pacote.engines?.node ?? "?"}`,
  );

  // (3) pastas e arquivos do experimento
  for (const [rotulo, caminho, obrigatorio] of [
    ["pasta data/", PASTA_DADOS, true],
    ["pasta trials/", join(RAIZ, "trials"), true],
    ["katas.manifest.json", join(RAIZ, "katas.manifest.json"), true],
    ["pasta katas/", join(RAIZ, "katas"), false],
  ]) {
    const existe = existsSync(caminho);
    registrar(existe ? OK : (obrigatorio ? FALHA : AVISO), rotulo,
      existe ? caminho : `ausente (${caminho})`);
  }

  // (4) instrumentos
  for (const script of ["cronometro.js", "metricas.js", "validar-katas.js"]) {
    registrar(existsSync(join(RAIZ, "src", script)) ? OK : FALHA, `src/${script}`,
      existsSync(join(RAIZ, "src", script)) ? "presente" : "ausente");
  }
  const testes = existsSync(join(RAIZ, "test"))
    ? readdirSync(join(RAIZ, "test")).filter((n) => n.endsWith(".test.js"))
    : [];
  registrar(testes.length ? OK : AVISO, "suite de testes", `${testes.length} arquivo(s) em test/`);

  // (5) documento de ambiente com as decisoes do grupo fechadas
  const arqAmbiente = join(DOCS, "Ambiente.md");
  if (existsSync(arqAmbiente)) {
    const lacunas = lacunasPendentes(readFileSync(arqAmbiente, "utf8"));
    registrar(lacunas.length ? AVISO : OK, "Docs/Ambiente.md",
      lacunas.length
        ? `${lacunas.length} lacuna(s) a fechar antes da coleta: ${lacunas.join(" ")}`
        : "sem lacunas - IDE e assistente de IA definidos");
  } else {
    registrar(FALHA, "Docs/Ambiente.md", `ausente (${arqAmbiente})`);
  }

  // (6) trials ja montados
  const pastaTrials = join(RAIZ, "trials");
  if (existsSync(pastaTrials)) {
    const ids = readdirSync(pastaTrials)
      .filter((n) => !n.startsWith("."))
      .filter((n) => statSync(join(pastaTrials, n)).isDirectory());
    registrar(OK, "trials montados", ids.length ? `${ids.length}: ${ids.join(", ")}` : "nenhum ainda (18 esperados ao fim do Passo 3)");
  }

  // --------------------------------------------------------------------
  console.log("verificacao do ambiente do Lab02 (ver ../Docs/Ambiente.md)\n");
  for (const item of itens) {
    console.log(`  [${item.situacao}] ${item.titulo.padEnd(22)} ${item.detalhe}`);
  }

  const falhas = itens.filter((i) => i.situacao === FALHA).length;
  const avisos = itens.filter((i) => i.situacao === AVISO).length;
  console.log(`\n${itens.length - falhas - avisos} ok, ${avisos} aviso(s), ${falhas} falha(s).`);

  console.log(`
checklist antes de CADA trial (ameacas I3, I5, I6 do desenho):
  [ ] mesma IDE, mesmas extensoes, mesma maquina de sempre
  [ ] tratamento sem-ia: autocomplete de IA DESATIVADO e nenhum chatbot aberto
  [ ] tratamento com-ia: a ferramenta unica do grupo, na versao registrada
  [ ] screencast iniciado ANTES do "npm run trial:iniciar"
  [ ] --participante/--kata/--tratamento/--ordem conferem com a tabela de ordem
  [ ] ao terminar: copiar o codigo final para trials/<trial_id>/ e rodar "npm run metricas"`);

  return falhas ? 1 : 0;
}

// so dispara o CLI quando executado como script (nao quando importado por um teste)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
