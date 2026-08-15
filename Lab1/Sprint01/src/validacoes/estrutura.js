export function validarCabecalho(cabecalho, cabecalhoEsperado) {
  const erros = [];
  const recebido = cabecalho.join(",");
  const esperado = cabecalhoEsperado.join(",");
  if (recebido !== esperado) {
    erros.push(`Cabecalho incorreto.\n    esperado: ${esperado}\n    recebido: ${recebido}`);
  }
  return erros;
}

export function validarQuantidadeDeLinhas(linhas, quantidadeEsperada) {
  const erros = [];
  if (linhas.length !== quantidadeEsperada) {
    erros.push(`Quantidade de repositorios incorreta: esperado ${quantidadeEsperada}, encontrado ${linhas.length}.`);
  }
  return erros;
}

export function validarSemDuplicados(linhas, indiceColunaChave) {
  const contagem = new Map();
  linhas.forEach((linha) => {
    const chave = linha[indiceColunaChave];
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  });

  const duplicados = [...contagem.entries()].filter(([, quantidade]) => quantidade > 1);
  if (duplicados.length === 0) return [];

  const detalhes = duplicados.map(([chave, quantidade]) => `${chave} (${quantidade}x)`).join(", ");
  return [`Repositorios duplicados: ${detalhes}`];
}

export function validarSemCamposVazios(cabecalho, linhas) {
  const erros = [];
  linhas.forEach((linha, indiceDaLinha) => {
    linha.forEach((valor, indiceDaColuna) => {
      if (valor === undefined || valor.trim() === "") {
        const coluna = cabecalho[indiceDaColuna] ?? `coluna ${indiceDaColuna}`;
        erros.push(`Linha ${indiceDaLinha + 2}: campo "${coluna}" vazio (repositorio: ${linha[0] || "?"}).`);
      }
    });
  });
  return erros;
}
