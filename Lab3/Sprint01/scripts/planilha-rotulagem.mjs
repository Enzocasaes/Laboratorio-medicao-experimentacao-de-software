// Gera a planilha de rotulagem em HTML a partir de data/processed/rotulos_<nome>.csv.
//
// POR QUE NAO ROTULAR NO EXCEL: o CSV tem 300 linhas e 16 colunas, e o
// avaliador precisa abrir o link de cada release para decidir. Na planilha,
// isso vira rolar a tela, perder a linha e salvar o arquivo com o encoding
// errado (acentos quebrados). A pagina gerada aqui mostra uma release por vez,
// com o link, e grava o progresso no proprio navegador - da' para parar no meio
// e continuar depois.
//
// A pagina NAO envia nada para lugar nenhum: tudo fica no navegador ate o
// avaliador clicar em "baixar CSV", que devolve o mesmo arquivo com as colunas
// preenchidas, na mesma ordem.
//
//   node scripts/planilha-rotulagem.mjs caue
//   -> data/processed/rotulagem_caue.html  (abra no navegador)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lerCSV } from "../src/csv.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PROCESSADOS = join(AQUI, "..", "data", "processed");

const nome = (process.argv[2] ?? "").trim().toLowerCase();
if (!nome) {
  console.error("uso: node scripts/planilha-rotulagem.mjs <nome do avaliador>");
  process.exit(1);
}

const entrada = join(PROCESSADOS, `rotulos_${nome}.csv`);
const saida = join(PROCESSADOS, `rotulagem_${nome}.html`);

const { cabecalho, linhas } = lerCSV(readFileSync(entrada, "utf8"));
const registros = linhas.map((linha) => Object.fromEntries(cabecalho.map((c, i) => [c, linha[i]])));

// Um bloco por repositorio: as duas perguntas de repositorio sao respondidas
// uma vez so', e as releases dele vem dentro.
const porRepositorio = [];
for (const r of registros) {
  let bloco = porRepositorio.find((b) => b.full_name === r.full_name);
  if (!bloco) {
    bloco = {
      full_name: r.full_name,
      repo_url: r.repo_url,
      stars: r.stars,
      language: r.language,
      tipo_do_projeto: r.tipo_do_projeto ?? "",
      releases_sao_entrega_real: r.releases_sao_entrega_real ?? "",
      releases: [],
    };
    porRepositorio.push(bloco);
  }
  bloco.releases.push({
    release_id: r.release_id,
    tag_name: r.tag_name,
    release_name: r.release_name,
    published_at: r.published_at,
    release_url: r.release_url,
    release_corretiva: r.release_corretiva ?? "",
    observacao: r.observacao ?? "",
  });
}

