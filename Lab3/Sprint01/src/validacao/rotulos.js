// Rotulos da amostra-ouro (secao 6 do enunciado): leitura e validacao das
// planilhas que cada avaliador preenche SOZINHO (processed/rotulos_<nome>.csv,
// geradas por amostra-ouro.js). Os arquivos de cada avaliador nunca sao
// alterados aqui: a validacao so' le, normaliza e aponta problemas.
//
// Regra geral: so' conta como avaliacao um rotulo que normaliza para uma das
// categorias da dimensao. Celula vazia e' AUSENTE; valor fora da lista e'
// INVALIDO; os dois ficam fora do kappa e do consenso (nunca viram palpite).

// As tres dimensoes do enunciado. `unidade` diz o que e' rotulado: o
// repositorio (tipo e "entrega real") ou cada release sorteada (corretiva).
export const DIMENSOES = Object.freeze([
  Object.freeze({
    nome: "tipo_do_projeto",
    unidade: "repositorio",
    descricao: "Tipo do projeto",
    categorias: Object.freeze(["biblioteca_framework", "aplicacao_servico", "ferramenta_cli", "outro"]),
  }),
  Object.freeze({
    nome: "releases_sao_entrega_real",
    unidade: "repositorio",
    descricao: "As releases representam entregas reais ao usuario?",
    categorias: Object.freeze(["sim", "nao", "incerto"]),
  }),
  Object.freeze({
    nome: "release_corretiva",
    unidade: "release",
    descricao: "A release e' corretiva?",
    categorias: Object.freeze(["sim", "nao"]),
  }),
]);

export const DIMENSOES_POR_NOME = Object.freeze(Object.fromEntries(DIMENSOES.map((d) => [d.nome, d])));

// Formas aceitas na planilha -> categoria canonica. A comparacao ignora
// maiusculas, acentos, espacos extras e os separadores "/", "_" e "-", entao
// "Biblioteca/Framework", "biblioteca framework" e "biblioteca_framework" sao
// a mesma coisa. Nada alem disso e' adivinhado: "talvez" ou "1" sao invalidos.
const SINONIMOS = Object.freeze({
  tipo_do_projeto: {
    "biblioteca framework": "biblioteca_framework",
    biblioteca: "biblioteca_framework",
    framework: "biblioteca_framework",
    "aplicacao servico": "aplicacao_servico",
    aplicacao: "aplicacao_servico",
    servico: "aplicacao_servico",
    "ferramenta cli": "ferramenta_cli",
    cli: "ferramenta_cli",
    outro: "outro",
  },
  releases_sao_entrega_real: { sim: "sim", s: "sim", nao: "nao", n: "nao", incerto: "incerto" },
  release_corretiva: { sim: "sim", s: "sim", nao: "nao", n: "nao" },
});

export function simplificar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Devolve { estado: "valido" | "ausente" | "invalido", rotulo, bruto }.
export function normalizarRotulo(dimensao, bruto) {
  const texto = simplificar(bruto);
  if (texto === "") return { estado: "ausente", rotulo: null, bruto: bruto ?? "" };
  const rotulo = SINONIMOS[dimensao]?.[texto];
  if (!rotulo) return { estado: "invalido", rotulo: null, bruto };
  return { estado: "valido", rotulo, bruto };
}

// Identificadores das unidades de analise, estaveis e legiveis no CSV:
//   repositorio -> "owner/nome"
//   release     -> "owner/nome@<release_id>"  (o id da API nao muda se a tag mudar)
export function idDaUnidade(dimensao, linha) {
  return DIMENSOES_POR_NOME[dimensao].unidade === "repositorio" ? linha.full_name : `${linha.full_name}@${linha.release_id}`;
}

// Unidades esperadas em cada dimensao, a partir da planilha base (amostra_ouro.csv).
export function unidadesDaAmostra(amostra) {
  const porDimensao = {};
  for (const dimensao of DIMENSOES) {
    const unidades = new Map();
    for (const linha of amostra) {
      const id = idDaUnidade(dimensao.nome, linha);
      if (!unidades.has(id)) {
        unidades.set(id, {
          id,
          full_name: linha.full_name,
          repo_id: linha.repo_id ?? "",
          release_id: dimensao.unidade === "release" ? linha.release_id : "",
          tag_name: dimensao.unidade === "release" ? linha.tag_name : "",
          url: dimensao.unidade === "release" ? linha.release_url : linha.repo_url,
        });
      }
    }
    porDimensao[dimensao.nome] = unidades;
  }
  return porDimensao;
}

function problema(avaliador, tipo, detalhe, { dimensao = "", unidade = "" } = {}) {
  return { avaliador, dimensao, unidade_id: unidade, tipo, detalhe };
}

