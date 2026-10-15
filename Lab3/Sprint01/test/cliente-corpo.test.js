// Falha de rede ao LER o corpo da resposta (conexao derrubada depois dos
// cabecalhos). O fetch ja tinha repeticao automatica; a leitura do corpo nao
// tinha, e um "terminated" no meio da coleta derrubava a execucao inteira.

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarCacheEmMemoria } from "../src/github/cache.js";
import { criarClienteGitHub } from "../src/github/cliente.js";
import { logSilencioso } from "../src/log.js";

// Resposta cujo corpo falha ao ser lido, como a do undici quando a conexao cai.
function respostaQueFalhaAoLer(mensagem = "terminated") {
  return {
    status: 200,
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => {
      throw new TypeError(mensagem);
    },
  };
}

function clienteCom(fetchFalso, { maxTentativas = 2 } = {}) {
  return criarClienteGitHub({
    token: "t",
    cache: criarCacheEmMemoria(),
    log: logSilencioso,
    fetch: fetchFalso,
    esperar: async () => {},
    maxTentativas,
  });
}

test("corpo interrompido: tenta de novo e segue quando a repeticao da certo", async () => {
  let chamadas = 0;
  const cliente = clienteCom(async () => {
    chamadas += 1;
    if (chamadas === 1) return respostaQueFalhaAoLer();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const resposta = await cliente.get("/rate_limit");

  assert.equal(chamadas, 2);
  assert.deepEqual(resposta.corpo, { ok: true });
  assert.equal(cliente.estatisticas.novasTentativas, 1);
});

test("corpo interrompido sempre: para com mensagem clara, sem erro cru", async () => {
  const cliente = clienteCom(async () => respostaQueFalhaAoLer());

  await assert.rejects(() => cliente.get("/rate_limit"), (erro) => {
    assert.match(erro.message, /Falha de rede em/);
    assert.match(erro.message, /terminated/);
    return true;
  });
});
