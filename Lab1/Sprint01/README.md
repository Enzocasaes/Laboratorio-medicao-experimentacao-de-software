# Lab01S01 — RQ01: idade dos repositórios populares

Laboratório de Experimentação de Software — Laboratório 01, Sprint 1.

**RQ01 — Sistemas populares são maduros/antigos?**
Métrica: idade do repositório, calculada a partir da data de criação (`createdAt`).

---

## Como executar

**Pré-requisito:** Node.js 18 ou superior (o projeto usa o `fetch` nativo).

```bash
# 1. entrar na pasta do projeto
cd Lab1/Sprint01

# 2. criar o arquivo .env a partir do modelo
cp .env.example .env        # no PowerShell: Copy-Item .env.example .env

# 3. abrir o .env e preencher o token
#    GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# 4. executar
node src/index.js
```

Para gerar o token: **GitHub → Settings → Developer settings → Personal access
tokens → Tokens (classic) → Generate new token**. Para repositórios públicos
basta o escopo `public_repo`.

Não é necessário `npm install`: o projeto **não tem nenhuma dependência**.

### Consultando outro repositório

```bash
node src/index.js torvalds linux
node src/index.js microsoft vscode
```

Sem argumentos, o padrão é `facebook/react`.

### Saída esperada

```
=== Lab01S01 - RQ01: idade do repositorio ===
Consultando a API GraphQL do GitHub para: facebook/react

Repositorio       : facebook/react
Criado em         : 2013-05-24T16:15:54Z
Data da execucao  : 2026-08-07T12:00:00.000Z
Idade             : 13 anos, 2 meses e 13 dias
Idade (anos)      : 13.20
```

A saída deixa explícito que (1) a consulta GraphQL foi executada, (2) o GitHub
retornou a data de criação e (3) o JavaScript calculou a idade.

### Testando com vários repositórios (busca automática)

