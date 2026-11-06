# Q1 — Taxa de erro tipo I sob H0 (10.000 simulações)

**Lab04 — Sprint 2, Issue #107**

> Arquivo **gerado** por `python src/erro_tipo_i.py`. Não edite à mão:
> rode o comando de novo. Os números vêm de `data/resultados_q1.csv`.

## Pergunta

Com H0 verdadeira, com que frequência o teste t pareado e o Wilcoxon pareado
(unilaterais, `alternative='greater'`) rejeitam H0 a α = 0,05?
Toda rejeição aqui é um **erro tipo I**, e um teste bem calibrado deveria errar
em cerca de 5% das vezes:

    taxa de erro tipo I = rejeições / 10000

## Parâmetros

| Item | Valor |
|---|---|
| Repetições por cenário | 10000 |
| Pares por conjunto (n) | 30 |
| α | 0,05 (unilateral, `greater`) |
| Semente | `numpy.random.default_rng(42)` no cenário principal; `default_rng(43)` no controle |
| Dados de origem | `data/dados_reais.csv` (30 pares reais) |
| Diferença | d = tempo_sem_cache − tempo_com_cache |
| Implementação dos testes | `teste_t_pareado` e `wilcoxon_pareado` de `src/testes.py` (Sprint 1) |
| Ambiente | Python 3.14.0, NumPy 2.5.3, pandas 3.0.6, SciPy 1.18.1 |

## Como H0 foi representada

Os dados reais **não** representam H0: neles a diferença média é de 27,24 s,
e as 30 diferenças são positivas. Simular a partir deles mediria o poder do
teste, e não o erro tipo I. Também não basta sortear números de uma normal com
média 0, porque isso descartaria justamente o que os dados reais têm de
particular: um desvio pequeno, uma forte assimetria à esquerda e três valores
extremos (pares 14, 21 e 10).

A distribuição nula usada é a **empírica centralizada** (bootstrap sob H0):

1. calcular as 30 diferenças reais dᵢ;
2. subtrair a média amostral: eᵢ = dᵢ − d̄. A média de e é exatamente 0, e o desvio (0,3934 s), a assimetria e os extremos continuam os dos dados;
3. em cada repetição, sortear 30 valores de {e₁, …, e₃₀} **com reposição**;
4. aplicar os dois testes ao **mesmo** conjunto de 30 valores.

Como os resíduos já são diferenças pareadas, os testes comparam essas
diferenças com 0. É exatamente o que `teste_t_pareado` e `wilcoxon_pareado` fazem
(eles recebem o vetor d), e é equivalente a `ttest_rel(sem, com)` /
`wilcoxon(sem, com)` com `com` = sem − d.

### A distribuição geradora

| Estatística dos resíduos eᵢ | Valor |
|---|---:|
| Média | 0,000000 s |
| Desvio-padrão | 0,3934 s |
| Mediana | 0,0895 s |
| Assimetria (G1 ajustado) | -2,17 |
| Excesso de curtose (G2) | 8,70 |
| Mínimo / máximo | -1,572 s / 0,813 s |
| Proporção de resíduos positivos | 60,0% |

A **média** é 0, mas a **mediana** não. Na assimetria à esquerda, um único
resíduo muito negativo (-1,572 s, o par 14) puxa a média para
baixo, e 60% dos resíduos ficam acima de zero.
Isso é decisivo para entender os resultados.

### Controle: bootstrap simetrizado

As duas hipóteses nulas **não são a mesma** (seção 4.2 do cenário experimental):

- teste t: H0 é μ_d = 0 (a **média** das diferenças é zero);
- Wilcoxon: H0 é que a distribuição das diferenças é **simétrica em torno de 0**.

O bootstrap centralizado satisfaz a primeira e viola a segunda. Para separar
"o teste está mal calibrado" de "a H0 simulada não é a do teste", a mesma
simulação roda num segundo cenário: cada resíduo sorteado recebe um sinal ±
aleatório. A escala e as caudas continuam as mesmas, a assimetria desaparece, e
**as duas H0 passam a valer ao mesmo tempo**. Nesse cenário os dois testes
*têm* de errar perto de 5%. Se não errassem, haveria um defeito na implementação.

Este controle não é um cenário de violação de pressupostos (isso é a Q3). Ele
é a referência que permite interpretar o cenário principal.

## Como os testes foram aplicados

- **Mesmos dados**: os 10.000 × 30 valores são sorteados numa matriz antes de
  qualquer teste, e a linha r vai, como o mesmo objeto, para os dois testes. A
  conferência contra o SciPy recalcula os dois p-valores a partir dessa mesma
  matriz.
- **Teste t**: `teste_t_pareado(d)`, unilateral, com gl = n − 1.
- **Wilcoxon**: `wilcoxon_pareado(d)`. Zeros (|d| ≤ 0,5 ms) são descartados
  (`zero_method='wilcox'`), e os empates recebem o posto médio. Sem zeros nem
  empates, o p é exato; com eles, a aproximação normal é feita com correção de
  empates e de continuidade.
