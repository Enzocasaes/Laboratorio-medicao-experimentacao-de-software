# Q1 — 10.000 conjuntos simulados sob H0

**Lab04 — Sprint 2, Issue #107**

> Arquivo **gerado** por `python src/erro_tipo_i.py`. Não edite à mão:
> rode o comando de novo. Os números vêm de `data/resultados_q1.csv`. A comparação
> entre os dois testes (Wilson, McNemar, conclusão) está em
> [`comparacao_taxas_erro.md`](comparacao_taxas_erro.md) (Issue #108).

## 1. Objetivo

Medir com que frequência o teste t pareado e o Wilcoxon pareado (unilaterais,
`alternative='greater'`, α = 0,05) rejeitam a hipótese nula quando ela é
verdadeira. Toda rejeição de uma H0 verdadeira é um **erro tipo I**, e um teste bem
calibrado deveria cometê-lo em cerca de 5% das vezes:

    taxa de erro tipo I = rejeições / 10000

O ponto delicado é a expressão "H0 verdadeira". Os dois testes não têm a mesma H0,
e uma distribuição pode satisfazer a de um sem satisfazer a do outro. A seção 3
trata disso antes de qualquer número.

## 2. Parâmetros

| Item | Valor |
|---|---|
| Repetições por cenário | 10000 |
| Pares por conjunto (n) | 30 |
| α | 0,05 (unilateral, `greater`) |
| Semente | `numpy.random.default_rng(42)` no centralizado; `default_rng(43)` no simetrizado |
| Dados de origem | `data/dados_reais.csv` (30 pares reais) |
| Diferença | d = tempo_sem_cache − tempo_com_cache (positiva = o cache reduziu o tempo) |
| Implementação dos testes | `teste_t_pareado` e `wilcoxon_pareado` de `src/testes.py` (Sprint 1) |
| Ambiente | Python 3.14.0, NumPy 2.5.3, pandas 3.0.6, SciPy 1.18.1 |

## 3. As hipóteses nulas dos dois testes

Com d = sem cache − com cache e a alternativa `greater` (seção 4.1 de
`docs/cenario_experimental.md`):

| Teste | H0 | H1 | Parâmetro de que o teste depende |
|---|---|---|---|
| t pareado | μ_d ≤ 0 | μ_d > 0 | a **média** das diferenças |
| Wilcoxon pareado | distribuição de d simétrica em torno de 0 (ou deslocada para valores negativos) | deslocamento para valores positivos | P(X₁ + X₂ > 0), ou seja, a **pseudomediana** |

A estatística W⁺ é igual ao número de médias de Walsh (Xᵢ + Xⱼ)/2, i ≤ j, que são
positivas. Por isso:

    E[W⁺] = n·P(X > 0) + C(n,2)·P(X₁ + X₂ > 0)

Sob simetria em torno de 0, P(X₁ + X₂ > 0) = 1/2 e E[W⁺] = n(n+1)/4. Uma
distribuição com P(X₁ + X₂ > 0) > 1/2 tem pseudomediana positiva, e o Wilcoxon
tende a rejeitar, **mesmo que a média seja 0**. Média zero não implica simetria:
numa distribuição assimétrica à esquerda, um valor muito negativo compensa vários
valores pequenos positivos. A média fica em 0, mas a maioria dos valores, e das
médias de Walsh, fica acima de 0.

Consequência: só é erro tipo I a rejeição de um teste cuja **própria** H0 é
verdadeira na distribuição simulada. O script verifica isso na distribuição geradora
de cada cenário (`hipoteses_nulas` em `src/erro_tipo_i.py`) e grava o resultado na
coluna `h0_do_teste_verdadeira` de `data/resultados_q1.csv`.

## 4. Como os dados foram gerados

Os dados reais **não** servem diretamente: neles a diferença média é de 27,24 s, e as
30 diferenças são positivas. Simular a partir deles mediria poder, não erro tipo I.
Sortear de uma normal com média 0 também não basta, porque descartaria o que os
dados reais têm de particular: um desvio pequeno, forte assimetria à esquerda e três
valores extremos (pares 14, 21 e 10). Os dois cenários partem dos **resíduos**
eᵢ = dᵢ − d̄ das 30 diferenças reais (desvio de 0,3934 s). A média deles é 0 a
menos de arredondamento (3.6e-16 s).

### 4.1 Cenário simetrizado — referência do erro tipo I

Em cada repetição, sortear 30 resíduos com reposição e multiplicar cada um por
um sinal S = ±1 sorteado com probabilidade 1/2, de forma independente do resíduo e
das outras posições. Cada valor é X = S·E, e como S é independente de E e simétrico,
X e −X têm a mesma distribuição. A geradora é a distribuição uniforme sobre os 60
valores ±eᵢ: **simétrica em torno de 0 por construção**, com a mesma escala e as
mesmas caudas dos dados reais. As duas H0 valem ao mesmo tempo.

O que os dados sorteados mostram:

| Verificação | Esperado | Observado nos 10.000 × 30 valores |
|---|---:|---:|
| Proporção de valores positivos | 50% | 50,10% |
| Proporção de positivos entre os 50% maiores \|x\| | 50% | 50,03% |
| Proporção de positivos entre os 50% menores \|x\| | 50% | 50,15% |
| P(X₁ + X₂ > 0) na geradora | = P(X₁ + X₂ < 0) | 49,17% = 49,17% |

O sinal não depende da magnitude, e a proporção de positivos fica dentro do ruído
de amostragem. Os dois testes recebem a mesma linha da matriz de dados.

### 4.2 Cenário centralizado — sensibilidade à assimetria

Em cada repetição, sortear 30 resíduos com reposição, **sem** trocar o sinal. É o
*bootstrap sob a hipótese nula* da média: preserva a forma dos dados reais.

| Estatística da geradora (os 30 resíduos) | Valor |
|---|---:|
| Média | 0,000000 s |
| Mediana | 0,0895 s |
| Pseudomediana (mediana de (X₁ + X₂)/2) | 0,0488 s |
| Desvio-padrão | 0,3934 s |
| Assimetria (G1 ajustado) | −2,17 |
| Excesso de curtose (G2) | 8,70 |
| Mínimo / máximo | −1,572 s / 0,813 s |
| P(X > 0) | 60,0% |
| P(X₁ + X₂ > 0) | 61,1% (contra 38,9% de P(X₁ + X₂ < 0)) |
| E[W⁺] com n = 30 | 283,8 (sob a H0 do Wilcoxon: 232,5) |

A média é 0, mas a distribuição está longe de ser simétrica. Um único resíduo
muito negativo (−1,572 s, o par 14) puxa a média para baixo, e
60% dos resíduos ficam acima de 0. Nos dados sorteados, 60,0% dos valores são positivos.

### 4.3 Qual H0 vale em cada cenário

| Cenário | Papel | H0 do t (μ ≤ 0) | H0 do Wilcoxon (simetria em 0) |
|---|---|:---:|:---:|
| `bootstrap_simetrizado` | referência do erro tipo I (as duas H0 valem) | sim | sim |
| `bootstrap_centralizado` | sensibilidade à assimetria (só a H0 do t vale) | sim | **não** |

No centralizado, a taxa do Wilcoxon **não é uma taxa de erro tipo I**. A H0 dele é
falsa (a pseudomediana é positiva), e as rejeições são decisões corretas do ponto de
vista do próprio teste. O cenário continua útil como **análise de sensibilidade**:
mostra o quanto o t perde o controle do erro tipo I com a assimetria dos dados reais,
e o que acontece quando se usa o Wilcoxon para uma pergunta que é sobre a média.

## 5. Como os testes foram aplicados

- **Mesmos dados**: os 10.000 × 30 valores são sorteados numa matriz antes de
  qualquer teste, e a linha r vai, como o mesmo objeto, para os dois testes. A
  conferência contra o SciPy recalcula os dois p-valores a partir dessa mesma matriz.
- **Teste t**: `teste_t_pareado(d)`, unilateral, com gl = n − 1.
- **Wilcoxon**: `wilcoxon_pareado(d)`. Zeros (|d| ≤ 0,5 ms) são descartados
  (`zero_method='wilcox'`), e os empates recebem o posto médio. Sem zeros nem
  empates, o p é exato; com eles, usa-se a aproximação normal com correção de
  empates e de continuidade.
- **Empates**: reamostrar com reposição quase sempre repete algum resíduo, e no
  simetrizado eᵢ e −eᵢ têm o mesmo |d|. Por isso o Wilcoxon usou a aproximação
  normal em 10000 das 10000 repetições do centralizado e em 10000 do simetrizado.
  **Zeros** não ocorrem: o menor |eᵢ| é 0,0220 s, bem acima da
  tolerância de 0,5 ms.
- **Casos degenerados**: nenhuma repetição é descartada. Um conjunto com desvio 0
  (as 30 retiradas iguais) ou sem nenhuma diferença não nula seria mantido com o
  tratamento de `src/testes.py` (t: p = 0 se a média for positiva, senão p = 1;
  Wilcoxon: p = 1) e contado na coluna `degenerados`. Nenhum ocorreu. P-valores
  NaN ou fora de [0, 1] interrompem a execução com erro.

## 6. Resultados

### 6.1 `bootstrap_simetrizado` — referência do erro tipo I

| Teste | H0 do teste vale? | Rejeições | Não rejeições | Taxa de rejeição | IC 95% (Wilson) | O que a taxa mede | Classificação |
|---|:---:|---:|---:|---:|---|---|---|
| t pareado | sim | 502 | 9498 | **5,02%** | [4,61%; 5,47%] | erro tipo I | compatível com α |
| Wilcoxon pareado | sim | 518 | 9482 | **5,18%** | [4,76%; 5,63%] | erro tipo I | compatível com α |

### 6.2 `bootstrap_centralizado` — sensibilidade à assimetria

| Teste | H0 do teste vale? | Rejeições | Não rejeições | Taxa de rejeição | IC 95% (Wilson) | O que a taxa mede | Classificação |
|---|:---:|---:|---:|---:|---|---|---|
| t pareado | sim | 1139 | 8861 | **11,39%** | [10,78%; 12,03%] | erro tipo I | liberal |
| Wilcoxon pareado | **não** | 2794 | 7206 | **27,94%** | [27,07%; 28,83%] | rejeição com a H0 do teste falsa (não é erro tipo I) | não se aplica (H0 do teste falsa) |

### 6.3 Distribuição dos p-valores

| Cenário | Teste | p médio | p mediano | Desvio-padrão do p | Degenerados | Observação |
|---|---|---:|---:|---:|---:|---|
| `bootstrap_simetrizado` | t pareado | 0,4987 | 0,5006 | 0,2962 | 0 | degenerados = conjuntos com desvio 0 (t indefinido) |
| `bootstrap_simetrizado` | Wilcoxon pareado | 0,5017 | 0,5082 | 0,2908 | 0 | p-valor: normal = 10000; zeros descartados no total: 0 |
| `bootstrap_centralizado` | t pareado | 0,4581 | 0,4690 | 0,2944 | 0 | degenerados = conjuntos com desvio 0 (t indefinido) |
| `bootstrap_centralizado` | Wilcoxon pareado | 0,2262 | 0,1470 | 0,2295 | 0 | p-valor: normal = 10000; zeros descartados no total: 0 |

Sob uma H0 verdadeira e com o teste bem calibrado, o p-valor tem distribuição
aproximadamente uniforme em [0, 1]: média e mediana 0,5, desvio 1/√12 ≈ 0,2887.

### 6.4 Comparação com 5%

Com R = 10000 e uma taxa verdadeira de 5%, a taxa estimada varia
±0,43 ponto percentual (95%) só pelo acaso da simulação, ou seja,
de 4,57% a 5,43%. A classificação usa o IC de Wilson
de cada taxa, e só se aplica quando a H0 do teste é verdadeira:

- **compatível com α**: 5% está dentro do IC;
- **liberal**: o IC inteiro está acima de 5%, ou seja, o teste rejeita H0 verdadeira
  mais do que promete;
- **conservador**: o IC inteiro está abaixo de 5%.

| Cenário | Teste | Taxa | Diferença para 5% | Classificação |
|---|---|---:|---:|---|
| `bootstrap_simetrizado` | t pareado | 5,02% | +0,02 p.p. | compatível com α |
| `bootstrap_simetrizado` | Wilcoxon pareado | 5,18% | +0,18 p.p. | compatível com α |
| `bootstrap_centralizado` | t pareado | 11,39% | +6,39 p.p. | liberal |
| `bootstrap_centralizado` | Wilcoxon pareado | 27,94% | — (não é erro tipo I) | não se aplica (H0 do teste falsa) |

## 7. Interpretação

**Simetrizado: os dois testes ficam no nível nominal.** Com as duas H0
verdadeiras, o t rejeitou em 5,02% e o Wilcoxon em 5,18%. Os dois ICs de Wilson
contêm 5%. Isso é o esperado de implementações corretas nessas condições e, junto
com a conferência contra o SciPy (seção 8), dá confiança nos p-valores. Não prova
que os testes controlem o erro tipo I em qualquer distribuição.

**Centralizado, teste t: 11,39% (liberal).**
A H0 do t (média 0) é verdadeira aqui, então essa é uma taxa de erro tipo I, e ela
chega a 2,3 vezes o nominal. Com n = 30 e uma população de assimetria
−2,06, a estatística t não segue a t de Student. Nas amostras
que não sorteiam o resíduo extremo negativo, a média sai levemente positiva e o
desvio sai pequeno, e o t resultante é grande. Nas que sorteiam, a média cai, mas o
desvio infla junto, e o t fica contido. Com assimetria negativa, a cauda
**superior** de T engorda, e é exatamente essa a cauda que o teste `greater` usa. A
expansão de Edgeworth de 1ª ordem prevê ≈ 9,1%, na mesma direção do
valor simulado. O que sobra vem de termos de ordem 1/n, que pesam com um excesso
de curtose de 8,7.

**Centralizado, Wilcoxon: 27,94% — não é erro tipo I.** A H0 do Wilcoxon
é falsa nessa distribuição: P(X₁ + X₂ > 0) = 61,1% e a pseudomediana é
0,049 s. O teste está detectando, corretamente, que as diferenças estão
deslocadas para a direita no sentido dos postos. A taxa funciona como o **poder**
do Wilcoxon contra um deslocamento de pseudomediana de 0,049 s (≈ 0,12 desvio).

O que o cenário mostra para o experimento é outra coisa: se a pergunta é sobre o
tempo **médio** de build, um p < 0,05 do Wilcoxon não basta para concluir que a
média caiu. Aqui a média não muda, e ainda assim ele rejeita em 27,9% dos
conjuntos. Com diferenças assimétricas, os dois testes respondem a perguntas
diferentes, e a escolha entre eles depende de qual parâmetro interessa.

**Para os dados reais**, nada disso ameaça a conclusão. Os dois testes rejeitam H0
com p-valores minúsculos (t ≈ 2·10⁻⁵⁵; W⁺ no máximo possível), e o efeito
observado (27 s, com desvio de 0,4 s) está muito além de qualquer região de
decisão. A inflação do erro tipo I pesaria num estudo com efeito pequeno e
diferenças igualmente assimétricas.

## 8. Validação

| Verificação | `bootstrap_simetrizado` | `bootstrap_centralizado` |
|---|---|---|
| Repetições válidas × valores por conjunto | 10000 × 30 | 10000 × 30 |
| P-valores NaN ou fora de [0, 1] | 0 | 0 |
| Conjuntos degenerados (t / Wilcoxon) | 0 / 0 | 0 / 0 |
| Maior diferença de p para o SciPy (t) | 1.5e-12 | 7.5e-13 |
| Maior diferença de p para o SciPy (Wilcoxon) | 2.2e-16 | 2.2e-16 |
| Decisões diferentes das do SciPy (t / Wilcoxon) | 0 / 0 | 0 / 0 |
| Impressão digital (SHA-256 de dados + p-valores) | `17e6cb2a2dea4832…` | `982c2d90ddf32b71…` |

A conferência usa `scipy.stats.ttest_1samp(d, 0, alternative='greater')` e
`scipy.stats.wilcoxon(d, alternative='greater', zero_method='wilcox',
correction=True, method='approx')` (ou `method='exact'` nas repetições em que o
projeto usou o p exato), calculados sobre a mesma matriz de dados. Como os dois
p-valores de cada linha batem com os do SciPy calculados a partir da mesma linha,
os dois testes do projeto receberam exatamente os mesmos dados. Rodar de novo com a
mesma semente tem de reproduzir a mesma impressão digital.

## 9. Limitações

- **Uma única fonte para a forma da distribuição.** Os dois cenários reamostram 30
  resíduos de um único projeto, numa única máquina. Valores que não apareceram na
  coleta nunca são sorteados, e cada valor observado, inclusive os extremos, tem
  peso exato de 1/30. Em 36% dos conjuntos o resíduo mais negativo
  (par 14) nem é sorteado, e a forma da cauda depende de 1 a 3 observações.
- **O simetrizado não é a distribuição real.** Ele mantém a escala e as caudas, mas
  remove justamente a assimetria que caracteriza os dados. É uma referência para
  medir o erro tipo I quando as duas H0 valem, não um retrato do experimento.
- **Não existe um cenário com a forma real em que as duas H0 valham.** A H0 do
  Wilcoxon exige simetria, e a forma real é assimétrica. Centralizar pela
  pseudomediana em vez da média faria P(X₁ + X₂ > 0) ≈ 1/2, mas não tornaria a
  distribuição simétrica (a distribuição nula de W⁺ continuaria não valendo) e
  tornaria falsa a H0 do t. Por isso o erro tipo I do Wilcoxon só é medido no
  simetrizado.
- **Só a forma das diferenças é preservada**, e não a estrutura temporal da coleta
  (ordem AB/BA, aquecimento da JVM, deriva térmica). Os conjuntos simulados são
  i.i.d.; os dados reais podem não ser.
- **Empates artificiais.** A reamostragem repete valores, e isso leva o Wilcoxon
  para a aproximação normal com correção de empates em todas as repetições, mesmo
  que os tempos reais sejam contínuos. O comportamento do p exato não é avaliado.
- **n fixo em 30.** A taxa de erro do t numa população assimétrica converge para α
  à medida que n cresce (o termo de Edgeworth cai com 1/√n). Os números valem para
  o n do experimento.
- **Erro de Monte Carlo.** Cada taxa perto de 5% tem incerteza de ±0,43 p.p. (IC de
  95%). Diferenças menores que isso não devem ser interpretadas.

## 10. Arquivos

| Arquivo | Conteúdo |
|---|---|
| `src/erro_tipo_i.py` | a simulação |
| `data/resultados_q1.csv` | uma linha por cenário × teste: contagens, taxa, IC de Wilson, se a H0 do teste vale e o que a taxa mede |
| `data/pvalores_q1.csv` | os 10.000 pares de p-valores do `bootstrap_centralizado` |
| `data/pvalores_q1_controle.csv` | os 10.000 pares de p-valores do `bootstrap_simetrizado` |

Os nomes dos dois arquivos de p-valores foram mantidos por compatibilidade com a
Issue #107: `pvalores_q1.csv` é o centralizado, e `pvalores_q1_controle.csv`, o
simetrizado.

## Como refazer

```bash
cd Lab4
pip install -r requirements-q1.txt
python src/erro_tipo_i.py --repeticoes 10000 --n 30 --alfa 0.05 --semente 42
python src/comparacao_erro.py   # a comparação da Issue #108
```

A execução leva da ordem de 10 s. Com a mesma semente, os CSVs e este relatório
saem idênticos, inclusive as impressões digitais acima.
