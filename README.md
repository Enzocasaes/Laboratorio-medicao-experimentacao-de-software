# Laboratorio-medicao-experimentacao-de-software

# Lab01 — Características de repositórios populares

Laboratório de Experimentação de Software — Laboratório 01.

Este projeto minera os repositórios com mais estrelas do GitHub e responde a um
conjunto de questões de pesquisa (RQs) sobre eles. A coleta é feita com **uma
única busca GraphQL paginada** (sem lista de nomes escrita à mão) e cada RQ é
calculada sobre os mesmos dados coletados.

| RQ | Pergunta | Métrica |
|---|---|---|
| **RQ01** | Sistemas populares são maduros/antigos? | idade do repositório (a partir de `createdAt`) |
| **RQ02** | Recebem muita contribuição externa? | total de Pull Requests aceitas (`pullRequests(states: MERGED)`) |
| **RQ03** | Lançam releases com frequência? | total de releases (`releases.totalCount`) |
| **RQ04** | São atualizados com frequência? | dias desde a última atualização (`updatedAt`) |
| **RQ05** | Usam as linguagens mais populares? | linguagem primária (`primaryLanguage.name`) |
| **RQ06** | Têm alto percentual de issues fechadas? | razão issues fechadas / total de issues |
| **RQ07** | *(bônus)* Como as métricas variam por linguagem? | medianas de PRs, releases e dias, agrupadas por linguagem |

