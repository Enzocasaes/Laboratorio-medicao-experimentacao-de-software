# Fonte dos Dados Reais

**Lab04 — Issue #2: Coleta de Dados Reais e Geração do CSV**

Este documento descreve de onde vêm os dados de `data/dados_reais.csv`, como eles foram coletados e o que se observou neles. O ambiente da máquina está em [ambiente_coleta.md](ambiente_coleta.md), e as decisões do experimento estão em [cenario_experimental.md](cenario_experimental.md).

## 1. Projeto

| Item | Valor |
|---|---|
| Nome | Spring PetClinic (`spring-projects/spring-petclinic`) |
| Link | https://github.com/spring-projects/spring-petclinic |
| Commit utilizado | `500158f732419217507c7656904b8e6aa1bcc0d6` (29/09/2026), sem alterações locais |
| Licença | Apache License 2.0 (`LICENSE.txt`) |
| Linguagem | Java |
| Versão do Java exigida | 17 (toolchain definida no `build.gradle`) |
| Versão do Gradle | 9.5.1 (Gradle Wrapper, `gradle/wrapper/gradle-wrapper.properties`) |
| Principais plugins | Spring Boot 4.1.0, checkstyle, spring-javaformat, nohttp, CycloneDX, GraalVM native build tools |

### Por que este projeto

- É público, mantido pela equipe do Spring e muito usado como aplicação de referência.
- Tem `gradlew.bat`, e o `build` funcionou no Windows sem nenhuma modificação. Basta ter um JDK 17 instalado.
- Tem tarefas compatíveis com o Build Cache: no `clean build`, 14 das 22 tarefas acionáveis foram recuperadas do cache, entre elas `compileJava`, `compileTestJava`, `processAot`, `checkstyle*`, `checkFormat*`, `cyclonedx*` e `test`.
- O build sem cache leva cerca de 31 s, tempo suficiente para que ruídos de poucas centenas de milissegundos não dominem a medição. Ao mesmo tempo, as 60 execuções couberam em menos de 20 minutos.
- O build não depende de serviços externos. Os testes que usam Docker (`MySqlIntegrationTests` e `PostgresIntegrationTests`) são pulados quando o Docker não está disponível: o primeiro usa `@Testcontainers(disabledWithoutDocker = true)` e o segundo, `assumeTrue(...isDockerAvailable())`.
- Usa somente o cache local: o `settings.gradle` não configura cache remoto e não existe `gradle.properties`.

## 2. Procedimento de coleta

O procedimento é automatizado pelo `src/coleta.py`. Detalhes de versões e comandos estão em [ambiente_coleta.md](ambiente_coleta.md).

1. O projeto foi clonado em `C:\Users\Enzo\lab4-coleta\spring-petclinic`, fora do repositório do grupo.
2. O script registra o ambiente e o commit do projeto no `metadados.json`.
3. **Aquecimento** (não entra nos dados): duas rodadas de B e depois A. Elas baixam ou confirmam as dependências, preenchem o Build Cache local e deixam o Gradle Daemon ativo.
4. **Ordem:** para cada par, a ordem AB ou BA vem de um sorteio balanceado com semente fixa (`20261103`), resultando em 15 pares AB e 15 BA. As duas execuções do par rodam em seguida, uma depois da outra.
5. **Medição:** cada execução é medida com `time.perf_counter()` em volta do processo `gradlew.bat` completo. A saída do Gradle vai para um log próprio da execução.
6. **Validação de cada execução** (só o status `ok` conta como observação):
   - o código de saída tem que ser 0;
   - a linha de resumo `N actionable tasks` tem que existir no log;
   - na condição A, nenhuma tarefa pode vir do cache (`from cache = 0`);
   - na condição B, ao menos uma tarefa tem que vir do cache (`from cache > 0`). Assim se confirma que o tratamento foi realmente aplicado.
7. **Falhas:** se uma execução do par falha, o par inteiro é descartado, registrado em `execucoes.csv` e repetido, com até 3 tentativas. Nenhum valor é preenchido artificialmente.
8. **Armazenamento:** cada sessão grava em uma pasta própria com data e hora, e cada linha é gravada assim que é produzida. No modo oficial, os pares válidos são exportados para `data/dados_reais.csv`. O script se recusa a rodar se esse arquivo já existir, para não sobrescrevê-lo.

### Arquivos gerados

| Arquivo | Conteúdo |
|---|---|
| `data/dados_reais.csv` | Os 30 pares válidos: `par`, `tempo_sem_cache`, `tempo_com_cache`, `ordem_execucao` (tempos em segundos) |
| `data/oficial/20261103_103102/execucoes.csv` | Uma linha por execução: par, tentativa, posição no par, condição, início e fim (data e hora), tempo, código de saída, status e contagem de tarefas (executadas, do cache, up-to-date), além do log correspondente |
| `data/oficial/20261103_103102/pares.csv` | Pares válidos com diferença, início do par, número de tentativas e status de cada condição |
| `data/oficial/20261103_103102/metadados.json` | Ambiente, comandos, semente e ordens sorteadas |
| `data/oficial/20261103_103102/logs/` | Saída completa do Gradle de cada execução, incluindo o aquecimento |

Cada linha de `dados_reais.csv` pode ser rastreada pelo número do `par` até as duas linhas de `execucoes.csv` e os dois logs `par<NN>_t<tentativa>_<posição><condição>.log`.

## 3. Execuções piloto

Os dados do piloto ficam em `data/piloto/` e não fazem parte de `dados_reais.csv`.

**Primeira tentativa (`data/piloto/20261103_101319/`), falhou.** O primeiro aquecimento terminou com erro após 41,5 s:

