# Comparação das taxas de erro tipo I — t pareado × Wilcoxon

**Lab04 — Sprint 2, Issue #108**

> Arquivo **gerado** por `python src/comparacao_erro.py` a partir de
> `data/pvalores_q1.csv`, `data/pvalores_q1_controle.csv` e `data/resultados_q1.csv`.
> Para mudar um número, refaça a simulação (`src/erro_tipo_i.py`), não edite o texto.

## 1. Objetivo

Comparar o controle do erro tipo I do teste t pareado e do Wilcoxon pareado a partir
dos 10000 conjuntos de 30 diferenças simulados na Q1 (Issue #107, detalhes em
[`resultados_q1.md`](resultados_q1.md)). Um teste bem calibrado, com α = 5%, rejeita
uma H0 verdadeira em cerca de 5% das vezes. Acima disso ele é *liberal*, com mais
falsos positivos do que promete. Abaixo, é *conservador*, com mais proteção do que
promete, em geral paga com perda de poder.

## 2. Hipóteses e cenários

Os dois testes não têm a mesma hipótese nula (d = sem cache − com cache,
alternativa `greater`):

- **t pareado:** H0 μ_d ≤ 0. Fala da **média** das diferenças.
- **Wilcoxon pareado:** H0 "a distribuição de d é simétrica em torno de 0". O teste
  responde a P(X₁ + X₂ > 0), ou seja, à **pseudomediana**, e não à média.

Média zero não garante simetria. Por isso a Q1 tem dois cenários com papéis
diferentes:

| Cenário | Como é gerado | H0 do t | H0 do Wilcoxon | Papel nesta comparação |
|---|---|:---:|:---:|---|
| `bootstrap_simetrizado` | resíduos reais reamostrados, com sinal ± sorteado | vale | vale | **comparação do erro tipo I** |
| `bootstrap_centralizado` | resíduos reais reamostrados, sem trocar o sinal (média 0, assimétrico) | vale | não vale | **análise de sensibilidade à assimetria** |

No centralizado, a taxa do Wilcoxon **não é erro tipo I**: a pseudomediana da
distribuição geradora é positiva, então vale a H1 do próprio teste (seção 4 de
`resultados_q1.md`). Essa taxa é reportada como taxa de rejeição, sem classificação
de liberal ou conservador.

## 3. Como as taxas foram calculadas

Em cada repetição, um teste rejeita H0 quando p < α, com α = 0,05:

    taxa de rejeição = rejeições de H0 / 10000

Ela só é uma taxa de erro tipo I quando a H0 do teste é verdadeira no cenário.

- **Mesmos conjuntos para os dois testes.** Cada linha dos arquivos de p-valores é
  um conjunto simulado, com o p do t e o p do Wilcoxon calculados sobre os mesmos 30
  valores (a Q1 confere isso contra o SciPy). A comparação é **pareada**,
  repetição a repetição.
- **Conferência.** As decisões são refeitas aqui a partir dos p-valores e conferidas
  com as colunas `rejeitou_*` e com as contagens e classificações de
  `data/resultados_q1.csv`. As três fontes concordam, e qualquer divergência
  interromperia o script.
- **IC de 95% de Wilson** para cada taxa. Quando a H0 do teste vale, ele é
  classificado como *liberal* se o IC inteiro estiver acima de 5%, *conservador* se
  estiver abaixo e *compatível com α* se contiver 5%.
- **Ruído de Monte Carlo.** Um teste com taxa real de exatamente 5% daria estimativas
  entre 4,57% e 5,43% (±0,43 p.p.) com R = 10000. Diferenças dessa ordem não dizem nada sobre os testes.
- **Diferença entre as taxas** em pontos percentuais (Wilcoxon − t), com IC de 95%
  para proporções pareadas: Var = [(b + c) − (c − b)²/N] / N².
- **Teste de McNemar** sobre as decisões (seção 5).

## 4. Resultados

### 4.1 Erro tipo I · distribuição simétrica (as duas H0 valem)

