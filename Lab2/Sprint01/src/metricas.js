// Lab02 - S01: coleta das METRICAS ESTATICAS do codigo final de cada trial.
//
// Responde a RQ3 do experimento (o assistente de IA altera a complexidade
// ciclomatica ou a duplicacao do codigo produzido?). O enunciado cita CK
// (so' Java) e Radon (so' Python); como o desenho fixou os katas em JavaScript
// (ver ../Docs/DesenhoDoExperimento.md), este script cumpre o mesmo papel:
//
//   complexidade ciclomatica media/funcao  <- equivalente ao WMC/complexity do CK e ao radon cc
//   % de linhas duplicadas                 <- equivalente ao PMD CPD
//   LOC (controle obrigatorio)             <- mesmo contarLOC do validar-katas.js
//   indice de manutenibilidade (MI)        <- mesma formula normalizada do radon mi
//
// As definicoes exatas de cada metrica estao em ../Docs/Ambiente.md - elas
// precisam estar escritas para o experimento ser replicavel (Passo 5).
//
// O codigo final de cada trial fica em trials/<trial_id>/, onde <trial_id> e'
// exatamente o id gerado pelo cronometro (<participante>_<kata>_<tratamento>);
// e' isso que permite juntar data/trials.csv com data/metricas.csv sem
// digitacao manual. Os arquivos de teste do kata NAO entram na medicao: sao
// identicos nos dois tratamentos e diluiriam o efeito (use --incluir-testes
// para inverter).
//
// Uso:
//   node src/metricas.js                              # todos os trials -> data/metricas.csv
//   node src/metricas.js --trial P1_kata-03_com-ia    # so' um trial
//   node src/metricas.js --dir katas/kata-01          # pasta avulsa (ex.: solucao de referencia)
//   node src/metricas.js --juntar                     # trials.csv + metricas.csv -> trials-com-metricas.csv
//   node src/metricas.js --min-linhas 5 --incluir-testes
//
// A pasta de dados pode ser trocada pela variavel de ambiente LAB02_DATA_DIR
// (usada pelos testes para nao tocar em data/).

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { calcularMediana, calcularQuartis } from "./estatisticas.js";
import { contarLOC } from "./validar-katas.js";
import { gerarCSV, lerCSV } from "./csv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");
const PASTA_DADOS = process.env.LAB02_DATA_DIR
  ? resolve(process.env.LAB02_DATA_DIR)
  : join(RAIZ, "data");
const ARQ_METRICAS = join(PASTA_DADOS, "metricas.csv");
const ARQ_TRIALS = join(PASTA_DADOS, "trials.csv");
const ARQ_JUNTO = join(PASTA_DADOS, "trials-com-metricas.csv");

export const VERSAO_FERRAMENTA = "metricas.js v1";
export const MIN_LINHAS_PADRAO = 5; // janela de duplicacao, mesmo default do jscpd

const CABECALHO = [
  "trial_id", "medido_em", "participante", "kata", "tratamento", "arquivos_analisados",
  "loc", "linhas_comentario", "num_funcoes",
  "complexidade_ciclomatica_media", "complexidade_ciclomatica_max", "complexidade_total",
  "duplicacao_percentual", "linhas_duplicadas", "clones_detectados",
  "volume_halstead", "indice_manutenibilidade", "ferramenta_versao",
];

// Pontos de decisao de McCabe. NAO entram: else, switch, default, try, finally
// (nao criam caminho novo) - mesma convencao do radon cc e da metrica
// complexity/WMC do CK.
const PALAVRAS_DE_DECISAO = new Set(["if", "for", "while", "do", "case", "catch"]);
const OPERADORES_DE_DECISAO = new Set(["&&", "||", "??", "?"]);

// Palavras reservadas: usadas para (a) classificar operadores no Halstead e
// (b) evitar que "if (...) {" seja confundido com a definicao de um metodo.
const PALAVRAS_RESERVADAS = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "export", "extends", "finally", "for",
  "function", "if", "import", "in", "instanceof", "let", "new", "of", "return",
  "static", "super", "switch", "this", "throw", "try", "typeof", "var", "void",
  "while", "with", "yield",
]);

// Depois destas palavras, uma "/" comeca uma expressao regular, nao uma divisao.
const ANTES_DE_REGEX = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "do",
  "else", "yield", "await", "case", "throw",
]);

// Operadores de varios caracteres, do mais longo para o mais curto (a ordem
// importa: garante que "??" nao vire dois "?" e que "?." nao vire ternario).
const OPERADORES = [
  ">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=",
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=",
  "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>",
];

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

