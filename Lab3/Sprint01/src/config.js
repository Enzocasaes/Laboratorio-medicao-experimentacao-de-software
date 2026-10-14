// Configuracao central do pipeline (config.json). Nada que muda entre
// execucoes fica no codigo: janela, tamanho da selecao, criterios minimos e
// diretorios vem daqui. O token NAO fica aqui - vem de GITHUB_TOKEN.
//
// As datas da janela sao obrigatorias e nao tem valor padrao: elas sao
// definidas pelo professor e o pipeline se recusa a rodar sem elas.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { criarJanela } from "./janela.js";

// Criterio minimo de inclusao da secao 3 do enunciado (5 releases e 50
// workflow runs validos na janela). Ficam configuraveis, mas o padrao e'
// a definicao oficial da disciplina.
export const SELECAO_PADRAO = Object.freeze({
  estrelasAcimaDe: 1000, // busca "stars:>1000" do enunciado
  quantidadeDeCandidatos: 1500,
  tamanhoAlvoDaAmostra: 100,
  minimoDeReleases: 5,
  minimoDeWorkflowRuns: 50,
});

// Validacao manual (secao 6 do enunciado): amostra-ouro de 60 repositorios,
// 5 releases cada, sorteadas com SEMENTE FIXA para o sorteio ser reproduzivel
// pelo grupo replicador.
export const VALIDACAO_PADRAO = Object.freeze({
  semente: 42,
  repositoriosNaAmostraOuro: 60,
  releasesPorRepositorio: 5,
  // Um arquivo de rotulos por avaliador (processed/rotulos_<nome>.csv). O nome
  // vira parte do caminho, por isso so' letras minusculas, digitos, "_" e "-".
  avaliadores: Object.freeze(["enzo", "caue", "leo"]),
  // Secao 6: "se o F1 ficar abaixo de 0,70, refine a heuristica e reavalie".
  limiarF1: 0.7,
});

export const DIRETORIOS_PADRAO = Object.freeze({
  cache: "data/cache",
  saida: "data",
});

// Tetos da coleta de releases e de commits (etapas da Pessoa B). Existem para
// que um repositorio com historico gigantesco nao consuma a cota inteira da
// API: ao serem atingidos, a coleta e' marcada como truncada em vez de parar
// fingindo que a lista acabou.
export const COLETA_PADRAO = Object.freeze({
  releasesPorPagina: 100, // maximo que a API aceita
  maxPaginasDeReleases: 20, // 2.000 releases por repositorio
  commitsPorPagina: 100,
  maxCommitsPorRelease: 1000, // por comparacao entre duas releases
  runsPorPagina: 100,
  maxPaginasDeRunsPorMes: 10, // 10 x 100 = 1.000, o teto da API por consulta filtrada
});

const MAX_POR_PAGINA = 100; // limite da API para per_page

function inteiroPositivo(valor, campo, { permiteZero = false, maximo = null } = {}) {
  const minimo = permiteZero ? 0 : 1;
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new Error(`Configuracao invalida: ${campo} deve ser um inteiro >= ${minimo} (recebido: ${JSON.stringify(valor)})`);
  }
  if (maximo !== null && valor > maximo) {
    throw new Error(`Configuracao invalida: ${campo} nao pode passar de ${maximo} (recebido: ${valor})`);
  }
  return valor;
}

// Kappa de Fleiss exige ao menos dois avaliadores; nomes repetidos fariam dois
// "avaliadores" lerem o mesmo arquivo e inflariam a concordancia.
export function listaDeAvaliadores(valor, campo) {
  if (!Array.isArray(valor) || valor.length < 2) {
    throw new Error(`Configuracao invalida: ${campo} deve ser uma lista com ao menos 2 nomes (recebido: ${JSON.stringify(valor)})`);
  }
  for (const nome of valor) {
    if (typeof nome !== "string" || !/^[a-z0-9_-]+$/.test(nome)) {
      throw new Error(
        `Configuracao invalida: ${campo} aceita so' letras minusculas, digitos, "_" e "-" (recebido: ${JSON.stringify(nome)})`
      );
    }
  }
  if (new Set(valor).size !== valor.length) {
    throw new Error(`Configuracao invalida: ${campo} tem nomes repetidos (recebido: ${JSON.stringify(valor)})`);
  }
  return [...valor];
}

function proporcao(valor, campo) {
  if (typeof valor !== "number" || !(valor > 0 && valor <= 1)) {
    throw new Error(`Configuracao invalida: ${campo} deve ser um numero em (0, 1] (recebido: ${JSON.stringify(valor)})`);
  }
  return valor;
}

