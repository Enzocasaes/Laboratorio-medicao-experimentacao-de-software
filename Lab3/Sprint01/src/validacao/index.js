// Etapa "validacao" (Pessoa A, S02): concordancia entre avaliadores, consenso
// e avaliacao da heuristica de release corretiva (secao 6 do enunciado).
//
//   npm run validacao                 # = node src/validacao/index.js --config config.json
//
// Offline: so' le arquivos ja gerados. Pode rodar a qualquer momento - antes do
// sorteio, com rotulagem pela metade ou sem a heuristica da Pessoa B -, e o
// relatorio diz exatamente o que esta pendente. Nada aqui produz rotulo humano:
// rotulo ausente fica ausente, e caso sem maioria fica sem consenso ate o grupo
// registrar a decisao em processed/consenso_reuniao.csv.
//
// Entradas (em <diretorios.saida>/processed):
//   amostra_ouro.csv          planilha base do sorteio (amostra-ouro.js)
//   rotulos_<avaliador>.csv   uma planilha por avaliador, preenchida sozinho
//   consenso_reuniao.csv      (opcional) decisoes do grupo para os casos divergentes
//   heuristica_corretiva.csv  (opcional) previsoes da heuristica da Pessoa B
//
// Saidas:
//   processed/rotulos_problemas.csv     tudo o que a validacao estrutural encontrou
//   processed/concordancia_kappa.csv    kappa de Fleiss por dimensao
//   processed/consenso.csv              rotulos de cada avaliador + consenso, por unidade
//   processed/consenso_pendentes.csv    casos divergentes/sem consenso, no formato de consenso_reuniao.csv
//   processed/heuristica_metricas.csv   precisao/recall/F1 por versao da heuristica
//   processed/heuristica_avaliacao.csv  VP/FP/FN/VN de cada release, por versao
//   processed/heuristica_erros.csv      so' os FP e FN, com link - evidencia para a Pessoa B
//   raw/validacao.json                  tudo acima, mais o que esta pendente
//   ../docs/validacao-manual.md         relatorio legivel (gerado, nao editar a mao)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { carregarConfig } from "../config.js";
import { gerarCSV, lerTabelaCSV } from "../csv.js";
import { criarLog, logSilencioso } from "../log.js";
import { carregarPopulacao, montarAmostra } from "./amostra-ouro.js";
import { COLUNAS_DECISAO, consolidarDimensao, resumirConsenso, validarDecisoes } from "./consenso.js";
import { kappaDaDimensao } from "./fleiss.js";
import { avaliarHeuristica } from "./heuristica.js";
import { DIMENSOES, situacaoDoAvaliador, unidadesDaAmostra, validarPlanilha } from "./rotulos.js";

export function caminhosDaValidacao(dirSaida, avaliadores = []) {
  const p = (nome) => join(dirSaida, "processed", nome);
  return {
    amostra: p("amostra_ouro.csv"),
    rotulos: Object.fromEntries(avaliadores.map((nome) => [nome, p(`rotulos_${nome}.csv`)])),
    decisoes: p("consenso_reuniao.csv"),
    previsoes: p("heuristica_corretiva.csv"),
    problemas: p("rotulos_problemas.csv"),
    kappa: p("concordancia_kappa.csv"),
    consenso: p("consenso.csv"),
    pendentes: p("consenso_pendentes.csv"),
    heuristicaMetricas: p("heuristica_metricas.csv"),
    heuristicaAvaliacao: p("heuristica_avaliacao.csv"),
    heuristicaErros: p("heuristica_erros.csv"),
    json: join(dirSaida, "raw", "validacao.json"),
    relatorio: join(dirSaida, "..", "docs", "validacao-manual.md"),
  };
}

function escrever(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

function escreverCSV(caminho, colunas, objetos) {
  escrever(caminho, gerarCSV(colunas, objetos.map((o) => colunas.map((c) => o[c]))));
}

function arredondar(valor, casas = 4) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  return Math.round(valor * 10 ** casas) / 10 ** casas;
}