// Varredura unica que separa o codigo em tokens e joga fora comentarios,
// strings e literais de regex. E' a base de todas as metricas: sem isso um
// "if" dentro de uma string seria contado como desvio de fluxo.
//
// tipo: "palavra" | "numero" | "texto" | "regex" | "pontuacao"
export function tokenizar(codigo) {
  const tokens = [];
  const linhasComentario = new Set();
  const pilhaInterpolacao = []; // profundidade de chaves de cada `${ ... }` aberto
  let profundidade = 0;         // chaves abertas
  let dentroDeTemplate = false; // consumindo o texto literal de uma template string
  let linha = 1;
  let i = 0;
  const n = codigo.length;

  const anterior = () => tokens[tokens.length - 1];

  // "/" e' divisao quando vem depois de algo que TERMINA uma expressao;
  // caso contrario abre um literal de regex.
  const depoisDeExpressao = () => {
    const t = anterior();
    if (!t) return false;
    if (t.tipo === "numero" || t.tipo === "texto" || t.tipo === "regex") return true;
    if (t.tipo === "palavra") return !ANTES_DE_REGEX.has(t.valor);
    return t.valor === ")" || t.valor === "]" || t.valor === "}";
  };

  while (i < n) {
    // (a) texto literal de template string: vai ate a crase final ou ate "${"
    if (dentroDeTemplate) {
      const inicioLinha = linha;
      let texto = "";
      while (i < n) {
        if (codigo[i] === "\\") { texto += codigo.slice(i, i + 2); i += 2; continue; }
        if (codigo[i] === "\n") { linha += 1; texto += "\n"; i += 1; continue; }
        if (codigo[i] === "`") { i += 1; dentroDeTemplate = false; break; }
        if (codigo[i] === "$" && codigo[i + 1] === "{") {
          i += 2;
          profundidade += 1;
          pilhaInterpolacao.push(profundidade);
          dentroDeTemplate = false;
          break;
        }
        texto += codigo[i];
        i += 1;
      }
      tokens.push({ tipo: "texto", valor: `\`${texto}\``, linha: inicioLinha });
      continue;
    }

    const c = codigo[i];

    if (c === "\n") { linha += 1; i += 1; continue; }
    if (c === " " || c === "\t" || c === "\r") { i += 1; continue; }

    // (b) comentarios
    if (c === "/" && codigo[i + 1] === "/") {
      linhasComentario.add(linha);
      while (i < n && codigo[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && codigo[i + 1] === "*") {
      linhasComentario.add(linha);
      i += 2;
      while (i < n && !(codigo[i] === "*" && codigo[i + 1] === "/")) {
        if (codigo[i] === "\n") { linha += 1; linhasComentario.add(linha); }
        i += 1;
      }
      i += 2;
      continue;
    }

    // (c) strings simples e duplas
    if (c === '"' || c === "'") {
      const inicioLinha = linha;
      let texto = c;
      i += 1;
      while (i < n && codigo[i] !== c) {
        if (codigo[i] === "\\") { texto += codigo.slice(i, i + 2); i += 2; continue; }
        if (codigo[i] === "\n") linha += 1;
        texto += codigo[i];
        i += 1;
      }
      i += 1;
      tokens.push({ tipo: "texto", valor: texto + c, linha: inicioLinha });
      continue;
    }

    // (d) template string
    if (c === "`") {
      i += 1;
      dentroDeTemplate = true;
      continue;
    }

    // (e) literal de regex
    if (c === "/" && !depoisDeExpressao()) {
      const inicioLinha = linha;
      let texto = "/";
      let dentroDeClasse = false;
      i += 1;
      while (i < n) {
        const d = codigo[i];
        if (d === "\\") { texto += codigo.slice(i, i + 2); i += 2; continue; }
        if (d === "\n") break; // regex nao atravessa linha: era divisao, mas seguimos
        if (d === "[") dentroDeClasse = true;
        else if (d === "]") dentroDeClasse = false;
        else if (d === "/" && !dentroDeClasse) { texto += d; i += 1; break; }
        texto += d;
        i += 1;
      }
      while (i < n && /[a-z]/.test(codigo[i])) { texto += codigo[i]; i += 1; } // flags
      tokens.push({ tipo: "regex", valor: texto, linha: inicioLinha });
      continue;
    }

    // (f) numeros
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(codigo[i + 1] ?? ""))) {
      let texto = "";
      while (i < n && /[0-9a-zA-Z_.]/.test(codigo[i])) {
        texto += codigo[i];
        i += 1;
        // expoente com sinal: 1e-5
        if (/[eE]/.test(texto[texto.length - 1]) && /[+-]/.test(codigo[i] ?? "")) {
          texto += codigo[i];
          i += 1;
        }
      }
      tokens.push({ tipo: "numero", valor: texto, linha });
      continue;
    }

    // (g) identificadores e palavras-chave
    if (/[A-Za-z_$]/.test(c)) {
      let texto = "";
      while (i < n && /[A-Za-z0-9_$]/.test(codigo[i])) { texto += codigo[i]; i += 1; }
      tokens.push({ tipo: "palavra", valor: texto, linha });
      continue;
    }

    // (h) pontuacao / operadores
    const op = OPERADORES.find((o) => codigo.startsWith(o, i));
    if (op) {
      tokens.push({ tipo: "pontuacao", valor: op, linha });
      i += op.length;
      continue;
    }

    if (c === "{") profundidade += 1;
    if (c === "}") {
      // esta chave fecha uma interpolacao `${ ... }`? entao voltamos ao template
      const topo = pilhaInterpolacao[pilhaInterpolacao.length - 1];
      if (topo !== undefined && topo === profundidade) {
        pilhaInterpolacao.pop();
        profundidade -= 1;
        dentroDeTemplate = true;
        i += 1;
        continue;
      }
      profundidade -= 1;
    }

    tokens.push({ tipo: "pontuacao", valor: c, linha });
    i += 1;
  }

  return { tokens, linhasComentario };
}

