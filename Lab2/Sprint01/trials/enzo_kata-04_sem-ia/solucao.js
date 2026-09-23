// enzo_kata-04_sem-ia
// Implemente aqui. O enunciado esta' em enunciado.md, nesta pasta.

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

export function aplicarCupom(carrinho, cupom) {
  if (cupom.tipo !== "percentual" && cupom.tipo !== "fixo") {
    throw new Error("tipo de cupom invalido");
  }
  if (cupom.valor < 0) {
    throw new Error("valor do cupom nao pode ser negativo");
  }

  const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  const totalElegivel = carrinho
    .filter((item) => cupom.categoriasElegiveis === null || cupom.categoriasElegiveis.includes(item.categoria))
    .reduce((soma, item) => soma + item.preco * item.quantidade, 0);

  const recusar = (motivo) => ({
    aplicavel: false,
    motivo,
    desconto: 0,
    total: arredondar(total),
  });

  if (cupom.hoje > cupom.validoAte) return recusar("cupom expirado");
  if (total < cupom.valorMinimoCompra) return recusar("valor minimo de compra nao atingido");
  if (totalElegivel === 0) return recusar("nenhum item do carrinho e elegivel");

  let desconto = cupom.tipo === "percentual"
    ? (totalElegivel * cupom.valor) / 100
    : Math.min(cupom.valor, totalElegivel);

  if (cupom.limiteDesconto !== null) {
    desconto = Math.min(desconto, cupom.limiteDesconto);
  }

  return {
    aplicavel: true,
    motivo: null,
    desconto: arredondar(desconto),
    total: arredondar(total - desconto),
  };
}