| Teste | H0 do teste vale? | Rejeições de H0 | Não rejeições | Taxa de rejeição | IC 95% (Wilson) | Distância para 5% | Classificação |
|---|:---:|---:|---:|---:|---|---:|---|
| t pareado | sim | 502 | 9498 | **5,02%** | [4,61%; 5,47%] | +0,02 p.p. | compatível com α |
| Wilcoxon pareado | sim | 518 | 9482 | **5,18%** | [4,76%; 5,63%] | +0,18 p.p. | compatível com α |

### 4.2 Sensibilidade à assimetria · forma dos dados reais (só a H0 do t vale)

| Teste | H0 do teste vale? | Rejeições de H0 | Não rejeições | Taxa de rejeição | IC 95% (Wilson) | Distância para 5% | Classificação |
|---|:---:|---:|---:|---:|---|---:|---|
| t pareado | sim | 1139 | 8861 | **11,39%** | [10,78%; 12,03%] | +6,39 p.p. | liberal |
| Wilcoxon pareado | **não** | 2794 | 7206 | **27,94%** | [27,07%; 28,83%] | — (não é erro tipo I) | não se aplica (H0 do teste falsa) |

## 5. Comparação pareada das decisões (McNemar)

**Por que McNemar.** As duas taxas de um cenário vêm dos mesmos 10.000 conjuntos,
então não são proporções independentes. Um teste de duas proporções comum
ignoraria que as decisões estão correlacionadas: quando o t rejeita num conjunto,
o Wilcoxon tende a rejeitar também. O McNemar leva isso em conta. Os conjuntos em
que os dois concordam não informam nada sobre qual rejeita mais, e o teste usa só
os **discordantes**: b (só o t rejeita) e c (só o Wilcoxon rejeita). A H0 do
McNemar é que as duas taxas marginais de rejeição são iguais, e nesse caso os
discordantes se dividem meio a meio. O p abaixo é o exato, bilateral:
2·P(X ≤ min(b, c)) com X ~ Binomial(b + c, 1/2). A versão qui-quadrado com correção
de continuidade vai junto e dá praticamente o mesmo valor.

Duas ressalvas de leitura:

- o McNemar só se aplica **dentro** de um cenário. Os dois cenários usam conjuntos
  diferentes (sementes 42 e 43), e não há pareamento entre eles;
- ele compara **taxas de rejeição**. No simetrizado, as duas são taxas de erro
  tipo I, e o teste compara o controle do erro tipo I. No centralizado, só a do t é;
  ali o McNemar só diz que os dois testes se comportam de forma diferente diante da
  assimetria.

| | Simetrizado (erro tipo I) | Centralizado (sensibilidade) |
|---|---:|---:|
| Ambos rejeitam (a) | 345 | 1100 |
| Só o t rejeita (b) | 157 | 39 |
| Só o Wilcoxon rejeita (c) | 173 | 1694 |
| Nenhum rejeita (d) | 9325 | 7167 |
| Concordância das decisões | 96,7% | 82,7% |
| Diferença das taxas (Wilcoxon − t) | **+0,16 p.p.** | **+16,55 p.p.** |
| IC 95% da diferença | [−0,20 p.p.; +0,52 p.p.] | [+15,80 p.p.; +17,30 p.p.] |
| χ² de McNemar (com correção, 1 gl) | 0,68 | 1578,60 |
| p (qui-quadrado) | 0,4090 | < 10^−300 |
| p exato de McNemar | 0,4090 | 2,8 × 10^-442 |

Tabelas 2×2 completas:

**Erro tipo I · distribuição simétrica (as duas H0 valem)**

| | Wilcoxon rejeita | Wilcoxon não rejeita | Total |
|---|---:|---:|---:|
| **t rejeita** | 345 (a) | 157 (b) | 502 |
| **t não rejeita** | 173 (c) | 9325 (d) | 9498 |
| **Total** | 518 | 9482 | 10000 |

**Sensibilidade à assimetria · forma dos dados reais (só a H0 do t vale)**

| | Wilcoxon rejeita | Wilcoxon não rejeita | Total |
|---|---:|---:|---:|
| **t rejeita** | 1100 (a) | 39 (b) | 1139 |
| **t não rejeita** | 1694 (c) | 7167 (d) | 8861 |
| **Total** | 2794 | 7206 | 10000 |

## 6. Comparação com o nível de significância de 5%

