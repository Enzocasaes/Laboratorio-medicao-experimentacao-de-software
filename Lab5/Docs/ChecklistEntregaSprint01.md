# Lab05 — Checklist de entrega da Sprint 01

Situação em 19/11/2026, referente à versão 3 de
[`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md). Os detalhes estão em
[`RegistroDeRevisao.md`](RegistroDeRevisao.md).

> **Atualização de 19/11/2026 (Participante C).** As seções 9.4–9.6 e 10 foram
> validadas, e as decisões D6, D7 e D8 estão fechadas. Os documentos são
> [`PlanoDeInstrumentacao.md`](PlanoDeInstrumentacao.md),
> [`DefinicaoDasMetricas.md`](DefinicaoDasMetricas.md) e
> [`PlanoDeAnalise.md`](PlanoDeAnalise.md); os scripts e os dados do piloto
> estão em [`../Sprint01/coleta/`](../Sprint01/coleta/) e
> [`../Sprint01/dados/`](../Sprint01/dados/).

Responsáveis: **A** = Planejamento e Pesquisa; **B** = Desenho metodológico;
**C** = Instrumentação e análise. A divisão de papéis ainda precisa ser
confirmada por B e C.

## Requisitos atendidos

| Requisito | Onde está | Responsável |
| --- | --- | --- |
| Software escolhido e apresentado | Seções 1 e 2 | A |
| Evidências de que é real, está em operação e tem alto impacto | Seções 3, 4 e 5 (E1–E17, com fonte, link e datas) | A |
| Pergunta de pesquisa e justificativa | Seção 6 | A |
| Objetivo GQM (Goal, Questions, Metrics e a relação entre eles) | Seção 7 | A |
| Coleta piloto (Do53, DoT e DoH) | Seção 7.2 e `Lab5/Sprint01/piloto/` | A, com C |
| Referências verificáveis | Seção 12 (43 referências, todas citadas no texto) | A |

## Requisitos atendidos como proposta (aguardam validação ou decisão)

| Requisito | Onde está | Depende de | Responsável pela validação |
| --- | --- | --- | --- |
| Caminho de pesquisa | Seção 6.2 | Responsáveis pelas etapas 5–9 (D9) | B |
| Hipóteses | Seções 6 e 10.3 | Validação | B |
| Plano de coleta | Seção 9 | D1–D7 | B e C — **9.4–9.6 validadas por C** |
| Plano de análise | Seção 10 | D8 | C e B — **validado por C** |

## Requisitos parcialmente atendidos

| Requisito | Situação | O que falta | Responsável |
| --- | --- | --- | --- |
| Primeira classificação nas sete categorias | Provisória (seção 8) | Conferir com o material da Aula 8, que não está no repositório | B |

## Pendências que dependem do grupo

| # | Pendência | Responsável |
| --- | --- | --- |
| D1 | Domínio próprio sem DNSSEC, fora da Cloudflare e do Google (Registro, 4.2) | Grupo |
| D2 | Quantidade de redes (proposta: 3) | Grupo |
| D3 | Nomes por rodada (proposta: 80) | B, com C — **C mediu: 70 consultas levam 1,6 a 3,7 s; 340 caberiam em ~15 s** |
| D4 | Intervalo entre rodadas (proposta: 30 min) | B e C — **C: o tempo de execução não é o limite; 30 min continua de pé** |
| D5 | Duração da coleta (proposta: 7 dias, nas três redes ao mesmo tempo) | Grupo |
| D6 | Configuração dos protocolos | **Fechada por C** (PlanoDeInstrumentacao, seção 4) |
| D7 | Ambiente de coleta (versões fixadas, TLS 1.3) | **Fechada por C** (PlanoDeInstrumentacao, seção 5; `requirements.txt` e `ambiente.py`) |
| D8 | Estratégia estatística | **Fechada por C** (PlanoDeAnalise, seção 1); falta o aval de B |
| D9 | Responsáveis pelas etapas 5–9 | Grupo |
| D10 | Conferência das sete categorias com a Aula 8 | B |
| D11 | Verificações de fonte (DoH no Firefox, contagem do APNIC, lista Tranco, estudos no Brasil) | A |
| D12 | Conferir se o Lab05 exige artefato commitado por integrante em cada sprint | Grupo |

## Pronto para entrega?

| Bloco | Situação |
| --- | --- |
| Parte do Participante A (seções 1–5, 6, 7) | **Pronto** |
| Pilotos | **Pronto** |
| Seções de B (6.2, 8, 9.1–9.3, 9.7, 9.8, 10.7) | **Rascunho**: aguarda validação de B; a seção 8 também aguarda a Aula 8 |
| Seções de C (9.4–9.6, 10) | **Validadas** em 19/11/2026, com três ajustes registrados: `TCP_NODELAY` obrigatório, "somente IPv4" não vale para o resolvedor padrão, e a coluna `versao_httpx` no esquema |
| Entregáveis de C (instrumentação, métricas, scripts, piloto, análise) | **Prontos** |
| Documento completo da Sprint 01 | **Não pronto**: depende de D10 e da validação de B (a de C saiu em 19/11). D1–D5 podem ficar como "propostas" na entrega, desde que marcadas assim; D6–D8 já estão fechadas |

Os arquivos do Participante A foram commitados na `main` em 18/11/2026. Os do
Participante C estão na branch `121-validar-instrumentação-e-scripts-de-coleta`.
