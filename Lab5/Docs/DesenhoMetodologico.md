# Lab05 — Sprint 01 · Participante B: Desenho Metodológico

**Objeto de estudo:** serviço público de resolução DNS **1.1.1.1**, da Cloudflare
(escolha e evidências em [`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md),
seções 1 a 5, de responsabilidade do Participante A).

**O que este documento é.** A parte do **Participante B**: caminho de pesquisa,
classificação nas sete categorias, hipóteses, variáveis, desenho experimental e
metodologia de coleta. Ele **valida, corrige ou substitui** os rascunhos que o
Participante A escreveu para essas seções, conforme a tabela de
responsabilidade do documento dele. Onde este documento diverge do rascunho de
A, **vale este**, e a divergência está registrada na seção 1.

**Data:** 18/11/2026. **Versão:** 1.

> **Convenção.** **[Fato]** = comprovado por fonte citada ou por medição do
> grupo. **[Decisão B]** = escolha de desenho que B fecha neste documento.
> **[Pendente]** = depende de C, do grupo ou de material da disciplina.

---

## 1. O que este documento fecha

| # | Item | Situação no rascunho de A | O que B decide |
| --- | --- | --- | --- |
| 1 | **Caminho de pesquisa** | A seção 6.2 listava as nove *etapas* do trabalho, mas não dizia **qual caminho** da seção 2b do enunciado o estudo segue | Caminho nomeado e justificado (seção 2), com um caminho principal e dois secundários |
| 2 | **Responsáveis pelas etapas 5–9 (D9)** | Pendente | Proposta fechada na seção 2.2 |
| 3 | **Sete categorias (D10)** | Provisória, sem o material da Aula 8 | B assume a classificação, toma posição nos dois pontos em que A ficou em cima do muro e mantém a regra de ajuste (seção 3) |
| 4 | **Hipóteses** | Expectativas em prosa (H-a, H-b, H-c) na seção 6.1 e testes na 10.3 | H₀/H₁ formais, com unidade de inferência, família e direção (seção 4) |
| 5 | **Direção dos testes** | "Wilcoxon pareado bilateral" sem justificativa | Bilateral, com a justificativa e o contraste explícito com o Lab04 (seção 4.3) |
| 6 | **Variáveis** | Tabela da seção 9.1 | Mantida, acrescida de **escala de medida** e das **estatísticas permitidas** por variável (seção 5.2) e da classificação **entidade/atributo** (seção 5.3) |
| 7 | **Nomes por rodada (D3)** | Proposta: 80 | Confirmado: 80 (seção 6.5) |
| 8 | **Intervalo entre rodadas (D4)** | Proposta: 30 min | Confirmado: 30 min, com a justificativa de que o intervalo **não** é o que determina o poder do estudo (seção 6.4) |
| 9 | **Duração da coleta (D5)** | Proposta: 7 dias | 7 dias como mínimo; **10 dias recomendados**, com o motivo quantificado (seção 6.4) |
| 10 | **Ritmo das consultas** | "cerca de 340 consultas por rodada, que levam bem menos de um minuto" | **Corrigido:** esse ritmo violaria o limite de 1 requisição por segundo exigido pelo enunciado. A rodada passa a ser cadenciada (seção 7.2) |
| 11 | **Ameaças à validade** | Tabela da seção 10.7 | Consolidada e acrescida das ameaças criadas pelas decisões deste documento (seção 9) |
| 12 | **Armadilhas de medição** | Ausente | Goodhart, Campbell e McNamara aplicados ao estudo (seção 8) |

---

## 2. Caminho de pesquisa

### 2.1 Qual caminho do enunciado

O enunciado (seção 2b) lista seis caminhos e permite combiná-los. O estudo usa
três, com pesos diferentes. **[Decisão B]**

| Caminho | Peso | Como aparece aqui |
| --- | --- | --- |
| **Medir o serviço de fora** | **Principal** | O grupo consulta o 1.1.1.1, o 8.8.8.8 e o resolvedor da rede exatamente como qualquer usuário faz, de redes de acesso comuns, sem acesso privilegiado e sem carga. Toda a medição primária do estudo vem daqui |
| **Avaliar a qualidade do produto** | Secundário | As duas dimensões medidas são características da ISO/IEC 25010 [R44]: **eficiência de desempenho → comportamento temporal** (latência de resolução) e **confiabilidade → maturidade** (taxa de falhas e estabilidade). Isso dá nome de norma ao que o GQM de A chamou de desempenho e confiabilidade |
| **Analisar dados de operação** | Apoio | O relatório do incidente de 14/07/2025 [R6] e a série diária do APNIC [R8][R9] entram como **evidência de contexto** (impacto e operação), não como dado do estudo. Nenhuma conclusão depende deles |

**Por que não os outros três.** "Rodar o software no ambiente do grupo" é
impossível: o 1.1.1.1 é um serviço operado pela Cloudflare, não um pacote que
se instala. "Estudar com pessoas" e "Ouvir quem usa ou mantém" responderiam a
outra pergunta (percepção), e a pergunta do grupo é sobre tempo medido, não
sobre opinião.

**Nota sobre a combinação.** O enunciado diz que estudos que combinam caminhos
"tendem a gerar evidência mais forte". Aqui a combinação é honesta e não
inflada: a medição de fora produz os dados, a ISO/IEC 25010 dá o vocabulário de
qualidade, e os dados de operação situam o impacto. O grupo **não** afirma ter
feito um estudo observacional de dados de operação.

### 2.2 Etapas e responsáveis (D9)

| Etapa | Atividade | Produto | Sprint | Responsável proposto |
| --- | --- | --- | --- | --- |
| 1 | Escolha do software e evidências | Seções 1–5 de A | S01 ✔ | A |
| 2 | Pergunta de pesquisa e GQM | Seções 6–7 de A | S01 ✔ | A |
| 3 | Pilotos de viabilidade | Seção 7.2 e `Sprint01/piloto/` | S01 ✔ | A, com C |
| 4 | Caminho, categorias, hipóteses, variáveis, desenho e plano de coleta | **Este documento** | S01 ✔ | **B** |
| 5 | Validação de cada rede de coleta (9.5 de A) | Ficha por rede | S02 | **B** executa, C instrumenta |
| 6 | Seleção e congelamento dos domínios; zona de teste | Lista versionada | S02 | **B** (amostra) e **C** (zona) |
| 7 | Coleta contínua | Registros brutos | S02 | **C** opera; A e B rodam a coleta nas suas redes |
| 8 | Limpeza, descritiva e inferência | Tabelas, gráficos e testes | S02–S03 | **C**, com revisão de B |
| 9 | Impacto, ameaças à validade e relatório | Documento final | S03 | **A** (impacto), **B** (ameaças), **C** (resultados) |

A etapa 5 fica com B porque é validação de **desenho** (a rede serve ou não
serve para o experimento), e não instrumentação. **[Decisão B]**, a confirmar
com A e C.

---

## 3. Classificação nas sete categorias

> **[Pendente]** O material da Aula 8 não está no repositório nem foi
> localizado pelo grupo. Os **nomes** das sete categorias são os informados
> pelo grupo; os **níveis** vêm de Prodanov e Freitas [R39], Wohlin et al.
> [R18] e Kitchenham [R38]. Se a Aula 8 usar outra escala, vale a da
> disciplina, e a regra de ajuste está no fim desta seção.

| # | Categoria | Classificação **[Decisão B]** | Justificativa |
| --- | --- | --- | --- |
| 1 | **Natureza** | **Aplicada** | O resultado alimenta uma decisão concreta — qual resolvedor e qual protocolo configurar numa rede. Não há pretensão de avançar teoria sobre DNS [R39] |
| 2 | **Objetivos** | **Explicativa**, com etapa descritiva | Testa se os fatores manipulados (resolvedor, protocolo, estado da conexão, condição de cache) produzem diferença de latência e de falhas. A etapa descritiva caracteriza as distribuições. O estudo **não** explica o mecanismo interno dos resolvedores: o ECS, por exemplo, fica como hipótese não testada |
| 3 | **Abordagem** | **Quantitativa** | Todas as variáveis dependentes são numéricas (ms e proporções) e a análise é estatística. Não há coleta de percepção |
| 4 | **Procedimentos** | **Experimental**, apoiada em pesquisa documental | Há manipulação deliberada dos fatores e aleatorização da ordem de aplicação. As evidências dos critérios do enunciado (seções 3–5 de A) vêm de documentos oficiais [R39] |
| 5 | **Temporalidade** | **Longitudinal de curta duração** (medidas repetidas) | As mesmas redes e os mesmos nomes são medidos em centenas de rodadas ao longo de 7 a 10 dias, e o tempo entra na análise como fator (faixa horária, M10). Uma rodada única seria transversal |
| 6 | **Controle das variáveis** | **Experimento controlado de campo, em blocos completos aleatorizados** | Todo bloco recebe **todos** os tratamentos, em ordem sorteada a cada rodada (desenho *within-subject*, [R49]). O ambiente é a internet real: o grupo controla o que envia, não a rota nem a carga |
| 7 | **Nível de evidência** | **Estudo comparativo com aleatorização interna, de alcance local** | Na hierarquia adaptada por Kitchenham [R38], a aleatorização e o pareamento colocam o estudo acima de um estudo de caso ou de uma comparação sem controle. A validade interna é boa; a externa é limitada às redes medidas, que são amostra de conveniência |

**Os dois pontos em que o rascunho de A ficou em cima do muro, e a posição de B:**

1. **Experimento ou quase-experimento?** A deixou as duas opções abertas.
   **B classifica como experimento.** O que define o experimento é a
   manipulação deliberada do fator com **alocação aleatória**; aqui a
   aleatorização existe e é a da **ordem dos tratamentos dentro de cada bloco**,
   que é a forma própria de um desenho de medidas repetidas — não existe "qual
   unidade recebe qual tratamento" a sortear, porque toda unidade recebe todos.
   O que **não** é aleatório é a seleção das redes, e isso é um problema de
   **validade externa**, não de classificação do controle. O relatório diz as
   duas coisas, separadamente.
2. **Longitudinal ou transversal?** Se a Aula 8 definir longitudinal como
   acompanhamento de meses ou anos, a classificação honesta vira **transversal
   com medidas repetidas**, e a justificativa muda para "7 a 10 dias de
   observação contínua, com o tempo como fator de análise". O dado não muda; o
   rótulo, sim.

**Regra de ajuste [Decisão B].** Quando a Aula 8 aparecer, B refaz apenas a
coluna "Classificação", mantendo as justificativas, e registra a alteração no
documento. Nenhuma decisão de desenho depende do rótulo.

---

## 4. Hipóteses

### 4.1 Expectativas registradas antes da coleta

Registradas agora, **antes** de qualquer dado definitivo, para que o relatório
final possa dizer o que foi confirmado e o que não foi — como no Lab04.

| ID | Expectativa | Base | O que os pilotos já sugerem |
| --- | --- | --- | --- |
| **P1** | Em Do53, o 1.1.1.1 tem mediana menor que o 8.8.8.8 | Alegação do fornecedor [R1] e proximidade do ponto de presença | Compatível, mas fraco: 21,0 ms contra 23,0 ms, n = 30, uma rede, um horário |
| **P2** | O resolvedor padrão da rede vence quando a resposta está em cache e perde quando é preciso resolver do zero | Encaminhador local está a um salto do cliente | Compatível na parte do cache: 7,0 ms. A parte "perde no C1" **não foi testada** por nenhum piloto |
| **P3** | Com conexão nova, DoT e DoH custam dezenas de ms a mais que o Do53; com conexão reaproveitada, poucos ms | Handshakes TCP e TLS [R24] | Fortemente compatível: 100–282 ms com conexão nova, 23–36 ms reaproveitada |
| **P4** | A cauda (p95) separa mais os resolvedores do que a mediana | Piloto 1: p95 de 126,4 ms no 8.8.8.8 contra 25,5 ms no 1.1.1.1 | Compatível, com n pequeno demais para afirmar |

Os pilotos **não** são resultado: n = 10 a 30, uma rede, um horário. Eles
entram aqui só para mostrar que as expectativas não são chutes.

### 4.2 Hipóteses formais

Notação: Δ é a **diferença pareada** dentro do bloco, sempre
`tratamento de interesse − comparador`. Cada hipótese é testada **por rede**,
separadamente (seção 6.1).

| ID | Família | H₀ | H₁ | Unidade de inferência | n esperado | Teste |
| --- | --- | --- | --- | --- | --- | --- |
| **H1** | **Primária** | A mediana de Δ = latência(1.1.1.1) − latência(8.8.8.8), em Do53 e cache natural (C3), é zero | ≠ 0 | nome (domínio) | 180 por rede | Wilcoxon pareado bilateral [R43] |
| **H2** | **Primária** | A mediana de Δ = latência(DoX reaproveitada) − latência(Do53), no mesmo resolvedor e em C2, é zero | ≠ 0 | janela de 6 h | 28 (7 dias) ou 40 (10 dias) | Wilcoxon pareado bilateral |
| **H3** | Secundária | As medianas dos três resolvedores em Do53 são iguais, dentro de cada condição de cache | ao menos uma difere | nome (C3) / janela (C1, C2) | 180 / 28 | Friedman [R35] |
| **H4** | Secundária | A mediana de Δ = latência(1.1.1.1) − latência(resolvedor padrão) é zero, por condição de cache | ≠ 0 | nome (C3) / janela (C1, C2) | 180 / 28 | Wilcoxon pareado bilateral |
| **H5** | Secundária | A mediana de Δ = latência(DoX **nova**) − latência(Do53) é zero | ≠ 0 | janela de 6 h | 28 ou 40 | Wilcoxon pareado bilateral |
| **H6** | Secundária | A taxa de falhas do 1.1.1.1 é igual à do comparador | ≠ | nome / janela | 180 / 28 | Wilcoxon pareado sobre as taxas por unidade; McNemar [R42] só como exploração |

**Por que H1 e H2 são as primárias.** São as duas perguntas que uma pessoa faz
antes de mexer na configuração: *"trocar de resolvedor me dá velocidade?"* e
*"cifrar o DNS me custa velocidade no uso normal?"*. "Uso normal" é a conexão
reaproveitada, porque é o que navegadores e sistemas operacionais fazem. A H5,
da conexão nova, é secundária justamente porque mede um custo que o usuário
paga poucas vezes por sessão — e porque os pilotos já indicam um efeito grande
demais para ser a parte interessante.

**Nível de significância.** α = 0,05 em todas. **[Decisão B]**

### 4.3 Por que bilateral aqui, se no Lab04 foi unilateral

No Lab04 o teste foi **unilateral** porque a direção estava garantida pelo
mecanismo: um cache de build pode economizar trabalho ou não economizar nada,
e não existe caminho pelo qual guardar resultados prontos deixe o build mais
lento. Aqui **não** existe essa garantia:

- o resolvedor mais próximo pode ser o mais lento, se for um encaminhador
  sobrecarregado;
- um resolvedor público pode vencer o local quando a resposta exige recursão;
- o DoH pode, em tese, ficar **abaixo** do Do53 numa rede que degrada UDP, e o
  piloto 2 mostrou o Do53 do 8.8.8.8 em 75,9 ms contra 26,9 ms do DoH
  reaproveitado numa das execuções.

Um teste unilateral que apontasse para o lado errado seria incapaz de relatar
o resultado mais interessante do estudo. **Todas as hipóteses são bilaterais.**
**[Decisão B]**

As expectativas P1–P4 continuam registradas, mas como **predições**, não como
direção do teste. É essa separação que permite ao relatório final dizer "a
expectativa foi contrariada" sem que isso vicie a análise.

### 4.4 Multiplicidade

O estudo compara 3 resolvedores × 3 condições de cache × 2 experimentos, em até
3 redes. Testar tudo com α = 0,05 produziria falsos positivos por construção —
é a mesma armadilha que o Lab04 mostrou na prática.

**[Decisão B]:**

1. A **família primária** tem duas hipóteses: H1 e H2. A correção de **Holm**
   [R36] é aplicada dentro dela.
2. As secundárias (H3–H6) formam uma segunda família, com Holm aplicado
   separadamente, e são relatadas como **secundárias** no texto, sem exceção.
3. Tudo o mais — faixa horária, mudança de ponto de presença, ECS, estratos de
   domínio — é **exploratório**: descrito com intervalo de confiança e sem
   p-valor com pretensão confirmatória.
4. Cada rede é analisada separadamente e **não** entra na contagem de
   comparações: três redes são três réplicas, e a pergunta é se a direção do
   efeito se repete, não se "pelo menos uma deu significativo".

### 4.5 O que não é hipótese

A **M6** (verificação do estado de cache) não testa hipótese nenhuma: é uma
**checagem de manipulação**, que responde "a condição C1 realmente produziu
ausência de cache?". Se ela falhar, a Q2 perde sentido e o relatório diz isso,
em vez de interpretar um resultado sobre uma condição que não foi produzida.

---

## 5. Variáveis

### 5.1 Quadro geral

| Papel | Variável | Níveis ou unidade |
| --- | --- | --- |
| **Independente (fator principal)** | Resolvedor | 1.1.1.1 · 8.8.8.8 · padrão da rede |
| **Independente** | Protocolo | Do53 · DoT · DoH (o padrão da rede, só Do53) |
| **Independente** | Estado da conexão (DoT e DoH) | nova · reaproveitada |
| **Independente** | Condição de cache | C1 ausência forçada · C2 cache quente · C3 natural |
| **Dependente** | Latência de resolução (M1) | ms |
| **Dependente** | Resultado da consulta (M8) | sucesso · timeout · SERVFAIL · REFUSED · erro de transporte |
| **Bloco** | Rede de coleta | uma por ponto de coleta (AS, cidade, cabo ou Wi-Fi) |
| **Bloco** | Rodada | carimbo de tempo UTC |
| **Bloco** | Posição consultada | domínio (C3), nome fixo da zona (C2), posição com nome único por resolvedor (C1) |
| **Covariável** | RTT de rede (M11) | ms |
| **Covariável** | Ponto de presença, TTL retornado, uso de TCP, versão TLS/HTTP | texto · s · booleano |
| **Controlada (mantida fixa)** | Tipo de consulta (A), classe (IN), EDNS0, só IPv4, timeout de 2 s, uma tentativa | — |

### 5.2 Escalas e estatísticas permitidas

A escala de medida determina quais operações fazem sentido [R47][R48]. A tabela
abaixo existe para impedir dois erros clássicos: calcular média de rótulo e
achar que mediana foi escolhida por imposição da escala.

| Variável | Escala | O que é permitido | O que não é |
| --- | --- | --- | --- |
| Latência (M1) | **Razão** (zero absoluto, ms) | Média, mediana, percentis, IQR, razões e diferenças percentuais ("40% mais lento" é uma frase válida) | — |
| Resultado da consulta | **Nominal** | Frequência, proporção, moda, McNemar | Média, mediana, "resultado médio" |
| Resolvedor, protocolo, ponto de presença | **Nominal** | Frequência; servem como fatores | Qualquer ordenação implícita |
| Estado da conexão | **Nominal binária** | Proporção | — |
| Condição de cache | **Nominal** (C1, C2, C3 são condições, não graus) | Fator de estratificação | Tratar como ordinal "frio → quente" |
| Faixa horária | **Ordinal cíclica** | Mediana por faixa, comparação entre faixas | Média aritmética de faixas |
| Taxa de falhas (M8) | **Razão** (proporção) | Proporção, IC de Wilson, bootstrap | — |
| Delta de Cliff (M4b) | **Ordinal por construção** | Comparação de dominância entre grupos | Lê-lo como "quantos ms de diferença" |
| RTT (M11), TTL | **Razão** | Mediana, diferença, razão | — |

**O ponto que importa.** A latência é de razão: a média **é** permitida. O
estudo usa mediana e p95 como estatísticas principais por causa da **forma** da
distribuição — assimétrica, com cauda longa, como o piloto 1 mostrou (p95 de
126,4 ms contra mediana de 23,0 ms no mesmo resolvedor) — e não porque a escala
proíba a média. A média aparece como complemento, sempre ao lado da mediana.
Confundir "a escala não permite" com "a forma desaconselha" é erro comum e
visível em banca. **[Decisão B]**

### 5.3 Entidades e atributos

| Entidade medida | Tipo | Atributo | Interno ou externo | Medida |
| --- | --- | --- | --- | --- |
| Serviço 1.1.1.1 em operação (e os comparadores) | **Produto** | Tempo de resposta a uma consulta | **Externo**: só existe na interação com o ambiente (rede, cache, rota) | **Direta** (M1, cronômetro no cliente) |
| O mesmo serviço | **Produto** | Confiabilidade sob uso | **Externo** | **Derivada** (M8, razão entre contagens; M9, IQR ÷ mediana) |
| Comparação entre dois resolvedores | **Produto** | Vantagem relativa | **Externo** | **Derivada** (M3, M5, M7, a partir de M1) |
| Rede de acesso do ponto de coleta | **Recurso** | Distância de rede até o resolvedor | **Externo** | **Direta** (M11) |

**Consequências disso, que o relatório precisa assumir:**

1. **Todos os atributos são externos.** Nenhum deles é propriedade só do
   software: cada medida é do par *software + ambiente*. Por isso a conclusão
   é sempre "nestas redes, nesta semana", e por isso a rede é bloco, e não
   ruído a ser ignorado.
2. **Nenhuma métrica é de processo.** O Lab03 mediu processo (DORA: lead time,
   frequência de deploy, falhas, recuperação). Aqui se mede **produto em
   operação**. A tentação de reaproveitar o vocabulário DORA — "taxa de falha"
   soa como *change failure rate* — precisa ser resistida: a taxa de falhas
   daqui é de **consultas**, não de mudanças. O relatório usa o nome completo,
   "taxa de falha de consulta", para não induzir a confusão. **[Decisão B]**
3. **Medidas derivadas herdam os defeitos das diretas.** Se M1 estiver
   contaminada por artefato do cliente (Nagle, TLS 1.2), toda a M3, M5 e M7
   carregam a contaminação. Daí a verificação obrigatória de ambiente antes de
   cada coleta (seção 9.4 de A).

---

## 6. Desenho experimental

### 6.1 Tipo de desenho

**Blocos completos aleatorizados, com medidas repetidas** [R49].

- **Bloco** = (rede, rodada, posição consultada). Dentro do bloco, a rede, o
  instante e o nome são os mesmos para todos os tratamentos.
- **Tratamentos** = os níveis dos fatores manipulados, aplicados **todos** a
  cada bloco, com poucos segundos de diferença.
- **Aleatorização** = a **ordem** de aplicação dos tratamentos é sorteada a
  cada rodada, com semente registrada.
- **Réplicas** = as rodadas (ao longo do tempo) e as redes (entre pontos de
  coleta).

**Por que bloco, e não dois grupos independentes.** A latência de rede varia de
minuto a minuto. Comparar o 1.1.1.1 às 10h com o 8.8.8.8 às 11h mediria a hora
do dia, não o resolvedor. O bloco elimina o efeito comum da rodada por
construção, que é a mesma razão pela qual o Lab04 usou um delineamento pareado.

**Por que cada rede é analisada em separado.** Com 3 redes não há como estimar
a variação **entre** redes; tratá-las como se fossem 3 observações de uma
população de redes seria pseudorreplicação. Cada rede é uma réplica
independente do mesmo experimento, e o resultado é considerado robusto quando
a **direção** do efeito se repete nas três. **[Decisão B]**

### 6.2 Os dois sub-experimentos

Mantidos como A propôs, por economia de combinações:

| | E-1 (H1, H3, H4, H6) | E-2 (H2, H5) |
| --- | --- | --- |
| Pergunta | O resolvedor faz diferença? | O DNS cifrado custa quanto? |
| Fatores | resolvedor (3) × condição de cache (3) | resolvedor (2) × {Do53, DoT nova, DoT reaproveitada, DoH nova, DoH reaproveitada} |
| Protocolo | só Do53 | os três |
| Cache | C1, C2 e C3 | só C2 (cache quente) |
| Por quê | isola o resolvedor | isola o transporte: com cache quente, o tempo de recursão não entra na conta |

Os dois compartilham as mesmas rodadas, o que permite usar o mesmo RTT e o
mesmo ponto de presença como covariáveis.

### 6.3 O que é sorteado e o que não é

| Elemento | Sorteado? | Observação |
| --- | --- | --- |
| Ordem dos tratamentos dentro da rodada | **Sim**, a cada rodada | Semente derivada de (rede, rodada) e registrada no arquivo |
| Domínios de C3 dentro de cada estrato | **Sim**, uma vez | Semente registrada; a lista é **congelada antes da coleta** e versionada |
| Subconjunto de C3 da rodada | Não: rodízio determinístico | 3 subconjuntos de 60 nomes, em rodízio, para que cada nome volte a cada 90 min |
| Nomes de C1 | Gerados na hora, únicos por resolvedor | Impede que um resolvedor aqueça o cache do outro |
| **Redes de coleta** | **Não** | Amostra de conveniência. É a principal limitação de validade externa, declarada como tal |
| Momento das rodadas | Não: grade fixa de 30 min | Cobre todas as faixas horárias por construção |

### 6.4 Tamanho de amostra e poder

Esta é a parte que o rascunho de A não quantificou, e é onde o **Lab04 é
reaproveitado**.

**O que determina o poder não é o número de consultas.** As consultas de um
mesmo nome, em rodadas diferentes, não são independentes. A análise agrega
primeiro por **unidade de inferência** (nome em C3, janela de 6 h em C1, C2 e
E-2) e só depois testa. Logo:

| Condição | Unidade | n por rede (7 dias) | n por rede (10 dias) |
| --- | --- | --- | --- |
| C3 (domínios reais) | nome | **180** | 180 |
| C1, C2 e E-2 | janela de 6 h | **28** | **40** |

**Consequência direta, e contraintuitiva:** diminuir o intervalo entre rodadas
de 30 para 15 minutos **dobra o volume de dados e não aumenta o n de nenhum
teste**. Ele melhora a precisão da mediana **dentro** de cada unidade e nada
mais. Quem aumenta o n é **estender os dias** (mais janelas) ou **ampliar a
lista de domínios** (mais nomes). Por isso D4 fica em 30 minutos e D5 ganha a
recomendação de 10 dias. **[Decisão B]**

**Quanto se consegue detectar.** O Lab04 mediu, por simulação, o efeito mínimo
detectável com 80% de poder no Wilcoxon pareado: **δ ≈ 0,48** com n = 30 pares
no cenário normal, e δ ≈ 0,36 com cauda pesada (`Lab4/docs/poder.md`). Usando a
aproximação de que o efeito detectável escala com 1/√n:

| Teste | Unidade | n | MDE₈₀ aproximado |
| --- | --- | --- | --- |
| H1 (resolvedor, C3) | nome | 180 | **δ ≈ 0,2** do desvio entre nomes |
| H2 e H5 (protocolo, C2) | janela | 28 | **δ ≈ 0,5** do desvio entre janelas |
| H2 e H5, com 10 dias | janela | 40 | **δ ≈ 0,4** |

Três ressalvas, para o número não ser usado além do que vale **[Decisão B]**:

1. É **aproximação**. O cálculo exato cabe a C, e pode ser feito com o
   `Lab4/src/poder.py`, trocando o gerador pela distribuição observada no
   piloto.
2. Os valores do Lab04 são de testes **unilaterais**; como aqui os testes são
   bilaterais, os MDE acima são **piso**, não teto.
3. δ está em unidades do **desvio entre unidades de inferência**, que só será
   conhecido depois da coleta. A tradução para milissegundos é um produto da
   S02.

**Isso é suficiente?** Para H2 provavelmente sobra: os pilotos mostram o custo
da conexão nova na casa das centenas de milissegundos e o da reaproveitada em
poucos milissegundos, efeitos muito acima de 0,5 desvio. Para **H1 em C1** (a
comparação mais incerta, com apenas 28 janelas) o estudo pode não ter poder
para diferenças moderadas — e, se for o caso, o relatório dirá "não detectamos"
e **não** "não existe". Essa distinção foi a lição mais direta do Lab04.

### 6.5 Decisões fechadas

| ID | Decisão **[Decisão B]** | Justificativa |
| --- | --- | --- |
| **D3** | **80 nomes por rodada** (60 de C3 + 10 de C1 + 10 de C2) | Com o rodízio de 3 subconjuntos, cada um dos 180 domínios é medido a cada 90 min e acumula ~112 observações em 7 dias — suficiente para uma mediana estável por nome |
| **D4** | **Rodada a cada 30 minutos** | 336 rodadas em 7 dias, cobrindo todas as faixas horárias; a rodada cadenciada leva ~2,5 min (seção 7.2), ocupando 8% do ciclo. Intervalos menores não aumentam o poder (6.4) |
| **D5** | **7 dias como mínimo; 10 dias recomendados** | 7 dias já cobrem dias úteis e fim de semana. Os 3 dias extras elevam as janelas de 28 para 40 e baixam o MDE de ~0,5 para ~0,4 desvio em C1, C2 e E-2. **Regra:** se o cronograma apertar, é melhor **7 dias completos e simultâneos nas três redes** do que 10 dias desencontrados |
| **D2** | **3 redes**, uma por integrante, medidas **no mesmo período** | Simultaneidade permite distinguir "efeito da rede" de "efeito do dia" |

---

## 7. Metodologia de coleta

Esta seção define **o que** a coleta faz e sob quais regras. **Como** fazer —
bibliotecas, versões, sockets — está na seção 9.4 do documento de A e é
responsabilidade de C.

### 7.1 Protocolo da rodada

A cada 30 minutos, em cada rede:

1. **Abertura.** Registrar carimbo de tempo UTC, identificador da rede,
   interface e versões do ambiente. Sortear a ordem dos tratamentos a partir da
   semente (rede, rodada) e registrar a semente.
2. **Contexto.** Medir o RTT de rede (M11) aos dois resolvedores públicos e
   consultar `id.server` no 1.1.1.1 para registrar o ponto de presença.
3. **Aquecimento de C2.** Consultar uma vez o nome fixo da zona do grupo e
   aguardar pelo menos 2 s antes da consulta medida, para que o TTL já tenha
   caído e a checagem M6 funcione.
4. **E-1.** Percorrer os 80 blocos da rodada na ordem sorteada. Em cada bloco,
   aplicar os 3 resolvedores em Do53, com poucos milissegundos entre eles.
5. **E-2.** Percorrer os 10 nomes de C2 nas 5 condições de protocolo, nos 2
   resolvedores públicos, na ordem sorteada.
6. **Fechamento.** Gravar um registro por consulta, com o esquema da seção 9.6
   de A, e fechar as conexões persistentes abertas na rodada.
7. **Uma vez por dia**, antes da primeira rodada, repetir a validação da rede
   (seção 9.5 de A) para detectar mudança de configuração ou interceptação.

### 7.2 Cadência: no máximo 1 consulta por segundo por serviço

**O problema.** O enunciado é explícito: ao medir serviços de fora, "use no
máximo 1 requisição por segundo". O rascunho de A previa "cerca de 340
consultas por rodada, que levam bem menos de um minuto" — o que daria mais de
2 consultas por segundo a **cada** resolvedor público. Isso descumpre a regra
de ética do laboratório. **Correção obrigatória. [Decisão B]**

**A solução, e por que ela não estraga o pareamento.** A regra é **por
serviço**. Dentro de um bloco de E-1, as 3 consultas vão para **3 serviços
diferentes** — cada um recebe uma só. Logo, basta espaçar os **blocos**, não as
consultas dentro do bloco:

| Trecho | Consultas por resolvedor | Cadência | Duração |
| --- | --- | --- | --- |
| E-1 | 80 (uma por bloco) | 1 bloco por segundo | ~80 s |
| E-2 | 50 por resolvedor (10 nomes × 5 condições) | 1 consulta por segundo por resolvedor, intercalando os dois | ~50 s |
| Contexto (M11, `id.server`) | ~2 | — | ~2 s |
| **Total** | **~132 por resolvedor** | — | **~2,5 min** |

- **Pico:** 1 consulta/s por serviço, exatamente no limite.
- **Média na rodada:** 132 ÷ 1.800 s ≈ **0,07 consulta/s** por resolvedor.
- **Volume:** ~44 mil consultas por resolvedor, por rede, em 7 dias — ou
  ~19 mil por dia a cada resolvedor público, somadas as três redes. Diante de
  1,9 trilhão de consultas diárias [R7], é da ordem de **10⁻⁸** do tráfego: uma
  consulta a cada cem milhões.
- **Custo para o pareamento:** dentro do bloco, os tratamentos continuam a
  milissegundos de distância, que é o que o pareamento exige. O que aumenta é a
  distância **entre blocos** — e blocos não são comparados entre si.
- **Em E-2**, as 5 condições do mesmo nome e resolvedor ficam a ~5 s umas das
  outras. Isso entra como ameaça à validade de conclusão (seção 9), mitigada
  pela ordem aleatória: nenhuma condição é sempre a primeira.

### 7.3 Regras de ética

| Regra do enunciado | Como o desenho cumpre |
| --- | --- |
| Nada de teste de carga ou estresse | O volume é o de um usuário atento, não o de um teste de carga; a cadência é limitada e a rodada ocupa 8% do ciclo |
| No máximo 1 requisição por segundo | Seção 7.2, por serviço, com pico no limite e média muito abaixo |
| Respeitar termos de uso | Os três serviços são resolvedores públicos, abertos a consultas de qualquer pessoa, que é exatamente o uso previsto |
| Não coletar dados pessoais | Nenhum participante humano. Não se registra IP público da rede nem a sub-rede ECS devolvida pelas sondas: ficam versionados apenas o AS e a cidade |
| Consentimento | Não se aplica: não há sujeitos humanos. O responsável por cada rede é o próprio integrante, que consente em medir a própria conexão |

Observação: as consultas de **C1 e C2** vão para o servidor autoritativo **do
próprio grupo**, então o custo da condição mais cara do experimento recai sobre
a infraestrutura do grupo, e não sobre terceiros.

### 7.4 Validade da rodada e exclusões

Critérios decididos **antes** de ver os dados, para que a limpeza não vire
escolha conveniente. **[Decisão B]**

| Situação | Decisão |
| --- | --- |
| Todos os tratamentos de todos os resolvedores falham na rodada | Rodada inválida: queda da rede local. Excluída do numerador e do denominador de M8, contada à parte |
| Um nome falha em **todos** os resolvedores | Falha do domínio, não do resolvedor. Excluída; o domínio é marcado e reavaliado ao fim |
| Falha em um resolvedor enquanto os outros respondem | Falha atribuível ao resolvedor. Conta em M8 |
| Bloco incompleto (um tratamento não executou por erro do script) | O **bloco inteiro** sai da análise pareada, e o motivo é registrado. Nunca se compara meio bloco |
| Rodada que atrasou mais de 5 min em relação à grade | Mantida, com marca de atraso; entra na análise de sensibilidade |
| Timeout | **Censurado em 2.000 ms.** As medianas usam só os sucessos; uma análise de sensibilidade inclui os timeouts como 2.000 ms |
| Mudança do ponto de presença no meio da rodada | Mantida, com `pop_id` registrado; entra na sensibilidade 3 |

**Regra geral:** nenhum dado é apagado. Tudo é marcado, e cada exclusão é
reproduzível a partir do arquivo bruto versionado.

### 7.5 O que não pode ser versionado

IP público de cada rede, sub-rede ECS devolvida pelas sondas de diagnóstico e
qualquer identificador de pessoa. O que vai para o repositório é AS, cidade,
tipo de conexão (cabo ou Wi-Fi) e um identificador opaco da rede
(`rede_id = R1, R2, R3`).

---

## 8. Armadilhas de medição

O enunciado (seção 3) pede explicitamente que a métrica escolhida seja
examinada à luz das armadilhas de medição. As três se aplicam a este estudo.

**Lei de Goodhart** — *quando uma medida vira meta, deixa de ser boa medida*
[R45]. A alegação que o estudo testa é "o resolvedor público mais rápido" [R1],
e a fonte dela é um ranking contínuo, o DNSPerf, que mede a partir de mais de
200 pontos de monitoramento conhecidos [R13]. Uma medida pública e usada como
argumento comercial é exatamente o tipo de medida que o operador tem incentivo
para otimizar — e otimizar **para o benchmark** não é o mesmo que otimizar para
o usuário numa rede doméstica brasileira. O desenho reage a isso em dois
pontos: mede de **redes de acesso comuns**, não de pontos de monitoramento, e
usa em C1 nomes de uma **zona do próprio grupo**, que nenhum resolvedor pode ter
pré-aquecido.

**Lei de Campbell** — *o indicador se corrompe quando passa a decidir* [R46].
O risco aqui é do **próprio grupo**: a lista de domínios decide o resultado de
C3, e seria fácil (mesmo sem má-fé) ajustar a amostra até o resultado ficar
"melhor". Por isso a lista é sorteada com semente registrada e **congelada e
versionada antes da coleta**, junto com o identificador permanente da Tranco.
Pelo mesmo motivo os critérios de exclusão (seção 7.4) estão fixados agora, e
não depois de ver os dados.

**Falácia de McNamara** — *tomar por inexistente o que não foi medido*. É a
armadilha mais perigosa deste estudo. Medir latência e taxa de falha **não**
mede: privacidade (o compromisso de não vender dados [R5] não é testável do
lado do cliente), resistência a censura, filtragem de conteúdo, concentração de
infraestrutura e risco sistêmico — este último, aliás, demonstrado pelo
incidente de 62 minutos de 14/07/2025 [R6]. Um resolvedor 3 ms mais rápido não
é "melhor" em nenhum sentido completo. **[Decisão B]** A recomendação final do
relatório será formulada como *"mais rápido nestas redes, nesta semana,
segundo estas métricas"*, com uma seção explícita listando o que não foi
medido. A escolha de usar **duas** dimensões (desempenho e confiabilidade), e
não só a latência, já é uma reação parcial a essa falácia.

---

## 9. Ameaças à validade

Quatro tipos, segundo Wohlin et al. [R18]. A tabela consolida as ameaças
levantadas por A e acrescenta as que **as decisões deste documento criaram**
(marcadas com ⚠).

| Tipo | Ameaça | Mitigação ou declaração |
| --- | --- | --- |
| **Conclusão** | Dependência residual entre janelas de 6 h vizinhas | Agregação por janela e bootstrap por conglomerado; risco residual declarado |
| **Conclusão** | Muitas comparações | Família primária com 2 hipóteses, Holm por família, resto exploratório (4.4) |
| **Conclusão** | Poder insuficiente em C1 (28 janelas) | Quantificado em 6.4; "não detectamos" nunca será escrito como "não existe" |
| **Conclusão** | Falhas raras demais para teste | Se a maioria das unidades tiver zero falhas nos dois resolvedores, só descrição com IC |
| **Conclusão** ⚠ | A cadência de 1 consulta/s afasta em ~5 s as condições de E-2 dentro do mesmo nome | Ordem aleatória por rodada; nenhuma condição é sistematicamente a primeira. Efeito residual declarado |
| **Interna** | Artefatos do cliente (TLS 1.2, Nagle, versões de biblioteca) | Verificação obrigatória na inicialização; versões fixadas e registradas em cada arquivo |
| **Interna** | Mudança de rota ou de ponto de presença durante a coleta | `pop_id` e M11 por rodada; análises de sensibilidade 2 e 3 |
| **Interna** | Aquecimento cruzado e autoaquecimento de cache | Nomes de C1 distintos por resolvedor; rodízio de subconjuntos em C3; sensibilidade 1 |
| **Interna** | Resolvedor padrão que encaminha, ou rede com interceptação da porta 53 | Validação diária e classificação da rede em (a), (b) ou (c), seção 9.5 de A |
| **Interna** ⚠ | A rodada leva ~2,5 min em vez de <1 min, então as condições da rodada mudam mais ao longo dela | Blocos continuam internamente simultâneos; a comparação nunca atravessa blocos |
| **Construto** | A latência medida inclui o processamento do cliente, maior no DoH (HTTP/2 em Python) | Mesma máquina e bibliotecas em todos os tratamentos; declarado como parte do custo medido do protocolo |
| **Construto** | O estado de cache de C3 é desconhecido | O controle está em C1 e C2; C3 representa uso cotidiano, sem afirmar estado de cache |
| **Construto** ⚠ | "Confiabilidade" medida como taxa de falha de consulta em 7 dias não captura indisponibilidade rara e grande, como a de 14/07/2025 | Declarado: a métrica mede o regime comum, não o evento raro. O incidente entra como contexto [R6], não como dado |
| **Construto** | "Mais rápido" não é "melhor" | Seção 8 (McNamara) e redação da recomendação final |
| **Externa** | Poucas redes, escolhidas por conveniência | Escopo restrito às redes do grupo; cada rede como réplica; AS e cidade declarados |
| **Externa** | DoH medido por URL com IP, enquanto navegadores usam nomes que apontam para outros endereços | Escolha deliberada, para manter o mesmo endereço anycast do Do53; diferença declarada |
| **Externa** | Só IPv4, só registros tipo A, uma máquina por rede | Limite de escopo declarado |
| **Externa** | Resultado de uma semana específica | Data registrada; replicação em outra época fica como trabalho futuro |

---

## 10. O que depende de C e do grupo

| # | Item | De quem | Impacto se não fechar |
| --- | --- | --- | --- |
| D1 | Domínio e zona sem DNSSEC, fora da Cloudflare e do Google | Grupo | **Alto.** Sem a zona, C1 e C2 saem do desenho; H2, H5 e metade da Q2 caem, e sobra só C3, com estado de cache desconhecido |
| D6 | Configuração dos protocolos (SNI, POST, `TCP_NODELAY`, HTTP/2) | C, com B | Médio: sem isso, o custo do DoT vira artefato do cliente (piloto 2) |
| D7 | Ambiente fixado (Python ≥ 3.10 com TLS 1.3, versões travadas) | C | Médio: ambientes diferentes entre integrantes tornam as redes incomparáveis |
| D8 | Implementação do plano de análise (bootstrap por conglomerado, Holm, tamanhos de efeito) | C, com B | Médio: as hipóteses da seção 4 já fixam teste e unidade; falta a execução |
| D11 | Verificações de fonte pendentes | A | Baixo: não afeta o desenho |
| D12 | Se o Lab05 exige artefato commitado por integrante em cada sprint | Grupo | Baixo, mas afeta a nota do Projects |
| — | Material da Aula 8 (D10) | B, quando houver | Baixo: só a coluna "Classificação" da seção 3 muda |

**Sobre D1.** É a única dependência que muda o estudo, e não só a execução. B
recomenda decidir isso **antes** do fim da S01: um domínio `.com` ou `.com.br`
em registrador neutro, com DNS autoritativo em provedor que não seja Cloudflare
nem Google e que ofereça log de consultas. Enquanto não houver decisão, o plano
alternativo da seção 9.3 de A continua válido, com a perda declarada.

---

## 11. Referências acrescentadas por B

As referências [R1]–[R43] estão em
[`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md), seção 12.

- **[R44]** INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. *ISO/IEC
  25010:2011 — Systems and software engineering — Systems and software Quality
  Requirements and Evaluation (SQuaRE) — System and software quality models*.
  Genebra: ISO, 2011. (Há revisão de 2023; conferir qual edição a disciplina
  adota **[Pendente]**.)
- **[R45]** GOODHART, Charles A. E. Problems of Monetary Management: The U.K.
  Experience. In: *Papers in Monetary Economics*. Sydney: Reserve Bank of
  Australia, 1975. A formulação hoje corrente — "when a measure becomes a
  target, it ceases to be a good measure" — é de STRATHERN, Marilyn.
  'Improving ratings': audit in the British University system. *European
  Review*, v. 5, n. 3, p. 305–321, 1997.
- **[R46]** CAMPBELL, Donald T. Assessing the impact of planned social change.
  *Evaluation and Program Planning*, v. 2, n. 1, p. 67–90, 1979.
- **[R47]** FENTON, Norman; BIEMAN, James. *Software Metrics: A Rigorous and
  Practical Approach*. 3. ed. Boca Raton: CRC Press, 2014.
- **[R48]** STEVENS, S. S. On the Theory of Scales of Measurement. *Science*,
  v. 103, n. 2684, p. 677–680, 1946.
- **[R49]** MONTGOMERY, Douglas C. *Design and Analysis of Experiments*. 8. ed.
  Hoboken: John Wiley & Sons, 2012.

> A falácia de McNamara é atribuída a Daniel Yankelovich (1972) e popularizada
> por Charles Handy. Como a disciplina a apresenta em aula, a referência exata
> será a do material do professor **[Pendente]**.

---

## 12. O que foi reaproveitado dos laboratórios anteriores

O enunciado (seção 4) sugere mostrar o que veio de antes e o que é novo. Do
lado do desenho metodológico:

| Origem | O que foi reaproveitado | Onde |
| --- | --- | --- |
| **Lab02** | Delineamento pareado com ordem alternada e aleatorizada, para que o efeito de ordem não se confunda com o do tratamento | Seção 6.1 |
| **Lab02** | Tamanho de efeito reportado junto do p-valor; `r = \|Z\| / √n` no Wilcoxon | Seção 4.2 e M4 |
| **Lab03** | A disciplina de separar métrica de **processo** de métrica de **produto**, que aqui vira uma advertência explícita contra reusar o vocabulário DORA | Seção 5.3 |
| **Lab04** | Escolha do teste a partir da forma da distribuição, e não por hábito: distribuição assimétrica com cauda longa → Wilcoxon e medianas | Seções 4.2 e 5.2 |
| **Lab04** | Efeito mínimo detectável como critério de dimensionamento, com os números de `Lab4/docs/poder.md` | Seção 6.4 |
| **Lab04** | Declarar hipóteses primárias antes da coleta e corrigir multiplicidade, em vez de testar tudo a α = 0,05 | Seção 4.4 |
| **Lab04** | Registrar a expectativa antes de medir, para o relatório poder dizer "foi contrariada" | Seção 4.1 |

**O que é novo neste laboratório:** o objeto não é um repositório nem um
processo de desenvolvimento, e sim um **serviço em operação**, medido de fora,
sob regra de ética de carga; e a estrutura de dependência entre observações
(mesmo nome, mesma rodada, mesma rede) exige escolher uma **unidade de
inferência**, que os laboratórios anteriores não exigiram.
