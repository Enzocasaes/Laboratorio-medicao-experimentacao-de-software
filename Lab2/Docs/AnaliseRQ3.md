# Lab02 — Passo 4: Análise de Resultados (RQ3 — métricas estáticas)

**RQ3 — O uso de assistente de IA altera a complexidade ciclomática ou a
duplicação do código produzido?**

Companheiro de [`AnaliseEstatistica.md`](AnaliseEstatistica.md), que conduz RQ1
e RQ2. As duas análises compartilham o mesmo instrumento e a **mesma família de
Holm** (H1, H2, H3a, H3b) — por isso o `p` ajustado reportado aqui já considera
as quatro hipóteses.

- **Instrumento de medição:** [`Sprint01/src/metricas.js`](../Sprint01/src/metricas.js)
  — definições exatas em [`Ambiente.md`](Ambiente.md#4-instrumento-de-métricas-estáticas).
- **Instrumento de análise:** [`Sprint01/src/analise.js`](../Sprint01/src/analise.js).
- **Entrada:** `Sprint01/data/trials.csv` + `metricas.csv` (18 trials, 9 por tratamento).
- **Saída:** `analise-wilcoxon.csv`, `analise-pares.csv` e `analise-rq3-apoio.csv`.

```bash
cd Lab2/Sprint01
npm run analise:rq3       # H3a, H3b + métricas de apoio
```

---

## 1. Métricas escolhidas e por quê

O enunciado lista métricas candidatas; a escolha do grupo, fixada no
[Desenho](DesenhoDoExperimento.md#escolha-e-justificativa-das-métricas-por-rq)
**antes da coleta**:

| Papel | Métrica | Correspondente no enunciado |
|---|---|---|
| **H3a — primária** | complexidade ciclomática média por função (McCabe) | CK `WMC`/`complexity`, Radon `cc` |
| **H3b — primária** | % de linhas duplicadas (janela de 5 linhas) | PMD CPD, `jscpd` |
| **Controle obrigatório** | LOC | CK, Radon `raw` |
| **Aprofundamento** | Índice de Manutenibilidade (MI) | Radon `mi` |
| Complementares | nº de funções, complexidade máxima | — |

CK exige Java e Radon exige Python; como os katas foram fixados em JavaScript,
o `metricas.js` calcula as mesmas métricas com as definições clássicas — a
justificativa completa está no [`Ambiente.md`](Ambiente.md).

**LOC é obrigatório junto de H3a/H3b.** Código gerado por IA tende a ser mais
verboso, e complexidade ou duplicação sem normalizar por LOC engana: um código
com o dobro de linhas tende a ter mais de tudo. É justamente esse controle que
dá sentido ao achado da seção 3.

**Por que LOC e MI não entram na correção de Holm.** A família foi fixada em 4
hipóteses no desenho. Ampliá-la depois de ver os dados seria *fishing* (ameaça
G4). LOC e MI entram como leitura de apoio, com `r` e `p` reportados apenas para
dimensionar o efeito — nunca para decidir hipótese.

## 2. Resultado das hipóteses

### H3a — complexidade ciclomática média por função

| | mediana | IQR | min–max |
|---|---|---|---|
| **com-ia** (n=9) | **5,00** | 4,29–9,25 | 2,57–12,00 |
| **sem-ia** (n=9) | **3,75** | 2,63–6,25 | 2,43–7,50 |

Pares por kata (`D = com-ia − sem-ia`):

| kata | com-ia | sem-ia | D |
|---|---|---|---|
| kata-01 | 4,04 | 3,00 | **+1,04** |
| kata-02 | 4,25 | 7,50 | −3,25 |
| kata-03 | 8,16 | 3,75 | **+4,41** |
| kata-04 | 8,50 | 2,46 | **+6,04** |
| kata-05 | 7,50 | 4,75 | **+2,75** |
| kata-06 | 5,00 | 3,88 | **+1,13** |

```
n = 6 pares    V = 4,0    Z = 1,363    r = 0,556
mediana das diferenças = +1,94
p bilateral (exato) = 0,2188    p Holm = 0,2188
```

**Decisão: não rejeita H3a₀** (`p Holm = 0,219 > 0,05`).

Seguindo a ameaça G1 do desenho, a leitura correta é **"não foi possível
detectar"**, não "não há efeito" — e há três motivos para não descartar o efeito:

1. **5 dos 6 katas** apontam na mesma direção (IA mais complexa);
2. `r = 0,556` é um **tamanho de efeito grande** pela convenção de Cohen;
3. a direção se repete nos **três integrantes**, independentemente
   (`caue +5,00`, `enzo +1,50`, `leo +1,25`).

O único par contrário é o kata-02 (−3,25).

### H3b — duplicação (% de linhas duplicadas)

Os 18 trials mediram **0,00% de duplicação**, nos dois tratamentos. Todas as
diferenças pareadas são zero, o Wilcoxon descarta pares com `D = 0`, e sobra
`n = 0`:

> **RESULTADO INDISPONÍVEL** — não há como testar H3b₀.

Isso é um **efeito de piso**, não um resultado nulo, e tem explicação no próprio
desenho: as soluções de referência foram especificadas com 40–80 LOC e função
única, e as soluções produzidas ficaram entre 24 e 79 LOC. Um bloco repetido de
5 linhas praticamente não cabe nesse tamanho. A métrica não discrimina neste
contexto — é uma limitação do **objeto experimental**, não do instrumento.

Para a réplica: ou katas maiores (150+ LOC, múltiplos módulos), ou uma janela
menor que 5 linhas, ou detecção por token em vez de linha (como o PMD CPD faz).

## 3. LOC — o controle que muda a leitura

| | mediana | IQR | min–max |
|---|---|---|---|
| com-ia (n=9) | 38,0 | 34,5–47,0 | 24–62 |
| sem-ia (n=9) | 36,0 | 34,5–60,5 | 32–79 |

```
mediana das diferenças = +1,75    r = 0,043    p bilateral = 1,0000
D por kata: +4,0  −0,5  −8,0  +23,0  +5,5  −32,5
```

**O tamanho do código é praticamente idêntico entre os tratamentos** — `r = 0,043`
é efeito nulo, e os pares se distribuem simetricamente em torno de zero.

Esse é o ponto que dá sentido a H3a: **a maior complexidade do código com IA não
vem de verbosidade.** Com LOC equivalente, o código assistido concentra mais
caminhos de decisão nas mesmas linhas. É exatamente a confusão que o enunciado
manda controlar, e aqui o controle está satisfeito.

A métrica complementar reforça a interpretação:

| nº de funções | mediana | D por integrante |
|---|---|---|
| com-ia | 3,0 | `caue −1`, `enzo −2`, `leo −1` |
| sem-ia | 4,0 | (todos negativos) |

```
mediana das diferenças = −1,50    r = 0,601    p bilateral = 0,1875 (referência)
```

Mesmo LOC, **menos funções**, **maior complexidade por função**: o código
assistido por IA foi **menos fatiado**, não mais longo. A complexidade máxima
segue o mesmo sentido (mediana 10 com IA contra 9 sem, `r = 0,472`).

Nenhum desses `p` é significativo com `n = 6`, mas os três sinais são coerentes
entre si e consistentes entre os integrantes — o que, para um piloto, é o tipo
de padrão que justifica investigar com amostra maior.

## 4. Índice de Manutenibilidade (aprofundamento)

| | mediana | IQR | min–max |
|---|---|---|---|
| com-ia (n=9) | 39,87 | 37,47–41,94 | 35,05–46,29 |
| sem-ia (n=9) | 40,21 | 35,33–42,83 | 30,41–43,39 |

```
mediana das diferenças = −1,01    r = 0,043    p bilateral = 1,0000
```

Empate. O MI combina complexidade, LOC e volume de Halstead; como a complexidade
subiu mas o LOC não, os termos se compensam e o índice composto não distingue os
tratamentos. Vale como ilustração de por que o enunciado exige reportar as
métricas **junto**, e não isoladamente: sozinho, o MI sugeriria "nenhuma
diferença estrutural", escondendo o padrão da seção 3.

## 5. Outliers

A detecção por IQR × 1,5 **não acusou nenhum outlier** em nenhuma das métricas
estáticas, em nenhum dos tratamentos. Nada a excluir ou discutir — e, conforme o
desenho (ameaça G5), outliers seriam reportados e discutidos, nunca removidos.

## 6. Ameaças específicas da RQ3

| # | Ameaça | Situação nesta análise |
|---|---|---|
| **C4** | complexidade/duplicação sem contexto | **contida** — LOC reportado junto e equivalente entre tratamentos |
| **G1** | baixo poder (6 pares) | **presente** — `r = 0,556` em H3a sem significância; conclusão é "não detectado" |
| **G2** | múltiplas comparações | **contida** — Holm sobre as 4 hipóteses; apoio fora da família |
| **G4** | flexibilidade analítica | **contida** — métricas e agregação fixadas no desenho antes da coleta |
| **E2** | tarefas pequenas | **limita H3b** — katas de 24–79 LOC não geram duplicação detectável |
| **I7/E3** | variação da ferramenta | os 3 trials `com-ia` de Leonardo usaram **Claude Code**, não o claude.ai fixado; registrado em `trials.csv` |

## 7. Conclusão da RQ3

**Não foi possível detectar alteração estatisticamente significativa** na
complexidade ciclomática (`p Holm = 0,219`) nem testar a duplicação (efeito de
piso: 0% em todos os 18 trials).

O padrão descritivo, porém, é consistente e aponta numa direção só: com LOC
equivalente, o código assistido por IA teve **complexidade média por função
maior** (+1,94, `r = 0,556`, 5 de 6 katas) e **menos funções** (−1,5,
`r = 0,601`, 6 de 6 katas), repetindo-se nos três integrantes. A leitura é de
**código menos decomposto**, não de código mais verboso.

Com `n = 6` pares e `α = 0,05`, o menor `p` bilateral atingível é 0,031 — o
desenho só detectaria um efeito perfeitamente consistente nos seis katas. O
achado fica registrado como **hipótese para réplica**, com katas maiores e mais
participantes.
