# Poder dos dois testes com efeitos crescentes (Q2)

**Lab04 — Issue #109: a simulação com H1 verdadeira**

> Arquivo **gerado** por `python src/poder.py`. Não edite à mão:
> rode o comando de novo.

A Q1 e a Q3 mediram a taxa de erro tipo I, isto é, o que os testes fazem
quando **não** há efeito. Aqui o efeito existe, e a pergunta é quantas vezes
cada teste o encontra. O efeito é dado em desvios das diferenças
(δ = μ_d/σ_d, o mesmo d_z dos dados reais).

## Parâmetros

| Item | Valor |
|---|---|
| Repetições por célula | 10.000 |
| Nível de significância | 0.05 (unilateral, `greater`) |
| Efeitos (δ) | 0,00, 0,10, 0,20, 0,30, 0,40, 0,50, 0,65, 0,80, 1,00, 1,25, 1,50 |
| Tamanhos de amostra | 5, 10, 30, 50 |
| Desvio das diferenças | 0.3934 s (o das diferenças reais) |
| Semente base | 42 (cada célula deriva a sua) |
| Células | 220 (5 cenários × 4 tamanhos × 11 efeitos) |

Se a taxa verdadeira fosse exatamente α, a estimada cairia entre 4,57% e 5,43% em 95% das simulações.

## Cenários

| Cenário | Família | O que é |
|---|---|---|
| `normal` | violação de pressupostos | sem violação (referência) |
| `cauda_pesada` | violação de pressupostos | normalidade violada: t de Student com 3 gl |
| `contaminada` | violação de pressupostos | normalidade violada: 10% das observações com 5× o desvio |
| `bootstrap_simetrizado` | bootstrap dos dados reais | resíduos reais reamostrados com sinal ± sorteado (simétrico) |
| `bootstrap_centralizado` | bootstrap dos dados reais | resíduos reais reamostrados sem trocar o sinal (assimétrico) |

Os três primeiros vêm de `gerar_diferencas` em `src/violacao.py`, que já
aceitava o efeito. Os dois do bootstrap reamostram os 30 resíduos reais com
`random.Random`, seguindo a mesma regra de `src/erro_tipo_i.py` — que não é
importado aqui porque depende de NumPy, e o resto do Lab04 roda sem instalar
nada. O fluxo de sorteios é outro, então o ponto de δ = 0 reproduz a taxa da
Q1 a menos do erro de Monte Carlo, e não bit a bit; a conferência abaixo é
exatamente esse teste.

## Conferência bit a bit com a Q3

Nos três cenários de violação o gerador é a mesma função que a Q3 usa
(`violacao.gerar_diferencas`), com a mesma biblioteca de sorteio. Refazendo
cada célula **com a semente da Q3**, as contagens de rejeição têm de bater
exatamente — não a menos de erro de simulação.

| Cenário | n | Semente | t aqui | t na Q3 | W aqui | W na Q3 | Idêntico |
|---|---|---|---|---|---|---|---|
| `cauda_pesada` | 5 | 142 | 447 | 447 | 307 | 307 | sim |
| `cauda_pesada` | 10 | 143 | 466 | 466 | 436 | 436 | sim |
| `cauda_pesada` | 30 | 144 | 495 | 495 | 480 | 480 | sim |
| `contaminada` | 5 | 242 | 405 | 405 | 332 | 332 | sim |
| `contaminada` | 10 | 243 | 414 | 414 | 436 | 436 | sim |
| `contaminada` | 30 | 244 | 454 | 454 | 482 | 482 | sim |
| `normal` | 5 | 42 | 509 | 509 | 329 | 329 | sim |
| `normal` | 10 | 43 | 452 | 452 | 374 | 374 | sim |
| `normal` | 30 | 44 | 487 | 487 | 460 | 460 | sim |

9 de 9 células idênticas.

Com a Q1 isso não é possível: ela sorteia com NumPy, e nenhum fluxo de
`random.Random` reproduz aquele. Lá a conferência só pode ser estatística.