| Cenário | Teste | Taxa | IC 95% (Wilson) | Taxa / α | Mais perto de 5% | Comportamento |
|---|---|---:|---|---:|:---:|---|
| `bootstrap_simetrizado` | t pareado | 5,02% | [4,61%; 5,47%] | 1,00× | empate técnico | compatível com α |
| `bootstrap_simetrizado` | Wilcoxon pareado | 5,18% | [4,76%; 5,63%] | 1,04× | empate técnico | compatível com α |
| `bootstrap_centralizado` | t pareado | 11,39% | [10,78%; 12,03%] | 2,28× | não comparável | liberal |
| `bootstrap_centralizado` | Wilcoxon pareado | 27,94% | [27,07%; 28,83%] | — | não comparável | não se aplica (H0 do teste falsa) |

No simetrizado, o t ficou +0,02 p.p. e o Wilcoxon +0,18 p.p. de
5%. As duas distâncias estão dentro do ruído de Monte Carlo (±0,43 p.p.), e os
dois ICs contêm 5%. Apontar um deles como "mais próximo" seria ler ruído, por
isso a tabela marca empate técnico.

No centralizado, a pergunta "qual ficou mais perto de 5%" não se aplica: só a taxa
do t é erro tipo I. Ele foi liberal, com 2,3 vezes o nominal.
Nenhum teste foi conservador em nenhum cenário.

## 7. Interpretação

**Com as duas H0 verdadeiras, os dois testes controlam o erro tipo I no nível
nominal.** O t erra em 5,02% e o Wilcoxon em 5,18%, e os dois ICs de
Wilson contêm 5%. A diferença entre eles, de +0,16 p.p. (IC
[−0,20 p.p.; +0,52 p.p.]), não é significativa pelo McNemar (p = 0,4090).
Isso não prova que as taxas são iguais. Mostra que não há evidência de diferença,
e o IC indica que, se ela existe, não passa de cerca de 0,5 ponto percentual.
Os dois testes tomam a mesma decisão em 96,7% dos conjuntos.
Esse resultado é coerente com implementações corretas (os p-valores também batem
com os do SciPy) e com o que a teoria leva a esperar: sob simetria, a distribuição
nula do Wilcoxon vale por construção, e o t é pouco afetado com n = 30. Ele vale
para essa distribuição simétrica, não para qualquer uma.

**Com a forma assimétrica dos dados reais (sensibilidade), os testes se separam,
mas por motivos diferentes.**

- **t pareado: 11,39%, erro tipo I liberal.** A H0 do t continua
  verdadeira (média 0), mas com n = 30 e forte assimetria à esquerda a estatística t
  não segue a t de Student. A cauda superior, que é a usada pelo teste `greater`,
  engorda, e o teste rejeita 2,3 vezes o que promete. Quando a
  assimetria é removida (simetrizado), a taxa volta a 5,02%.
- **Wilcoxon: 27,94% de rejeição, que não é erro tipo I.** A distribuição tem
  média 0, mas a maioria dos valores e das médias de Walsh é positiva (pseudomediana
  positiva). A H1 do Wilcoxon é verdadeira, e ele a detecta. O problema aparece
  quando o Wilcoxon é usado para responder a uma pergunta sobre a **média**: nesse
  cenário a média não muda, e ainda assim ele rejeita em 27,9% dos conjuntos.

O McNemar do centralizado (p = 2,8 × 10^-442; 1694 conjuntos em que só o
Wilcoxon rejeita contra 39 em que só o t rejeita) confirma que, diante da
assimetria, os dois testes tomam decisões bem diferentes. Ele **não** diz que o
Wilcoxon tem um erro tipo I maior, porque a taxa dele ali não é erro tipo I.

Os dois McNemar mostram a diferença entre significância e relevância. Com 10.000
repetições, o teste detectaria diferenças pequenas, e o IC da diferença no
simetrizado tem meia-largura de só 0,36 p.p. Mesmo assim, não acusa nada ali.
No centralizado, o que importa não é o p minúsculo, e sim os 16,6 p.p.
de diferença entre as taxas de rejeição.

## 8. Conclusão

**Quando as hipóteses nulas dos dois testes são verdadeiras (distribuição
simétrica em torno de 0, n = 30), o teste t pareado e o Wilcoxon pareado
controlaram o erro tipo I no nível nominal** (5,02% e 5,18%), sem
diferença detectável entre eles. Nessa condição, nenhum dos dois teve melhor
controle do erro tipo I que o outro.

