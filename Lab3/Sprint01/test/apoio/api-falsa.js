// API do GitHub falsa, em memoria, para os testes (nenhum teste toca a rede).
// Reproduz o comportamento que importa para a selecao:
//   - /search/repositories com "stars:>N" e "stars:A..B", ordenacao por
//     estrelas, limite de resultados por consulta e paginacao via Link;
//   - /repos/{o}/{r}/actions/workflows (total_count);
//   - /repos/{o}/{r}/contributors?per_page=1&anon=true (Link com rel="last");
//   - /repos/{o}/{r}/releases (ordem created_at desc, paginacao via Link);
//   - /repos/{o}/{r}/compare/{base}...{head} (total_commits e paginacao);
//   - /repos/{o}/{r}/actions/runs com os filtros branch/event/created, o
//     formato { total_count, workflow_runs } e o teto de 1.000 resultados por
//     consulta (o mesmo da API real).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://api.github.com";

export function respostaJSON(status, corpo, cabecalhos = {}) {
  const semCorpo = corpo === undefined || status === 204;
  return new Response(semCorpo ? null : JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });
}

export function pastaTemporaria(prefixo = "lab03-") {
  return mkdtempSync(join(tmpdir(), prefixo));
}

export function repo(fullName, stars, extra = {}) {
  const [owner, name] = fullName.split("/");
  return {
    id: extra.id ?? hashId(fullName),
    full_name: fullName,
    name,
    owner: { login: owner },
    html_url: `https://github.com/${fullName}`,
    default_branch: "main",
    stargazers_count: stars,
    language: "JavaScript",
    created_at: "2015-06-01T12:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    pushed_at: "2026-01-01T00:00:00Z",
    archived: false,
    ...extra,
  };
}

function hashId(texto) {
  let h = 7;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 1_000_000_007;
  return h;
}

// Release da API. Por padrao e' um deploy (draft e prerelease false) e
// created_at = published_at, que e' o caso comum.
export function release(tagName, publishedAt, extra = {}) {
  return {
    id: extra.id ?? hashId(`${tagName}@${publishedAt}`),
    tag_name: tagName,
    name: tagName,
    draft: false,
    prerelease: false,
    published_at: publishedAt,
    created_at: publishedAt,
    target_commitish: "main",
    html_url: `https://github.com/exemplo/releases/tag/${tagName}`,
    ...extra,
  };
}

// Item de `commits` na resposta do compare. O que importa para o lead time e'
// commit.author.date (secao 3 do enunciado).
export function commit(sha, data, { mensagem = "mudanca", ...extra } = {}) {
  return { sha, commit: { author: { date: data }, message: mensagem }, ...extra };
}

// Workflow run da API. Por padrao e' um run do default branch disparado por
// push e concluido com sucesso. `updated_at` e' o fim do run (usado no tempo
// de recuperacao) e `run_started_at`, o inicio.
export function workflowRun(iniciadoEm, conclusion = "success", extra = {}) {
  const fim = extra.updated_at ?? iniciadoEm;
  return {
    id: extra.id ?? hashId(`${iniciadoEm}@${conclusion}`),
    name: extra.name ?? "CI",
    workflow_id: extra.workflow_id ?? 1,
    run_number: extra.run_number ?? 1,
    run_attempt: 1,
    head_branch: "main",
    event: "push",
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    run_started_at: iniciadoEm,
    created_at: iniciadoEm,
    html_url: `https://github.com/exemplo/actions/runs/${extra.id ?? 1}`,
    ...extra,
    updated_at: fim,
  };
}

// Paginacao por cabecalho Link, igual a da API.
function paginarLista(url, itens, porPaginaPadrao) {
  const porPagina = Number(url.searchParams.get("per_page") ?? porPaginaPadrao);
  const pagina = Number(url.searchParams.get("page") ?? 1);
  const fatia = itens.slice((pagina - 1) * porPagina, pagina * porPagina);
  const ultima = Math.max(1, Math.ceil(itens.length / porPagina));
  const cabecalhos = {};
  if (pagina < ultima) {
    const proxima = new URL(url);
    proxima.searchParams.set("page", String(pagina + 1));
    const fim = new URL(url);
    fim.searchParams.set("page", String(ultima));
    cabecalhos.link = `<${proxima}>; rel="next", <${fim}>; rel="last"`;
  }
  return { fatia, cabecalhos };
}

