# Lab02 — S01: instrumentos do experimento

Laboratório de Experimentação de Software — Laboratório 02
(*Assistentes de IA vs. codificação manual: um experimento controlado*).

Artefatos de código da **Sprint 01** — os instrumentos que coletam os dados do
experimento:

| Instrumento | Comando | O que coleta |
|---|---|---|
| [`src/cronometro.js`](src/cronometro.js) | `npm run trial:iniciar` | **time-to-green** por trial, com time-box de 35 min → [`data/trials.csv`](data/) (RQ1, RQ2) |
| [`src/metricas.js`](src/metricas.js) | `npm run metricas` | **complexidade ciclomática, duplicação, LOC e MI** do código final → [`data/metricas.csv`](data/) (RQ3) |
| [`src/validar-katas.js`](src/validar-katas.js) | `npm run katas:validar` | dificuldade comparável + baixa indexação dos katas |
| [`src/verificar-ambiente.js`](src/verificar-ambiente.js) | `npm run ambiente:verificar` | confere o ambiente antes de cada sessão de coleta |

- Enunciado: [../01 - LABORATORIO 02 - Assistentes de IA vs codificacao manual.md](../01%20-%20LABORATORIO%2002%20-%20Assistentes%20de%20IA%20vs%20codificacao%20manual.md)
- Desenho do experimento (Passo 1): [../Docs/DesenhoDoExperimento.md](../Docs/DesenhoDoExperimento.md)
- Ambiente e definição das métricas (Passo 2): [../Docs/Ambiente.md](../Docs/Ambiente.md)

## Pré-requisito

**Node.js 18 ou superior** (fixado em [`.nvmrc`](.nvmrc)). Não há dependências —
**não** rode `npm install`.

```bash
cd Lab2/Sprint01
npm run ambiente:verificar    # confere Node, pastas, instrumentos e imprime o checklist do trial
```

## Regra do time-box

- Padrão: **35 min por trial**. Pode ser **reduzido** (`--time-box 30`) e
  justificado no relatório, **nunca aumentado**.
- *Trial* que atinge o time-box sem passar em todos os testes é gravado como
  **censurado** (`censurado=1`), com `duracao_segundos = 2100` — **nunca é
  descartado** (descartar distorceria a comparação a favor do tratamento com mais
  falhas).

## Fluxo normal de um trial

```bash
# 1. no início do trial
npm run trial:iniciar -- --participante P1 --kata kata-03 --tratamento com-ia --ordem 5
#    (equivale a: node src/cronometro.js iniciar --participante P1 ...)

# 2. a qualquer momento, ver quanto falta
npm run trial:status

# 3. ao passar em TODOS os testes de aceitação (ou ao estourar o tempo)
npm run trial:parar -- --testes-passando 10 --testes-total 10 --num-prompts 7 --obs "usou IA para o parser"
```

`--` é necessário para o npm repassar as flags ao script. Chamando o `node`
direto não precisa:

```bash
node src/cronometro.js iniciar --participante P1 --kata kata-03 --tratamento com-ia --ordem 5
node src/cronometro.js parar --testes-passando 8 --testes-total 12
```

- `--tratamento` aceita `com-ia | sem-ia` (e também `com`, `sem`, `ia`,
  `manual`, `t0`, `t1`).
- `--ordem` é a posição do trial na sequência daquele participante (1..6), usada
  para checar o efeito de ordem.
- Se `testes-passando == testes-total` e o tempo não estourou → `sucesso=1`.
- Só há **um trial ativo por vez** (arquivo `data/sessao-ativa.json`). Use
  `npm run trial:abortar` para descartar sem gravar, ou `--forcar` no `iniciar`.

## Sequência de execução — Enzo (P1)

