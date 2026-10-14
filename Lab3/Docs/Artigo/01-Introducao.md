# Mineração de métricas DORA em repositórios open-source populares

## 1. Introdução

> Seção entregue na Sprint 01 (Lab03S01). As hipóteses abaixo foram
> registradas **antes** da coleta das métricas: o commit que versiona este
> arquivo é anterior aos arquivos `releases.csv`, `lead_time.csv` e
> `dora_runs.csv` gerados pelo pipeline. Elas não serão reescritas depois; a
> comparação entre hipótese e resultado é feita na seção de Discussão.

### 1.1 Contexto

Medir o desempenho de entrega de software é um problema antigo da engenharia
de software. Na última década, as métricas propostas pelo programa DORA
(*DevOps Research and Assessment*), popularizadas por Forsgren, Humble e Kim
[Forsgren et al. 2018] e atualizadas anualmente nos relatórios *Accelerate
State of DevOps* [DORA], tornaram-se a referência de mercado para isso. São
quatro métricas, em duas dimensões:

- **velocidade**: *deployment frequency* (com que frequência mudanças chegam à
  produção) e *lead time for changes* (quanto tempo uma mudança leva do commit
  até a produção);
- **estabilidade**: *change failure rate* (que proporção das entregas causa
  falha) e *tempo de recuperação* (quanto tempo se leva para se recuperar de uma
  entrega que falhou).

Essas métricas foram concebidas para equipes que operam um serviço em
produção e, nos relatórios DORA, são obtidas majoritariamente por
**questionário**. Em projetos open-source não existe "produção" observável:
o que se vê publicamente são *releases*, *commits* e execuções de integração
contínua. Qualquer tentativa de medir DORA a partir desses dados depende,
portanto, de **proxies** — "release publicada" no lugar de "deploy",
"execução de CI com falha" no lugar de "falha em produção".

Proxies podem enganar. Uma biblioteca que publica uma release por mês não
coloca nada em produção; quem faz isso são os seus usuários. Um teste
instável que falha na CI não é uma falha percebida por ninguém. Por isso,
além de calcular as métricas, este estudo pergunta **o quanto se pode confiar
nelas**: o quanto as conclusões mudam quando a definição operacional muda.

### 1.2 Objetivo

O objetivo deste estudo é **caracterizar o desempenho de entrega de
repositórios open-source populares que usam GitHub Actions, segundo as
métricas DORA, e avaliar a sensibilidade dessa caracterização às definições
operacionais adotadas**.

Para isso, o grupo construiu um pipeline reprodutível que seleciona
repositórios com mais de 1.000 estrelas, filtra os que usam GitHub Actions e
têm atividade mínima (pelo menos 5 releases e 50 workflow runs válidos no
*default branch*), e calcula as métricas sobre uma janela de observação de 12
meses (**01/10/2025 a 30/09/2026**), usando exclusivamente a API REST do
GitHub. As definições operacionais seguem as regras comuns da disciplina, o
que torna os resultados comparáveis entre grupos e replicáveis por outro
grupo na entrega final.

### 1.3 Questões de pesquisa e hipóteses informais

Para cada questão de pesquisa (RQ) registramos o que **esperamos** encontrar e
por quê. As hipóteses são informais: servem para tornar explícitas as nossas
expectativas e permitir, ao fim do estudo, discutir o que nos surpreendeu.
Todas as métricas serão descritas por **mediana e IQR**, e as faixas de
desempenho seguem a tabela de referência da disciplina (Elite / High /
Medium / Low).

---

**RQ 01. Qual a frequência de deploys dos repositórios populares que usam CI/CD?**

*Hipótese H1.* A mediana da amostra ficará na faixa **Medium** (pelo menos uma
release por mês e menos de uma por semana), em torno de **0,2 a 0,5 releases
por semana**. Poucos repositórios (menos de 10%) atingirão a faixa Elite
(≥ 7 por semana), e a distribuição será fortemente assimétrica à direita.

