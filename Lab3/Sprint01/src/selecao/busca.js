// Busca dos repositorios candidatos (GET /search/repositories?q=stars:>1000).
//
// A busca devolve no maximo 1.000 resultados por consulta, entao a selecao e'
// FATIADA por faixas de estrelas, de cima para baixo:
//
//   fatia 1: stars:>1000            (ordenado por estrelas, desc) -> menor = 52.310
//   fatia 2: stars:1001..52310      -> menor = 31.877
//   fatia 3: stars:1001..31877      -> ...
//
// O teto de cada fatia e' a MENOR contagem de estrelas da fatia anterior,
// inclusive, para nao perder empates na fronteira; os repetidos sao
// descartados pelo id. As faixas sao derivadas dos dados (nao escolhidas a
// mao), e o teto cai a cada fatia, entao a busca sempre termina.
//
// Para quando reune `quantidade` candidatos ou quando uma fatia vem completa
// (nao ha mais repositorios acima do minimo de estrelas). Os candidatos sao os
// `quantidade` com mais estrelas, desempatados por full_name - uma regra
// deterministica que nao depende da ordem em que a API devolveu os itens.
// As fatias executadas ficam registradas na saida, para auditoria.

import { ErroGitHub } from "../github/cliente.js";
import { logSilencioso } from "../log.js";
import { ehItemDeBuscaValido } from "./modelo.js";

export function consultaDaFatia(estrelasAcimaDe, teto) {
  return teto === null ? `stars:>${estrelasAcimaDe}` : `stars:${estrelasAcimaDe + 1}..${teto}`;
}

export function compararCandidatos(a, b) {
  if (a.stargazers_count !== b.stargazers_count) return b.stargazers_count - a.stargazers_count;
  const na = a.full_name.toLowerCase();
  const nb = b.full_name.toLowerCase();
  if (na !== nb) return na < nb ? -1 : 1;
  return a.id - b.id;
}

// Le todas as paginas de uma fatia, seguindo o rel="next" do cabecalho Link.
async function lerFatia(cliente, consulta, porPagina) {
  let resposta = await cliente.get("/search/repositories", {
    q: consulta,
    sort: "stars",
    order: "desc",
    per_page: porPagina,
  });
  const itens = [];
  let total = null;
  let incompleta = false;
  let paginas = 0;
  for (;;) {
    if (resposta.status !== 200 || !Array.isArray(resposta.corpo?.items)) {
      const mensagem = resposta.corpo?.message ?? "resposta sem o campo items";
      throw new ErroGitHub(`busca "${consulta}" falhou: HTTP ${resposta.status} - ${mensagem}`, {
        status: resposta.status,
        url: resposta.url,
      });
    }
    paginas += 1;
    if (total === null && Number.isInteger(resposta.corpo.total_count)) total = resposta.corpo.total_count;
    if (resposta.corpo.incomplete_results === true) incompleta = true;
    for (const item of resposta.corpo.items) itens.push({ ...item, _coletadoEm: resposta.coletadoEm });
    if (!resposta.links.next) break;
    resposta = await cliente.get(resposta.links.next);
  }
  return { itens, total, incompleta, paginas };
}

export async function buscarCandidatos(cliente, { estrelasAcimaDe, quantidade, porPagina = 100, log = logSilencioso }) {
  const porId = new Map();
  const fatias = [];
  let itensInvalidos = 0;
  let teto = null;

  while (porId.size < quantidade) {
    const consulta = consultaDaFatia(estrelasAcimaDe, teto);
    const { itens, total, incompleta, paginas } = await lerFatia(cliente, consulta, porPagina);

    let novos = 0;
    let menor = null;
    for (const item of itens) {
      if (!ehItemDeBuscaValido(item)) {
        itensInvalidos += 1;
        log.aviso(`busca "${consulta}": item sem id/full_name/stargazers_count ignorado`);
        continue;
      }
      if (menor === null || item.stargazers_count < menor) menor = item.stargazers_count;
      if (!porId.has(item.id)) {
        porId.set(item.id, item);
        novos += 1;
      }
    }

    const fatia = {
      query: consulta,
      total_count: total,
      returned: itens.length,
      new_candidates: novos,
      pages: paginas,
      incomplete_results: incompleta,
      truncated: false,
    };
    fatias.push(fatia);
    log.info(`busca "${consulta}": ${itens.length} de ${total ?? "?"} resultados, ${novos} novos (acumulado: ${porId.size})`);
    if (incompleta) log.aviso(`a API marcou a busca "${consulta}" como incompleta (incomplete_results = true)`);

    const fatiaCompleta = total !== null && itens.length >= total;
    if (fatiaCompleta || menor === null) break;

    const proximoTeto = teto === null ? menor : Math.min(menor, teto);
    if (proximoTeto === teto) {
      // A fatia inteira ficou no mesmo valor de estrelas: o teto nao desce.
      // Uma consulta exata ("stars:T") diz se ha mais empatados do que os
      // ja coletados - nesse caso os excedentes nao sao alcancaveis por
      // faixa de estrelas e o truncamento fica registrado.
      const empatados = [...porId.values()].filter((r) => r.stargazers_count === teto).length;
      const exata = await cliente.get("/search/repositories", { q: `stars:${teto}`, per_page: 1 });
      const totalEmpatados = exata.corpo?.total_count;
      fatia.ties_at_ceiling = { stars: teto, collected: empatados, total_count: totalEmpatados ?? null };
      if (!Number.isInteger(totalEmpatados) || totalEmpatados > empatados) {
        fatia.truncated = true;
        log.aviso(`ha ${totalEmpatados ?? "?"} repositorios com ${teto} estrelas e so' ${empatados} sao alcancaveis pela busca; os demais ficaram de fora`);
      }
      teto -= 1;
    } else {
      teto = proximoTeto;
    }
    if (teto <= estrelasAcimaDe) break;
  }

  const ordenados = [...porId.values()].sort(compararCandidatos);
  return {
    candidatos: ordenados.slice(0, quantidade),
    totalEncontrado: porId.size,
    fatias,
    itensInvalidos,
  };
}
