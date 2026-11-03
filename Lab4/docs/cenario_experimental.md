# Cenário Experimental — Build Cache do Gradle

**Lab04 — Testes de Hipótese por Dentro: Cenário, Simulação e Visualização**

**Par de testes escolhido (P2):** teste t pareado e teste de Wilcoxon pareado (postos sinalizados).

Este documento apresenta o cenário que será usado pelo grupo no experimento. A ideia é comparar o tempo de build de um projeto Java com o Build Cache do Gradle ativado e desativado. As definições abaixo servirão de base para a coleta dos dados, a simulação e a análise estatística. Caso alguma decisão precise ser alterada durante o desenvolvimento, ela deverá ser discutida e registrada antes da coleta.

---

## 1. Problema investigado

O tempo que um projeto leva para compilar pode influenciar bastante a rotina de desenvolvimento. Quando o build demora, o desenvolvedor também demora mais para conferir uma alteração, executar os testes e integrar o código.

Uma das ferramentas que pode ajudar a reduzir esse tempo é o **Build Cache do Gradle**. Ele guarda os resultados de tarefas que podem ser armazenadas em cache, como compilação e empacotamento. Quando essas tarefas são executadas novamente sem que suas entradas tenham mudado, o Gradle pode reaproveitar os resultados anteriores em vez de realizar todo o trabalho outra vez.

Neste experimento, vamos comparar duas situações: executar o build sem o Build Cache e executá-lo com o recurso ativado. Em ambas, será utilizado o comando `clean`, que remove o diretório `build/`. Mesmo depois dessa limpeza, o Gradle pode recuperar resultados do cache local quando o recurso está habilitado.

A expectativa é que o build com cache leve menos tempo. O objetivo é verificar se essa diferença aparece em um projeto Java open-source e se ela é significativa do ponto de vista estatístico.

> O projeto ainda será escolhido na etapa de coleta. Por isso, ele deverá atender aos critérios definidos na Seção 11.

## 2. Pergunta de pesquisa

**QP:** Ativar o Build Cache do Gradle reduz o tempo necessário para executar o build de um projeto Java?

## 3. Hipóteses

Para comparar as duas condições, vamos calcular a diferença entre os tempos de cada par de execuções:

```text
dᵢ = tempo_sem_cacheᵢ − tempo_com_cacheᵢ
```

Com essa definição, uma diferença positiva significa que o build com cache foi mais rápido. Já uma diferença negativa indica que a execução com cache demorou mais.

### 3.1 Hipóteses da pesquisa

- **H0 (hipótese nula):** ativar o Build Cache não reduz o tempo de execução do build.
- **H1 (hipótese alternativa):** ativar o Build Cache reduz o tempo de execução do build.

### 3.2 Hipóteses consideradas em cada teste

Embora os dois testes sejam aplicados às mesmas diferenças, eles não avaliam exatamente a mesma coisa. Por isso, a interpretação das hipóteses depende do teste utilizado.

| Teste | H0 | H1 |
|---|---|---|
| t pareado | μ_d ≤ 0 (a média das diferenças não é positiva) | μ_d > 0 (a média das diferenças é positiva) |
| Wilcoxon pareado | A distribuição das diferenças é simétrica em torno de 0 ou deslocada para valores negativos | A distribuição das diferenças apresenta deslocamento para valores positivos |

Nos dois casos, será utilizada a alternativa **“maior que”**, considerando `sem_cache − com_cache`. No SciPy, por exemplo, isso corresponde a `alternative='greater'`, com os tempos sem cache informados como primeiro argumento.

É importante manter essa ordem: se os argumentos forem invertidos sem alterar a alternativa, o teste passará a avaliar a direção contrária.

## 4. Por que escolhemos esses testes?

### 4.1 Por que os testes são pareados?

As duas medições de cada par serão feitas no mesmo projeto, no mesmo computador e com as mesmas configurações. A única diferença planejada entre elas será o estado do Build Cache.