const dados = { nome, cabecalho, registros, repositorios: porRepositorio };

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rotulagem — ${nome}</title>
<style>
  :root { color-scheme: light dark; --borda:#d0d7de; --fundo:#fff; --texto:#1f2328; --sutil:#656d76; --sim:#1a7f37; --nao:#9a6700; }
  @media (prefers-color-scheme: dark) { :root { --borda:#30363d; --fundo:#0d1117; --texto:#e6edf3; --sutil:#8b949e; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--fundo); color:var(--texto); font:16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
  header { position:sticky; top:0; background:var(--fundo); border-bottom:1px solid var(--borda); padding:12px 16px; z-index:10; }
  .barra { height:8px; background:var(--borda); border-radius:4px; overflow:hidden; margin-top:8px; }
  .barra > div { height:100%; background:var(--sim); width:0; transition:width .2s; }
  main { max-width:860px; margin:0 auto; padding:16px; }
  .repo { border:1px solid var(--borda); border-radius:10px; padding:16px; margin-bottom:20px; }
  .repo h2 { margin:0 0 4px; font-size:18px; }
  .meta { color:var(--sutil); font-size:14px; margin-bottom:12px; }
  .pergunta { margin:10px 0; }
  .pergunta label { display:block; font-weight:600; font-size:14px; margin-bottom:4px; }
  select, input[type=text] { width:100%; padding:8px; border:1px solid var(--borda); border-radius:6px; background:var(--fundo); color:var(--texto); font-size:15px; }
  .release { border-top:1px solid var(--borda); padding:12px 0; }
  .release a { font-weight:600; }
  .botoes { display:flex; gap:8px; margin:8px 0; }
  button.op { flex:1; padding:10px; border:1px solid var(--borda); border-radius:6px; background:transparent; color:var(--texto); font-size:15px; cursor:pointer; }
  button.op[aria-pressed=true] { border-color:currentColor; font-weight:700; }
  button.op.sim[aria-pressed=true] { color:var(--sim); }
  button.op.nao[aria-pressed=true] { color:var(--nao); }
  .acoes { position:sticky; bottom:0; background:var(--fundo); border-top:1px solid var(--borda); padding:12px 16px; display:flex; gap:12px; align-items:center; }
  .acoes button { padding:10px 16px; border-radius:6px; border:1px solid var(--borda); background:transparent; color:var(--texto); cursor:pointer; font-size:15px; }
  .acoes button.principal { background:var(--sim); color:#fff; border-color:var(--sim); font-weight:600; }
  .ajuda { font-size:14px; color:var(--sutil); background:rgba(127,127,127,.08); border-radius:8px; padding:12px; margin-bottom:20px; }
  .ajuda b { color:var(--texto); }
</style>
</head>
<body>
<header>
  <strong>Rotulagem da amostra-ouro — ${nome}</strong>
  <div id="status" class="meta">carregando…</div>
  <div class="barra"><div id="progresso"></div></div>
</header>

<main>
  <div class="ajuda">
    <p><b>O que decidir em cada release:</b> ela é <b>corretiva</b> (o objetivo principal foi corrigir um defeito recente) ou não?</p>
    <p><b>Sim</b> quando as notas falam basicamente de <i>bug fix</i>, <i>hotfix</i>, <i>patch</i>, <i>revert</i>, correção de regressão.
       <b>Não</b> quando tem recurso novo, melhoria, mudança de dependência ou documentação como foco — mesmo que haja algum fix no meio.</p>
    <p>Na dúvida, pergunte: <i>“esta versão existe porque algo quebrou?”</i> Se sim, é corretiva.</p>
    <p>O progresso é salvo no seu navegador. Dá para parar e continuar depois, no mesmo computador.</p>
  </div>
  <div id="lista"></div>
</main>

<div class="acoes">
  <button class="principal" id="baixar">Baixar CSV preenchido</button>
  <button id="limpar">Apagar respostas</button>
  <span id="aviso" class="meta"></span>
</div>

<script>
const DADOS = ${JSON.stringify(dados)};
const CHAVE = "rotulagem-" + DADOS.nome;
const estado = JSON.parse(localStorage.getItem(CHAVE) || "{}");

function salvar() {
  localStorage.setItem(CHAVE, JSON.stringify(estado));
  atualizar();
}

function atualizar() {
  const total = DADOS.registros.length;
  const feitas = DADOS.registros.filter((r) => estado["c:" + r.release_id]).length;
  const repos = DADOS.repositorios.length;
  const reposFeitos = DADOS.repositorios.filter((b) => estado["t:" + b.full_name] && estado["e:" + b.full_name]).length;
  document.getElementById("status").textContent =
    feitas + " de " + total + " releases · " + reposFeitos + " de " + repos + " repositórios";
  document.getElementById("progresso").style.width = ((feitas / total) * 100) + "%";
}

const lista = document.getElementById("lista");
for (const bloco of DADOS.repositorios) {
  const div = document.createElement("div");
  div.className = "repo";
  div.innerHTML =
    '<h2><a href="' + bloco.repo_url + '" target="_blank" rel="noopener">' + bloco.full_name + "</a></h2>" +
    '<div class="meta">' + Number(bloco.stars).toLocaleString("pt-BR") + " estrelas · " + (bloco.language || "sem linguagem") + "</div>" +
    '<div class="pergunta"><label>Tipo do projeto</label>' +
    '<select data-chave="t:' + bloco.full_name + '">' +
      '<option value="">escolha…</option>' +
      '<option value="biblioteca/framework">biblioteca / framework</option>' +
      '<option value="aplicacao/servico">aplicação / serviço</option>' +
      '<option value="ferramenta cli">ferramenta CLI</option>' +
      '<option value="outro">outro</option>' +
    "</select></div>" +
    '<div class="pergunta"><label>As releases representam entrega real ao usuário?</label>' +
    '<select data-chave="e:' + bloco.full_name + '">' +
      '<option value="">escolha…</option>' +
      '<option value="sim">sim</option>' +
      '<option value="nao">não</option>' +
      '<option value="incerto">incerto</option>' +
    "</select></div>";

  for (const rel of bloco.releases) {
    const bloco2 = document.createElement("div");
    bloco2.className = "release";
    bloco2.innerHTML =
      '<a href="' + rel.release_url + '" target="_blank" rel="noopener">' + (rel.tag_name || rel.release_name || "release") + "</a>" +
      '<div class="meta">' + (rel.release_name || "") + " · " + (rel.published_at || "").slice(0, 10) + "</div>" +
      '<div class="botoes">' +
        '<button class="op sim" data-chave="c:' + rel.release_id + '" data-valor="sim">é corretiva</button>' +
        '<button class="op nao" data-chave="c:' + rel.release_id + '" data-valor="nao">não é</button>' +
      "</div>" +
      '<input type="text" placeholder="observação (opcional)" data-chave="o:' + rel.release_id + '">';
    div.appendChild(bloco2);
  }
  lista.appendChild(div);
}

for (const sel of document.querySelectorAll("select")) {
  sel.value = estado[sel.dataset.chave] || "";
  sel.addEventListener("change", () => { estado[sel.dataset.chave] = sel.value; salvar(); });
}
for (const campo of document.querySelectorAll("input[type=text]")) {
  campo.value = estado[campo.dataset.chave] || "";
  campo.addEventListener("input", () => { estado[campo.dataset.chave] = campo.value; salvar(); });
}
for (const botao of document.querySelectorAll("button.op")) {
  const marcar = () => {
    for (const irmao of document.querySelectorAll('button.op[data-chave="' + botao.dataset.chave + '"]')) {
      irmao.setAttribute("aria-pressed", String(irmao.dataset.valor === estado[botao.dataset.chave]));
    }
  };
  botao.addEventListener("click", () => { estado[botao.dataset.chave] = botao.dataset.valor; salvar(); marcar(); });
  marcar();
}

function csv(valor) {
  const texto = String(valor ?? "");
  return /[",\\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

document.getElementById("baixar").addEventListener("click", () => {
  const linhas = [DADOS.cabecalho.join(",")];
  for (const r of DADOS.registros) {
    const preenchido = {
      ...r,
      tipo_do_projeto: estado["t:" + r.full_name] || "",
      releases_sao_entrega_real: estado["e:" + r.full_name] || "",
      release_corretiva: estado["c:" + r.release_id] || "",
      observacao: estado["o:" + r.release_id] || r.observacao || "",
    };
    linhas.push(DADOS.cabecalho.map((c) => csv(preenchido[c])).join(","));
  }
  const blob = new Blob(["\\ufeff" + linhas.join("\\n") + "\\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rotulos_" + DADOS.nome + ".csv";
  a.click();
  document.getElementById("aviso").textContent = "baixado — mova para data/processed/";
});

document.getElementById("limpar").addEventListener("click", () => {
  if (!confirm("Apagar todas as respostas desta planilha?")) return;
  localStorage.removeItem(CHAVE);
  location.reload();
});

atualizar();
</script>
</body>
</html>
`;

writeFileSync(saida, html);
console.log(`planilha gerada: ${saida}`);
console.log(`  ${porRepositorio.length} repositorios, ${registros.length} releases`);