- **Empates**: reamostrar com reposição quase sempre repete algum resíduo, o que
  gera empates em |d|. Por isso o Wilcoxon usou a aproximação normal em
  10000 das 10000 repetições do cenário principal e em 10000 do controle.
  **Zeros** não ocorrem: o menor |eᵢ| é 0,0220 s, bem acima da
  tolerância de 0,5 ms.
- **Casos degenerados**: nenhuma repetição é descartada. Um conjunto com desvio 0
  (as 30 retiradas iguais) ou sem nenhuma diferença não nula seria mantido com o
  tratamento já definido em `src/testes.py` e contado na coluna `degenerados`.
  P-valores NaN ou fora de [0, 1] interrompem a execução com erro.

## Resultados

### Cenário principal: bootstrap centralizado

| Teste | Rejeições | Não rejeições | Taxa de erro tipo I | IC 95% (Monte Carlo) | Classificação |
|---|---:|---:|---:|---|---|
| t pareado | 1139 | 8861 | **11,39%** | [10,77%; 12,01%] | **liberal** (IC inteiro acima de 5%) |
| Wilcoxon pareado | 2794 | 7206 | **27,94%** | [27,06%; 28,82%] | **liberal** (IC inteiro acima de 5%) |

| Teste | p-valor médio | Mediana | Desvio-padrão | Degenerados | Observação |
|---|---:|---:|---:|---:|---|
| t pareado | 0,4581 | 0,4690 | 0,2944 | 0 | degenerados = conjuntos com desvio 0 (t indefinido) |
| Wilcoxon pareado | 0,2262 | 0,1470 | 0,2295 | 0 | p-valor: normal = 10000; zeros descartados no total: 0 |

### Controle: bootstrap simetrizado

| Teste | Rejeições | Taxa de erro tipo I | IC 95% (Monte Carlo) | p médio | p mediana | Classificação |
|---|---:|---:|---|---:|---:|---|
| t pareado | 502 | **5,02%** | [4,59%; 5,45%] | 0,4987 | 0,5006 | calibrado (5% dentro do IC de Monte Carlo) |
| Wilcoxon pareado | 518 | **5,18%** | [4,75%; 5,61%] | 0,5017 | 0,5082 | calibrado (5% dentro do IC de Monte Carlo) |

Sob H0, um p-valor bem calibrado tem distribuição uniforme em [0, 1]: média 0,5,
mediana 0,5 e desvio-padrão 1/√12 ≈ 0,2887. Os valores das tabelas podem ser
comparados com essa referência.

## Comparação com 5%

Com R = 10000 e uma taxa verdadeira de 5%, a taxa estimada
varia ±0,43 ponto percentual (IC de 95%) só pelo acaso da
simulação, ou seja, de 4,57% a 5,43%.
A classificação usa o IC de Monte Carlo de cada taxa:

- **calibrado**: 5% está dentro do IC;
- **liberal**: o IC inteiro está acima de 5%, ou seja, o teste rejeita H0
  verdadeira mais do que promete;
- **conservador**: o IC inteiro está abaixo de 5%.

| Cenário | Teste | Taxa | Diferença para 5% | Classificação |
|---|---|---:|---:|---|
| bootstrap_centralizado | t pareado | 11,39% | +6,39 p.p. | liberal |
| bootstrap_centralizado | Wilcoxon pareado | 27,94% | +22,94 p.p. | liberal |
| bootstrap_simetrizado | t pareado | 5,02% | +0,02 p.p. | calibrado |
| bootstrap_simetrizado | Wilcoxon pareado | 5,18% | +0,18 p.p. | calibrado |

## Interpretação

**1. As implementações estão calibradas.** No controle simetrizado, em que as
duas H0 valem, o t erra 5,02% e o Wilcoxon
5,18%. As duas taxas são compatíveis com 5%. Os
desvios do cenário principal, portanto, não vêm de erro de código: vêm da
forma da distribuição.

**2. Teste t no cenário principal: 11,39% (liberal).**
A H0 do t (média 0) é verdadeira aqui. Mesmo assim, com n = 30 e uma população de assimetria -2,06, a
estatística t não segue a distribuição t de Student. Nas amostras que não
sorteiam o resíduo extremo negativo, a média sai levemente positiva e o desvio
sai pequeno, e o t resultante é grande. Nas que sorteiam, a média cai, mas o
desvio infla junto, e o t fica contido. Com assimetria negativa, a cauda
**superior** de T engorda, e é exatamente essa a cauda que o teste `greater` usa.
A correção de Edgeworth de 1ª ordem prevê ≈ 8,5%,
na mesma direção e na mesma ordem de grandeza do valor simulado. O que sobra
vem dos termos de ordem 1/n, que pesam com uma curtose de 8,7.

