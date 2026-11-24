# Lab05 · Sprint 01 — Dados da coleta piloto (Participante C)

Saídas da **coleta piloto**, feitas com os scripts de
[`../coleta/`](../coleta/). Servem para mostrar que a instrumentação e o plano
de análise funcionam ponta a ponta.

> **Isto não é resultado do experimento.** São **4 rodadas, 280 consultas**,
> numa única rede, numa madrugada. Qualquer número daqui descreve esta máquina
> nesta hora, não os resolvedores. O que o piloto prova é que o instrumento
> mede e que a análise fecha.

Para aumentar o piloto, basta rodar o coletor de novo com a **mesma saída**:
ele acrescenta ao arquivo e não repete o cabeçalho.

```bash
.venv/bin/python Sprint01/coleta/coletor.py --rede-id piloto-c \
    --rodadas 20 --intervalo 120 \
    --padrao padrao-gateway=192.168.0.1 \
    --saida Sprint01/dados/piloto_c.csv
python3 Sprint01/coleta/analise.py Sprint01/dados/piloto_c.csv \
    --md Sprint01/dados/analise_piloto_c.md
```

| Arquivo | O que é |
| --- | --- |
| `piloto_c.csv` | a coleta: uma linha por consulta, 30 colunas (esquema da seção 9.6) |
| `rede_piloto-c.json` | a ficha da rede, gerada por `validar_rede.py` (seção 9.5) |
| `analise_piloto_c.md` | o relatório da análise, gerado por `analise.py` |

## Como refazer

```bash
cd Lab5
.venv/bin/python Sprint01/coleta/validar_rede.py --rede-id piloto-c \
    --padrao padrao-gateway=192.168.0.1 \
    --saida Sprint01/dados/rede_piloto-c.json

.venv/bin/python Sprint01/coleta/coletor.py --rede-id piloto-c \
    --rodadas 12 --intervalo 120 \
    --padrao padrao-gateway=192.168.0.1 \
    --saida Sprint01/dados/piloto_c.csv

python3 Sprint01/coleta/analise.py Sprint01/dados/piloto_c.csv \
    --md Sprint01/dados/analise_piloto_c.md
```

A coleta sorteia a ordem dos tratamentos a cada rodada e **registra a semente
no terminal**; para repetir a mesma ordem, passe `--semente`.

## O que o piloto mediu

- **4 resolvedores:** 1.1.1.1, 8.8.8.8 e os **dois** resolvedores padrão desta
  rede — o do provedor (IPv6) e o encaminhador no gateway (IPv4). A rede não
  tem nameserver IPv4 configurado; o porquê de medir os dois está na seção 3.2
  do [`PlanoDeInstrumentacao.md`](../../Docs/PlanoDeInstrumentacao.md).
- **Só C3.** C1 e C2 dependem de um domínio do grupo (pendência D1). O coletor
  implementa as duas e as liga com `--zona`; sem ela, não inventa estado de
  cache.
- **15 domínios**, com os três estratos da seção 9.7 representados. A lista
  definitiva sai da Tranco congelada, que é decisão do Participante B.

## Privacidade

O CSV guarda o **identificador** do resolvedor (`1.1.1.1`, `padrao-gateway`),
nunca o endereço do cliente nem a sub-rede devolvida por ECS.

A ficha da rede guarda o número do AS e o nome da organização. Os endereços
que aparecem nela estão **truncados** — `/24` em IPv4 e `/48` em IPv6, por
exemplo `2804:14d:1::/48`. Endereços privados passam inteiros, porque
`192.168.0.1` não identifica ninguém e saber que o padrão é o roteador importa
para classificar a rede. Os endereços devolvidos pelas sondas não entram de
forma alguma: eles são consultados para descobrir o AS e descartados. É a
regra da seção 9.6.