## Conferência estatística do ponto δ = 0

Em δ = 0 cada célula mede a mesma coisa que uma taxa de erro tipo I já
publicada. Como as sementes da grade daqui são outras, o que tem de valer é
|z| ≤ 1,96 na comparação de duas proporções independentes.

| Origem | Cenário | n | Teste | Aqui | Publicada | z | Compatível |
|---|---|---|---|---|---|---|---|
| Q1 | `bootstrap_centralizado` | 30 | Wilcoxon pareado | 28,87% | 27,94% | 1,46 | sim |
| Q1 | `bootstrap_centralizado` | 30 | t pareado | 11,97% | 11,39% | 1,28 | sim |
| Q1 | `bootstrap_simetrizado` | 30 | Wilcoxon pareado | 4,92% | 5,18% | -0,84 | sim |
| Q1 | `bootstrap_simetrizado` | 30 | t pareado | 5,05% | 5,02% | 0,10 | sim |
| Q3 | `cauda_pesada` | 5 | Wilcoxon pareado | 2,99% | 3,07% | -0,33 | sim |
| Q3 | `cauda_pesada` | 5 | t pareado | 4,11% | 4,47% | -1,26 | sim |
| Q3 | `cauda_pesada` | 10 | Wilcoxon pareado | 3,84% | 4,36% | -1,85 | sim |
| Q3 | `cauda_pesada` | 10 | t pareado | 4,29% | 4,66% | -1,27 | sim |
| Q3 | `cauda_pesada` | 30 | Wilcoxon pareado | 4,89% | 4,80% | 0,30 | sim |
| Q3 | `cauda_pesada` | 30 | t pareado | 4,92% | 4,95% | -0,10 | sim |
| Q3 | `contaminada` | 5 | Wilcoxon pareado | 2,94% | 3,32% | -1,54 | sim |
| Q3 | `contaminada` | 5 | t pareado | 3,92% | 4,05% | -0,47 | sim |
| Q3 | `contaminada` | 10 | Wilcoxon pareado | 4,45% | 4,36% | 0,31 | sim |
| Q3 | `contaminada` | 10 | t pareado | 4,42% | 4,14% | 0,98 | sim |
| Q3 | `contaminada` | 30 | Wilcoxon pareado | 4,65% | 4,82% | -0,57 | sim |
| Q3 | `contaminada` | 30 | t pareado | 4,56% | 4,54% | 0,07 | sim |
| Q3 | `normal` | 5 | Wilcoxon pareado | 3,29% | 3,29% | 0,00 | sim |
| Q3 | `normal` | 5 | t pareado | 5,09% | 5,09% | 0,00 | sim |
| Q3 | `normal` | 10 | Wilcoxon pareado | 4,42% | 3,74% | 2,43 | **NÃO** |
| Q3 | `normal` | 10 | t pareado | 5,15% | 4,52% | 2,08 | **NÃO** |
| Q3 | `normal` | 30 | Wilcoxon pareado | 4,70% | 4,60% | 0,34 | sim |
| Q3 | `normal` | 30 | t pareado | 4,78% | 4,87% | -0,30 | sim |

20 de 22 linhas compatíveis, em 1 de 11 células.

As duas linhas de uma mesma célula **não são independentes**: os dois testes
veem os mesmos conjuntos simulados, então quando uma amostra sai propensa a
rejeitar, as duas taxas sobem juntas. Uma célula fora da faixa é uma
observação, não duas — e com uma dúzia de células é esperado que isso
aconteça em alguma. O que indicaria erro é |z| acima de 3,5 ou várias
células fora ao mesmo tempo; para os cenários de violação, quem decide é a
conferência exata da seção anterior.

## Efeito mínimo detectável com 80% de poder (MDE₈₀)

O δ em que a curva cruza 80%, por interpolação linear entre os pontos da
grade. `> 1,50` significa que o teste não chega a 80% dentro da grade.

