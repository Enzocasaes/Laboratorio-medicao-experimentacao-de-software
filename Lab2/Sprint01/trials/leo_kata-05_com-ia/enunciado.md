# Kata 05 — Ranking com critérios de desempate

## Contexto

Um torneio precisa de uma classificação final a partir de pontos, vitórias e
saldo de cada participante, com critérios de desempate em cascata.

## Assinatura

```js
classificar(participantes: { nome: string, pontos: number, vitorias: number, saldo: number }[])
  : { nome: string, posicao: number }[]
```

## Regras

1. Ordena por `pontos` (decrescente).
2. Empate em pontos → desempata por `vitorias` (decrescente).
3. Empate também em vitórias → desempata por `saldo` (decrescente).
4. Empate nos três critérios → desempata por `nome` (ordem alfabética,
   **apenas** para definir a ordem de exibição — não afeta a posição).
5. Participantes empatados em **pontos, vitórias e saldo** recebem a
   **mesma posição**; a posição seguinte pula os lugares ocupados (padrão
   `1, 2, 2, 4`, nunca `1, 2, 2, 3`).
6. `nome` deve ser uma string não vazia; todo campo numérico (`pontos`,
   `vitorias`, `saldo`) deve ser um número finito; caso contrário, lança
   `Error`.
7. Nomes duplicados na entrada são um erro (`Error`) — o desempate por nome
   pressupõe nomes distintos.
8. Lista vazia devolve lista vazia.

## Exemplo

```js
classificar([
  { nome: "Ana",   pontos: 10, vitorias: 3, saldo: 5 },
  { nome: "Bruno", pontos: 10, vitorias: 3, saldo: 5 },
  { nome: "Carla", pontos: 10, vitorias: 2, saldo: 8 },
  { nome: "Davi",  pontos: 7,  vitorias: 1, saldo: 1 },
])
// [
//   { nome: "Ana",   posicao: 1 },
//   { nome: "Bruno", posicao: 1 },
//   { nome: "Carla", posicao: 3 },
//   { nome: "Davi",  posicao: 4 },
// ]
```