*Justificativa.* O critério de inclusão já exige 5 releases em 52 semanas
(≈ 0,1 por semana), o que elimina os projetos mais lentos e empurra a mediana
para cima do piso. Por outro lado, projetos open-source mantidos por
voluntários costumam agrupar mudanças em releases periódicas, e não publicar
a cada merge. A cauda direita deve vir de projetos com publicação automatizada
(*release bots*, *nightly* promovidas a release) e de monorepos que publicam
vários pacotes com releases separadas.

---

**RQ 02. Qual o tempo entre um commit e seu respectivo deploy?**

*Hipótese H2.* O lead time medido **por release** (variante a) será
sistematicamente **maior** que o medido **por commit** (variante b). Esperamos a
mediana da variante (a) na ordem de **algumas semanas** (faixa Medium ou Low,
≥ 7 dias) e a da variante (b) na ordem de **uma a duas semanas** (faixa
Medium). Também esperamos uma parcela pequena, mas não nula, de commits com
lead time negativo.

*Justificativa.* Uma release reúne os commits acumulados desde a anterior, e
a variante (a) é dominada pelo commit mais antigo: um único commit "esquecido"
em um branch faz o valor da release crescer muito. A variante (b) dilui esse
efeito entre todos os commits, a maioria escrita perto da data da release.
O lead time negativo é esperado porque *rebase* e *squash merge* reescrevem
`commit.author.date`, um problema já previsto como ameaça à validade de
construto.

---

**RQ 03. Qual a taxa de falha das mudanças entregues por esses repositórios?**

*Hipótese H3.* Na variante **(a), proxy de CI**, a mediana ficará entre **10% e
20%** (faixas Elite ou High). Na variante **(b), proxy de entrega**, a mediana
ficará entre **10% e 25%**, com dispersão maior que a da variante (a).

*Justificativa.* Em projetos populares, a maior parte das mudanças passa por
*pull request* e é testada antes do merge, de modo que o CI do default branch
tende a falhar pouco; as falhas restantes devem vir de testes instáveis,
problemas de infraestrutura e interações entre mudanças mergeadas em
sequência. Já a variante (b) depende da cultura de versionamento: projetos que
seguem Versionamento Semântico publicam *patches* com frequência, e alguns
deles serão contados como "corretivos" mesmo quando não corrigem um defeito
da release anterior, o que aumenta a variação entre repositórios.

---

**RQ 04. Qual o tempo de recuperação após uma execução de CI/CD com falha?**

*Hipótese H4.* A mediana do tempo de recuperação ficará entre **algumas horas e
um dia** (faixa High), e não na faixa Elite (< 1 hora). Esperamos que a maioria
dos repositórios tenha uma proporção de episódios censurados **abaixo de 10%**.

*Justificativa.* Uma falha no default branch de um projeto popular é visível
para todos os mantenedores e bloqueia o trabalho seguinte, o que pressiona por
uma correção rápida. Ainda assim, não há plantão em projetos voluntários, e os
mantenedores estão em fusos horários diferentes: uma falha no fim do dia de
quem a causou tende a esperar até o dia seguinte. A censura deve ser rara,
porque projetos ativos voltam ao verde antes do fim da janela, mas não nula,
por causa de workflows abandonados que continuam falhando.

---

**RQ 05. Repositórios com maior frequência de deploy apresentam maior ou menor taxa de falha?**

*Hipótese H5.* Para a variante **(a)** do CFR, esperamos uma correlação de
Spearman **fraca ou nula** (|ρ| < 0,3), compatível com a afirmação do DORA de
que velocidade e estabilidade não são um *trade-off*. Para a variante **(b)**,
esperamos uma correlação **positiva fraca a moderada**.