Essa escolha é importante porque o tempo de build pode variar por vários motivos, como processos rodando em segundo plano, temperatura do computador e atividade do disco. Ao comparar duas execuções próximas e analisar a diferença entre elas, conseguimos reduzir parte da influência desses fatores.

Por isso, faz mais sentido utilizar testes pareados do que tratar as execuções com e sem cache como grupos independentes.

### 4.2 O que cada teste analisa?

**Teste t pareado**

O teste t pareado trabalha com a média das diferenças entre as duas condições. Ele verifica se essa média é suficientemente maior que zero, levando em conta a variação observada entre os pares.

Para sua aplicação, consideramos os seguintes pressupostos:

- As diferenças entre os pares devem ser independentes.
- As diferenças devem apresentar uma distribuição aproximadamente normal.
- A variável medida deve ser contínua e estar em uma escala de razão.

Vale destacar que a normalidade considerada aqui é a das **diferenças entre os tempos**, e não a dos tempos de cada condição separadamente.

Com aproximadamente 30 pares, o Teorema Central do Limite pode tornar o teste mais resistente a desvios moderados de normalidade. Mesmo assim, é preciso ter cuidado com distribuições muito assimétricas, caudas pesadas e valores extremos. Como estamos medindo tempo, esses casos podem aparecer e influenciar bastante a média.

**Teste de Wilcoxon pareado (postos sinalizados)**

O Wilcoxon também utiliza as diferenças entre os pares, mas faz isso de outra maneira. Em vez de trabalhar diretamente com os valores das diferenças, ele ordena seus valores absolutos, atribui postos e considera o sinal de cada diferença. Depois, compara a soma dos postos positivos com a dos negativos.

Entre os pressupostos do teste, estão:

- As diferenças entre os pares devem ser independentes.
- A variável deve ser contínua, de modo que empates e diferenças iguais a zero não sejam frequentes.
- Sob a hipótese nula, a distribuição das diferenças deve ser simétrica em torno de zero.

Um cuidado importante é não interpretar o Wilcoxon simplesmente como um teste de medianas em qualquer situação. Essa interpretação depende da simetria da distribuição das diferenças. Quando essa condição não é atendida, o teste está relacionado à pseudomediana, estimada pelo método de Hodges–Lehmann, e não necessariamente à mediana amostral.

Portanto, o Wilcoxon não é apenas uma versão do teste t que dispensa pressupostos. Os dois testes analisam aspectos diferentes dos dados, mesmo que sejam usados para investigar uma questão parecida.

### 4.3 Por que aplicar os dois testes?

A proposta do Lab04 é justamente observar como os testes se comportam diante de diferentes tipos de dados. Aplicar os dois ao mesmo conjunto de medições permite verificar em quais situações eles chegam a conclusões semelhantes e em quais podem apresentar resultados diferentes.

Em geral, o teste t pode ter mais poder quando as diferenças seguem uma distribuição próxima da normal. Já o Wilcoxon pode ser menos influenciado por valores extremos, dependendo das características dos dados.

Na análise, vamos observar a distribuição das diferenças com o teste de Shapiro–Wilk e o gráfico Q-Q, além de utilizar histograma e boxplot para avaliar sua forma e possíveis valores extremos. Essas verificações ajudam a interpretar os resultados, mas não serão usadas como justificativa para simplesmente descartar um dos testes.

## 5. Por que utilizar um teste unilateral?

A pergunta do experimento já indica uma direção: queremos verificar se o Build Cache reduz o tempo de build. Não estamos procurando qualquer diferença entre as condições, mas especificamente uma redução.

Por esse motivo, foi escolhido um teste unilateral, com a hipótese alternativa de que as diferenças `sem_cache − com_cache` sejam positivas.