const ehDecisao = (t) =>
  (t.tipo === "palavra" && PALAVRAS_DE_DECISAO.has(t.valor)) ||
  (t.tipo === "pontuacao" && OPERADORES_DE_DECISAO.has(t.valor));

// Indice do token que fecha o par aberto em `inicio` ({...}, (...) ou [...]).
// Devolve -1 se nao fechar.
function fechamento(tokens, inicio) {
  const pares = { "{": "}", "(": ")", "[": "]" };
  const abre = tokens[inicio]?.valor;
  const fecha = pares[abre];
  if (!fecha) return -1;
  let nivel = 0;
  for (let i = inicio; i < tokens.length; i += 1) {
    const v = tokens[i].valor;
    if (tokens[i].tipo !== "pontuacao") continue;
    if (v === abre) nivel += 1;
    else if (v === fecha) {
      nivel -= 1;
      if (nivel === 0) return i;
    }
  }
  return -1;
}

// Delimita o corpo de uma funcao a partir do token onde ele comeca.
// Corpo com chaves -> ate a chave que fecha. Arrow de expressao (x => x + 1)
// -> ate o proximo separador no mesmo nivel.
function corpoDaFuncao(tokens, inicioCorpo) {
  if (tokens[inicioCorpo]?.valor === "{") {
    const fim = fechamento(tokens, inicioCorpo);
    return fim === -1 ? tokens.length - 1 : fim;
  }
  let nivel = 0;
  for (let i = inicioCorpo; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.tipo !== "pontuacao") continue;
    if (t.valor === "(" || t.valor === "[" || t.valor === "{") nivel += 1;
    else if (t.valor === ")" || t.valor === "]" || t.valor === "}") {
      if (nivel === 0) return i - 1;
      nivel -= 1;
    } else if (nivel === 0 && (t.valor === "," || t.valor === ";")) {
      return i - 1;
    }
  }
  return tokens.length - 1;
}

// Indice do token que ABRE o par fechado em `fim` - o inverso de fechamento().
function abertura(tokens, fim) {
  const pares = { ")": "(", "]": "[", "}": "{" };
  const fecha = tokens[fim]?.valor;
  const abre = pares[fecha];
  if (!abre) return -1;
  let nivel = 0;
  for (let i = fim; i >= 0; i -= 1) {
    if (tokens[i].tipo !== "pontuacao") continue;
    if (tokens[i].valor === fecha) nivel += 1;
    else if (tokens[i].valor === abre) {
      nivel -= 1;
      if (nivel === 0) return i;
    }
  }
  return -1;
}