// Refaz o sorteio a partir dos dados atuais e compara com a planilha gravada.
// Detecta, por exemplo, que a coleta foi refeita depois do sorteio.
export function verificarReproducao(config, amostra) {
  let populacao;
  try {
    populacao = carregarPopulacao(config.diretorios.saida);
  } catch (erro) {
    return { situacao: "nao_verificavel", detalhe: erro.message };
  }
  const { linhas } = montarAmostra({
    repositorios: populacao.finais,
    releases: populacao.releases,
    quantidadeDeRepositorios: config.validacao.repositoriosNaAmostraOuro,
    releasesPorRepositorio: config.validacao.releasesPorRepositorio,
    semente: config.validacao.semente,
  });
  const chave = (l) => `${l.full_name}@${l.release_id}`;
  const refeita = linhas.map(chave);
  const gravada = amostra.map(chave);
  const iguais = refeita.length === gravada.length && refeita.every((c, i) => c === gravada[i]);
  return iguais
    ? { situacao: "reproduzida", detalhe: `o sorteio refeito com a semente ${config.validacao.semente} gera as mesmas ${gravada.length} releases` }
    : {
        situacao: "divergente",
        detalhe:
          `o sorteio refeito gera ${refeita.length} releases, ${refeita.filter((c) => !gravada.includes(c)).length} delas ausentes da planilha gravada: ` +
          "os dados de entrada mudaram depois do sorteio (ou a semente/config mudou)",
      };
}

