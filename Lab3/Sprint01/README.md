# Lab03 — Mineração de métricas DORA

Laboratório de Experimentação de Software — Laboratório 03.

Pipeline reprodutível que minera métricas DORA de repositórios open-source
populares que usam GitHub Actions, via API REST do GitHub (sem bibliotecas
prontas de acesso à API). Este README cobre, por enquanto, as etapas:

| Etapa | O que faz | Responsável |
|---|---|---|
| `repositorios` | seleção de repositórios, funil e metadados | Pessoa A, Issue #66 |
| `releases` | releases publicadas na janela e contagem para o critério mínimo | Pessoa B, Issue #67 |
| `leadtime` | commits entre releases e **lead time for changes (RQ 02)** | Pessoa B, Issue #67 |
| `runs` | workflow runs do default branch, **change failure rate (RQ 03 a)** e **tempo de recuperação (RQ 04)** | Pessoa C, Issue #68 |

As quatro rodam no mesmo comando (`npm run pipeline`), nessa ordem.

---

## Requisitos

- **Node.js 22.8 ou superior** (usa o `fetch` nativo e o `node --test` com
  cobertura). **Não** há `npm install`: o projeto não tem nenhuma dependência.
- Um token do GitHub (Personal access token, escopo `public_repo`).

## Configuração

### 1. Token (`GITHUB_TOKEN`)

```bash
cd Lab3/Sprint01
cp .env.example .env          # no PowerShell: Copy-Item .env.example .env
# edite o .env:  GITHUB_TOKEN=ghp_xxxxxxxx
```

Também funciona exportar a variável no terminal (`export GITHUB_TOKEN=...`),
que tem prioridade sobre o `.env`. O `.env` está no [.gitignore](.gitignore).
Sem token, o pipeline para antes de qualquer requisição com uma mensagem
explicando como gerá-lo. O token nunca é gravado em log, cache ou CSV.

### 2. Janela de observação e parâmetros (`config.json`)

Tudo o que muda entre execuções está em [config.json](config.json) (versionado,
para que o grupo replicador use exatamente os mesmos parâmetros):

```json
{
  "janela": { "inicio": "AAAA-MM-DD", "fim": "AAAA-MM-DD" },
  "selecao": {
    "estrelasAcimaDe": 1000,
    "quantidadeDeCandidatos": 1500,
    "tamanhoAlvoDaAmostra": 100,
    "minimoDeReleases": 5,
    "minimoDeWorkflowRuns": 50
  },
  "coleta": {
    "releasesPorPagina": 100,
    "maxPaginasDeReleases": 20,
    "commitsPorPagina": 100,
    "maxCommitsPorRelease": 1000,
    "runsPorPagina": 100,
    "maxPaginasDeRunsPorMes": 10
  },
  "diretorios": { "cache": "data/cache", "saida": "data" }
}
```

| Campo | Significado |
|---|---|
| `janela.inicio`, `janela.fim` | **Obrigatórios.** Datas fixadas pelo professor (seção 3 do enunciado), em UTC. O dia `fim` está dentro da janela. Não têm valor padrão: o pipeline se recusa a rodar sem elas. |
| `selecao.estrelasAcimaDe` | Busca `stars:>N` (enunciado: 1000). |
| `selecao.quantidadeDeCandidatos` | Quantos candidatos (os de mais estrelas) entram no topo do funil. Precisa ser bem maior que a amostra-alvo, porque muitos caem nos filtros. |
| `selecao.tamanhoAlvoDaAmostra` | Tamanho da amostra final (S01: 100; S02: ≥ 300). |
| `selecao.minimoDeReleases`, `minimoDeWorkflowRuns` | Critério mínimo de inclusão do enunciado (5 e 50). |
| `coleta.releasesPorPagina`, `commitsPorPagina` | `per_page` das listagens (máximo 100, o limite da API). |
| `coleta.maxPaginasDeReleases` | Teto de páginas de `/releases` por repositório. Ao ser atingido sem alcançar o início da janela, a coleta é marcada como `truncated` em vez de fingir que a lista acabou. |
| `coleta.maxCommitsPorRelease` | Teto de commits por comparação entre duas releases. Ver *Releases e lead time*. |
| `coleta.runsPorPagina` | `per_page` da listagem de workflow runs (máximo 100). |
| `coleta.maxPaginasDeRunsPorMes` | Teto de páginas por fatia mensal de runs. O padrão (10 × 100 = 1.000) é exatamente o limite que a API entrega numa consulta filtrada. |
| `diretorios.*` | Relativos à pasta do `config.json`. |

## Execução

```bash
cd Lab3/Sprint01

# pipeline completo (um único comando), na ordem das etapas
npm run pipeline                       # = node src/pipeline.js --config config.json

# uma etapa só
npm run coletar:repositorios           # seleção, funil e metadados (A)
npm run coletar:releases               # releases da janela (B)
npm run coletar:leadtime               # commits entre releases e lead time (B)
npm run coletar:runs                   # workflow runs, CFR (a) e recuperacao (C)

# opções
node src/pipeline.js --config outro.json   # outro arquivo de configuração
node src/pipeline.js --limite 20           # só os 20 repositórios com mais estrelas
node src/pipeline.js --sem-cache           # ignora o cache em disco (não recomendado)
LOG_LEVEL=debug npm run pipeline           # mostra também cada acerto de cache e a cota restante
```