// Recebe o objeto ja lido do JSON e devolve a configuracao normalizada.
// baseDir: diretorios relativos sao resolvidos a partir dele (a pasta do config).
export function validarConfig(bruta, { baseDir = process.cwd() } = {}) {
  if (!bruta || typeof bruta !== "object") {
    throw new Error("Configuracao invalida: o arquivo deve conter um objeto JSON");
  }
  const { janela: janelaBruta } = bruta;
  if (!janelaBruta || janelaBruta.inicio === undefined || janelaBruta.fim === undefined) {
    throw new Error(
      "Configuracao invalida: defina janela.inicio e janela.fim (AAAA-MM-DD).\n" +
        "  As datas da janela de observacao sao fixadas pelo professor (secao 3 do enunciado)."
    );
  }
  const janela = criarJanela(janelaBruta.inicio, janelaBruta.fim);

  const s = { ...SELECAO_PADRAO, ...(bruta.selecao ?? {}) };
  const selecao = {
    estrelasAcimaDe: inteiroPositivo(s.estrelasAcimaDe, "selecao.estrelasAcimaDe", { permiteZero: true }),
    quantidadeDeCandidatos: inteiroPositivo(s.quantidadeDeCandidatos, "selecao.quantidadeDeCandidatos"),
    tamanhoAlvoDaAmostra: inteiroPositivo(s.tamanhoAlvoDaAmostra, "selecao.tamanhoAlvoDaAmostra"),
    minimoDeReleases: inteiroPositivo(s.minimoDeReleases, "selecao.minimoDeReleases", { permiteZero: true }),
    minimoDeWorkflowRuns: inteiroPositivo(s.minimoDeWorkflowRuns, "selecao.minimoDeWorkflowRuns", { permiteZero: true }),
  };
  if (selecao.tamanhoAlvoDaAmostra > selecao.quantidadeDeCandidatos) {
    throw new Error(
      "Configuracao invalida: selecao.tamanhoAlvoDaAmostra nao pode ser maior que selecao.quantidadeDeCandidatos"
    );
  }

  const c = { ...COLETA_PADRAO, ...(bruta.coleta ?? {}) };
  const coleta = {
    releasesPorPagina: inteiroPositivo(c.releasesPorPagina, "coleta.releasesPorPagina", { maximo: MAX_POR_PAGINA }),
    maxPaginasDeReleases: inteiroPositivo(c.maxPaginasDeReleases, "coleta.maxPaginasDeReleases"),
    commitsPorPagina: inteiroPositivo(c.commitsPorPagina, "coleta.commitsPorPagina", { maximo: MAX_POR_PAGINA }),
    maxCommitsPorRelease: inteiroPositivo(c.maxCommitsPorRelease, "coleta.maxCommitsPorRelease"),
    runsPorPagina: inteiroPositivo(c.runsPorPagina, "coleta.runsPorPagina", { maximo: MAX_POR_PAGINA }),
    maxPaginasDeRunsPorMes: inteiroPositivo(c.maxPaginasDeRunsPorMes, "coleta.maxPaginasDeRunsPorMes"),
  };

  const v = { ...VALIDACAO_PADRAO, ...(bruta.validacao ?? {}) };
  const validacao = {
    semente: inteiroPositivo(v.semente, "validacao.semente", { permiteZero: true }),
    repositoriosNaAmostraOuro: inteiroPositivo(v.repositoriosNaAmostraOuro, "validacao.repositoriosNaAmostraOuro"),
    releasesPorRepositorio: inteiroPositivo(v.releasesPorRepositorio, "validacao.releasesPorRepositorio"),
    avaliadores: listaDeAvaliadores(v.avaliadores, "validacao.avaliadores"),
    limiarF1: proporcao(v.limiarF1, "validacao.limiarF1"),
  };

  const d = { ...DIRETORIOS_PADRAO, ...(bruta.diretorios ?? {}) };
  const diretorios = {
    cache: resolve(baseDir, d.cache),
    saida: resolve(baseDir, d.saida),
  };

  return { janela, selecao, coleta, validacao, diretorios };
}

export function carregarConfig(caminho) {
  const caminhoAbsoluto = resolve(caminho);
  let texto;
  try {
    texto = readFileSync(caminhoAbsoluto, "utf8");
  } catch (erro) {
    throw new Error(`Nao foi possivel ler o arquivo de configuracao ${caminhoAbsoluto}: ${erro.message}`);
  }
  let bruta;
  try {
    bruta = JSON.parse(texto);
  } catch (erro) {
    throw new Error(`O arquivo de configuracao ${caminhoAbsoluto} nao e' um JSON valido: ${erro.message}`);
  }
  return validarConfig(bruta, { baseDir: dirname(caminhoAbsoluto) });
}