// Valida a planilha de UM avaliador contra a amostra.
//   planilha: { cabecalho, registros } (lerTabelaCSV) ou null se o arquivo nao existe
// Devolve { avaliador, existe, rotulos: { dimensao: Map(id -> {estado, rotulo, bruto}) }, problemas, resumo }.
export function validarPlanilha(avaliador, planilha, amostra) {
  const unidades = unidadesDaAmostra(amostra);
  const problemas = [];
  const rotulos = Object.fromEntries(
    DIMENSOES.map((d) => [d.nome, new Map([...unidades[d.nome].keys()].map((id) => [id, { estado: "ausente", rotulo: null, bruto: "" }]))])
  );

  if (planilha === null) {
    problemas.push(problema(avaliador, "arquivo_ausente", "planilha de rotulos nao encontrada; todas as avaliacoes contam como ausentes"));
    return { avaliador, existe: false, rotulos, problemas, resumo: resumir(rotulos) };
  }

  const faltando = ["full_name", "release_id", ...DIMENSOES.map((d) => d.nome)].filter((c) => !planilha.cabecalho.includes(c));
  if (faltando.length > 0) {
    problemas.push(problema(avaliador, "coluna_ausente", `colunas obrigatorias ausentes: ${faltando.join(", ")}`));
  }

  // Indexa a amostra por release (full_name + release_id), a chave das linhas.
  const amostraPorChave = new Map(amostra.map((linha) => [`${linha.full_name}@${linha.release_id}`, linha]));
  const vistas = new Map();
  for (const [posicao, registro] of planilha.registros.entries()) {
    if (Object.values(registro).every((v) => String(v).trim() === "")) continue; // linha em branco no fim
    const chave = `${registro.full_name}@${registro.release_id}`;
    const base = amostraPorChave.get(chave);
    if (!base) {
      problemas.push(problema(avaliador, "linha_fora_da_amostra", `linha ${posicao + 2}: ${chave} nao esta em amostra_ouro.csv`));
      continue;
    }
    if (vistas.has(chave)) {
      problemas.push(problema(avaliador, "linha_duplicada", `linha ${posicao + 2}: ${chave} repetida`, { unidade: chave }));
    }
    vistas.set(chave, [...(vistas.get(chave) ?? []), registro]);
    if (registro.tag_name !== undefined && registro.tag_name !== base.tag_name) {
      problemas.push(
        problema(avaliador, "identificacao_divergente", `linha ${posicao + 2}: tag_name "${registro.tag_name}" difere da amostra ("${base.tag_name}")`, {
          unidade: chave,
        })
      );
    }
  }
  for (const chave of amostraPorChave.keys()) {
    if (!vistas.has(chave)) problemas.push(problema(avaliador, "linha_ausente", `${chave} nao aparece na planilha`, { unidade: chave }));
  }

  // Junta as celulas de cada unidade: uma por release, varias por repositorio
  // (a planilha repete as colunas do repositorio em todas as linhas dele).
  for (const dimensao of DIMENSOES) {
    if (!planilha.cabecalho.includes(dimensao.nome)) continue;
    const celulas = new Map();
    for (const registrosDaChave of vistas.values()) {
      for (const registro of registrosDaChave) {
        const id = idDaUnidade(dimensao.nome, registro);
        celulas.set(id, [...(celulas.get(id) ?? []), registro[dimensao.nome] ?? ""]);
      }
    }
    for (const [id, valores] of celulas) {
      const resultado = consolidarCelulas(dimensao.nome, valores);
      rotulos[dimensao.nome].set(id, resultado);
      if (resultado.estado === "invalido") {
        problemas.push(
          problema(avaliador, "rotulo_invalido", `valor(es) fora das categorias (${dimensao.categorias.join(" | ")}): ${resultado.bruto}`, {
            dimensao: dimensao.nome,
            unidade: id,
          })
        );
      } else if (resultado.estado === "inconsistente") {
        problemas.push(
          problema(avaliador, "rotulo_inconsistente", `valores diferentes para a mesma unidade: ${resultado.bruto}`, {
            dimensao: dimensao.nome,
            unidade: id,
          })
        );
      }
    }
  }

  return { avaliador, existe: true, rotulos, problemas, resumo: resumir(rotulos) };
}

// Varias celulas da mesma unidade -> um rotulo. Celulas vazias sao ignoradas
// (basta preencher uma linha do repositorio). Qualquer valor invalido, ou dois
// valores validos diferentes, deixam a unidade SEM rotulo: escolher um deles
// seria decidir pelo avaliador.
export function consolidarCelulas(dimensao, valores) {
  const normalizados = valores.map((valor) => normalizarRotulo(dimensao, valor)).filter((r) => r.estado !== "ausente");
  if (normalizados.length === 0) return { estado: "ausente", rotulo: null, bruto: "" };
  const brutos = [...new Set(normalizados.map((r) => String(r.bruto).trim()))].join(" | ");
  if (normalizados.some((r) => r.estado === "invalido")) return { estado: "invalido", rotulo: null, bruto: brutos };
  const distintos = [...new Set(normalizados.map((r) => r.rotulo))];
  if (distintos.length > 1) return { estado: "inconsistente", rotulo: null, bruto: brutos };
  return { estado: "valido", rotulo: distintos[0], bruto: brutos };
}

function resumir(rotulos) {
  return Object.fromEntries(
    Object.entries(rotulos).map(([dimensao, mapa]) => {
      const contagem = { esperados: mapa.size, validos: 0, ausentes: 0, invalidos: 0, inconsistentes: 0 };
      for (const { estado } of mapa.values()) {
        if (estado === "valido") contagem.validos += 1;
        else if (estado === "ausente") contagem.ausentes += 1;
        else if (estado === "invalido") contagem.invalidos += 1;
        else contagem.inconsistentes += 1;
      }
      return [dimensao, contagem];
    })
  );
}

// "nao_iniciado" | "parcial" | "completo", olhando as tres dimensoes juntas.
export function situacaoDoAvaliador(validacao) {
  const contagens = Object.values(validacao.resumo);
  const validos = contagens.reduce((s, c) => s + c.validos, 0);
  const esperados = contagens.reduce((s, c) => s + c.esperados, 0);
  if (!validacao.existe || validos === 0) return "nao_iniciado";
  return validos === esperados ? "completo" : "parcial";
}
