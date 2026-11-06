"""Monta o dashboard do Lab04 em um HTML único (Issues #100 e #101).

    python src/dashboard.py            # gera dashboard/index.html
    python src/dashboard.py --abrir    # gera e abre no navegador

O dashboard é a entrega final do laboratório e precisa se explicar sozinho:
cada gráfico vem com um texto curto dizendo o que mostra e o que se conclui
dele. As seções seguem a ordem pedida no enunciado.

NA SPRINT 01 ele traz as seções 1, 2, 3 e 6 — cenário, G1, G2 e a tabela dos
dados reais. Na Sprint 02 entra a seção 4 (G3, erro tipo I, Issue #108). A
seção 5 (G4, poder) e a conclusão continuam marcadas como pendentes, para o
dashboard não mentir sobre o que já tem.

DE ONDE VEM CADA NÚMERO

Tudo que é resultado sai dos CSVs dos outros dois integrantes — este módulo
não recalcula teste nenhum:

    data/dados_reais.csv               Integrante 1: os 30 pares coletados
    data/resultados_reais.csv          Integrante 2: os dois testes nos reais
    data/simulacao/cenarios.csv        Integrante 2: o exemplo simulado
    data/simulacao/resultados_exemplo.csv   Integrante 2: os testes no exemplo
    data/pvalores_q1.csv, data/pvalores_q1_controle.csv, data/resultados_q1.csv
                                       Q1: as decisões dos 10.000 conjuntos sob H0,
                                       lidas e conferidas por src/comparacao_erro.py

A única coisa calculada aqui são os dois valores críticos de G2 (o t de 95% e
o menor W⁺ que cai na região de rejeição), e mesmo esses vêm das funções de
`src/distribuicoes.py`, para o gráfico não discordar do teste.
"""

from __future__ import annotations

import argparse
import csv
import sys
import webbrowser
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comparacao_erro import (  # noqa: E402
    CENTRALIZADO,
    SIMETRIZADO,
    Comparacao,
    carregar_comparacoes,
    faixa_acaso,
    formatar_p,
)
from distribuicoes import distribuicao_wilcoxon, t_quantil, wilcoxon_p_exato  # noqa: E402
from graficos import (  # noqa: E402
    BarraErro,
    PainelErro,
    escapar,
    grafico_g1,
    grafico_g2,
    grafico_g3,
    mediana,
    numero,
)

LAB4 = Path(__file__).resolve().parent.parent
DADOS = LAB4 / "data"
SAIDA_PADRAO = LAB4 / "dashboard" / "index.html"

ALFA = 0.05
CENARIO_EXEMPLO = "normal"  # o exemplo de G2: é onde os dois testes concordam

REPOSITORIO = "https://github.com/Enzocasaes/Laboratorio-medicao-experimentacao-de-software"
# O board é um projeto do GitHub Projects (v2); o link precisa ser colado aqui
# pelo grupo — o enunciado exige que ele apareça no topo do dashboard.
PROJECTS = "https://github.com/users/Enzocasaes/projects/2"


# ---------------------------------------------------------------- leitura


def ler_csv(caminho: Path) -> list[dict[str, str]]:
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        return list(csv.DictReader(arquivo))


def dados_reais() -> dict[str, list[float]]:
    linhas = ler_csv(DADOS / "dados_reais.csv")
    sem = [float(l["tempo_sem_cache"]) for l in linhas]
    com = [float(l["tempo_com_cache"]) for l in linhas]
    return {
        "sem cache": sem,
        "com cache": com,
        "diferenças": [s - c for s, c in zip(sem, com)],
    }


def diferencas_simuladas() -> dict[str, list[float]]:
    por_cenario: dict[str, list[float]] = {}
    for linha in ler_csv(DADOS / "simulacao" / "cenarios.csv"):
        por_cenario.setdefault(linha["cenario"], []).append(float(linha["diferenca"]))
    return por_cenario


