import { test } from "node:test";
import assert from "node:assert/strict";
import { criarLog } from "../src/log.js";

function saidaFalsa() {
  const linhas = [];
  const registrar = (canal) => (m) => linhas.push([canal, m]);
  return { linhas, saida: { log: registrar("log"), warn: registrar("warn"), error: registrar("error") } };
}

test("criarLog: respeita o nivel minimo e prefixa horario e nivel", () => {
  const { linhas, saida } = saidaFalsa();
  const log = criarLog({ nivel: "info", saida });
  log.debug("detalhe");
  log.info("progresso");
  log.aviso("descartado");
  log.erro("falhou");
  assert.deepEqual(linhas.map(([canal]) => canal), ["log", "warn", "error"]);
  assert.match(linhas[0][1], /^\[\d{4}-\d{2}-\d{2}T[^\]]+\] INFO  progresso$/);
  assert.match(linhas[1][1], /AVISO descartado$/);
});

test("criarLog: nivel desconhecido cai para info; debug mostra tudo", () => {
  const a = saidaFalsa();
  criarLog({ nivel: "xyz", saida: a.saida }).debug("oculto");
  assert.equal(a.linhas.length, 0);
  const b = saidaFalsa();
  criarLog({ nivel: "debug", saida: b.saida }).debug("visivel");
  assert.equal(b.linhas.length, 1);
});