*Justificativa.* No proxy de CI, a frequência de releases e a taxa de falha da
CI são medidas sobre objetos diferentes (releases e execuções de workflow), e
não vemos um mecanismo forte que as ligue. No proxy de entrega, porém, a
própria definição cria um viés: quem publica com mais frequência tem mais
chance de que a release seguinte saia em até 7 dias e seja apenas um *patch*,
o que a heurística conta como falha. Uma correlação positiva na variante (b)
pode, portanto, ser um artefato da métrica, e não uma evidência contra o DORA.

---

**RQ 06. Quais características dos repositórios estão associadas a um melhor desempenho DORA?**

*Hipótese H6.* Prevemos analisar ao menos **linguagem principal**, **número de
contribuidores** e **idade do repositório** (por quartis). Esperamos que:

- repositórios com **mais contribuidores** tenham **maior frequência de deploy**
  e **menor lead time**, mas **CFR (a) maior**;
- repositórios **mais antigos** tenham frequência de deploy **menor** que os mais
  novos;
- haja diferença entre linguagens, com ecossistemas de publicação automatizada
  (JavaScript/TypeScript, Go, Rust) à frente de C/C++ em frequência de deploy.

Esperamos que a maioria dessas diferenças tenha **tamanho de efeito pequeno a
médio** e que parte delas deixe de ser significativa após a correção de Holm.

*Justificativa.* Mais contribuidores significam mais mudanças concorrentes:
há mais o que publicar (maior frequência, menor espera), mas também mais
chances de duas mudanças corretas isoladamente quebrarem a CI juntas.
Projetos maduros tendem a estabilizar a API e publicar com menos frequência.
A linguagem importa pelas ferramentas de publicação do ecossistema
(npm, crates.io e módulos Go favorecem releases pequenas e frequentes).
Esperamos efeitos modestos porque cada fator explica apenas uma parte de um
fenômeno com muitas causas.

---

**RQ 07. O quanto a classificação DORA de um repositório depende da definição operacional escolhida?**

*Hipótese H7.* Esperamos que **pelo menos 30%** dos repositórios mudem de
categoria DORA entre a combinação de referência (C1) e cada uma das
alternativas (C2, C3), com **kappa ponderado moderado** (entre 0,41 e 0,60). Ou
seja: a ordem relativa dos repositórios deve se manter razoavelmente estável,
mas a categoria absoluta, não.

*Justificativa.* As faixas DORA têm cortes fixos (1 dia, 1 semana, 30 dias),
e as variantes deslocam os valores para os dois lados desses cortes: incluir
pré-releases aumenta a frequência de deploy; trocar o lead time por release
pelo por commit o reduz (H2); e o CFR de entrega se comporta de forma
diferente do CFR de CI (H3). Repositórios próximos de um corte mudam de
categoria com pouco. Como as mudanças tendem a ir na mesma direção para todos
os repositórios, esperamos que o ranking se preserve melhor que a categoria.

---

### 1.4 Contribuições e organização do artigo

O estudo contribui com (i) uma caracterização das métricas DORA em
repositórios open-source populares, obtida por mineração e não por
questionário; (ii) uma avaliação de quanto essa caracterização depende das
definições operacionais; e (iii) um pipeline reprodutível, com cache, testes
automatizados e dicionário de dados, que outro grupo poderá executar a partir
do README.

O restante do artigo está organizado assim: a Seção 2 descreve a metodologia
(fonte de dados, funil de seleção, janela, definições operacionais e
protocolo de validação manual); a Seção 3 apresenta os resultados por RQ; a
Seção 4 discute as hipóteses frente aos resultados; a Seção 5 trata das
ameaças à validade; e a Seção 6 relata a replicação cruzada.

### Referências

- Forsgren, N.; Humble, J.; Kim, G. *Accelerate: The Science of Lean Software
  and DevOps*. IT Revolution, 2018.
- DORA. *Accelerate State of DevOps Reports* e *DORA's software delivery
  metrics: the four keys*. Disponível em <https://dora.dev/>.
- Wohlin, C. et al. *Experimentation in Software Engineering*. Springer, 2012.
