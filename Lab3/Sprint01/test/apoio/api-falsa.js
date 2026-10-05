// API do GitHub falsa, em memoria, para os testes (nenhum teste toca a rede).
// Reproduz o comportamento que importa para a selecao:
//   - /search/repositories com "stars:>N" e "stars:A..B", ordenacao por
//     estrelas, limite de resultados por consulta e paginacao via Link;
//   - /repos/{o}/{r}/actions/workflows (total_count);
//   - /repos/{o}/{r}/contributors?per_page=1&anon=true (Link com rel="last").

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
//   antes(url)       gancho chamado em toda requisicao; se devolver Response, ela e' usada
export function criarApiFalsa({ repos = [], limiteDaBusca = 1000, actions = {}, contribuidores = {}, antes } = {}) {
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

    return respostaJSON(404, { message: "Not Found" });
  }

  return { fetch: fetchFalso, chamadas };
}
