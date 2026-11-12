"""Monta o dashboard do Lab04 em um HTML único (Issues #100 e #101).

    python src/dashboard.py            # gera dashboard/index.html
    python src/dashboard.py --abrir    # gera e abre no navegador

O dashboard é a entrega final do laboratório e precisa se explicar sozinho:
cada gráfico vem com um texto curto dizendo o que mostra e o que se conclui
dele. As seções seguem a ordem pedida no enunciado.

NA SPRINT 01 ele traz as seções 1, 2, 3 e 6 — cenário, G1, G2 e a tabela dos
dados reais. Na Sprint 02 entram a seção 4 (G3, erro tipo I, Issues #107 e
#108, mais a Q3 das Issues #111 e #112), a seção 5 (G4, poder, Issues #109 e
#110) e a seção 7, a conclusão. Cada seção que depende de um CSV que ainda não
existe continua marcada como pendente, para o dashboard não mentir sobre o que
já tem.

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
    data/resultados_q3.csv, data/mcnemar_q3.csv
                                       Q3: erro tipo I com os pressupostos violados
    data/resultados_q2.csv             Q2: o poder com efeitos crescentes, que vira
                                       o G4 e o gráfico interativo do bônus

A única coisa calculada aqui são os dois valores críticos de G2 (o t de 95% e
o menor W⁺ que cai na região de rejeição), e mesmo esses vêm das funções de
`src/distribuicoes.py`, para o gráfico não discordar do teste.
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import webbrowser
from dataclasses import dataclass
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
    CondicaoErro,
    BarraErro,
    CurvaPoder,
    PainelErro,
    escapar,
    grafico_g1,
    grafico_g2,
    grafico_g3,
    grafico_g3_violacao,
    grafico_g4,
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
.interativo { margin-top:26px; border:1px solid #e2e8f0; border-radius:10px;
       padding:16px 18px 10px; background:#fcfdfe; }
.interativo h3 { margin:0 0 2px; font-size:1rem; color:#0f2b45; }
.controles { display:flex; flex-wrap:wrap; gap:14px; margin:14px 0 10px; }
.campo { display:flex; flex-direction:column; gap:4px; font-size:0.74rem;
       letter-spacing:0.08em; text-transform:uppercase; color:#64748b; }
.campo select { font:inherit; font-size:0.9rem; text-transform:none;
       letter-spacing:0; color:#1f2328; padding:6px 10px; border-radius:7px;
       border:1px solid #cbd5e1; background:#fff; }
.painel-poder { display:grid; grid-template-columns:minmax(0,2.4fr) minmax(220px,1fr);
       gap:18px; align-items:start; }
.tela-poder svg { display:block; cursor:crosshair; border-radius:6px; }
.tela-poder svg:focus { outline:2px solid #1a6aa8; outline-offset:2px; }
#poder-leitura { border:1px solid #e2e8f0; border-radius:9px; padding:12px 14px;
       background:#fff; font-size:0.86rem; }
.cabecalho-leitura { font-weight:600; color:#0f2b45; margin-bottom:8px;
       font-size:0.8rem; }
.linha-leitura { display:grid; grid-template-columns:10px 1fr auto;
       gap:4px 8px; align-items:center; padding:7px 0;
       border-top:1px solid #eef2f6; }
.linha-leitura .marca { width:10px; height:10px; border-radius:50%; }
.linha-leitura .nome { color:#1f2328; }
.linha-leitura .valor { font-weight:700; color:#0f2b45; font-size:1rem; }
.linha-leitura .ic, .linha-leitura .tipo { grid-column:2 / span 2; color:#64748b;
       font-size:0.76rem; }
.conclusao-leitura { margin:12px 0 0; padding-top:10px;
       border-top:1px solid #eef2f6; color:#1f2328; font-size:0.84rem; }
.mde-leitura { margin:10px 0 0; color:#64748b; font-size:0.78rem; }
.mde-leitura b { color:#0f2b45; }
.dica { margin:4px 0 0; color:#64748b; font-size:0.8rem; }
.veredito { font-weight:600; white-space:nowrap; }
.veredito.sim { color:#1a7f47; }
.veredito.parcial { color:#8a5a12; }
.veredito.nao { color:#b42318; }
@media (max-width:760px) { .painel-poder { grid-template-columns:1fr; } }
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



NOMES_PODER = {
    "normal": "Sem violação · normal",
    "cauda_pesada": "Cauda pesada · t com 3 gl",
    "contaminada": "Outliers · 10% com 5× o desvio",
    "bootstrap_simetrizado": "Bootstrap simetrizado · forma real, simétrica",
    "bootstrap_centralizado": "Bootstrap centralizado · forma real, assimétrica",
}
# nomes curtos, para usar no meio de uma frase (os de cima são de rótulo)
NOMES_CURTOS = {
    "normal": "diferenças normais",
    "cauda_pesada": "cauda pesada",
    "contaminada": "presença de outliers",
    "bootstrap_simetrizado": "a forma real, simetrizada",
    "bootstrap_centralizado": "a forma real, assimétrica",
}
CENARIOS_VIOLACAO = ("normal", "cauda_pesada", "contaminada")
CENARIOS_BOOTSTRAP = ("bootstrap_simetrizado", "bootstrap_centralizado")
TESTE_T_NOME = "t pareado"
TESTE_W_NOME = "Wilcoxon pareado"
ALVO_PODER = 0.80
# os dois tamanhos que o G4 estático mostra; o resto está no interativo
TAMANHOS_G4 = (10, 30)


NOMES_VIOLACAO = {
    "normal": "Sem violação · normal",
    "cauda_pesada": "Normalidade violada · cauda pesada (t com 3 gl)",
    "contaminada": "Normalidade violada · outliers (10% com 5× o desvio)",
}


def carregar_violacao(dados: Path = DADOS):
    """Lê o estudo da Q3 (Issues #111 e #112), se ele já tiver sido rodado.

    Devolve (condições, mcnemar por célula, repetições, α) ou None quando os
    CSVs ainda não existem — aí a parte da Q3 simplesmente não aparece, em vez
    de quebrar a página.
    """
    taxas, pareado = dados / "resultados_q3.csv", dados / "mcnemar_q3.csv"
    if not taxas.exists() or not pareado.exists():
        return None

    por_celula: dict[tuple[str, int], dict[str, dict[str, str]]] = {}
    ordem: list[tuple[str, int]] = []
    for linha in ler_csv(taxas):
        chave = (linha["cenario"], int(linha["n"]))
        if chave not in por_celula:
            por_celula[chave] = {}
            ordem.append(chave)
        por_celula[chave][linha["teste"]] = linha

    condicoes = []
    for cenario, n in ordem:
        t, w = por_celula[(cenario, n)]["t pareado"], por_celula[(cenario, n)]["Wilcoxon pareado"]
        condicoes.append(CondicaoErro(
            grupo=NOMES_VIOLACAO.get(cenario, cenario),
            rotulo=f"n = {n}",
            taxa_t=float(t["taxa_rejeicao"]),
            ic_t=(float(t["ic95_wilson_inferior"]), float(t["ic95_wilson_superior"])),
            taxa_w=float(w["taxa_rejeicao"]),
            ic_w=(float(w["ic95_wilson_inferior"]), float(w["ic95_wilson_superior"])),
        ))

    mcnemar_por_celula = {(l["cenario"], int(l["n"])): l for l in ler_csv(pareado)}
    primeira = por_celula[ordem[0]]["t pareado"]
    return condicoes, mcnemar_por_celula, int(primeira["repeticoes"]), float(primeira["alfa"])


def bloco_violacao(violacao, alfa: float) -> str:
    """A parte da Q3 dentro da seção 4: o painel, três cartões e a leitura."""
    condicoes, _, repeticoes, _ = violacao
    faixa = faixa_acaso(alfa, repeticoes)
    painel = grafico_g3_violacao(condicoes, alfa=alfa, faixa=faixa)

    def pct(x: float) -> str:
        return f"{numero(100 * x, 2)}%"

    menores = [c for c in condicoes if c.rotulo == "n = 5"]
    maiores = [c for c in condicoes if c.rotulo == "n = 30"]
    w_pequeno = [c.taxa_w for c in menores]
    t_grande = [c.taxa_t for c in maiores]
    w_grande = [c.taxa_w for c in maiores]

    cartoes = (
        '<div class="grade2">'
        + cartao("Wilcoxon · n = 5",
                 f"{pct(min(w_pequeno))} a {pct(max(w_pequeno))}",
                 "conservador nos três cenários: o teto é 1/2⁵ = 3,125%")
        + cartao("t pareado · n = 30",
                 f"{pct(min(t_grande))} a {pct(max(t_grande))}",
                 "fica no nível mesmo com cauda pesada e outliers")
        + cartao("Wilcoxon · n = 30",
                 f"{pct(min(w_grande))} a {pct(max(w_grande))}",
                 "o nível dele não depende da forma, só da simetria")
        + cartao("Conjuntos por célula", numero(repeticoes, 0),
                 f"9 células · faixa do acaso {pct(faixa[0])}–{pct(faixa[1])}")
        + "</div>"
    )

    leitura = (
        '<div class="leitura">Aqui a violação é <b>só da normalidade</b>: os três cenários '
        "continuam simétricos em torno de zero, e é isso que mantém as duas H₀ verdadeiras ao "
        "mesmo tempo. <b>Com n = 30, nenhuma das duas violações tira os testes do nível</b> "
        f"({pct(min(t_grande))} a {pct(max(t_grande))} no t e {pct(min(w_grande))} a "
        f"{pct(max(w_grande))} no Wilcoxon): cauda pesada e outliers custam <b>poder</b>, não "
        "calibração. <b>O que muda o quadro é a amostra pequena</b>: com n = 5 o Wilcoxon "
        f"exato cai para {pct(min(w_pequeno))}–{pct(max(w_pequeno))} nos três cenários, "
        "porque só existem 2⁵ = 32 somas de postos possíveis e a cauda mais próxima de 5% por "
        "baixo vale 1/32 ≈ 3,1%. Ele erra menos do que poderia e paga isso em poder, como as "
        "curvas do G4 mostram; detalhes em "
        "<code>docs/violacao_pressupostos.md</code>.</div>"
    )
    titulo = ('<h3 style="margin:30px 0 2px;font-size:1rem;color:#0f2b45">'
              "Q3 · os mesmos testes com os pressupostos violados</h3>"
              '<p class="sub">normalidade quebrada com simetria preservada, em três tamanhos '
              "de amostra (Issues #111 e #112)</p>")
    return titulo + f"<figure>{painel}</figure>" + cartoes + leitura


def secao_erro_tipo_i(comparacoes: dict[str, Comparacao], alfa: float,
                      violacao=None) -> str:
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
        '<div class="leitura">A linha vermelha é o nível nominal e a faixa cinza '
        f"({numero(100 * faixa[0], 2)}% a {numero(100 * faixa[1], 2)}%) é o que o acaso de "
        f"{numero(r, 0)} simulações explica; as duas H₀ não são a mesma — a do t é sobre a "
        "<b>média</b> das diferenças, a do Wilcoxon é que a distribuição seja "
        "<b>simétrica</b> em torno de 0. <b>Na distribuição simétrica</b>, em que as duas "
        f"valem, os dois ficam no nível nominal ({pct(s.t.taxa)} e {pct(s.w.taxa)}), sem "
        "diferença detectável entre eles. <b>Com a forma assimétrica dos dados reais</b> o t "
        f"passa a errar {pct(c.t.taxa)} ({numero(c.t.razao_alfa, 1)} vezes o prometido), "
        f"enquanto a barra listrada do Wilcoxon ({pct(c.w.taxa)}) <b>não é erro tipo I</b> — "
        "ali a H₀ dele é falsa, e ele está detectando isso. Nos dados reais nada disso muda a "
        "conclusão, porque os p-valores observados estão ordens de grandeza abaixo dessas "
        "taxas; limitações em <code>docs/resultados_q1.md</code> e "
        "<code>docs/comparacao_taxas_erro.md</code>.</div>"
    )
    q3 = bloco_violacao(violacao, alfa) if violacao else ""
    return f"<figure>{g3}</figure>{cartoes}{leitura}{q3}"


# ------------------------------------------------------- seção 5 · poder


@dataclass
class GradePoder:
    """A grade da Q2 lida de `data/resultados_q2.csv` (Issue #109).

    Guarda as taxas como vieram do CSV. O dashboard não recalcula teste nenhum
    — se este objeto e o `src/poder.py` discordassem, um dos dois estaria
    mentindo, e o único jeito de garantir que não é ter uma fonte só.
    """

    efeitos: list[float]
    tamanhos: list[int]
    cenarios: list[str]
    alfa: float
    repeticoes: int
    desvio: float
    series: dict

    def serie(self, cenario: str, n: int, teste: str) -> dict:
        return self.series[(cenario, n, teste)]

    def pontos(self, cenario: str, n: int, teste: str) -> list[tuple[float, float]]:
        serie = self.serie(cenario, n, teste)
        return list(zip(self.efeitos, serie["taxa"]))

    def intervalos(self, cenario: str, n: int, teste: str) -> list[tuple[float, float]]:
        serie = self.serie(cenario, n, teste)
        return list(zip(serie["inf"], serie["sup"]))

    def mde(self, cenario: str, n: int, teste: str) -> float | None:
        return self.serie(cenario, n, teste)["mde"]

    def taxa(self, cenario: str, n: int, efeito: float, teste: str) -> float:
        return self.serie(cenario, n, teste)["taxa"][self.efeitos.index(efeito)]

    def vantagem(self, cenario: str, n: int, do_wilcoxon: bool = True
                 ) -> tuple[float, float]:
        """(maior vantagem em p.p., efeito em que acontece), só com δ > 0.

        Em δ = 0 a diferença entre as taxas é de erro tipo I, não de poder:
        misturar as duas é exatamente o erro que a coluna `natureza` do CSV
        existe para evitar.
        """
        t = self.serie(cenario, n, TESTE_T_NOME)["taxa"]
        w = self.serie(cenario, n, TESTE_W_NOME)["taxa"]
        candidatos = [(100 * ((w[i] - t[i]) if do_wilcoxon else (t[i] - w[i])), efeito)
                      for i, efeito in enumerate(self.efeitos) if efeito > 0]
        return max(candidatos)


def carregar_poder(dados: Path = DADOS, desvio: float = 0.3934) -> GradePoder | None:
    """Lê o estudo de poder da Q2, se ele já tiver sido rodado.

    Devolve None quando o CSV ainda não existe — aí a seção 5 continua
    pendente, em vez de a página quebrar.
    """
    arquivo = dados / "resultados_q2.csv"
    if not arquivo.exists():
        return None

    linhas = ler_csv(arquivo)
    efeitos = sorted({float(l["efeito"]) for l in linhas})
    tamanhos = sorted({int(l["n"]) for l in linhas})
    cenarios = list(dict.fromkeys(l["cenario"] for l in linhas))

    series: dict = {}
    for linha in linhas:
        chave = (linha["cenario"], int(linha["n"]), linha["teste"])
        serie = series.setdefault(chave, {
            "taxa": [None] * len(efeitos), "inf": [None] * len(efeitos),
            "sup": [None] * len(efeitos), "mde": None, "h0_falsa_em_zero": False,
        })
        indice = efeitos.index(float(linha["efeito"]))
        serie["taxa"][indice] = float(linha["taxa_rejeicao"])
        serie["inf"][indice] = float(linha["ic95_wilson_inferior"])
        serie["sup"][indice] = float(linha["ic95_wilson_superior"])
        if linha["mde80"]:
            serie["mde"] = float(linha["mde80"])
        if float(linha["efeito"]) == 0.0 and linha["h0_do_teste_verdadeira"] != "True":
            serie["h0_falsa_em_zero"] = True

    primeira = linhas[0]
    return GradePoder(efeitos=efeitos, tamanhos=tamanhos, cenarios=cenarios,
                      alfa=float(primeira["alfa"]),
                      repeticoes=int(primeira["repeticoes"]),
                      desvio=desvio, series=series)


def _curvas_do_g4(grade: GradePoder, cenarios: tuple[str, ...],
                  tamanhos: tuple[int, ...]) -> list[CurvaPoder]:
    """Painéis em ordem de linha: coluna = cenário, linha = tamanho de amostra."""
    curvas = []
    for n in tamanhos:
        for cenario in cenarios:
            curvas.append(CurvaPoder(
                grupo=NOMES_PODER.get(cenario, cenario),
                rotulo=f"n = {n}",
                pontos_t=grade.pontos(cenario, n, TESTE_T_NOME),
                pontos_w=grade.pontos(cenario, n, TESTE_W_NOME),
                ic_t=grade.intervalos(cenario, n, TESTE_T_NOME),
                ic_w=grade.intervalos(cenario, n, TESTE_W_NOME),
                mde_t=grade.mde(cenario, n, TESTE_T_NOME),
                mde_w=grade.mde(cenario, n, TESTE_W_NOME),
                h0_w_falsa_em_zero=grade.serie(
                    cenario, n, TESTE_W_NOME)["h0_falsa_em_zero"],
            ))
    return curvas


def _mde_em_segundos(grade: GradePoder, valor: float | None) -> str:
    if valor is None:
        return "acima da grade"
    return f"δ = {numero(valor, 2)} ({numero(valor * grade.desvio, 2)} s)"


def dados_para_o_interativo(grade: GradePoder) -> str:
    """O JSON que o gráfico interativo lê — montado da MESMA grade do G4."""
    return json.dumps({
        "alfa": grade.alfa,
        "alvo": ALVO_PODER,
        "repeticoes": grade.repeticoes,
        "desvio": grade.desvio,
        "efeitos": grade.efeitos,
        "tamanhos": grade.tamanhos,
        "cenarios": [{"id": c, "nome": NOMES_PODER.get(c, c)} for c in grade.cenarios],
        "series": {
            f"{cenario}|{n}": {
                "t": grade.serie(cenario, n, TESTE_T_NOME),
                "w": grade.serie(cenario, n, TESTE_W_NOME),
            }
            for cenario in grade.cenarios for n in grade.tamanhos
            if (cenario, n, TESTE_T_NOME) in grade.series
        },
    }, ensure_ascii=False)


def bloco_interativo(grade: GradePoder, javascript: str) -> str:
    """O bônus: as mesmas curvas, com seletor de condição e leitura ponto a ponto.

    Fica DEPOIS do G4 estático, nunca no lugar dele: sem JavaScript a seção 5
    continua completa, e quem só quer a resposta não precisa mexer em nada.
    """
    return (
        '<div class="interativo" id="poder-interativo">'
        "<h3>Explorar as outras condições</h3>"
        '<p class="sub">O G4 acima mostra as seis condições que respondem à pergunta '
        f"do laboratório. Aqui estão as {len(grade.cenarios) * len(grade.tamanhos)} "
        "combinações de cenário e tamanho de amostra, com o poder exato de cada "
        "teste em cada efeito.</p>"
        '<div class="controles" id="poder-controles"></div>'
        '<div class="painel-poder">'
        '<div class="tela-poder"></div><div id="poder-leitura"></div>'
        "</div>"
        '<p class="dica">Passe o mouse sobre o gráfico — ou use as setas do teclado '
        "depois de clicar nele — para ler cada ponto. Os números são os mesmos de "
        "<code>data/resultados_q2.csv</code>.</p>"
        "</div>"
        f'<script type="application/json" id="dados-poder">'
        f"{dados_para_o_interativo(grade)}</script>"
        f"<script>{javascript}</script>"
    )


def javascript_do_poder() -> str:
    """O conteúdo de `src/poder.js`, para ser embutido na página.

    O JS mora num arquivo `.js` de verdade, e não numa string dentro do
    Python, para o editor e o `node --check` o tratarem como código. Ele é
    inlinado na geração porque o dashboard tem de continuar sendo um arquivo
    só, que abre com dois cliques e sem servidor.
    """
    caminho = Path(__file__).resolve().parent / "poder.js"
    return caminho.read_text(encoding="utf-8")


def secao_poder(grade: GradePoder, javascript: str = "") -> str:
    """Seção 5: o G4 das duas famílias, os cartões e a leitura (Issues #109, #110)."""
    g4_violacao = grafico_g4(
        _curvas_do_g4(grade, CENARIOS_VIOLACAO, TAMANHOS_G4),
        alfa=grade.alfa, alvo_poder=ALVO_PODER, colunas=3,
        titulo="G4 — poder dos dois testes por tamanho de efeito, com os "
               "pressupostos violados",
    )
    g4_bootstrap = grafico_g4(
        _curvas_do_g4(grade, CENARIOS_BOOTSTRAP, (30,)),
        alfa=grade.alfa, alvo_poder=ALVO_PODER, colunas=2,
        titulo="G4 — poder dos dois testes com a forma das diferenças reais",
    )

    n = 30
    mdes_t = [grade.mde(c, n, TESTE_T_NOME) for c in CENARIOS_VIOLACAO]
    mdes_w = [grade.mde(c, n, TESTE_W_NOME) for c in CENARIOS_VIOLACAO]
    ganho, efeito_ganho, cenario_ganho = max(
        grade.vantagem(c, n) + (c,) for c in CENARIOS_VIOLACAO)
    perda, efeito_perda = grade.vantagem("normal", n, do_wilcoxon=False)

    def faixa_mde(valores: list[float | None]) -> str:
        """Intervalo do MDE₈₀ entre os cenários — nunca um número só.

        Um valor sozinho aqui seria ambíguo: o MDE depende do cenário, e dar o
        menor deles faria o cartão discordar da seção 7, que usa o cenário
        normal como referência.
        """
        validos = [v for v in valores if v is not None]
        if not validos:
            return "acima da grade"
        if min(validos) == max(validos):
            return f"δ = {numero(min(validos), 2)}"
        return f"δ = {numero(min(validos), 2)} a {numero(max(validos), 2)}"

    cartoes = (
        '<div class="grade2">'
        + cartao("t pareado · MDE₈₀ em n = 30", faixa_mde(mdes_t),
                 "o menor efeito que ele acha em 80% das vezes, "
                 "entre os três cenários")
        + cartao("Wilcoxon · MDE₈₀ em n = 30", faixa_mde(mdes_w),
                 "mesma leitura, entre os mesmos três cenários")
        + cartao("Maior vantagem do Wilcoxon", f"{numero(ganho, 1)} p.p.",
                 f"{NOMES_PODER[cenario_ganho]}, δ = {numero(efeito_ganho, 2)}")
        + cartao("Maior vantagem do t", f"{numero(perda, 1)} p.p.",
                 f"cenário normal, δ = {numero(efeito_perda, 2)} — o preço da robustez")
        + "</div>"
    )

    leitura = (
        '<div class="leitura">Cada curva mostra em quantos por cento dos conjuntos '
        "simulados o teste rejeitou H₀, para um efeito cada vez maior; em <b>δ = 0 não há "
        "efeito</b>, e a curva volta a ser a taxa de erro tipo I da seção 4, por isso todas "
        "partem da linha de 5%. <b>O que a seção 4 não podia mostrar aparece aqui:</b> cauda "
        "pesada e outliers quase não mexem no nível dos testes, mas mexem muito no poder — "
        f"com {NOMES_CURTOS[cenario_ganho]} o Wilcoxon encontra o efeito "
        f"{numero(ganho, 1)} p.p. mais vezes que o t (δ = {numero(efeito_ganho, 2)}), nos "
        "mesmos conjuntos. No cenário normal a conta se inverte e o t ganha, mas só "
        f"{numero(perda, 1)} p.p.: a troca é assimétrica. Quanto a 30 pares, no cenário de "
        "referência o teste t só detecta efeitos a partir de "
        f"{_mde_em_segundos(grade, grade.mde('normal', n, TESTE_T_NOME))} — abaixo disso, "
        "mais de uma em cada cinco coletas iguais a esta não encontraria nada (tabelas "
        "completas em <code>docs/poder.md</code>).</div>"
    )

    titulo_bootstrap = (
        '<h3 style="margin:30px 0 2px;font-size:1rem;color:#0f2b45">'
        "A mesma pergunta com a forma dos dados reais</h3>"
        '<p class="sub">as diferenças coletadas, reamostradas com e sem a assimetria '
        "delas (n = 30, o tamanho real)</p>"
    )
    return (f"<figure>{g4_violacao}</figure>{cartoes}{leitura}"
            f"{titulo_bootstrap}<figure>{g4_bootstrap}</figure>"
            + (bloco_interativo(grade, javascript) if javascript else ""))


# --------------------------------------------------- seção 7 · conclusão


VEREDITOS = {
    "sim": "confirmado",
    "parcial": "parcialmente",
    "nao": "não confirmado",
    "novo": "não previsto",
}


def _linha_expectativa(expectativa: str, origem: str, achado: str,
                       classe: str) -> str:
    return (
        "<tr>"
        f"<td>{expectativa}</td>"
        f'<td style="white-space:nowrap;color:#64748b">{escapar(origem)}</td>'
        f"<td>{achado}</td>"
        f'<td class="veredito {classe}">{VEREDITOS[classe]}</td>'
        "</tr>"
    )


def secao_conclusao(grade: GradePoder, reais_resultados: list[dict[str, str]],
                    diferencas: list[float], violacao=None) -> str:
    """Seção 7: o que o grupo esperava × o que a simulação mostrou.

    As expectativas não são escritas agora: são as que ficaram registradas em
    `docs/cenario_experimental.md` ANTES da coleta (seções 4.3 e 12). Confrontar
    o que foi previsto com o que apareceu é o que torna isto uma conclusão, e
    não um resumo. Os números vêm todos da grade da Q2 e dos CSVs — se a
    simulação for rodada de novo e mudar, este texto muda junto.
    """
    n = 30
    ganho, efeito_ganho, cenario_ganho = max(
        grade.vantagem(c, n) + (c,)
        for c in ("cauda_pesada", "contaminada"))
    perda, efeito_perda = grade.vantagem("normal", n, do_wilcoxon=False)
    mde_t = grade.mde("normal", n, TESTE_T_NOME)
    mde_w = grade.mde("normal", n, TESTE_W_NOME)
    ganho_real, efeito_real = grade.vantagem("bootstrap_simetrizado", n)

    t_real = resultado(reais_resultados, "t pareado")
    d_z = float(t_real["efeito_valor"])
    media_real = float(t_real["centro_valor"])

    linhas = [
        _linha_expectativa(
            "O teste t pode ter <b>mais poder</b> quando as diferenças seguem uma "
            "distribuição próxima da normal.",
            "cenário §4.3",
            f"Sim, e a vantagem é pequena: no máximo <b>{numero(perda, 1)} p.p.</b> "
            f"(δ = {numero(efeito_perda, 2)}, n = {n}). O custo de usar o Wilcoxon "
            "quando o t seria ótimo é de poucos pontos percentuais.",
            "sim" if perda > 0 else "nao"),
        _linha_expectativa(
            "O Wilcoxon pode ser <b>menos influenciado por valores extremos</b>.",
            "cenário §4.3",
            f"Sim, e a vantagem é grande: até <b>{numero(ganho, 1)} p.p.</b> de poder "
            f"a mais com {NOMES_CURTOS[cenario_ganho]} (δ = "
            f"{numero(efeito_ganho, 2)}, n = {n}). A seção 4 mostrou que os extremos "
            "quase não mexem no <i>nível</i> dos testes; o custo deles aparece "
            "todo aqui, no poder.",
            "sim" if ganho > 0 else "nao"),
        _linha_expectativa(
            "Se a redução for muito grande e consistente, os dois testes apontarão "
            "significativo e <b>a comparação ficará menos evidente nos dados reais</b>.",
            "cenário §12",
            f"Exatamente o que aconteceu: d_z = {numero(d_z, 1)} contra um MDE₈₀ de "
            f"δ ≈ {numero(mde_t, 2)} — o efeito real é <b>"
            f"{numero(d_z / mde_t, 0)} vezes</b> maior do que o necessário para os "
            "dois acharem quase sempre. Foi preciso simular para conseguir separá-los.",
            "sim"),
        _linha_expectativa(
            "Cerca de 30 pares <b>podem ser insuficientes</b> para identificar "
            "efeitos pequenos.",
            "cenário §12",
            f"Agora com número: com n = {n} o menor efeito detectável em 80% das "
            f"vezes é {_mde_em_segundos(grade, mde_t)} no t e "
            f"{_mde_em_segundos(grade, mde_w)} no Wilcoxon. Abaixo disso, mais de "
            "uma em cada cinco repetições do experimento não encontraria nada.",
            "sim"),
        _linha_expectativa(
            "—",
            "não previsto",
            "Com a <b>forma real das diferenças</b> (bootstrap da coleta, n = 30), o "
            f"Wilcoxon leva <b>{numero(ganho_real, 1)} p.p.</b> de vantagem em "
            f"δ = {numero(efeito_real, 2)}. Os dados deste experimento não são "
            "aproximadamente normais: têm cauda pesada. Para <i>esta</i> coleta, o "
            "teste mais poderoso teria sido o Wilcoxon — algo que o grupo não tinha "
            "como saber antes de coletar.",
            "novo"),
    ]

    recomenda_wilcoxon = ganho > perda
    if recomenda_wilcoxon:
        recomendacao = (
            "<b>Recomendação: usar o Wilcoxon pareado como teste principal neste "
            f"cenário</b>, com o t pareado reportado ao lado. Ele troca até "
            f"{numero(perda, 1)} p.p. de poder, no caso em que o t é ótimo, por até "
            f"{numero(ganho, 1)} p.p. quando há cauda pesada ou valores extremos — e "
            "tempo de build tem as duas coisas, como o próprio bootstrap dos dados "
            "coletados mostra. A troca é assimétrica a favor dele."
        )
    else:
        recomendacao = (
            "<b>Recomendação: usar o teste t pareado como teste principal neste "
            f"cenário.</b> A vantagem do Wilcoxon onde ele ganha ({numero(ganho, 1)} "
            f"p.p.) não compensa o que ele perde onde o t é ótimo "
            f"({numero(perda, 1)} p.p.)."
        )

    ressalva_n = ""
    if 5 in grade.tamanhos:
        taxa_w5 = grade.taxa("normal", 5, 0.0, TESTE_W_NOME)
        ressalva_n = (
            " <b>Com amostra muito pequena, a escolha do teste é secundária:</b> "
            f"com n = 5 o Wilcoxon exato só consegue gastar {numero(100 * taxa_w5, 1)}% "
            "do α — existem apenas 2⁵ = 32 somas de postos possíveis — e nenhum dos "
            "dois tem poder para efeitos moderados. Aí o problema é coletar mais "
            "pares, não escolher melhor o teste."
        )

    return (
        "<table><thead><tr><th>O que esperávamos</th><th>Origem</th>"
        "<th>O que a simulação mostrou</th><th>Veredito</th></tr></thead>"
        f"<tbody>{''.join(linhas)}</tbody></table>"
        f'<div class="leitura">{recomendacao}'
        " Com duas ressalvas que os próprios números deixam explícitas. "
        "<b>A primeira:</b> um p &lt; 0,05 do Wilcoxon não autoriza uma afirmação "
        "sobre o tempo <i>médio</i>. A H₀ dele é sobre simetria — na prática, sobre a "
        "pseudomediana — e o cenário centralizado da seção 4 mostra as duas coisas se "
        "separando: lá ele rejeita "
        f"{numero(100 * grade.taxa('bootstrap_centralizado', n, 0.0, TESTE_W_NOME), 1)}% "
        "das vezes sem que exista deslocamento nenhum. Se a conclusão precisa ser "
        f"sobre a média, o teste é o t.{ressalva_n}"
        "</div>"
        f'<div class="leitura" style="border-left-color:#1a7f47">'
        "<b>E a resposta do experimento, que não dependia de nada disso:</b> ativar o "
        f"Build Cache do Gradle reduziu o tempo de build do Spring PetClinic em "
        f"{numero(media_real, 1)} s por execução, em {sum(1 for d in diferencas if d > 0)} "
        f"dos {len(diferencas)} pares. Os dois testes rejeitam H₀ com folga e "
        "concordam. A simulação não mudou essa conclusão — ela mostrou <i>sob quais "
        "condições</i> ela poderia ter sido diferente, que era o ponto do "
        "laboratório.</div>"
    )


def _rotulo_sprint(erro_tipo_i, violacao, poder=None) -> str:
    """O que a página já mostra — para o cabeçalho não prometer mais do que tem."""
    if erro_tipo_i is None:
        return "Sprint 01 · seções 1, 2, 3 e 6"
    if violacao is None:
        return "Sprint 02 · seções 1 a 4 (Q1) e 6"
    if poder is None:
        return "Sprint 02 · seções 1 a 4 (Q1 e Q3) e 6"
    return "Sprint 02 · seções 1 a 7 (Q1, Q2 e Q3)"


def montar(reais: dict[str, list[float]], simulados: dict[str, list[float]],
           reais_resultados: list[dict[str, str]],
           exemplo: list[dict[str, str]],
           erro_tipo_i: tuple[dict[str, Comparacao], float] | None = None,
           violacao=None, poder: "GradePoder | None" = None,
           javascript: str = "") -> str:
    """Monta a página.

    `erro_tipo_i` = (comparações, α) de `carregar_comparacoes`; `violacao`, de
    `carregar_violacao`; `poder`, de `carregar_poder`. Cada um que vier None
    deixa a sua seção marcada como pendente, em vez de derrubar a página — é
    o que permitiu o dashboard existir desde a Sprint 01, com as seções
    chegando uma a uma.
    """
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
        "<div class=\"leitura\">O <b>teste t</b> compara a <b>média</b> das diferenças "
        "com zero; o <b>Wilcoxon</b> compara os <b>postos</b>, perguntando se a "
        "distribuição é simétrica em torno de zero. Cada curva mostra os valores que a "
        "estatística assumiria <b>se H₀ fosse verdadeira</b>, e a faixa cinza é a região "
        f"de rejeição de 5%: t ≥ {numero(t_critico, 3)} de um lado, W⁺ ≥ {w_critico} do "
        "outro. A área colorida é o <b>p-valor</b> — a chance de, sem efeito nenhum, "
        "aparecer um valor tão extremo quanto o observado (no exemplo simulado, "
        f"{numero(float(t_exemplo['p_valor']), 4)} e "
        f"{numero(float(w_exemplo['p_valor']), 4)}). Nos dados reais os dois ficariam "
        f"fora da escala: t = {numero(float(t_real['estatistica']), 1)} e "
        f"W⁺ = {numero(float(w_real['estatistica']), 0)}, o máximo possível.</div>"
    )

    # ---- seção 4 e 5
    if erro_tipo_i is not None:
        s4 = secao_erro_tipo_i(*erro_tipo_i, violacao=violacao)
    else:
        s4 = pendente(
            "G3 — taxa de erro tipo I dos dois testes sob H0, com uma linha em 5%. "
            "Rode <code>python src/erro_tipo_i.py</code> para gerar os p-valores da Q1."
        )
    if poder is not None:
        s5 = secao_poder(poder, javascript)
    else:
        s5 = pendente(
            "G4 — curvas de poder dos dois testes: proporção de rejeições × tamanho "
            "do efeito. Rode <code>python src/poder.py</code> para gerar a Q2."
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

    if poder is not None:
        s7 = secao_conclusao(poder, reais_resultados, reais["diferenças"], violacao)
    else:
        s7 = pendente(
            "A conclusão compara o que o grupo esperava antes de simular com o que a "
            "simulação mostrou, e fecha com a recomendação de qual teste usar neste "
            "cenário. Depende do G4 (Issue #110)."
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
    <span>{_rotulo_sprint(erro_tipo_i, violacao, poder)}</span>
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

    violacao = carregar_violacao(DADOS)
    if violacao is None:
        print("atencao: Q3 nao incluida (rode python src/violacao.py)")

    reais = dados_reais()
    poder = carregar_poder(DADOS, desvio=statistics.stdev(reais["diferenças"]))
    if poder is None:
        print("atencao: G4 e conclusao nao gerados (rode python src/poder.py)")

    pagina = montar(
        reais=reais,
        simulados=diferencas_simuladas(),
        reais_resultados=ler_csv(DADOS / "resultados_reais.csv"),
        exemplo=ler_csv(DADOS / "simulacao" / "resultados_exemplo.csv"),
        erro_tipo_i=erro_tipo_i,
        violacao=violacao,
        poder=poder,
        javascript=javascript_do_poder() if poder is not None else "",
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
