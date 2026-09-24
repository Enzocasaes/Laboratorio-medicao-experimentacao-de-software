# Kata 02 — Agendador de salas sem conflito

## Contexto

Um sistema de reservas de salas de reunião recebe uma lista de pedidos, na
ordem em que chegaram, e precisa decidir quais aceitar. Um pedido só pode ser
aceito se **não** conflitar em horário com nenhum pedido **já aceito** para a
**mesma sala**.

## Assinatura

```js
alocarReservas(reservas: { sala: string, inicioMin: number, fimMin: number }[])
  : { alocadas: object[], recusadas: object[] }
```

`inicioMin` e `fimMin` são minutos desde a meia-noite (0–1439).

## Regras

1. Processa os pedidos **na ordem recebida**.
2. Um pedido conflita com outro (mesma sala) se os intervalos se sobrepõem,
   com **fim exclusivo**: `[inicio, fim)`. Ou seja, uma reserva que termina às
   14:00 **não** conflita com outra que começa às 14:00.
3. Aceita o pedido se não conflitar com nenhum já aceito **naquela sala**;
   caso contrário, recusa.
4. Reservas em salas diferentes nunca conflitam entre si.
5. Devolve `{ alocadas, recusadas }`, cada lista preservando a **ordem
   original** dos pedidos.
6. `sala` deve ser uma string não vazia; `inicioMin` e `fimMin` devem ser
   inteiros em `[0, 1439]`; um pedido com `inicioMin >= fimMin` também é
   inválido. Qualquer uma dessas violações lança `Error`.

## Exemplos

- `[{sala:"A",inicioMin:0,fimMin:60}, {sala:"A",inicioMin:60,fimMin:90}]` →
  ambos **alocados** (fim exclusivo, sem sobreposição).
- `[{sala:"A",inicioMin:0,fimMin:60}, {sala:"A",inicioMin:30,fimMin:45}]` →
  o primeiro alocado, o segundo **recusado** (sobrepõe).
- `[{sala:"A",inicioMin:0,fimMin:60}, {sala:"B",inicioMin:0,fimMin:60}]` →
  ambos alocados (salas diferentes).