**Com a assimetria dos dados reais, o teste t perdeu o controle do erro tipo I**
(11,39%, liberal). Para o Wilcoxon, esse cenário não mede erro tipo I,
porque a hipótese nula dele não vale numa distribuição assimétrica. O que ele mostra
é que, com diferenças assimétricas, os dois testes respondem a perguntas diferentes:
o t, sobre a média; o Wilcoxon, sobre a pseudomediana. Um p < 0,05 do Wilcoxon,
nesse caso, não autoriza conclusões sobre o tempo médio.

Nada disso permite dizer que um teste é superior ao outro em geral. As conclusões
valem para estas duas distribuições, construídas a partir de 30 pares de um único
projeto, com n = 30 e α = 5%. Para a análise do experimento, a consequência é
limitada: nos dados reais, os dois testes rejeitam H0 com p-valores muito menores
que qualquer taxa vista aqui (t ≈ 2·10⁻⁵⁵; W⁺ no máximo possível), e a conclusão de
que o cache reduz o tempo de build não depende dessa diferença. Ela pesaria num
estudo com efeito pequeno e diferenças igualmente assimétricas. Ali, a escolha do
teste deveria partir de qual parâmetro interessa (média ou pseudomediana) e da forma
observada das diferenças.

## 9. Limitações

- **Uma única forma de distribuição de origem.** Os dois cenários reamostram 30
  diferenças de um único projeto (Spring PetClinic), numa única máquina, com n = 30.
  Com outra assimetria, outra curtose ou outro n, as taxas mudam. A do t, em
  particular, tende a α à medida que n cresce.
- **O erro tipo I do Wilcoxon só é medido sob simetria.** É a única situação em que
  a H0 dele vale. Não existe um cenário com a forma assimétrica real em que as duas
  H0 valham ao mesmo tempo, então a comparação "com a forma dos dados reais" é,
  necessariamente, uma análise de sensibilidade, e não uma comparação de erro tipo I.
- **O simetrizado remove a característica mais marcante dos dados.** Ele mantém a
  escala e as caudas, mas não a assimetria. A conclusão sobre o controle do erro tipo
  I vale para essa versão simétrica, não para a distribuição real.
- **Bootstrap com 30 pontos de apoio.** Cada valor observado, inclusive os extremos,
  tem peso 1/30, e valores não observados nunca aparecem. A reamostragem também gera
  empates artificiais, e o Wilcoxon usou a aproximação normal com correção de
  empates em todas as repetições. O comportamento do p exato não foi avaliado.
- **Erro de Monte Carlo.** Cada taxa perto de 5% tem incerteza de ±0,43 p.p. (95%).
  Diferenças menores que isso, entre testes ou em relação a α, não devem ser
  interpretadas.
- **Ausência de significância não é equivalência.** Um McNemar não significativo
  não demonstra que as taxas são iguais. O que limita o tamanho de uma diferença
  possível é o IC da diferença, e não o p.
- **Significância do McNemar não é relevância.** Com 10.000 repetições, ele detecta
  diferenças pequenas. O que importa na prática é o tamanho da diferença em pontos
  percentuais e o quanto cada taxa se afasta de 5%.
- **Só o erro tipo I.** Um teste mais conservador quase sempre tem menos poder.
  Escolher entre os dois testes exige olhar também o poder (Q2) e o comportamento
  sob violação de pressupostos (Q3), que não são tratados aqui.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `src/comparacao_erro.py` | esta comparação (só biblioteca padrão) |
| `data/comparacao_taxas_erro.csv` | uma linha por cenário × teste: contagens, taxa, IC de Wilson, se a H0 vale, distância para α, classificação |
| `data/mcnemar_q1.csv` | tabela 2×2, diferença pareada e McNemar por cenário |
| `src/graficos.py` (`grafico_g3`) | o G3, desenhado no dashboard |

## Como refazer

```bash
cd Lab4
python src/erro_tipo_i.py          # Q1: simulação (precisa de NumPy, pandas e SciPy)
python src/comparacao_erro.py      # CSVs e este relatório
python src/dashboard.py --abrir    # dashboard com o G3
```