// Nome "de exibicao" da funcao, olhando os tokens anteriores ao inicio dela.
// Numa arrow, pula a lista de parametros antes de procurar ("const dobro =
// (x) => ..." se chama dobro, nao x).
function nomeDaFuncao(tokens, indiceInicio, nomeDireto) {
  if (nomeDireto) return nomeDireto;
  if (tokens[indiceInicio - 1]?.valor === ")") {
    const inicioParams = abertura(tokens, indiceInicio - 1);
    if (inicioParams > 0) indiceInicio = inicioParams;
  } else if (tokens[indiceInicio - 1]?.tipo === "palavra") {
    indiceInicio -= 1; // parametro unico sem parenteses: "const dobro = x => ..."
  }
  for (let i = indiceInicio - 1; i >= 0 && i >= indiceInicio - 3; i -= 1) {
    if (tokens[i].tipo === "palavra" && !PALAVRAS_RESERVADAS.has(tokens[i].valor)) {
      return tokens[i].valor;
    }
  }
  return "(anonima)";
}

// Localiza cada funcao do arquivo (declaracao, expressao, arrow e metodo de
// classe/objeto) e calcula a complexidade ciclomatica de McCabe de CADA UMA.
// Um ponto de decisao e' atribuido a' funcao MAIS INTERNA que o contem, de
// modo que funcoes aninhadas nao inflam a complexidade da funcao externa
// (mesma convencao do radon).
// Pontos de decisao fora de qualquer funcao viram a entrada "(nivel de modulo)".
export function analisarFuncoes(tokens) {
  const faixas = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];

    // function f(...) {...} | function (...) {...} | function* g(...) {...}
    if (t.tipo === "palavra" && t.valor === "function") {
      let j = i + 1;
      if (tokens[j]?.valor === "*") j += 1;
      const nomeDireto = tokens[j]?.tipo === "palavra" ? tokens[j].valor : null;
      if (nomeDireto) j += 1;
      if (tokens[j]?.valor !== "(") continue;
      const fimParams = fechamento(tokens, j);
      if (fimParams === -1 || tokens[fimParams + 1]?.valor !== "{") continue;
      const inicioCorpo = fimParams + 1;
      faixas.push({
        nome: nomeDaFuncao(tokens, i, nomeDireto),
        linha: t.linha,
        inicio: inicioCorpo,
        fim: corpoDaFuncao(tokens, inicioCorpo),
      });
      continue;
    }

    // (a, b) => ... | x => ...
    if (t.tipo === "pontuacao" && t.valor === "=>") {
      const inicioCorpo = i + 1;
      if (inicioCorpo >= tokens.length) continue;
      faixas.push({
        nome: nomeDaFuncao(tokens, i, null),
        linha: t.linha,
        inicio: inicioCorpo,
        fim: corpoDaFuncao(tokens, inicioCorpo),
      });
      continue;
    }

    // metodo de classe / objeto: nome(...) {  (palavra nao reservada + parenteses + chave)
    if (t.tipo === "palavra" && !PALAVRAS_RESERVADAS.has(t.valor) && tokens[i + 1]?.valor === "(") {
      const fimParams = fechamento(tokens, i + 1);
      if (fimParams === -1 || tokens[fimParams + 1]?.valor !== "{") continue;
      const inicioCorpo = fimParams + 1;
      faixas.push({
        nome: t.valor,
        linha: t.linha,
        inicio: inicioCorpo,
        fim: corpoDaFuncao(tokens, inicioCorpo),
      });
    }
  }

  // uma faixa pode ter sido detectada duas vezes (ex.: "const f = function () {}")
  const unicas = [];
  for (const faixa of faixas) {
    if (!unicas.some((u) => u.inicio === faixa.inicio && u.fim === faixa.fim)) unicas.push(faixa);
  }

  const funcoes = unicas.map((f) => ({ ...f, complexidade: 1 }));
  let decisoesNoModulo = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    if (!ehDecisao(tokens[i])) continue;
    // funcao mais interna que contem o token = a de menor faixa
    let dona = null;
    for (const f of funcoes) {
      if (i < f.inicio || i > f.fim) continue;
      if (dona === null || f.fim - f.inicio < dona.fim - dona.inicio) dona = f;
    }
    if (dona) dona.complexidade += 1;
    else decisoesNoModulo += 1;
  }

  if (decisoesNoModulo > 0) {
    funcoes.push({
      nome: "(nivel de modulo)",
      linha: 1,
      inicio: 0,
      fim: tokens.length - 1,
      complexidade: 1 + decisoesNoModulo,
    });
  }

  return funcoes.sort((a, b) => a.linha - b.linha);
}