Essa escolha também concentra o nível de significância em uma única cauda e aumenta o poder para identificar um efeito na direção esperada. Porém, existe uma consequência que precisa ficar clara: se o cache aumentar o tempo de build, o teste unilateral não vai apontar esse aumento como um resultado significativo. Nesse caso, o resultado deverá ser apresentado e discutido de forma descritiva.

A direção do teste foi definida antes da coleta e não deverá ser alterada depois que os resultados forem conhecidos. Mudar a direção após observar os dados comprometeria a análise.

## 6. Variáveis do experimento

### 6.1 Variável independente

A variável independente será o **estado do Build Cache do Gradle**, com dois níveis:

| Condição | Descrição |
|---|---|
| A — sem cache | Build Cache desativado explicitamente |
| B — com cache | Build Cache ativado, utilizando o cache local |

### 6.2 Variável dependente

A variável dependente será o **tempo total de execução do build**, medido em segundos.

A medição será feita do início ao fim do processo `gradlew.bat`, utilizando o Python para registrar o tempo com resolução de milissegundos. Para isso, poderá ser utilizado `time.perf_counter()` ao redor da chamada do subprocesso.

Nos testes estatísticos, será utilizada a diferença entre as duas condições:

```text
dᵢ = tempo_Aᵢ − tempo_Bᵢ
```

Além do tempo, o script deverá registrar o identificador do par, a condição executada, a ordem da execução, o horário da medição e o código de saída do processo. Se o build terminar com código diferente de zero, será considerado uma falha e não entrará na análise como uma medição válida.

## 7. Como serão feitas as execuções?

As duas condições serão executadas com os seguintes comandos:

**Condição A — Build sem cache**

```bash
gradlew.bat clean build --no-build-cache --no-configuration-cache
```

**Condição B — Build com cache**

```bash
gradlew.bat clean build --build-cache --no-configuration-cache
```

Alguns cuidados foram definidos para que a comparação seja justa:

- O parâmetro `--no-configuration-cache` será utilizado nas duas condições. Assim, evitamos que outro recurso de otimização do Gradle interfira na comparação.
- O comando `clean` será executado nas duas condições para remover o diretório `build/` antes de cada build. Dessa forma, não haverá reaproveitamento de saídas incrementais desse diretório.
- As opções informadas na linha de comando têm prioridade sobre as configurações de `org.gradle.caching` no arquivo `gradle.properties`. Mesmo assim, esse arquivo deverá ser conferido antes da coleta.
- O experimento deverá utilizar somente o cache local. Se o projeto escolhido configurar um cache remoto em `settings.gradle` ou `settings.gradle.kts`, essa configuração deverá ser desativada ou o projeto deverá ser substituído. A latência da rede poderia influenciar os tempos.

A coleta será realizada no Windows, utilizando o Gradle Wrapper do próprio projeto, uma versão fixa do JDK e um script em Python para executar os comandos e salvar os resultados.

## 8. Como será feito o pareamento?

Cada par será formado por uma execução sem cache e outra com cache, realizadas consecutivamente e nas mesmas condições de ambiente.

Para evitar que a ordem das execuções influencie os resultados, ela será alternada ou definida de forma aleatória e balanceada. Por exemplo, em alguns pares será executada primeiro a condição A e depois a B; em outros, a ordem será invertida.

Esse cuidado é importante porque fatores como o aquecimento da JVM, o uso do Gradle Daemon, o cache de disco do sistema operacional e a temperatura do computador podem afetar o tempo das execuções.

A meta será obter aproximadamente **30 pares válidos**. Caso uma das execuções de um par falhe, o par inteiro será descartado e realizado novamente. Todos os descartes deverão ser registrados para manter o histórico da coleta.

## 9. Nível de significância e resultados esperados da análise

Será adotado o nível de significância de **α = 0,05** para os dois testes, sempre com alternativa unilateral.

A hipótese nula será rejeitada quando o p-valor for menor que 0,05.

Além do p-valor, não vamos nos limitar a informar se o resultado foi significativo. Também será importante mostrar o tamanho e a direção da diferença encontrada.

