import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { VALIDACOES } from "./validacoes/index.js";
import { lerCSV } from "./csv.js";

const DIRETORIO_DE_DADOS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");

function validarCSV(validacao) {
  console.log(`\n=== ${validacao.titulo} ===`);

  const caminho = resolve(DIRETORIO_DE_DADOS, validacao.arquivoCSV);
  if (!existsSync(caminho)) {
    console.log(`FALHA arquivo nao encontrado: ${caminho}`);
    console.log(`      rode "npm run test:${validacao.chave}" ou "npm run minerar:todas" primeiro.`);
    return false;
  }

  const texto = readFileSync(caminho, "utf8");
  const { cabecalho, linhas } = lerCSV(texto);

  console.log(`Arquivo    : ${caminho}`);
  console.log(`Cabecalho  : ${cabecalho.join(", ")}`);
  console.log(`Linhas lidas: ${linhas.length} (sem contar o cabecalho)`);

  const resultados = validacao.validar(cabecalho, linhas);

  let checagensComFalha = 0;
  for (const { checagem, descricao, erros } of resultados) {
    if (erros.length === 0) {
      console.log(`\nOK    ${checagem} — ${descricao}`);
    } else {
      checagensComFalha += 1;
      console.log(`\nFALHA ${checagem} — ${descricao}`);
      console.log(`      ${erros.length} erro${erros.length === 1 ? "" : "s"} encontrado${erros.length === 1 ? "" : "s"}:`);
      for (const erro of erros) console.log(`      - ${erro}`);
    }
  }

  if (typeof validacao.relatorio === "function") {
    validacao.relatorio(linhas);
  }

  const passou = checagensComFalha === 0;
  console.log(
    `\nResultado: ${resultados.length - checagensComFalha}/${resultados.length} checagens passaram — ` +
      (passou ? "dados validos." : "dados invalidos, ver detalhes acima.")
  );
  return passou;
}

function main() {
  const chave = process.argv[2];
  const disponiveis = Object.keys(VALIDACOES).join(", ");

  if (!chave) {
    console.error("Informe a validacao. Ex.: node src/validar.js rq01");
    console.error(`Disponiveis: ${disponiveis}, todas`);
    process.exitCode = 1;
    return;
  }

  const selecionadas =
    chave === "todas"
      ? Object.values(VALIDACOES)
      : VALIDACOES[chave]
        ? [VALIDACOES[chave]]
        : null;

  if (!selecionadas) {
    console.error(`Validacao desconhecida: "${chave}". Use: ${disponiveis}, todas`);
    process.exitCode = 1;
    return;
  }

  const todasPassaram = selecionadas.map(validarCSV).every(Boolean);
  process.exitCode = todasPassaram ? 0 : 1;
}

const foiExecutadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (foiExecutadoDiretamente) {
  main();
}
