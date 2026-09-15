// Kata 04 - Validador de regras de cupom.
// Ver enunciado.md para as regras. Solucao de referencia (autoral).

function validarCupom(cupom) {
  if (cupom.tipo !== "percentual" && cupom.tipo !== "fixo") {
    throw new Error(`tipo de cupom invalido: "${cupom.tipo}"`);
  }
  if (cupom.valor < 0) {
    throw new Error("valor do cupom nao pode ser negativo");
  }
}

function elegivel(item, categorias) {
  return categorias == null || categorias.includes(item.categoria);
}

function somarCarrinho(carrinho, categorias) {
  return carrinho.reduce((soma, item) => {
    return elegivel(item, categorias) ? soma + item.preco * item.quantidade : soma;
  }, 0);
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

function recusar(motivo, totalCarrinho) {
  return { aplicavel: false, motivo, desconto: 0, total: arredondar(totalCarrinho) };
}

function calcularDesconto(cupom, totalElegivel) {
  let desconto = cupom.tipo === "percentual" ? (totalElegivel * cupom.valor) / 100 : Math.min(cupom.valor, totalElegivel);
  if (cupom.limiteDesconto != null) {
    desconto = Math.min(desconto, cupom.limiteDesconto);
  }
  return arredondar(desconto);
}

export function aplicarCupom(carrinho, cupom) {
  validarCupom(cupom);

  const totalCarrinho = somarCarrinho(carrinho, null);
  const totalElegivel = somarCarrinho(carrinho, cupom.categoriasElegiveis ?? null);

  if (cupom.hoje > cupom.validoAte) {
    return recusar("cupom expirado", totalCarrinho);
  }
  if (totalCarrinho < cupom.valorMinimoCompra) {
    return recusar("valor minimo de compra nao atingido", totalCarrinho);
  }
  if (totalElegivel === 0) {
    return recusar("nenhum item do carrinho e elegivel", totalCarrinho);
  }

  const desconto = calcularDesconto(cupom, totalElegivel);
  return { aplicavel: true, motivo: null, desconto, total: arredondar(totalCarrinho - desconto) };
}
