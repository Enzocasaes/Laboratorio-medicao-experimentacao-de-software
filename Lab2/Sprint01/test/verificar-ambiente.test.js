import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { versaoMaiorDoNode, lacunasPendentes, NODE_MINIMO } from "../src/verificar-ambiente.js";

const SCRIPT = fileURLToPath(new URL("../src/verificar-ambiente.js", import.meta.url));

test("versaoMaiorDoNode: extrai o major com ou sem o 'v'", () => {
  assert.equal(versaoMaiorDoNode("v18.20.4"), 18);
  assert.equal(versaoMaiorDoNode("22.23.1"), 22);
});

test("lacunasPendentes: acha as decisoes do grupo ainda em aberto, sem repetir", () => {
  const texto = "IDE: [preencher - IDE]\nIA: [preencher - ferramenta + versao]\nOutra: [preencher - IDE]\nfechado: VS Code";
  assert.deepEqual(lacunasPendentes(texto), ["[preencher - IDE]", "[preencher - ferramenta + versao]"]);
  assert.deepEqual(lacunasPendentes("tudo definido"), []);
});

test("CLI: verifica o ambiente real do projeto -> exit 0 e checklist do trial", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lab02-ambiente-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // LAB02_DATA_DIR aponta para um diretorio que existe: o item "pasta data/" passa
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, LAB02_DATA_DIR: dir },
  });

  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\[OK   \] Node\.js/);
  assert.match(r.stdout, new RegExp(`minimo exigido: v${NODE_MINIMO}`));
  assert.match(r.stdout, /src\/metricas\.js/);
  assert.match(r.stdout, /pasta trials\//);
  assert.match(r.stdout, /0 falha\(s\)/);
  assert.match(r.stdout, /checklist antes de CADA trial/);
  assert.match(r.stdout, /autocomplete de IA DESATIVADO/);
});