**`--limite N`** processa apenas os `N` primeiros repositórios por número de
estrelas. Serve para experimentar e demonstrar a coleta em minutos, em vez de
horas. Os repositórios não processados continuam contados como `pending` no
funil — e não como se não tivessem releases —, então a amostra final **não** é
fechada enquanto houver limite. A coleta oficial roda **sem** a flag.

**Interrupção e retomada.** Cada resposta da API é salva em `data/cache/`
(um JSON por requisição). Se a execução parar — rate limit, queda de rede,
`Ctrl+C` — basta rodar o **mesmo comando** de novo: o que já foi respondido vem
do disco e só as chamadas que faltam vão à rede. Para refazer a coleta do zero
(ex.: atualizar as estrelas), apague `data/cache/`.

**Rate limit.** O cliente lê `X-RateLimit-Remaining`/`X-RateLimit-Reset` e,
quando a cota acaba, espera a renovação sozinho (a cota da busca, 30 req/min, é
controlada separadamente da cota geral). `429`/`403` com `Retry-After` esperam o
tempo indicado. Respostas `5xx` e falhas de rede são repetidas com backoff
exponencial (1 s, 2 s, 4 s, 8 s, 16 s); se persistirem, a execução para com
erro — sem gravar resultado parcial — e pode ser retomada.

Custo aproximado (estimativa, não medição):

| Etapa | Requisições |
|---|---|
| `repositorios` | ~10 páginas de busca por fatia, mais uma de `actions/workflows` por candidato e uma de `contributors` por candidato com Actions |
| `releases` | 1 a 3 por repositório (1 página de 100 releases costuma alcançar o início da janela) |
| `leadtime` | 1 por release avaliada, mais páginas extras nas comparações com mais de 100 commits |
| `runs` | 1 por **mês** da janela e por repositório (≈ 13 com a janela atual), mais páginas extras nos meses com mais de 100 runs |

Com a cota autenticada de 5.000 requisições/hora, a coleta completa das três
etapas leva algumas horas e atravessa mais de uma renovação de cota. Isso é
esperado: o cliente espera sozinho e o cache garante que nada é refeito.

## Como a seleção funciona

1. **Busca fatiada.** A busca do GitHub devolve no máximo 1.000 resultados por
   consulta, então ela é fatiada por faixas de estrelas, de cima para baixo:
   `stars:>1000` → `stars:1001..T₁` → `stars:1001..T₂` …, onde cada teto `Tᵢ` é
   a menor contagem de estrelas da fatia anterior (inclusive, para não perder
   empates; repetidos são descartados pelo id). Para ao reunir
   `quantidadeDeCandidatos` ou quando não há mais repositórios. Os candidatos
   são os de mais estrelas, desempatados por `full_name` — independente da
   ordem em que a API devolveu os itens. Cada fatia executada fica registrada
   em `search_slices` no JSON de saída. Se mais de 1.000 repositórios tiverem
   exatamente o mesmo número de estrelas, os excedentes são inalcançáveis por
   faixa: isso é detectado (consulta exata `stars:T`) e marcado como
   `truncated` na fatia.
2. **GitHub Actions.** `GET /repos/{owner}/{repo}/actions/workflows`: com
   `total_count = 0` o repositório é descartado (`no_github_actions`) antes de
   gastar outras chamadas. Erros HTTP também descartam, com o motivo
   registrado (ex.: `actions_http_404`).
3. **Metadados.** Estrelas, linguagem, `default_branch`, datas e URL vêm do
   próprio item da busca. Contribuidores:
   `GET /repos/{owner}/{repo}/contributors?per_page=1&anon=true` — o número da
   última página no cabeçalho `Link` é o total. Sem `Link` (0 ou 1
   contribuidor) usa o tamanho da lista; `204` (repositório vazio) é 0. Se o
   GitHub não calcular (histórico grande demais → `403`) o valor fica vazio e o
   motivo vai para `metadata_errors` — o repositório **não** é excluído por
   isso.
4. **Critério mínimo e amostra final.** As contagens de releases e de workflow
   runs válidos são produzidas pelas etapas de B e C. Esta etapa já deixa os
   campos e a regra prontos (ver *Integração com B e C*). Enquanto essas
   etapas não rodarem, as linhas correspondentes do funil aparecem como
   pendentes (`complete = false`).

**Idade do repositório** = `fim da janela − created_at` (em dias completos, e
em anos = dias / 365,25). A referência é o fim da janela — e não a data da
execução — para que a idade não dependa do dia em que a coleta rodou.
`created_relative_to_window` indica se o repositório foi criado antes, dentro
(exposição menor que 12 meses) ou depois da janela.

## Releases e lead time (RQ 02)

### Definições operacionais

Um **deploy** é uma release publicada: `draft = false`, `prerelease = false` e
`published_at` preenchido (seção 3 do enunciado). Pré-releases e rascunhos
**não** entram na definição principal, mas continuam no CSV, classificados,
porque a variante C2 da RQ 07 ("release + pré-release") precisa deles sem uma
nova coleta.

A **sequência de deploys** de um repositório são suas deploy releases ordenadas
por `published_at` crescente (empate pelo `id`, para a ordem não depender de
como a API respondeu). A **release anterior** de R é o elemento imediatamente
anterior dessa sequência, e **pode estar fora da janela** — por isso a coleta
de `/releases` pagina até encontrar a primeira deploy release publicada antes
do início da janela. Se R é a primeira release da história do repositório, R é
ignorada no lead time, como manda o enunciado.