function filtrarPorEstrelas(repos, q) {
  const maior = q.match(/^stars:>(\d+)$/);
  if (maior) return repos.filter((r) => r.stargazers_count > Number(maior[1]));
  const exata = q.match(/^stars:(\d+)$/);
  if (exata) return repos.filter((r) => r.stargazers_count === Number(exata[1]));
  const faixa = q.match(/^stars:(\d+)\.\.(\d+)$/);
  if (faixa) return repos.filter((r) => r.stargazers_count >= Number(faixa[1]) && r.stargazers_count <= Number(faixa[2]));
  return null;
}

// opcoes:
//   repos            itens de busca (use repo())
//   limiteDaBusca    maximo de resultados por consulta (na API real: 1000)
//   actions          { full_name: total_count | Response }  (padrao: 3 workflows)
//   contribuidores   { full_name: numero | Response }        (padrao: 10)
//   releases         { full_name: [release()] | Response }   (padrao: lista vazia)
//   comparacoes      { full_name: { "base...head": [commit()] | { commits, total_commits } | Response } }
//                    (chave ausente -> 404, como uma tag apagada)
//   runs             { full_name: [workflowRun()] | Response }  (padrao: lista vazia)
//   limiteDeRuns     maximo de resultados por consulta de runs (na API real: 1000)
//   antes(url)       gancho chamado em toda requisicao; se devolver Response, ela e' usada
export function criarApiFalsa({
  repos = [],
  limiteDaBusca = 1000,
  actions = {},
  contribuidores = {},
  releases = {},
  comparacoes = {},
  runs = {},
  limiteDeRuns = 1000,
  antes,
} = {}) {
  const chamadas = [];

  async function fetchFalso(urlTexto, opcoes = {}) {
    const url = new URL(urlTexto);
    chamadas.push({ url: urlTexto, caminho: url.pathname + url.search, cabecalhos: opcoes.headers });
    if (antes) {
      const desvio = await antes(url, chamadas.length);
      if (desvio) return desvio;
    }

    if (url.pathname === "/search/repositories") {
      const q = url.searchParams.get("q");
      const filtrados = filtrarPorEstrelas(repos, q);
      if (filtrados === null) return respostaJSON(422, { message: "Validation Failed" });
      // Ordem da API: estrelas desc; empates em ordem "arbitraria" (aqui, nome desc)
      // para provar que a selecao nao depende dela.
      const ordenados = [...filtrados].sort(
        (a, b) => b.stargazers_count - a.stargazers_count || (a.full_name < b.full_name ? 1 : -1)
      );
      const alcancaveis = ordenados.slice(0, limiteDaBusca);
      const porPagina = Number(url.searchParams.get("per_page") ?? 30);
      const pagina = Number(url.searchParams.get("page") ?? 1);
      const itens = alcancaveis.slice((pagina - 1) * porPagina, pagina * porPagina);
      const ultima = Math.max(1, Math.ceil(alcancaveis.length / porPagina));
      const cabecalhos = {};
      if (pagina < ultima) {
        const proxima = new URL(url);
        proxima.searchParams.set("page", String(pagina + 1));
        const fim = new URL(url);
        fim.searchParams.set("page", String(ultima));
        cabecalhos.link = `<${proxima}>; rel="next", <${fim}>; rel="last"`;
      }
      return respostaJSON(
        200,
        { total_count: filtrados.length, incomplete_results: false, items: itens },
        cabecalhos
      );
    }

    const workflows = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/workflows$/);
    if (workflows) {
      const nome = `${decodeURIComponent(workflows[1])}/${decodeURIComponent(workflows[2])}`;
      const valor = actions[nome] ?? 3;
      if (valor instanceof Response) return valor;
      return respostaJSON(200, { total_count: valor, workflows: valor > 0 ? [{ id: 1, name: "CI" }] : [] });
    }

    const contrib = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contributors$/);
    if (contrib) {
      const nome = `${decodeURIComponent(contrib[1])}/${decodeURIComponent(contrib[2])}`;
      const valor = contribuidores[nome] ?? 10;
      if (valor instanceof Response) return valor;
      if (valor === 0) return respostaJSON(200, []);
      const cabecalhos = {};
      if (valor > 1) {
        const base = `${BASE}${url.pathname}?per_page=1&anon=true`;
        cabecalhos.link = `<${base}&page=2>; rel="next", <${base}&page=${valor}>; rel="last"`;
      }
      return respostaJSON(200, [{ login: "alguem", contributions: 100 }], cabecalhos);
    }

    // GET /repos/{o}/{r}/releases - a API devolve em created_at desc.
    const listaDeReleases = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases$/);
    if (listaDeReleases) {
      const nome = `${decodeURIComponent(listaDeReleases[1])}/${decodeURIComponent(listaDeReleases[2])}`;
      const valor = releases[nome];
      if (valor instanceof Response) return valor;
      const lista = [...(valor ?? [])].sort(
        (a, b) =>
          Date.parse(b.created_at ?? b.published_at) - Date.parse(a.created_at ?? a.published_at) || b.id - a.id
      );
      const { fatia, cabecalhos } = paginarLista(url, lista, 30);
      return respostaJSON(200, fatia, cabecalhos);
    }

    // GET /repos/{o}/{r}/actions/runs?branch=&event=&created=AAAA-MM-DD..AAAA-MM-DD
    // A API filtra por branch, evento e intervalo de criacao, devolve
    // { total_count, workflow_runs } em ordem decrescente de criacao e entrega
    // no maximo `limiteDeRuns` resultados por consulta - total_count traz o
    // numero REAL, mesmo quando a lista e' cortada.
    const listaDeRuns = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/runs$/);
    if (listaDeRuns) {
      const nome = `${decodeURIComponent(listaDeRuns[1])}/${decodeURIComponent(listaDeRuns[2])}`;
      const valor = runs[nome];
      if (valor instanceof Response) return valor;
      let lista = [...(valor ?? [])];

      const branch = url.searchParams.get("branch");
      if (branch) lista = lista.filter((r) => r.head_branch === branch);
      const evento = url.searchParams.get("event");
      if (evento) lista = lista.filter((r) => r.event === evento);
      const criado = url.searchParams.get("created");
      if (criado) {
        const [de, ate] = criado.split("..");
        const deMs = Date.parse(`${de}T00:00:00Z`);
        const ateMs = Date.parse(`${ate}T00:00:00Z`) + 24 * 60 * 60 * 1000;
        lista = lista.filter((r) => {
          const ms = Date.parse(r.run_started_at ?? r.created_at);
          return ms >= deMs && ms < ateMs;
        });
      }

      const total = lista.length;
      const ordenados = lista.sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id
      );
      const alcancaveis = ordenados.slice(0, limiteDeRuns);
      const { fatia, cabecalhos } = paginarLista(url, alcancaveis, 30);
      return respostaJSON(200, { total_count: total, workflow_runs: fatia }, cabecalhos);
    }

    // GET /repos/{o}/{r}/compare/{base}...{head} - commits em ordem
    // cronologica crescente, como a API real.
    const comparar = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/compare\/(.+)$/);
    if (comparar) {
      const nome = `${decodeURIComponent(comparar[1])}/${decodeURIComponent(comparar[2])}`;
      const chave = comparar[3].split("...").map(decodeURIComponent).join("...");
      const valor = comparacoes[nome]?.[chave];
      if (valor === undefined) return respostaJSON(404, { message: "Not Found" });
      if (valor instanceof Response) return valor;
      const commits = Array.isArray(valor) ? valor : (valor.commits ?? []);
      const total = Array.isArray(valor) ? commits.length : (valor.total_commits ?? commits.length);
      const { fatia, cabecalhos } = paginarLista(url, commits, 250);
      return respostaJSON(200, { status: "ahead", ahead_by: total, total_commits: total, commits: fatia }, cabecalhos);
    }

    return respostaJSON(404, { message: "Not Found" });
  }

  return { fetch: fetchFalso, chamadas };
}
