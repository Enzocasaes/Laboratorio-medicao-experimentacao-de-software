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
  };

  const d = { ...DIRETORIOS_PADRAO, ...(bruta.diretorios ?? {}) };
  const diretorios = {
    cache: resolve(baseDir, d.cache),
    saida: resolve(baseDir, d.saida),
  };

  return { janela, selecao, coleta, diretorios };
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