Os **commits de R** vêm de `GET /compare/{tag da anterior}...{tag de R}`, e a
data de um commit é `commit.author.date` (quando a mudança foi escrita).

| Variante | Fórmula | Valor do repositório |
|---|---|---|
| **(a) por release** | `published_at(R) − data do commit mais antigo de R` | mediana das suas releases da janela |
| **(b) por commit** | `published_at(R) − data do commit`, para cada commit | mediana de **todos** os commits de **todas** as releases |

A unidade canônica é **horas** (decimais, 3 casas); os CSVs também trazem a
coluna em dias, por legibilidade. Medianas e IQR usam percentil com
interpolação linear — o mesmo método padrão do `numpy.percentile` —, para que a
análise em Python da Sprint 03 reproduza exatamente estes números.

*Conferindo com o exemplo do enunciado:* `v1.1` publicada em 15/03 incluindo
commits de 02/03, 10/03 e 14/03 dá **13 dias** na variante (a), e contribui com
13, 5 e 1 dias para a (b). Esse caso está em
[test/leadtime.test.js](test/leadtime.test.js).

### Casos de borda

Nenhum é descartado em silêncio: todos aparecem contados em `lead_time.csv` e
com o motivo em `release_commits.csv`.

| Situação | Tratamento |
|---|---|
| R é a primeira release da história | ignorada (`no_predecessor`), contada em `releases_skipped_no_predecessor` |
| Release sem commits novos (`total_commits = 0`) | fora das duas variantes (`no_new_commits`) |
| Commit sem `author.date` | o commit é ignorado; os demais da release continuam valendo |
| **Lead time negativo** | o valor é **mantido** e contado em `negative_lead_time_commits`. Acontece quando rebase ou squash merge reescrevem `author.date` para depois da publicação da release. Descartar esses casos esconderia exatamente a distorção que o enunciado pede para registrar como ameaça à validade de construto |
| Comparação acima de `maxCommitsPorRelease` | release marcada como `truncated`: sai da variante (b), onde faltariam commits, mas **permanece** na (a), porque o `compare` devolve os commits em ordem cronológica e o mais antigo está na primeira página |
| Tag apagada depois da release (404) ou comparação inválida (422) | motivo registrado na linha da release; a coleta continua |
| `/releases` indisponível (404, 403) | o repositório fica **`pending`** no funil, e não excluído: erro de coleta não é o mesmo que "tem menos de 5 releases" |

### Por que duas etapas separadas

`releases` custa ~1 requisição por repositório e **precisa** rodar nos 1.321
candidatos: sem a contagem de todos, o corte dos 100 com mais estrelas seria
enviesado (um repositório de rank 500 com releases suficientes nunca seria
avaliado). Já `leadtime` custa 1 requisição por **release**, e por isso só roda
nos repositórios que passaram no mínimo de 5 releases — gastar `compare` em
quem já saiu do funil seria desperdício de cota.

A etapa `leadtime` relê as releases pelo mesmo `coletarReleases`, que vem
inteiro do cache em disco (zero requisições de rede). Assim há uma única fonte
de verdade, sem risco de o CSV divergir da coleta.

## Workflow runs, CFR (RQ 03 a) e tempo de recuperação (RQ 04)

### Definições operacionais

Entram no cálculo apenas os runs do **default branch** disparados por **push**
(`event = push`), com `run_started_at` dentro da janela. A classificação segue
a tabela da seção 3 do enunciado:

| `conclusion` | Classificação |
|---|---|
| `success` | sucesso |
| `failure`, `timed_out`, `startup_failure` | falha |
| `cancelled`, `skipped`, `neutral`, `action_required`, `stale`, vazio (em andamento) | **ignorado** — fora de todos os cálculos |

Conclusões que o enunciado não previu (a API pode ganhar valores novos) também
são ignoradas, mas contadas em `unknown_conclusions`, para que uma mudança da
API apareça no relato em vez de sumir.

**CFR, variante (a) — proxy de CI:** `falhas ÷ (falhas + sucessos)`. Sem nenhum
run válido a taxa fica **vazia**, e não zero: "não medido" é diferente de
"nenhuma falha". Essa variante mede **falha de pipeline**, não falha em
produção — a diferença é discutida nas ameaças de construto do artigo. A
variante (b), de release corretiva, é da Sprint 02.

**Tempo de recuperação (RQ 04):** dentro de **cada workflow**, em ordem
cronológica por `run_started_at`, um **episódio de falha** começa na primeira
falha depois de um sucesso e termina na próxima execução bem-sucedida do mesmo
workflow. O tempo do episódio é `updated_at do sucesso − run_started_at da
primeira falha`, em horas. O valor do repositório é a **mediana** dos episódios
de todos os seus workflows. Execuções ignoradas no meio não abrem, não fecham e
não quebram episódio.

*Conferindo com o exemplo do enunciado:* 09:00 `success`, 10:00 `failure`,
10:30 `failure`, 11:15 `success` terminando 11:20 → um episódio de **1h20**
(1,333 h). Esse caso está em [test/runs-metricas.test.js](test/runs-metricas.test.js).

### Por que a janela é fatiada em meses

