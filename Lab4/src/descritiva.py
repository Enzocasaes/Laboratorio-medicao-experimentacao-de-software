"""Estatísticas descritivas de data/dados_reais.csv (sem testes de hipótese).

Uso (a partir de Lab4/):

    python src/descritiva.py
    python src/descritiva.py --csv data/piloto/<sessao>/pares.csv
"""

from __future__ import annotations

import argparse
import csv
import statistics
from pathlib import Path

LAB4_DIR = Path(__file__).resolve().parent.parent


def carregar(caminho: Path) -> tuple[list[float], list[float]]:
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        linhas = list(csv.DictReader(arquivo))
    return ([float(l["tempo_sem_cache"]) for l in linhas],
            [float(l["tempo_com_cache"]) for l in linhas])


def assimetria(valores: list[float]) -> float:
    """Coeficiente de assimetria amostral ajustado (G1, o mesmo do Excel/pandas)."""
    n = len(valores)
    media = statistics.fmean(valores)
    s = statistics.stdev(valores)
    return n / ((n - 1) * (n - 2)) * sum(((v - media) / s) ** 3 for v in valores)


def extremos_iqr(valores: list[float]) -> tuple[float, float, list[float]]:
    """Valores fora de [Q1 - 1,5·IQR, Q3 + 1,5·IQR] (regra do boxplot)."""
    q1, _, q3 = statistics.quantiles(valores, n=4, method="inclusive")
    iqr = q3 - q1
    baixo, alto = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return baixo, alto, [v for v in valores if v < baixo or v > alto]


def resumir(nome: str, valores: list[float]) -> None:
    baixo, alto, fora = extremos_iqr(valores)
    print(f"\n{nome} (n={len(valores)})")
    print(f"  média         {statistics.fmean(valores):9.3f} s")
    print(f"  mediana       {statistics.median(valores):9.3f} s")
    print(f"  desvio-padrão {statistics.stdev(valores):9.3f} s")
    print(f"  mínimo        {min(valores):9.3f} s")
    print(f"  máximo        {max(valores):9.3f} s")
    print(f"  assimetria    {assimetria(valores):9.3f}")
    extremos = ", ".join(f"{v:.3f}" for v in sorted(fora)) or "nenhum"
    print(f"  cercas IQR    [{baixo:.3f}, {alto:.3f}]  extremos: {extremos}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=Path, default=LAB4_DIR / "data" / "dados_reais.csv")
    args = parser.parse_args()

    sem, com = carregar(args.csv)
    diferencas = [a - b for a, b in zip(sem, com)]
    print(f"Arquivo: {args.csv}")
    resumir("Sem cache (A)", sem)
    resumir("Com cache (B)", com)
    resumir("Diferenças d = sem - com", diferencas)
    positivas = sum(d > 0 for d in diferencas)
    print(f"\n  d > 0 em {positivas}/{len(diferencas)} pares")
    print(f"  redução média relativa: {statistics.fmean(diferencas) / statistics.fmean(sem):.1%}")


if __name__ == "__main__":
    main()
