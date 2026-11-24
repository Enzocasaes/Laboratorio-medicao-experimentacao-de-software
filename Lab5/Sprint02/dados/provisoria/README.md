# Coleta provisória — rede-c

**Não é a coleta definitiva.** É uma coleta **curta**, feita em 24/11/2026
antes de o protocolo estar pronto (ProtocoloExperimental.md, seção 9), porque
os dados eram necessários no mesmo dia. Uma coleta de 7 dias chegou a ser
iniciada e foi interrompida depois de 1 rodada; essa rodada foi descartada.
**Não entra** na análise confirmatória.

| Item | Valor | Desvio do protocolo |
| --- | --- | --- |
| Modo | B (sem zona; D1 pendente) | Previsto como contingência |
| Lista de C3 | 15 domínios de piloto, embutidos no coletor | **Sim.** L1 pendente; a seção 8.2 diz que esta lista "não serve" para a definitiva |
| Data de início | 24/11/2026, só nesta rede | **Sim.** D5 pendente; as três redes não começaram juntas |
| Rodadas e intervalo | 60 × 10 s (≈ 10 min), em vez de 336 × 1800 s (7 dias) | **Sim.** Sem variação por faixa horária nem entre dias (Q4 limitada). Com 10 s entre rodadas e 5 domínios por subconjunto, cada nome de C3 volta a ser consultado a cada ≈ 30 s, então o cache fica mais quente que no desenho |
| Conexão | Wi-Fi (desktop sem cabo) | Cabo é preferível (6.1) |
| DNS padrão | O roteador da rede, e não o DNS entregue por DHCP | **Sim.** Ver abaixo |

## Por que o padrão é o roteador

O DHCP desta rede entrega **8.8.8.8 e 1.1.1.1** (configurados no roteador, e
não à mão na máquina). Pela R6 literal, o `padrao` seria 8.8.8.8, o mesmo
tratamento que o Google, e a comparação "padrão × público" perderia o
sentido. O roteador também atende na porta 53 e encaminha para a Cloudflare e
para o Google, então foi usado como `padrao`. A rede é classificada como
**(b)**: a comparação se lê como "encaminhador local com cache × acesso
direto". A decisão é do participante C, tomada em 24/11/2026, e precisa ser
levada ao grupo antes da coleta definitiva.

## Correção feita antes do início

O `validar_rede.py` classificou a rede como **(c), interceptação**, por um
falso positivo. A consulta de AS à Team Cymru falhava de forma intermitente,
e um AS vazio contava como "AS não bate". Foram acrescentados fallback para o
8.8.8.8 e novas tentativas. Com isso, a classificação ficou (b) e estável.

## Arquivos

- `rede-c.csv`: consultas.
- `rede-c.log`: saída de erros do coletor (versões, semente, rodadas, avisos)
  e das fichas.
- `rede-c_ficha_AAAAMMDD.json`: uma ficha por dia.

Estes arquivos são **brutos** e não se editam. Eles entram na base consolidada
como lote `provisoria`; ver [`../../base/README.md`](../../base/README.md).
