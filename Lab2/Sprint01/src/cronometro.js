// Lab02 - S01: cronometro / coleta de tempo dos trials do experimento
// "Assistentes de IA vs. codificacao manual".
//
// Mede o "time-to-green" (tempo ate TODOS os testes de aceitacao passarem) de
// cada trial e aplica o time-box de 35 min: um trial que atinge o time-box sem
// sucesso e' registrado como CENSURADO em 35 min (2100 s), nunca descartado -
// descartar distorceria a comparacao a favor do tratamento com mais falhas.
//
// Cada trial encerrado vira uma linha em data/trials.csv.
//
// Uso tipico (um trial por vez):
//   node src/cronometro.js iniciar --participante P1 --kata kata-03 --tratamento com-ia --ordem 5
//   node src/cronometro.js status
//   node src/cronometro.js parar --testes-passando 10 --testes-total 10 --num-prompts 7 --obs "..."
//
// Sem ter usado "iniciar" (tempo cronometrado a mao):
//   node src/cronometro.js registrar --participante P2 --kata kata-01 --tratamento sem-ia --ordem 3 --duracao-min 21 --testes-passando 8 --testes-total 12
//
// Ver o que ja foi coletado:
//   node src/cronometro.js listar
//
// A pasta de dados pode ser trocada pela variavel de ambiente LAB02_DATA_DIR
// (usada pelos testes para nao tocar em data/).

import { existsSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calcularMediana, calcularQuartis } from "./estatisticas.js";
import { linhaCSV, lerCSV } from "./csv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PASTA_DADOS = process.env.LAB02_DATA_DIR
  ? resolve(process.env.LAB02_DATA_DIR)
  : join(__dirname, "..", "data");
const ARQ_SESSAO = join(PASTA_DADOS, "sessao-ativa.json");
const ARQ_TRIALS = join(PASTA_DADOS, "trials.csv");

export const TIME_BOX_PADRAO_MIN = 35;
export const TIME_BOX_MAX_MIN = 35; // regra da turma: o limite so pode ser REDUZIDO, nunca aumentado

const CABECALHO = [
  "trial_id", "registrado_em", "participante", "kata", "tratamento", "ordem",
  "inicio", "fim", "duracao_segundos", "duracao_hms", "time_box_segundos",
  "censurado", "sucesso", "testes_passando", "testes_total", "taxa_sucesso",
  "num_prompts_ia", "observacoes",
];

// aceita varias grafias e normaliza para os dois rotulos oficiais
export const TRATAMENTOS = {
  "com-ia": "com-ia", com: "com-ia", ia: "com-ia", t1: "com-ia",
  "sem-ia": "sem-ia", sem: "sem-ia", manual: "sem-ia", t0: "sem-ia",
};

// --------------------------------------------------------------------------
// funcoes puras (exportadas para teste)

export function parseArgs(lista) {
  const args = {};
  for (let i = 0; i < lista.length; i += 1) {
    const item = lista[i];
    if (!item.startsWith("--")) continue;
    const chave = item.slice(2);
    const proximo = lista[i + 1];
    if (proximo === undefined || proximo.startsWith("--")) {
      args[chave] = true;
    } else {
      args[chave] = proximo;
      i += 1;
    }
  }
  return args;
}