Com filtros, `GET /actions/runs` devolve no máximo **1.000 resultados por
consulta**, e a API não avisa quando corta — ela simplesmente para de paginar.
Um repositório ativo passa de 1.000 runs em 12 meses com folga. Por isso a
coleta pede **um mês de cada vez** (`created=AAAA-MM-DD..AAAA-MM-DD`), e cada
fatia é conferida contra o `total_count` da resposta, que traz o número real.
Fatia acima do teto é marcada como `truncated` em `raw/workflow_runs.json`,
nunca convertida silenciosamente num número menor. Como cada fatia é uma URL
própria, o cache guarda mês a mês: uma execução interrompida em junho retoma
sem rebaixar os meses já coletados.

### Casos de borda

| Situação | Tratamento |
|---|---|
| **Episódio sem recuperação até o fim da janela** | **censura à direita**: fica com `censored = 1`, **fora da mediana**, e a proporção vai para `recovery_censored_ratio`. Nunca é descartado — descartar faria o repositório parecer mais rápido do que é |
| **Falhas no início da janela, sem nenhum sucesso antes** | **censura à esquerda**: pela definição do enunciado o episódio começa na primeira falha *após um sucesso*, então essas falhas não formam episódio. Ficam no CSV com `prior_success = 0` e são contadas em `episodes_without_prior_success`, para que a Sprint 03 possa refazer a conta incluindo-as |
| Execuções `cancelled`, `skipped`, em andamento… | ignoradas: não entram no CFR, não contam para o mínimo de 50 e não interferem nos episódios |
| Run de outro branch ou outro evento que escape do filtro da URL | descartado na classificação e contado em `other_branch_runs` / `other_event_runs` |
| `updated_at` anterior ao início da falha (dado inconsistente) | episódio contado em `negative_recovery_episodes` e deixado fora da mediana |
| Fatia mensal com mais runs que o teto da consulta | `truncated = 1` na fatia e `truncated_slices > 0` no repositório |
| `/actions/runs` indisponível (404, 403) numa fatia | a coleta do repositório para e ele fica **`pending`** no funil, e não excluído: contar só as fatias que vieram o eliminaria por "menos de 50 runs" sem ter medido |

### Por que a etapa roda depois de `releases`

Cada repositório custa ~13 requisições (uma por mês da janela). Quando `runs`
roda depois de `releases`, quem ficou abaixo de 5 releases já saiu do funil e
não gasta cota. A etapa devolve `valid_workflow_runs` pela mesma interface de
B (`atualizarCriterios`), que aplica o mínimo de 50 runs e, quando não resta
nenhum pendente, fecha a amostra final.

## Arquivos gerados

| Arquivo | Etapa | Conteúdo |
|---|---|---|
| `data/raw/repositories.json` | `repositorios` | Tudo: data de geração, janela, parâmetros da seleção, fatias da busca e um registro por candidato. |
| `data/processed/candidates.csv` | `repositorios` | Todos os candidatos, **inclusive os descartados** (com etapa e motivo). Trilha de auditoria. |
| `data/processed/repositories.csv` | `repositorios` | Só os que seguem no pipeline — **entrada das etapas de B e C**. |
| `data/processed/selection_funnel.csv` | `repositorios` | Funil de seleção para a Metodologia do artigo. |
| `data/processed/releases.csv` | `releases` | Uma linha por release coletada, classificada (deploy, pré-release, rascunho, dentro/fora da janela). |
| `data/raw/releases.json` | `releases` | Resumo da coleta por repositório: contagens, páginas lidas, truncamento e erros. |
| `data/processed/release_commits.csv` | `leadtime` | Uma linha por release avaliada: a comparação usada, o commit mais antigo e o lead time da variante (a). |
| `data/processed/lead_time.csv` | `leadtime` | **Uma linha por repositório: as duas variantes do lead time.** Entrada da análise da RQ 02. |
| `data/raw/lead_time.json` | `leadtime` | Detalhe por release, mais as definições operacionais usadas, para auditoria e replicação. |
| `data/processed/workflow_runs.csv` | `runs` | Uma linha por workflow run coletado, já classificado (sucesso, falha, ignorado). Dado bruto da RQ 03 (a) e da RQ 04. |
| `data/processed/recovery_episodes.csv` | `runs` | Uma linha por episódio de falha: início, recuperação, duração e censura. |
| `data/processed/dora_runs.csv` | `runs` | **Uma linha por repositório: contagens, CFR (a) e tempo de recuperação.** Entrada da análise das RQ 03 e RQ 04. |
| `data/raw/workflow_runs.json` | `runs` | Fatias mensais pedidas (com `total_count` e truncamento), contagens e erros por repositório, mais as definições operacionais usadas. |

`data/raw/` e `data/processed/` são versionados (os demais integrantes e o
grupo replicador partem da mesma seleção); `data/cache/` não.

### Colunas de `candidates.csv` / `repositories.csv`

