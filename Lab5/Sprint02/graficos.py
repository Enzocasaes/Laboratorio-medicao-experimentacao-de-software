"""Graficos da Sprint 02 em SVG (Lab05, issue #137).

Mesma escolha do Lab04 (`Lab4/src/graficos.py`): SVG escrito a mao, so'
biblioteca padrao. O GitHub mostra o SVG direto no README, e cada marca traz um
`<title>`, que vira dica ao passar o mouse quando o arquivo e' aberto sozinho.

Le a base validada (lote `provisoria`, D13) e o `inferencia.json` que o
`inferencia.py` (#136) grava; os IC nao sao recalculados aqui.

O QUE CADA GRAFICO RESPONDE (Planejamento, 10.1)

G1 — ECDF da latencia do E-1 por resolvedor: a distribuicao inteira, nao so' a
     mediana. Eixo log, porque acerto de cache e recursao diferem por uma
     ordem de grandeza.
G2 — Δ(1.1.1.1 − 8.8.8.8) por nome: onde a H-a ganha e onde se inverte.
G3 — Custo do DoT e do DoH sobre o Do53 (E-2), conexao nova e reaproveitada,
     com a margem de ±5 ms da H-c2. IC por rodada: exploratorio.
G4 — Serie temporal da mediana por rodada: substitui o boxplot por faixa
     horaria, que nao tem o que mostrar com 10 minutos de coleta.
G5 — Sensibilidade da H-a: o Δ e o IC em cada cenario da secao 10.6.

CORES. Uma por resolvedor, fixa em todos os graficos: 1.1.1.1 azul, 8.8.8.8
laranja, padrao verde-agua. O trio passou no validador de paleta (CVD ΔE 12,6
no pior par). Laranja e verde-agua ficam abaixo de 3:1 contra o branco, por
isso toda serie tem rotulo direto e os numeros estao em tabela no README.

Uso (a partir de Lab5/):

    python Sprint02/graficos.py
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

LAB5 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import analise as ana  # noqa: E402
import estatistica as est  # noqa: E402

BASE = LAB5 / "Sprint02" / "base_validada" / "consultas.csv.gz"
LOTE = "provisoria"
RESULTADOS = LAB5 / "Sprint02" / "resultados"

COR = {"1.1.1.1": "#257de0", "8.8.8.8": "#f47230", "padrao": "#00b894"}
NOME = {"1.1.1.1": "1.1.1.1", "8.8.8.8": "8.8.8.8", "padrao": "padrão (roteador)"}
TINTA, TINTA_FRACA, GRADE, EIXO = "#191919", "#666666", "#e4e7eb", "#9aa3ad"
FAIXA = "#eef2f6"
FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
LARGURA = 760


# ---------------------------------------------------------------- primitivas


def esc(texto) -> str:
    return (str(texto).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def num(valor: float, casas: int = 1, sinal: bool = False) -> str:
    texto = f"{valor:+.{casas}f}" if sinal else f"{valor:.{casas}f}"
    return texto.replace("-", "−").replace(".", ",")


def texto(x, y, conteudo, tam=12, cor=TINTA, ancora="start", peso="normal") -> str:
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{tam}" fill="{cor}" '
            f'text-anchor="{ancora}" font-weight="{peso}">{esc(conteudo)}</text>')


def linha(x1, y1, x2, y2, cor=EIXO, largura=1.0, extra="") -> str:
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{cor}" stroke-width="{largura}" {extra}/>')


def documento(altura: int, titulo: str, subtitulo: str, corpo: list[str]) -> str:
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{LARGURA}" height="{altura}" '
        f'viewBox="0 0 {LARGURA} {altura}" font-family="{FONTE}" role="img" '
        f'aria-label="{esc(titulo)}">',
        f"<title>{esc(titulo)}</title>",
        # fundo proprio: o SVG fica legivel tambem no tema escuro do GitHub
        f'<rect width="{LARGURA}" height="{altura}" fill="#ffffff"/>',
        texto(24, 30, titulo, 16, TINTA, peso="600"),
        texto(24, 50, subtitulo, 12, TINTA_FRACA),
        *corpo,
        "</svg>",
    ]) + "\n"


class Escala:
    def __init__(self, d0, d1, r0, r1, log=False):
        self.d0, self.d1, self.r0, self.r1, self.log = d0, d1, r0, r1, log

    def __call__(self, v):
        if self.log:
            a, b, v = math.log10(self.d0), math.log10(self.d1), math.log10(max(v, self.d0))
        else:
            a, b = self.d0, self.d1
        return self.r0 + (v - a) / (b - a) * (self.r1 - self.r0)


def legenda(x, y, itens: list[str]) -> list[str]:
    saida = []
    for chave in itens:
        saida.append(f'<rect x="{x}" y="{y - 9}" width="12" height="12" rx="3" fill="{COR[chave]}"/>')
        saida.append(texto(x + 18, y + 1, NOME[chave], 12, TINTA))
        x += 30 + 7 * len(NOME[chave])
    return saida


# ---------------------------------------------------------------- G1 ECDF


def g1_ecdf(linhas: list[dict]) -> str:
    e1 = [l for l in linhas if l["experimento"] == "E-1" and l["sucesso"]]
    x = Escala(1, 600, 70, LARGURA - 40, log=True)
    y = Escala(0, 1, 380, 80)
    corpo = legenda(70, 72, list(COR))
    for marca in (1, 2, 5, 10, 20, 50, 100, 200, 500):
        corpo.append(linha(x(marca), 80, x(marca), 380, GRADE))
        corpo.append(texto(x(marca), 396, num(marca, 0), 11, TINTA_FRACA, "middle"))
    for frac in (0, 0.25, 0.5, 0.75, 1):
        corpo.append(linha(70, y(frac), LARGURA - 40, y(frac), GRADE))
        corpo.append(texto(62, y(frac) + 4, f"{frac:.0%}", 11, TINTA_FRACA, "end"))
    corpo.append(texto((70 + LARGURA - 40) / 2, 416, "latência (ms, escala log)", 12, TINTA_FRACA, "middle"))
    for resolvedor in COR:
        valores = sorted(l["latencia_ms"] for l in e1 if l["resolvedor"] == resolvedor)
        n = len(valores)
        pontos = [f"{x(valores[0]):.1f},{y(0):.1f}"]
        for i, v in enumerate(valores):
            pontos.append(f"{x(v):.1f},{y(i / n):.1f}")
            pontos.append(f"{x(v):.1f},{y((i + 1) / n):.1f}")
        med, p95 = est.mediana(valores), est.percentil(valores, 95)
        corpo.append(f'<polyline points="{" ".join(pontos)}" fill="none" '
                     f'stroke="{COR[resolvedor]}" stroke-width="2" stroke-linejoin="round">'
                     f"<title>{esc(NOME[resolvedor])}: n = {n}, mediana {num(med)} ms, "
                     f"p95 {num(p95)} ms</title></polyline>")
        corpo.append(f'<circle cx="{x(med):.1f}" cy="{y(0.5):.1f}" r="4.5" '
                     f'fill="{COR[resolvedor]}" stroke="#fff" stroke-width="2"/>')
    # rotulos diretos na mediana, cada um na regiao vazia ao lado da sua curva
    meds = {r: est.mediana([l["latencia_ms"] for l in e1 if l["resolvedor"] == r]) for r in COR}
    posicoes = {"padrao": (8, 20, "start"), "1.1.1.1": (-10, -10, "end"),
                "8.8.8.8": (10, 20, "start")}
    for r, m in meds.items():
        dx, dy, ancora = posicoes[r]
        corpo.append(texto(x(m) + dx, y(0.5) + dy, f"{NOME[r].split(' ')[0]}: {num(m)} ms",
                           12, TINTA, ancora, "600"))
    return documento(
        430, "G1 — Distribuição da latência no E-1 (Do53, C3)",
        "Fração das consultas respondidas até cada tempo. Ponto = mediana. 300 consultas por resolvedor, rede-c.",
        corpo)


# ------------------------------------------------------------- G2 por nome


def g2_por_nome(inf: dict) -> str:
    por_nome = inf["por_nome"]["8.8.8.8"]
    geral = inf["e1"]["8.8.8.8"]
    nomes = sorted(por_nome, key=lambda n: por_nome[n]["delta_ms"])
    topo, passo = 92, 22
    altura = topo + passo * (len(nomes) + 2) + 50
    lim = 25.0
    x = Escala(-lim, lim, 210, LARGURA - 60)
    corpo = []
    base_y = topo + passo * (len(nomes) + 1.5)
    for marca in range(-20, 21, 10):
        corpo.append(linha(x(marca), topo - 12, x(marca), base_y, GRADE))
        corpo.append(texto(x(marca), base_y + 16, num(marca, 0, marca != 0), 11, TINTA_FRACA, "middle"))
    corpo.append(linha(x(0), topo - 12, x(0), base_y, TINTA_FRACA, 1.2))
    corpo.append(texto(x(-lim / 2), topo - 18, "← 1.1.1.1 mais rápido", 11, TINTA_FRACA, "middle"))
    corpo.append(texto(x(lim / 2), topo - 18, "8.8.8.8 mais rápido →", 11, TINTA_FRACA, "middle"))
    corpo.append(texto((210 + LARGURA - 60) / 2, base_y + 34,
                       "Δ = 1.1.1.1 − 8.8.8.8 (ms); linha = intervalo interquartil das 20 rodadas",
                       12, TINTA_FRACA, "middle"))

    def clip(v):
        return max(-lim, min(lim, v))

    def marca(yy, centro, a, b, rotulo, cor, ponta_cheia=True, dica=""):
        out = [texto(200, yy + 4, rotulo, 12, TINTA, "end")]
        out.append(linha(x(clip(a)), yy, x(clip(b)), yy, cor, 2, 'stroke-linecap="round"'))
        for extremo in (a, b):
            if abs(extremo) > lim:  # seta: o intervalo continua fora do eixo
                s = 1 if extremo > 0 else -1
                xe = x(s * lim)
                out.append(f'<path d="M{xe:.1f},{yy} l{-6 * s},-4 v8 z" fill="{cor}"/>')
        xc = x(clip(centro))
        preench = cor if ponta_cheia else "#fff"
        out.append(f'<circle cx="{xc:.1f}" cy="{yy}" r="5" fill="{preench}" stroke="{cor}" '
                   f'stroke-width="2"><title>{esc(dica)}</title></circle>')
        if abs(centro) > lim:
            out.append(texto(xc - 10, yy - 8, f"{num(centro, 1, True)} ms", 11, TINTA, "end"))
        return out

    for i, n in enumerate(nomes):
        d = por_nome[n]
        yy = topo + passo * i
        corpo += marca(yy, d["delta_ms"], d["q1_ms"], d["q3_ms"], n, COR["1.1.1.1"],
                       dica=f"{n}: Δ {num(d['delta_ms'], 1, True)} ms, "
                            f"vitórias/derrotas do 1.1.1.1 {d['vitorias']}/{d['derrotas']}")
    yy = topo + passo * (len(nomes) + 0.6)
    corpo.append(linha(24, yy - passo / 2, LARGURA - 24, yy - passo / 2, GRADE))
    inf95, sup95 = geral["ic95"]
    corpo += marca(yy, geral["delta_ms"], inf95, sup95, "Agregado (IC 95%)", TINTA,
                   dica=f"Δ {num(geral['delta_ms'], 1, True)} ms, IC [{num(inf95, 1, True)}; "
                        f"{num(sup95, 1, True)}], p (Holm) {geral['p_holm']:.4f}".replace(".", ","))
    corpo.append(texto(max(x(sup95), x(0)) + 10, yy + 4,
                       f"{num(geral['delta_ms'], 1, True)} ms [{num(inf95, 1, True)}; {num(sup95, 1, True)}]",
                       12, TINTA, peso="600"))
    favor = sum(1 for d in por_nome.values() if d["delta_ms"] < 0)
    return documento(
        int(altura), "G2 — H-a nome a nome: 1.1.1.1 × 8.8.8.8 em Do53",
        f"O 1.1.1.1 é mais rápido em {favor} de {len(nomes)} domínios. Eixo cortado em ±25 ms; seta = o intervalo continua.",
        corpo)


# --------------------------------------------------------------- G3 E-2


def g3_protocolo(inf: dict) -> str:
    exp = inf["e2_exploratorio"]
    margem = 5.0
    linhas_g = [(r, p) for r in ("1.1.1.1", "8.8.8.8") for p in ("DoT", "DoH")]
    topo, passo = 112, 30
    corpo = []
    paineis = [("nova", "Conexão nova (inclui os handshakes)", Escala(0, 130, 150, 420), range(0, 121, 40)),
               ("reaproveitada", "Conexão reaproveitada", Escala(-8, 8, 490, LARGURA - 30), range(-5, 6, 5))]
    base_y = topo + passo * len(linhas_g) - 10
    for conexao, titulo, x, marcas in paineis:
        corpo.append(texto(x.r0, topo - 30, titulo, 12, TINTA, peso="600"))
        if conexao == "reaproveitada":
            corpo.append(f'<rect x="{x(-margem):.1f}" y="{topo - 16}" width="{x(margem) - x(-margem):.1f}" '
                         f'height="{base_y - topo + 16}" fill="{FAIXA}"/>')
            corpo.append(texto(x(0), base_y + 32, "faixa = margem da H-c2 (±5 ms)", 11, TINTA_FRACA, "middle"))
        for m in marcas:
            corpo.append(linha(x(m), topo - 16, x(m), base_y, GRADE))
            corpo.append(texto(x(m), base_y + 16, num(m, 0, m != 0), 11, TINTA_FRACA, "middle"))
        corpo.append(linha(x(0), topo - 16, x(0), base_y, TINTA_FRACA, 1.2))
        for i, (resolvedor, protocolo) in enumerate(linhas_g):
            r = exp[resolvedor][f"{protocolo} {conexao}"]
            yy = topo + passo * i
            a, b = r["ic95"]
            cor = COR[resolvedor]
            corpo.append(linha(x(a), yy, x(b), yy, cor, 2, 'stroke-linecap="round"'))
            corpo.append(
                f'<circle cx="{x(r["delta_ms"]):.1f}" cy="{yy}" r="5" fill="{cor}" stroke="#fff" '
                f'stroke-width="2"><title>{esc(resolvedor)} {protocolo} {conexao}: Δ '
                f'{num(r["delta_ms"], 1, True)} ms, IC [{num(a, 1, True)}; {num(b, 1, True)}]'
                f'</title></circle>')
            if conexao == "nova":
                corpo.append(texto(140, yy + 4, f"{resolvedor} {protocolo}", 12, TINTA, "end"))
                corpo.append(texto(x(b) + 8, yy + 4, f"{num(r['delta_ms'], 0, True)} ms", 11, TINTA))
    corpo.append(texto(LARGURA / 2, base_y + 52,
                       "Δ = protocolo cifrado − Do53 (ms), mesmo resolvedor e rodada. Linha = IC 95% com a rodada como unidade.",
                       12, TINTA_FRACA, "middle"))
    return documento(
        int(base_y + 70), "G3 — Custo do DoT e do DoH sobre o Do53 (E-2)",
        "Exploratório: a unidade pré-registrada (janela de 6 h) só tem 1 valor; aqui a unidade é a rodada (60).",
        corpo)


# ------------------------------------------------------------ G4 serie


def g4_serie(linhas: list[dict]) -> str:
    e1 = [l for l in linhas if l["experimento"] == "E-1" and l["sucesso"]]
    por_rodada: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for l in e1:
        por_rodada[l["rodada_id"]][l["resolvedor"]].append(l["latencia_ms"])
    rodadas = sorted(por_rodada)
    t0 = datetime.strptime(rodadas[0], "%Y%m%dT%H%M%SZ")
    minutos = [(datetime.strptime(r, "%Y%m%dT%H%M%SZ") - t0).total_seconds() / 60 for r in rodadas]
    x = Escala(0, max(minutos), 70, LARGURA - 150)
    y = Escala(0, 40, 360, 80)
    corpo = []
    for v in range(0, 41, 10):
        corpo.append(linha(70, y(v), LARGURA - 150, y(v), GRADE))
        corpo.append(texto(62, y(v) + 4, num(v, 0), 11, TINTA_FRACA, "end"))
    for m in range(0, int(max(minutos)) + 1, 2):
        corpo.append(texto(x(m), 378, f"{m} min", 11, TINTA_FRACA, "middle"))
    corpo.append(texto(24, 70, "mediana da rodada (ms)", 11, TINTA_FRACA))
    finais = []
    for resolvedor in COR:
        meds = [est.mediana(por_rodada[r][resolvedor]) for r in rodadas]
        pts = " ".join(f"{x(m):.1f},{y(min(v, 40)):.1f}" for m, v in zip(minutos, meds))
        corpo.append(f'<polyline points="{pts}" fill="none" stroke="{COR[resolvedor]}" '
                     f'stroke-width="2" stroke-linejoin="round"/>')
        for m, v, r in zip(minutos, meds, rodadas):  # alvo de dica maior que a marca
            corpo.append(f'<circle cx="{x(m):.1f}" cy="{y(min(v, 40)):.1f}" r="6" fill="transparent">'
                         f"<title>{esc(NOME[resolvedor])}, rodada {r}: mediana {num(v)} ms</title></circle>")
        finais.append((y(min(meds[-1], 40)), resolvedor, est.mediana(meds)))
    finais.sort()
    ultimo = -100.0
    for yy, resolvedor, med in finais:
        yy = max(yy, ultimo + 16)
        ultimo = yy
        corpo.append(texto(LARGURA - 142, yy + 4, f"{NOME[resolvedor]}", 12, TINTA, peso="600"))
    return documento(
        400, "G4 — Mediana da latência por rodada (E-1, Do53, C3)",
        "60 rodadas a cada 10 s em 24/11/2026, 5 domínios por rodada. Substitui o boxplot por faixa horária (só 10 min de coleta).",
        corpo)


# --------------------------------------------------------- G5 sensibilidade


def g5_sensibilidade(inf: dict) -> str:
    cenarios = [c for c in inf["sensibilidade"] if c["resultados"]]
    topo, passo = 100, 30
    x = Escala(-8, 4, 300, LARGURA - 140)
    base_y = topo + passo * len(cenarios) - 10
    corpo = []
    for m in range(-8, 5, 2):
        corpo.append(linha(x(m), topo - 16, x(m), base_y, GRADE))
        corpo.append(texto(x(m), base_y + 16, num(m, 0, m != 0), 11, TINTA_FRACA, "middle"))
    corpo.append(linha(x(0), topo - 16, x(0), base_y, TINTA_FRACA, 1.2))
    for i, c in enumerate(cenarios):
        r = c["resultados"]["8.8.8.8"]
        yy = topo + passo * i
        a, b = r["ic95"]
        sustentada = r["p_holm"] < 0.05 and r["delta_ms"] < 0
        cor = COR["1.1.1.1"]
        corpo.append(texto(290, yy + 4, f"{c['id']} — {c['nome']}", 12, TINTA, "end"))
        corpo.append(linha(x(a), yy, x(b), yy, cor, 2, 'stroke-linecap="round"'))
        corpo.append(f'<circle cx="{x(r["delta_ms"]):.1f}" cy="{yy}" r="5" '
                     f'fill="{cor if sustentada else "#fff"}" stroke="{cor}" stroke-width="2">'
                     f"<title>{esc(c['nome'])}: Δ {num(r['delta_ms'], 1, True)} ms, "
                     f"p (Holm) {num(r['p_holm'], 4)}</title></circle>")
        corpo.append(texto(x.r1 + 12, yy + 4,
                           "sustentada" if sustentada else "não sustentada", 11,
                           TINTA if sustentada else TINTA_FRACA, peso="600" if sustentada else "normal"))
    corpo.append(texto((300 + LARGURA - 140) / 2, base_y + 34,
                       "Δ = 1.1.1.1 − 8.8.8.8 (ms), IC 95% por bootstrap de nomes. Ponto cheio = H-a sustentada (R1).",
                       12, TINTA_FRACA, "middle"))
    return documento(
        int(base_y + 50), "G5 — A H-a resiste às análises de sensibilidade?",
        "Some quando se desconta o RTT (S2) e quando se tiram as consultas autoaquecidas (S1).",
        corpo)


# ------------------------------------------------------------------ main


def gerar(linhas: list[dict], inf: dict) -> dict[str, str]:
    return {
        "g1_ecdf.svg": g1_ecdf(linhas),
        "g2_h-a_por_nome.svg": g2_por_nome(inf),
        "g3_custo_protocolo.svg": g3_protocolo(inf),
        "g4_serie_rodadas.svg": g4_serie(linhas),
        "g5_sensibilidade.svg": g5_sensibilidade(inf),
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Graficos da Sprint 02 do Lab05.")
    p.add_argument("--base", type=Path, default=BASE)
    p.add_argument("--lote", default=LOTE)
    p.add_argument("--inferencia", type=Path, default=RESULTADOS / "inferencia.json")
    p.add_argument("--saida", type=Path, default=RESULTADOS / "graficos")
    a = p.parse_args()
    linhas = ana.carregar(a.base, a.lote)
    inf = json.loads(a.inferencia.read_text(encoding="utf-8"))
    a.saida.mkdir(parents=True, exist_ok=True)
    for nome, svg in gerar(linhas, inf).items():
        (a.saida / nome).write_text(svg, encoding="utf-8")
        print(f"gerado: {a.saida / nome}")


if __name__ == "__main__":
    main()
