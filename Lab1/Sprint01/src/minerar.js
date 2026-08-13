/**
 * Runner unico da mineracao. Substitui os antigos scripts testar-rqXX.js /
 * analisar-rq07.js: em vez de um arquivo por RQ (todos repetindo a mesma
 * busca + loop + CSV), aqui a orquestracao mora num lugar so e cada RQ e uma
 * definicao declarativa em src/rqs/.
 *
 * A busca dos repositorios acontece UMA vez; a(s) RQ(s) escolhida(s) sao
 * calculadas em cima da mesma lista coletada.
 *
 * Uso:
 *   node src/minerar.js rq05      -> roda so a RQ05
 *   node src/minerar.js todas     -> roda todas as RQs registradas
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MineradorDeRepositorios } from "./MineradorDeRepositorios.js";
import { RQS } from "./rqs/index.js";
import { gerarCSV } from "./csv.js";

/** Quantos repositorios coletar. Troque para 1000 na coleta oficial (S02). */
const QUANTIDADE = 100;

const DIRETORIO_DE_DADOS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");

/**
 * Executa uma RQ sobre a lista de repositorios ja coletada e grava seu CSV.
 * Suporta os dois formatos de definicao: por repositorio (extrair/resumir) e
 * agregada (analisar).
 */
function executarRQ(rq, repositorios, contexto) {
  console.log(`\n=== ${rq.titulo} ===`);

  let linhas;

  if (typeof rq.analisar === "function") {
    // RQ agregada (ex.: RQ07): produz suas proprias linhas e imprime o resumo.
    linhas = rq.analisar(repositorios, contexto);
  } else {
    // RQ por repositorio: extrai a metrica de cada no; um repo com erro nao
    // derruba os demais (mesma tolerancia dos scripts antigos).
    linhas = [];
    const valores = [];
    for (const repo of repositorios) {
      try {
        const { valor, celulas, rotulo } = rq.extrair(repo, contexto);
        valores.push(valor);
        linhas.push([repo.nameWithOwner, ...celulas]);
        if (rotulo !== undefined) {
          console.log(`OK    ${repo.nameWithOwner.padEnd(30)} -> ${rotulo}`);
        }
      } catch (erro) {
        console.log(`FALHA ${repo.nameWithOwner.padEnd(30)} ${erro.message}`);
      }
    }
    console.log(`\nProcessados com sucesso: ${valores.length}/${repositorios.length}`);
    if (valores.length > 0) rq.resumir(valores);
  }

  const caminho = resolve(DIRETORIO_DE_DADOS, rq.arquivoCSV);
  writeFileSync(caminho, gerarCSV(rq.cabecalhoCSV, linhas), "utf8");
  console.log(`CSV gravado em: ${caminho}`);
}

async function main() {
  const chave = process.argv[2];
  const disponiveis = Object.keys(RQS).join(", ");

  if (!chave) {
    console.error("Informe a RQ. Ex.: node src/minerar.js rq05");
    console.error(`Disponiveis: ${disponiveis}, todas`);
    process.exitCode = 1;
    return;
  }

  const selecionadas =
    chave === "todas"
      ? Object.values(RQS)
      : RQS[chave]
        ? [RQS[chave]]
        : null;

  if (!selecionadas) {
    console.error(`RQ desconhecida: "${chave}". Use: ${disponiveis}, todas`);
    process.exitCode = 1;
    return;
  }

  const minerador = new MineradorDeRepositorios({ quantidade: QUANTIDADE });
  console.log(`Coletando os ${QUANTIDADE} repositorios mais populares (busca unica paginada)...\n`);
  const repositorios = await minerador.coletarRepositorios();

  // "agora" e fixado uma vez para que todas as RQs usem o mesmo instante de
  // referencia (idade, dias desde atualizacao) - reprodutibilidade.
  const contexto = { agora: new Date() };
  for (const rq of selecionadas) executarRQ(rq, repositorios, contexto);
}

main().catch((erro) => {
  console.error("\n[ERRO] " + erro.message);
  process.exitCode = 1;
});