// Linhas significativas normalizadas: mesma nocao de LOC do validar-katas.js
// (fora comentarios de bloco, linhas vazias e linhas que comecam com //),
// com espacos colapsados para a comparacao. Os blocos /* */ viram linhas
// vazias (e nao somem) para preservar a numeracao original.
export function normalizarLinhas(codigo) {
  const semBloco = codigo.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
  return semBloco
    .split("\n")
    .map((bruta, indice) => ({ numero: indice + 1, texto: bruta.trim().replace(/\s+/g, " ") }))
    .filter((l) => l.texto.length > 0 && !l.texto.startsWith("//"));
}

// Duplicacao no espirito do PMD CPD / jscpd, em granularidade de LINHA:
// janela deslizante de `minLinhas` linhas significativas consecutivas; se a
// mesma sequencia aparece 2+ vezes, todas as linhas cobertas sao marcadas como
// duplicadas. Janelas nao atravessam a fronteira entre arquivos.
//
// `linhas` = [{ arquivo, numero, texto }]. Devolve percentual sobre o total de
// linhas significativas.
export function detectarDuplicacao(linhas, minLinhas = MIN_LINHAS_PADRAO) {
  const total = linhas.length;
  if (total === 0 || minLinhas < 1 || total < minLinhas) {
    return { total, linhasDuplicadas: 0, percentual: 0, clones: 0 };
  }

  const ocorrencias = new Map();
  for (let i = 0; i + minLinhas <= total; i += 1) {
    const janela = linhas.slice(i, i + minLinhas);
    if (janela.some((l) => l.arquivo !== janela[0].arquivo)) continue;
    const chave = janela.map((l) => l.texto).join("\n");
    if (!ocorrencias.has(chave)) ocorrencias.set(chave, []);
    ocorrencias.get(chave).push(i);
  }

  const duplicadas = new Set();
  for (const indices of ocorrencias.values()) {
    if (indices.length < 2) continue;
    for (const inicio of indices) {
      for (let k = inicio; k < inicio + minLinhas; k += 1) duplicadas.add(k);
    }
  }

  // clones = trechos contiguos marcados como duplicados
  let clones = 0;
  for (const indice of [...duplicadas].sort((a, b) => a - b)) {
    if (!duplicadas.has(indice - 1)) clones += 1;
  }

  return {
    total,
    linhasDuplicadas: duplicadas.size,
    percentual: arredondar((duplicadas.size / total) * 100),
    clones,
  };
}

// Volume de Halstead: operadores = pontuacao + palavras reservadas;
// operandos = identificadores, numeros, strings e regex.
// V = (N1 + N2) * log2(n1 + n2).
export function halstead(tokens) {
  const operadores = new Map();
  const operandos = new Map();
  const somar = (mapa, chave) => mapa.set(chave, (mapa.get(chave) ?? 0) + 1);

  for (const t of tokens) {
    const ehOperador = t.tipo === "pontuacao" || (t.tipo === "palavra" && PALAVRAS_RESERVADAS.has(t.valor));
    somar(ehOperador ? operadores : operandos, t.valor);
  }

  const n1 = operadores.size;
  const n2 = operandos.size;
  const N1 = [...operadores.values()].reduce((a, b) => a + b, 0);
  const N2 = [...operandos.values()].reduce((a, b) => a + b, 0);
  const vocabulario = n1 + n2;
  const volume = vocabulario === 0 ? 0 : (N1 + N2) * Math.log2(vocabulario);
  return { n1, n2, N1, N2, vocabulario, tamanho: N1 + N2, volume: arredondar(volume) };
}

// Indice de Manutenibilidade normalizado 0-100 (mesma formula do radon mi):
//   MI = max(0, 100 * (171 - 5.2*ln(V) - 0.23*G - 16.2*ln(LOC)) / 171)
export function indiceManutenibilidade({ volume, complexidadeTotal, loc }) {
  if (loc <= 0) return 100;
  const bruto =
    171 -
    5.2 * Math.log(Math.max(volume, 1)) -
    0.23 * complexidadeTotal -
    16.2 * Math.log(Math.max(loc, 1));
  return arredondar(Math.min(100, Math.max(0, (bruto * 100) / 171)));
}