```
Cannot find a Java installation on your machine ... matching: {languageVersion=17, ...}.
Toolchain download repositories have not been configured.
```

A máquina só tinha JDK 21 e 24. Para corrigir, foi instalado o Eclipse Temurin 17. O projeto não foi modificado.

**Piloto válido (`data/piloto/20261103_101807/`): 5 de 5 pares válidos**, sem falhas e sem repetições.

| | Sem cache (A) | Com cache (B) | Diferença |
|---|---|---|---|
| Média | 31,738 s | 4,324 s | 27,414 s |
| Desvio-padrão | 0,154 s | 0,194 s | 0,173 s |
| Mínimo a máximo | 31,498 a 31,925 s | 4,075 a 4,594 s | 27,212 a 27,667 s |

- **Comandos:** funcionaram nas duas condições.
- **Uso do cache:** em todas as execuções B, 14 tarefas vieram do cache e 8 foram executadas. Nas A, as 22 tarefas foram executadas.
- **Estabilidade:** boa, com desvio-padrão abaixo de 0,2 s nas duas condições.

**Mudanças entre o piloto e a coleta oficial:**
- O plano de energia passou de "Equilibrado" para "Alto desempenho".
- O `--offline` foi adicionado às duas condições.
- O `coleta.py` passou a registrar as toolchains Java detectadas pelo Gradle.

## 4. Coleta oficial

**Sessão `data/oficial/20261103_103102/`: 30 de 30 pares válidos.** Foram 60 execuções, 30 por condição, todas com status `ok` na primeira tentativa, sem falhas nem descartes. Em todas as execuções B, 14 tarefas vieram do cache, e em todas as A, nenhuma.

### 4.1 Estatísticas descritivas

Valores produzidos por `python src/descritiva.py`, em segundos.

| | Sem cache (A) | Com cache (B) | Diferença d = A − B |
|---|---|---|---|
| n | 30 | 30 | 30 |
| Média | 31,481 | 4,245 | 27,236 |
| Mediana | 31,466 | 4,197 | 27,325 |
| Desvio-padrão | 0,241 | 0,317 | 0,393 |
| Mínimo | 31,057 | 3,936 | 25,664 |
| Máximo | 32,263 | 5,468 | 28,049 |
| Assimetria (G1) | 1,005 | 3,099 | −2,170 |
| Extremos (regra 1,5·IQR) | 32,263 (par 10) | 5,468 (par 14), 5,225 (par 21); 3,936 e 3,949, levemente abaixo da cerca | 25,664 (par 14), 26,574 (par 21), 28,049 (par 10) |

- A diferença foi positiva em **30 de 30 pares**, e a redução média relativa foi de **86,5%**.
- A ordem praticamente não mudou a diferença: a média foi 27,211 s nos pares AB e 27,261 s nos pares BA.

### 4.2 Observações para quem fará a simulação e os testes

- **Efeito grande e diferenças concentradas.** As diferenças ficam quase todas entre 27,1 e 27,4 s (Q1 = 27,145 s, Q3 = 27,432 s). Diante desse efeito, que fica em torno de 69 desvios-padrão das diferenças, os dois testes devem concordar nos dados reais. Isso já estava previsto na Seção 12 do cenário: a comparação entre os testes vai depender mais da simulação.
- **Assimetria à esquerda nas diferenças.** Ela vem de duas execuções com cache mais lentas, nos pares 14 e 21 (cerca de 1 s acima do normal). Como `d = A − B`, uma B lenta gera uma diferença menor. Por isso a média (27,236 s) ficou abaixo da mediana (27,325 s).
- **Valores extremos.** Há um extremo à direita no par 10, causado por uma A mais lenta (32,263 s). Os três pares extremos foram mantidos, como define o cenário, e nenhum dado foi removido.
- **Os testes não rodam na condição B.** A tarefa `test` também é recuperada do cache, então em B os testes não são executados. Isso explica boa parte da redução e confirma o "cenário favorável ao cache" descrito na Seção 12 do cenário.

## 5. Problemas encontrados

1. **Faltava o JDK 17.** A toolchain do projeto não foi encontrada e o primeiro piloto falhou. Isso foi resolvido instalando o Temurin 17.
2. **O plano de energia do piloto era "Equilibrado".** Na coleta oficial ele foi trocado para "Alto desempenho". Os tempos do piloto e da coleta oficial são parecidos, mas os dois conjuntos não devem ser misturados.
3. **O cache local não foi esvaziado entre as sessões.** Isso não afeta a validade, porque o aquecimento já preenche o cache e a validação exige `from cache > 0` em toda execução B.

## 6. Como reproduzir

Requisitos: Windows, Python 3, Git, um JDK 17 instalado (detectável pelo Gradle) e um JDK 17 ou mais recente para rodar o Gradle.

```powershell
git clone https://github.com/spring-projects/spring-petclinic.git C:\Users\Enzo\lab4-coleta\spring-petclinic
git -C C:\Users\Enzo\lab4-coleta\spring-petclinic checkout 500158f732419217507c7656904b8e6aa1bcc0d6

# na raiz do repositório do grupo
powercfg /setactive SCHEME_MIN
python Lab4/src/coleta.py --projeto C:\Users\Enzo\lab4-coleta\spring-petclinic --modo piloto --pares 5
python Lab4/src/coleta.py --projeto C:\Users\Enzo\lab4-coleta\spring-petclinic --modo oficial --pares 30 --offline
python Lab4/src/descritiva.py
```

A coleta oficial se recusa a rodar se `Lab4/data/dados_reais.csv` já existir. Para repeti-la, mova o arquivo antigo antes. As sessões em `data/oficial/` e `data/piloto/` nunca são sobrescritas.