export function executarValidacao({ config, log = logSilencioso, avaliadores = config.validacao.avaliadores }) {
  const caminhos = caminhosDaValidacao(config.diretorios.saida, avaliadores);
  const pendencias = [];
  const tabelaAmostra = lerTabelaCSV(caminhos.amostra);

  if (tabelaAmostra === null || tabelaAmostra.registros.length === 0) {
    pendencias.push('amostra-ouro ainda nao sorteada: feche a coleta (status "included") e rode `npm run amostra:ouro`');
    let populacao = null;
    try {
      populacao = carregarPopulacao(config.diretorios.saida);
    } catch (erro) {
      pendencias.push(`sorteio bloqueado: ${erro.message}`);
    }
    const resultado = {
      generated_at: new Date().toISOString(),
      situacao: "amostra_nao_sorteada",
      parametros: parametros(config, avaliadores),
      populacao_disponivel: populacao ? populacao.finais.length : 0,
      pendencias,
    };
    escrever(caminhos.json, JSON.stringify(resultado, null, 2) + "\n");
    escrever(caminhos.relatorio, gerarRelatorio(resultado));
    log.aviso(`validacao: ${pendencias.join(" | ")}`);
    return { ...resultado, caminhos };
  }

  const amostra = tabelaAmostra.registros;
  const unidades = unidadesDaAmostra(amostra);
  const reproducao = verificarReproducao(config, amostra);
  if (reproducao.situacao === "divergente") log.aviso(`amostra-ouro: ${reproducao.detalhe}`);

  // 1. Validacao estrutural de cada planilha, separadamente.
  const validacoes = Object.fromEntries(
    avaliadores.map((nome) => [nome, validarPlanilha(nome, lerTabelaCSV(caminhos.rotulos[nome]), amostra)])
  );
  const avaliadoresResumo = avaliadores.map((nome) => ({
    avaliador: nome,
    arquivo: `processed/rotulos_${nome}.csv`,
    existe: validacoes[nome].existe,
    situacao: situacaoDoAvaliador(validacoes[nome]),
    por_dimensao: validacoes[nome].resumo,
    problemas: validacoes[nome].problemas.length,
  }));
  for (const a of avaliadoresResumo) {
    if (a.situacao !== "completo") pendencias.push(`rotulagem de ${a.avaliador}: ${a.situacao.replace("_", " ")}`);
  }

  // 2. Decisoes de reuniao (opcional, preenchido pelo grupo).
  const tabelaDecisoes = lerTabelaCSV(caminhos.decisoes);
  const { decisoes, problemas: problemasDecisoes } = validarDecisoes(tabelaDecisoes?.registros ?? [], { dimensoes: DIMENSOES, unidades });

  // 3. Kappa de Fleiss e consenso, por dimensao.
  const kappas = [];
  const consenso = {};
  for (const dimensao of DIMENSOES) {
    const porAvaliador = Object.fromEntries(avaliadores.map((nome) => [nome, validacoes[nome].rotulos[dimensao.nome]]));
    const lista = [...unidades[dimensao.nome].keys()].map((id) => ({
      id,
      rotulos: avaliadores.map((nome) => porAvaliador[nome].get(id)?.rotulo ?? null),
    }));
    const k = kappaDaDimensao(lista, dimensao.categorias);
    kappas.push({ dimensao, ...k });
    consenso[dimensao.nome] = consolidarDimensao({ dimensao, unidades: unidades[dimensao.nome], avaliadores, porAvaliador, decisoes });
  }
  for (const k of kappas) {
    if (k.kappa === null) pendencias.push(`kappa de ${k.dimensao.nome}: ${k.motivo}`);
    else if (k.unidadesExcluidas.length > 0) {
      pendencias.push(`kappa de ${k.dimensao.nome} e' preliminar: ${k.unidadesExcluidas.length} de ${k.unidadesTotais} unidades sem rotulo valido de todos`);
    }
  }
  const resumoConsenso = Object.fromEntries(Object.entries(consenso).map(([d, linhas]) => [d, resumirConsenso(linhas)]));
  for (const [d, r] of Object.entries(resumoConsenso)) {
    if (r.sem_consenso > 0) pendencias.push(`consenso de ${d}: ${r.sem_consenso} unidades sem consenso (${r.empates} empates, ${r.incompletos} com rotulos incompletos)`);
  }

  // 4. Heuristica da Pessoa B (opcional).
  const tabelaPrevisoes = lerTabelaCSV(caminhos.previsoes);
  let heuristica;
  if (tabelaPrevisoes === null) {
    heuristica = { situacao: "aguardando_previsoes", versoes: [], problemas: [], previsoesForaDaAmostra: 0 };
    pendencias.push("heuristica de release corretiva (Pessoa B): processed/heuristica_corretiva.csv ainda nao existe");
  } else {
    heuristica = { situacao: "avaliada", ...avaliarHeuristica({ consenso: consenso.release_corretiva, previsoes: tabelaPrevisoes.registros, limiarF1: config.validacao.limiarF1 }) };
    for (const v of heuristica.versoes) {
      if (v.situacao === "refinar") pendencias.push(`heuristica ${v.versao}: F1 = ${arredondar(v.f1, 3)} < ${config.validacao.limiarF1}, refinar e reavaliar (evidencias em processed/heuristica_erros.csv)`);
      if (v.situacao === "indefinido") pendencias.push(`heuristica ${v.versao}: F1 indefinido (nenhuma release com consenso e previsao)`);
    }
  }

  // ---- saidas ------------------------------------------------------------
  const problemas = [...Object.values(validacoes).flatMap((v) => v.problemas), ...problemasDecisoes];
  escreverCSV(caminhos.problemas, ["avaliador", "dimensao", "unidade_id", "tipo", "detalhe"], problemas);

  const linhasKappa = kappas.map((k) => ({
    dimensao: k.dimensao.nome,
    unidade: k.dimensao.unidade,
    categorias: k.categorias.join("|"),
    avaliadores: avaliadores.length,
    unidades_totais: k.unidadesTotais,
    unidades_validas: k.unidades,
    unidades_excluidas: k.unidadesExcluidas.length,
    concordancia_observada: arredondar(k.concordanciaObservada),
    concordancia_esperada: arredondar(k.concordanciaEsperada),
    kappa_fleiss: arredondar(k.kappa),
    interpretacao: k.interpretacao,
    distribuicao: k.proporcoesPorCategoria ? k.categorias.map((c, j) => `${c}:${arredondar(k.proporcoesPorCategoria[j], 3)}`).join(";") : "",
    observacao: k.motivo ?? (k.unidadesExcluidas.length > 0 ? "preliminar: ha unidades sem rotulo valido de todos os avaliadores" : ""),
  }));
  escreverCSV(caminhos.kappa, Object.keys(linhasKappa[0]), linhasKappa);

  const colunasRotulos = avaliadores.map((nome) => `rotulo_${nome}`);
  const colunasConsenso = [
    "dimensao", "unidade_id", "full_name", "release_id", "tag_name", ...colunasRotulos,
    "votos", "divergente", "status", "rotulo_consenso", "metodo", "decisao_automatica", "motivo_sem_consenso", "justificativa", "url",
  ];
  const todasAsLinhas = Object.values(consenso).flat();
  const paraCSV = (l) => ({ ...l, ...Object.fromEntries(avaliadores.map((nome) => [`rotulo_${nome}`, l.rotulos[nome]])) });
  escreverCSV(caminhos.consenso, colunasConsenso, todasAsLinhas.map(paraCSV));

  // Pendentes: tudo o que o grupo deve discutir (divergentes, mesmo os
  // resolvidos por maioria, e os sem consenso). As colunas de COLUNAS_DECISAO
  // vem em branco - copiar a linha para consenso_reuniao.csv e preencher.
  const pendentes = todasAsLinhas.filter((l) => l.metodo !== "reuniao" && (l.divergente || l.status === "sem_consenso"));
  escreverCSV(
    caminhos.pendentes,
    [...COLUNAS_DECISAO, "situacao", "votos", "regra_automatica", ...colunasRotulos, "url"],
    pendentes.map((l) => ({
      ...paraCSV(l),
      rotulo_consenso: "",
      justificativa: "",
      participantes: "",
      data_reuniao: "",
      situacao: l.status === "sem_consenso" ? `bloqueante:${l.motivo_sem_consenso}` : "revisar:maioria_simples",
    }))
  );

  const colunasMetricas = ["versao", "avaliadas", "vp", "fp", "fn", "vn", "precisao", "recall", "f1", "acuracia", "limiar_f1", "situacao", "sem_consenso", "sem_previsao"];
  escreverCSV(caminhos.heuristicaMetricas, colunasMetricas, heuristica.versoes.map((v) => ({ ...v, precisao: arredondar(v.precisao), recall: arredondar(v.recall), f1: arredondar(v.f1), acuracia: arredondar(v.acuracia) })));
  const colunasCasos = ["versao_heuristica", "unidade_id", "full_name", "release_id", "tag_name", "rotulo_consenso", "metodo_consenso", "corretiva_prevista", "classe", "url"];
  const casos = heuristica.versoes.flatMap((v) => v.casos);
  escreverCSV(caminhos.heuristicaAvaliacao, colunasCasos, casos);
  escreverCSV(caminhos.heuristicaErros, colunasCasos, casos.filter((c) => c.classe === "fp" || c.classe === "fn"));

  const situacao = pendencias.length === 0 ? "concluida" : "pendente";
  const resultado = {
    generated_at: new Date().toISOString(),
    situacao,
    parametros: parametros(config, avaliadores),
    amostra: {
      repositorios: unidades.tipo_do_projeto.size,
      releases: unidades.release_corretiva.size,
      reproducao,
    },
    avaliadores: avaliadoresResumo,
    problemas_por_tipo: contarPor(problemas, "tipo"),
    concordancia: linhasKappa,
    consenso: resumoConsenso,
    decisoes_de_reuniao: { registradas: tabelaDecisoes?.registros.length ?? 0, aplicadas: decisoes.size, rejeitadas: problemasDecisoes.length },
    heuristica: {
      situacao: heuristica.situacao,
      previsoes_fora_da_amostra: heuristica.previsoesForaDaAmostra,
      problemas: heuristica.problemas,
      versoes: heuristica.versoes.map(({ casos: _casos, ...v }) => v),
    },
    pendencias,
  };
  escrever(caminhos.json, JSON.stringify(resultado, null, 2) + "\n");
  escrever(caminhos.relatorio, gerarRelatorio(resultado));

  log.info(`validacao: ${resultado.amostra.repositorios} repositorios, ${resultado.amostra.releases} releases na amostra-ouro; ${problemas.length} problemas nos rotulos`);
  for (const k of linhasKappa) log.info(`kappa ${k.dimensao}: ${k.kappa_fleiss ?? "indefinido"} (${k.unidades_validas}/${k.unidades_totais} unidades)`);
  for (const p of pendencias) log.aviso(`pendente: ${p}`);
  return { ...resultado, caminhos };
}

