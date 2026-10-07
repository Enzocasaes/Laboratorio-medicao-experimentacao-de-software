// Cache local das respostas da API (secao 7: "cache local e retomada").
//
// Cada requisicao vira UM arquivo JSON, num caminho legivel derivado da URL:
//   GET /repos/facebook/react/actions/workflows?per_page=1
//   -> <dir>/repos/facebook/react/actions/workflows/per_page=1__<hash>.json
// O hash (da chave exata) evita colisao depois da limpeza dos caracteres.
//
// Se a coleta for interrompida (rate limit, rede, Ctrl+C), rodar de novo le
// do disco tudo o que ja foi respondido e so' faz as chamadas que faltam.
// A gravacao e' atomica (arquivo temporario + rename), para que uma
// interrupcao no meio da escrita nunca deixe um JSON truncado no cache.
//
// O cache guarda apenas a URL e a resposta - nunca os cabecalhos enviados,
// portanto o token nao chega ao disco.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Chave canonica: caminho + parametros em ordem alfabetica, para que
// "?a=1&b=2" e "?b=2&a=1" sejam a mesma requisicao.
export function chaveDaRequisicao(url) {
  const u = new URL(url);
  const parametros = [...u.searchParams.entries()].sort(([a, va], [b, vb]) =>
    a === b ? (va < vb ? -1 : va > vb ? 1 : 0) : a < b ? -1 : 1
  );
  const query = new URLSearchParams(parametros).toString();
  return query ? `${u.pathname}?${query}` : u.pathname;
}

function limpar(texto) {
  return texto.replace(/[^A-Za-z0-9._=&-]/g, "_");
}

export function caminhoNoCache(dir, chave) {
  const [caminho, query = ""] = chave.split("?");
  const segmentos = caminho.split("/").filter(Boolean).map(limpar);
  const hash = createHash("sha256").update(chave).digest("hex").slice(0, 10);
  const nome = `${(limpar(query) || "index").slice(0, 120)}__${hash}.json`;
  return join(dir, ...segmentos, nome);
}

export function criarCacheEmDisco(dir, { log } = {}) {
  return {
    descricao: dir,
    ler(chave) {
      const arquivo = caminhoNoCache(dir, chave);
      if (!existsSync(arquivo)) return null;
      try {
        return JSON.parse(readFileSync(arquivo, "utf8"));
      } catch (erro) {
        log?.aviso(`cache corrompido em ${arquivo} (${erro.message}); a requisicao sera refeita`);
        return null;
      }
    },
    gravar(chave, valor) {
      const arquivo = caminhoNoCache(dir, chave);
      mkdirSync(dirname(arquivo), { recursive: true });
      const temporario = `${arquivo}.${process.pid}.tmp`;
      writeFileSync(temporario, JSON.stringify(valor, null, 2));
      renameSync(temporario, arquivo);
    },
  };
}

// Mesmo contrato, sem tocar o disco (usado nos testes ou com --sem-cache).
export function criarCacheEmMemoria() {
  const mapa = new Map();
  return {
    descricao: "memoria",
    ler: (chave) => (mapa.has(chave) ? structuredClone(mapa.get(chave)) : null),
    gravar: (chave, valor) => { mapa.set(chave, structuredClone(valor)); },
  };
}
