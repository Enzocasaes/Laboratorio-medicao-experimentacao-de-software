# Lab05 — Checklist de entrega da Sprint 01

Situação em 18/11/2026, referente à versão 3 de
[`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md) (Participante A) e à
versão 1 de [`DesenhoMetodologico.md`](DesenhoMetodologico.md) (Participante
B). Os detalhes da revisão de A estão em
[`RegistroDeRevisao.md`](RegistroDeRevisao.md).

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
| Referências verificáveis | Seção 12 de A (43 referências) e seção 11 de B (6 acrescentadas) | A e B |
| Caminho de pesquisa nomeado (seção 2b do enunciado) | `DesenhoMetodologico.md`, seção 2 | B |
| Classificação nas sete categorias, com justificativa | `DesenhoMetodologico.md`, seção 3 | B |
| Hipóteses H₀/H₁ formais, com unidade, família e direção | `DesenhoMetodologico.md`, seção 4 | B |
| Variáveis, escalas e entidades/atributos | `DesenhoMetodologico.md`, seção 5 | B |
| Desenho experimental, aleatorização e dimensionamento | `DesenhoMetodologico.md`, seção 6 | B |
| Metodologia de coleta, cadência e regras de ética | `DesenhoMetodologico.md`, seção 7 | B |
| Armadilhas de medição (Goodhart, Campbell, McNamara) | `DesenhoMetodologico.md`, seção 8 | B |
| Ameaças à validade (4 tipos) | `DesenhoMetodologico.md`, seção 9 | B |

## Requisitos atendidos como proposta (aguardam validação ou decisão)

| Requisito | Onde está | Depende de | Responsável pela validação |
| --- | --- | --- | --- |
| Plano de coleta | Seção 9 de A e seção 7 de B | D1, D6, D7 | C |
| Plano de análise | Seção 10 de A | D8 | C |

## Requisitos parcialmente atendidos

| Requisito | Situação | O que falta | Responsável |
| --- | --- | --- | --- |
| Classificação nas sete categorias | Fechada por B (`DesenhoMetodologico.md`, seção 3) | Conferir a coluna "Classificação" com o material da Aula 8, que não está no repositório; as justificativas não mudam | B |

## Pendências que dependem do grupo

| # | Pendência | Responsável |
| --- | --- | --- |
| D1 | Domínio próprio sem DNSSEC, fora da Cloudflare e do Google (Registro, 4.2) | Grupo |
| D2 | Quantidade de redes (proposta: 3) | Grupo |
| ~~D3~~ | **Fechado por B:** 80 nomes por rodada (`DesenhoMetodologico.md`, 6.5) | — |
| ~~D4~~ | **Fechado por B:** rodada a cada 30 min; intervalos menores não aumentam o poder (6.4) | — |
| D5 | Duração: 7 dias é o mínimo, **10 recomendados** (6.4). Falta o grupo marcar as datas | Grupo |
| D6 | Configuração dos protocolos | C, com B |
| D7 | Ambiente de coleta (versões fixadas, TLS 1.3) | C |
| D8 | Estratégia estatística | C e B |
| D9 | Responsáveis pelas etapas 5–9 — **proposta de B** em `DesenhoMetodologico.md`, 2.2; falta A e C aceitarem | Grupo |
| D10 | Conferência das sete categorias com a Aula 8 (só a coluna "Classificação") | B |
| D13 | **Novo:** a cadência da coleta precisa respeitar 1 consulta/s por serviço; a estimativa de A violava a regra do enunciado (`DesenhoMetodologico.md`, 7.2) | C implementa |
| D11 | Verificações de fonte (DoH no Firefox, contagem do APNIC, lista Tranco, estudos no Brasil) | A |
| D12 | Conferir se o Lab05 exige artefato commitado por integrante em cada sprint | Grupo |

## Pronto para entrega?

| Bloco | Situação |
| --- | --- |
| Parte do Participante A (seções 1–5, 6, 7) | **Pronto** |
| Pilotos | **Pronto** |
| Parte do Participante B | **Pronto**: `DesenhoMetodologico.md`, versão 1. Os rascunhos de A para essas seções continuam no documento dele como registro; onde houver divergência, vale o documento de B |
| Seções de C (9.4–9.6, 10) | **Rascunho**: aguarda validação de C e as decisões D6–D8 |
| Documento completo da Sprint 01 | **Falta a parte de C**: validação das seções 9.4–9.6 e 10, e as decisões D1, D6, D7 e D8. D10 não bloqueia a entrega (muda só um rótulo). D1 é a única pendência que altera o estudo, e não só a execução |

A parte de A foi commitada em `main` (commit `9729643`). A parte de B está na
branch `lab05-s01-desenho-metodologico`.
