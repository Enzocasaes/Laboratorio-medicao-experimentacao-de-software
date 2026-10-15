// Consolidacao do consenso da amostra-ouro (secao 6, passo 4 do enunciado).
// Funcoes puras: recebem os rotulos ja validados (rotulos.js) e as decisoes de
// reuniao ja lidas, e devolvem uma linha por unidade e dimensao.
//
// PROTOCOLO DE DESEMPATE (o exemplo do proprio enunciado):
//
//   1. Unanimidade   - todos os avaliadores com rotulo valido e iguais
//                      -> consenso automatico, metodo "unanimidade".
//   2. Maioria       - todos com rotulo valido e uma categoria com mais da
//                      metade dos votos (2 x 1 com tres avaliadores)
//                      -> consenso automatico, metodo "maioria_simples".
//   3. Reuniao       - os casos sem maioria (1-1-1) ou com rotulo ausente/
//                      invalido de algum avaliador NAO recebem rotulo
//                      automatico: ficam "sem_consenso" ate o grupo decidir em
//                      reuniao e registrar a decisao em
//                      processed/consenso_reuniao.csv (com justificativa).
//                      A decisao registrada vale tambem sobre os casos 1 e 2,
//                      se o grupo revisar algum deles.
//
// Nada aqui inventa um rotulo humano: a coluna `decisao_automatica` diz se o
// rotulo veio da regra (1 e 2) ou de uma decisao registrada pelo grupo (3).

export const METODOS = Object.freeze({
  UNANIMIDADE: "unanimidade",
  MAIORIA: "maioria_simples",
  REUNIAO: "reuniao",
});

export const MOTIVOS_SEM_CONSENSO = Object.freeze({
  EMPATE: "empate_sem_maioria",
  INCOMPLETO: "rotulos_incompletos",
});

export const COLUNAS_DECISAO = Object.freeze(["dimensao", "unidade_id", "rotulo_consenso", "justificativa", "participantes", "data_reuniao"]);

// "sim:2;nao:1", em ordem decrescente de votos (empate pela ordem das categorias).
export function descreverVotos(rotulos, categorias) {
  const contagem = new Map();
  for (const rotulo of rotulos) if (rotulo !== null) contagem.set(rotulo, (contagem.get(rotulo) ?? 0) + 1);
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || categorias.indexOf(a[0]) - categorias.indexOf(b[0]))
    .map(([rotulo, votos]) => `${rotulo}:${votos}`)
    .join(";");
}

// Regra automatica (passos 1 e 2) para uma unidade.
// rotulos: um por avaliador, null quando ausente/invalido.
export function regraAutomatica(rotulos) {
  const validos = rotulos.filter((r) => r !== null);
  if (validos.length < rotulos.length) {
    return {
      status: "sem_consenso",
      rotulo: null,
      metodo: null,
      motivo: MOTIVOS_SEM_CONSENSO.INCOMPLETO,
      justificativa: `${validos.length} de ${rotulos.length} avaliadores com rotulo valido; nao se decide por maioria com avaliacao faltando`,
    };
  }
  const contagem = new Map();
  for (const r of validos) contagem.set(r, (contagem.get(r) ?? 0) + 1);
  const [lider, votos] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  if (votos === validos.length) {
    return { status: "consenso", rotulo: lider, metodo: METODOS.UNANIMIDADE, motivo: null, justificativa: `os ${votos} avaliadores concordam` };
  }
  if (votos * 2 > validos.length) {
    return {
      status: "consenso",
      rotulo: lider,
      metodo: METODOS.MAIORIA,
      motivo: null,
      justificativa: `maioria simples (${votos} de ${validos.length}); caso divergente, pode ser revisto em reuniao`,
    };
  }
  return {
    status: "sem_consenso",
    rotulo: null,
    metodo: null,
    motivo: MOTIVOS_SEM_CONSENSO.EMPATE,
    justificativa: "nenhuma categoria tem maioria; precisa de decisao em reuniao",
  };
}

