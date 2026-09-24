# Kata 04 — Validador de regras de cupom

## Contexto

Um carrinho de e-commerce tem itens com preço, quantidade e categoria. Um
cupom de desconto tem regras de elegibilidade. `aplicarCupom` decide se o
cupom vale para aquele carrinho e, se valer, calcula o desconto.

## Assinatura

```js
aplicarCupom(
  carrinho: { preco: number, quantidade: number, categoria: string }[],
  cupom: {
    tipo: "percentual" | "fixo",
    valor: number,
    valorMinimoCompra: number,
    categoriasElegiveis: string[] | null,  // null = todas as categorias
    limiteDesconto: number | null,         // null = sem limite
    hoje: string,       // "YYYY-MM-DD"
    validoAte: string,  // "YYYY-MM-DD"
  },
): { aplicavel: boolean, motivo: string | null, desconto: number, total: number }
```

## Regras

1. `total` do carrinho = soma de `preco * quantidade` de **todos** os itens.
2. `totalElegivel` = soma de `preco * quantidade` apenas dos itens cuja
   `categoria` está em `categoriasElegiveis` (ou de todos, se
   `categoriasElegiveis` for `null`).
3. Verificações, na ordem, cada uma com um `motivo` específico de recusa:
   1. `hoje > validoAte` → recusado, motivo `"cupom expirado"`.
   2. `total < valorMinimoCompra` → recusado, motivo
      `"valor minimo de compra nao atingido"`.
   3. `totalElegivel === 0` → recusado, motivo
      `"nenhum item do carrinho e elegivel"`.
4. Se nenhuma verificação recusar, o cupom é **aplicável** (`motivo: null`):
   - tipo `"percentual"`: desconto = `totalElegivel * valor / 100`;
   - tipo `"fixo"`: desconto = `min(valor, totalElegivel)`.
5. Se `limiteDesconto` não for `null`, o desconto é limitado a ele.
6. `desconto` e `total` (após aplicar o desconto) são arredondados para 2
   casas decimais. Quando **não** aplicável, `desconto = 0` e `total` é o
   total do carrinho sem desconto.
7. `tipo` fora de `"percentual"`/`"fixo"`, ou `valor` negativo, lança `Error`.

## Exemplos

- Carrinho de R$100 (categoria `"livros"`), cupom de 10% sem restrição de
  categoria, sem limite → `desconto = 10`, `total = 90`.
- Mesmo carrinho, cupom só para categoria `"eletronicos"` → recusado,
  `"nenhum item do carrinho e elegivel"`.
- Cupom fixo de R$50 num carrinho elegível de R$30 → desconto = R$30 (não
  passa do valor elegível).
