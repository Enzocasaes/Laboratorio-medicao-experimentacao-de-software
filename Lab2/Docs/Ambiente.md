# Lab02 — Passo 2: Ambiente do experimento e métricas estáticas

**Experimento:** Assistentes de IA generativa vs. codificação manual na
resolução de tarefas de programação.
**Escopo deste documento:** o *ambiente* em que os 18 trials são executados e o
*instrumento* que coleta as métricas estáticas do código final de cada trial —
os dois itens que o Passo 2 do enunciado exige preparar, junto com o cronômetro
([`../Sprint01/src/cronometro.js`](../Sprint01/src/cronometro.js)) e a validação
dos katas ([`ValidacaoDosKatas.md`](ValidacaoDosKatas.md)).

> Os itens marcados como *a preencher*, entre colchetes, são decisões do grupo a
> fixar **antes** do primeiro trial. `npm run ambiente:verificar` avisa enquanto
> restar algum.

---

## 1. Ambiente fixado

| Item | Valor | Por quê |
|---|---|---|
| Linguagem | **JavaScript (ESM)** | fixada em [(E) do desenho](DesenhoDoExperimento.md#e-objetos-experimentais--katas); casa com o instrumento de métricas descrito na seção 4 |
| Runtime | **Node.js ≥ 18** (fixado em [`../Sprint01/.nvmrc`](../Sprint01/.nvmrc)) | roda a suíte de aceitação dos katas com `node --test`, sem instalar nada |
| Dependências | **nenhuma** — não rodar `npm install` | mesma regra do Lab01: qualquer máquina reproduz o experimento só com o Node |
| Runner de testes | `node:test` (nativo) | a contagem `testes_passando/testes_total` sai do relatório do runner, não do olho (ameaça I4) |
| IDE | **VS Code** (versão exata a confirmar via `Code > About` em cada máquina — `[preencher por integrante]`) | a mesma nos dois tratamentos e para os 3 integrantes (ameaça I6) |
| Assistente de IA (T1) | **Claude (claude.ai), plano gratuito** — versão do modelo web no momento da coleta a registrar no Relatório Final | **ferramenta única** para o trio, exigência do enunciado e mitigação da ameaça I7; fixada pelo grupo na S02 |
| Sistema operacional | Enzo: **macOS 26.6.2 (Darwin 25.6.0)**. Cauê / Leonardo: `[preencher]` | registrado para o Relatório Final; não deve variar dentro de um mesmo integrante |
| Time-box | 35 min por trial | regra da turma; só pode ser reduzido |

### Os dois tratamentos, em termos de ambiente

| | **T1 — com-ia** | **T0 — sem-ia** |
|---|---|---|
| Assistente de IA | habilitado (chat e/ou autocomplete), à vontade | **desligado**: extensão de IA desativada na IDE, autocomplete inline off, nenhuma aba de chatbot aberta |
| Documentação da linguagem (MDN, docs oficiais) | permitida | permitida |
| Busca na web / StackOverflow | permitida | permitida |
| Tudo o mais (IDE, Node, katas, time-box, máquina) | idêntico | idêntico |

Procedimento de desligamento no T0 (conferido por observador, com screencast):

1. desativar a extensão do assistente na IDE (**desabilitar**, não só "pausar"), e
   confirmar que o autocomplete inline sumiu;
2. fechar toda aba/janela de chatbot;
3. iniciar o screencast **antes** de `npm run trial:iniciar`;
4. rodar `npm run ambiente:verificar` e percorrer o checklist impresso.

---

## 2. Onde fica o código de cada trial

```
Lab2/Sprint01/trials/<trial_id>/
```

`<trial_id>` é **exatamente** o id que o cronômetro grava em `data/trials.csv`
(`<participante>_<kata>_<tratamento>`, ex.: `P1_kata-03_com-ia`) — é isso que
permite cruzar tempos e métricas sem digitar nada à mão.

```
trials/
└── P1_kata-03_com-ia/
    ├── solucao.js          # código final do participante  -> MEDIDO
    └── kata-03.test.js     # suíte de aceitação do kata     -> IGNORADO
```

- Os arquivos de teste (`*.test.js` / `*.spec.js`) **não** entram na medição: são
  os mesmos nos dois tratamentos e diluiriam a diferença que se quer medir.
  `--incluir-testes` inverte isso, se algum dia for preciso.
- O código dos trials **é versionado** — é o dado bruto do Passo 3. Só
  `trials/**/node_modules/` está no `.gitignore`.
- Copiar o código para a pasta do trial faz parte do encerramento do trial, logo
  após `npm run trial:parar`.

---

## 3. Fluxo completo de um trial

```bash
cd Lab2/Sprint01
npm run ambiente:verificar        # 1. ambiente conferido + checklist

npm run trial:iniciar -- --participante P1 --kata kata-03 --tratamento com-ia --ordem 5
#                                 # 2. resolver o kata (time-box de 35 min)
npm test                          # 3. rodar a suíte de aceitação do kata
npm run trial:parar -- --testes-passando 10 --testes-total 10 --num-prompts 7

mkdir -p trials/P1_kata-03_com-ia # 4. congelar o código final
cp <onde você codou>/solucao.js trials/P1_kata-03_com-ia/

npm run metricas                  # 5. métricas estáticas -> data/metricas.csv
npm run metricas:juntar           # 6. tempos + métricas  -> data/trials-com-metricas.csv
```

O passo 6 pode ser feito uma única vez, ao final da coleta: ele recalcula o
arquivo combinado que alimenta a análise (Passo 4) e o dashboard (Passo 6).

---

## 4. Instrumento de métricas estáticas

### Por que não CK, PMD ou Radon diretamente

O enunciado pede CK/PMD e cita Radon como equivalente. **CK só analisa Java** e
**Radon só analisa Python**; o desenho fixou os katas em **JavaScript**, então
nenhum dos dois se aplica ao código produzido. O PMD tem um módulo
`ecmascript`, mas ele depende do parser Rhino, que não aceita boa parte da
sintaxe moderna de JS (encadeamento opcional, spread) — usá-lo arriscaria falhar
justamente sobre o código dos trials.

O instrumento adotado é [`../Sprint01/src/metricas.js`](../Sprint01/src/metricas.js):
um coletor em Node puro, sem dependências, que calcula **as mesmas métricas**
que o enunciado pede, com as mesmas definições clássicas:

| Métrica do enunciado | Ferramenta original | Equivalente aqui |
|---|---|---|
| Complexidade ciclomática (McCabe) | CK `complexity`/WMC, Radon `cc` | `complexidade_ciclomatica_media` / `_max` / `_total` |
| Duplicação (% de linhas) | PMD CPD, jscpd | `duplicacao_percentual` |
| LOC (controle obrigatório) | CK, Radon `raw` | `loc` |
| Índice de Manutenibilidade | Radon `mi` | `indice_manutenibilidade` |

Como o instrumento é do próprio grupo, as definições abaixo fazem parte do
protocolo: elas precisam estar escritas para o experimento ser **replicável**
(Passo 5) e para que a métrica seja auditável (ameaça G6).

### Definições exatas

Todas as métricas partem do mesmo **tokenizador** (`tokenizar`), que descarta
comentários, strings, template strings e literais de regex antes de qualquer
contagem — um `if` dentro de uma string não é um desvio de fluxo.

**LOC** — linhas não vazias que não são comentário (`//` ou dentro de `/* */`).
É a **mesma função** `contarLOC` usada pelo `npm run katas:validar`, então o LOC
de um trial e o LOC da solução de referência do kata são comparáveis.

**Complexidade ciclomática (McCabe), por função:**

```
CC = 1 + nº de:  if   for   while   do   case   catch   &&   ||   ??   ?:
```

- **não** contam: `else`, `switch`, `default`, `try`, `finally` (não criam
  caminho independente) — mesma convenção do `radon cc` e da métrica
  `complexity`/WMC do CK;
- `?.` (encadeamento opcional) **não** conta; `??` conta uma vez só;
- são detectadas declarações (`function f() {}`), expressões, *arrow functions* e
  métodos de classe/objeto;
- **funções aninhadas contam à parte**: cada ponto de decisão é atribuído à
  função mais interna que o contém, então uma closure não infla a função externa
  (convenção do Radon);
- pontos de decisão fora de qualquer função aparecem como `(nível de módulo)`.

Reportadas: `complexidade_ciclomatica_media` (a variável dependente de RQ3a),
`_max` (pior função) e `_total` (soma — o análogo do WMC do CK).

**Duplicação (`duplicacao_percentual`)** — no espírito do PMD CPD/jscpd, em
granularidade de **linha**:

1. considerar só as linhas significativas (mesmo critério do LOC), com espaços
   colapsados e `trim`;
2. deslizar uma janela de **5 linhas** consecutivas (`--min-linhas` muda esse
   valor; 5 é o padrão do jscpd), sem atravessar a fronteira entre arquivos;
3. se a mesma sequência aparece 2+ vezes, todas as linhas cobertas por todas as
   ocorrências são marcadas como duplicadas;
4. `duplicacao_percentual = linhas duplicadas / linhas significativas × 100`.

`clones_detectados` é o número de **trechos contíguos** marcados como duplicados
(um par de blocos idênticos de 5 linhas ⇒ 2 trechos).

*Diferença conhecida para o CPD:* o CPD compara **tokens** e detecta clones que
atravessam a formatação das linhas; aqui a comparação é por linha normalizada.
Para katas de 40–80 LOC sem refatoração automática a diferença é pequena, e a
mesma regra vale para os dois tratamentos — o que importa para a comparação
pareada. Um cross-check pontual pode ser feito com
`npx jscpd@4 --min-lines 5 trials/<trial_id>` (não é dependência do projeto).

**Volume de Halstead** — operadores = pontuação + palavras reservadas;
operandos = identificadores, números, strings e regex;
`V = (N1 + N2) × log₂(n1 + n2)`.

**Índice de Manutenibilidade** — a fórmula normalizada 0–100 do `radon mi`:

```
MI = max(0, 100 × (171 − 5.2·ln(V) − 0.23·G − 16.2·ln(LOC)) / 171)
```

com `V` = volume de Halstead, `G` = complexidade ciclomática total do arquivo e
`LOC` como acima. Métrica **exploratória** (sem hipótese formal), reportada como
leitura de apoio a RQ3a/RQ3b.

### Comandos

```bash
npm run metricas                                   # todos os trials -> data/metricas.csv
npm run metricas -- --trial P1_kata-03_com-ia      # um trial só
npm run metricas -- --dir katas/kata-01            # pasta avulsa (ex.: solução de referência)
npm run metricas -- --min-linhas 8 --incluir-testes
npm run metricas:juntar                            # trials.csv + metricas.csv
```

`data/metricas.csv` tem uma linha por trial, com `trial_id`, `participante`,
`kata`, `tratamento`, as métricas acima e `ferramenta_versao` (versão do coletor
e do Node usados na medição — exigência de replicação).

---

## 5. O ambiente e as ameaças à validade

| Ameaça ([desenho, seção H](DesenhoDoExperimento.md#h-ameaças-à-validade)) | O que este ambiente faz |
|---|---|
| **I3** — instrumentação da medição de tempo | relógio único no `cronometro.js`, censura automática em 35 min |
| **I4** — instrumentação da contagem de testes | `node --test` como fonte única da contagem; nada estimado |
| **I5** — contaminação entre tratamentos | procedimento de desligamento da IA no T0 + screencast + observador |
| **I6** — diferença de ambiente entre integrantes | Node fixado no `.nvmrc`, zero dependências, IDE única, `npm run ambiente:verificar` antes de cada sessão |
| **I10** — viés do experimentador | as definições de métrica estão fixadas **neste documento antes da coleta**; o cálculo é um script versionado, não uma inspeção manual |
| **C4** — complexidade/duplicação sem contexto | `loc` sai em toda linha do CSV, ao lado de complexidade e duplicação |
| **G6** — confiabilidade da medida | o coletor é determinístico e coberto por [`test/metricas.test.js`](../Sprint01/test/metricas.test.js); reexecutar sobre o mesmo código dá o mesmo número |

---

## 6. Checklist de preparação (uma vez, antes da coleta)

- [ ] Node ≥ 18 instalado nas três máquinas (`node -v`).
- [ ] `npm run ambiente:verificar` sem nenhuma FALHA em cada máquina.
- [ ] `npm test` passando (cronômetro, katas, CSV, estatísticas e métricas).
- [x] IDE decidida (VS Code); versão exata por máquina ainda a confirmar.
- [x] Assistente de IA e versão decididos (Claude, claude.ai free) e
      preenchidos na seção 1; os 3 integrantes precisam de acesso à **mesma**
      ferramenta.
- [ ] Procedimento de desligamento do T0 testado por cada integrante.
- [x] 6 katas em `katas/<id>/` com enunciado, solução de referência e suíte de
      aceitação; `npm run katas:validar` → **6 APROVADO, 0 REPROVADO** (S02).
- [x] Baseline: `npm run metricas -- --dir katas/<id>` rodado em cada solução de
      referência — ver tabela em
      [`ValidacaoDosKatas.md`](ValidacaoDosKatas.md#5-baseline-de-métricas-estáticas-s02).
- [ ] Kata de aquecimento (fora da análise) executado por cada integrante.
