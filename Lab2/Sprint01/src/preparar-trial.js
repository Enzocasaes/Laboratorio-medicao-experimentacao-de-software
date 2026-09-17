// Lab02 - S02: monta a pasta de trabalho de UM trial antes de o cronometro comecar.
//
// O time-box de 35 min e' para RESOLVER o kata, nao para copiar arquivo. Este
// script deixa trials/<trial_id>/ pronto:
//
//   enunciado.md    copia do enunciado do kata (consulta livre durante o trial)
//   <kata>.test.js  copia da suite de aceitacao, com o import apontando para ./solucao.js
//   solucao.js      esqueleto com a assinatura exportada - e' onde voce escreve
//
// A solucao-referencia.js do kata NAO e' copiada, e nao deve ser aberta antes do
// trial: ver a resposta pronta contamina a medicao (ameaca G7 do desenho).
//
// Uso:
//   node src/preparar-trial.js --participante leo --kata kata-02 --tratamento sem-ia
//
// Nunca sobrescreve um solucao.js ja existente - se a pasta ja tem codigo seu,
// o script avisa e para.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TRATAMENTOS } from "./cronometro.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");

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

// A suite do kata importa de "./solucao-referencia.js"; no trial ela precisa
// apontar para o arquivo que o participante vai escrever.
export function redirecionarImport(codigoDoTeste) {
  return codigoDoTeste.replace(
    /(from\s+["'])\.\/solucao-referencia\.js(["'])/g,
    "$1./solucao.js$2",
  );
}

// Nome da funcao que a suite espera: import { alocarReservas } from "..."
export function nomeExportado(codigoDoTeste) {
  const achado = codigoDoTeste.match(/import\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*from\s*["']\.\/solucao/);
  return achado ? achado[1] : null;
}

export function esqueletoDaSolucao(nomeFuncao, trialId) {
  return `// ${trialId}
// Implemente aqui. O enunciado esta' em enunciado.md, nesta pasta.

export function ${nomeFuncao}() {
  throw new Error("nao implementado");
}
`;
}

// --------------------------------------------------------------------------

function erro(mensagem) {
  console.error(`erro: ${mensagem}`);
  process.exit(1);
}

export function main(argv) {
  const args = parseArgs(argv);

  const participante = String(args.participante ?? "").trim();
  const kata = String(args.kata ?? "").trim();
  const tratamento = TRATAMENTOS[String(args.tratamento ?? "").trim().toLowerCase()];
  if (!participante) erro("informe --participante (ex.: leo).");
  if (!kata) erro("informe --kata (ex.: kata-02).");
  if (!tratamento) erro("informe --tratamento com-ia | sem-ia.");

  const katasDir = resolve(RAIZ, args["katas-dir"] ?? "katas");
  const pastaKata = join(katasDir, kata);
  if (!existsSync(pastaKata)) erro(`kata nao encontrado: ${pastaKata}`);

  const arqTesteOrigem = join(pastaKata, `${kata}.test.js`);
  if (!existsSync(arqTesteOrigem)) erro(`suite de aceitacao nao encontrada: ${arqTesteOrigem}`);

  const trialId = `${participante}_${kata}_${tratamento}`;
  const pastaTrial = resolve(RAIZ, args.trials ?? "trials", trialId);
  const arqSolucao = join(pastaTrial, "solucao.js");

  if (existsSync(arqSolucao)) {
    erro(`${arqSolucao} ja existe - nao vou sobrescrever o seu codigo. Apague a pasta se quiser recomecar.`);
  }

  const codigoDoTeste = readFileSync(arqTesteOrigem, "utf8");
  const nomeFuncao = nomeExportado(codigoDoTeste);
  if (!nomeFuncao) erro(`nao consegui achar a funcao exportada em ${arqTesteOrigem}`);

  mkdirSync(pastaTrial, { recursive: true });
  writeFileSync(join(pastaTrial, `${kata}.test.js`), redirecionarImport(codigoDoTeste));
  writeFileSync(arqSolucao, esqueletoDaSolucao(nomeFuncao, trialId));

  const arqEnunciado = join(pastaKata, "enunciado.md");
  if (existsSync(arqEnunciado)) {
    writeFileSync(join(pastaTrial, "enunciado.md"), readFileSync(arqEnunciado, "utf8"));
  }

  const totalTestes = (codigoDoTeste.match(/^test\(/gm) ?? []).length;

  console.log(`trial preparado: ${trialId}`);
  console.log(`  pasta    : ${pastaTrial}`);
  console.log(`  enunciado: enunciado.md`);
  console.log(`  suite    : ${kata}.test.js  (${totalTestes} testes de aceitacao)`);
  console.log(`  escreva  : solucao.js  ->  export function ${nomeFuncao}(...)`);
  console.log(`
agora, nesta ordem:
  1. npm run trial:iniciar -- --participante ${participante} --kata ${kata} --tratamento ${tratamento} --ordem <N>
  2. resolver, rodando a suite quantas vezes quiser (o caminho do ARQUIVO, para
     ver os ${totalTestes} testes um a um - a pasta agregaria tudo em 1 resultado):
       node --test ${join("trials", trialId, `${kata}.test.js`)}
  3. npm run trial:parar -- --testes-passando <n> --testes-total ${totalTestes}${tratamento === "com-ia" ? " --num-prompts <n>" : ""}
  4. npm run metricas`);

  return 0;
}

// so dispara o CLI quando executado como script (nao quando importado por um teste)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