function parametros(config, avaliadores) {
  return {
    semente: config.validacao.semente,
    repositorios_na_amostra_ouro: config.validacao.repositoriosNaAmostraOuro,
    releases_por_repositorio: config.validacao.releasesPorRepositorio,
    avaliadores,
    limiar_f1: config.validacao.limiarF1,
  };
}

function contarPor(itens, campo) {
  const contagem = {};
  for (const item of itens) contagem[item[campo]] = (contagem[item[campo]] ?? 0) + 1;
  return contagem;
}

// ---- relatorio em Markdown -------------------------------------------------

const fmt = (valor, casas = 3) => (valor === null || valor === undefined || valor === "" ? "—" : Number(valor).toFixed(casas).replace(".", ","));

export function gerarRelatorio(r) {
  const l = [];
  l.push("# Validação manual — concordância, consenso e heurística corretiva", "");
  l.push("> Arquivo **gerado** por `npm run validacao` (src/validacao/index.js). Não edite à mão:", "> rode o comando de novo.", "");
  l.push(`Gerado em: ${r.generated_at}`, "");
  l.push(`**Situação: ${r.situacao === "concluida" ? "concluída" : r.situacao === "pendente" ? "pendente" : "amostra-ouro ainda não sorteada"}.**`, "");
  l.push(
    `Parâmetros: semente ${r.parametros.semente}, ${r.parametros.repositorios_na_amostra_ouro} repositórios, ` +
      `${r.parametros.releases_por_repositorio} releases por repositório, avaliadores ${r.parametros.avaliadores.join(", ")}, ` +
      `limiar de F1 ${fmt(r.parametros.limiar_f1, 2)}.`,
    ""
  );

  if (r.situacao === "amostra_nao_sorteada") {
    l.push("## Pendências", "", ...r.pendencias.map((p) => `- ${p}`), "");
    l.push(
      "Nenhum kappa, consenso ou F1 foi calculado: não há rótulos humanos. Os valores só aparecem aqui",
      "depois que a amostra for sorteada e os avaliadores preencherem suas planilhas.",
      ""
    );
    return l.join("\n");
  }

  l.push("## Amostra-ouro", "");
  l.push(`- ${r.amostra.repositorios} repositórios e ${r.amostra.releases} releases.`);
  l.push(`- Reprodutibilidade do sorteio: **${r.amostra.reproducao.situacao}** — ${r.amostra.reproducao.detalhe}.`, "");

  l.push("## Rotulagem por avaliador", "");
  l.push("| Avaliador | Situação | Tipo (válidos/esperados) | Entrega real | Corretiva | Problemas |", "|---|---|---|---|---|---|");
  for (const a of r.avaliadores) {
    const c = (d) => `${a.por_dimensao[d].validos}/${a.por_dimensao[d].esperados}`;
    l.push(`| ${a.avaliador} | ${a.situacao.replace("_", " ")} | ${c("tipo_do_projeto")} | ${c("releases_sao_entrega_real")} | ${c("release_corretiva")} | ${a.problemas} |`);
  }
  l.push("");
  const tipos = Object.entries(r.problemas_por_tipo);
  if (tipos.length > 0) l.push(`Problemas por tipo (detalhe em \`processed/rotulos_problemas.csv\`): ${tipos.map(([t, n]) => `${t} = ${n}`).join("; ")}.`, "");

  l.push("## Concordância entre avaliadores (kappa de Fleiss)", "");
  l.push("| Dimensão | Unidades válidas | Excluídas | P observada | P esperada | κ de Fleiss | Interpretação (Landis & Koch) |", "|---|---|---|---|---|---|---|");
  for (const k of r.concordancia) {
    l.push(`| ${k.dimensao} | ${k.unidades_validas}/${k.unidades_totais} | ${k.unidades_excluidas} | ${fmt(k.concordancia_observada)} | ${fmt(k.concordancia_esperada)} | ${fmt(k.kappa_fleiss)} | ${k.interpretacao} |`);
  }
  l.push("");
  l.push(
    "Procedimento: casos completos — só entram unidades com rótulo válido de **todos** os avaliadores;",
    "rótulo vazio, fora das categorias ou inconsistente entre linhas do mesmo repositório conta como ausente.",
    "A concordância observada é a média dos P_i de Fleiss, não a porcentagem simples de acordo.",
    ""
  );

  l.push("## Consenso", "");
  l.push("| Dimensão | Unidades | Unanimidade | Maioria simples | Reunião | Sem consenso | Divergentes |", "|---|---|---|---|---|---|---|");
  for (const [d, c] of Object.entries(r.consenso)) {
    l.push(`| ${d} | ${c.unidades} | ${c.unanimidade} | ${c.maioria_simples} | ${c.reuniao} | ${c.sem_consenso} | ${c.divergentes} |`);
  }
  l.push("");
  l.push(
    `Decisões de reunião: ${r.decisoes_de_reuniao.registradas} registradas, ${r.decisoes_de_reuniao.aplicadas} aplicadas, ${r.decisoes_de_reuniao.rejeitadas} rejeitadas.`,
    "Unanimidade e maioria simples são regras **automáticas**; só \"reunião\" é decisão do grupo (coluna `decisao_automatica` em `processed/consenso.csv`).",
    ""
  );

  l.push("## Heurística de release corretiva (Pessoa B)", "");
  if (r.heuristica.situacao === "aguardando_previsoes") {
    l.push("Ainda não avaliada: `processed/heuristica_corretiva.csv` não existe.", "");
  } else {
    l.push("| Versão | Avaliadas | VP | FP | FN | VN | Precisão | Recall | F1 | Situação |", "|---|---|---|---|---|---|---|---|---|---|");
    for (const v of r.heuristica.versoes) {
      l.push(`| ${v.versao} | ${v.avaliadas} | ${v.vp} | ${v.fp} | ${v.fn} | ${v.vn} | ${fmt(v.precisao)} | ${fmt(v.recall)} | ${fmt(v.f1)} | ${v.situacao} |`);
    }
    l.push("", `Previsões para releases fora da amostra (ignoradas): ${r.heuristica.previsoes_fora_da_amostra}. Problemas nas previsões: ${r.heuristica.problemas.length}.`, "");
  }

  l.push("## Pendências", "");
  l.push(...(r.pendencias.length === 0 ? ["Nenhuma."] : r.pendencias.map((p) => `- ${p}`)), "");
  return l.join("\n");
}

// ---- CLI -----------------------------------------------------------------

export function parseArgs(argv) {
  const args = { config: "config.json" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config") {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) throw new Error("--config exige um valor");
      args.config = valor;
      i += 1;
    } else {
      throw new Error(`argumento desconhecido: ${argv[i]}`);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2), { log = criarLog() } = {}) {
  const args = parseArgs(argv);
  return executarValidacao({ config: carregarConfig(args.config), log });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (erro) {
    console.error(`Erro: ${erro.message}`);
    process.exit(1);
  }
}