// Valida as decisoes registradas pelo grupo. Devolve { decisoes: Map("dim|id" -> decisao), problemas }.
// Decisao invalida e' rejeitada (e apontada), nunca corrigida.
export function validarDecisoes(registros, { dimensoes, unidades }) {
  const decisoes = new Map();
  const problemas = [];
  for (const [posicao, registro] of registros.entries()) {
    const linha = posicao + 2;
    const dimensao = dimensoes.find((d) => d.nome === String(registro.dimensao ?? "").trim());
    const id = String(registro.unidade_id ?? "").trim();
    const rotulo = String(registro.rotulo_consenso ?? "").trim();
    const erro = (detalhe) => problemas.push({ avaliador: "consenso_reuniao", dimensao: registro.dimensao ?? "", unidade_id: id, tipo: "decisao_invalida", detalhe: `linha ${linha}: ${detalhe}` });

    if (!dimensao) { erro(`dimensao desconhecida "${registro.dimensao ?? ""}"`); continue; }
    if (!unidades[dimensao.nome]?.has(id)) { erro(`unidade "${id}" nao esta na amostra-ouro`); continue; }
    if (!dimensao.categorias.includes(rotulo)) { erro(`rotulo "${rotulo}" fora das categorias (${dimensao.categorias.join(" | ")})`); continue; }
    if (String(registro.justificativa ?? "").trim() === "") { erro("justificativa vazia: registre por que o grupo decidiu assim"); continue; }
    if (String(registro.participantes ?? "").trim() === "") { erro("participantes vazio: registre quem decidiu"); continue; }

    const chave = `${dimensao.nome}|${id}`;
    if (decisoes.has(chave)) {
      if (decisoes.get(chave).rotulo !== rotulo) {
        erro("decisao repetida com rotulo diferente; nenhuma das duas foi aplicada");
        decisoes.set(chave, { ...decisoes.get(chave), conflito: true });
      }
      continue;
    }
    decisoes.set(chave, {
      rotulo,
      justificativa: String(registro.justificativa).trim(),
      participantes: String(registro.participantes).trim(),
      data: String(registro.data_reuniao ?? "").trim(),
      conflito: false,
    });
  }
  for (const [chave, decisao] of decisoes) if (decisao.conflito) decisoes.delete(chave);
  return { decisoes, problemas };
}

// Consolida uma dimensao inteira.
//   unidades:  Map(id -> metadados da unidade) (rotulos.unidadesDaAmostra)
//   porAvaliador: { nome: Map(id -> {rotulo}) }  (validarPlanilha(...).rotulos[dimensao])
export function consolidarDimensao({ dimensao, unidades, avaliadores, porAvaliador, decisoes = new Map() }) {
  const linhas = [];
  for (const [id, unidade] of unidades) {
    const rotulos = avaliadores.map((nome) => porAvaliador[nome]?.get(id)?.rotulo ?? null);
    const automatica = regraAutomatica(rotulos);
    const decisao = decisoes.get(`${dimensao.nome}|${id}`);
    const final = decisao
      ? {
          status: "consenso",
          rotulo: decisao.rotulo,
          metodo: METODOS.REUNIAO,
          motivo: null,
          justificativa: `${decisao.justificativa} (reuniao${decisao.data ? ` de ${decisao.data}` : ""}; participantes: ${decisao.participantes})`,
        }
      : automatica;
    linhas.push({
      dimensao: dimensao.nome,
      unidade_id: id,
      full_name: unidade.full_name,
      release_id: unidade.release_id,
      tag_name: unidade.tag_name,
      url: unidade.url,
      rotulos: Object.fromEntries(avaliadores.map((nome, i) => [nome, rotulos[i]])),
      votos: descreverVotos(rotulos, dimensao.categorias),
      divergente: new Set(rotulos.filter((r) => r !== null)).size > 1,
      regra_automatica: automatica.rotulo,
      status: final.status,
      rotulo_consenso: final.rotulo,
      metodo: final.metodo,
      motivo_sem_consenso: final.motivo,
      decisao_automatica: final.status === "consenso" ? final.metodo !== METODOS.REUNIAO : null,
      justificativa: final.justificativa,
    });
  }
  return linhas;
}

export function resumirConsenso(linhas) {
  const resumo = { unidades: linhas.length, unanimidade: 0, maioria_simples: 0, reuniao: 0, sem_consenso: 0, divergentes: 0, empates: 0, incompletos: 0 };
  for (const linha of linhas) {
    if (linha.divergente) resumo.divergentes += 1;
    if (linha.status === "consenso") resumo[linha.metodo] += 1;
    else {
      resumo.sem_consenso += 1;
      if (linha.motivo_sem_consenso === MOTIVOS_SEM_CONSENSO.EMPATE) resumo.empates += 1;
      else resumo.incompletos += 1;
    }
  }
  return resumo;
}
