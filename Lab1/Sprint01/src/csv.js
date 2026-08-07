/**
 * Geracao minima de CSV, sem nenhuma biblioteca externa.
 *
 * Existe apenas para os scripts de teste/validacao desta sprint. A coleta
 * definitiva em CSV dos 1000 repositorios (Lab01S02) pode reaproveitar esta
 * mesma funcao.
 */

/**
 * Monta o texto de um arquivo CSV a partir de um cabecalho e das linhas.
 *
 * @param {string[]} cabecalho Nomes das colunas.
 * @param {Array<Array<string|number>>} linhas Uma linha por registro; cada
 *   linha e um array de valores, na mesma ordem do cabecalho.
 * @returns {string} Conteudo pronto para gravar em um arquivo .csv.
 */
export function gerarCSV(cabecalho, linhas) {
  return [cabecalho, ...linhas]
    .map((linha) => linha.map(escaparCampoCSV).join(","))
    .join("\n") + "\n";
}

/**
 * Escapa um valor para uso seguro em CSV: valores com virgula, aspas ou
 * quebra de linha sao envolvidos em aspas duplas, com as aspas internas
 * duplicadas (regra padrao do formato CSV).
 */
function escaparCampoCSV(valor) {
  const texto = String(valor);
  const precisaDeAspas = texto.includes(",") || texto.includes('"') || texto.includes("\n");
  return precisaDeAspas ? `"${texto.replace(/"/g, '""')}"` : texto;
}
