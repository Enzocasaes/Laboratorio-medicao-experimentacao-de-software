# 3–4. Resultados e discussão — RQ 05 e RQ 06

> Subseções de Resultados (Seção 3) e Discussão (Seção 4) para a RQ 05 e a
> RQ 06 (Lab03S03, Pessoa B). Todos os números vêm de
> `Lab3/Sprint01/docs/analise-rq05.md` e `docs/analise-rq06.md`, gerados por
> `npm run analise:rq05` e `npm run analise:rq06` a partir de
> `data/processed/dataset.csv`, e conferidos com o scipy e o statsmodels por
> `scripts/conferir_rq05_rq06.py`. O fator *tipo do projeto* (⟨…⟩) depende do
> consenso da validação manual e entra quando a rotulagem estiver concluída.

## 3. Resultados

### 3.5 RQ 05 — frequência de deploy × taxa de falha

**Procedimento.** Medimos a associação entre a frequência de deploy (releases
por semana) e cada variante do CFR pela correlação de Spearman, porque as duas
métricas são muito assimétricas e a relação esperada é monótona, mas não
necessariamente linear. Cada par usa os repositórios em que as duas métricas
foram medidas. O intervalo de confiança de 95% de ρ vem da transformação de
Fisher, com o erro-padrão de Bonett e Wright (2000). Os seis pares da Tabela X
formam uma família de testes, corrigida pelo método de Holm (α = 0,05).
Classificamos a magnitude de |ρ| como nula (< 0,1), fraca (< 0,3), moderada
(< 0,5) ou forte (≥ 0,5).

Além das duas correlações principais, incluímos três análises para entender
a variante (b). A primeira é de robustez: restringe o CFR (b) aos repositórios
com pelo menos 10 releases avaliadas, porque uma taxa calculada sobre duas ou
três releases salta entre 0 e 1. As outras duas decompõem o CFR (b). Por
repositório, ele é o produto de duas proporções:

- **oportunidade**: das releases avaliadas, a fração cuja release seguinte
  saiu em até 7 dias;
- **condicional**: dessas, a fração em que a seguinte foi corretiva.

Uma release só pode ser contada como falha se a seguinte sair em até 7 dias,
e quem publica com mais frequência tem, por construção, mais releases nessa
situação. Se a correlação entre frequência e CFR (b) vier da oportunidade e
não aparecer na condicional, ela é um efeito da definição da métrica. A
última linha da tabela correlaciona a frequência com o tempo de recuperação,
a outra métrica de estabilidade do DORA.

**Tabela X — Correlação de Spearman entre a frequência de deploy e as métricas de estabilidade (n = 300 repositórios; Holm sobre os seis pares).**

| Papel | Frequência × … | n | ρ | IC 95% | p (Holm) |
|---|---|---|---|---|---|
| principal | CFR (a), proxy de CI | 300 | 0,162 | 0,049 a 0,271 | 0,0096 |
| principal | CFR (b), proxy de entrega | 298 | 0,515 | 0,420 a 0,599 | < 0,0001 |
| robustez | CFR (b), ≥ 10 releases avaliadas | 248 | 0,469 | 0,360 a 0,565 | < 0,0001 |
| mecanismo | Oportunidade (seguinte em ≤ 7 dias) | 298 | 0,744 | 0,681 a 0,796 | < 0,0001 |
| mecanismo | Condicional (seguinte corretiva, dado ≤ 7 dias) | 266 | −0,043 | −0,163 a 0,078 | 0,48 |
| complementar | Tempo de recuperação | 283 | −0,204 | −0,314 a −0,088 | 0,0017 |

Na variante **(a)**, a correlação é **fraca e positiva** (ρ = 0,16) e
continua significativa depois da correção. Na variante **(b)**, ela é
**forte** (ρ = 0,52). Ela cai para moderada (ρ = 0,47) quando os repositórios
com poucas releases avaliadas saem da conta, mas não desaparece. A
decomposição mostra de onde ela vem: a frequência tem correlação forte com a
**oportunidade** (ρ = 0,74) e **nenhuma** com a **condicional** (ρ = −0,04;
IC de 95% de −0,16 a 0,08). Dado que a release seguinte saiu em até 7 dias,
repositórios que publicam mais **não** têm maior chance de que ela seja uma
correção.

A Tabela Y mostra o mesmo padrão por quartil de frequência. O CFR (a)
mediano fica entre 4,0% e 4,6% nos três primeiros quartis e sobe para 7,2% no
quartil mais frequente; todos esses valores estão na faixa Elite (≤ 15%). O
CFR (b) mediano cresce de forma monótona, de 0% para 40%.

**Tabela Y — CFR mediano (IQR) por quartil de frequência de deploy.**