export function arredondar(valor, casas = 2) {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

// Roda todas as metricas sobre um conjunto de arquivos ja lidos.
// `arquivos` = [{ caminho, codigo }].
export function analisarCodigo(arquivos, minLinhas = MIN_LINHAS_PADRAO) {
  let loc = 0;
  let linhasComentario = 0;
  let funcoes = [];
  let tokensTodos = [];
  let linhas = [];

  for (const { caminho, codigo } of arquivos) {
    const { tokens, linhasComentario: comentarios } = tokenizar(codigo);
    loc += contarLOC(codigo);
    linhasComentario += comentarios.size;
    funcoes = funcoes.concat(analisarFuncoes(tokens).map((f) => ({ ...f, arquivo: caminho })));
    tokensTodos = tokensTodos.concat(tokens);
    linhas = linhas.concat(normalizarLinhas(codigo).map((l) => ({ ...l, arquivo: caminho })));
  }

  const complexidades = funcoes.map((f) => f.complexidade);
  const complexidadeTotal = complexidades.reduce((a, b) => a + b, 0);
  const duplicacao = detectarDuplicacao(linhas, minLinhas);
  const h = halstead(tokensTodos);

  return {
    arquivos: arquivos.length,
    loc,
    linhasComentario,
    funcoes,
    numFuncoes: funcoes.length,
    complexidadeMedia: funcoes.length ? arredondar(complexidadeTotal / funcoes.length) : 0,
    complexidadeMax: complexidades.length ? Math.max(...complexidades) : 0,
    complexidadeTotal,
    duplicacaoPercentual: duplicacao.percentual,
    linhasDuplicadas: duplicacao.linhasDuplicadas,
    clones: duplicacao.clones,
    volumeHalstead: h.volume,
    indiceManutenibilidade: indiceManutenibilidade({
      volume: h.volume,
      complexidadeTotal,
      loc,
    }),
  };
}

// trial_id = <participante>_<kata>_<tratamento> (gerado pelo cronometro).
export function separarTrialId(trialId) {
  const partes = String(trialId).split("_");
  if (partes.length !== 3) return { participante: "", kata: "", tratamento: "" };
  return { participante: partes[0], kata: partes[1], tratamento: partes[2] };
}

// --------------------------------------------------------------------------
// acesso a disco

const EXTENSOES = /\.(m?js|cjs)$/;
const EH_TESTE = /\.(test|spec)\.(m?js|cjs)$/;

// Lista recursivamente os arquivos de codigo de uma pasta.
export function listarArquivosDeCodigo(pasta, incluirTestes = false) {
  const achados = [];
  const visitar = (dir) => {
    for (const nome of readdirSync(dir).sort()) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { visitar(caminho); continue; }
      if (!EXTENSOES.test(nome)) continue;
      if (!incluirTestes && EH_TESTE.test(nome)) continue;
      achados.push(caminho);
    }
  };
  visitar(pasta);
  return achados;
}

function medirPasta(pasta, { minLinhas, incluirTestes }) {
  const caminhos = listarArquivosDeCodigo(pasta, incluirTestes);
  const arquivos = caminhos.map((caminho) => ({
    caminho: relative(pasta, caminho),
    codigo: readFileSync(caminho, "utf8"),
  }));
  return { caminhos, metricas: analisarCodigo(arquivos, minLinhas) };
}

function linhaDoCSV(id, m) {
  const { participante, kata, tratamento } = separarTrialId(id);
  return [
    id, new Date().toISOString(), participante, kata, tratamento, m.arquivos,
    m.loc, m.linhasComentario, m.numFuncoes,
    m.complexidadeMedia, m.complexidadeMax, m.complexidadeTotal,
    m.duplicacaoPercentual, m.linhasDuplicadas, m.clones,
    m.volumeHalstead, m.indiceManutenibilidade,
    `${VERSAO_FERRAMENTA} / node ${process.version}`,
  ];
}

function imprimirTabela(resultados) {
  console.log("trial_id".padEnd(26) + "arqs  loc   fn   cc_med  cc_max  dup_%   mi");
  for (const { id, metricas: m } of resultados) {
    console.log(
      `${id.slice(0, 25).padEnd(26)}${String(m.arquivos).padEnd(6)}${String(m.loc).padEnd(6)}` +
      `${String(m.numFuncoes).padEnd(5)}${String(m.complexidadeMedia).padEnd(8)}` +
      `${String(m.complexidadeMax).padEnd(8)}${String(m.duplicacaoPercentual).padEnd(8)}` +
      `${String(m.indiceManutenibilidade)}`,
    );
  }
}

