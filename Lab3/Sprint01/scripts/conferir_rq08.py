"""Confere a RQ 08 (rework rate) do pipeline com o scipy e o statsmodels.

Opcional: o pipeline e' em Node e implementa os testes sem dependencias
(src/analise/estatistica.js). Este script refaz as contas, de forma
independente, com as bibliotecas de referencia, a partir do mesmo CSV:

    pip install scipy statsmodels
    npm run analise:rq08
    python scripts/conferir_rq08.py            # dentro de Lab3/Sprint01
    python scripts/conferir_rq08.py --dados outro/data

Le processed/dataset.csv, recalcula os 4 Spearman do rework rate, aplica Holm
e o Kruskal-Wallis entre os quartis de frequencia e compara com
analise_rq08.csv e analise_rq08_quartis.csv.
Sai com codigo 1 se algum valor divergir.
"""

import argparse
import csv
import math
import sys
from pathlib import Path

import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests

QUARTIS = ["Q1", "Q2", "Q3", "Q4"]
PARES = [
    ("rework_x_cfr_entrega", "change_failure_rate_delivery"),
    ("rework_x_cfr_ci", "change_failure_rate_ci"),
    ("rework_x_frequencia", "deployment_frequency_per_week"),
    ("rework_x_recuperacao", "recovery_median_hours"),
]


def ler(caminho):
    with open(caminho, newline="", encoding="utf-8-sig") as arquivo:
        return list(csv.DictReader(arquivo))


def num(valor):
    if valor is None or str(valor).strip() == "":
        return None
    v = float(valor)
    return v if math.isfinite(v) else None


def correlacoes(repos):
    resultado = {}
    for ident, coluna in PARES:
        xy = [(num(r["rework_rate"]), num(r[coluna])) for r in repos]
        xy = [(x, y) for x, y in xy if x is not None and y is not None]
        x, y = zip(*xy)
        rho, p = stats.spearmanr(x, y)
        resultado[ident] = {"n": len(xy), "rho": rho, "p": p}
    ajustados = multipletests([r["p"] for r in resultado.values()], method="holm")[1]
    for ident, ajustado in zip(resultado, ajustados):
        resultado[ident]["p_holm"] = ajustado
    return resultado


def quartis(repos):
    freq = [num(r["deployment_frequency_per_week"]) for r in repos]
    cortes = np.percentile([f for f in freq if f is not None], [25, 50, 75])  # linear, como no pipeline

    def quartil(v):
        if v is None:
            return None
        for rotulo, corte in zip(QUARTIS, cortes):
            if v <= corte:
                return rotulo
        return "Q4"

    grupos = {q: [] for q in QUARTIS}
    for r, f in zip(repos, freq):
        q = quartil(f)
        if q is not None:
            grupos[q].append(r)
    linhas = {}
    for q, membros in grupos.items():
        rework = [num(r["rework_rate"]) for r in membros if num(r["rework_rate"]) is not None]
        linhas[q] = {
            "n": len(membros),
            "rework_n": len(rework),
            "rework_mediana": float(np.median(rework)) if rework else None,
            "rework_q1": float(np.percentile(rework, 25)) if rework else None,
            "rework_q3": float(np.percentile(rework, 75)) if rework else None,
        }
    listas = [[num(r["rework_rate"]) for r in g if num(r["rework_rate"]) is not None] for g in grupos.values()]
    h, p = stats.kruskal(*[l for l in listas if l])
    return linhas, {"h": h, "p": p}


def proximo(esperado, obtido, tolerancia):
    if esperado is None or obtido is None:
        return esperado is None and obtido is None
    # p-valores minusculos: compara em escala relativa (o CSV tem 4 significativos).
    return abs(esperado - obtido) <= tolerancia or abs(esperado - obtido) <= 1e-3 * abs(esperado)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dados", default="data", help="pasta de saida do pipeline (padrao: data)")
    parser.add_argument("--tolerancia", type=float, default=1e-3, help="diferenca aceita (o CSV tem 4 casas)")
    args = parser.parse_args(argv)
    processados = Path(args.dados) / "processed"
    repos = ler(processados / "dataset.csv")

    divergencias = []
    conferidos = 0

    def conferir(onde, campo, esperado, obtido):
        nonlocal conferidos
        conferidos += 1
        if not proximo(esperado, obtido, args.tolerancia):
            divergencias.append(f"{onde} {campo}: scipy={esperado} pipeline={obtido}")

    calculado = correlacoes(repos)
    linhas = ler(processados / "analise_rq08.csv")
    if len(linhas) != len(calculado):
        divergencias.append(f"pares da RQ 08: scipy={len(calculado)} pipeline={len(linhas)}")
    for linha in linhas:
        ref = calculado[linha["id"]]
        conferir(linha["id"], "n", ref["n"], num(linha["n"]))
        for campo in ("rho", "p", "p_holm"):
            conferir(linha["id"], campo, ref[campo], num(linha[campo]))

    por_quartil, kw = quartis(repos)
    for linha in ler(processados / "analise_rq08_quartis.csv"):
        ref = por_quartil[linha["quartil"]]
        for campo in ("n", "rework_n", "rework_mediana", "rework_q1", "rework_q3"):
            conferir(linha["quartil"], campo, ref[campo], num(linha[campo]))

    print(f"Kruskal-Wallis entre quartis (scipy): H = {kw['h']:.4f}, p = {kw['p']:.4g}")
    if divergencias:
        print(f"{len(divergencias)} divergencia(s) em {conferidos} valores conferidos:")
        for d in divergencias:
            print(f"  - {d}")
        return 1
    print(f"OK: {conferidos} valores conferidos com o scipy/statsmodels, nenhuma divergencia "
          f"(tolerancia {args.tolerancia}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
