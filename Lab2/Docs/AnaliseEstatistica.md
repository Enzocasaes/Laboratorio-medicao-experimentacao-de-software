# Lab02 — Passo 4: Análise de Resultados (RQ1 e RQ2)

Teste de hipóteses das duas primeiras questões de pesquisa, conforme a seção
**(A) Hipóteses** do [Desenho do Experimento](DesenhoDoExperimento.md#a-hipóteses).
A RQ3 (métricas estáticas) é conduzida em [`AnaliseRQ3.md`](AnaliseRQ3.md); o
script desta análise também calcula H3a/H3b, porque a correção de Holm precisa
da família completa das 4 hipóteses.

- **Instrumento:** [`Sprint01/src/analise.js`](../Sprint01/src/analise.js)
  (Node puro, sem dependências), com testes em
  [`Sprint01/test/analise.test.js`](../Sprint01/test/analise.test.js).
- **Entrada:** `Sprint01/data/trials.csv` (+ `metricas.csv` quando existir).
- **Saída:** `Sprint01/data/analise-wilcoxon.csv` (uma linha por hipótese) e
  `Sprint01/data/analise-pares.csv` (os pares que entraram em cada teste).

```bash
cd Lab2/Sprint01
npm run analise           # RQ1 e RQ2
npm run analise:todas     # as 4 hipóteses (inclui RQ3)
```

Código de saída: `0` quando todas as hipóteses pedidas puderam ser testadas,
`2` quando faltam pares, `1` quando não há `trials.csv`.

---

## 1. Hipóteses testadas

| Hip. | RQ | Métrica (pareada por kata) | H₀ | Hₐ | Direção esperada |
|---|---|---|---|---|---|
| **H1** | RQ1 | `duracao_segundos` (time-to-green; censura em 2100 s) | `μ̃(D) = 0` | `μ̃(D) ≠ 0` | `< 0` (IA mais rápida) |
| **H2** | RQ2 | `taxa_sucesso` (testes passando / total) | `μ̃(D) = 0` | `μ̃(D) ≠ 0` | `> 0` (IA com mais testes passando) |

Onde `D_k = x_k^{IA} − x_k^{manual}`, com `x` = mediana da métrica dentro da
célula (kata × tratamento).

## 2. Procedimento estatístico

1. **Pareamento por kata.** Para cada kata, a mediana dos trials `com-ia` é
   comparada à mediana dos trials `sem-ia`. Katas que não têm os **dois**
   tratamentos não formam par e são listados no relatório — com os 3
   integrantes, todos os 6 katas têm ambos (matriz de tratamento do desenho).
2. **Wilcoxon signed-rank pareado**, bilateral, `α = 0,05`. Pares com `D = 0`
   são descartados e reduzem `n`; empates de magnitude recebem posto médio.
3. **p exato por enumeração** dos `2ⁿ` sinais possíveis (n ≤ 20), em vez da
   aproximação normal. Com `n` pequeno a aproximação normal é ruim, e a
   enumeração também trata os empates corretamente (teste de permutação com os
   postos fixos). O `p` da aproximação normal é reportado junto, para conferência.
4. **Correção de Holm–Bonferroni** sobre as 4 hipóteses da família (H1, H2, H3a,
   H3b). **A conclusão principal usa o `p` ajustado**, como fixado no desenho.
5. **Tamanho de efeito** `r = |Z| / √n` e a **mediana das diferenças** (com IQR),
   sempre reportados junto do `p` — com N pequeno, um `p` alto não significa
   ausência de efeito, apenas falta de poder.
6. **Descritiva e outliers:** mediana + IQR por tratamento e detecção por
   IQR × 1,5. Outliers são **listados e discutidos, nunca removidos**.
7. **Censura (RQ1):** trials que atingem o time-box entram com 2100 s. Nenhum
   dos 18 trials foi censurado.

### Poder do teste: o que 6 pares permitem concluir

Com `n = 6` pares, o menor `p` bilateral que o Wilcoxon consegue produzir é
`2/2⁶ ≈ 0,031`. Ou seja: **só é possível rejeitar H₀ se o efeito for na mesma
direção nos 6 katas**. Depois da correção de Holm, mesmo esse melhor caso vira
`0,031 × (nº de hipóteses testáveis)`, que passa de 0,05 assim que duas ou mais
hipóteses forem testáveis. O relatório do script avisa explicitamente quando o
`n` disponível torna a rejeição impossível.

**Consequência prática:** o desenho tem poder para detectar apenas efeitos muito
consistentes. Um "não rejeita H₀" aqui significa *"não houve evidência
suficiente"*, e não *"não há diferença"* — a distinção precisa aparecer no
Relatório Final.

---

## 3. Dados analisados

> Atualizado em 2026-09-23, com a coleta completa. Refazer esta seção rodando
> `npm run analise:todas` se algum trial for recoletado.

| Integrante | Trials | Situação |
|---|---|---|
| P1 — Enzo | 6 de 6 | concluídos (PR #58/#60) |
| P2 — Cauê | 6 de 6 | concluídos (PR #53) |
| P3 — Leonardo | 6 de 6 | concluídos (PR #60) |

**18 trials (9 `com-ia`, 9 `sem-ia`), nenhum censurado, todos com 12/12 testes
passando.** Os 6 katas têm observações nos dois tratamentos, então **os 6 pares
se fecham** e o Wilcoxon roda para H1 e H3a.

### Descritiva por tratamento

| Métrica | com-ia (n=9) | sem-ia (n=9) |
|---|---|---|
| time-to-green | mediana **89 s** (IQR 18–176,5; mín. 16, máx. 355) | mediana **866 s** (IQR 596–1265,5; mín. 497, máx. 1408) |
| taxa de sucesso | 1,00 (sem variação) | 1,00 (sem variação) |

### Pares por kata — H1 (tempo, em segundos)

| kata | com-ia | sem-ia | D |
|---|---|---|---|
| kata-01 | 100,0 | 882,0 | −782,0 |
| kata-02 | 16,0 | 989,5 | −973,5 |
| kata-03 | 186,5 | 1385,0 | −1198,5 |
| kata-04 | 70,0 | 682,5 | −612,5 |
| kata-05 | 113,5 | 497,0 | −383,5 |
| kata-06 | 171,0 | 1006,0 | −835,0 |

**Os 6 pares apontam na mesma direção** (mais rápido com IA), o que produz o
menor `V` possível (0) e, portanto, o menor `p` que 6 pares permitem.

### Qualidade dos dados

- **Sem censura:** nenhum trial atingiu o time-box de 35 min, então a ressalva
  de construto da RQ1 (tempo menor por desistência, e não por velocidade) **não
  se aplica** a esta coleta.
- **RQ2 sem variância (efeito de teto):** os 18 trials terminaram 12/12. Todas
  as diferenças de `taxa_sucesso` são zero, os 6 pares são descartados pela
  regra `D = 0` e **H2 não pode ser testada**. A RQ2 é respondida de forma
  descritiva; a limitação entra como ameaça à validade de conclusão.
- **Trials muito rápidos com IA:** três trials `com-ia` de P1 ficaram entre 16 s
  e 18 s. Não são outliers pelo critério IQR × 1,5 dentro do tratamento (a
  dispersão do grupo `com-ia` é grande), mas a ordem de grandeza sugere uso do
  assistente para gerar a solução quase inteira. Não foram removidos — o critério
  do desenho é reportar, não descartar —, e devem ser lidos junto do
  `num_prompts_ia` (1 prompt em cada um).
- **`num_prompts_ia` vazio nos trials `sem-ia` de P1 e P3:** o campo ficou em
  branco em vez de `0`. Não afeta nenhuma hipótese (a métrica é exploratória e o
  tratamento `sem-ia` tem 0 prompts por definição), mas convém uniformizar em
  uma réplica.

---

## 4. Resultados

Números gerados por `npm run analise:todas` (`data/analise-wilcoxon.csv`):

| Hip. | n pares | mediana das diferenças | V | Z | r | p bilateral (exato) | p unilateral | p Holm | Decisão |
|---|---|---|---|---|---|---|---|---|---|
| **H1 (RQ1)** | 6 | **−808,5 s** (≈ −13,5 min) | 0 | −2,201 | **0,899** | **0,031** | 0,016 | **0,063** | **não rejeita H1₀** |
| **H2 (RQ2)** | 0 de 6 (todas com `D = 0`) | 0 | — | — | — | — | — | — | **não testável** |

Para contexto (conduzidas na [análise da RQ3](AnaliseRQ3.md), entram aqui só
porque compartilham a correção de Holm): H3a com `p = 0,219` (`p` Holm 0,219,
r = 0,556) e H3b não testável (duplicação 0% nos dois tratamentos).

**Sobre o denominador do Holm.** A família foi fixada no desenho em 4 hipóteses,
mas duas delas (H2 e H3b) não produzem `p`, porque o desfecho não variou. O
ajuste é aplicado sobre as **2 hipóteses efetivamente testadas** (H1 e H3a):
`p` Holm de H1 = 2 × 0,031 = 0,063. Usar o denominador cheio (4) daria 0,125 —
mais conservador, **e a conclusão não muda em nenhum dos dois casos**.

### RQ1 — O uso de assistente de IA reduz o tempo de resolução?

**Resposta: há um efeito grande e perfeitamente consistente, mas ele não é
estatisticamente significativo depois do controle de múltiplas comparações.**

- Nos 6 katas, o tratamento `com-ia` foi mais rápido, **sem exceção**. A mediana
  das diferenças é de −808,5 s, cerca de **13,5 minutos** por kata; nas medianas
  agregadas, 89 s contra 866 s (≈ 10× mais rápido).
- O tamanho de efeito é muito grande (`r = 0,899`).
- O `p` exato bilateral é **0,031**, abaixo de α = 0,05. Mas esse é exatamente o
  **menor valor que 6 pares conseguem produzir**: ainda que o efeito fosse ainda
  maior, o `p` não cairia. Depois do Holm, sobe para **0,063** e não cruza o
  limiar, e a regra fixada no desenho manda concluir pelo `p` ajustado.
- **Não se rejeita H1₀.** A leitura honesta é de *falta de poder*, não de
  ausência de efeito: o desenho com 6 pares não consegue sustentar
  estatisticamente nem um efeito que apareceu em 100% dos katas.
- A ressalva de construto prevista no desenho (tempo menor porque o participante
  desistiu dentro do time-box) **está afastada**: não houve censura e todos os
  trials terminaram com 12/12 testes.

### RQ2 — O uso de assistente de IA reduz a quantidade de defeitos?

**Resposta: não houve diferença observável; a métrica não discriminou os
tratamentos, e a hipótese não pôde ser testada.**

- Todos os 18 trials terminaram com **100% dos testes de aceitação passando**,
  nos dois tratamentos.
- Com todas as diferenças iguais a zero, o Wilcoxon fica sem pares e **H2 não é
  testável** — não há como rejeitar nem deixar de rejeitar com base em dados sem
  variância.
- A causa mais provável é **efeito de teto**: katas de dificuldade moderada, com
  12 testes visíveis e tempo suficiente (nenhum trial chegou aos 35 min). O
  desfecho sai saturado.
- Para uma réplica: tarefas mais difíceis ou time-box menor, para que a taxa de
  sucesso volte a variar.

---

## 5. Validação do instrumento

O `analise.js` não usa biblioteca estatística, então a implementação é conferida
por testes automatizados (`node --test test/analise.test.js`, 34 testes):

- **Caso de referência externo:** o exemplo clássico de `wilcox.test(paired =
  TRUE)` do R (dados de depressão, n = 9) reproduz exatamente `V = 40` e
  `p = 0,03906`.
- **Piso do teste:** 6 pares na mesma direção → `p = 0,03125`; 5 pares →
  `p = 0,0625` (nunca rejeita), como previsto no desenho.
- **Regras do desenho:** descarte de pares com `D = 0`, postos médios em
  empates, `r = |Z|/√n`, Holm com monotonicidade, fallback para aproximação
  normal acima do limite de enumeração.
- **Pareamento:** mediana por célula, katas incompletos fora do teste, campos
  vazios ou não numéricos ignorados.

## 6. Como refazer a análise

```bash
cd Lab2/Sprint01
git pull                  # traz os trials dos colegas
npm run analise:todas     # relatorio + data/analise-wilcoxon.csv + data/analise-pares.csv
```

Depois: atualizar as seções 3 e 4 deste documento com os números gerados e
versionar os CSVs com `git add -f data/analise-wilcoxon.csv data/analise-pares.csv`
(a pasta `data/` é ignorada pelo git).
