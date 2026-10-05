// Ponto de entrada UNICO do pipeline do Lab03:
//
//   node src/pipeline.js --config config.json                      # todas as etapas
//   node src/pipeline.js --config config.json --etapa repositorios # so' uma etapa
//   node src/pipeline.js --sem-cache ...                           # ignora o cache em disco
//
// Cada etapa recebe o mesmo contexto { config, cliente, log } e le/grava seus
// dados em config.diretorios.saida. As etapas de B (releases/lead time) e de
// C (workflow runs/CFR/recuperacao) entram na lista ETAPAS, depois de
// "repositorios", consumindo repositoriosParaColeta() de src/selecao/index.js.

import { pathToFileURL } from "node:url";
import { carregarConfig } from "./config.js";
import { carregarEnv } from "./env.js";
import { criarCacheEmDisco, criarCacheEmMemoria } from "./github/cache.js";
import { criarClienteGitHub, lerToken } from "./github/cliente.js";
import { criarLog } from "./log.js";
import { executarSelecao } from "./selecao/index.js";

export const ETAPAS = [
  { nome: "repositorios", descricao: "selecao, funil e metadados dos repositorios (Pessoa A)", executar: executarSelecao },
];

export function lerArgumentos(argv) {
  const args = { config: "config.json", etapa: null, semCache: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" || arg === "--etapa") {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) throw new Error(`${arg} exige um valor`);
      args[arg.slice(2)] = valor;
      i += 1;
    } else if (arg === "--sem-cache") {
      args.semCache = true;
    } else {
      throw new Error(`argumento desconhecido: ${arg}`);
    }
  }
  return args;
}

export async function main(argv = process.argv.slice(2), { log = criarLog(), fetch } = {}) {
  carregarEnv();
  const args = lerArgumentos(argv);
  const etapas = args.etapa ? ETAPAS.filter((e) => e.nome === args.etapa) : ETAPAS;
  if (etapas.length === 0) {
    throw new Error(`etapa desconhecida: ${args.etapa} (disponiveis: ${ETAPAS.map((e) => e.nome).join(", ")})`);
  }

  const config = carregarConfig(args.config);
  const token = lerToken();
  const cache = args.semCache ? criarCacheEmMemoria() : criarCacheEmDisco(config.diretorios.cache, { log });
  const cliente = criarClienteGitHub({ token, cache, log, ...(fetch ? { fetch } : {}) });
  log.info(`cache: ${cache.descricao}`);

  for (const etapa of etapas) {
    log.info(`== etapa "${etapa.nome}": ${etapa.descricao}`);
    await etapa.executar({ config, cliente, log });
  }

  const { requisicoes, doCache, esperasPorLimite, novasTentativas } = cliente.estatisticas;
  log.info(
    `fim: ${requisicoes} requisicoes a API, ${doCache} respostas do cache, ` +
      `${esperasPorLimite} esperas por rate limit, ${novasTentativas} novas tentativas`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.on("SIGINT", () => {
    console.error("\nInterrompido. Rode o mesmo comando de novo para continuar de onde parou (as respostas ja obtidas estao no cache).");
    process.exit(130);
  });
  main().catch((erro) => {
    console.error(`Erro: ${erro.message}`);
    process.exit(1);
  });
}
