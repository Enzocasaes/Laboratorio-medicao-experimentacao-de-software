# Lab02 — Passo 4: Análise de Resultados (RQ1 e RQ2)

Teste de hipóteses das duas primeiras questões de pesquisa, conforme a seção
**(A) Hipóteses** do [Desenho do Experimento](DesenhoDoExperimento.md#a-hipóteses).
A RQ3 (métricas estáticas) é conduzida em documento próprio; o script desta
análise também calcula H3a/H3b, porque a correção de Holm precisa da família
completa das 4 hipóteses.

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
   trial foi censurado até agora.

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

## 3. Estado atual dos dados

> Atualizado em 2026-09-22. Refazer esta seção rodando `npm run analise` depois
> que os trials faltantes forem mesclados na `main`.

| Integrante | Trials executados | Situação |
|---|---|---|
| P1 — Enzo | 0 de 6 | katas preparados (PR #52), execução pendente |
| P2 — Cauê | **6 de 6** | concluídos e versionados (PR #53) |
| P3 — Leonardo | 0 de 6 | katas preparados (PR #54), execução pendente |

**Pares formados hoje: 0 de 6.** Na matriz de tratamento, cada integrante
resolve cada kata em **um único** tratamento; o par de um kata só se fecha
quando pelo menos um colega resolve aquele mesmo kata no tratamento oposto.
Com apenas os 6 trials do Cauê, cada kata tem um lado só:

| kata | com-ia | sem-ia |
|---|---|---|
| kata-01 | — | Cauê |
| kata-02 | — | Cauê |
| kata-03 | Cauê | — |
| kata-04 | Cauê | — |
| kata-05 | Cauê | — |
| kata-06 | — | Cauê |

Por isso **o Wilcoxon ainda não pode ser executado**, e o script reporta
`RESULTADO INDISPONIVEL: nenhum par formado` para as 4 hipóteses. Não se trata
de limitação do instrumento: ele foi validado contra resultados conhecidos (ver
seção 5).

### Descritiva parcial (apenas P2 — não é resultado do experimento)

Com um único integrante não há controle de variação individual, e os números
abaixo **não respondem** RQ1 nem RQ2. Servem só de acompanhamento.

| Métrica | com-ia (n=3) | sem-ia (n=3) |
|---|---|---|
| time-to-green | mediana 89 s (IQR 70–355) | mediana 1146 s (IQR 882–1408) |
| taxa de sucesso | 1,00 | 1,00 |

Observações já visíveis, a discutir no Relatório Final:

- **Efeito de teto na RQ2:** os 6 trials terminaram com 12/12 testes passando.
  Se isso se mantiver com os 18 trials, todas as diferenças de `taxa_sucesso`
  serão zero, o Wilcoxon de H2 ficará sem pares e **H2 não poderá ser testada** —
  o desfecho fica sem variância. Nesse caso, a RQ2 deve ser respondida de forma
  descritiva ("nenhum defeito residual em nenhum tratamento") e a limitação
  registrada como ameaça de conclusão. Vale avisar o grupo antes da S03 fechar.
- **Trials rápidos com IA:** dois trials `com-ia` do P2 (70 s e 89 s) ficaram
  bem abaixo dos demais. Entram na análise normalmente, mas devem ser sinalizados
  como possíveis outliers na discussão.

---

## 4. Resultados (a preencher quando houver 18 trials)

Tabela gerada por `data/analise-wilcoxon.csv`:

| Hip. | n pares | mediana das diferenças | V | Z | r | p bilateral (exato) | p Holm | Decisão |
|---|---|---|---|---|---|---|---|---|
| H1 (RQ1) | — | — | — | — | — | — | — | — |
| H2 (RQ2) | — | — | — | — | — | — | — | — |

**Leitura a fazer depois:**

- **RQ1:** o sinal da mediana das diferenças indica se a IA acelerou (negativo)
  ou atrasou (positivo). Interpretar **junto da RQ2**: um tempo menor com IA
  pode refletir desistências dentro do time-box, não velocidade.
- **RQ2:** a taxa de sucesso responde se a IA reduziu defeitos. Com efeito de
  teto (tudo 12/12), a resposta é descritiva, não inferencial.

---

## 5. Validação do instrumento

O `analise.js` não usa biblioteca estatística, então a implementação é conferida
por testes automatizados (`node --test test/analise.test.js`, 28 testes):

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
