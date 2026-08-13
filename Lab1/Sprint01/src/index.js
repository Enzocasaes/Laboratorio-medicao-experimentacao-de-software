import { pathToFileURL } from "node:url";

import { carregarEnv } from "./env.js";
import { executarQueryGraphQL } from "./github.js";
import { QUERY_RQ01 } from "./queries/rq01.js";

const REPOSITORIO_PADRAO = { owner: "facebook", name: "react" };

const DIAS_POR_ANO = 365.25;
const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export function converterCreatedAt(createdAt) {
  if (createdAt === null || createdAt === undefined || createdAt === "") {
    throw new Error('O repositorio foi encontrado, mas o campo "createdAt" veio vazio na resposta.');
  }
  if (typeof createdAt !== "string") {
    throw new Error(`O campo "createdAt" deveria ser uma string ISO 8601, mas veio: ${typeof createdAt}.`);
  }

  const dataDeCriacao = new Date(createdAt);
  if (Number.isNaN(dataDeCriacao.getTime())) {
    throw new Error(`O campo "createdAt" nao e uma data valida: "${createdAt}".`);
  }
  return dataDeCriacao;
}

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

export function calcularIdade(dataDeCriacao, dataAtual) {
  let totalDeMeses =
    (dataAtual.getUTCFullYear() - dataDeCriacao.getUTCFullYear()) * 12 +
    (dataAtual.getUTCMonth() - dataDeCriacao.getUTCMonth());

  if (adicionarMeses(dataDeCriacao, totalDeMeses).getTime() > dataAtual.getTime()) {
    totalDeMeses -= 1;
  }

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

export function formatarIdade({ anos, meses, dias }) {
  const partes = [
    `${anos} ${anos === 1 ? "ano" : "anos"}`,
    `${meses} ${meses === 1 ? "mes" : "meses"}`,
    `${dias} ${dias === 1 ? "dia" : "dias"}`,
  ];
  return `${partes[0]}, ${partes[1]} e ${partes[2]}`;
}

async function main() {
  carregarEnv();

  const [ownerInformado, nameInformado] = process.argv.slice(2);
  const owner = ownerInformado || REPOSITORIO_PADRAO.owner;
  const name = nameInformado || REPOSITORIO_PADRAO.name;

  console.log("=== Lab01S01 - RQ01: idade do repositorio ===");
  console.log(`Consultando a API GraphQL do GitHub para: ${owner}/${name}`);
  console.log("");

  const dados = await executarQueryGraphQL(QUERY_RQ01, { owner, name });

  const repositorio = dados.repository;
  if (!repositorio) {
    throw new Error(
      `O repositorio "${owner}/${name}" nao foi encontrado na resposta da API.\n` +
        "  Verifique se o dono e o nome estao corretos e se o repositorio e publico."
    );
  }

  const dataDeCriacao = converterCreatedAt(repositorio.createdAt);
  const dataAtual = new Date();

  if (dataDeCriacao.getTime() > dataAtual.getTime()) {
    throw new Error(
      `A data de criacao (${repositorio.createdAt}) e posterior a data atual. ` +
        "Verifique o relogio da maquina."
    );
  }

  const idade = calcularIdade(dataDeCriacao, dataAtual);

  console.log(`Repositorio       : ${repositorio.nameWithOwner}`);
  console.log(`Criado em         : ${repositorio.createdAt}`);
  console.log(`Data da execucao  : ${dataAtual.toISOString()}`);
  console.log(`Idade             : ${formatarIdade(idade)}`);
  console.log(`Idade (anos)      : ${idade.anosDecimais.toFixed(2)}`);
}

const foiExecutadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (foiExecutadoDiretamente) {
  main().catch((erro) => {
    console.error("\n[ERRO] " + erro.message);
    process.exitCode = 1;
  });
}
