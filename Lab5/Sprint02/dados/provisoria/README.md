# Coleta provisória — rede-c

> **Decisão D13 (24/11/2026): estes são os dados do experimento.** Não há
> tempo para a coleta de 7 dias, e este lote passa a ser a base da análise do
> Lab05 ([ProtocoloExperimental, 8.1](../../../Docs/ProtocoloExperimental.md#81-decisões-fechadas)).
> Os arquivos não foram movidos nem renomeados, e o lote continua `provisoria`
> na base, para o manifesto e os hashes do bruto não mudarem. Os desvios da
> tabela abaixo **continuam valendo** e limitam o que o relatório pode
> concluir (seção "Alcance", no fim).

É uma coleta **curta**, feita em 24/11/2026
antes de o protocolo estar pronto (ProtocoloExperimental.md, seção 9), porque
os dados eram necessários no mesmo dia. Uma coleta de 7 dias chegou a ser
iniciada e foi interrompida depois de 1 rodada; essa rodada foi descartada.

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

## Alcance como dados do experimento (D13)

Resultado da análise: [`../../resultados/analise_rede-c.md`](../../resultados/analise_rede-c.md),
gerado da base validada com `--lote provisoria` e 10.000 réplicas.

| Pergunta | O que estes dados permitem | Por quê |
| --- | --- | --- |
| Q1 / H-a (resolvedores, E-1) | **Inferência**: Friedman, Wilcoxon com Holm, IC por bootstrap | A unidade em C3 é o nome: 15 domínios, 20 rodadas cada |
| Q2 / H-b (cache, C1 × C2 × C3) | **Nada**: só C3 foi coletada | Sem a zona do grupo (D1, modo B) |
| Q3 / H-c (DoT e DoH × Do53, E-2) | **Só descritiva** (Δ das medianas, sem IC nem p) | A unidade é a janela de 6 h, e 10 minutos cabem numa janela só |
| Q4 (falhas, M8) | Descritiva: 0 falhas em 1.500 consultas, IC de Wilson | Período curto demais para eventos raros |
| Variação por horário, por dia ou entre redes | **Nada** | Uma rede, 10 minutos, um dia |

Ameaças a declarar no relatório: uma única rede (validade externa); cache
mais quente que no desenho, porque cada nome de C3 volta a cada ≈ 30 s
(validade interna, superestima o acerto de cache); Wi-Fi; lista de piloto,
sem estratos de popularidade; padrão = roteador, a rede é **(b)**, e a
comparação "padrão × público" se lê como "encaminhador local com cache ×
acesso direto".