Para o teste t pareado, serão apresentados:

- Média das diferenças (d̄).
- Desvio padrão das diferenças.
- Intervalo de confiança unilateral de 95% para μ_d.
- Tamanho de efeito de Cohen para dados pareados (d_z = d̄ / s_d).

Para o Wilcoxon, serão apresentados:

- Estatística W.
- Mediana das diferenças.
- Estimativa de Hodges–Lehmann.
- Correlação rank-biserial como medida de tamanho de efeito.

Um p-valor significativo indica que os dados são pouco compatíveis com a hipótese nula, considerando o teste utilizado. Isso não significa, por si só, que a redução do tempo seja importante na prática. Por isso, também vamos observar a diferença em segundos, a redução percentual e os tamanhos de efeito.

## 10. Fatores que podem influenciar os resultados

Mesmo mantendo as condições do experimento, alguns fatores externos podem alterar o tempo de execução. Os principais pontos que precisam ser observados são:

| Fator | Possível influência |
|---|---|
| Processos em segundo plano, como Windows Update, navegador e IDE | Podem gerar picos de uso de CPU, memória e disco, aumentando o tempo de execução. |
| Windows Defender verificando `build/`, `.gradle/` e `~/.gradle/` | Pode aumentar o tempo de leitura e gravação de arquivos, principalmente durante a restauração do cache. |
| Gradle Daemon frio ou aquecido | As primeiras execuções podem demorar mais por causa da inicialização. |
| Cache de dependências | O download de dependências pode introduzir variações de rede na primeira execução. |
| Cache local vazio ou preenchido | Se estiver vazio, a primeira execução com cache poderá não aproveitar resultados anteriores. |
| Temperatura e plano de energia | O aquecimento do notebook ou o modo de economia de energia podem reduzir o desempenho. |
| Testes instáveis (*flaky tests*) | Podem causar falhas ou tempos muito diferentes entre execuções. |
| Tipo de disco e espaço disponível | HDD e SSD podem apresentar diferenças no tempo de leitura e gravação. |
| Versões do JDK e do Gradle | Podem alterar o comportamento da compilação e do próprio cache. |

Esses fatores não podem ser ignorados, porque uma diferença no tempo pode ser causada tanto pelo tratamento analisado quanto pelas condições em que a medição foi feita.

## 11. Cuidados antes e durante a coleta

Para reduzir a influência dos fatores externos, o grupo seguirá alguns cuidados.

### Antes da coleta

1. Escolher um projeto Java open-source que utilize Gradle Wrapper, compile e execute seus testes de forma estável no Windows. O projeto também precisa ter tarefas suficientes para que o Build Cache possa fazer diferença.
2. Registrar o endereço do repositório, o hash do commit utilizado e a versão do Gradle.
3. Registrar as características do ambiente: modelo da CPU, quantidade de RAM, tipo de disco, versão do Windows, versão do JDK e versão do Gradle.
4. Manter o notebook conectado à tomada e utilizar o plano de energia de alto desempenho. Aplicativos desnecessários deverão ser fechados. Se possível, os diretórios do projeto e `~/.gradle` poderão ser adicionados às exclusões do antivírus, registrando se esse procedimento foi realizado.

### Preparação e aquecimento

5. Fazer uma primeira execução para baixar as dependências necessárias. Depois disso, considerar o uso de `--offline` nas duas condições, evitando que a rede interfira nas medições.
6. Executar pelo menos um build com `--build-cache` antes da coleta para preencher o cache local.
7. Realizar algumas execuções de aquecimento do Gradle Daemon e não incluí-las nos resultados. O Daemon deverá permanecer ativo durante a sessão, seguindo a mesma configuração para as duas condições.

### Durante a coleta

