import {
  validarCabecalho,
  validarSemDuplicados,
  validarSemCamposVazios,
  validarValoresNumericos,
  validarSomaColuna,
} from "./estrutura.js";

const INDICE_COLUNA_LINGUAGEM = 0;
const INDICE_COLUNA_QUANTIDADE = 1;
const INDICE_COLUNA_MEDIANA_PRS = 2;
const INDICE_COLUNA_MEDIANA_RELEASES = 3;
const INDICE_COLUNA_MEDIANA_DIAS = 4;
const TOTAL_REPOSITORIOS_ESPERADO = 1000;
const LIMITE_GRUPO_PEQUENO = 5;

// RQ07 e uma metrica agregada (1 linha por linguagem, nao por repositorio),
// entao nao reaproveita "validarQuantidadeDeLinhas" nem checa duplicados por
// repositorio: aqui a chave e "linguagem_primaria" e o tamanho da tabela
// depende de quantas linguagens distintas apareceram na coleta.
export const VALIDACAO_RQ07 = {
  chave: "rq07",
  titulo: "Validacao RQ07 - metricas por linguagem primaria",
  arquivoCSV: "rq07PorLinguagem.csv",
  cabecalhoEsperado: [
    "linguagem_primaria",
    "quantidade_repositorios",
    "mediana_pull_requests_aceitas",
    "mediana_releases",
    "mediana_dias_desde_atualizacao",
  ],

  validar(cabecalho, linhas) {
    return [
      {
        checagem: "Cabecalho",
        descricao: `as colunas do CSV devem ser, nesta ordem: ${this.cabecalhoEsperado.join(", ")}`,
        erros: validarCabecalho(cabecalho, this.cabecalhoEsperado),
      },
      {
        checagem: "Linguagens duplicadas",
        descricao: 'nenhum valor da coluna "linguagem_primaria" pode aparecer em mais de uma linha (cada linguagem e um grupo unico)',
        erros: validarSemDuplicados(linhas, INDICE_COLUNA_LINGUAGEM),
      },
      {
        checagem: "Campos vazios",
        descricao: "nenhuma celula, em nenhuma coluna, pode estar vazia ou ausente",
        erros: validarSemCamposVazios(cabecalho, linhas),
      },
      {
        checagem: "Valores numericos",
        descricao: '"quantidade_repositorios" deve ser inteiro >= 1; as 3 medianas devem ser numeros >= 0',
        erros: [
          ...validarValoresNumericos(linhas, INDICE_COLUNA_QUANTIDADE, { minimo: 1, inteiro: true }),
          ...validarValoresNumericos(linhas, INDICE_COLUNA_MEDIANA_PRS, { minimo: 0 }),
          ...validarValoresNumericos(linhas, INDICE_COLUNA_MEDIANA_RELEASES, { minimo: 0 }),
          ...validarValoresNumericos(linhas, INDICE_COLUNA_MEDIANA_DIAS, { minimo: 0 }),
        ],
      },
      {
        checagem: "Cobertura dos repositorios",
        descricao: `a soma de "quantidade_repositorios" de todos os grupos deve ser exatamente ${TOTAL_REPOSITORIOS_ESPERADO} (nenhum repositorio perdido ou contado 2x ao agrupar por linguagem)`,
        erros: validarSomaColuna(linhas, INDICE_COLUNA_QUANTIDADE, TOTAL_REPOSITORIOS_ESPERADO),
      },
    ];
  },

  // Consistencia dos dados: aqui "outlier" nao e um repositorio isolado, e
  // sim um grupo (linguagem) com amostra pequena demais para a mediana ser
  // confiavel — util para a discussao da RQ07 na secao de resultados.
  relatorio(linhas) {
    const gruposPequenos = linhas.filter((linha) => Number(linha[INDICE_COLUNA_QUANTIDADE]) < LIMITE_GRUPO_PEQUENO);
    const ordenadoPorQuantidade = [...linhas].sort(
      (a, b) => Number(b[INDICE_COLUNA_QUANTIDADE]) - Number(a[INDICE_COLUNA_QUANTIDADE])
    );
    const ordenadoPorMedianaPRs = [...linhas].sort(
      (a, b) => Number(b[INDICE_COLUNA_MEDIANA_PRS]) - Number(a[INDICE_COLUNA_MEDIANA_PRS])
    );
    const ordenadoPorMedianaReleases = [...linhas].sort(
      (a, b) => Number(b[INDICE_COLUNA_MEDIANA_RELEASES]) - Number(a[INDICE_COLUNA_MEDIANA_RELEASES])
    );

    console.log("\nDistribuicao por linguagem:");
    console.log(`  linguagens distintas: ${linhas.length}`);
    console.log(
      `  top 3 por quantidade de repositorios: ${ordenadoPorQuantidade
        .slice(0, 3)
        .map((linha) => `${linha[INDICE_COLUNA_LINGUAGEM]} (${linha[INDICE_COLUNA_QUANTIDADE]})`)
        .join(", ")}`
    );
    console.log(
      `  maior mediana de PRs aceitas   : ${ordenadoPorMedianaPRs[0][INDICE_COLUNA_LINGUAGEM]} (${ordenadoPorMedianaPRs[0][INDICE_COLUNA_MEDIANA_PRS]})`
    );
    console.log(
      `  maior mediana de releases      : ${ordenadoPorMedianaReleases[0][INDICE_COLUNA_LINGUAGEM]} (${ordenadoPorMedianaReleases[0][INDICE_COLUNA_MEDIANA_RELEASES]})`
    );
    console.log(
      `  grupos com menos de ${LIMITE_GRUPO_PEQUENO} repositorios (mediana pouco confiavel): ${gruposPequenos.length}/${linhas.length}`
    );
    if (gruposPequenos.length > 0) {
      const exemplos = gruposPequenos
        .slice(0, 5)
        .map((linha) => `${linha[INDICE_COLUNA_LINGUAGEM]} (${linha[INDICE_COLUNA_QUANTIDADE]})`)
        .join(", ");
      console.log(`  exemplos: ${exemplos}${gruposPequenos.length > 5 ? ", ..." : ""}`);
    }
  },
};