| Cenário | n=5 t | n=5 W | n=10 t | n=10 W | n=30 t | n=30 W | n=50 t | n=50 W |
|---|---|---|---|---|---|---|---|---|
| `normal` | 1,37 | > 1,50 | 0,86 | 0,92 | 0,47 | 0,48 | 0,36 | 0,37 |
| `cauda_pesada` | 1,15 | 1,43 | 0,75 | 0,73 | 0,43 | 0,36 | 0,34 | 0,27 |
| `contaminada` | 1,05 | 1,22 | 0,75 | 0,65 | 0,46 | 0,31 | 0,36 | 0,24 |
| `bootstrap_simetrizado` | 1,17 | > 1,50 | 0,79 | 0,67 | 0,46 | 0,31 | 0,36 | 0,24 |
| `bootstrap_centralizado` | 1,19 | > 1,50 | 1,04 | 0,75 | 0,50 | 0,22 | 0,38 | 0,13 |

Em segundos, basta multiplicar por σ_d = 0.3934 s.

## Poder por cenário

Proporção de conjuntos em que cada teste rejeitou H₀. A linha δ = 0 é a taxa
de erro tipo I, não poder.

### `normal` — sem violação (referência)

| δ (efeito) | n=5 t | n=5 W | n=10 t | n=10 W | n=30 t | n=30 W | n=50 t | n=50 W |
|---|---|---|---|---|---|---|---|---|
| 0,00 | 5,1% | 3,3% | 5,1% | 4,4% | 4,8% | 4,7% | 5,2% | 5,0% |
| 0,10 | 7,4% | 4,3% | 8,9% | 7,3% | 13,5% | 12,6% | 16,9% | 16,4% |
| 0,20 | 10,1% | 6,3% | 15,3% | 12,9% | 28,5% | 26,9% | 39,9% | 38,5% |
| 0,30 | 13,8% | 8,7% | 22,1% | 19,2% | 48,8% | 46,6% | 66,8% | 64,8% |
| 0,40 | 19,1% | 12,4% | 31,1% | 27,3% | 69,1% | 66,4% | 87,9% | 86,3% |
| 0,50 | 23,5% | 15,8% | 42,0% | 37,6% | 84,9% | 82,7% | 96,5% | 95,8% |
| 0,65 | 33,0% | 22,3% | 59,7% | 54,6% | 96,6% | 95,7% | 99,8% | 99,8% |
| 0,80 | 43,7% | 30,4% | 75,4% | 70,4% | 99,6% | 99,4% | 100,0% | 100,0% |
| 1,00 | 57,6% | 40,8% | 90,1% | 87,1% | 100,0% | 100,0% | 100,0% | 100,0% |
| 1,25 | 73,9% | 56,2% | 97,4% | 96,1% | 100,0% | 100,0% | 100,0% | 100,0% |
| 1,50 | 86,6% | 71,4% | 99,7% | 99,4% | 100,0% | 100,0% | 100,0% | 100,0% |

### `cauda_pesada` — normalidade violada: t de Student com 3 gl