function imprimirResumoPorTratamento(resultados) {
  const comTratamento = resultados
    .map((r) => ({ ...r, tratamento: separarTrialId(r.id).tratamento }))
    .filter((r) => r.tratamento === "com-ia" || r.tratamento === "sem-ia");
  if (comTratamento.length === 0) return;

  console.log("\nresumo por tratamento (mediana + IQR - conforme o desenho do experimento):");
  const descrever = (valores) => {
    const mediana = arredondar(calcularMediana(valores));
    if (valores.length < 2) return `${mediana}`;
    const { q1, q3 } = calcularQuartis(valores);
    if (!Number.isFinite(q1) || !Number.isFinite(q3)) return `${mediana}`;
    return `${mediana} (IQR ${arredondar(q1)}..${arredondar(q3)})`;
  };

  for (const t of ["com-ia", "sem-ia"]) {
    const grupo = comTratamento.filter((r) => r.tratamento === t);
    if (grupo.length === 0) { console.log(`  ${t.padEnd(7)} sem trials`); continue; }
    console.log(
      `  ${t.padEnd(7)} n=${grupo.length}  ` +
      `loc=${descrever(grupo.map((r) => r.metricas.loc))}  ` +
      `cc_media=${descrever(grupo.map((r) => r.metricas.complexidadeMedia))}  ` +
      `dup%=${descrever(grupo.map((r) => r.metricas.duplicacaoPercentual))}  ` +
      `mi=${descrever(grupo.map((r) => r.metricas.indiceManutenibilidade))}`,
    );
  }
  console.log("\nobs: a analise inferencial (Wilcoxon pareado por kata) e a correcao de Holm ficam no Passo 4.");
}

// --------------------------------------------------------------------------
// comando: juntar trials.csv + metricas.csv

function juntar() {
  if (!existsSync(ARQ_TRIALS)) {
    console.error(`erro: ${ARQ_TRIALS} nao existe - rode o cronometro antes (npm run trial:listar).`);
    return 1;
  }
  if (!existsSync(ARQ_METRICAS)) {
    console.error(`erro: ${ARQ_METRICAS} nao existe - rode "node src/metricas.js" antes.`);
    return 1;
  }

  const trials = lerCSV(readFileSync(ARQ_TRIALS, "utf8"));
  const metricas = lerCSV(readFileSync(ARQ_METRICAS, "utf8"));

  // do lado das metricas, so' as colunas que o trials.csv ainda nao tem
  const colTrialId = metricas.cabecalho.indexOf("trial_id");
  const jaExiste = new Set(trials.cabecalho);
  const indicesMetricas = metricas.cabecalho
    .map((nome, indice) => ({ nome, indice }))
    .filter(({ nome }) => !jaExiste.has(nome) && nome !== "trial_id");

  const porId = new Map(metricas.linhas.map((l) => [l[colTrialId], l]));
  const usados = new Set();

  const colTrialIdTrials = trials.cabecalho.indexOf("trial_id");
  const semMetricas = [];
  const linhas = trials.linhas.map((linha) => {
    const id = linha[colTrialIdTrials];
    const metrica = porId.get(id);
    if (metrica) usados.add(id);
    else semMetricas.push(id);
    return linha.concat(indicesMetricas.map(({ indice }) => (metrica ? metrica[indice] : "")));
  });

  const cabecalho = trials.cabecalho.concat(indicesMetricas.map(({ nome }) => nome));
  writeFileSync(ARQ_JUNTO, gerarCSV(cabecalho, linhas));

  console.log(`juntou ${trials.linhas.length} trial(s) com ${metricas.linhas.length} medicao(oes).`);
  if (semMetricas.length) {
    console.log(`  AVISO: sem metricas (falta a pasta trials/<id>/): ${semMetricas.join(", ")}`);
  }
  const orfas = [...porId.keys()].filter((id) => !usados.has(id));
  if (orfas.length) {
    console.log(`  AVISO: metricas sem trial correspondente em trials.csv: ${orfas.join(", ")}`);
  }
  console.log(`CSV: ${ARQ_JUNTO}`);
  return 0;
}

// --------------------------------------------------------------------------
// orquestracao (CLI). Devolve o codigo de saida.