**3. Wilcoxon no cenário principal: 27,94% (liberal).**
Aqui a "rejeição incorreta" precisa ser lida com cuidado. A distribuição
gerada tem média 0, mas **não é simétrica em torno de 0**:
60% dos resíduos são positivos, e a mediana é de
0,090 s. Sob essa distribuição, E[W+] = 283,8, contra 232,5 sob a
H0 do Wilcoxon. O teste está detectando, corretamente, que a distribuição
fica "mais à direita" de zero no sentido dos postos. Ou seja: a H0 *do
Wilcoxon* (simetria em torno de 0) é falsa nesta distribuição, então, em relação
a ela, essas rejeições não são erro tipo I. Em relação à H0 *do experimento* (o
cache não muda o tempo **médio**), são. A taxa alta mostra que os dois testes
respondem a perguntas diferentes quando as diferenças são assimétricas, e que,
com diferenças assimétricas, um p < 0,05 do Wilcoxon não autoriza concluir
nada sobre a média.

**4. Consequência para o experimento.** Nos dados reais, os dois testes rejeitam
H0 com p-valores minúsculos (t ≈ 2·10⁻⁵⁵; W+ no máximo possível). Uma inflação
do erro tipo I de 5% para os valores acima não ameaça essa conclusão, porque o
efeito observado (27 s, com desvio de 0,4 s) está ordens de grandeza além de
qualquer região de decisão. Em estudos com efeito pequeno e diferenças
igualmente assimétricas, porém, aplicar o t ou o Wilcoxon sem olhar a forma da
distribuição levaria a muito mais falsos positivos do que α sugere.

## Validação

| Verificação | Bootstrap centralizado | Bootstrap simetrizado |
|---|---|---|
| Repetições válidas | 10000 | 10000 |
| P-valores NaN ou fora de [0, 1] | 0 | 0 |
| Conjuntos degenerados (t / Wilcoxon) | 0 / 0 | 0 / 0 |
| Maior diferença de p para o SciPy (t) | 7.5e-13 | 1.5e-12 |
| Maior diferença de p para o SciPy (Wilcoxon) | 2.2e-16 | 2.2e-16 |
| Decisões diferentes das do SciPy (t / Wilcoxon) | 0 / 0 | 0 / 0 |
| Impressão digital (SHA-256 de dados + p-valores) | `982c2d90ddf32b71…` | `17e6cb2a2dea4832…` |

A conferência usa `scipy.stats.ttest_1samp(d, 0, alternative='greater')` e
`scipy.stats.wilcoxon(d, alternative='greater', zero_method='wilcox',
correction=True, method='approx')` (ou `method='exact'` nas repetições em que o
projeto usou o p exato), calculados sobre a mesma matriz de dados. Como os dois
p-valores de cada linha batem com os do SciPy calculados a partir da mesma
linha, os dois testes do projeto receberam exatamente os mesmos dados. A
impressão digital permite conferir a reprodutibilidade: rodar de novo com a
mesma semente tem de dar o mesmo hash.

## Limitações

- **A distribuição nula tem só 30 pontos de apoio.** O bootstrap trata a amostra
  observada como se fosse a população. Valores que não apareceram na coleta
  nunca são sorteados, e cada valor observado, inclusive os extremos, tem peso
  exato de 1/30. Em 36% dos conjuntos o
  resíduo mais negativo (par 14) nem é sorteado, e a forma da cauda esquerda
  depende quase toda de 1 a 3 observações.
- **Centralizar pela média é uma escolha.** Ela define H0 como "média = 0",
  que é a H0 do teste t. Centralizar pela mediana ou pelo estimador de
  Hodges-Lehmann geraria a H0 do Wilcoxon e inverteria a vantagem. Não existe
  uma única distribuição nula correta quando a distribuição é assimétrica, e por
  isso o controle simetrizado foi incluído.
- **Só a forma das diferenças é preservada**, e não a estrutura temporal da
  coleta (ordem AB/BA, aquecimento da JVM, deriva térmica). Os conjuntos
  simulados são i.i.d.; os dados reais podem não ser.
- **Empates artificiais.** A reamostragem repete valores, e isso leva o Wilcoxon
  para a aproximação normal com correção de empates, mesmo que os tempos reais
  sejam contínuos. A conferência contra o SciPy mostra que a aproximação está
  correta, mas o p exato não é avaliado neste cenário.
- **n fixo em 30.** A taxa de erro do t numa população assimétrica converge para
  α à medida que n cresce (o termo de Edgeworth cai com 1/√n). Os números acima
  valem para o n do experimento, não para qualquer n.
- **Erro de Monte Carlo.** Cada taxa tem incerteza de ≈ ±0,4 p.p. (IC de 95%).
  Diferenças menores que isso entre os testes não devem ser interpretadas.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `src/erro_tipo_i.py` | a simulação |
| `data/resultados_q1.csv` | resultados agregados, uma linha por cenário × teste |
| `data/pvalores_q1.csv` | os 10.000 p-valores do cenário principal (para o G3) |
| `data/pvalores_q1_controle.csv` | os 10.000 p-valores do controle simetrizado |

## Como refazer

```bash
cd Lab4
pip install -r requirements-q1.txt
python src/erro_tipo_i.py --repeticoes 10000 --n 30 --alfa 0.05 --semente 42
```

A execução leva da ordem de 10 s. Com a mesma semente, os CSVs e este
relatório saem idênticos byte a byte, inclusive as impressões digitais acima.
