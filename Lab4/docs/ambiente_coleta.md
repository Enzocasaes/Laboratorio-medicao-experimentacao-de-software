# Ambiente da Coleta

**Lab04 — Issue #2: Coleta de Dados Reais e Geração do CSV**

Todas as informações abaixo foram registradas automaticamente pelo `src/coleta.py` no arquivo `data/oficial/20261103_103102/metadados.json`, no início da sessão oficial.

## 1. Máquina

| Item | Valor |
|---|---|
| Sistema operacional | Microsoft Windows 11 Pro 10.0.26200 |
| Processador | AMD Ryzen 5 7600X 6-Core Processor (12 processadores lógicos) |
| Memória RAM | 15,2 GB |
| Disco | KINGSTON SNV2S1000G (SSD) |
| Plano de energia | Alto desempenho (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`) |
| Terminal | PowerShell |

## 2. Software

| Item | Versão |
|---|---|
| Python | 3.14.0 (64 bits) |
| Gradle (Wrapper do projeto) | 9.5.1 |
| JVM do Gradle (launcher e daemon) | Oracle JDK 21.0.7+8-LTS-245 (`C:\Program Files\Java\jdk-21`) |
| JDK de compilação e testes (toolchain) | Eclipse Temurin 17.0.20.1+1 (`C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot`) |

O projeto fixa a toolchain em Java 17 (`build.gradle`). O Gradle roda sobre o JDK 21, mas compila e executa os testes com o Temurin 17, detectado pelo registro do Windows. Os logs dos testes confirmam isso: `Starting ... using Java 17.0.20.1`.

## 3. Datas da coleta

| Sessão | Pasta | Período |
|---|---|---|
| Piloto que falhou (sem JDK 17) | `data/piloto/20261103_101319/` | 03/11/2026, 10:13 |
| Piloto válido (5 pares) | `data/piloto/20261103_101807/` | 03/11/2026, 10:18 a 10:23 |
| Oficial (30 pares) | `data/oficial/20261103_103102/` | 03/11/2026, 10:31 (início, com aquecimento); medições de 10:32:22 a 10:50:14 |

## 4. Configurações utilizadas

**Comandos medidos** (executados pelo `src/coleta.py` na pasta do projeto):

| Condição | Comando |
|---|---|
| A, sem cache | `gradlew.bat clean build --no-build-cache --no-configuration-cache --console=plain --offline` |
| B, com cache | `gradlew.bat clean build --build-cache --no-configuration-cache --console=plain --offline` |

- O `--console=plain` só muda o formato da saída. Ele permite ler no log o resultado de cada tarefa (`FROM-CACHE`, `UP-TO-DATE`) e a linha de resumo `N actionable tasks`.
- O `--offline` foi usado nas duas condições, com as dependências já baixadas pelo piloto. Assim a rede não interfere nos tempos.
- O Configuration Cache ficou desativado nas duas condições (`--no-configuration-cache`).
- O Build Cache é **somente local**, no diretório padrão `%USERPROFILE%\.gradle\caches\build-cache-1`. O projeto não configura cache remoto: o `settings.gradle` contém apenas `rootProject.name` e não há `gradle.properties`.
- **Gradle Daemon:** ficou ativo, no padrão do Gradle, e foi o mesmo nas duas condições.
- **Aquecimento:** 2 rodadas B + A antes das medições, que não entraram nos dados.
- **Ordem das condições:** sorteada com a semente `20261103`, balanceada em 15 pares AB e 15 BA (`random.Random(20261103)`).
- **Tempo:** medido com `time.perf_counter()` em volta do subprocesso `gradlew.bat`, do início ao fim do processo, e arredondado para milissegundos.
- **Tentativas por par:** no máximo 3. Não foi necessária nenhuma repetição.

## 5. Itens não controlados ou não registrados

- Não foi registrado se havia exclusões do Windows Defender para a pasta do projeto ou para `~/.gradle`.
- O cache local não foi esvaziado entre o piloto e a coleta oficial. Ele já estava preenchido no início da sessão oficial: o primeiro aquecimento B recuperou 14 tarefas do cache.
- A temperatura da CPU não foi monitorada.