export function main(argv) {
  const args = parseArgs(argv);
  if (args.ajuda || args.help || args.h) { mostrarAjuda(); return 0; }
  if (args.juntar) return juntar();

  const minLinhas = args["min-linhas"] === undefined ? MIN_LINHAS_PADRAO : Number(args["min-linhas"]);
  if (!Number.isInteger(minLinhas) || minLinhas < 1) {
    console.error("erro: --min-linhas deve ser um inteiro >= 1.");
    return 1;
  }
  const opcoes = { minLinhas, incluirTestes: Boolean(args["incluir-testes"]) };

  // (a) pasta avulsa: mede e imprime, sem gravar CSV de trials
  if (args.dir && args.dir !== true) {
    const pasta = resolve(RAIZ, args.dir);
    if (!existsSync(pasta)) { console.error(`erro: pasta nao encontrada: ${pasta}`); return 1; }
    const { caminhos, metricas } = medirPasta(pasta, opcoes);
    if (caminhos.length === 0) { console.error(`erro: nenhum arquivo .js em ${pasta}`); return 1; }
    console.log(`metricas estaticas de ${pasta}  (janela de duplicacao: ${minLinhas} linhas)\n`);
    imprimirTabela([{ id: basename(pasta), metricas }]);
    console.log(`\narquivos: ${caminhos.map((c) => relative(pasta, c)).join(", ")}`);
    console.log("funcoes  : " + (metricas.funcoes.length
      ? metricas.funcoes.map((f) => `${f.nome}=${f.complexidade}`).join("  ")
      : "nenhuma"));
    return 0;
  }

  // (b) trials
  const pastaTrials = resolve(RAIZ, args.trials && args.trials !== true ? args.trials : "trials");
  if (!existsSync(pastaTrials)) {
    console.error(`erro: pasta de trials nao encontrada: ${pastaTrials}`);
    console.error('       crie trials/<trial_id>/ com o codigo final de cada trial (ver ../Docs/Ambiente.md).');
    return 1;
  }

  const alvo = args.trial && args.trial !== true ? String(args.trial) : null;
  const ids = readdirSync(pastaTrials)
    .filter((nome) => !nome.startsWith("."))
    .filter((nome) => statSync(join(pastaTrials, nome)).isDirectory())
    .filter((nome) => alvo === null || nome === alvo)
    .sort();

  if (ids.length === 0) {
    console.error(alvo
      ? `erro: trial nao encontrado: ${join(pastaTrials, alvo)}`
      : `erro: nenhum trial em ${pastaTrials} (esperado trials/<participante>_<kata>_<tratamento>/).`);
    return 1;
  }

  console.log(`metricas estaticas de ${ids.length} trial(s) em ${pastaTrials}`);
  console.log(`janela de duplicacao: ${minLinhas} linhas | arquivos de teste: ${opcoes.incluirTestes ? "incluidos" : "ignorados"}\n`);

  const resultados = [];
  for (const id of ids) {
    const { caminhos, metricas } = medirPasta(join(pastaTrials, id), opcoes);
    if (caminhos.length === 0) {
      console.log(`aviso: ${id} nao tem arquivo .js analisavel - trial ignorado.`);
      continue;
    }
    resultados.push({ id, metricas });
  }

  if (resultados.length === 0) {
    console.error("erro: nenhum trial com codigo analisavel.");
    return 1;
  }

  imprimirTabela(resultados);
  imprimirResumoPorTratamento(resultados);

  writeFileSync(ARQ_METRICAS, gerarCSV(CABECALHO, resultados.map((r) => linhaDoCSV(r.id, r.metricas))));
  console.log(`\nCSV: ${ARQ_METRICAS}`);
  console.log('junte com os tempos: node src/metricas.js --juntar');
  return 0;
}

function mostrarAjuda() {
  console.log(`metricas - coleta das metricas estaticas do codigo dos trials (Lab02 / S01)

uso:
  node src/metricas.js                            mede todos os trials/<trial_id>/ -> data/metricas.csv
  node src/metricas.js --trial P1_kata-03_com-ia  mede um trial so'
  node src/metricas.js --dir katas/kata-01        mede uma pasta avulsa (nao grava CSV)
  node src/metricas.js --juntar                   trials.csv + metricas.csv -> trials-com-metricas.csv

opcoes:
  --min-linhas N     janela da deteccao de duplicacao (padrao ${MIN_LINHAS_PADRAO} linhas)
  --incluir-testes   tambem mede os arquivos *.test.js (padrao: ignorados)
  --trials <pasta>   troca a pasta de trials (padrao: trials/)

metricas coletadas (definicoes em ../Docs/Ambiente.md):
  loc                                LOC do validar-katas.js (sem vazias/comentarios)
  complexidade_ciclomatica_media     McCabe por funcao: 1 + if/for/while/do/case/catch/&&/||/??/?:
  complexidade_ciclomatica_max/total maior valor e soma (analoga ao WMC do CK)
  duplicacao_percentual              % de linhas em blocos repetidos (estilo PMD CPD)
  volume_halstead / indice_manutenibilidade   MI normalizado 0-100 (formula do radon mi)`);
}

// so dispara o CLI quando executado como script (nao quando importado por um teste)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
