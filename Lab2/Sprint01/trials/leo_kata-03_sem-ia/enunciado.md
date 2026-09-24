# Kata 03 — Tarifador de estacionamento por faixas

## Contexto

Um estacionamento cobra por faixas de tempo. Dado o horário de entrada e de
saída (mesmo dia) e uma tabela de tarifas, `calcularTarifa` devolve o valor a
pagar.

## Assinatura

```js
calcularTarifa(entrada: string, saida: string, tabela: {
  toleranciaMin: number,   // ex.: 15
  tarifaMinima: number,    // ex.: 8
  tarifaPorHora: number,   // ex.: 5
  tetoDiario: number,      // ex.: 40
}): number
```

`entrada` e `saida` são strings `HH:MM` (24h) do mesmo dia.

## Regras

1. `entrada` e `saida` devem casar com `HH:MM`; formato inválido lança
   `Error`. `saida` deve ser estritamente depois de `entrada`; caso
   contrário, lança `Error`.
2. Os campos de `tabela` devem ser números **não negativos**; caso
   contrário, lança `Error`.
3. Permanência de até `toleranciaMin` minutos (inclusive) é **gratuita**
   (retorna `0`).
4. Acima da tolerância e até **1 hora** (inclusive), cobra `tarifaMinima`.
5. Acima de 1 hora, cobra `tarifaMinima` mais `tarifaPorHora` por **hora
   iniciada** além da primeira (ex.: 1h01min a 2h00min = +1 hora; 2h01min a
   3h00min = +2 horas).
6. O valor final nunca ultrapassa `tetoDiario`.
7. O resultado é arredondado para **2 casas decimais**.

## Exemplos

Com `tabela = { toleranciaMin: 15, tarifaMinima: 8, tarifaPorHora: 5, tetoDiario: 40 }`:

- `"08:00"` → `"08:10"` (10 min): **0** (dentro da tolerância).
- `"08:00"` → `"08:45"` (45 min): **8** (até 1h, tarifa mínima).
- `"08:00"` → `"10:15"` (2h15min): **8 + 2×5 = 18** (2 horas iniciadas após a
  1ª).
- `"08:00"` → `"20:00"` (12h): tarifa calculada e depois limitada a
  **40** (teto diário).