| Coluna | Tipo | Origem / definição |
|---|---|---|
| `rank` | inteiro | Posição do candidato (estrelas desc, desempate por `full_name`). |
| `id` | inteiro | `id` do repositório na API (estável mesmo se o repositório for renomeado). |
| `full_name`, `owner`, `name` | texto | `full_name`, `owner.login`, `name`. |
| `html_url` | texto | `html_url`. |
| `default_branch` | texto | `default_branch` — o único branch considerado nas métricas. |
| `stars` | inteiro | `stargazers_count` no momento da busca. |
| `language` | texto | `language` (linguagem principal); vazio se o GitHub não detectou. |
| `contributors` | inteiro | Total de contribuidores, incluindo anônimos (`anon=true`); vazio se indisponível. |
| `created_at`, `updated_at`, `pushed_at` | ISO 8601 (UTC) | Campos homônimos da API. |
| `archived` | booleano | `archived`. |
| `age_days` | inteiro (dias) | `floor((fim da janela − created_at) / 1 dia)`. |
| `age_years` | decimal (anos) | `(fim da janela − created_at) / 365,25 dias`, 2 casas. |
| `created_relative_to_window` | texto | `before_window`, `within_window` ou `after_window`. |
| `has_github_actions` | booleano | `actions/workflows` `total_count > 0`; vazio se a consulta falhou. |
| `workflow_count` | inteiro | `total_count` de `actions/workflows`. |
| `releases_in_window` | inteiro | **Preenchido pela etapa `releases` (B).** Deploy releases na janela: `draft = false` **e** `prerelease = false`. Pré-releases têm coluna própria em `lead_time.csv`. Vazio = a coleta falhou para esse repositório (≠ zero releases). |
| `valid_workflow_runs` | inteiro | **Preenchido pela etapa de C.** Runs `event = push` no default branch, na janela, com `conclusion` de sucesso ou falha. |
| `status` | texto | `pending` (aguarda etapas seguintes), `eligible` (cumpre o critério, aguarda o corte), `included` (amostra final), `excluded`. |
| `excluded_at_stage` | texto | Etapa do funil em que foi descartado. |
| `exclusion_reason` | texto | Motivo (ver abaixo). |
| `metadata_errors` | texto | Problemas de metadado que **não** excluem o repositório, separados por `;`. |
| `collected_at` | ISO 8601 | Instante em que a resposta da busca foi obtida da API. |

### Colunas de `selection_funnel.csv`

| Coluna | Significado |
|---|---|
| `order`, `stage`, `description` | Etapa: `candidates` → `has_github_actions` → `min_releases` → `min_workflow_runs` → `final_sample`. |
| `entered` | Quantos chegaram à etapa. |
| `remaining` | Quantos passaram. |
| `excluded` | Quantos foram descartados nela. |
| `pending` | Quantos dependem de uma etapa ainda não executada. |
| `complete` | `false` enquanto houver pendentes nesta etapa ou numa anterior. |
| `exclusion_reasons` | Contagem por motivo, formato `motivo:quantidade;motivo:quantidade`. |

Vale sempre `entered = remaining + excluded + pending`.

### Colunas de `releases.csv`

| Coluna | Tipo | Origem / definição |
|---|---|---|
| `full_name` | texto | Repositório dono da release. |
| `release_id` | inteiro | `id` da release na API. |
| `tag_name` | texto | `tag_name` — é o ref usado no `compare`. Vazio = release sem tag (não pode ser comparada). |
| `name` | texto | Título da release (`name`). |
| `draft`, `prerelease` | booleano | Campos homônimos da API. |
| `published_at` | ISO 8601 (UTC) | Instante da publicação. **É a "data do deploy"** nas duas variantes do lead time. Vazio em rascunho. |
| `created_at` | ISO 8601 (UTC) | Criação da release (é por este campo que a API ordena a listagem). |
| `target_commitish` | texto | Branch ou commit de origem da tag. |
| `html_url` | texto | Página da release no GitHub. Serve de atalho para a planilha da validação manual (seção 6 do enunciado). |
| `in_window` | booleano | `published_at` dentro da janela de observação. |
| `is_deploy` | booleano | `draft = false` **e** `prerelease = false` **e** `published_at` preenchido. |
| `deploy_index` | inteiro | Posição na sequência de deploys do repositório (1 = o mais antigo coletado). Vazio para quem não é deploy. |

### Colunas de `release_commits.csv`

| Coluna | Tipo | Origem / definição |
|---|---|---|
| `full_name`, `release_id`, `tag_name`, `published_at` | — | Identificam a release avaliada. |
| `base_tag` | texto | Tag da **release anterior**, o `base` do `compare`. |
| `commits_total` | inteiro | `total_commits` da resposta do `compare` (tamanho real da comparação). |
| `commits_fetched` | inteiro | Quantos commits foram efetivamente lidos (menor que `commits_total` se truncou). |
| `oldest_commit_date` | ISO 8601 (UTC) | `commit.author.date` do commit mais antigo da comparação. |
| `lead_time_hours` | decimal (horas) | **Variante (a):** `published_at − oldest_commit_date`. Pode ser negativo. Vazio quando a release não foi avaliada. |
| `lead_time_days` | decimal (dias) | `lead_time_hours / 24`. |
| `truncated` | booleano | A comparação tem mais commits do que o teto permitiu ler. |
| `negative_commits` | inteiro | Commits desta release com data posterior à publicação (rebase/squash). |
| `status` | texto | `evaluated`, `no_predecessor`, `no_new_commits`, `missing_tag_name` ou `error`. |
| `error` | texto | Motivo quando `status` não é `evaluated`: `compare_http_<status>`, `compare_unexpected_response`, `missing_tag_name`. |

### Colunas de `lead_time.csv`

