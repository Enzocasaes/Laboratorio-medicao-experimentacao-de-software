export function aplicarCupom(carrinho, cupom) {
  // 1. Validação de formato/tipo do cupom (Regra 7)
  if (!cupom || (cupom.tipo !== "percentual" && cupom.tipo !== "fixo")) {
    throw new Error('O tipo de cupom deve ser "percentual" ou "fixo".');
  }

  if (typeof cupom.valor !== "number" || cupom.valor < 0 || Number.isNaN(cupom.valor)) {
    throw new Error('O valor do cupom deve ser um número não negativo.');
  }

  // 2. Cálculo do total geral e total elegível (Regras 1 e 2)
  let totalBruto = 0;
  let totalElegivel = 0;

  for (const item of carrinho) {
    const subtotal = item.preco * item.quantidade;
    totalBruto += subtotal;

    const ehElegivel =
      cupom.categoriasElegiveis === null ||
      cupom.categoriasElegiveis.includes(item.categoria);

    if (ehElegivel) {
      totalElegivel += subtotal;
    }
  }

  const arredondar2 = (num) => Number(num.toFixed(2));

  // 3. Verificações de recusa em ordem sequencial (Regra 3)
  if (cupom.hoje > cupom.validoAte) {
    return {
      aplicavel: false,
      motivo: "cupom expirado",
      desconto: 0,
      total: arredondar2(totalBruto),
    };
  }

  if (totalBruto < cupom.valorMinimoCompra) {
    return {
      aplicavel: false,
      motivo: "valor minimo de compra nao atingido",
      desconto: 0,
      total: arredondar2(totalBruto),
    };
  }

  if (totalElegivel === 0) {
    return {
      aplicavel: false,
      motivo: "nenhum item do carrinho e elegivel",
      desconto: 0,
      total: arredondar2(totalBruto),
    };
  }

  // 4. Cálculo do desconto (Regra 4)
  let desconto = 0;
  if (cupom.tipo === "percentual") {
    desconto = (totalElegivel * cupom.valor) / 100;
  } else {
    desconto = Math.min(cupom.valor, totalElegivel);
  }

  // 5. Aplicação do limite de desconto, se houver (Regra 5)
  if (cupom.limiteDesconto !== null && cupom.limiteDesconto !== undefined) {
    desconto = Math.min(desconto, cupom.limiteDesconto);
  }

  // O desconto também não pode exceder o total geral do carrinho
  desconto = Math.min(desconto, totalBruto);

  const totalComDesconto = totalBruto - desconto;

  // 6. Retorno com valores arredondados para 2 casas decimais (Regra 6)
  return {
    aplicavel: true,
    motivo: null,
    desconto: arredondar2(desconto),
    total: arredondar2(totalComDesconto),
  };
}