| δ (efeito) | n=5 t | n=5 W | n=10 t | n=10 W | n=30 t | n=30 W | n=50 t | n=50 W |
|---|---|---|---|---|---|---|---|---|
| 0,00 | 4,1% | 3,0% | 4,3% | 3,8% | 4,9% | 4,9% | 5,3% | 5,1% |
| 0,10 | 7,7% | 5,7% | 9,7% | 9,7% | 15,3% | 17,4% | 20,5% | 25,0% |
| 0,20 | 12,0% | 9,2% | 19,0% | 18,4% | 35,1% | 42,6% | 47,2% | 60,6% |
| 0,30 | 19,3% | 14,4% | 30,4% | 29,7% | 58,6% | 69,2% | 72,9% | 87,3% |
| 0,40 | 27,4% | 21,2% | 43,6% | 43,5% | 76,4% | 87,6% | 89,1% | 97,7% |
| 0,50 | 36,1% | 27,7% | 57,0% | 57,6% | 88,0% | 96,5% | 95,7% | 99,8% |
| 0,65 | 48,1% | 38,5% | 72,8% | 73,7% | 95,9% | 99,6% | 98,8% | 100,0% |
| 0,80 | 60,6% | 48,8% | 83,5% | 85,0% | 98,2% | 100,0% | 99,4% | 100,0% |
| 1,00 | 74,0% | 61,9% | 91,9% | 93,0% | 99,4% | 100,0% | 99,7% | 100,0% |
| 1,25 | 84,3% | 73,5% | 95,9% | 97,0% | 99,7% | 100,0% | 99,9% | 100,0% |
| 1,50 | 90,9% | 82,4% | 97,9% | 98,7% | 99,9% | 100,0% | 100,0% | 100,0% |

### `contaminada` — normalidade violada: 10% das observações com 5× o desvio

| δ (efeito) | n=5 t | n=5 W | n=10 t | n=10 W | n=30 t | n=30 W | n=50 t | n=50 W |
|---|---|---|---|---|---|---|---|---|
| 0,00 | 3,9% | 2,9% | 4,4% | 4,5% | 4,6% | 4,7% | 5,3% | 5,1% |
| 0,10 | 7,4% | 5,5% | 10,6% | 10,8% | 17,3% | 21,4% | 20,6% | 29,2% |
| 0,20 | 12,9% | 9,9% | 21,0% | 21,6% | 36,6% | 49,2% | 46,5% | 69,4% |
| 0,30 | 20,9% | 15,8% | 34,2% | 35,2% | 57,9% | 78,2% | 71,0% | 93,5% |
| 0,40 | 29,9% | 23,3% | 50,0% | 51,0% | 72,9% | 93,4% | 86,7% | 99,5% |
| 0,50 | 41,0% | 32,3% | 62,4% | 64,9% | 84,0% | 98,4% | 94,4% | 100,0% |
| 0,65 | 54,5% | 44,9% | 75,0% | 79,7% | 94,0% | 99,9% | 98,9% | 100,0% |
| 0,80 | 68,1% | 59,2% | 82,6% | 88,2% | 97,7% | 100,0% | 99,8% | 100,0% |
| 1,00 | 78,4% | 71,5% | 87,9% | 93,7% | 99,6% | 100,0% | 100,0% | 100,0% |
| 1,25 | 85,9% | 81,0% | 93,2% | 96,7% | 100,0% | 100,0% | 100,0% | 100,0% |
| 1,50 | 88,8% | 85,1% | 96,0% | 98,1% | 100,0% | 100,0% | 100,0% | 100,0% |

### `bootstrap_simetrizado` — resíduos reais reamostrados com sinal ± sorteado (simétrico)

| δ (efeito) | n=5 t | n=5 W | n=10 t | n=10 W | n=30 t | n=30 W | n=50 t | n=50 W |
|---|---|---|---|---|---|---|---|---|
| 0,00 | 4,1% | 3,3% | 4,0% | 4,4% | 5,1% | 4,9% | 4,9% | 5,0% |
| 0,10 | 7,8% | 5,2% | 9,9% | 10,2% | 16,4% | 21,6% | 19,4% | 30,6% |
| 0,20 | 12,4% | 6,6% | 20,4% | 20,6% | 35,3% | 51,0% | 45,3% | 70,6% |
| 0,30 | 20,1% | 13,4% | 34,3% | 33,8% | 54,3% | 78,5% | 69,2% | 93,4% |
| 0,40 | 29,5% | 24,2% | 49,6% | 51,1% | 72,4% | 93,4% | 87,3% | 99,3% |
| 0,50 | 42,0% | 30,1% | 60,5% | 62,7% | 84,8% | 98,0% | 95,8% | 100,0% |
| 0,65 | 57,4% | 48,5% | 71,9% | 78,8% | 94,9% | 99,8% | 99,5% | 100,0% |
| 0,80 | 69,3% | 64,3% | 80,6% | 88,2% | 98,9% | 99,9% | 100,0% | 100,0% |
| 1,00 | 74,9% | 76,8% | 85,5% | 93,5% | 99,9% | 100,0% | 100,0% | 100,0% |
| 1,25 | 82,2% | 77,9% | 93,3% | 95,5% | 100,0% | 100,0% | 100,0% | 100,0% |
| 1,50 | 89,0% | 76,8% | 98,1% | 96,2% | 100,0% | 100,0% | 100,0% | 100,0% |