| Coluna | Tipo | Origem / definição |
|---|---|---|
| `full_name` | texto | Repositório. |
| `releases_total` | inteiro | Releases coletadas (inclui as de fora da janela e os rascunhos). |
| `releases_in_window` | inteiro | Deploy releases na janela. **É o numerador da RQ 01** (deployment frequency). |
| `prereleases_in_window` | inteiro | Pré-releases publicadas na janela. Para a variante C2 da RQ 07. |
| `published_releases_in_window` | inteiro | `releases_in_window + prereleases_in_window`. |
| `releases_evaluated` | inteiro | Releases que entraram no cálculo do lead time. |
| `releases_skipped_no_predecessor` | inteiro | Ignoradas por serem a primeira release da história. |
| `releases_without_commits` | inteiro | Comparação sem nenhum commit com data. |
| `releases_with_error` | inteiro | Comparação que falhou (ver `errors`). |
| `truncated_releases` | inteiro | Releases cuja comparação excedeu o teto de commits. |
| `commits_used` | inteiro | Commits que entraram na variante (b). |
| `negative_lead_time_commits` | inteiro | Total de commits com lead time negativo. **Ameaça à validade de construto.** |
| `lead_time_release_median_hours` | decimal (horas) | **Variante (a):** mediana do lead time das releases avaliadas. Vazio quando nenhuma release pôde ser avaliada. |
| `lead_time_release_median_days` | decimal (dias) | A mesma mediana, em dias. É a coluna que se compara com a tabela DORA (`< 1 dia` = Elite). |
| `lead_time_release_iqr_hours` | decimal (horas) | IQR (Q3 − Q1) da variante (a) dentro do repositório. |
| `lead_time_commit_median_hours` / `_days` / `_iqr_hours` | decimal | O mesmo, para a **variante (b)**, sobre todos os commits das releases não truncadas. |
| `errors` | texto | Contagem por motivo, formato `motivo:quantidade;motivo:quantidade`. |


### Colunas de `workflow_runs.csv`

| Coluna | Tipo | Origem / definição |
|---|---|---|
| `full_name` | texto | Repositório dono do run. |
| `run_id`, `workflow_id`, `run_number`, `run_attempt` | inteiro | Campos homônimos da API. O `workflow_id` é o que agrupa os episódios da RQ 04. |
| `workflow_name` | texto | `name` do run (nome do workflow). |
| `head_branch`, `event`, `status` | texto | Campos homônimos. Só `event = push` no default branch entra nos cálculos. |
| `conclusion` | texto | `conclusion` da API; vazio em execução ainda em andamento. |
| `classification` | texto | `success`, `failure` ou `ignored`, pela tabela acima. |
| `run_started_at` | ISO 8601 (UTC) | Início do run. **É o início do episódio de falha.** Cai para `created_at` quando a API não envia. |
| `updated_at` | ISO 8601 (UTC) | Fim do run. **É o fim do episódio** quando o run é o sucesso que recupera. |
| `created_at` | ISO 8601 (UTC) | Criação do run (é por este campo que a API filtra em `created=`). |
| `in_window` | booleano | `run_started_at` dentro da janela. |
| `html_url` | texto | Página do run no GitHub. |

### Colunas de `recovery_episodes.csv`

| Coluna | Tipo | Origem / definição |
|---|---|---|
| `full_name`, `workflow_id`, `workflow_name` | — | Identificam o workflow. Episódios **não** atravessam workflows. |
| `episode_index` | inteiro | Posição do episódio dentro do workflow (1 = o mais antigo). |
| `first_failure_run_id`, `first_failure_at` | — | Run e instante da primeira falha do episódio. |
| `recovery_run_id`, `recovered_at` | — | Run e instante do sucesso que encerrou o episódio. Vazios se censurado. |
| `failed_runs_in_episode` | inteiro | Quantas execuções falharam dentro do episódio. |
| `recovery_hours` | decimal (horas) | `recovered_at − first_failure_at`. Vazio se censurado. |
| `censored` | 0/1 | 1 = a falha não foi recuperada dentro da janela. |
| `prior_success` | 0/1 | 0 = não houve sucesso antes dessa falha na janela (censura à esquerda); esses episódios ficam fora da mediana. |

### Colunas de `dora_runs.csv`

| Coluna | Tipo | Origem / definição |
|---|---|---|
| `full_name`, `rank`, `default_branch` | — | Identificação do repositório. |
| `runs_total`, `runs_in_window` | inteiro | Runs coletados e os que caem dentro da janela. |
| `valid_workflow_runs` | inteiro | **Critério mínimo (>= 50):** `push` no default branch, na janela, com sucesso ou falha. |
| `successful_runs`, `failed_runs` | inteiro | Numerador e complemento do CFR (a). |
| `ignored_runs`, `other_event_runs`, `other_branch_runs` | inteiro | Runs descartados por conclusão ignorada, por evento e por branch. |
| `unknown_conclusions` | inteiro | Conclusões fora da tabela do enunciado (vigia mudanças da API). |
| `workflows_with_valid_runs` | inteiro | Quantos workflows distintos têm runs válidos. |
| `change_failure_rate_ci` | decimal 0–1 | **RQ 03 (a):** `failed_runs / (failed_runs + successful_runs)`. Vazio se não há run válido. |
| `recovery_episodes` | inteiro | Episódios com sucesso anterior (os que valem pela definição do enunciado). |
| `recovery_episodes_recovered`, `recovery_episodes_censored` | inteiro | Quantos terminaram e quantos seguem em aberto no fim da janela. |
| `recovery_censored_ratio` | decimal 0–1 | Proporção de censurados — reportada junto da mediana, como pede o enunciado. |
| `episodes_without_prior_success` | inteiro | Falhas iniciais sem sucesso anterior (censura à esquerda), fora da mediana. |
| `recovery_median_hours` / `_days` | decimal | **RQ 04:** mediana dos episódios recuperados. A coluna em dias é a que se compara com a tabela DORA (`< 1 hora` = Elite). |
| `recovery_iqr_hours` | decimal (horas) | IQR (Q3 − Q1) dos episódios do repositório. |
| `negative_recovery_episodes` | inteiro | Episódios com duração negativa (dado inconsistente da API), fora da mediana. |
| `truncated_slices` | inteiro | Fatias mensais que passaram do teto de 1.000 resultados. |
| `error` | texto | `runs_http_<status>` ou `runs_unexpected_response` quando a coleta falhou (o repositório segue pendente no funil). |