> **RQ05 — fonte de "linguagens mais populares":** usamos o **GitHub Octoverse**
> (relatório anual *State of the Octoverse*, <https://octoverse.github.com>),
> por ser a mesma plataforma que estamos minerando. Essa referência é mantida
> por todo o laboratório.

---

## Como executar

**Pré-requisito:** Node.js 18 ou superior (o projeto usa o `fetch` nativo).
**Não** é necessário `npm install` — o projeto não tem nenhuma dependência.

```bash
# 1. entrar na pasta do projeto
cd Lab1/Sprint01

# 2. criar o arquivo .env a partir do modelo
cp .env.example .env        # no PowerShell: Copy-Item .env.example .env

# 3. abrir o .env e preencher o token
#    GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Para gerar o token: **GitHub → Settings → Developer settings → Personal access
tokens → Tokens (classic) → Generate new token**. Para repositórios públicos
basta o escopo `public_repo`. A API GraphQL do GitHub **não aceita requisições
anônimas** — sem token, a resposta é sempre 401.

### Rodar a mineração

```bash
# todas as RQs de uma vez (1 coleta -> calcula RQ01..RQ07 -> gera todos os CSVs)
npm run minerar:todas

# uma RQ específica
npm run test:rq01     # idade do repositório
npm run test:rq02     # pull requests aceitas (MERGED)
npm run test:rq03     # total de releases
npm run test:rq04     # dias desde a última atualização
npm run test:rq05     # linguagem primária
npm run test:rq06     # razão de issues fechadas
npm run test:rq07     # métricas por linguagem (agregada)

# equivalente direto, sem npm:
node src/minerar.js todas
node src/minerar.js rq06
```

Cada execução grava um CSV em [`data/`](data/) (não versionado — ver
[.gitignore](.gitignore)):

| Comando | CSV gerado | Colunas |
|---|---|---|
| `test:rq01` | `data/rq01Validation.csv` | `repositorio, data_criacao, idade_anos, idade_detalhada` |
| `test:rq02` | `data/rq02Validation.csv` | `repositorio, pull_requests_aceitas` |
| `test:rq03` | `data/rq03Validation.csv` | `repositorio, total_releases` |
| `test:rq04` | `data/rq04Validation.csv` | `repositorio, data_ultima_atualizacao, dias_desde_atualizacao` |
| `test:rq05` | `data/rq05Validation.csv` | `repositorio, linguagem_primaria` |
| `test:rq06` | `data/rq06Validation.csv` | `repositorio, issues_fechadas, issues_total, razao_fechadas` |
| `test:rq07` | `data/rq07PorLinguagem.csv` | `linguagem_primaria, quantidade_repositorios, mediana_pull_requests_aceitas, mediana_releases, mediana_dias_desde_atualizacao` |

Quantos repositórios coletar é definido pela constante `QUANTIDADE` em
[src/minerar.js](src/minerar.js) (hoje **1000**, a coleta oficial do Lab01S02
— a paginação é automática).

### Demo de 1 repositório (RQ01)

Além da mineração em lote, há um ponto de entrada que consulta **um** repositório
e mostra o cálculo de idade passo a passo:

```bash
npm start                      # padrão: facebook/react
node src/index.js torvalds linux
node src/index.js microsoft vscode
```

Saída esperada:

```
=== Lab01S01 - RQ01: idade do repositorio ===
Consultando a API GraphQL do GitHub para: facebook/react

Repositorio       : facebook/react
Criado em         : 2013-05-24T16:15:54Z
Data da execucao  : 2026-08-12T12:00:00.000Z
Idade             : 13 anos, 2 meses e 18 dias
Idade (anos)      : 13.21
```

---

## Estrutura do projeto

```
Lab1/Sprint01/
├── src/
│   ├── minerar.js                  # runner ÚNICO: escolhe a(s) RQ(s), grava CSV
│   ├── MineradorDeRepositorios.js  # classe orquestradora: busca + paginação
│   ├── index.js                    # demo de 1 repositório + funções de idade (reusadas)
│   ├── github.js                   # comunicação HTTP com a API GraphQL (genérico)
│   ├── env.js                      # leitor mínimo do arquivo .env (genérico)
│   ├── csv.js                      # gerador mínimo de CSV (genérico)
│   ├── estatisticas.js             # mediana + contagem por categoria (genérico)
│   ├── tempo-atualizacao.js        # funções de data para a RQ04/RQ07
│   ├── rqs/                         # uma DEFINIÇÃO declarativa por RQ
│   │   ├── index.js                #   registro central { rq01..rq07 }
│   │   └── rq01.js … rq07.js       #   cada RQ: extrair/resumir (ou analisar)
│   └── queries/
│       ├── busca-populares.js      # busca por estrelas COM todos os campos das RQs
│       └── rq01.js                 # consulta de 1 repositório (usada pelo npm start)
├── data/                           # CSVs gerados (não versionados)
├── .env / .env.example             # token (o .env não é versionado)
├── .gitignore
├── package.json
└── README.md
```

---

## Arquitetura

A ideia central é separar **orquestração** de **definição de métrica**:

- **`MineradorDeRepositorios`** ([src/MineradorDeRepositorios.js](src/MineradorDeRepositorios.js))
  sabe apenas buscar os repositórios mais populares e paginar a API. Ele devolve
  a lista de repositórios já coletada — não sabe nem se importa com qual RQ será
  calculada.
- **Cada RQ é uma definição declarativa** em [src/rqs/](src/rqs/). Para métricas
  por repositório (RQ01–06), a definição expõe:
  - `extrair(repo, ctx)` → o valor da métrica e as células do CSV daquele repo;
  - `resumir(valores)` → imprime o resumo (mínimo/máximo/mediana, ou contagem);
  - `cabecalhoCSV` / `arquivoCSV`.
  Para métricas **agregadas** (RQ07, que agrupa por linguagem), a definição expõe
  `analisar(repos, ctx)` em vez de `extrair/resumir`.
- **`minerar.js`** ([src/minerar.js](src/minerar.js)) é o runner: coleta os
  repositórios **uma vez** e aplica a(s) RQ(s) escolhida(s) sobre a mesma lista.

Consequências:

- **Uma única busca para tudo.** Como [busca-populares.js](src/queries/busca-populares.js)
  já traz todos os campos (`createdAt`, `updatedAt`, `primaryLanguage`,
  `releases`, `pullRequests(MERGED)`, `issues`), nenhuma RQ faz uma segunda
  requisição por repositório.
- **Adicionar uma RQ = criar `src/rqs/rqNN.js` e registrá-la em
  [src/rqs/index.js](src/rqs/index.js)** — nenhum outro arquivo muda.
- **Sem duplicação:** o loop, o tratamento de nós vazios e a escrita do CSV
  moram só no runner.

### Paginação em lotes de 10

A busca pede os repositórios em **lotes de 10** (`TAMANHO_DA_PAGINA` em
[src/MineradorDeRepositorios.js](src/MineradorDeRepositorios.js)). A API permite
até 100 por página, mas pedir 100 de uma vez **com todos os `totalCount`**
(issues + PRs + releases) faz o GitHub estourar o tempo e responder **HTTP 504**.
Lotes menores são mais estáveis.

---

## Explicação da implementação

### 1. Como a consulta GraphQL funciona

A busca está em [src/queries/busca-populares.js](src/queries/busca-populares.js):

```graphql
query BuscarRepositoriosPopulares($quantidade: Int!, $cursor: String) {
  search(query: "stars:>1 sort:stars-desc", type: REPOSITORY, first: $quantidade, after: $cursor) {
    repositoryCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Repository {
        name
        nameWithOwner
        createdAt                               # RQ01
        updatedAt                               # RQ04
        primaryLanguage { name }                # RQ05
        releases { totalCount }                 # RQ03
        pullRequests(states: MERGED) { totalCount }   # RQ02
        issuesTotal: issues { totalCount }            # RQ06 (todas)
        issuesFechadas: issues(states: CLOSED) { totalCount }  # RQ06 (fechadas)
      }
    }
  }
}
```

No GraphQL **o cliente declara exatamente quais campos quer**, e a resposta tem a
mesma forma da consulta. Alguns pontos:

- `search(query: "stars:>1 sort:stars-desc", ...)` usa a mesma sintaxe do site
  `github.com/search`: a ordenação por estrelas faz parte do texto da busca.
- Como `search` é genérico (pode devolver repositórios, issues, usuários...), é
  obrigatório o fragmento `... on Repository` para acessar campos de repositório.
- `issues` aparece **duas vezes** com **alias** (`issuesTotal` e
  `issuesFechadas`), porque a RQ06 precisa da mesma conexão com dois filtros
  diferentes na mesma consulta.
- `$quantidade` e `$cursor` são **variáveis GraphQL**, enviadas no campo
  `variables` do corpo JSON — evitando montar a query por concatenação.

### 2. Como o Node.js envia a requisição

Em [src/github.js](src/github.js), sem nenhuma biblioteca externa, apenas o
`fetch` nativo do Node 18+:

```js
await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "lab01-experimentacao-software",
  },
  body: JSON.stringify({ query, variables }),
});
```

- A API GraphQL do GitHub tem **um único endereço** e responde **sempre a POST**.
- O corpo é um JSON com `query` (o texto da consulta) e `variables` (os valores).
- O cabeçalho `User-Agent` é exigido pelo GitHub; sem ele a requisição pode ser
  recusada com 403.

### 3. Como o token é utilizado

O token nunca aparece no código-fonte. O caminho é:

`.env` → [src/env.js](src/env.js) lê o arquivo e popula `process.env` →
[src/github.js](src/github.js) lê `process.env.GITHUB_TOKEN` e o envia no
cabeçalho `Authorization: Bearer <token>`.

O `.env` está no [.gitignore](.gitignore), então o token não vai para o
repositório. O `env.js` é um leitor mínimo escrito à mão, para que o projeto
funcione sem a dependência `dotenv`. Variáveis já definidas no ambiente do
sistema têm prioridade sobre o arquivo.

### 4. Como a idade é calculada (RQ01)

**A API não fornece a idade** — apenas o instante de criação (`createdAt`). Todo
o cálculo é feito em JavaScript, na função `calcularIdade()` de
[src/index.js](src/index.js) (reaproveitada por [src/rqs/rq01.js](src/rqs/rq01.js)),
comparando `createdAt` com o momento da execução. Duas medidas são produzidas:

- **anos / meses / dias completos** — contagem exata de calendário, usada na
  saída legível;
- **`anosDecimais`** — diferença total em milissegundos dividida por 365,25 dias
  (média que considera anos bissextos). É o valor numérico contínuo usado para
  calcular a **mediana**.

O calendário é irregular, então a contagem **não** é feita subtraindo campo a
campo. O algoritmo tem dois passos: (1) descobrir quantos **meses completos** se
passaram desde a criação; (2) avançar a data de criação por esse tanto de meses
— chegando ao "último mesversário" — e contar quantos **dias inteiros** faltam
dali até hoje. Todas as datas são lidas em **UTC**, porque o `createdAt` do
GitHub vem em UTC — usar métodos locais faria o resultado variar conforme o fuso
da máquina.

### 5. Métricas de cada RQ

| RQ | Campo(s) usado(s) do nó | Cálculo | Resumo |
|---|---|---|---|
| RQ01 | `createdAt` | idade em anos decimais | mín / máx / mediana |
| RQ02 | `pullRequests(MERGED).totalCount` | valor direto | mín / máx / mediana |
| RQ03 | `releases.totalCount` | valor direto | mín / máx / mediana |
| RQ04 | `updatedAt` | dias desde a atualização | mín / máx / mediana |
| RQ05 | `primaryLanguage.name` | categórico (nulo → "Sem linguagem") | **contagem por linguagem** |
| RQ06 | `issuesTotal`, `issuesFechadas` | razão fechadas/total (0 se total = 0) | mín / máx / mediana (%) |
| RQ07 | PRs, releases, `updatedAt`, linguagem | agrupa por linguagem | mediana de cada métrica por grupo |

**Por que `MERGED` representa uma PR aceita (RQ02):** o enum `PullRequestState`
tem `OPEN`, `CLOSED` e `MERGED`. Uma PR `CLOSED` sem merge foi
rejeitada/abandonada; só `MERGED` corresponde a uma contribuição que de fato
entrou.

**Por que a RQ06 trata `total = 0`:** repositórios sem nenhuma issue teriam
divisão por zero (`NaN`). Nesses casos a razão é definida como 0.

### 6. Tratamento de erros

| Situação | Onde | Comportamento |
|---|---|---|
| Token ausente ou vazio | `github.js` | instruções de como criar o `.env` e gerar o token |
| Falha de rede | `github.js` | `Falha de rede ao acessar ...` |
| Erro HTTP (401, 403, 429, 5xx) | `github.js` | status + corpo, com dica para 401 (token) e 403/429 (rate limit); tenta novamente em respostas temporárias |
| Resposta que não é JSON | `github.js` | mostra o corpo bruto |
| Erro retornado pelo GraphQL (status 200 + `errors`) | `github.js` | lista as mensagens do array `errors` |
| Nó de repositório vazio na busca | `MineradorDeRepositorios.js` | ignora o item e segue |
| Métrica ausente num repositório | `src/rqs/rqNN.js` | registra `FALHA` daquele repo, sem derrubar os demais |

Detalhe do GraphQL: erros de consulta costumam vir com **status HTTP 200** e um
array `errors` no corpo — por isso checar só o status não basta.

---

## Como adicionar uma nova RQ

1. Se o dado ainda não vem da busca, acrescente o campo em
   [src/queries/busca-populares.js](src/queries/busca-populares.js), dentro de
   `... on Repository { ... }`.
2. Crie `src/rqs/rqNN.js` exportando um objeto com `chave`, `titulo`,
   `arquivoCSV`, `cabecalhoCSV` e:
   - `extrair(repo, ctx)` + `resumir(valores)` para métrica por repositório; **ou**
   - `analisar(repos, ctx)` para métrica agregada.
3. Registre a RQ em [src/rqs/index.js](src/rqs/index.js).
4. (Opcional) Adicione um atalho em `scripts` no [package.json](package.json).

Nenhum outro arquivo precisa mudar — o runner e o orquestrador são genéricos.

## Coleta oficial dos 1000 repositórios (Lab01S02)

Basta trocar `QUANTIDADE = 100` por `1000` em [src/minerar.js](src/minerar.js) e
rodar `npm run minerar:todas`. A paginação (`pageInfo.endCursor`) já é seguida
automaticamente pelo `MineradorDeRepositorios`, em lotes de 10.

## Validação realizada

- O cálculo da idade foi verificado contra casos de borda do calendário:
  aniversário exato, um dia antes, virada de fevereiro em ano bissexto,
  repositório criado em 29/02 e criação no dia 31 seguida de mês curto.
- A coleta foi executada com sucesso para os 100 repositórios mais populares,
  gerando os sete CSVs; o caminho HTTP foi verificado contra a API real
  (resposta 401 com token inválido, e re-tentativa em 504/respostas temporárias).