| Quartil | Releases/semana | n | CFR (a) | CFR (b) |
|---|---|---|---|---|
| Q1 | 0,096 a 0,249 | 77 | 4,3% (1,6–10,8%) | 0,0% (0,0–20,0%) |
| Q2 | 0,249 a 0,537 | 76 | 4,0% (2,2–11,2%) | 13,8% (5,4–21,9%) |
| Q3 | 0,537 a 1,227 | 73 | 4,6% (2,6–10,2%) | 30,3% (12,0–50,3%) |
| Q4 | 1,227 a 28,173 | 74 | 7,2% (3,1–13,6%) | 40,0% (15,4–67,4%) |

Por fim, a frequência tem correlação **fraca e negativa** com o tempo de
recuperação (ρ = −0,20): repositórios que publicam mais voltam ao verde um
pouco mais rápido.

### 3.6 RQ 06 — características do repositório × desempenho DORA

**Procedimento.** Analisamos quatro fatores: a **linguagem principal** (C e
C++ juntas, e linguagens com menos de 10 repositórios agrupadas em "Outras",
o que resulta em 7 grupos), os **contribuidores**, a **idade** (no fim da
janela) e as **estrelas**. Os três últimos foram divididos em quartis. ⟨Tipo
do projeto, por consenso da amostra-ouro: n = …, grupos …⟩. As variáveis de
resposta são as quatro métricas da combinação C1 e a pontuação DORA geral (1 =
Low a 4 = Elite). Usamos duas famílias de testes, corrigidas por Holm
separadamente:

- **omnibus**: o teste de Kruskal–Wallis de cada fator com cada métrica
  (4 × 5 = 20 testes). O tamanho de efeito é ε² = H/(n − 1), classificado como
  desprezível (< 0,01), pequeno (< 0,08), médio (< 0,26) ou grande (≥ 0,26);
- **contrastes planejados**: testes de Mann–Whitney definidos a partir da H6
  antes de olharmos os dados. Comparamos Q4 × Q1 em cada fator por quartis e
  cada linguagem com ferramentas de publicação automatizada (TypeScript,
  JavaScript, Go e Rust) × C/C++ na frequência, num total de 19 contrastes. O
  tamanho de efeito é o delta de Cliff, classificado pelos cortes de Romano et
  al. (2006): desprezível (|δ| < 0,147), pequeno (< 0,33), médio (< 0,474) ou
  grande (≥ 0,474).

Não fizemos todos os pares de grupos: só entre as 7 linguagens seriam 21
comparações por métrica, o que diluiria o poder dos testes sem responder a
nenhuma pergunta da hipótese.

**Tabela Z — Kruskal–Wallis significativos após Holm (de 20 testes).**

| Fator | Métrica | H (gl) | p (Holm) | ε² | Melhor grupo (mediana) |
|---|---|---|---|---|---|
| Idade | Lead time (a) | 107,0 (3) | < 0,0001 | 0,359 (grande) | Q1, 2,1 dias |
| Idade | Pontuação DORA | 46,3 (3) | < 0,0001 | 0,155 (médio) | Q1 |
| Idade | Frequência | 31,8 (3) | < 0,0001 | 0,106 (médio) | Q1, 0,88/semana |
| Contribuidores | Lead time (a) | 55,3 (3) | < 0,0001 | 0,185 (médio) | Q1, 5,3 dias |
| Linguagem | Lead time (a) | 30,2 (6) | 0,0006 | 0,101 (médio) | Python, 5,5 dias |

A **idade** é o fator mais associado ao desempenho. Os repositórios mais novos
(Q1, até 2,5 anos) publicam mais (mediana de 0,88 contra 0,36 releases por
semana no Q4; δ = −0,49, grande), têm lead time muito menor (2,1 contra 42,7
dias; δ = 0,82, grande), recuperam-se mais rápido (1,4 contra 3,0 horas;
δ = 0,29, pequeno) e têm pontuação DORA maior (mediana High contra Medium;
δ = −0,52, grande). Só o CFR (a) não difere entre as faixas de idade depois da
correção.

Os **contribuidores** só aparecem no lead time: o quartil com mais
contribuidores tem lead time de 40,9 dias, contra 5,3 dias no quartil com
menos (δ = 0,65, grande). A diferença na pontuação DORA (Q1 melhor; δ = −0,31,
pequeno) é significativa no contraste planejado, mas não no omnibus (p de
Holm = 0,064). A **linguagem** também só aparece no lead time: Python tem a
menor mediana (5,5 dias) e C/C++ a maior (73,9 dias). Na frequência, o teste
omnibus da linguagem seria significativo sem correção (p = 0,013), mas não
depois dela (0,18). Nenhum dos quatro contrastes com C/C++ é significativo,
embora TypeScript publique o triplo (0,84 contra 0,26 releases por semana;
δ = 0,35, médio; p de Holm = 0,21). As **estrelas** não se associam a nenhuma
métrica (todos os ε² ≤ 0,025 e p de Holm ≥ 0,63).

