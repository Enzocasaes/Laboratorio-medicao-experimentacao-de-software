const TIPOS_VALIDOS = ["percentual", "fixo"];

function arredondar2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function subtotal(itens) {
  return itens.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
}

function validarCupom(cupom) {
  if (!TIPOS_VALIDOS.includes(cupom.tipo)) {
    throw new Error(`tipo de cupom invalido: "${cupom.tipo}"`);
  }
  if (typeof cupom.valor !== "number" || !Number.isFinite(cupom.valor) || cupom.valor < 0) {
    throw new Error("valor do cupom deve ser um numero nao negativo");
  }
}

function recusar(total, motivo) {
  return { aplicavel: false, motivo, desconto: 0, total: arredondar2(total) };
}

export function aplicarCupom(carrinho, cupom) {
  validarCupom(cupom);

  const { tipo, valor, valorMinimoCompra, categoriasElegiveis, limiteDesconto, hoje, validoAte } = cupom;

  const total = subtotal(carrinho);
  const itensElegiveis =
    categoriasElegiveis === null
      ? carrinho
      : carrinho.filter((item) => categoriasElegiveis.includes(item.categoria));
  const totalElegivel = subtotal(itensElegiveis);

  // Datas "YYYY-MM-DD" comparam certo como string
  if (hoje > validoAte) return recusar(total, "cupom expirado");
  if (total < valorMinimoCompra) return recusar(total, "valor minimo de compra nao atingido");
  if (totalElegivel === 0) return recusar(total, "nenhum item do carrinho e elegivel");

  let desconto = tipo === "percentual" ? (totalElegivel * valor) / 100 : Math.min(valor, totalElegivel);

  if (limiteDesconto !== null) {
    desconto = Math.min(desconto, limiteDesconto);
  }

  desconto = arredondar2(desconto);

  return {
    aplicavel: true,
    motivo: null,
    desconto,
    total: arredondar2(total - desconto),
  };
}