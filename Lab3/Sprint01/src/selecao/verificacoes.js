// Chamadas por repositorio feitas pela etapa de selecao:
//   - existencia de GitHub Actions (filtro do funil, antes de gastar outras chamadas);
//   - numero de contribuidores (metadado).
//
// Nenhuma das duas lanca excecao para respostas 4xx: o motivo volta em `erro`,
// para ser registrado no repositorio. Falhas persistentes de rede/5xx sobem
// como ErroGitHub (lancadas pelo cliente) e interrompem a execucao, que pode
// ser retomada pelo cache.

import { caminhoDoRepositorio } from "../github/caminhos.js";
import { numeroDaPagina } from "../github/link.js";

// GET /repos/{owner}/{repo}/actions/workflows: total_count = 0 -> nao usa Actions.
export async function verificarGitHubActions(cliente, fullName) {
  const resposta = await cliente.get(`${caminhoDoRepositorio(fullName)}/actions/workflows`, { per_page: 1 });
  if (resposta.status !== 200) {
    return { possuiActions: null, totalWorkflows: null, erro: `actions_http_${resposta.status}` };
  }
  const total = resposta.corpo?.total_count;
  if (!Number.isInteger(total) || total < 0) {
    return { possuiActions: null, totalWorkflows: null, erro: "actions_unexpected_response" };
  }
  return { possuiActions: total > 0, totalWorkflows: total, erro: null };
}

// GET /repos/{owner}/{repo}/contributors?per_page=1&anon=true
// Com uma pessoa por pagina, o numero da ultima pagina (rel="last" do Link)
// e' o total de contribuidores, sem baixar a lista. anon=true inclui os
// contribuidores anonimos (commits com e-mail sem conta no GitHub).
//
//   200 + Link com rel="last" -> numero da ultima pagina
//   200 sem Link              -> tamanho da lista (0 ou 1: cabe numa pagina so')
//   204                       -> repositorio vazio, 0 contribuidores
//   403 "too large"           -> o GitHub nao calcula para historicos enormes
export async function contarContribuidores(cliente, fullName) {
  const resposta = await cliente.get(`${caminhoDoRepositorio(fullName)}/contributors`, { per_page: 1, anon: "true" });

  if (resposta.status === 204) return { contribuidores: 0, erro: null };

  if (resposta.status === 403 && /too large/i.test(resposta.corpo?.message ?? "")) {
    return { contribuidores: null, erro: "contributors_list_too_large" };
  }
  if (resposta.status !== 200) {
    return { contribuidores: null, erro: `contributors_http_${resposta.status}` };
  }
  if (!Array.isArray(resposta.corpo)) {
    return { contribuidores: null, erro: "contributors_unexpected_response" };
  }

  if (resposta.links.last) {
    const ultima = numeroDaPagina(resposta.links.last);
    if (ultima === null) {
      return { contribuidores: null, erro: "contributors_invalid_link_header" };
    }
    return { contribuidores: ultima, erro: null };
  }
  if (resposta.links.next) {
    // Ha proxima pagina mas nao ha "last": nao da para saber o total sem
    // percorrer tudo - registra em vez de chutar.
    return { contribuidores: null, erro: "contributors_missing_last_page" };
  }
  return { contribuidores: resposta.corpo.length, erro: null };
}