**Confusão entre idade e contribuidores.** Os dois fatores são fortemente
correlacionados (ρ = 0,60): projetos antigos acumulam contribuidores. Para
separar os efeitos, calculamos a correlação parcial de Spearman de cada fator
com as métricas, controlando o outro (análise exploratória, fora das famílias
de Holm). A Tabela W mostra o resultado.

**Tabela W — ρ de Spearman simples e parcial (n = 283 a 300).**

| Métrica | Contribuidores: simples → parcial | Idade: simples → parcial |
|---|---|---|
| Frequência | 0,07 → **0,34** | −0,31 → **−0,44** |
| Lead time (a) | 0,42 → 0,07 (p = 0,21) | 0,61 → **0,50** |
| CFR (a) | 0,05 → **0,15** | −0,12 → **−0,19** |
| Tempo de recuperação | 0,02 → −0,11 (p = 0,07) | 0,17 → **0,20** |
| Pontuação DORA | −0,19 → 0,07 (p = 0,26) | −0,40 → **−0,36** |

Em negrito, os parciais com p < 0,01. Mantida a idade constante, o lead time
maior dos repositórios com muitos contribuidores **desaparece** (ρ parcial de
0,07): ele era um efeito da idade. Ao contrário, aparece uma associação
**positiva e moderada** entre contribuidores e frequência (ρ parcial de 0,34),
que a idade escondia, porque os projetos com mais contribuidores tendem a ser
os mais antigos, que publicam menos. O efeito da idade se mantém em todas as
métricas depois do controle.

## 4. Discussão

### 4.5 H5 — velocidade e estabilidade

**H5 (a): confirmada quanto à magnitude.** Esperávamos |ρ| < 0,3, e o ρ ficou
em 0,16. A correlação é positiva e significativa, mas pequena: no quartil mais
frequente, o CFR (a) mediano sobe de cerca de 4% para 7%, e a categoria
continua Elite. Portanto, não há *trade-off* relevante entre frequência de
release e quebra da CI. A correlação negativa com o tempo de recuperação
(ρ = −0,20) vai no sentido da afirmação do DORA de que velocidade e
estabilidade andam juntas: quem publica mais também conserta mais rápido. Uma
explicação plausível para o leve aumento do CFR (a) é o volume. Repositórios
que publicam mais também fazem mais *pushes* no default branch, e com mais
mudanças concorrentes há mais chance de duas delas, corretas isoladamente,
quebrarem a CI juntas, o mesmo mecanismo que propusemos para os contribuidores
na H6.

**H5 (b): confirmada no sentido e superada na intensidade, mas como artefato
da métrica.** Esperávamos uma correlação positiva de fraca a moderada, e ela
foi forte (0,52). A decomposição sustenta a justificativa da hipótese de que a
correlação é produzida pela definição da métrica. Toda a associação passa pela
oportunidade (ρ = 0,74), isto é, pela chance de a release seguinte sair em até
7 dias. A condicional, a única parte que mede se as releases precisaram de
correção, não tem relação com a frequência (ρ = −0,04, com IC de 95% que
exclui qualquer efeito acima de |0,17|). Em outras palavras, o CFR (b) com uma
janela fixa de 7 dias pune quem publica com frequência simplesmente por
publicar com frequência. Duas consequências práticas:

1. o CFR (b) não deve ser comparado entre repositórios com cadências muito
   diferentes sem alguma normalização. Duas opções são usar a taxa condicional
   ou uma janela de correção proporcional ao intervalo típico entre releases;
2. a discordância entre o CFR (a) e o CFR (b) na RQ 03, e a mudança de
   categoria entre as combinações na RQ 07, devem ser lidas à luz desse viés,
   que é sistemático e não aleatório.

### 4.6 H6 — características do repositório

| Expectativa da H6 | Resultado |
|---|---|
| Mais contribuidores → maior frequência | não confirmada no contraste Q4 × Q1 (δ = 0,12); **confirmada controlando a idade** (ρ parcial de 0,34) |
| Mais contribuidores → menor lead time | **contrariada** no contraste (Q4 com lead time maior, δ = 0,65); a diferença some controlando a idade (ρ parcial de 0,07) |
| Mais contribuidores → CFR (a) maior | não confirmada no contraste (δ = 0,08); fraca controlando a idade (ρ parcial de 0,15) |
| Repositórios mais antigos → menor frequência | **confirmada** (δ = −0,49, grande) |
| JS/TS, Go e Rust à frente de C/C++ em frequência | não confirmada: as medianas vão no sentido esperado, mas nenhum contraste é significativo depois de Holm |
| Efeitos pequenos a médios; parte some com Holm | **parcialmente**: a idade tem efeitos grandes; os demais fatores, efeitos desprezíveis a médios, e 5 testes com p < 0,05 deixaram de ser significativos depois da correção |

