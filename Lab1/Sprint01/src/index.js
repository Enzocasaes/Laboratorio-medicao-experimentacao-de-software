/**
 * Lab01S01 - RQ01: "Sistemas populares sao maduros/antigos?"
 * Metrica: idade do repositorio, calculada a partir da data de criacao.
 *
 * Este e o ponto de entrada do programa. Ele:
 *   1. carrega o token do arquivo .env;
 *   2. pede ao GitHub, via GraphQL, o nome e o createdAt de UM repositorio;
 *   3. valida a resposta;
 *   4. calcula a idade em JavaScript (a API nao devolve a idade pronta);
 *   5. imprime o resultado no terminal.
 *
 * Uso:
 *   node src/index.js                    -> usa o repositorio padrao (facebook/react)
 *   node src/index.js torvalds linux     -> consulta o repositorio informado
 */

import { pathToFileURL } from "node:url";

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_RQ01 } from "./queries/rq01.js";

/** Repositorio usado no teste quando nenhum e informado na linha de comando. */
const REPOSITORIO_PADRAO = { owner: "facebook", name: "react" };

/** Quantidade media de dias em um ano, considerando anos bissextos (365,25). */
const DIAS_POR_ANO = 365.25;
const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Converte o texto de createdAt em um objeto Date, validando o valor.
 *
 * @param {unknown} createdAt Valor recebido da API.
 * @returns {Date}
 * @throws {Error} Se o campo estiver ausente ou nao for uma data valida.
 */
export function converterCreatedAt(createdAt) {
  if (createdAt === null || createdAt === undefined || createdAt === "") {
    throw new Error('O repositorio foi encontrado, mas o campo "createdAt" veio vazio na resposta.');
  }
  if (typeof createdAt !== "string") {
    throw new Error(`O campo "createdAt" deveria ser uma string ISO 8601, mas veio: ${typeof createdAt}.`);
  }

  const dataDeCriacao = new Date(createdAt);
  // Um Date invalido tem getTime() igual a NaN.
  if (Number.isNaN(dataDeCriacao.getTime())) {
    throw new Error(`O campo "createdAt" nao e uma data valida: "${createdAt}".`);
  }
  return dataDeCriacao;
}

/**
 * Devolve uma nova data igual a recebida, porem somada de N meses (em UTC),
 * preservando a hora original.
 *
 * O cuidado necessario aqui e o "estouro de dia": 31/01 + 1 mes nao existe,
 * porque fevereiro nao tem dia 31. Nesses casos o resultado e ajustado para o
 * ultimo dia do mes de destino (28/02, ou 29/02 em ano bissexto).
 *
 * Dois recursos do Date sao usados:
 *   - Date.UTC aceita indice de mes fora da faixa 0..11 e vira o ano sozinho
 *     (mes 26 a partir de 2024 = marco de 2026);
 *   - Date.UTC(ano, mes + 1, 0) devolve o ultimo dia do mes "mes", porque o
 *     dia 0 e interpretado como "o dia anterior ao dia 1".
 *
 * @param {Date} data Data de origem.
 * @param {number} quantidadeDeMeses Quantos meses somar.
 * @returns {Date}
 */
function adicionarMeses(data, quantidadeDeMeses) {
  const ano = data.getUTCFullYear();
  const mesDestino = data.getUTCMonth() + quantidadeDeMeses;

  const ultimoDiaDoMesDestino = new Date(Date.UTC(ano, mesDestino + 1, 0)).getUTCDate();
  const diaAjustado = Math.min(data.getUTCDate(), ultimoDiaDoMesDestino);

  return new Date(
    Date.UTC(
      ano,
      mesDestino,
      diaAjustado,
      data.getUTCHours(),
      data.getUTCMinutes(),
      data.getUTCSeconds(),
      data.getUTCMilliseconds()
    )
  );
}

/**
 * Calcula a idade do repositorio a partir da data de criacao.
 *
 * O calculo e feito AQUI, no JavaScript - a API GraphQL fornece apenas o
 * instante de criacao (createdAt). Duas medidas sao produzidas:
 *
 *   - anos / meses / dias completos: contagem exata de calendario.
 *     E o valor legivel, usado na saida do terminal.
 *
 *   - anosDecimais: diferenca total em milissegundos convertida para anos
 *     (dividindo por 365,25 dias). E o valor numerico continuo, que sera
 *     usado nas sprints seguintes para calcular a mediana das RQs.
 *
 * Como o calendario e irregular (meses de 28 a 31 dias, anos bissextos),
 * a contagem e feita em dois passos, e nao subtraindo os campos das datas:
 *
 *   1. Descobrir quantos MESES completos se passaram desde a criacao.
 *   2. Avancar a data de criacao por esse tanto de meses - chegando ao
 *      "ultimo mesversario" - e contar quantos dias inteiros faltam dali
 *      ate a data atual.
 *
 * Isso evita o erro classico da subtracao campo a campo. Exemplo:
 * de 31/01/2024 ate 01/03/2026, "dia atual menos dia de criacao" da 1-31 =
 * -30, e nem emprestar os 28 dias de fevereiro conserta (daria -2 dias).
 * Pelo metodo em dois passos o resultado sai correto: 2 anos, 1 mes e 1 dia.
 *
 * Convencao adotada para meses curtos (a mesma das bibliotecas de data mais
 * usadas): quando o dia de criacao nao existe no mes de destino, vale o
 * ultimo dia daquele mes. Assim, um repositorio criado em 31/01 completa
 * 1 mes no dia 28/02 (ou 29/02), e um criado em 29/02 faz aniversario em
 * 28/02 nos anos nao bissextos.
 *
 * Todos os componentes sao lidos em UTC (getUTCFullYear, getUTCMonth,
 * getUTCDate) porque o createdAt do GitHub vem em UTC. Usar os metodos
 * locais faria o resultado mudar conforme o fuso da maquina que executa o
 * script - algo indesejavel em um experimento reproduzivel.
 *
 * @param {Date} dataDeCriacao Data de criacao do repositorio.
 * @param {Date} dataAtual     Data da execucao do programa.
 * @returns {{anos: number, meses: number, dias: number, anosDecimais: number}}
 */
