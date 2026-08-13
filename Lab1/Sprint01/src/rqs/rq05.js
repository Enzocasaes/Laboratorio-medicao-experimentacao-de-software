/**
 * RQ05 - "Sistemas populares sao escritos nas linguagens mais populares?"
 * Metrica: linguagem primaria de cada repositorio (primaryLanguage.name).
 *
 * Metrica CATEGORICA: o resumo mostra a contagem por linguagem, nao mediana.
 * Fonte de referencia para "linguagens mais populares": GitHub Octoverse
 * (mantida por todo o laboratorio; ver src/queries/rq05.js para o racional).
 */
import { contarPorCategoria } from "../estatisticas.js";

const SEM_LINGUAGEM = "Sem linguagem";

export const RQ05 = {
  chave: "rq05",
  titulo: "RQ05 - linguagem primaria",
  arquivoCSV: "rq05Validation.csv",
  cabecalhoCSV: ["repositorio", "linguagem_primaria"],

  extrair(repo) {
    const linguagem = repo.primaryLanguage?.name ?? SEM_LINGUAGEM;
    return { valor: linguagem, celulas: [linguagem], rotulo: linguagem };
  },

  resumir(valores) {
    console.log("Contagem por linguagem:");
    for (const [linguagem, quantidade] of contarPorCategoria(valores)) {
      console.log(`  ${linguagem.padEnd(20)} ${quantidade}`);
    }
  },
};
