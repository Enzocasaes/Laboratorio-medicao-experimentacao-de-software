"""Confere o kappa de Fleiss do pipeline com o statsmodels (secao 6 do enunciado).

Opcional: o pipeline e' em Node e nao depende de Python. Este script existe
para que qualquer pessoa (inclusive o grupo replicador) refaca a conta com a
biblioteca que o enunciado indica, a partir dos mesmos arquivos:

    pip install statsmodels
    python scripts/conferir_kappa.py            # dentro de Lab3/Sprint01
    python scripts/conferir_kappa.py --dados outro/data

Le processed/consenso.csv (um rotulo por avaliador, ja normalizado) e
processed/concordancia_kappa.csv (o que o pipeline calculou), aplica a mesma
regra de casos completos e compara `aggregate_raters` + `fleiss_kappa`.
Sai com codigo 1 se alguma dimensao divergir.
"""

import argparse
import csv
import math
import sys
from pathlib import Path

import numpy as np
from statsmodels.stats.inter_rater import aggregate_raters, fleiss_kappa


def ler(caminho):
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        return list(csv.DictReader(arquivo))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dados", default="data", help="pasta de saida do pipeline (padrao: data)")
    parser.add_argument("--tolerancia", type=float, default=1e-3, help="diferenca aceita (o CSV tem 4 casas)")
    args = parser.parse_args(argv)

    processados = Path(args.dados) / "processed"
    consenso = ler(processados / "consenso.csv")
    calculado = {linha["dimensao"]: linha for linha in ler(processados / "concordancia_kappa.csv")}
    colunas = [c for c in (consenso[0].keys() if consenso else []) if c.startswith("rotulo_") and c != "rotulo_consenso"]

    divergencias = 0
    for dimensao, linha in calculado.items():
        categorias = linha["categorias"].split("|")
        unidades = [l for l in consenso if l["dimensao"] == dimensao]
        completas = [[categorias.index(l[c]) for c in colunas] for l in unidades if all(l[c] in categorias for c in colunas)]
        if completas:
            tabela, _ = aggregate_raters(np.array(completas), n_cat=len(categorias))
            referencia = float(fleiss_kappa(tabela, method="fleiss"))
        else:
            referencia = float("nan")
        pipeline = float(linha["kappa_fleiss"]) if linha["kappa_fleiss"] != "" else float("nan")
        iguais = (math.isnan(referencia) and math.isnan(pipeline)) or abs(referencia - pipeline) <= args.tolerancia
        n_ok = len(completas) == int(linha["unidades_validas"])
        divergencias += 0 if (iguais and n_ok) else 1
        print(
            f"{dimensao}: statsmodels={referencia:.4f} pipeline={pipeline:.4f} "
            f"unidades={len(completas)}/{linha['unidades_validas']} -> {'OK' if iguais and n_ok else 'DIVERGE'}"
        )
    return 1 if divergencias else 0


if __name__ == "__main__":
    sys.exit(main())