**Motivos de exclusão:** `no_github_actions`, `actions_http_<status>`,
`actions_unexpected_response`, `fewer_than_5_releases_in_window`,
`fewer_than_50_valid_workflow_runs_in_window`, `beyond_target_sample_size`.
**Motivos de falha na coleta de releases/commits:** `releases_http_<status>`,
`releases_unexpected_response`, `compare_http_<status>`,
`compare_unexpected_response`, `missing_tag_name`.
**Motivos de falha na coleta de workflow runs:** `runs_http_<status>`,
`runs_unexpected_response`.
**Problemas de metadado:** `contributors_list_too_large`,
`contributors_http_<status>`, `contributors_unexpected_response`,
`contributors_missing_last_page`, `contributors_invalid_link_header`,
`missing_default_branch`, `invalid_created_at`.

## Integração entre as etapas

A etapa de seleção não depende das implementações de B e C; a ligação é feita
por dados e por três funções de [src/selecao/index.js](src/selecao/index.js).
A etapa `releases` já usa esse contrato — é o modelo para a etapa de C:

```js
import { repositoriosParaColeta, atualizarCriterios } from "./selecao/index.js";
import { estaNaJanela } from "./janela.js";

// 1. Lista a processar (status != excluded), com owner, name, full_name e default_branch.
const repos = repositoriosParaColeta(config.diretorios.saida);

// 2. B e C coletam usando o MESMO cliente (cache + rate limit) recebido no contexto
//    da etapa, e filtram por data com estaNaJanela(data, config.janela).

// 3. Devolvem as contagens; a regra 5 releases / 50 runs, a amostra final e o
//    funil são aplicados e regravados aqui. B e C podem informar em momentos diferentes.
atualizarCriterios(config.diretorios.saida, {
  "owner/repo": { releases_in_window: 12, valid_workflow_runs: 340 },
});
```

Rodar a etapa `repositorios` regrava a seleção (com as contagens zeradas), por
isso as etapas de B e C devem vir **depois** dela em `ETAPAS` — com o cache,
reexecutar tudo não repete chamadas à API.

Para registrar uma etapa no comando único, acrescente-a em `ETAPAS` de
[src/pipeline.js](src/pipeline.js) — cada etapa recebe
`{ config, cliente, log, limite }`. O cliente HTTP
([src/github/cliente.js](src/github/cliente.js)) e o cache
([src/github/cache.js](src/github/cache.js)) são genéricos para qualquer `GET`
da API, com paginação via `resposta.links.next`;
[src/github/caminhos.js](src/github/caminhos.js) monta os caminhos por
repositório com o escape correto.

**Reuso disponível para a etapa de C:** a mediana, o IQR e o percentil de
[src/releases/leadtime.js](src/releases/leadtime.js) são puros e servem
igualmente para o tempo de recuperação (RQ 04).

## Estrutura

```
Lab3/Sprint01/
├── config.json               # janela, seleção, diretórios (sem segredos)
├── .env.example              # modelo do .env com GITHUB_TOKEN
├── src/
│   ├── pipeline.js           # comando único; lista de etapas
│   ├── config.js             # leitura e validação do config.json
│   ├── janela.js             # janela de observação, estaNaJanela, idade
│   ├── env.js, log.js, csv.js
│   ├── github/
│   │   ├── cliente.js        # REST: token, cache, rate limit, backoff
│   │   ├── cache.js          # um JSON por requisição, gravação atômica
│   │   ├── caminhos.js       # caminhos por repositório e basehead do compare
│   │   └── link.js           # cabeçalho Link (paginação)
│   ├── selecao/
│   │   ├── index.js          # etapa "repositorios" + interface para B/C
│   │   ├── busca.js          # busca fatiada por estrelas
│   │   ├── verificacoes.js   # Actions e contribuidores
│   │   ├── modelo.js         # registro do repositório, status, motivos
│   │   └── funil.js          # critério mínimo, amostra final, funil
│   └── releases/
│       ├── index.js          # etapas "releases" e "leadtime"
│       ├── coleta.js         # /releases paginado, com a regra de parada
│       ├── commits.js        # /compare paginado (commits entre releases)
│   │   ├── leadtime.js       # cálculo puro: mediana, IQR, lead time (a) e (b)
│   │   └── modelo.js         # registro da release, deploy, contagens
│   └── runs/
│       ├── index.js          # etapa "runs"
│       ├── coleta.js         # /actions/runs fatiado por mês, com o teto da API
│       ├── metricas.js       # cálculo puro: CFR (a), episódios e recuperação
│       └── modelo.js         # classificação de conclusion e contagens
└── test/                     # node:test, API falsa em memória
```

## Testes

```bash
npm test                 # todos os testes
npm run test:cobertura   # com relatório de cobertura (falha abaixo de 80% de linhas)
```