export function calcularIdade(dataDeCriacao, dataAtual) {
  // Passo 1: estimativa de meses completos, olhando so ano e mes...
  let totalDeMeses =
    (dataAtual.getUTCFullYear() - dataDeCriacao.getUTCFullYear()) * 12 +
    (dataAtual.getUTCMonth() - dataDeCriacao.getUTCMonth());

  // ...e correcao: se o mesversario ainda nao chegou dentro do mes atual,
  // o ultimo mes nao esta completo e precisa ser descontado.
  if (adicionarMeses(dataDeCriacao, totalDeMeses).getTime() > dataAtual.getTime()) {
    totalDeMeses -= 1;
  }

  // Passo 2: os dias que sobram entre o ultimo mesversario e hoje.
  const ultimoMesversario = adicionarMeses(dataDeCriacao, totalDeMeses);
  const dias = Math.floor(
    (dataAtual.getTime() - ultimoMesversario.getTime()) / MILISSEGUNDOS_POR_DIA
  );

  const anos = Math.floor(totalDeMeses / 12);
  const meses = totalDeMeses % 12;

  const diferencaEmMilissegundos = dataAtual.getTime() - dataDeCriacao.getTime();
  const anosDecimais = diferencaEmMilissegundos / (MILISSEGUNDOS_POR_DIA * DIAS_POR_ANO);

  return { anos, meses, dias, anosDecimais };
}

/** Monta o texto da idade, cuidando do singular/plural. */
export function formatarIdade({ anos, meses, dias }) {
  const partes = [
    `${anos} ${anos === 1 ? "ano" : "anos"}`,
    `${meses} ${meses === 1 ? "mes" : "meses"}`,
    `${dias} ${dias === 1 ? "dia" : "dias"}`,
  ];
  return `${partes[0]}, ${partes[1]} e ${partes[2]}`;
}

async function main() {
  // 1) Carrega GITHUB_TOKEN do arquivo .env para dentro de process.env.
  carregarEnv();

  // 2) Define qual repositorio consultar (argumentos da linha de comando
  //    ou o padrao). Nesta sprint testamos com UM unico repositorio.
  const [ownerInformado, nameInformado] = process.argv.slice(2);
  const owner = ownerInformado || REPOSITORIO_PADRAO.owner;
  const name = nameInformado || REPOSITORIO_PADRAO.name;

  console.log("=== Lab01S01 - RQ01: idade do repositorio ===");
  console.log(`Consultando a API GraphQL do GitHub para: ${owner}/${name}`);
  console.log("");

  // 3) Executa a consulta GraphQL. As variaveis $owner e $name declaradas
  //    na query recebem os valores deste objeto.
  const dados = await executarQueryGraphQL(QUERY_RQ01, { owner, name });

  // 4) Valida a resposta. Quando o repositorio nao existe (ou o token nao tem
  //    permissao para ve-lo), o GitHub costuma devolver repository: null.
  const repositorio = dados.repository;
  if (!repositorio) {
    throw new Error(
      `O repositorio "${owner}/${name}" nao foi encontrado na resposta da API.\n` +
        "  Verifique se o dono e o nome estao corretos e se o repositorio e publico."
    );
  }

  // 5) Calcula a idade em JavaScript, a partir do createdAt devolvido pela API.
  const dataDeCriacao = converterCreatedAt(repositorio.createdAt);
  const dataAtual = new Date();

  if (dataDeCriacao.getTime() > dataAtual.getTime()) {
    throw new Error(
      `A data de criacao (${repositorio.createdAt}) e posterior a data atual. ` +
        "Verifique o relogio da maquina."
    );
  }

  const idade = calcularIdade(dataDeCriacao, dataAtual);

  // 6) Exibe o resultado.
  console.log(`Repositorio       : ${repositorio.nameWithOwner}`);
  console.log(`Criado em         : ${repositorio.createdAt}`);
  console.log(`Data da execucao  : ${dataAtual.toISOString()}`);
  console.log(`Idade             : ${formatarIdade(idade)}`);
  console.log(`Idade (anos)      : ${idade.anosDecimais.toFixed(2)}`);
}

// Executa main() apenas quando este arquivo e chamado diretamente
// ("node src/index.js"). Assim outro script pode importar calcularIdade()
// - por exemplo os testes ou o script unico do grupo - sem disparar a
// consulta a API.
const foiExecutadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (foiExecutadoDiretamente) {
  // Trata qualquer erro que tenha subido ate aqui: a mensagem vai para o
  // stderr e o processo termina com codigo 1, deixando claro que falhou.
  main().catch((erro) => {
    console.error("\n[ERRO] " + erro.message);
    process.exitCode = 1;
  });
}