### `bootstrap_centralizado` — resíduos reais reamostrados sem trocar o sinal (assimétrico)

| δ (efeito) | n=5 t | n=5 W | n=10 t | n=10 W | n=30 t | n=30 W | n=50 t | n=50 W |
|---|---|---|---|---|---|---|---|---|
| 0,00 | 12,1% | 7,8% | 13,3% | 13,2% | 12,0% | 28,9% | 9,3% | 39,1% |
| 0,10 | 18,5% | 12,9% | 23,8% | 24,3% | 24,4% | 55,6% | 24,6% | 75,0% |
| 0,20 | 26,9% | 17,6% | 34,8% | 35,6% | 38,3% | 76,3% | 45,2% | 91,6% |
| 0,30 | 34,9% | 25,9% | 45,7% | 49,6% | 53,7% | 91,5% | 66,5% | 98,8% |
| 0,40 | 44,5% | 40,4% | 55,0% | 61,1% | 69,2% | 95,5% | 83,1% | 99,6% |
| 0,50 | 52,5% | 39,8% | 62,3% | 65,9% | 80,1% | 97,7% | 93,1% | 99,9% |
| 0,65 | 63,3% | 49,0% | 67,6% | 75,4% | 92,0% | 99,6% | 98,9% | 100,0% |
| 0,80 | 68,2% | 58,8% | 70,3% | 82,1% | 97,1% | 99,8% | 99,8% | 100,0% |
| 1,00 | 74,6% | 71,8% | 77,6% | 89,5% | 99,5% | 99,9% | 100,0% | 100,0% |
| 1,25 | 81,8% | 71,0% | 91,0% | 90,6% | 100,0% | 100,0% | 100,0% | 100,0% |
| 1,50 | 82,9% | 70,3% | 95,7% | 90,7% | 100,0% | 100,0% | 100,0% | 100,0% |

> Atenção: aqui a H₀ do Wilcoxon é **falsa em toda a tabela**, inclusive
> em δ = 0 (a distribuição é assimétrica, com média 0 e pseudomediana
> positiva). A coluna W não é poder, e sim taxa de rejeição com a H₀ do
> teste falsa — a mesma distinção que o G3 marcou com a barra listrada.

## Leitura

**O eixo começa onde a Q1 e a Q3 pararam.** Em δ = 0 não existe efeito, e a taxa de rejeição volta a ser a taxa de erro tipo I: nas 16 células simétricas ela fica entre 2,94% e 5,29%, com o maior afastamento de α no cenário `contaminada` com n = 5. É por isso que as curvas do G4 **partem de 5%**: se partissem de outro lugar, o problema não seria de poder.

**Com diferenças normais, o t ganha — e ganha pouco.** Em n = 30, a maior desvantagem do Wilcoxon no cenário `normal` é de 2,7 p.p. (δ = 0,40: 69,1% do t contra 66,4% do Wilcoxon). O teste t é o mais poderoso quando seus pressupostos valem exatamente, mas o preço de usar o Wilcoxon nesse caso é de poucos pontos percentuais — o custo da robustez é baixo.

