# Lab03 — Mineração de métricas DORA

Laboratório de Experimentação de Software — Laboratório 03.

Pipeline reprodutível que minera métricas DORA de repositórios open-source
populares que usam GitHub Actions, via API REST do GitHub (sem bibliotecas
prontas de acesso à API). Este README cobre, por enquanto, a etapa
**`repositorios`** — seleção de repositórios, funil e coleta de metadados
(Pessoa A, Issue #66). As etapas de releases/lead time (B) e de workflow
runs/CFR/tempo de recuperação (C) entram no mesmo comando, depois desta.

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
  "diretorios": { "cache": "data/cache", "saida": "data" }
}
```

| Campo | Significado |
|---|---|
| `janela.inicio`, `janela.fim` | **Obrigatórios.** Datas fixadas pelo professor (seção 3 do enunciado), em UTC. O dia `fim` está dentro da janela. **Ainda não foram preenchidas** — o pipeline se recusa a rodar com `AAAA-MM-DD`. |
| `selecao.estrelasAcimaDe` | Busca `stars:>N` (enunciado: 1000). |
| `selecao.quantidadeDeCandidatos` | Quantos candidatos (os de mais estrelas) entram no topo do funil. Precisa ser bem maior que a amostra-alvo, porque muitos caem nos filtros. |
| `selecao.tamanhoAlvoDaAmostra` | Tamanho da amostra final (S01: 100; S02: ≥ 300). |
| `selecao.minimoDeReleases`, `minimoDeWorkflowRuns` | Critério mínimo de inclusão do enunciado (5 e 50). |
| `diretorios.*` | Relativos à pasta do `config.json`. |

## Execução

```bash
cd Lab3/Sprint01

# pipeline completo (um único comando)
npm run pipeline                       # = node src/pipeline.js --config config.json

# só a etapa de seleção (Pessoa A)
npm run coletar:repositorios           # = node src/pipeline.js --config config.json --etapa repositorios

# opções
node src/pipeline.js --config outro.json   # outro arquivo de configuração
node src/pipeline.js --sem-cache           # ignora o cache em disco (não recomendado)
LOG_LEVEL=debug npm run pipeline           # mostra também cada acerto de cache e a cota restante
```

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

Custo aproximado (estimativa, não medição): uma requisição de
`actions/workflows` por candidato, mais uma de `contributors` por candidato com
Actions, mais ~10 páginas de busca por fatia.

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

## Arquivos gerados

| Arquivo | Conteúdo |
|---|---|
| `data/raw/repositories.json` | Tudo: data de geração, janela, parâmetros da seleção, fatias da busca e um registro por candidato. |
| `data/processed/candidates.csv` | Todos os candidatos, **inclusive os descartados** (com etapa e motivo). Trilha de auditoria. |
| `data/processed/repositories.csv` | Só os que seguem no pipeline — **entrada das etapas de B e C**. |
| `data/processed/selection_funnel.csv` | Funil de seleção para a Metodologia do artigo. |

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
| `releases_in_window` | inteiro | **Preenchido pela etapa de B.** Releases publicadas (`draft = false`) na janela. |
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

**Motivos de exclusão:** `no_github_actions`, `actions_http_<status>`,
`actions_unexpected_response`, `fewer_than_5_releases_in_window`,
`fewer_than_50_valid_workflow_runs_in_window`, `beyond_target_sample_size`.
**Problemas de metadado:** `contributors_list_too_large`,
`contributors_http_<status>`, `contributors_unexpected_response`,
`contributors_missing_last_page`, `contributors_invalid_link_header`,
`missing_default_branch`, `invalid_created_at`.

## Integração com B e C

A etapa de seleção não depende das implementações de B e C; a ligação é feita
por dados e por três funções de [src/selecao/index.js](src/selecao/index.js):

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
[src/pipeline.js](src/pipeline.js) — cada etapa recebe `{ config, cliente, log }`.
O cliente HTTP ([src/github/cliente.js](src/github/cliente.js)) e o cache
([src/github/cache.js](src/github/cache.js)) são genéricos para qualquer `GET`
da API, com paginação via `resposta.links.next`.

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
│   │   └── link.js           # cabeçalho Link (paginação)
│   └── selecao/
│       ├── index.js          # etapa "repositorios" + interface para B/C
│       ├── busca.js          # busca fatiada por estrelas
│       ├── verificacoes.js   # Actions e contribuidores
│       ├── modelo.js         # registro do repositório, status, motivos
│       └── funil.js          # critério mínimo, amostra final, funil
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

## Limitações conhecidas

- **Datas da janela pendentes:** `config.json` ainda tem `AAAA-MM-DD`; a coleta
  real só roda depois de preenchidas com as datas do professor.
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
- Os testes no GitHub Actions do grupo (`.github/workflows/`) ainda não foram
  configurados.