8. Alternar ou aleatorizar a ordem das condições A e B dentro dos pares.
9. Evitar utilizar o computador para outras atividades enquanto as medições estiverem acontecendo.
10. Não alterar o código, as dependências ou as configurações do projeto entre as execuções.
11. Salvar todas as medições em formato bruto, com uma linha por execução. Os valores extremos não deverão ser removidos durante a coleta. Caso algum dado seja excluído posteriormente, o critério deverá estar definido e a decisão deverá ser explicada na análise.

### Na análise

12. Verificar a normalidade e a simetria das diferenças entre os pares, e não apenas dos tempos medidos em cada condição.
13. Apresentar os resultados dos dois testes, mesmo quando eles chegarem a conclusões diferentes, discutindo possíveis motivos para essa divergência.

## 12. Limitações do experimento

O experimento também possui algumas limitações que precisam ser consideradas na interpretação dos resultados.

A primeira é que a coleta será feita em apenas um projeto, em um computador e no sistema Windows. Por isso, não podemos afirmar que os mesmos resultados serão encontrados em outros projetos, máquinas, sistemas operacionais ou ambientes de integração contínua.

Outro ponto é que o cenário utilizado pode favorecer o Build Cache. Como o comando `clean` será executado e o código não será alterado entre as medições, muitas tarefas cacheáveis poderão ser reaproveitadas. Isso representa uma situação bastante favorável ao recurso e pode mostrar uma redução maior do que a observada no desenvolvimento do dia a dia, quando o código costuma mudar entre os builds.

Também existe a possibilidade de as diferenças entre os pares não serem totalmente independentes. Como as medições serão feitas em sequência, o aquecimento do computador e outras mudanças ao longo da sessão podem influenciar os resultados.

Além disso, se a redução de tempo for muito grande e consistente, é possível que os dois testes apontem resultados significativos. Nesse caso, a comparação entre eles poderá ser menos evidente nos dados reais. Por isso, a simulação também será importante, principalmente para estudar cenários com efeitos menores, assimetria e valores extremos.

Por fim, o número de aproximadamente 30 pares pode ser insuficiente para identificar efeitos pequenos. Testes de normalidade, como o Shapiro–Wilk, também podem ter pouca sensibilidade com uma amostra desse tamanho. A medição do tempo total ainda inclui a inicialização do wrapper e da JVM, etapas que não são necessariamente afetadas pelo Build Cache e podem diminuir a diferença relativa observada.

## 13. Resumo das definições para as próximas etapas

As definições abaixo deverão ser utilizadas como referência nas próximas Issues do trabalho.

| Item | Definição |
|---|---|
| Unidade experimental | Uma execução completa de `clean build` do projeto escolhido |
| Fator analisado | Estado do Build Cache: A (desativado) e B (ativado, cache local) |
| Variável dependente | Tempo total de execução do build, em segundos |
| Diferença analisada | dᵢ = tempo_sem_cache − tempo_com_cache |
| Delineamento | Pareado, com ordem A/B alternada ou aleatorizada |
| Quantidade planejada | Aproximadamente 30 pares válidos |
| Testes estatísticos | t pareado e Wilcoxon pareado, ambos unilaterais (`alternative='greater'`) |
| Nível de significância | α = 0,05 |
| Resultados a apresentar | p-valores, média e mediana das diferenças, intervalo de confiança, estimativa de Hodges–Lehmann, tamanhos de efeito, histograma e gráfico Q-Q das diferenças |

Na parte de simulação, uma possibilidade é gerar conjuntos de diferenças sob H0 e H1, considerando cenários com distribuição normal, distribuição assimétrica (como uma lognormal deslocada) e presença de valores extremos. Assim, será possível comparar a taxa de erro tipo I e o poder dos dois testes em situações diferentes.

---

**Observação:** este cenário define o que será investigado e como as medições deverão ser feitas. A escolha do projeto open-source e os detalhes concretos do ambiente serão registrados na etapa de coleta, sem alterar as decisões estatísticas já estabelecidas.
