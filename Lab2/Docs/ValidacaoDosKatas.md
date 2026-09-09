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

## 4. Katas candidatos (estado atual)

Os 6 estão descritos em `katas.manifest.json`. Situação da última execução de
`npm run katas:validar` (valores **planejados** — as pastas dos katas ainda
serão criadas na S02):

| id | título | domínio | testes | LOC | dificuldade | indexação | final |
|---|---|---|---|---|---|---|---|
| kata-01 | Normalizador de mini-formato de notas | processamento de texto | 10 | 55 | OK | pendente | **PENDENTE** |
| kata-02 | Agendador de salas sem conflito | agenda / intervalos | 11 | 50 | OK | pendente | **PENDENTE** |
| kata-03 | Tarifador de estacionamento por faixas | regra de negócio / tempo | 12 | 48 | OK | pendente | **PENDENTE** |
| kata-04 | Validador de regras de cupom | regra de negócio / e-commerce | 12 | 70 | OK | pendente | **PENDENTE** |
| kata-05 | Ranking com critérios de desempate | ordenação multichave | 10 | 45 | OK | pendente | **PENDENTE** |
| kata-06 | Interpretador de datas relativas | calendário / parsing | 12 | 72 | OK | pendente | **PENDENTE** |

**Homogeneidade do conjunto:** testes ∈ [10, 12], amplitude 2 (≤ 4 ✔);
LOC ∈ [45, 72], amplitude 27 (≤ 40 ✔); sem outliers → **conjunto homogêneo**.

**Equivalência qualitativa:** todos são funções puras `entrada → saída`, sem
estado global, sem dependências, exercitando parsing + regras condicionais +
uma pegadinha de borda (fim exclusivo, teto diário, limite de desconto, empates,
dias úteis). Nenhum exige estrutura de dados avançada.

### Pendências para fechar a validação (S02)

- [ ] Rodar o protocolo de indexação (seção 3) para os 6 katas e preencher
      `indexacao.hits_google`, `indexacao.hits_github_code`,
      `indexacao.reconhecido_pelo_assistente` e `medido_em` no manifesto.
- [ ] Criar `Sprint01/katas/<id>/` com `enunciado.md`, `solucao-referencia.js` e
      `<id>.test.js`; rodar `npm run katas:validar` para medir LOC/testes reais.
- [ ] Reescrever qualquer kata que reprovar (dificuldade ou indexação) e
      revalidar até **6 APROVADOS**.
- [ ] Fixar a ferramenta de IA (nome + versão) e registrar a experiência prévia
      de cada integrante com ela.

---

## 5. Reprodutibilidade

```bash
cd Lab2/Sprint01
npm run katas:validar                 # usa katas.manifest.json e a pasta katas/ se existir
node src/validar-katas.js --manifest katas.manifest.json --katas-dir katas
```

Saída: relatório no terminal + `data/validacao-katas.csv` (uma linha por kata,
com status e motivos). Código de saída **1** se algum kata estiver **REPROVADO**
(útil para checagem em CI); **0** se só houver APROVADO/PENDENTE.