O teste acima usa 1 repositório fixo. Para validar a RQ01 numa amostra maior,
sem escrever nenhum nome de repositório à mão, use o script que busca
automaticamente os mais populares (ver [seção 1 abaixo](#1-como-a-consulta-graphql-funciona)
para a query completa):

```bash
npm run test:rq01
# equivalente a: node src/testar-rq01.js
```

Esse script busca os repositórios com mais estrelas (quantidade definida pela
constante `QUANTIDADE` em [src/testar-rq01.js](src/testar-rq01.js), hoje 8),
calcula a idade de cada um e grava o resultado em
[`data/rq01Validation.csv`](data/rq01Validation.csv).

Saída esperada:

```
=== Lab01S01 - RQ01: busca automatica dos 8 repositorios com mais estrelas ===

Repositorios publicos que casam com a busca (total): 12.095.746
Repositorios devolvidos nesta chamada: 8

OK    codecrafters-io/build-your-own-x criado em 2018-05-09T12:03:18Z  ->  8 anos, 2 meses e 29 dias
OK    sindresorhus/awesome         criado em 2014-07-11T13:42:37Z  ->  12 anos, 0 meses e 27 dias
OK    public-apis/public-apis      criado em 2016-03-20T23:49:42Z  ->  10 anos, 4 meses e 17 dias
OK    freeCodeCamp/freeCodeCamp    criado em 2014-12-24T17:49:19Z  ->  11 anos, 7 meses e 14 dias
OK    EbookFoundation/free-programming-books criado em 2013-10-11T06:50:37Z  ->  12 anos, 9 meses e 27 dias
OK    openclaw/openclaw            criado em 2025-11-24T10:16:47Z  ->  0 anos, 8 meses e 14 dias
OK    nilbuild/developer-roadmap   criado em 2017-03-15T13:45:52Z  ->  9 anos, 4 meses e 23 dias
OK    donnemartin/system-design-primer criado em 2017-02-26T16:15:28Z  ->  9 anos, 5 meses e 12 dias

=== Resumo ===
Processados com sucesso: 8/8
Idade minima  : 0.70 anos
Idade maxima  : 12.82 anos
Idade mediana : 9.91 anos

Existe proxima pagina: sim
Cursor para continuar (pageInfo.endCursor): Y3Vyc29yOjg=

CSV de validacao gravado em: .../data/rq01Validation.csv
```

Repare que os repositórios encontrados mudam a cada execução, porque a busca
reflete o ranking de estrelas **no momento em que o script roda** — não é uma
lista fixa. O CSV gerado tem 4 colunas: `repositorio`, `data_criacao`,
`idade_anos` (decimal, útil para calcular mediana) e `idade_detalhada`
(texto legível, ex.: `"12 anos, 9 meses e 27 dias"`). Esse arquivo **não é
versionado** (está no `.gitignore`, junto com os demais CSVs de `data/`).

---

## Estrutura do projeto

```
Lab1/Sprint01/
├── src/
│   ├── index.js               # teste com 1 repositório: consulta, valida, calcula a idade, imprime
│   ├── testar-rq01.js         # validação individual da RQ01: busca automática + exportação CSV
│   ├── github.js              # comunicação HTTP com a API GraphQL (genérico)
│   ├── env.js                 # leitor mínimo do arquivo .env (genérico)
│   ├── csv.js                 # gerador mínimo de CSV (genérico)
│   ├── estatisticas.js        # funções estatísticas — mediana (genérico)
│   └── queries/
│       ├── rq01.js            # consulta de 1 repositório (name, nameWithOwner, createdAt)
│       └── busca-populares.js # busca automática por estrelas (campo "search")
├── data/
│   └── rq01Validation.csv     # csv de validação gerado por testar-rq01.js (não versionado)
├── .env                        # token — NÃO versionado
├── .env.example                # modelo do .env
├── .gitignore
├── package.json
└── README.md
```

Cada arquivo tem uma responsabilidade única, para que as próximas RQs entrem
como novos campos/arquivos sem mexer na camada de transporte. Ver a seção
[Reaproveitamento para as próximas RQs](#reaproveitamento-para-as-próximas-rqs-rq02rq06)
para o que muda e o que fica igual.

---

## Explicação da implementação

### 1. Como a consulta GraphQL funciona

A consulta está em [src/queries/rq01.js](src/queries/rq01.js):

```graphql
query RepositorioRQ01($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    name
    nameWithOwner
    createdAt
  }
}
```

Ao contrário da API REST — onde cada endpoint devolve um objeto de tamanho fixo —
no GraphQL **o cliente declara exatamente quais campos quer**, e a resposta tem
a mesma forma da consulta. Aqui pedimos apenas o necessário para a RQ01:

| Campo | Significado |
|---|---|
| `name` | nome do repositório, sem o dono (ex.: `react`) |
| `nameWithOwner` | nome completo `dono/repositório` (ex.: `facebook/react`) |
| `createdAt` | data/hora de criação, tipo `DateTime` — string ISO 8601 em UTC (ex.: `2013-05-24T16:15:54Z`) |

`$owner` e `$name` são **variáveis GraphQL**, declaradas como `String!`
(o `!` indica obrigatório). Os valores vão separados da consulta, no campo
`variables` do corpo JSON. Isso evita montar a query por concatenação de
strings e permite reaproveitar a mesma consulta para qualquer repositório.


### 2. Como o Node.js envia a requisição

Em [src/github.js](src/github.js), sem nenhuma biblioteca externa apenas o `fetch` nativo do Node 18+:

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

Pontos importantes:

- A API GraphQL do GitHub tem **um único endereço**, `https://api.github.com/graphql`,
  e responde **sempre a POST**. Não existe `/repos/facebook/react` na URL: o que se
  quer buscar vai descrito na query, dentro do corpo da requisição.
- O corpo é um JSON com dois campos: `query` (o texto da consulta) e `variables`
  (os valores das variáveis).
- O cabeçalho `User-Agent` é exigido pelo GitHub; sem ele a requisição pode ser
  recusada com 403.

### 3. Como o token é utilizado

O token nunca aparece no código-fonte. O caminho é:

`.env` → `src/env.js` lê o arquivo e popula `process.env` → `src/github.js` lê
`process.env.GITHUB_TOKEN` e o envia no cabeçalho `Authorization: Bearer <token>`.

O `.env` está listado no [.gitignore](.gitignore), então o token não vai para o
repositório. O `src/env.js` é um leitor mínimo (≈20 linhas) escrito à mão, para
que `node src/index.js` funcione sem a dependência `dotenv` e sem flags extras.
Variáveis já definidas no ambiente do sistema têm prioridade sobre o arquivo.

A API GraphQL do GitHub **não aceita requisições anônimas** — sem token, a
resposta é sempre 401.

### 4. Como o `createdAt` é obtido

O GitHub responde com um JSON no formato:

```json
{ "data": { "repository": { "name": "react",
                            "nameWithOwner": "facebook/react",
                            "createdAt": "2013-05-24T16:15:54Z" } } }
```

`src/github.js` devolve o conteúdo de `data`, e `src/index.js` acessa
`dados.repository.createdAt`. O valor é uma string ISO 8601 em UTC, convertida
para `Date` pela função `converterCreatedAt()`, que valida ausência, tipo errado
e data inválida antes de prosseguir.

### 5. Como a idade é calculada

**A API não fornece a idade** — ela fornece apenas o instante de criação. Todo o
cálculo é feito em JavaScript, na função `calcularIdade()` de
[src/index.js](src/index.js), comparando `createdAt` com `new Date()` do momento
da execução. Duas medidas são produzidas:

- **anos / meses / dias completos** — contagem exata de calendário, usada na
  saída legível do terminal;
- **`anosDecimais`** — diferença total em milissegundos dividida por
  365,25 dias (média que considera anos bissextos). É o valor numérico contínuo
  que será usado nas próximas sprints para calcular a **mediana** da RQ01.

O calendário é irregular (meses de 28 a 31 dias, anos bissextos), então a
contagem **não** é feita subtraindo campo a campo. O algoritmo tem dois passos:

1. descobrir quantos **meses completos** se passaram desde a criação;
2. avançar a data de criação por esse tanto de meses — chegando ao "último
   mesversário" — e contar quantos **dias inteiros** faltam dali até hoje.

Isso evita o erro clássico da subtração campo a campo. Exemplo: de 31/01/2024 até
01/03/2026, "dia atual menos dia de criação" dá `1 - 31 = -30`, e nem emprestar os
28 dias de fevereiro conserta (daria −2 dias). Pelo método em dois passos o
resultado sai correto: **2 anos, 1 mês e 1 dia**.

Convenção adotada para meses curtos (a mesma das bibliotecas de data mais usadas):
quando o dia de criação não existe no mês de destino, vale o último dia daquele
mês — um repositório criado em 31/01 completa 1 mês em 28/02 (ou 29/02), e um
criado em 29/02 faz aniversário em 28/02 nos anos não bissextos.

Todas as datas são lidas em **UTC** (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`),
porque o `createdAt` do GitHub vem em UTC. Usar os métodos locais faria o resultado
variar conforme o fuso horário da máquina — indesejável em um experimento
reproduzível.

### 6. Tratamento de erros


| Situação | Onde é tratada | Mensagem |
|---|---|---|
| Token ausente ou vazio | `github.js` | instruções de como criar o `.env` e gerar o token |
| Falha de rede (sem internet, DNS, proxy) | `github.js` | `Falha de rede ao acessar ...` |
| Erro HTTP (401, 403, 429, 5xx) | `github.js` | status + corpo da resposta, com dica para 401 (token inválido) e 403/429 (rate limit) |
| Resposta que não é JSON válido | `github.js` | mostra o corpo bruto recebido |
| Erro retornado pelo GraphQL | `github.js` | lista todas as mensagens do array `errors` |
| Repositório inexistente (`repository: null`) | `index.js` | `O repositorio "x/y" nao foi encontrado ...` |
| `createdAt` ausente, de tipo errado ou inválido | `index.js` | descreve exatamente qual dos três casos ocorreu |
| Data de criação no futuro | `index.js` | sugere verificar o relógio da máquina |

Detalhe relevante do GraphQL: erros de consulta (campo inexistente, permissão
negada) costumam vir com **status HTTP 200** e um array `errors` no corpo. Por
isso a verificação do status HTTP sozinha não basta — o `github.js` checa os dois.

---

## Reaproveitamento para as próximas RQs (RQ02–RQ06)

Nenhuma das próximas RQs precisa ser implementada do zero. A maior parte do
que existe hoje é genérica e não sabe nem se importa com qual pergunta de
pesquisa está sendo respondida:

| Arquivo | Reaproveitável como está? | Motivo |
|---|---|---|
| [src/github.js](src/github.js) | Sim | Só envia `{ query, variables }` e devolve `data` — não olha o conteúdo da query |
| [src/env.js](src/env.js) | Sim | Só lê o token; nada muda por RQ |
| [src/csv.js](src/csv.js) | Sim | `gerarCSV(cabecalho, linhas)` aceita qualquer conjunto de colunas |
| [src/estatisticas.js](src/estatisticas.js) | Sim | `calcularMediana` serve para a idade (RQ01) e qualquer outra métrica numérica (ex.: total de PRs da RQ02) |
| [src/queries/busca-populares.js](src/queries/busca-populares.js) | Parcial | A busca (`search`, `sort:stars-desc`, paginação) continua igual; só ganha **novos campos** dentro de `... on Repository` |
| `calcularIdade()` / `converterCreatedAt()` em [src/index.js](src/index.js) | Não | Específico da métrica da RQ01; cada RQ tem sua própria função de cálculo, no mesmo espírito |

**O que muda por RQ, então, é pequeno:**

1. Acrescentar o campo GraphQL correspondente na consulta existente, dentro
   de `... on Repository { ... }`. Exemplos (nomes de campo reais da API,
   confirmar antes de usar):
   - RQ02 (PRs aceitas): `pullRequests(states: MERGED) { totalCount }`
   - RQ03 (releases): `releases { totalCount }`
   - RQ04 (última atualização): `pushedAt`
   - RQ05 (linguagem primária): `primaryLanguage { name }`
   - RQ06 (% issues fechadas): `issues(states: CLOSED) { totalCount }` e
     `issues { totalCount }` (para a razão)
2. Escrever uma função pequena de cálculo por métrica (quando o valor bruto
   não for a métrica final — ex.: a razão da RQ06), no mesmo estilo de
   `calcularIdade()`.
3. Adicionar a coluna correspondente na exportação CSV.

**Recomendação:** em vez de uma query separada por RQ, **ampliar a mesma
consulta** (`busca-populares.js`) com todos os campos de uma vez. Isso
significa uma única chamada por página de repositórios que já traz tudo —
exatamente o que o enunciado do Lab01S01 pede ("consulta GraphQL para 100
repositórios, todos os dados/métricas necessários"). Múltiplas queries
separadas multiplicariam as requisições HTTP sem necessidade, já que os
dados de todas as RQs vêm do mesmo objeto `Repository`.

### Padrão de nomes: validação individual vs. script final do grupo

[src/testar-rq01.js](src/testar-rq01.js) e `data/rq01Validation.csv` são
nomeados por RQ de propósito. O enunciado pede que **cada integrante valide
sua própria RQ isoladamente**, numa amostra pequena, antes de integrar ao
script único do grupo. Por isso o padrão esperado para as próximas é o mesmo:

- `src/testar-rq02.js` → `data/rq02Validation.csv`
- `src/testar-rq03.js` → `data/rq03Validation.csv`
- ... e assim por diante, um par por RQ.

Cada um desses scripts é uma cópia enxuta do mesmo formato de
`testar-rq01.js` (busca automática + cálculo da métrica + CSV), trocando
apenas o campo GraphQL pedido e a função de cálculo. Só depois que todas as
RQs estiverem validadas individualmente é que os campos são reunidos numa
única consulta e um único script de coleta (o que vai virar, no Lab01S02, a
consulta paginada para os 1000 repositórios com todas as métricas).

---

## Validação realizada

O cálculo da idade foi verificado contra casos de borda do calendário:
aniversário exato, um dia antes do aniversário, virada de fevereiro em ano
bissexto, repositório criado em 29/02 e criação no dia 31 seguida de mês curto.
O caminho HTTP foi verificado contra a API real (resposta 401 com token
inválido, tratada corretamente).
