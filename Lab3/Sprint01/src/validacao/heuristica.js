// Avaliacao da heuristica de release corretiva (CFR b, Pessoa B) frente ao
// consenso da amostra-ouro (secao 6, passo 5 do enunciado). Este modulo NAO
// implementa a heuristica: so' recebe as previsoes dela e mede o acerto.
//
// CONTRATO DE ENTRADA (o que o modulo da Pessoa B entrega):
//
//   processed/heuristica_corretiva.csv, uma linha por release classificada:
//     full_name           owner/nome
//     release_id          id da release na API (chave da associacao)
//     tag_name            tag (usada so' quando release_id vem vazio)
//     corretiva_prevista  sim | nao   (tambem aceita true/false e 1/0)
//     versao_heuristica   identificador da versao da regra (ex.: "v1-semver-patch")
//
//   Linhas a mais (releases fora da amostra-ouro) sao permitidas e ignoradas.
//   Varias versoes no mesmo arquivo sao avaliadas separadamente, para o artigo
//   documentar "cada versao testada e o F1 obtido por ela".
//   A mesma interface existe em memoria: avaliarHeuristica({ consenso, previsoes }).
//
// Classe positiva = release corretiva ("sim"), como no
// precision_recall_fscore_support(..., pos_label="sim", average="binary").

export const COLUNAS_PREVISAO = Object.freeze(["full_name", "release_id", "tag_name", "corretiva_prevista", "versao_heuristica"]);

const VALORES_PREVISAO = Object.freeze({ sim: true, true: true, 1: true, nao: false, "não": false, false: false, 0: false });

export function normalizarPrevisao(valor) {
  const texto = String(valor ?? "").trim().toLowerCase();
  return Object.hasOwn(VALORES_PREVISAO, texto) ? VALORES_PREVISAO[texto] : null;
}

// Precisao, recall e F1 a partir da matriz de confusao. Divisao por zero vira
// null ("nao definido"), e nao 0: sem nenhuma previsao positiva nao ha
// precisao a medir. F1 = 2VP / (2VP + FP + FN), igual a media harmonica de P e R
// sempre que as duas existem.
export function metricas({ vp, fp, fn, vn }) {
  const precisao = vp + fp === 0 ? null : vp / (vp + fp);
  const recall = vp + fn === 0 ? null : vp / (vp + fn);
  const f1 = 2 * vp + fp + fn === 0 ? null : (2 * vp) / (2 * vp + fp + fn);
  const total = vp + fp + fn + vn;
  return { vp, fp, fn, vn, avaliadas: total, precisao, recall, f1, acuracia: total === 0 ? null : (vp + vn) / total };
}

// consenso: linhas de consolidarDimensao da dimensao release_corretiva.
// previsoes: registros no formato do contrato acima.
export function avaliarHeuristica({ consenso, previsoes, limiarF1 = 0.7 }) {
  const problemas = [];
  const porVersao = new Map();
  const chaveDe = (fullName, releaseId, tag) => (String(releaseId ?? "").trim() !== "" ? `${fullName}@${String(releaseId).trim()}` : `${fullName}#tag:${tag}`);

  // Releases da amostra, indexadas pelas duas chaves possiveis.
  const porChave = new Map();
  for (const linha of consenso) {
    porChave.set(chaveDe(linha.full_name, linha.release_id, linha.tag_name), linha);
    porChave.set(`${linha.full_name}#tag:${linha.tag_name}`, linha);
  }

  let foraDaAmostra = 0;
  for (const [posicao, previsao] of previsoes.entries()) {
    const versao = String(previsao.versao_heuristica ?? "").trim() || "sem_versao";
    const alvo = porChave.get(chaveDe(previsao.full_name, previsao.release_id, previsao.tag_name));
    if (!alvo) { foraDaAmostra += 1; continue; }
    if (!porVersao.has(versao)) porVersao.set(versao, new Map());
    const daVersao = porVersao.get(versao);
    const valor = normalizarPrevisao(previsao.corretiva_prevista);
    if (valor === null) {
      problemas.push({ versao, unidade_id: alvo.unidade_id, tipo: "previsao_invalida", detalhe: `linha ${posicao + 2}: "${previsao.corretiva_prevista ?? ""}" nao e' sim/nao` });
    }
    if (daVersao.has(alvo.unidade_id) && daVersao.get(alvo.unidade_id) !== valor) {
      problemas.push({ versao, unidade_id: alvo.unidade_id, tipo: "previsao_conflitante", detalhe: `linha ${posicao + 2}: a mesma release tem previsoes diferentes; nenhuma foi usada` });
      daVersao.set(alvo.unidade_id, "conflito");
      continue;
    }
    if (daVersao.get(alvo.unidade_id) !== "conflito") daVersao.set(alvo.unidade_id, valor);
  }

  const versoes = [];
  for (const [versao, previstas] of porVersao) {
    const confusao = { vp: 0, fp: 0, fn: 0, vn: 0 };
    const casos = [];
    for (const linha of consenso) {
      const previsto = previstas.get(linha.unidade_id);
      const real = linha.status === "consenso" ? linha.rotulo_consenso === "sim" : null;
      let classe;
      if (real === null) classe = "sem_consenso";
      else if (previsto === undefined) classe = "sem_previsao";
      else if (previsto === null || previsto === "conflito") classe = "previsao_invalida";
      else if (previsto && real) classe = "vp";
      else if (previsto && !real) classe = "fp";
      else if (!previsto && real) classe = "fn";
      else classe = "vn";
      if (Object.hasOwn(confusao, classe)) confusao[classe] += 1;
      casos.push({
        versao_heuristica: versao,
        unidade_id: linha.unidade_id,
        full_name: linha.full_name,
        release_id: linha.release_id,
        tag_name: linha.tag_name,
        url: linha.url,
        rotulo_consenso: linha.rotulo_consenso ?? "",
        metodo_consenso: linha.metodo ?? "",
        corretiva_prevista: previsto === true ? "sim" : previsto === false ? "nao" : "",
        classe,
      });
    }
    const m = metricas(confusao);
    const semConsenso = casos.filter((c) => c.classe === "sem_consenso").length;
    const semPrevisao = casos.filter((c) => c.classe === "sem_previsao" || c.classe === "previsao_invalida").length;
    versoes.push({
      versao,
      ...m,
      sem_consenso: semConsenso,
      sem_previsao: semPrevisao,
      limiar_f1: limiarF1,
      // "Se o F1 ficar abaixo de 0,70, refine a heuristica e reavalie."
      situacao: m.f1 === null ? "indefinido" : m.f1 >= limiarF1 ? "aprovada" : "refinar",
      casos,
    });
  }
  versoes.sort((a, b) => a.versao.localeCompare(b.versao));
  return { versoes, problemas, previsoesForaDaAmostra: foraDaAmostra };
}