export function formatarHMS(totalSegundos) {
  const s = Math.max(0, Math.round(totalSegundos));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// Regra central do experimento: a partir do tempo decorrido, do time-box e da
// contagem de testes, decide censura / sucesso / duracao registrada / taxa.
// testesPassando e testesTotal usam "" quando desconhecidos.
export function resultadoTrial({ decorridoS, timeBoxMin, censurar = false, testesPassando = "", testesTotal = "" }) {
  const timeBoxS = timeBoxMin * 60;
  const estourouTimeBox = decorridoS >= timeBoxS;
  const censurado = Boolean(censurar) || estourouTimeBox;
  const todosPassaram = testesTotal !== "" && testesPassando === testesTotal;
  const sucesso = !censurado && todosPassaram;
  const duracaoRegistrada = censurado ? timeBoxS : Math.round(decorridoS);
  const taxaSucesso = testesTotal !== "" ? Number((testesPassando / testesTotal).toFixed(4)) : "";
  return { timeBoxS, estourouTimeBox, censurado, todosPassaram, sucesso, duracaoRegistrada, taxaSucesso };
}

// --------------------------------------------------------------------------

function erro(mensagem) {
  console.error(`erro: ${mensagem}`);
  process.exit(1);
}

function lerSessao() {
  if (!existsSync(ARQ_SESSAO)) return null;
  return JSON.parse(readFileSync(ARQ_SESSAO, "utf8"));
}

function validarIdentificacao(args) {
  const participante = String(args.participante ?? "").trim();
  const kata = String(args.kata ?? "").trim();
  const tratamento = TRATAMENTOS[String(args.tratamento ?? "").trim().toLowerCase()];
  const ordem = Number(args.ordem);

  if (!participante) erro("informe --participante (ex.: P1).");
  if (!kata) erro("informe --kata (ex.: kata-03).");
  if (!tratamento) erro('informe --tratamento com-ia | sem-ia (aceita tambem: com, sem, ia, manual, t0, t1).');
  if (!Number.isInteger(ordem) || ordem < 1) {
    erro("informe --ordem como inteiro >= 1 (posicao do trial na sequencia do participante).");
  }
  return { participante, kata, tratamento, ordem };
}

function lerTimeBoxMin(args) {
  const valor = args["time-box"] === undefined ? TIME_BOX_PADRAO_MIN : Number(args["time-box"]);
  if (!Number.isFinite(valor) || valor <= 0) erro("--time-box deve ser um numero de minutos > 0.");
  if (valor > TIME_BOX_MAX_MIN) {
    erro(`--time-box nao pode passar de ${TIME_BOX_MAX_MIN} min (regra da turma: o limite so pode ser reduzido).`);
  }
  return valor;
}

function lerNumeroTestes(args) {
  const passando = args["testes-passando"] === undefined ? "" : Number(args["testes-passando"]);
  const total = args["testes-total"] === undefined ? "" : Number(args["testes-total"]);
  if (total !== "" && (!Number.isInteger(total) || total <= 0)) erro("--testes-total deve ser um inteiro > 0.");
  if (passando !== "" && (!Number.isInteger(passando) || passando < 0)) erro("--testes-passando deve ser um inteiro >= 0.");
  if (passando !== "" && total !== "" && passando > total) erro("--testes-passando nao pode ser maior que --testes-total.");
  return { passando, total };
}

function gravarTrial(campos) {
  if (!existsSync(ARQ_TRIALS)) writeFileSync(ARQ_TRIALS, linhaCSV(CABECALHO));
  appendFileSync(ARQ_TRIALS, linhaCSV(campos));
}

// monta a linha do CSV e imprime o resumo do trial encerrado
function fecharTrial({ id, participante, kata, tratamento, ordem, inicioISO, fimISO, decorridoS, timeBoxMin, censurar, testes, numPrompts, observacoes }) {
  const r = resultadoTrial({
    decorridoS, timeBoxMin, censurar,
    testesPassando: testes.passando, testesTotal: testes.total,
  });

  if (!r.censurado && !r.todosPassaram) {
    console.log("aviso: trial encerrado antes do time-box, mas sem todos os testes passando -> registrado como sucesso=nao, com o tempo real (nao censurado).");
  }
  if (r.censurado && testes.total === "") {
    console.log("aviso: trial CENSURADO sem --testes-passando/--testes-total -> taxa de sucesso ficara vazia. Informe os numeros para a RQ2.");
  }

  gravarTrial([
    id, fimISO, participante, kata, tratamento, ordem,
    inicioISO, fimISO, r.duracaoRegistrada, formatarHMS(r.duracaoRegistrada), r.timeBoxS,
    r.censurado ? 1 : 0, r.sucesso ? 1 : 0, testes.passando, testes.total, r.taxaSucesso,
    numPrompts, observacoes,
  ]);

  console.log(`\ntrial gravado em ${ARQ_TRIALS}`);
  console.log(`  ${id}`);
  console.log(`  duracao real   : ${formatarHMS(decorridoS)} (${Math.round(decorridoS)} s)`);
  console.log(`  registrado     : ${formatarHMS(r.duracaoRegistrada)} (${r.duracaoRegistrada} s)${r.censurado ? `   [CENSURADO em ${timeBoxMin} min]` : ""}`);
  console.log(`  sucesso        : ${r.sucesso ? "sim" : "nao"}`);
  if (testes.total !== "") {
    console.log(`  testes         : ${testes.passando}/${testes.total}  (taxa ${(r.taxaSucesso * 100).toFixed(1)}%)`);
  }
}

// --------------------------------------------------------------------------

function comandoIniciar(args) {
  const ativa = lerSessao();
  if (ativa && !args.forcar) {
    erro(
      `ja existe um trial ativo (${ativa.participante} / ${ativa.kata}, ${ativa.tratamento}). ` +
      `Encerre com "parar", descarte com "abortar", ou repita com --forcar.`,
    );
  }

  const { participante, kata, tratamento, ordem } = validarIdentificacao(args);
  const timeBoxMin = lerTimeBoxMin(args);

  const agora = new Date();
  const sessao = {
    participante, kata, tratamento, ordem, timeBoxMin,
    inicioISO: agora.toISOString(),
    inicioMs: agora.getTime(),
  };
  writeFileSync(ARQ_SESSAO, JSON.stringify(sessao, null, 2) + "\n");

  const fimPrevisto = new Date(agora.getTime() + timeBoxMin * 60000);
  console.log("trial iniciado");
  console.log(`  participante : ${participante}`);
  console.log(`  kata         : ${kata}`);
  console.log(`  tratamento   : ${tratamento}`);
  console.log(`  ordem        : ${ordem}`);
  console.log(`  inicio       : ${sessao.inicioISO}`);
  console.log(`  time-box     : ${timeBoxMin} min  (encerra ${fimPrevisto.toISOString()})`);
  console.log("\nao passar em TODOS os testes de aceitacao (ou ao estourar o tempo), rode:");
  console.log('  node src/cronometro.js parar --testes-passando <n> --testes-total <n> [--num-prompts <n>] [--obs "..."]');
}

function comandoStatus() {
  const sessao = lerSessao();
  if (!sessao) {
    console.log("nenhum trial ativo.");
    return;
  }
  const decorridoS = (Date.now() - sessao.inicioMs) / 1000;
  const restanteS = sessao.timeBoxMin * 60 - decorridoS;

  console.log(`trial ativo : ${sessao.participante} / ${sessao.kata}  (${sessao.tratamento}, ordem ${sessao.ordem})`);
  console.log(`inicio      : ${sessao.inicioISO}`);
  console.log(`decorrido   : ${formatarHMS(decorridoS)}`);
  if (restanteS > 0) {
    console.log(`restante    : ${formatarHMS(restanteS)} ate o time-box (${sessao.timeBoxMin} min)`);
  } else {
    console.log(`TIME-BOX ESTOURADO ha ${formatarHMS(-restanteS)} -> encerre com "parar"; sera' registrado como CENSURADO em ${sessao.timeBoxMin} min.`);
  }
}

function comandoParar(args) {
  const sessao = lerSessao();
  if (!sessao) erro('nenhum trial ativo. Inicie com "iniciar" ou lance o resultado com "registrar".');

  const fim = new Date();
  const decorridoS = (fim.getTime() - sessao.inicioMs) / 1000;

  fecharTrial({
    id: `${sessao.participante}_${sessao.kata}_${sessao.tratamento}`,
    participante: sessao.participante,
    kata: sessao.kata,
    tratamento: sessao.tratamento,
    ordem: sessao.ordem,
    inicioISO: sessao.inicioISO,
    fimISO: fim.toISOString(),
    decorridoS,
    timeBoxMin: sessao.timeBoxMin,
    censurar: args.censurar,
    testes: lerNumeroTestes(args),
    numPrompts: args["num-prompts"] === undefined ? "" : Number(args["num-prompts"]),
    observacoes: args.obs === undefined || args.obs === true ? "" : String(args.obs),
  });

  unlinkSync(ARQ_SESSAO);
}

function comandoRegistrar(args) {
  const { participante, kata, tratamento, ordem } = validarIdentificacao(args);
  const timeBoxMin = lerTimeBoxMin(args);

  let duracaoS;
  if (args["duracao-segundos"] !== undefined) duracaoS = Number(args["duracao-segundos"]);
  else if (args["duracao-min"] !== undefined) duracaoS = Number(args["duracao-min"]) * 60;
  else erro("informe --duracao-segundos ou --duracao-min (tempo cronometrado a mao).");
  if (!Number.isFinite(duracaoS) || duracaoS < 0) erro("duracao invalida.");

  const agora = new Date();
  fecharTrial({
    id: `${participante}_${kata}_${tratamento}`,
    participante, kata, tratamento, ordem,
    inicioISO: "",
    fimISO: agora.toISOString(),
    decorridoS: duracaoS,
    timeBoxMin,
    censurar: args.censurar,
    testes: lerNumeroTestes(args),
    numPrompts: args["num-prompts"] === undefined ? "" : Number(args["num-prompts"]),
    observacoes: args.obs === undefined || args.obs === true ? "" : String(args.obs),
  });
}

function comandoAbortar() {
  const sessao = lerSessao();
  if (!sessao) {
    console.log("nenhum trial ativo para abortar.");
    return;
  }
  unlinkSync(ARQ_SESSAO);
  console.log(`trial descartado sem gravar: ${sessao.participante} / ${sessao.kata}  (${sessao.tratamento}).`);
}

function comandoListar() {
  if (!existsSync(ARQ_TRIALS)) {
    console.log(`ainda nao ha ${ARQ_TRIALS} - nenhum trial encerrado.`);
    return;
  }
  const { cabecalho, linhas } = lerCSV(readFileSync(ARQ_TRIALS, "utf8"));
  if (linhas.length === 0) {
    console.log("nenhum trial registrado.");
    return;
  }

  const col = (nome) => cabecalho.indexOf(nome);
  const registros = linhas.map((l) => ({
    participante: l[col("participante")],
    kata: l[col("kata")],
    tratamento: l[col("tratamento")],
    ordem: l[col("ordem")],
    duracao: Number(l[col("duracao_segundos")]),
    hms: l[col("duracao_hms")],
    censurado: l[col("censurado")] === "1",
    sucesso: l[col("sucesso")] === "1",
    taxa: l[col("taxa_sucesso")] === "" ? null : Number(l[col("taxa_sucesso")]),
  }));

  console.log(`${registros.length} trial(s) em ${ARQ_TRIALS}\n`);
  console.log("participante  kata          tratamento  ordem  duracao   censura  sucesso  taxa");
  for (const r of registros) {
    console.log(
      `${r.participante.padEnd(12)}  ${r.kata.padEnd(12)}  ${r.tratamento.padEnd(10)}  ` +
      `${String(r.ordem).padEnd(5)}  ${r.hms.padEnd(8)}  ${(r.censurado ? "sim" : "-").padEnd(7)}  ` +
      `${(r.sucesso ? "sim" : "nao").padEnd(7)}  ${r.taxa === null ? "-" : `${(r.taxa * 100).toFixed(0)}%`}`,
    );
  }

  console.log("\nresumo por tratamento (mediana + IQR - conforme o desenho do experimento):");
  for (const t of ["com-ia", "sem-ia"]) {
    const grupo = registros.filter((r) => r.tratamento === t);
    if (grupo.length === 0) {
      console.log(`  ${t.padEnd(7)} sem trials`);
      continue;
    }
    const tempos = grupo.map((r) => r.duracao);
    const censurados = grupo.filter((r) => r.censurado).length;
    const sucessos = grupo.filter((r) => r.sucesso).length;
    const taxas = grupo.map((r) => r.taxa).filter((v) => v !== null);

    let iqr = "IQR n/d (poucos trials)";
    if (grupo.length >= 2) {
      const { q1, q3 } = calcularQuartis(tempos);
      if (Number.isFinite(q1) && Number.isFinite(q3)) iqr = `IQR ${formatarHMS(q1)}..${formatarHMS(q3)}`;
    }
    console.log(
      `  ${t.padEnd(7)} n=${grupo.length}  mediana tempo=${formatarHMS(calcularMediana(tempos))} ` +
      `(${iqr})  censurados=${censurados}  sucesso=${sucessos}/${grupo.length}` +
      (taxas.length ? `  mediana taxa=${(calcularMediana(taxas) * 100).toFixed(0)}%` : ""),
    );
  }
  console.log("\nobs: a analise inferencial (Wilcoxon pareado por kata) e a deteccao formal de outliers ficam no Passo 4.");
}

function mostrarAjuda() {
  console.log(`cronometro - coleta de tempo dos trials (Lab02 / S01)

comandos:
  iniciar    --participante P1 --kata kata-03 --tratamento com-ia --ordem 5 [--time-box 35] [--forcar]
             marca o inicio de um trial (grava data/sessao-ativa.json).

  status     mostra o tempo decorrido/restante do trial ativo.

  parar      [--testes-passando N] [--testes-total M] [--num-prompts N] [--obs "..."] [--censurar]
             encerra o trial ativo, calcula o time-to-green e grava a linha em data/trials.csv.
             Se o tempo decorrido >= time-box, o trial e' gravado como CENSURADO em 35 min.

  abortar    descarta o trial ativo sem gravar nada.

  registrar  --participante P1 --kata kata-03 --tratamento sem-ia --ordem 2
             (--duracao-min 21 | --duracao-segundos 1260) [--testes-passando N --testes-total M]
             [--num-prompts N] [--obs "..."] [--censurar] [--time-box 35]
             lanca um trial ja cronometrado a mao, sem ter usado "iniciar".

  listar     mostra os trials coletados + mediana/IQR por tratamento.

tratamento: com-ia | sem-ia   (aceita tambem com, sem, ia, manual, t0, t1)
time-box  : padrao 35 min; so pode ser REDUZIDO, nunca aumentado.`);
}

export function principal(argv) {
  const [comando, ...resto] = argv;
  const args = parseArgs(resto);

  switch (comando) {
    case "iniciar": comandoIniciar(args); break;
    case "status": comandoStatus(); break;
    case "parar": comandoParar(args); break;
    case "abortar": comandoAbortar(); break;
    case "registrar": comandoRegistrar(args); break;
    case "listar":
    case "resumo": comandoListar(); break;
    case undefined:
    case "ajuda":
    case "-h":
    case "--help": mostrarAjuda(); break;
    default:
      console.error(`comando desconhecido: ${comando}\n`);
      mostrarAjuda();
      process.exit(1);
  }
}

// so dispara o CLI quando executado como script (nao quando importado por um teste)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2));
}
