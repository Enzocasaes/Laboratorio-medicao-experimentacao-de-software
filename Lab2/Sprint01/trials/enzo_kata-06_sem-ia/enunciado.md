# Kata 06 — Interpretador de datas relativas

## Contexto

Um agendador aceita expressões de data relativas em português e precisa
resolvê-las contra uma data-base.

## Assinatura

```js
resolverData(expr: string, base: string): string   // base e retorno em "YYYY-MM-DD"
```

## Expressões suportadas

| Expressão | Significado |
|---|---|
| `"+N dias"` / `"-N dias"` | soma/subtrai N dias corridos da base |
| `"+N semanas"` / `"-N semanas"` | soma/subtrai N×7 dias da base |
| `"+N dias uteis"` / `"-N dias uteis"` | soma/subtrai N dias **úteis**
  (sábado e domingo não contam) |
| `"proxima <dia da semana>"` | a **próxima** data, estritamente depois da
  base, cujo dia da semana seja o indicado (`segunda`, `terca`, `quarta`,
  `quinta`, `sexta`, `sabado`, `domingo`); se a base já cair nesse dia, ainda
  assim avança para a ocorrência **seguinte** (não retorna a própria base) |
| `"ultimo dia do mes"` | o último dia do mês da data-base |

A comparação da expressão ignora maiúsculas/minúsculas e espaços nas pontas.
Qualquer expressão fora dessa lista lança `Error` com a mensagem padronizada
`` `expressao de data invalida: "<expr>"` ``.

## Regras

1. `base` está sempre em formato válido `YYYY-MM-DD`.
2. Meses e virada de ano são tratados corretamente (aritmética de calendário
   real, sem aproximação).
3. `+0 dias` devolve a própria `base`.

## Exemplos

- `resolverData("+3 dias", "2026-01-30")` → `"2026-02-02"`.
- `resolverData("-2 semanas", "2026-01-30")` → `"2026-01-16"`.
- `resolverData("proxima segunda", "2026-02-06")` (sexta-feira) →
  `"2026-02-09"`.
- `resolverData("ultimo dia do mes", "2026-02-10")` → `"2026-02-28"`.
- `resolverData("+5 dias uteis", "2026-02-06")` (sexta-feira) →
  `"2026-02-13"` (pula os dois fins de semana no meio do caminho).