A divisão do trabalho na Execução (S02) já é individual por desenho: cada
integrante resolve os **6 katas sozinho** (3 `com-ia`, 3 `sem-ia`), na ordem
contrabalanceada da linha `P1` da
[matriz de tratamento](../Docs/DesenhoDoExperimento.md#matriz-de-tratamento-integrante--kata).
Sequência de Enzo, pronta para copiar/colar (cada trial: `trial:iniciar` →
resolver → `npm test` → `trial:parar` → congelar o código em `trials/<trial_id>/`):

| ordem | kata | tratamento | comando de início |
|---|---|---|---|
| 1 | kata-01 | com-ia | `npm run trial:iniciar -- --participante enzo --kata kata-01 --tratamento com-ia --ordem 1` |
| 2 | kata-04 | sem-ia | `npm run trial:iniciar -- --participante enzo --kata kata-04 --tratamento sem-ia --ordem 2` |
| 3 | kata-02 | com-ia | `npm run trial:iniciar -- --participante enzo --kata kata-02 --tratamento com-ia --ordem 3` |
| 4 | kata-05 | sem-ia | `npm run trial:iniciar -- --participante enzo --kata kata-05 --tratamento sem-ia --ordem 4` |
| 5 | kata-03 | com-ia | `npm run trial:iniciar -- --participante enzo --kata kata-03 --tratamento com-ia --ordem 5` |
| 6 | kata-06 | sem-ia | `npm run trial:iniciar -- --participante enzo --kata kata-06 --tratamento sem-ia --ordem 6` |

Sessões de no máx. 3 trials (ver ameaça I2 no desenho); pausa de ~10 min entre
elas. Antes de cada sessão: `npm run ambiente:verificar` e, no T0 (`sem-ia`),
o procedimento de desligamento da IA ([Ambiente.md](../Docs/Ambiente.md)).

## Sequência de execução — Cauê (P2)

Linha `P2` da
[matriz de tratamento](../Docs/DesenhoDoExperimento.md#matriz-de-tratamento-integrante--kata).
As pastas `trials/caue_<kata>_<tratamento>/` já estão montadas com o
`enunciado.md`, a suíte de aceitação (importando `./solucao.js`) e um
`solucao.js` vazio — o código do trial é escrito direto nesse arquivo.

| ordem | kata | tratamento | comando de início | testes do trial |
|---|---|---|---|---|
| 1 | kata-06 | sem-ia | `npm run trial:iniciar -- --participante caue --kata kata-06 --tratamento sem-ia --ordem 1` | `node --test trials/caue_kata-06_sem-ia/kata-06.test.js` |
| 2 | kata-03 | com-ia | `npm run trial:iniciar -- --participante caue --kata kata-03 --tratamento com-ia --ordem 2` | `node --test trials/caue_kata-03_com-ia/kata-03.test.js` |
| 3 | kata-01 | sem-ia | `npm run trial:iniciar -- --participante caue --kata kata-01 --tratamento sem-ia --ordem 3` | `node --test trials/caue_kata-01_sem-ia/kata-01.test.js` |
| 4 | kata-04 | com-ia | `npm run trial:iniciar -- --participante caue --kata kata-04 --tratamento com-ia --ordem 4` | `node --test trials/caue_kata-04_com-ia/kata-04.test.js` |
| 5 | kata-02 | sem-ia | `npm run trial:iniciar -- --participante caue --kata kata-02 --tratamento sem-ia --ordem 5` | `node --test trials/caue_kata-02_sem-ia/kata-02.test.js` |
| 6 | kata-05 | com-ia | `npm run trial:iniciar -- --participante caue --kata kata-05 --tratamento com-ia --ordem 6` | `node --test trials/caue_kata-05_com-ia/kata-05.test.js` |

Sessão 1 = ordens 1–3, sessão 2 = ordens 4–6.

- Passe o **arquivo** de teste para o `node --test`, não a pasta — no Node 24
  uma pasta é executada como se fosse um arquivo e o resultado sai errado.
- Todo kata tem **12 testes**. Se o runner mostrar `tests 1` / `fail 1` com
  `does not provide an export named ...`, a função ainda não está exportada:
  registre `--testes-passando 0 --testes-total 12`, não `0/1`.
- O `enunciado.md` só é lido **depois** do `trial:iniciar` (ler antes tira
  tempo do cronômetro). Nunca abrir `katas/<id>/solucao-referencia.js`.

## Sequência de execução — Leo (P3)

Mesma lógica, na ordem contrabalanceada da linha `P3` da
[tabela de ordem](../Docs/DesenhoDoExperimento.md#ordem-de-execução-posição-16--evita-confundir-tratamento-com-ordem).
Leo **começa pelo `sem-ia`**, alternando os tratamentos:

| ordem | kata | tratamento | preparar a pasta | iniciar o cronômetro |
|---|---|---|---|---|
| 1 | kata-02 | **sem-ia** | `npm run trial:preparar -- --participante leo --kata kata-02 --tratamento sem-ia` | `npm run trial:iniciar -- --participante leo --kata kata-02 --tratamento sem-ia --ordem 1` |
| 2 | kata-05 | com-ia | `npm run trial:preparar -- --participante leo --kata kata-05 --tratamento com-ia` | `npm run trial:iniciar -- --participante leo --kata kata-05 --tratamento com-ia --ordem 2` |
| 3 | kata-03 | **sem-ia** | `npm run trial:preparar -- --participante leo --kata kata-03 --tratamento sem-ia` | `npm run trial:iniciar -- --participante leo --kata kata-03 --tratamento sem-ia --ordem 3` |
| 4 | kata-06 | com-ia | `npm run trial:preparar -- --participante leo --kata kata-06 --tratamento com-ia` | `npm run trial:iniciar -- --participante leo --kata kata-06 --tratamento com-ia --ordem 4` |
| 5 | kata-04 | **sem-ia** | `npm run trial:preparar -- --participante leo --kata kata-04 --tratamento sem-ia` | `npm run trial:iniciar -- --participante leo --kata kata-04 --tratamento sem-ia --ordem 5` |
| 6 | kata-01 | com-ia | `npm run trial:preparar -- --participante leo --kata kata-01 --tratamento com-ia` | `npm run trial:iniciar -- --participante leo --kata kata-01 --tratamento com-ia --ordem 6` |

O `trial:preparar` roda **antes** do `trial:iniciar` — ele copia o enunciado e a
suíte de aceitação para `trials/<trial_id>/` e cria o `solucao.js` vazio, para
que nenhum minuto do time-box seja gasto com setup. Ele **não** copia a
`solucao-referencia.js`, e ela não deve ser aberta antes do trial (ameaça G7).

Durante o trial, rode **só a suíte do seu kata**, pelo caminho do **arquivo**:

```bash
node --test trials/leo_kata-02_sem-ia/kata-02.test.js
```

```
# tests 12
# pass 2
# fail 10      <- é daqui que sai o --testes-passando
```

Duas armadilhas de instrumentação (ameaça I4) que isso evita: `npm test` roda os
168 testes do projeto inteiro, e passar a **pasta** em vez do arquivo agrega
tudo em `# tests 1`, escondendo a contagem individual.

Cada kata tem **12 testes de aceitação**, então o `trial:parar` fica
`--testes-passando <n> --testes-total 12`. Nos trials `com-ia`, some também
`--num-prompts <n>` (nº de interações com o assistente).

## Lançar um trial cronometrado à mão

Se o tempo foi medido por fora (celular, cronômetro de parede) e o `iniciar` não
foi usado:

```bash
node src/cronometro.js registrar \
  --participante P2 --kata kata-01 --tratamento sem-ia --ordem 3 \
  --duracao-min 21 --testes-passando 8 --testes-total 12 --num-prompts 0
```

Use `--duracao-min` **ou** `--duracao-segundos`. `--censurar` força o registro
como censurado em 35 min.

## Ver o que já foi coletado

```bash
npm run trial:listar
```

Lista os trials e imprime **mediana + IQR por tratamento** (tempo, censurados,
sucessos, taxa de testes) — a agregação recomendada pelo desenho. A análise
inferencial (Wilcoxon pareado por kata) fica no Passo 4.

## Formato de `data/trials.csv`

Uma linha por trial encerrado:

| coluna | descrição |
|---|---|
| `trial_id` | `<participante>_<kata>_<tratamento>` |
| `registrado_em` | timestamp ISO em que a linha foi gravada |
| `participante`, `kata`, `tratamento`, `ordem` | identificação do trial |
| `inicio`, `fim` | timestamps ISO (vazios no `registrar`) |
| `duracao_segundos` | **time-to-green**; `2100` quando `censurado=1` |
| `duracao_hms` | o mesmo tempo em `HH:MM:SS` |
| `time_box_segundos` | time-box aplicado (padrão `2100`) |
| `censurado` | `1` se atingiu o time-box sem sucesso, senão `0` |
| `sucesso` | `1` se todos os testes passaram dentro do tempo |
| `testes_passando`, `testes_total` | contagem ao fim do trial |
| `taxa_sucesso` | `testes_passando / testes_total` (RQ2) |
| `num_prompts_ia` | nº de interações com o assistente (exploratória, RQ1) |
| `observacoes` | texto livre |

> `data/*.csv` e `data/*.json` estão no [.gitignore](.gitignore) (padrão do Lab01).
> Quando os dados reais forem coletados, versione os CSVs finais com
> `git add -f Lab2/Sprint01/data/trials-com-metricas.csv` (e os `trials.csv` /
> `metricas.csv` que o originaram) para que o Relatório Final e o Dashboard
> (Passo 6) possam reproduzir os resultados.

## Métricas estáticas (RQ3)

O código final de cada trial fica em `trials/<trial_id>/`, onde `<trial_id>` é o
mesmo id gravado pelo cronômetro (`<participante>_<kata>_<tratamento>`) — é isso
que permite cruzar tempos e métricas sem digitar nada à mão.

```
trials/
└── P1_kata-03_com-ia/
    ├── solucao.js          # código final do participante  -> MEDIDO
    └── kata-03.test.js     # suíte de aceitação do kata     -> IGNORADO
```

```bash
npm run metricas                                   # todos os trials -> data/metricas.csv
npm run metricas -- --trial P1_kata-03_com-ia      # um trial só
npm run metricas -- --dir katas/kata-01            # pasta avulsa (ex.: solução de referência)
npm run metricas -- --min-linhas 8 --incluir-testes
npm run metricas:juntar                            # trials.csv + metricas.csv -> data/trials-com-metricas.csv
```

Além da tabela por trial, o script imprime **mediana + IQR por tratamento** — a
agregação que o desenho pede. A análise inferencial (Wilcoxon pareado por kata +
correção de Holm) fica no Passo 4.

| coluna de `data/metricas.csv` | descrição |
|---|---|
| `trial_id`, `participante`, `kata`, `tratamento` | identificação (derivada do `trial_id`) |
| `medido_em`, `arquivos_analisados` | quando a medição rodou e quantos arquivos entraram |
| `loc`, `linhas_comentario` | **LOC** — controle obrigatório de RQ3; mesmo `contarLOC` do `katas:validar` |
| `num_funcoes` | funções detectadas (declaração, expressão, arrow e método) |
| `complexidade_ciclomatica_media` | **McCabe por função** — variável dependente de RQ3a |
| `complexidade_ciclomatica_max`, `complexidade_total` | pior função e soma (análoga ao WMC do CK) |
| `duplicacao_percentual`, `linhas_duplicadas`, `clones_detectados` | **duplicação** — variável dependente de RQ3b |
| `volume_halstead`, `indice_manutenibilidade` | MI normalizado 0–100 (fórmula do `radon mi`), exploratório |
| `ferramenta_versao` | versão do coletor e do Node usados (replicação) |

> **Por que não CK/PMD/Radon direto:** CK só analisa Java e Radon só analisa
> Python; os katas foram fixados em JavaScript. O `metricas.js` calcula as
> **mesmas métricas** com as definições clássicas (McCabe, CPD, MI do Radon), em
> Node puro e sem dependências. As definições exatas — o que conta como ponto de
> decisão, a janela de duplicação, a fórmula do MI — estão em
> [../Docs/Ambiente.md](../Docs/Ambiente.md#4-instrumento-de-métricas-estáticas),
> junto com a diferença conhecida para o CPD e como fazer um cross-check
> opcional com `npx jscpd@4` (sem virar dependência do projeto).

O código dos trials **é versionado** — é o dado bruto do Passo 3. Só
`trials/**/node_modules/` está no [.gitignore](.gitignore).

## Validação dos katas

Artefato do 3º pesquisador na S01: pesquisa e validação dos objetos
experimentais (dificuldade comparável + baixa indexação).

```bash
npm run katas:validar          # valida katas.manifest.json -> data/validacao-katas.csv
```

- Manifesto dos 6 katas candidatos: [katas.manifest.json](katas.manifest.json)
- Rubrica, protocolo de baixa indexação e resultados:
  [../Docs/ValidacaoDosKatas.md](../Docs/ValidacaoDosKatas.md)
- [`katas/<id>/`](katas/) (S02) tem, para os 6 katas, `enunciado.md`,
  `solucao-referencia.js` e `<id>.test.js`; o script mede LOC/nº de testes
  reais a partir daí — **6 APROVADO, 0 REPROVADO**, conjunto homogêneo.
- Código de saída **1** se algum kata estiver `REPROVADO` (útil em CI).

## Hipóteses e ameaças à validade

Também redigidas nesta sprint, em [../Docs/DesenhoDoExperimento.md](../Docs/DesenhoDoExperimento.md)
— seções **(A) Hipóteses** (H0/Hₐ das 4 hipóteses, teste, regra de decisão) e
**(H) Ameaças à validade** (interna, construto, externa, conclusão + riscos
residuais e checklist de execução).

## Testes

Suíte automatizada com o runner nativo do Node (`node:test`), **sem
dependências**:

```bash
npm test          # equivale a: node --test
```

- [test/estatisticas.test.js](test/estatisticas.test.js) — mediana, quartis/IQR,
  detecção de outliers.
- [test/csv.test.js](test/csv.test.js) — geração, escaping (vírgula, aspas,
  quebra de linha) e leitura de CSV, incluindo _round-trip_.
- [test/cronometro.test.js](test/cronometro.test.js) — unidade (`formatarHMS`,
  `parseArgs`, `resultadoTrial`: censura em 35 min, sucesso, taxa, time-box
  reduzido) e integração do CLI via subprocesso (usa `LAB02_DATA_DIR` para gravar
  num diretório temporário, sem tocar em `data/`).
- [test/validar-katas.test.js](test/validar-katas.test.js) — `contarLOC`,
  `contarTestes`, `avaliarKata` (dificuldade + indexação + medição),
  `avaliarConjunto` (homogeneidade/outliers) e integração do CLI.
- [test/metricas.test.js](test/metricas.test.js) — tokenizador (`if` em string,
  comentário, regex e template não viram desvio), complexidade (if/else,
  `&&`/`??`/ternário, `switch`, `catch`, arrow, método, função aninhada),
  duplicação (janela, fronteira entre arquivos), Halstead/MI e integração do CLI
  (CSV gerado, testes ignorados, `--trial`, `--dir`, `--juntar`).
- [test/preparar-trial.test.js](test/preparar-trial.test.js) — redirecionamento do
  import da suíte, esqueleto da solução, e as garantias do CLI: não copia a
  solução de referência, não sobrescreve código já escrito.
- [test/verificar-ambiente.test.js](test/verificar-ambiente.test.js) — versão do
  Node, detecção de decisões em aberto no `Ambiente.md` e integração do CLI.

> Os scripts em `src/` só disparam o CLI quando executados diretamente
> (`process.argv[1]` = o próprio arquivo); ao serem importados por um teste,
> apenas expõem as funções.

## Estrutura

```
Lab2/Sprint01/
├── src/
│   ├── cronometro.js         # CLI: iniciar / status / parar / abortar / registrar / listar
│   ├── metricas.js           # CLI: metricas estaticas dos trials (RQ3) + --juntar
│   ├── preparar-trial.js     # monta trials/<trial_id>/ antes de iniciar o cronometro
│   ├── validar-katas.js      # valida os katas candidatos (dificuldade + indexacao)
│   ├── verificar-ambiente.js # confere o ambiente antes da coleta
│   ├── csv.js                # gerador/leitor de CSV (parser em passada unica)
│   └── estatisticas.js       # mediana, quartis/IQR, deteccao de outliers
├── test/
│   ├── estatisticas.test.js
│   ├── csv.test.js
│   ├── cronometro.test.js
│   ├── validar-katas.test.js
│   ├── metricas.test.js
│   ├── preparar-trial.test.js
│   └── verificar-ambiente.test.js
├── trials/<trial_id>/        # codigo final de cada trial (dado bruto, versionado)
├── katas/<id>/                # enunciado + solucao-referencia + testes de aceitacao (S02)
├── katas.manifest.json       # 6 katas candidatos + regras de validacao
├── data/                     # sessao-ativa.json, trials.csv, metricas.csv, ... (nao versionados)
├── .nvmrc                    # Node 18
├── package.json
├── .gitignore
└── README.md
```