def resultado(linhas: list[dict[str, str]], teste: str,
              cenario: str | None = None) -> dict[str, str]:
    """Primeira linha cujo teste (e cenário, quando dado) bate."""
    for linha in linhas:
        if not linha["teste"].startswith(teste):
            continue
        if cenario is None or linha.get("cenario") == cenario:
            return linha
    raise KeyError(f"resultado nao encontrado: {teste} / {cenario}")


def menor_w_rejeitado(n: int, alfa: float = ALFA) -> int:
    """O menor W⁺ cuja cauda já cabe em alfa — a borda da região de rejeição.

    Como W⁺ é discreto, não existe um ponto em que a cauda vale exatamente 5%:
    pega-se o primeiro valor cuja cauda não passa de 5%. É por isso que o
    teste exato é levemente conservador.
    """
    maximo = n * (n + 1) // 2
    for w in range(maximo + 1):
        if wilcoxon_p_exato(w, n) <= alfa:
            return w
    return maximo


# ---------------------------------------------------------------- página


ESTILO = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin:0; background:#f4f6f8; color:#1f2328;
       font:16px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
header { background:#0f2b45; color:#fff; padding:30px 28px 26px; }
header h1 { margin:0 0 6px; font-size:1.6rem; letter-spacing:-0.01em; }
header p { margin:0; color:#b9c9d8; font-size:0.95rem; }
.links { margin-top:16px; display:flex; flex-wrap:wrap; gap:10px; }
.links a, .links span { font-size:0.84rem; padding:6px 12px; border-radius:100px;
       background:rgba(255,255,255,.12); color:#fff; text-decoration:none; }
.links a:hover { background:rgba(255,255,255,.22); }
.links .pendente { background:#8a5a12; }
main { max-width:1120px; margin:0 auto; padding:26px 20px 70px; }
section { background:#fff; border:1px solid #e2e8f0; border-radius:12px;
       padding:24px 26px; margin-bottom:20px; }
section h2 { margin:0 0 4px; font-size:1.15rem; color:#0f2b45; }
section h2 .n { color:#94a3b8; font-weight:600; margin-right:8px; }
.sub { margin:0 0 18px; color:#64748b; font-size:0.9rem; }
.leitura { background:#f1f6fb; border-left:4px solid #1a6aa8; border-radius:0 8px 8px 0;
       padding:14px 18px; margin:18px 0 0; font-size:0.95rem; }
.leitura b { color:#0f2b45; }
figure { margin:0; }
table { width:100%; border-collapse:collapse; font-size:0.9rem; }
th { background:#0f2b45; color:#fff; text-align:left; padding:9px 12px;
     font-size:0.74rem; letter-spacing:0.07em; text-transform:uppercase; }
td { padding:9px 12px; border-top:1px solid #e2e8f0; }
tbody tr:nth-child(even) { background:#f8fafc; }
.grade2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
.cartao { border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; }
.cartao .rotulo { font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase;
       color:#64748b; }
.cartao .valor { font-size:1.35rem; font-weight:700; color:#0f2b45; margin-top:2px; }
.cartao .nota { font-size:0.84rem; color:#64748b; }
.pendencia { border:1px dashed #cbd5e1; background:#fbfcfd; border-radius:10px;
       padding:18px 20px; color:#64748b; font-size:0.93rem; }
.pendencia b { color:#8a5a12; }
code { background:#eef2f6; border:1px solid #e2e8f0; border-radius:4px;
       padding:1px 6px; font-size:0.86em; }
footer { max-width:1120px; margin:0 auto; padding:0 20px 50px; color:#64748b;
       font-size:0.85rem; }
@media (max-width:760px) { header, section { padding-left:18px; padding-right:18px; } }
"""


def cartao(rotulo: str, valor: str, nota: str) -> str:
    return (
        f'<div class="cartao"><div class="rotulo">{escapar(rotulo)}</div>'
        f'<div class="valor">{escapar(valor)}</div>'
        f'<div class="nota">{escapar(nota)}</div></div>'
    )


def secao(numero_secao: str, titulo: str, subtitulo: str, corpo: str) -> str:
    return (
        f"<section><h2><span class=\"n\">{numero_secao}</span>{escapar(titulo)}</h2>"
        f'<p class="sub">{escapar(subtitulo)}</p>{corpo}</section>'
    )


def pendente(texto_pendencia: str) -> str:
    return f'<div class="pendencia"><b>Sprint 02.</b> {texto_pendencia}</div>'


def _barras(comp: Comparacao) -> tuple[BarraErro, ...]:
    return tuple(BarraErro(x.teste, x.taxa, x.ic_wilson_inf, x.ic_wilson_sup,
                           x.rejeicoes, x.repeticoes, x.h0_verdadeira) for x in (comp.t, comp.w))


def secao_erro_tipo_i(comparacoes: dict[str, Comparacao], alfa: float) -> str:
    """Seção 4: o G3, os cartões com as taxas e a leitura (Issues #107 e #108).

    O simetrizado vem primeiro: é o único cenário em que as duas H0 valem, e
    portanto a comparação do erro tipo I. O centralizado é a análise de
    sensibilidade à assimetria, em que só a taxa do t é erro tipo I.
    """
    s, c = comparacoes[SIMETRIZADO], comparacoes[CENTRALIZADO]
    r = s.t.repeticoes
    faixa = faixa_acaso(alfa, r)
    g3 = grafico_g3(
        [
            PainelErro("Erro tipo I · distribuição simétrica",
                       f"{numero(r, 0)} conjuntos · bootstrap simetrizado · as duas H₀ valem",
                       _barras(s)),
            PainelErro("Sensibilidade à assimetria · forma dos dados reais",
                       f"{numero(c.t.repeticoes, 0)} conjuntos · bootstrap centralizado (média 0) "
                       "· só a H₀ do t vale",
                       _barras(c)),
        ],
        alfa=alfa, faixa=faixa,
    )

    def pct(x: float) -> str:
        return f"{numero(100 * x, 2)}%"

    sem_diferenca = s.mcnemar.p_exato >= alfa
    cartoes = (
        '<div class="grade2">'
        + cartao("t pareado · simétrico", pct(s.t.taxa),
                 f"IC {pct(s.t.ic_wilson_inf)}–{pct(s.t.ic_wilson_sup)} · {s.t.classificacao}")
        + cartao("Wilcoxon · simétrico", pct(s.w.taxa),
                 f"IC {pct(s.w.ic_wilson_inf)}–{pct(s.w.ic_wilson_sup)} · {s.w.classificacao}")
        + cartao("Diferença W − t · simétrico", f"{numero(s.diferenca_pp, 2)} p.p.",
                 f"IC {numero(s.diferenca_ic_inf_pp, 2)} a {numero(s.diferenca_ic_sup_pp, 2)} p.p. · "
                 f"McNemar p = {formatar_p(s.mcnemar)}"
                 + (" · sem diferença detectável" if sem_diferenca else " · diferença detectada"))
        + cartao("t pareado · assimétrico", pct(c.t.taxa),
                 f"erro tipo I {c.t.classificacao} · Wilcoxon: {pct(c.w.taxa)} de rejeição, "
                 "que não é erro tipo I")
        + "</div>"
    )
    leitura = (
        '<div class="leitura">A linha vermelha é o nível nominal: um teste bem calibrado '
        "rejeita uma H₀ verdadeira em 5% das vezes, e a faixa cinza em volta dela "
        f"({numero(100 * faixa[0], 2)}% a {numero(100 * faixa[1], 2)}%) é o que o acaso de "
        f"{numero(r, 0)} simulações explica. Os dois testes não têm a mesma H₀: a do t é "
        "sobre a <b>média</b> das diferenças, e a do Wilcoxon é que a distribuição é "
        "<b>simétrica</b> em torno de 0. "
        f"<b>Na distribuição simétrica</b>, em que as duas valem, os dois testes ficam no nível "
        f"nominal ({pct(s.t.taxa)} e {pct(s.w.taxa)}), sem diferença detectável entre eles. Nessa "
        "condição, nenhum controla o erro tipo I melhor que o outro. "
        "<b>Com a forma assimétrica dos dados reais</b>, a média continua 0, mas a distribuição "
        f"deixa de ser simétrica. O t passa a errar em {pct(c.t.taxa)} "
        f"({numero(c.t.razao_alfa, 1)} vezes o prometido), porque a assimetria engorda a "
        "cauda superior da estatística t com n = 30. A barra listrada do Wilcoxon "
        f"({pct(c.w.taxa)}) <b>não é erro tipo I</b>: ali a H₀ dele é falsa (a pseudomediana é "
        "positiva), e ele está detectando isso. O cenário mostra que, com diferenças "
        "assimétricas, um p &lt; 0,05 do Wilcoxon não basta para concluir algo sobre o tempo médio. "
        "Nos dados reais nada disso muda a conclusão, porque os p-valores observados estão "
        "ordens de grandeza abaixo dessas taxas. Os resultados valem para estas duas "
        "distribuições e n = 30. Detalhes e limitações em "
        "<code>docs/resultados_q1.md</code> e <code>docs/comparacao_taxas_erro.md</code>.</div>"
    )
    return f"<figure>{g3}</figure>{cartoes}{leitura}"


def montar(reais: dict[str, list[float]], simulados: dict[str, list[float]],
           reais_resultados: list[dict[str, str]],
           exemplo: list[dict[str, str]],
           erro_tipo_i: tuple[dict[str, Comparacao], float] | None = None) -> str:
    """Monta a página. `erro_tipo_i` = (comparações, α) de `carregar_comparacoes`;
    sem ele, a seção 4 aparece como pendente."""
    n = len(reais["diferenças"])
    t_real = resultado(reais_resultados, "t pareado")
    w_real = resultado(reais_resultados, "Wilcoxon")
    t_exemplo = resultado(exemplo, "t pareado", CENARIO_EXEMPLO)
    w_exemplo = resultado(exemplo, "Wilcoxon", CENARIO_EXEMPLO)

    gl = n - 1
    t_critico = t_quantil(1 - ALFA, gl)
    w_critico = menor_w_rejeitado(n)

    g1 = grafico_g1(reais, simulados)
    g2 = grafico_g2(
        gl=gl, t_critico=t_critico,
        t_observado=float(t_exemplo["estatistica"]), t_p=float(t_exemplo["p_valor"]),
        contagens=distribuicao_wilcoxon(n), n_wilcoxon=n, w_critico=w_critico,
        w_observado=float(w_exemplo["estatistica"]), w_p=float(w_exemplo["p_valor"]),
    )

    media_dif = sum(reais["diferenças"]) / n
    link_projects = (
        f'<a href="{PROJECTS}" target="_blank" rel="noopener">GitHub Projects</a>'
        if PROJECTS else
        '<span class="pendente">GitHub Projects: link a preencher</span>'
    )

    # ---- seção 1
    s1 = (
        "<p><b>Pergunta:</b> ativar o Build Cache do Gradle reduz o tempo de "
        "build de um projeto Java?</p>"
        "<p><b>H₀:</b> ativar o cache não reduz o tempo de build "
        "(a diferença d = sem − com não é maior que zero).<br>"
        "<b>H₁:</b> ativar o cache reduz o tempo de build (d &gt; 0). "
        f"Os dois testes são unilaterais, com α = {numero(ALFA, 2)}.</p>"
        '<div class="grade2">'
        + cartao("Projeto medido", "Spring PetClinic", "build Gradle com clean")
        + cartao("Observações", f"{n} pares", "mesma máquina, ordem alternada AB/BA")
        + cartao("Par de testes", "P2", "t pareado × Wilcoxon pareado")
        + cartao("Diferença média", f"{numero(media_dif, 2)} s", "sem cache − com cache")
        + "</div>"
        "<div class=\"leitura\">O desenho é <b>pareado</b>: cada par roda as duas "
        "condições na mesma máquina e na mesma sessão, alternando a ordem. Por isso "
        "a análise olha a diferença de cada par, e não os dois grupos como amostras "
        "independentes. A coleta e a origem dos dados estão documentadas em "
        "<code>docs/fonte_dados.md</code> e <code>docs/ambiente_coleta.md</code>.</div>"
    )

    # ---- seção 2 (G1)
    positivas = sum(1 for d in reais["diferenças"] if d > 0)
    s2 = (
        f"<figure>{g1}</figure>"
        '<div class="leitura">Os dois grupos reais não se sobrepõem: sem cache o build '
        f"fica em torno de {numero(mediana(reais['sem cache']), 1)} s e com cache, de "
        f"{numero(mediana(reais['com cache']), 1)} s, e {positivas} das {n} diferenças "
        "são positivas. É um efeito grande demais para distinguir os dois testes — com "
        "ele, qualquer teste rejeita H₀. <b>Por isso a simulação existe:</b> ela "
        "mantém a média e o desvio das diferenças reais e muda só o formato. A "
        "lognormal deslocada reproduz a assimetria à direita típica de tempo, e a "
        "contaminada acrescenta valores extremos — os dois formatos em que os testes "
        "deixam de concordar.</div>"
    )

    # ---- seção 3 (G2)
    s3 = (
        f"<figure>{g2}</figure>"
        "<div class=\"leitura\">Cada curva mostra os valores que a estatística "
        "costumaria assumir <b>se H₀ fosse verdadeira</b>. A faixa cinza é a região "
        f"de rejeição de 5%: t ≥ {numero(t_critico, 3)} de um lado, W⁺ ≥ {w_critico} "
        "do outro. A área colorida é o <b>p-valor</b> — a chance de, sem efeito "
        "nenhum, aparecer um valor tão extremo quanto o observado. No exemplo "
        f"simulado os dois caem dentro da região de rejeição (p = "
        f"{numero(float(t_exemplo['p_valor']), 4)} e "
        f"{numero(float(w_exemplo['p_valor']), 4)}). Nos dados reais eles ficariam "
        f"fora da escala: t = {numero(float(t_real['estatistica']), 1)} e "
        f"W⁺ = {numero(float(w_real['estatistica']), 0)}, o máximo possível.</div>"
    )

    # ---- seção 4 e 5
    if erro_tipo_i is not None:
        s4 = secao_erro_tipo_i(*erro_tipo_i)
    else:
        s4 = pendente(
            "G3 — taxa de erro tipo I dos dois testes sob H0, com uma linha em 5%. "
            "Rode <code>python src/erro_tipo_i.py</code> para gerar os p-valores da Q1."
        )
    s5 = pendente(
        "G4 — curvas de poder dos dois testes: proporção de rejeições × tamanho do "
        "efeito, para n = 10, 30 e 50. Mesma fonte de dados."
    )

    # ---- seção 6
    linhas_tabela = "".join(
        "<tr>"
        f"<td><b>{escapar(l['teste'])}</b></td>"
        f"<td>{numero(float(l['estatistica']), 3)}</td>"
        f"<td>{float(l['p_valor']):.3g}</td>"
        f"<td>{escapar(l['efeito_nome'])} = {numero(float(l['efeito_valor']), 3)}</td>"
        f"<td>{escapar(l['centro_nome'])} = {numero(float(l['centro_valor']), 3)} s</td>"
        f"<td>{'rejeita H₀' if l['significativo'] == 'True' else 'não rejeita H₀'}</td>"
        "</tr>"
        for l in reais_resultados
    )
    s6 = (
        "<table><thead><tr><th>Teste</th><th>Estatística</th><th>p-valor</th>"
        "<th>Tamanho de efeito</th><th>Centro estimado</th><th>Conclusão</th>"
        f"</tr></thead><tbody>{linhas_tabela}</tbody></table>"
        "<div class=\"leitura\">Os dois testes rejeitam H₀ com folga, e concordam: "
        "ativar o Build Cache reduz o tempo de build do PetClinic. O efeito é enorme "
        f"(d_z = {numero(float(t_real['efeito_valor']), 1)}) porque a diferença média "
        f"de {numero(media_dif, 1)} s é muito maior que a variação entre execuções. "
        "O W⁺ bateu o máximo possível: as 30 diferenças são positivas.</div>"
    )

    s7 = pendente(
        "A conclusão compara o que o grupo esperava antes de simular com o que a "
        "simulação mostrou, e fecha com a recomendação de qual teste usar neste "
        "cenário. Depende de G3 e G4."
    )

    corpo = (
        secao("1.", "Cenário", "pergunta, hipóteses e de onde vieram os dados", s1)
        + secao("2.", "Os dados", "G1 — dados reais e simulados, um histograma por grupo", s2)
        + secao("3.", "Como os testes funcionam",
                "G2 — distribuição da estatística sob H₀, região de rejeição e p-valor", s3)
        + secao("4.", "Erro tipo I", "G3 — com que frequência cada teste acusa efeito que não existe", s4)
        + secao("5.", "Poder", "G4 — com que frequência cada teste encontra o efeito que existe", s5)
        + secao("6.", "Dados reais", "os dois testes aplicados aos 30 pares coletados", s6)
        + secao("7.", "Conclusão", "o que esperávamos, o que encontramos e o que recomendamos", s7)
    )

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lab04 — Testes de hipótese por dentro</title>
<style>{ESTILO}</style>
</head>
<body>
<header>
  <h1>Lab04 — Testes de hipótese por dentro</h1>
  <p>Build Cache do Gradle no Spring PetClinic · par P2: teste t pareado × Wilcoxon pareado</p>
  <div class="links">
    <a href="{REPOSITORIO}" target="_blank" rel="noopener">Repositório</a>
    {link_projects}
    <span>{"Sprint 02 · seções 1 a 4 e 6" if erro_tipo_i is not None else "Sprint 01 · seções 1, 2, 3 e 6"}</span>
  </div>
</header>
<main>{corpo}</main>
<footer>
  Gerado por <code>python src/dashboard.py</code> em {date.today().strftime('%d/%m/%Y')}.
  Os gráficos são SVG desenhado por <code>src/graficos.py</code>; os números vêm dos
  CSVs em <code>data/</code> e nenhum teste é recalculado aqui.
</footer>
</body>
</html>
"""


def main() -> None:
    analisador = argparse.ArgumentParser(description="Gera o dashboard do Lab04.")
    analisador.add_argument("--saida", type=Path, default=SAIDA_PADRAO,
                            help="caminho do HTML gerado")
    analisador.add_argument("--abrir", action="store_true",
                            help="abre o arquivo no navegador depois de gerar")
    argumentos = analisador.parse_args()

    try:
        erro_tipo_i = carregar_comparacoes(DADOS)
    except FileNotFoundError as erro:
        # sem os p-valores da Q1, o G3 fica pendente em vez de derrubar o dashboard
        print(f"atencao: G3 nao gerado ({erro})")
        erro_tipo_i = None

    pagina = montar(
        reais=dados_reais(),
        simulados=diferencas_simuladas(),
        reais_resultados=ler_csv(DADOS / "resultados_reais.csv"),
        exemplo=ler_csv(DADOS / "simulacao" / "resultados_exemplo.csv"),
        erro_tipo_i=erro_tipo_i,
    )

    argumentos.saida.parent.mkdir(parents=True, exist_ok=True)
    argumentos.saida.write_text(pagina, encoding="utf-8")
    print(f"dashboard gerado: {argumentos.saida}")
    if not PROJECTS:
        print("atencao: o link do GitHub Projects ainda esta vazio em src/dashboard.py")
    if argumentos.abrir:
        webbrowser.open(argumentos.saida.resolve().as_uri())


if __name__ == "__main__":
    main()