**Com cauda pesada e com outliers, o Wilcoxon ganha — e ganha muito mais do que perde no normal.** Em n = 30, em `cauda_pesada` ele chega a 11,3 p.p. de vantagem (δ = 0,40: 87,6% contra 76,4%); em `contaminada` ele chega a 20,5 p.p. de vantagem (δ = 0,40: 93,4% contra 72,9%). A razão é a mesma nos dois: a média e o desvio que o t usa são puxados pelos valores extremos, e o desvio cresce mais rápido que a média, então a estatística t encolhe. Os postos não enxergam a magnitude do extremo, só a ordem.

**Quanto de efeito 30 pares conseguem detectar.** Lendo onde cada curva cruza 80% de poder, o efeito mínimo detectável em n = 30 fica entre δ = 0,31 e δ = 0,48 — ou seja, entre 0,12 s e 0,19 s de diferença média. A seção 12 do cenário experimental avisava que 30 pares poderiam não bastar para efeitos pequenos; este é o número que faltava para dizer *quão* pequenos. A diferença medida nos dados reais foi de 27,24 s, 143 vezes maior que o mais exigente desses limites — por isso os dois testes concordaram com folga.

**Com n = 5 o problema deixa de ser qual teste e passa a ser o tamanho da amostra.** No cenário `normal`, o MDE₈₀ vai para δ = 1,37 no t e mais de δ = 1,50 no Wilcoxon, e mesmo com δ = 1,50 as taxas param em 86,6% e 71,4%. O Wilcoxon exato fica preso na granularidade que a Q3 já havia mostrado no erro tipo I: com 2⁵ = 32 somas de postos possíveis, as caudas disponíveis são poucas, e ele gasta menos que α — erra menos e acha menos.

**A curva do Wilcoxon no `bootstrap_centralizado` não é uma curva de poder.** Ali a distribuição é assimétrica com média 0, então a H₀ dele (simetria em torno de zero) já é falsa em δ = 0, e ele rejeita 28,87% dos conjuntos sem que exista qualquer deslocamento — contra 11,97% do t, que é erro tipo I de verdade. É o mesmo ponto que o G3 marcou com a barra listrada, e é a razão de a coluna `natureza` existir no CSV: subir essa curva não é mérito, é a H₀ errada sendo testada.

**Recomendação: o Wilcoxon pareado como teste principal neste cenário.** Ele troca até 2,7 p.p. de poder, no caso em que o t é ótimo, por até 20,5 p.p. quando há cauda pesada ou outliers — e tempo de build tem as duas coisas. A troca é assimétrica a favor dele.

Com duas ressalvas que os números acima deixam explícitas. A primeira: um p < 0,05 do Wilcoxon **não** autoriza uma afirmação sobre o tempo *médio*. A H₀ dele é sobre simetria/pseudomediana, e o cenário centralizado mostra que as duas coisas se separam quando as diferenças são assimétricas — se a conclusão precisa ser sobre a média, o teste é o t. A segunda: com amostra muito pequena a escolha do teste é secundária, porque nenhum dos dois tem poder. Nos dados reais deste laboratório a discussão é acadêmica — o efeito é grande o bastante para os dois rejeitarem com folga — e é exatamente por isso que ela precisou ser feita por simulação.

## Limitações

As taxas valem para estes cinco cenários, estes tamanhos de amostra e este
α, e carregam o erro de Monte Carlo de 10.000 repetições — diferenças de menos de
cerca de 1 p.p. entre duas células não devem ser lidas como reais sem olhar
o IC no CSV. O MDE₈₀ é interpolado entre pontos da grade, então tem a
resolução dela. E o bootstrap herda a forma de 30 observações: ele preserva a
assimetria e os extremos **daquela** coleta, não de builds em geral.

## Arquivos gerados

| Arquivo | Conteúdo |
|---|---|
| `data/resultados_q2.csv` | uma linha por (cenário, n, δ, teste), com IC de Wilson, erro padrão de Monte Carlo e MDE₈₀ |
| `data/mcnemar_q2.csv` | o pareamento entre os dois testes em cada célula |
| `docs/poder.md` | este relatório |

