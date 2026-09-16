# Lab02 — Passo 1: Desenho do Experimento

**Experimento:** Assistentes de IA generativa vs. codificação manual na
resolução de tarefas de programação.
**Desenho:** experimento controlado, _crossover / within-subject_,
contrabalanceado, _time-boxed_.

> Itens entre colchetes `[ ... ]` são decisões do grupo a fixar na S02 (nomes dos
> integrantes, ferramenta de IA e versão, temas dos katas). O restante já é o
> desenho adotado.
>
> **Status na S02:** ferramenta de IA fixada (Claude, claude.ai free), IDE
> fixada (VS Code), os 6 katas escritos/validados/aprovados (ver
> [`ValidacaoDosKatas.md`](ValidacaoDosKatas.md)), `P1 = Enzo Casaes` e
> `P2 = Cauê Moraes` registrados (logo, `P3 = Leonardo Viana`). Ainda em
> aberto: versão do VS Code/SO do Leonardo (ver [`Ambiente.md`](Ambiente.md)).

---

## GQM — Goal

Analisar **o uso de assistentes de IA generativa** na resolução de tarefas de
programação, com o propósito de **comparar** seu efeito frente à **codificação
manual**, com respeito a **tempo de resolução**, **qualidade funcional
(defeitos)** e **qualidade estrutural do código**, do ponto de vista do **grupo
pesquisador**, no contexto de **katas de dificuldade equivalente resolvidos por
estudantes de graduação sob condições controladas**.

### Questões (Q do GQM)

- **RQ1 — Tempo.** O uso de assistente de IA reduz o tempo para resolver a tarefa?
- **RQ2 — Defeitos.** O uso de assistente de IA reduz a quantidade de testes que
  falham no código produzido?
- **RQ3 — Estrutura.** O uso de assistente de IA altera a complexidade
  ciclomática ou a duplicação do código produzido?

---

## (A) Hipóteses

### Convenções