Os testes não acessam a rede: usam uma API do GitHub falsa, em memória
([test/apoio/api-falsa.js](test/apoio/api-falsa.js)), com busca limitada,
paginação por `Link`, rate limit e erros simulados, e um relógio falso (os
backoffs não esperam de verdade). Cobrem parsing dos itens, idade e casos de
borda da janela, contagem de contribuidores (com/sem `Link`, zero, `204`,
`403`, `404`), default branch, fatiamento da busca (empates na fronteira,
truncamento), Actions ausente, funil, 404/500/rate limit, cache
existente/inexistente/corrompido e execução interrompida e retomada.

As funções de cálculo do lead time têm testes próprios, com *fixtures* feitas à
mão e resultado conferido no papel — incluindo o exemplo numérico do enunciado:

| Arquivo | Cobre |
|---|---|
| [test/leadtime.test.js](test/leadtime.test.js) | mediana (par/ímpar/vazia), percentil e IQR, sequência de deploys (draft e pré-release fora), release anterior fora da janela, primeira release da história, release sem commits, lead time negativo, release truncada, e o exemplo do enunciado |
| [test/releases-coleta.test.js](test/releases-coleta.test.js) | paginação e regra de parada, janela inclusiva nas duas pontas, teto de páginas, item sem `id`, 404/403, corpo inesperado |
| [test/releases-commits.test.js](test/releases-commits.test.js) | paginação do `compare`, tag com barra escapada, truncamento por teto e por `total_commits`, commit sem `author.date`, tag apagada (404), comparação inválida (422) |
| [test/releases-etapa.test.js](test/releases-etapa.test.js) | as duas etapas de ponta a ponta: contagem devolvida ao funil, CSVs gerados, `--limite`, repositório sem releases vs. erro de coleta, e segunda execução sem ir à rede |
| [test/runs-modelo.test.js](test/runs-modelo.test.js) | a tabela de `conclusion` inteira (sucesso, falha, ignorados, vazio, valor novo da API), normalização do run, filtro de branch/evento e as contagens do critério mínimo |
| [test/runs-coleta.test.js](test/runs-coleta.test.js) | fatiamento mensal (12 meses, recorte nas pontas, fevereiro bissexto, janela de um dia), filtros da URL, paginação, teto de 1.000 por consulta, teto de páginas, run repetido na fronteira de mês, item sem `id`, 404, corpo inesperado e retomada pelo cache |
| [test/runs-metricas.test.js](test/runs-metricas.test.js) | **o exemplo do enunciado (1h20)**, CFR com e sem runs válidos, duas quebras seguidas, episódio censurado, falha sem sucesso anterior, execuções ignoradas no meio, workflows independentes, mediana/IQR/proporção de censurados e duração negativa |
| [test/runs-etapa.test.js](test/runs-etapa.test.js) | a etapa `runs` de ponta a ponta: contagem devolvida ao funil e exclusão por menos de 50 runs, os três CSVs e o JSON de auditoria, `--limite`, erro de coleta deixando o repositório pendente, ordem das etapas e segunda execução sem ir à rede |

## Limitações conhecidas

- **A busca é um retrato do momento:** estrelas mudam com o tempo. A
  reprodutibilidade vem do cache e do JSON versionados (`collected_at` registra
  quando cada dado foi obtido); apagar o cache e rodar de novo gera outra
  seleção.
- Se mais de 1.000 repositórios tiverem exatamente o mesmo número de estrelas,
  os excedentes não são alcançáveis pela busca (fica registrado como
  `truncated`).
- `contributors` inclui contribuidores anônimos (por e-mail) e fica vazio para
  repositórios cujo histórico o GitHub considera grande demais.
- Respostas 4xx são guardadas no cache como definitivas (ex.: um 404). Para
  revalidar, apague o arquivo correspondente em `data/cache/`.
- O pipeline **não** roda na CI: a coleta precisa de `GITHUB_TOKEN` com cota
  própria e leva horas. A CI
  ([.github/workflows/testes.yml](../../.github/workflows/testes.yml)) roda só
  os testes, que não tocam a rede, com o mínimo de 80% de cobertura de linhas.

Específicas das releases e do lead time:

- **`published_at` vs. `created_at`:** a API ordena `/releases` por
  `created_at`, mas a janela e o lead time usam `published_at`. Numa release
  republicada os dois divergem, e a regra de parada da paginação (que olha
  `published_at`) pode ler uma página a mais ou a menos. A coleta registra
  `has_predecessor`, então o caso é detectável no `raw/releases.json`.
- **`author.date` é reescrito por rebase e squash merge**, o que pode inflar ou
  até inverter o lead time de um commit. A coluna
  `negative_lead_time_commits` mede o quanto isso aparece na amostra; a
  distorção na mesma direção (datas antigas preservadas num squash) **não** é
  detectável. É a principal ameaça à validade de construto da RQ 02.
- **Release ≠ deploy.** Numa biblioteca, publicar uma release não coloca nada
  em produção: quem faz isso são os usuários dela. A validação manual da
  Sprint 02 (seção 6 do enunciado) é o que mede o tamanho desse problema.
- **Tags sem release** ficam fora: a variante C3 da RQ 07 (unidade de deploy =
  tag) exige coletar `/tags` e a data do commit de cada tag, o que está
  planejado para a Sprint 02.
- A comparação é feita entre as **tags** das releases, não no default branch.
  Uma release publicada a partir de um branch de manutenção traz os commits
  daquele branch.
