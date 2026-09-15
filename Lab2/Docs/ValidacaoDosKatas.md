# Lab02 — Validação dos katas (dificuldade comparável + baixa indexação)

Artefato da **Sprint 01** — pesquisa e validação dos objetos experimentais
(item **(E)** do [Desenho do Experimento](DesenhoDoExperimento.md)).

- Manifesto dos candidatos: [`../Sprint01/katas.manifest.json`](../Sprint01/katas.manifest.json)
- Script de validação: [`../Sprint01/src/validar-katas.js`](../Sprint01/src/validar-katas.js)
  (`npm run katas:validar` na pasta `Sprint01/`) → gera `data/validacao-katas.csv`.

---

## 1. Por que katas autorais

O experimento compara **usar** um assistente de IA com **não usar**. Se o kata é
um exercício clássico e muito indexado (LeetCode, HackerRank, Codewars,
"FizzBuzz", "Roman Numerals", "Bowling Game", etc.), o modelo de linguagem
provavelmente **viu a solução no treinamento** e a reproduz quase literalmente.
Nesse caso o tratamento deixa de medir "quanto a IA ajuda a resolver um
problema" e passa a medir "quão rápido a IA recita algo que já sabe" — o que
**infla artificialmente o efeito** e ameaça a validade de conclusão
(ver [ameaça _memorização / vazamento_](DesenhoDoExperimento.md#h-ameaças-à-validade)).

Decisão: **6 katas autorais**, de domínio de negócio neutro, com enunciado e
regras escritos pelo grupo, **não publicados em repositório público** antes da
execução do experimento.

### Fontes consultadas na pesquisa (e por que foram descartadas como katas)

| Fonte | Uso no laboratório | Por que não usar como kata |
|---|---|---|
| LeetCode / HackerRank / Codewars / Exercism | inspiração de _formato_ (enunciado + testes) | altíssima indexação; soluções em milhares de repositórios; modelos reconhecem pelo nome |
| "Kata clássicos" (FizzBuzz, Roman Numerals, Gilded Rose, Bowling, Mars Rover) | referência de _escopo_ (~1 h de trabalho) | canônicos; solução recitável pela IA |
| _Advent of Code_ | referência de dificuldade progressiva | enunciados e soluções amplamente publicados e discutidos |
| Enunciados autorais do grupo/professor | **adotado** | controláveis em tamanho, domínio e indexação |

---

## 2. Rubrica de equivalência de dificuldade

Todos os 6 katas devem satisfazer, **individualmente**:

| Critério | Faixa / regra | Verificação |
|---|---|---|
| Nº de testes de aceitação | **8 – 12** | automática (`validar-katas.js`) |
| LOC da solução de referência | **40 – 80** linhas efetivas | automática |
| Dependências externas | **0** (só a lib padrão de Node) | automática (campo do manifesto / `package.json` do kata) |
| I/O de rede ou arquivo | **não** — função pura `entrada → saída` | automática (campo do manifesto) |
| Formato do enunciado | contexto + regras numeradas + 2–3 exemplos de E/S | revisão por par |
| Domínio | regra de negócio neutra; **sem** algoritmo de entrevista famoso | revisão por par |
| Conhecimento exigido | apenas estruturas de dados básicas, strings, datas; sem estrutura avançada (grafos, DP, etc.) | revisão por par |

E o **conjunto** dos 6 deve ser homogêneo:

| Critério de conjunto | Regra |
|---|---|
| Amplitude do nº de testes (máx − mín) | **≤ 4** |
| Amplitude do LOC (máx − mín) | **≤ 40** |
| Outliers (método IQR × 1,5) em testes ou LOC | **nenhum** |

> As faixas [8–12] testes e [40–80] LOC vêm do enunciado do laboratório
> (katas "de dificuldade comparável", resolvíveis dentro do time-box de 35 min).
> Os limites de amplitude e o teste de outlier são do grupo, para garantir que
> nenhum kata seja sistematicamente mais pesado que os outros — o que
> confundiria o efeito do tratamento com o efeito do kata.

### Medição automática

Quando a pasta `Sprint01/katas/<id>/` existir (criada na S02), o script **mede**
os valores reais em vez de usar os planejados:

- **LOC**: linhas não vazias de `solucao-referencia.js` que não são comentário
  (`//` ou bloco `/* */`);
- **Nº de testes**: ocorrências de `it(` / `test(` nos arquivos `*.test.js`;
- divergência > 2 entre medido e planejado → o kata é **reprovado** até ser
  reescrito ou o planejado ser corrigido.

---

## 3. Protocolo de baixa indexação

Objetivo: estimar se cada kata (ou algo muito parecido) já está publicado e
indexado, a ponto de a IA "reconhecê-lo".

Para cada kata, o autor executa e **registra no manifesto** (`indexacao.*`):

1. **Frases distintivas** — 2 a 3 buscas que combinam o nome do kata, a
   assinatura da função e a combinação específica de regras (já preenchidas em
   `frases_distintivas`).
2. **Google** — rodar cada frase distintiva (com aspas nas expressões exatas).
   Anotar em `hits_google` o **maior** número de resultados _relevantes_ (que
   realmente descrevem o mesmo problema) na 1ª página; se nada relevante, `0`.
3. **GitHub code search** (`https://github.com/search?type=code`) — buscar a
   assinatura da função + 2 termos do enunciado. Anotar em `hits_github_code` o
   nº de arquivos distintos que implementam o mesmo problema.
4. **Teste de reconhecimento pelo assistente** — antes do experimento, colar o
   enunciado no assistente de IA escolhido e perguntar *"você reconhece este
   exercício? descreva a solução"*. Se ele devolver a solução canônica pronta
   (não apenas uma abordagem), marcar `reconhecido_pelo_assistente: true`.
5. Preencher `medido_em` com a data.

### Limiares de reprovação

Um kata é **reprovado por indexação** se **qualquer** um ocorrer:

| Sinal | Limite |
|---|---|
| `hits_google` (resultados relevantes) | **> 10** |
| `hits_github_code` (arquivos) | **> 5** |
| `reconhecido_pelo_assistente` | **true** |

Reprovado → reescrever: trocar o domínio, alterar as regras de borda, renomear a
função, ou combinar duas regras incomuns. Revalidar.

Enquanto `hits_google`/`hits_github_code` estiverem **nulos**, o kata fica
**PENDENTE** (não reprova — falta a medição).

---

## 4. Katas candidatos (estado atual — fechado na S02)

Os 6 estão descritos em `katas.manifest.json` e implementados em
[`../Sprint01/katas/`](../Sprint01/katas/) (`enunciado.md` +
`solucao-referencia.js` + `<id>.test.js` cada). Última execução de
`npm run katas:validar` (valores **medidos** sobre o código real):

| id | título | domínio | testes | LOC | dificuldade | indexação | final |
|---|---|---|---|---|---|---|---|
| kata-01 | Normalizador de mini-formato de notas | processamento de texto | 12 | 48 | OK | OK | **APROVADO** |
| kata-02 | Agendador de salas sem conflito | agenda / intervalos | 12 | 45 | OK | OK | **APROVADO** |
| kata-03 | Tarifador de estacionamento por faixas | regra de negócio / tempo | 12 | 42 | OK | OK | **APROVADO** |
| kata-04 | Validador de regras de cupom | regra de negócio / e-commerce | 12 | 45 | OK | OK | **APROVADO** |
| kata-05 | Ranking com critérios de desempate | ordenação multichave | 12 | 46 | OK | OK | **APROVADO** |
| kata-06 | Interpretador de datas relativas | calendário / parsing | 12 | 51 | OK | OK | **APROVADO** |

**Homogeneidade do conjunto:** testes ∈ [12, 12], amplitude 0 (≤ 4 ✔);
LOC ∈ [42, 51], amplitude 9 (≤ 40 ✔); sem outliers (IQR × 1,5) →
**conjunto homogêneo**. Os 6 katas passam nas 67 suítes de aceitação
correspondentes (`node --test katas/*/*.test.js`).

**Equivalência qualitativa:** todos são funções puras `entrada → saída`, sem
estado global, sem dependências, exercitando parsing + regras condicionais +
uma pegadinha de borda (fim exclusivo, teto diário, limite de desconto, empates,
dias úteis). Nenhum exige estrutura de dados avançada.

**Indexação (protocolo da seção 3):** para as 6 frases distintivas de cada
kata, `hits_google = 0` (nenhum resultado relevante descrevendo o mesmo
problema nas buscas realizadas) e `hits_github_code = 0` (nenhum repositório
encontrado implementando o mesmo problema). `reconhecido_pelo_assistente =
false` para os 6 — testado pedindo a uma instância nova do Claude (sem
contexto prévio da conversa que escreveu as soluções) para descrever a
solução a partir só do enunciado; nenhum kata foi reconhecido como exercício
publicado, apenas conceitos genéricos (interval scheduling, ranking com
desempate, etc.), o que não conta como reconhecimento pelo critério do
protocolo. Medição em `2026-09-15`, registrada em
`indexacao.observacao` de cada kata no manifesto.

> **Ressalva de método:** a busca no Google e o teste de reconhecimento foram
> feitos com as ferramentas disponíveis (busca web automatizada + uma
> instância isolada do Claude). O GitHub code search (`github.com/search?
> type=code`) exige login e não pôde ser automatizado; o proxy usado foi uma
> busca web restrita a `github.com`. **Recomendação:** antes da coleta real,
> um integrante logado no GitHub deve repetir rapidamente a busca de código
> das frases distintivas (seção 3) como conferência final — não é esperado
> que o resultado mude, dado que nenhuma pista de um kata equivalente
> apareceu em nenhuma das buscas já feitas.

### Pendências fechadas na S02

- [x] Rodar o protocolo de indexação (seção 3) para os 6 katas e preencher
      `indexacao.hits_google`, `indexacao.hits_github_code`,
      `indexacao.reconhecido_pelo_assistente` e `medido_em` no manifesto.
- [x] Criar `Sprint01/katas/<id>/` com `enunciado.md`, `solucao-referencia.js` e
      `<id>.test.js`; `npm run katas:validar` mede LOC/testes reais.
- [x] Nenhum kata reprovou (dificuldade ou indexação) → **6 APROVADOS** de
      primeira; não foi necessário reescrever nenhum.
- [x] Fixar a ferramenta de IA: **Claude (claude.ai), plano gratuito** — ver
      [`Ambiente.md`](Ambiente.md#1-ambiente-fixado).
- [ ] Registrar a experiência prévia de cada integrante com a ferramenta de
      IA fixada (pendente — depende dos 3 integrantes, não só de Enzo).

---

## 5. Baseline de métricas estáticas (S02)

`npm run metricas -- --dir katas/<id>` rodado sobre cada solução de
referência (checklist da seção 6 do [`Ambiente.md`](Ambiente.md)) — a faixa
esperada de LOC/complexidade/MI antes de qualquer trial real:

| id | LOC | funções | CC média | CC máx | duplicação | MI |
|---|---|---|---|---|---|---|
| kata-01 | 48 | 7 | 2,57 | 5 | 0% | 37,6 |
| kata-02 | 45 | 7 | 2,57 | 4 | 0% | 38,4 |
| kata-03 | 42 | 5 | 2,40 | 4 | 0% | 40,1 |
| kata-04 | 45 | 8 | 2,38 | 5 | 0% | 37,9 |
| kata-05 | 46 | 6 | 3,67 | 6 | 0% | 37,1 |
| kata-06 | 51 | 7 | 2,43 | 6 | 0% | 35,9 |

Nenhuma duplicação nas soluções de referência (esperado — são curtas e sem
repetição proposital); CC média entre 2,4 e 3,7 e MI entre 36 e 40, uma faixa
estreita e coerente com a homogeneidade de dificuldade da seção 4. Serve como
referência para RQ3: um trial `sem-ia`/`com-ia` muito acima dessa faixa (ex.:
CC média > 6 ou MI < 20) é candidato a outlier a discutir no Passo 4.

---

## 6. Reprodutibilidade

```bash
cd Lab2/Sprint01
npm run katas:validar                 # usa katas.manifest.json e a pasta katas/ se existir
node src/validar-katas.js --manifest katas.manifest.json --katas-dir katas
```

Saída: relatório no terminal + `data/validacao-katas.csv` (uma linha por kata,
com status e motivos). Código de saída **1** se algum kata estiver **REPROVADO**
(útil para checagem em CI); **0** se só houver APROVADO/PENDENTE.
