"""Lab02 - Passo 6: Dashboard de visualizacao (Pandas + Matplotlib/Seaborn).

Le data/trials-com-metricas.csv (gerado pelo instrumental em Node - ver
../README.md) e gera graficos de barra (mediana + IQR) comparando com-ia x
sem-ia para as metricas de RQ1-RQ3, mais um gráfico pareado por kata (a
unidade de analise do Passo 4). Consolida os resultados dos integrantes que
ja tiverem trials em data/trials.csv - fica pronto para os tres (Enzo, Caue,
Leonardo) assim que a coleta fechar, sem precisar editar o script.

Uso:
    pip install -r requirements.txt
    python dashboard.py                      # le ../data, grava em ./graficos
    python dashboard.py --dados <dir> --saida <dir>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# console do Windows costuma abrir em cp1252/cp850 - forca UTF-8 pra acentos
# nao virarem mojibake no "python dashboard.py" direto no terminal.
if sys.stdout.encoding is not None and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

AQUI = Path(__file__).resolve().parent

# mesma paleta categorica validada (accessibility-checked) do dashboard HTML em
# ../src/dashboard.js - com-ia = azul (slot 1), sem-ia = laranja (slot 2).
COR_COM_IA = "#2a78d6"
COR_SEM_IA = "#eb6834"
COR_PENDENTE = "#898781"
PALETA = {"com-ia": COR_COM_IA, "sem-ia": COR_SEM_IA}
ORDEM_TRATAMENTOS = ["com-ia", "sem-ia"]

PARTICIPANTES_ESPERADOS = ["caue", "enzo", "leo"]

# (coluna, RQ, titulo, unidade p/ eixo, direcao esperada, e' percentual?)
METRICAS = [
    ("duracao_segundos", "RQ1", "Tempo até verde (time-to-green)", "segundos", "menor é melhor", False),
    ("taxa_sucesso", "RQ2", "Taxa de sucesso dos testes de aceitação", "%", "maior é melhor", True),
    ("complexidade_ciclomatica_media", "RQ3a", "Complexidade ciclomática média / função (McCabe)", "", "sem direção esperada", False),
    ("duplicacao_percentual", "RQ3b", "Duplicação de código", "%", "sem direção esperada", False),
    ("loc", "RQ3 (controle)", "LOC (linhas de código)", "linhas", "sem direção esperada", False),
    ("indice_manutenibilidade", "RQ3 (exploratório)", "Índice de Manutenibilidade (MI)", "", "maior é melhor", False),
]


def carregar_dados(dir_dados: Path) -> pd.DataFrame:
    caminho = dir_dados / "trials-com-metricas.csv"
    if not caminho.exists():
        raise FileNotFoundError(
            f"nao encontrei {caminho} - rode, no Sprint01: "
            "'npm run metricas -- --juntar' antes de gerar o dashboard."
        )
    df = pd.read_csv(caminho)
    df["tratamento"] = pd.Categorical(df["tratamento"], categories=ORDEM_TRATAMENTOS, ordered=True)
    return df


def formatar_segundos(total: float) -> str:
    total = round(total)
    minutos, segundos = divmod(total, 60)
    return f"{minutos}:{segundos:02d}"


def formatar_valor(campo: str, valor: float) -> str:
    """Formata um valor CRU (como vem do CSV) para exibicao. Centraliza a
    escala de cada metrica aqui (ex.: taxa_sucesso e fracao 0-1 no CSV, vira
    '%' multiplicando por 100) para nao ter dois lugares fazendo a mesma conta
    e divergindo (foi exatamente esse tipo de bug, com valor bruto formatado
    como se ja estivesse em %, que apareceu na 1a versao)."""
    if campo == "duracao_segundos":
        return formatar_segundos(valor)
    if campo == "taxa_sucesso":
        return f"{valor * 100:.0f}%"
    if campo == "duplicacao_percentual":
        return f"{valor:.1f}%"
    if campo == "loc":
        return f"{valor:.0f}"
    return f"{valor:.2f}"


def resumo_por_tratamento(df: pd.DataFrame, campo: str) -> pd.DataFrame:
    grupo = df.dropna(subset=[campo]).groupby("tratamento", observed=True)[campo]
    resumo = grupo.agg(mediana="median", q1=lambda s: s.quantile(0.25), q3=lambda s: s.quantile(0.75), n="count")
    return resumo.reindex(ORDEM_TRATAMENTOS)


def grafico_metrica(df: pd.DataFrame, campo: str, rq: str, titulo: str, unidade: str, direcao: str, percentual: bool, ax: plt.Axes | None = None) -> plt.Axes:
    """Desenha o grafico de barras (mediana + IQR) no eixo dado - ou cria um
    novo, se `ax` nao for passado. Usado tanto para o PNG avulso de cada
    metrica quanto para a grade combinada (grafico_resumo), sem duplicar
    logica de desenho entre os dois."""
    resumo = resumo_por_tratamento(df, campo)
    escala = 100 if percentual else 1

    if ax is None:
        _, ax = plt.subplots(figsize=(4.6, 4.2))
    tratamentos = [t for t in ORDEM_TRATAMENTOS if resumo.loc[t, "n"] > 0]
    valores = [resumo.loc[t, "mediana"] * escala for t in tratamentos]
    cores = [PALETA[t] for t in tratamentos]

    barras = ax.bar(tratamentos, valores, color=cores, width=0.5, zorder=3)

    erro_baixo = [max(0.0, (resumo.loc[t, "mediana"] - resumo.loc[t, "q1"]) * escala) for t in tratamentos]
    erro_alto = [max(0.0, (resumo.loc[t, "q3"] - resumo.loc[t, "mediana"]) * escala) for t in tratamentos]
    ax.errorbar(
        tratamentos, valores, yerr=[erro_baixo, erro_alto],
        fmt="none", ecolor="white", elinewidth=2.2, capsize=7, capthick=2.2, zorder=4,
    )

    topo = max(valores) if valores else 1
    for barra, t in zip(barras, tratamentos):
        v = resumo.loc[t, "mediana"]
        ax.text(
            barra.get_x() + barra.get_width() / 2, barra.get_height() + topo * 0.04,
            formatar_valor(campo, v), ha="center", va="bottom", fontsize=10.5, fontweight="bold", zorder=5,
        )

    ns = ", ".join(f"{t} n={int(resumo.loc[t, 'n'])}" for t in tratamentos)
    ax.set_title(f"{titulo}  ·  {rq}", fontsize=10.5, loc="left", pad=8)
    ax.set_ylabel(unidade)
    ax.set_xlabel("")
    ax.set_ylim(bottom=0, top=topo * 1.3 if topo > 0 else 1)
    # legenda dentro da area do eixo (nao acima, em y>1) - texto fora do
    # bounding box da axes nao entra na conta do tight_layout()/fig.suptitle
    # e pode colidir com o titulo ou a linha de cima da grade combinada.
    ax.text(0.05, 0.97, f"{direcao} · {ns}", transform=ax.transAxes,
             fontsize=7.5, color="0.45", style="italic", va="top")
    if campo == "duracao_segundos":
        ax.yaxis.set_major_formatter(lambda v, _: formatar_segundos(v))

    sns.despine(ax=ax, left=True, bottom=True)
    ax.xaxis.grid(False)
    ax.yaxis.grid(True, color="0.88", linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)
    ax.figure.tight_layout()
    return ax


def grafico_resumo(df: pd.DataFrame) -> plt.Figure:
    fig, eixos = plt.subplots(2, 3, figsize=(15, 9))
    for eixo, (campo, rq, titulo, unidade, direcao, percentual) in zip(eixos.flat, METRICAS):
        grafico_metrica(df, campo, rq, titulo, unidade, direcao, percentual, ax=eixo)
    fig.suptitle("Lab02 — IA vs. codificação manual: comparação por tratamento (RQ1–RQ3)", fontsize=13, y=0.995)
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    return fig


def grafico_pareado_por_kata(df: pd.DataFrame, campo: str = "duracao_segundos") -> plt.Figure:
    pivot = (
        df.dropna(subset=[campo])
        .groupby(["kata", "tratamento"], observed=True)[campo]
        .median()
        .unstack("tratamento")
        .reindex(columns=ORDEM_TRATAMENTOS)
        .sort_index()
    )

    katas = list(pivot.index)
    colunas = 3
    linhas = -(-len(katas) // colunas)  # ceil
    fig, eixos = plt.subplots(linhas, colunas, figsize=(4.2 * colunas, 3.4 * linhas))
    eixos = eixos.flat if len(katas) > 1 else [eixos]

    for eixo, kata in zip(eixos, katas):
        valores = pivot.loc[kata]

        # posicoes numericas fixas (0=com-ia, 1=sem-ia) - garante que os dois
        # rotulos do eixo x sempre aparecem, mesmo quando falta um tratamento
        # (bar() com apenas 1 categoria nao registraria a posicao da outra).
        for x, t in enumerate(ORDEM_TRATAMENTOS):
            v = valores[t]
            if pd.isna(v):
                eixo.plot([x - 0.25, x + 0.25], [0, 0], color=COR_PENDENTE, linestyle="--", linewidth=2, solid_capstyle="round")
                eixo.text(x, 0.03, "pendente", ha="center", va="bottom",
                           fontsize=8, color=COR_PENDENTE, style="italic",
                           transform=eixo.get_xaxis_transform())
            else:
                barra = eixo.bar([x], [v], color=PALETA[t], width=0.5, zorder=3)[0]
                eixo.text(x, barra.get_height() * 1.04, formatar_segundos(v),
                           ha="center", fontsize=9.5, fontweight="bold", zorder=5)

        eixo.set_xticks(range(len(ORDEM_TRATAMENTOS)))
        eixo.set_xticklabels(ORDEM_TRATAMENTOS)
        eixo.set_xlim(-0.6, len(ORDEM_TRATAMENTOS) - 0.4)
        eixo.set_title(kata, fontsize=10.5, fontweight="bold")
        eixo.yaxis.set_major_formatter(lambda v, _: formatar_segundos(v))
        eixo.set_ylim(bottom=0, top=eixo.get_ylim()[1] * 1.18)
        sns.despine(ax=eixo, left=True, bottom=True)
        eixo.xaxis.grid(False)
        eixo.yaxis.grid(True, color="0.88", linewidth=0.8, zorder=0)
        eixo.set_axisbelow(True)

    for eixo_sobrando in list(eixos)[len(katas):]:
        eixo_sobrando.axis("off")

    fig.suptitle("Tempo até verde por kata, pareado com-ia × sem-ia (unidade de análise do Passo 4)", fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    return fig


def resumo_console(df: pd.DataFrame) -> None:
    participantes = sorted(df["participante"].unique())
    faltando = [p for p in PARTICIPANTES_ESPERADOS if p not in participantes]
    print(f"trials carregados: {len(df)} | participantes: {', '.join(participantes)}")
    if faltando:
        print(f"AVISO: dados parciais - falta(m): {', '.join(faltando)}. "
              "Os graficos sao descritivos; a leitura inferencial (Wilcoxon) fica com 'npm run analise'.")
    print()
    for campo, rq, titulo, unidade, _direcao, _percentual in METRICAS:
        resumo = resumo_por_tratamento(df, campo)
        linha = f"  {rq:<16} {titulo}"
        print(linha)
        for t in ORDEM_TRATAMENTOS:
            n = int(resumo.loc[t, "n"])
            if n == 0:
                print(f"    {t:<8} sem dados")
                continue
            mediana = formatar_valor(campo, resumo.loc[t, "mediana"])
            q1 = formatar_valor(campo, resumo.loc[t, "q1"])
            q3 = formatar_valor(campo, resumo.loc[t, "q3"])
            print(f"    {t:<8} n={n}  mediana={mediana}  IQR={q1}..{q3}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Dashboard de visualizacao do Lab02 (Passo 6) - Pandas + Matplotlib/Seaborn.")
    parser.add_argument("--dados", type=Path, default=AQUI / ".." / "data", help="pasta com trials-com-metricas.csv (padrao: ../data)")
    parser.add_argument("--saida", type=Path, default=AQUI / "graficos", help="pasta onde gravar os PNGs (padrao: ./graficos)")
    args = parser.parse_args()

    sns.set_theme(style="whitegrid", font="sans-serif", rc={"axes.edgecolor": "0.85"})

    df = carregar_dados(args.dados.resolve())
    resumo_console(df)

    args.saida.mkdir(parents=True, exist_ok=True)

    for campo, rq, titulo, unidade, direcao, percentual in METRICAS:
        ax = grafico_metrica(df, campo, rq, titulo, unidade, direcao, percentual)
        caminho = args.saida / f"metrica_{campo}.png"
        ax.figure.savefig(caminho, dpi=160)
        plt.close(ax.figure)
        print(f"gravado: {caminho}")

    fig_resumo = grafico_resumo(df)
    caminho_resumo = args.saida / "dashboard_resumo.png"
    fig_resumo.savefig(caminho_resumo, dpi=160)
    plt.close(fig_resumo)
    print(f"gravado: {caminho_resumo}")

    fig_pareado = grafico_pareado_por_kata(df)
    caminho_pareado = args.saida / "tempo_por_kata.png"
    fig_pareado.savefig(caminho_pareado, dpi=160)
    plt.close(fig_pareado)
    print(f"gravado: {caminho_pareado}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