- **Unidade de observação pareada:** o **kata** (`k = 1..6`). Para cada kata e
  cada métrica, define-se `x_k^{IA}` = mediana da métrica entre os trials
  daquele kata resolvidos **com** IA e `x_k^{manual}` = mediana entre os trials
  resolvidos **sem** IA. A diferença pareada é
  `D_k = x_k^{IA} − x_k^{manual}` → **6 pares** por hipótese
  (ver [(G) Quantidade de medições](#g-quantidade-de-medições)).
- **Parâmetro testado:** `θ = μ̃(D)`, a **mediana das diferenças pareadas**
  (não a média — N pequeno, sensível a outliers, e há censura em RQ1).
- **Teste inferencial:** **Wilcoxon signed-rank pareado**, bilateral,
  `α = 0,05`. Pares com `D_k = 0` são descartados (redução de `n`); empates de
  posto recebem posto médio. Com `n = 6` o menor `p` bilateral atingível é
  `≈ 0,031` (unilateral `≈ 0,016`) — o desenho **consegue** rejeitar H₀ se o
  efeito for consistente nos 6 katas.
- **Direção:** as hipóteses são **bilaterais** (H₀ de "nenhum efeito"). Para RQ1
  e RQ2 há expectativa direcional (a literatura anedótica sugere IA **mais
  rápida** e com **mais testes passando**); reporta-se também o `p` unilateral
  correspondente, sinalizado como confirmatório-fraco.
- **Tamanho de efeito** (reportado sempre, junto do `p`): `r = |Z| / √n` para o
  Wilcoxon e a **diferença de medianas** `μ̃(D)` com seu IQR.
- **Análise secundária (descritiva, sem inferência):** as mesmas diferenças
  pareadas **por integrante** (`mediana dos 3 trials com IA` −
  `mediana dos 3 sem IA`) → 3 pares por métrica, apenas ilustrativos.

### RQ1 — Tempo

**Métrica:** `tempo_ate_verde` em segundos (time-to-green); trial que atinge o
time-box sem sucesso entra **censurado em 2100 s**.

- **H1₀:** `μ̃(D_tempo) = 0` — usar o assistente de IA **não altera** a mediana
  do time-to-green.
- **H1ₐ:** `μ̃(D_tempo) ≠ 0` — usar o assistente de IA **altera** a mediana do
  time-to-green. _Direção esperada:_ `μ̃(D_tempo) < 0` (com IA mais rápido).
- **Decisão:** rejeita-se H1₀ se `p_bilateral < 0,05`; o sinal de `μ̃(D_tempo)`
  indica se a IA acelerou ou atrasou.
- **Ressalva de construto:** a censura comprime a cauda alta do tratamento com
  mais falhas; um `μ̃(D_tempo) < 0` pode refletir **mais desistências no tempo**
  e não velocidade — por isso RQ1 só é interpretada **junto** de RQ2.

### RQ2 — Defeitos (qualidade funcional)

**Métrica primária:** `taxa_sucesso` = testes de aceitação passando / total, ao
fim do time-box (normaliza katas com números diferentes de testes).
**Complementar:** `testes_falhando` (contagem absoluta).

- **H2₀:** `μ̃(D_taxa_sucesso) = 0` — usar o assistente de IA **não altera** a %
  de testes de aceitação passando ao fim do time-box.
- **H2ₐ:** `μ̃(D_taxa_sucesso) ≠ 0`. _Direção esperada:_ `μ̃(D_taxa_sucesso) > 0`
  (com IA mais testes passam).
- **Decisão:** rejeita-se H2₀ se `p_bilateral < 0,05`.

### RQ3 — Estrutura do código

Duas sub-hipóteses **independentes**; **LOC é reportado junto de ambas** (métrica
de controle obrigatória — código gerado por IA tende a ser mais verboso, e
complexidade/duplicação sem normalizar por LOC engana). O MI entra como
aprofundamento exploratório.

**RQ3a — complexidade ciclomática média por função (McCabe):**

- **H3a₀:** `μ̃(D_complexidade) = 0` — o assistente de IA **não altera** a
  complexidade ciclomática média por função do código produzido.
- **H3aₐ:** `μ̃(D_complexidade) ≠ 0` — **sem direção esperada** (a IA tanto pode
  gerar código mais fatiado quanto mais denso).

**RQ3b — duplicação (% de linhas duplicadas):**

- **H3b₀:** `μ̃(D_duplicação) = 0` — o assistente de IA **não altera** o
  percentual de linhas duplicadas do código produzido.
- **H3bₐ:** `μ̃(D_duplicação) ≠ 0` — **sem direção esperada**.

- **Decisão (3a e 3b):** rejeita-se a H₀ correspondente se `p_bilateral < 0,05`.
  Como são 4 hipóteses no total (RQ1, RQ2, RQ3a, RQ3b), reporta-se também o `p`
  ajustado por **Holm**; a conclusão principal usa o `p` ajustado.

### Quadro-resumo

| Hip. | Métrica (pareada por kata) | H₀ | Hₐ | Direção esperada | Teste |
|---|---|---|---|---|---|
| **H1** | time-to-green (s), censura 2100 s | `μ̃(D) = 0` | `μ̃(D) ≠ 0` | `< 0` (IA + rápida) | Wilcoxon pareado, bilat., α = 0,05 |
| **H2** | taxa de sucesso dos testes | `μ̃(D) = 0` | `μ̃(D) ≠ 0` | `> 0` (IA + testes ok) | idem |
| **H3a** | complexidade ciclomática média/função | `μ̃(D) = 0` | `μ̃(D) ≠ 0` | — | idem |
| **H3b** | % de linhas duplicadas | `μ̃(D) = 0` | `μ̃(D) ≠ 0` | — | idem |

LOC acompanha H3a/H3b como controle; nº de prompts e MI são exploratórios (sem
teste de hipótese formal).

---

## (B) Variáveis dependentes

| Variável | Unidade | RQ | Papel | Coleta |
|---|---|---|---|---|
| `tempo_ate_verde` | segundos | RQ1 | **primária** | `src/cronometro.js` (time-to-green; **censurado em 2100 s** se o time-box de 35 min for atingido sem sucesso) |
| `num_prompts_ia` | contagem | RQ1 | exploratória | registrado no `parar`/`registrar` do cronômetro |
| `taxa_sucesso` | % (0–1) | RQ2 | **primária** | `testes_passando / testes_total` ao fim do time-box |
| `testes_falhando` | contagem | RQ2 | complementar | `testes_total − testes_passando` |
| `complexidade_ciclomatica_media` | McCabe / função | RQ3a | **primária** | [`src/metricas.js`](../Sprint01/src/metricas.js) sobre o código final do trial (`trials/<trial_id>/`) |
| `duplicacao_percentual` | % linhas | RQ3b | **primária** | idem (detecção estilo PMD CPD, janela de 5 linhas) |
| `loc` | linhas | RQ3 | **controle obrigatório** | idem (mesmo `contarLOC` do `validar-katas.js`) |
| `indice_manutenibilidade` | 0–100 | RQ3 | aprofundamento | idem — MI normalizado 0–100 (fórmula do `radon mi`) |

Definições exatas de cada métrica estática (o que conta como ponto de decisão, a
janela de duplicação, a fórmula do MI) e o ambiente de execução:
[`Ambiente.md`](Ambiente.md).

---

## (C) Variável independente

**Uso do assistente de IA generativa no trial** — fator único, 2 níveis
(`com-ia`, `sem-ia`). É a única coisa que muda entre os dois tratamentos; todo o
resto (participante, IDE, katas disponíveis, time-box, permissão de consultar
documentação oficial) é mantido constante.

---

## (D) Tratamentos

| | **T1 — com-ia (tratamento)** | **T0 — sem-ia (controle)** |
|---|---|---|
| Assistente de IA generativa | **habilitado** — **Claude (claude.ai), plano gratuito** (fixado na S02), usado à vontade (chat e/ou autocomplete) | **desligado** — sem chatbot aberto, autocomplete de IA desativado na IDE |
| Documentação / referência de linguagem | permitida | permitida (igual) |
| Busca na web / StackOverflow | permitida | permitida (igual) |
| IDE, linguagem, máquina | VS Code, JavaScript (Node 18+), mesma configuração | idem |
| Time-box | 35 min | 35 min |

Observação anti-contaminação: o trial `sem-ia` é conferido por
observador/screencast para garantir que nenhum assistente de IA foi consultado.

---

## (E) Objetos experimentais — katas

- **6 katas autorais** (número par → divisão exata 3 com-IA / 3 sem-IA por
  integrante), em **JavaScript / Node 18+**, cada um com **suíte de testes de
  aceitação automatizados** (`node:test` ou Jest).
- **Pouco indexados / autorais** — não usar clássicos de LeetCode / HackerRank /
  Codewars, para evitar que o assistente "recite" uma solução vista no
  treinamento (ver ameaça _memorização_ em H).
- **Critérios de equivalência de dificuldade** (todos os katas):
  - enunciado no mesmo formato (contexto + regras + exemplos);
  - **8–12 testes de aceitação** por kata;
  - solução de referência de **40–80 LOC**, sem dependências externas, sem I/O de
    rede/arquivo;
  - domínio "de negócio" neutro (nada de algoritmo de entrevista famoso).
- **Linguagem fixada em JavaScript**; como CK exige Java e Radon exige Python, o
  Passo 2 adotou [`src/metricas.js`](../Sprint01/src/metricas.js) — coletor em
  Node puro que calcula as mesmas métricas (McCabe, duplicação estilo PMD CPD,
  LOC e MI do Radon) com as definições clássicas, documentadas em
  [`Ambiente.md`](Ambiente.md).
- **Katas candidatos, rubrica de equivalência e protocolo de baixa indexação:**
  ver [`ValidacaoDosKatas.md`](ValidacaoDosKatas.md), o manifesto
  [`../Sprint01/katas.manifest.json`](../Sprint01/katas.manifest.json) e o
  validador [`../Sprint01/src/validar-katas.js`](../Sprint01/src/validar-katas.js)
  (`npm run katas:validar`). Os 6 candidatos autorais: kata-01 normalizador de
  mini-formato de notas, kata-02 agendador de salas sem conflito, kata-03
  tarifador de estacionamento por faixas, kata-04 validador de regras de cupom,
  kata-05 ranking com critérios de desempate, kata-06 interpretador de datas
  relativas. Conjunto homogêneo (testes ∈ [10,12], LOC ∈ [45,72], sem outliers);
  validação de indexação **pendente** para a S02.

---

## (F) Tipo de projeto experimental

**Crossover / within-subject, contrabalanceado (quadrado latino).**

- 3 integrantes, 6 katas, **cada integrante faz os 6 katas, individualmente**:
  3 com `T1` e 3 com `T0`. A divisão de trabalho da S02/Execução já é
  individual por construção do desenho — não há artefato compartilhado a
  repartir entre o trio nesta etapa, cada um roda a própria sequência.
- **Participantes:** `P1 = Enzo Casaes`; `P2 = Cauê Moraes`;
  `P3 = Leonardo Viana`. A ordem P1/P2/P3 é só um
  rótulo para a matriz abaixo; o que importa é que cada pessoa segue **uma
  linha inteira** (6 katas, contrabalanceados) e não troca de linha no meio da
  coleta.
- O contrabalanceamento neutraliza três fontes de variação: **(i)** habilidade
  individual (cada pessoa é seu próprio controle), **(ii)** efeito de
  aprendizado/ordem (posição do trial na sequência) e **(iii)** dificuldade
  residual de cada kata (cada kata é resolvido nos dois tratamentos, por pessoas
  diferentes).

### Matriz de tratamento (integrante × kata)

| | K1 | K2 | K3 | K4 | K5 | K6 | Σ com-ia |
|---|---|---|---|---|---|---|---|
| **P1** | com-ia | com-ia | com-ia | sem-ia | sem-ia | sem-ia | 3 |
| **P2** | sem-ia | sem-ia | com-ia | com-ia | com-ia | sem-ia | 3 |
| **P3** | com-ia | sem-ia | sem-ia | sem-ia | com-ia | com-ia | 3 |
| **Σ com-ia por kata** | 2 | 1 | 2 | 1 | 2 | 1 | **9 / 9** |

### Ordem de execução (posição 1→6) — evita confundir tratamento com ordem

| Integrante | 1º | 2º | 3º | 4º | 5º | 6º |
|---|---|---|---|---|---|---|
| **P1** | K1 · com-ia | K4 · sem-ia | K2 · com-ia | K5 · sem-ia | K3 · com-ia | K6 · sem-ia |
| **P2** | K6 · sem-ia | K3 · com-ia | K1 · sem-ia | K4 · com-ia | K2 · sem-ia | K5 · com-ia |
| **P3** | K2 · sem-ia | K5 · com-ia | K3 · sem-ia | K6 · com-ia | K4 · sem-ia | K1 · com-ia |

Cada integrante **alterna** os tratamentos ao longo da sessão; cada posição
1–6 recebe trials dos dois tratamentos ao longo do trio (totais 9 com-ia / 9
sem-ia). Sessões de no máximo 3 trials, com pausa de ~10 min entre elas.

---

## (G) Quantidade de medições

- **Trials:** 3 integrantes × 6 katas = **18 trials** (9 `com-ia`, 9 `sem-ia`).
- **Por trial** coleta-se: 1 `tempo_ate_verde` (ou censura em 2100 s),
  `testes_passando`/`testes_total`, `complexidade_ciclomatica_media`,
  `duplicacao_percentual`, `loc`, `indice_manutenibilidade`, `num_prompts_ia`.
- **Unidade da análise inferencial:** o **kata** → para cada uma das 6 katas
  forma-se o par `(agregado dos trials com-ia, agregado dos trials sem-ia)`,
  usando a **mediana** dentro de cada célula → **6 pares** por variável
  dependente → **Wilcoxon signed-rank** (com 6 pares, o menor `p` bilateral
  atingível ≈ 0,031; unilateral ≈ 0,016).
- **Análise descritiva:** mediana + IQR por tratamento (`n = 9` em cada),
  boxplots (Passo 6).
- Análise secundária (descritiva): pareamento por integrante — para cada `Pi`,
  `mediana(seus 3 trials com-ia)` vs `mediana(seus 3 trials sem-ia)` → 3 pares
  (sem poder inferencial, só ilustrativo).

---

## (H) Ameaças à validade

Classificação por Wohlin et al. Para cada ameaça: como ela distorceria o
resultado e a mitigação adotada no desenho.

### Validade interna — a diferença observada pode não vir do tratamento

| # | Ameaça | Como distorce | Mitigação |
|---|---|---|---|
| I1 | **Efeito de aprendizado / ordem** entre katas | o 6º trial sai melhor que o 1º só por prática; se um tratamento cai mais no fim, ganha de graça | crossover contrabalanceado (quadrado latino, [(F)](#f-tipo-de-projeto-experimental)); katas independentes; **tratamentos alternados** na sequência de cada integrante; registro da `ordem` no CSV para checar correlação ordem×tempo no Passo 4 |
| I2 | **Fadiga / queda de atenção** ao longo dos 6 trials (3,5 h) | trials tardios ficam mais lentos e com mais defeitos | no máx. **3 trials por sessão**, em 2 dias; pausa de ~10 min entre trials; hidratação/refeição antes |
| I3 | **Instrumentação — medição de tempo** | cronometragem manual inconsistente entre integrantes vira ruído ou viés | script único [`src/cronometro.js`](../Sprint01/src/cronometro.js), relógio único (`Date.now`), **censura automática** em 35 min, trial **nunca descartado**; `iniciar`/`parar` marcam início e fim sem digitação de tempo |
| I4 | **Instrumentação — contagem de testes** | contar testes "no olho" erra a taxa de sucesso | usar a saída do runner (`node:test`/Jest) como fonte; anotar `testes_passando/total` direto do relatório; conferência por 2ª pessoa nos trials censurados |
| I5 | **Contaminação entre tratamentos** (usar IA no trial "manual", ou hábitos de prompt vazando) | reduz a diferença real entre T1 e T0 | no T0: autocomplete de IA **desativado na IDE**, sem chatbot aberto, sem plugin; **screencast** de todos os trials; conferência por observador |
| I6 | **Diferença de ambiente** (máquina, IDE, rede, teclado) | quem usa a máquina mais rápida/IDE conhecida termina antes | mesma IDE, mesma config, mesma máquina-modelo; docs oficiais e busca na web permitidos **igualmente** nos dois tratamentos — só o assistente de IA varia |
| I7 | **Familiaridade prévia desigual com a ferramenta de IA** | integrante que já usa a ferramenta extrai mais dela | **ferramenta única** para o trio; sessão de aquecimento com 1 kata-treino (fora da análise); registrar no relatório a experiência prévia de cada um |
| I8 | **Seleção / habilidade individual** confundindo o efeito | um integrante muito mais forte puxa o tratamento que calhou de fazer mais vezes | desenho **within-subject** (cada pessoa é seu próprio controle) + contrabalanceamento; análise pareada por kata agrega os 3 integrantes em cada célula |
| I9 | **Difusão de tratamento** entre integrantes (comentar a solução de um kata com quem ainda não o fez) | quem faz o kata depois já sabe a resposta | os 3 integrantes resolvem **todos** os katas antes de qualquer discussão; sem conversa sobre katas durante a coleta |
| I10 | **Viés do experimentador** (o grupo torce pela IA) | escolhas ambíguas (o que conta como "verde", quando parar) pendem para o resultado desejado | critérios objetivos fixados **antes** da coleta (verde = 100% dos testes de aceitação; parada = verde ou time-box); regra de censura no próprio script |

### Validade de construto — as métricas podem não medir o conceito

| # | Ameaça | Como distorce | Mitigação |
|---|---|---|---|
| C1 | **"time-to-green" ≠ produtividade** | mede rapidez até os testes, não qualidade nem manutenção | interpretado **junto** de RQ2 (taxa de sucesso) e RQ3 (estrutura); nunca isolado |
| C2 | **Censura interage com o construto de "tempo"** | tratamento com mais falhas tem tempos "truncados" em 35 min → parece mais rápido | censura tratada como **dado** (2100 s), não removida; uso de mediana; se muitos censurados, Kaplan–Meier exploratório no Passo 4 |
| C3 | **"defeito" operacionalizado como teste de aceitação falhando** | testes de aceitação não cobrem todos os defeitos possíveis | katas com **8–12 testes** cobrindo casos normais + bordas; suíte fixada e revisada antes da coleta; complementar com `testes_falhando` absoluto |
| C4 | **complexidade/duplicação sem contexto** | código de IA mais verboso infla/desinfla as métricas | **LOC obrigatório** ao lado de RQ3a/RQ3b; MI (composto) como leitura de apoio |
| C5 | **nº de prompts como proxy de esforço** | 1 prompt longo ≠ 10 prompts curtos | mantido só como **exploratório**, para discussão qualitativa, sem hipótese |
| C6 | **mono-operação dos construtos** (1 métrica por RQ) | uma métrica ruim compromete a RQ inteira | cada RQ tem métrica primária + complementar/controle; triangulação entre as 3 RQs |
| C7 | **avaliação apreensiva / expectativa** (efeito Hawthorne) | saber que está sendo medido muda o comportamento nos dois tratamentos | afeta T1 e T0 igualmente; foco na **diferença** pareada, não no valor absoluto |

### Validade externa — limites de generalização

| # | Ameaça | Ressalva / mitigação |
|---|---|---|
| E1 | **Amostra:** 3 estudantes de graduação, N pequeno, não aleatório | resultados **exploratórios**; conclusões restritas ao perfil "estudante de graduação"; sem inferência para profissionais |
| E2 | **Tarefas:** katas de 40–80 LOC, função pura, sem base de código legada | discutir no relatório que o efeito da IA pode ser **maior** (boilerplate) ou **menor** (contexto grande) em software real |
| E3 | **Ferramenta:** um único assistente e uma única versão | conclusões limitadas a `[ferramenta + versão]`; registrar exatamente qual no Relatório Final |
| E4 | **Linguagem:** só JavaScript | efeito pode diferir em linguagens com mais/menos suporte dos modelos |
| E5 | **Ambiente:** time-box de 35 min e katas isolados | não representa desenvolvimento sustentado; generalização apenas para tarefas curtas e bem delimitadas |

### Validade de conclusão — a inferência estatística pode falhar

| # | Ameaça | Mitigação |
|---|---|---|
| G1 | **Baixo poder** (6 pares) → alto risco de **erro tipo II** | reportar **tamanho de efeito** (`r = |Z|/√n`, `μ̃(D)` + IQR) sempre; **não** afirmar "sem efeito" a partir de `p > 0,05` — dizer "não foi possível detectar" |
| G2 | **Múltiplas comparações** (RQ1, RQ2, RQ3a, RQ3b) inflam o erro tipo I | correção de **Holm** sobre os 4 `p`; conclusão principal usa o `p` ajustado |
| G3 | **Violação de premissas do teste** | Wilcoxon é **não paramétrico** (não exige normalidade); pareamento por kata respeita o desenho within-subject; empates com posto médio, `D_k = 0` descartados |
| G4 | **"fishing" / flexibilidade analítica** | métricas, agregação (mediana), unidade de pareamento (kata), teste (Wilcoxon) e `α` fixados **neste documento antes da coleta** |
| G5 | **Outliers** distorcendo a descritiva | detecção por IQR × 1,5 (`detectarOutliers` em [`src/estatisticas.js`](../Sprint01/src/estatisticas.js)); outliers **reportados e discutidos**, nunca removidos automaticamente |
| G6 | **Confiabilidade da medida** (repetir daria o mesmo?) | procedimento roteirizado (script + checklist); trials gravados em vídeo permitem re-medição |
| G7 | **Memorização / vazamento de solução** — katas famosos deixam a IA "recitar" solução vista no treino, inflando o efeito | katas **autorais e pouco indexados**, validados por protocolo dedicado — ver [`ValidacaoDosKatas.md`](ValidacaoDosKatas.md) e `npm run katas:validar`; enunciados **não publicados** antes da execução |

### Riscos residuais aceitos

- Com `n = 6` pares, só efeitos **grandes e consistentes** serão detectáveis; o
  estudo é assumidamente **exploratório / piloto**.
- P1 inicia a sequência com `com-ia` enquanto P2 e P3 iniciam com `sem-ia`
  ([tabela de ordem](#ordem-de-execução-posição-16--evita-confundir-tratamento-com-ordem));
  com 3 integrantes não há como equilibrar perfeitamente a 1ª posição — efeito
  registrado e discutido, não eliminado.
- A validação de baixa indexação depende de busca manual (Google/GitHub) num
  instante no tempo; a indexação pode mudar depois.

### Checklist de execução (Passo 3) para conter as ameaças

- [ ] IDE, tema, extensões e máquina idênticos; no T0, IA desligada e verificada.
- [ ] Screencast iniciado antes do `cronometro.js iniciar`.
- [ ] `--participante`, `--kata`, `--tratamento`, `--ordem` conferem com a
      [tabela de ordem](#ordem-de-execução-posição-16--evita-confundir-tratamento-com-ordem).
- [ ] Verde = 100% dos testes de aceitação do kata; nada além disso encerra o trial.
- [ ] `testes_passando/total` copiados do relatório do runner, não estimados.
- [ ] Pausa de ~10 min antes do próximo trial; no máx. 3 por sessão.
- [ ] Código final copiado para `trials/<trial_id>/` e `npm run metricas` rodado
      sobre ele (equivalente ao CK/PMD do enunciado — ver [`Ambiente.md`](Ambiente.md)).

---

## Escolha e justificativa das métricas por RQ

_(exigido no Passo 1 e a repetir no Relatório Final)_

| RQ | Métrica escolhida | Agregação | Por que esta | Métricas preteridas |
|---|---|---|---|---|
| **RQ1** | **time-to-green** (s), censurado em 2100 s | mediana + IQR por tratamento | métrica primária recomendada pelo enunciado; mediana pela sensibilidade da média a outliers com N pequeno; censura preserva os trials sem sucesso | nº de prompts (mantida só como exploratória) |
| **RQ2** | **taxa de sucesso** = % de testes de aceitação passando ao fim do time-box | mediana + IQR; Wilcoxon pareado por kata | normaliza katas com números diferentes de testes; mais robusta que a contagem bruta | nº absoluto de testes falhando (mantida como complementar); densidade por KLOC (katas de tamanho parecido, não agrega valor) |
| **RQ3a** | **complexidade ciclomática média por função** (McCabe) | mediana + IQR; **sempre reportada junto de LOC** | equivalente em JS à métrica `complexity`/WMC do CK | — |
| **RQ3b** | **% de linhas duplicadas** (janela de 5 linhas) | mediana + IQR; junto de LOC | equivalente em JS ao PMD CPD | — |
| **RQ3 (controle)** | **LOC** | reportada em toda tabela de RQ3 | obrigatória: código de IA pode ser mais verboso; complexidade/duplicação sem normalizar por LOC engana | — |
| **RQ3 (aprofundamento)** | **Índice de Manutenibilidade (MI)** | mediana + IQR | métrica composta (complexidade + LOC + Halstead), mais robusta que olhar cada uma isolada | — |

---

## Antecipação da análise (Passo 4)

1. **Descritiva:** mediana e IQR por tratamento para cada variável; boxplots
   (com-ia vs sem-ia) e tabela-resumo.
2. **Outliers:** método IQR × 1,5; listados e discutidos, não descartados
   automaticamente.
3. **Inferencial:** Wilcoxon signed-rank pareado sobre os **6 pares por kata**,
   bilateral, `α = 0,05`, para RQ1, RQ2, RQ3a e RQ3b.
4. **Tamanho de efeito:** `r = Z/√N` e diferença de medianas (com IQR) para cada
   RQ, reportados independentemente do `p`.
5. **Censura (RQ1):** trials censurados entram como 2100 s; se houver muitos,
   discutir com análise de sobrevivência exploratória (Kaplan–Meier) como
   complemento.