A **idade** é o fator dominante, e com efeitos maiores do que esperávamos. Há
pelo menos três explicações que não se excluem:

1. **maturidade**: como previmos, projetos maduros estabilizam a API e
   publicam com menos frequência e em lotes maiores;
2. **efeito de coorte**: os repositórios mais novos da amostra (48 dos 300
   foram criados durante a própria janela) são em grande parte projetos da
   onda recente de ferramentas de IA, com cadência de publicação contínua
   desde o início. Não é possível separar esse efeito da idade com dados de
   uma única janela;
3. **construção do lead time (a)**: ele é medido a partir do commit mais
   antigo de cada release. Num repositório novo, esse commit não pode ser
   mais antigo que o próprio repositório, o que limita o lead time pelo
   tamanho do histórico. O efeito grande da idade no lead time (ε² = 0,36) é,
   em parte, uma consequência da definição da métrica, assim como o CFR (b) na
   RQ 05.

O resultado dos **contribuidores** mostra por que uma análise de um fator por
vez pode enganar. O contraste simples contraria a H6 (mais contribuidores,
lead time maior). Controlando a idade, esse efeito desaparece e surge o
previsto: mais contribuidores, mais deploys. O mecanismo que propusemos, de
que mais gente gera mais mudanças para publicar, aparece só quando se compara
projetos de mesma idade. O ρ parcial de 0,15 com o CFR (a) também vai no
sentido previsto (mais mudanças concorrentes, mais quebras), mas é fraco.

Quanto à **linguagem**, as medianas de frequência seguem a ordem que
prevíamos (TypeScript 0,84; Python 0,67; Go e Rust 0,46; JavaScript 0,38;
C/C++ 0,26 releases por semana), mas a variação dentro de cada linguagem é
grande, e o grupo C/C++ tem só 20 repositórios. Com esse tamanho, só um efeito
grande seria detectado depois da correção. O efeito de TypeScript × C/C++
(δ = 0,35, médio) é o tipo de diferença que uma amostra maior provavelmente
confirmaria, mas não podemos afirmá-la com estes dados. A única diferença
significativa entre linguagens está no lead time (C/C++ com mediana de 74
dias), o que é coerente com projetos de sistemas que publicam versões grandes
e espaçadas. A **popularidade** (estrelas) não tem relação com nenhuma
métrica. Num conjunto que já é o topo do GitHub, ter mais estrelas não indica
um processo de entrega diferente.

⟨Tipo do projeto: resultado e leitura, quando o consenso estiver disponível.⟩

### Ameaças à validade específicas destas RQs (para a Seção 5)

- **Construto, CFR (b).** O viés de oportunidade descrito na H5 (b). Além
  disso, 5.928 dos 20.802 deploys da janela (28,5%) ficaram *indeterminados*,
  ou seja, tiveram a seguinte em até 7 dias mas sem previsão da heurística, e
  saíram do denominador. Eles se concentram em poucos repositórios (a
  mediana por repositório é 0) e podem enviesar o CFR (b) desses
  repositórios.
- **Construto, lead time (a).** O lead time é limitado pela idade do
  repositório (ver H6), o que infla o efeito da idade.
- **Conclusão.** Os testes são de associação, não de causa. O fator idade
  provavelmente mistura maturidade e coorte. A correção de Holm controla o
  erro por família, mas os contrastes do grupo C/C++ (n = 20) têm pouco poder.
  A análise parcial é exploratória e só controla uma variável por vez.
- **Externa.** A amostra é de 300 repositórios populares (mais de 1.000
  estrelas, Actions ativo, ≥ 5 releases e ≥ 50 runs). Os efeitos podem ser
  diferentes em projetos menos populares ou fora do GitHub.

### Referências adicionais

- Bonett, D. G.; Wright, T. A. Sample size requirements for estimating
  Pearson, Kendall and Spearman correlations. *Psychometrika*, 65(1), 2000.
- Holm, S. A simple sequentially rejective multiple test procedure.
  *Scandinavian Journal of Statistics*, 6(2), 1979.
- Romano, J. et al. Appropriate statistics for ordinal level data: should we
  really be using t-test and Cohen's d for evaluating group differences on the
  NSSE and other surveys? *Annual Meeting of the Florida Association of
  Institutional Research*, 2006.
- Tomczak, M.; Tomczak, E. The need to report effect size estimates
  revisited. *Trends in Sport Sciences*, 21(1), 2014.
