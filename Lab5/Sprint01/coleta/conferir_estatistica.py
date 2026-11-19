"""Confere `estatistica.py` contra o SciPy (Lab05, Participante C).

POR QUE EXISTE. A analise do Lab05 nao usa SciPy nem pandas, para qualquer
integrante conseguir refazer os numeros sem montar ambiente. Isso so' e'
defensavel se os numeros estiverem certos — e "esta' certo" nao e' opiniao, e'
comparacao com uma implementacao independente.

O SciPy **nao** e' dependencia do projeto. Este script existe para ser rodado
uma vez, por quem quiser conferir, e se pula sozinho se o SciPy nao estiver
instalado.

Uso (a partir de Lab5/):

    .venv/bin/pip install scipy
    .venv/bin/python Sprint01/coleta/conferir_estatistica.py
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import estatistica as est  # noqa: E402

TOLERANCIA = 1e-9

try:
    from scipy import stats
except ImportError:
    print("SciPy nao instalado: nada a conferir (isto nao e' erro).")
    print("Para conferir:  .venv/bin/pip install scipy")
    raise SystemExit(0)


def _linha(rotulo: str, meu: float, referencia: float,
           fonte: str = "scipy") -> bool:
    """`fonte` diz de onde vem o numero de referencia.

    O Holm e' conferido contra valores calculados a mao, nao contra o SciPy:
    chamar aquilo de "scipy" na tela seria uma afirmacao falsa.
    """
    bate = abs(meu - referencia) < TOLERANCIA
    print(f"  {'ok  ' if bate else 'FALHA'} {rotulo:<44} "
          f"meu {meu:.10f}  {fonte} {referencia:.10f}")
    return bate


def conferir() -> bool:
    tudo_bate = True
    sorteio = random.Random(7)

    print("qui-quadrado (cauda superior) — valores de tabela a 5%")
    for x, gl in ((3.841, 1), (5.991, 2), (7.815, 3), (9.488, 4), (11.070, 5)):
        tudo_bate &= _linha(f"gl={gl}, x={x}",
                            est.qui2_sobrevivencia(x, gl), stats.chi2.sf(x, gl))

    print("\nWilcoxon pareado bilateral")
    casos = [
        [1.0, 2.0, 3.0, 4.0, 5.0],                      # exato, todos positivos
        [-1.0, 2.0, -3.0, 4.0, 5.0, 6.0, 7.0],          # exato, sinais mistos
        [0.5, -1.0, 2.0, -3.0, 4.0],                    # exato, pequeno
        [sorteio.gauss(2, 3) for _ in range(12)],       # exato, n medio
        [sorteio.gauss(0, 1) for _ in range(30)],       # normal (n > 25)
    ]
    for diferencas in casos:
        meu = est.wilcoxon_pareado(diferencas)
        modo = "exact" if meu.metodo == "exato" else "approx"
        referencia = stats.wilcoxon(diferencas, zero_method="wilcox",
                                    correction=(modo == "approx"), method=modo)
        tudo_bate &= _linha(f"n={len(diferencas)}, metodo={meu.metodo}",
                            meu.p_valor, float(referencia.pvalue))

    print("\nFriedman")
    conjuntos = [
        [{"a": 1, "b": 2, "c": 3}, {"a": 2, "b": 3, "c": 1},
         {"a": 1, "b": 3, "c": 2}, {"a": 1, "b": 2, "c": 3},
         {"a": 2, "b": 1, "c": 3}, {"a": 1, "b": 2, "c": 3}],
        [{"a": sorteio.gauss(0, 1), "b": sorteio.gauss(0.5, 1),
          "c": sorteio.gauss(1, 1)} for _ in range(20)],
    ]
    for blocos in conjuntos:
        meu = est.friedman(blocos)
        colunas = [[b[t] for b in blocos] for t in sorted(blocos[0])]
        referencia = stats.friedmanchisquare(*colunas)
        tudo_bate &= _linha(f"n={meu.n}, Q", meu.estatistica,
                            float(referencia.statistic))
        tudo_bate &= _linha(f"n={meu.n}, p", meu.p_valor, float(referencia.pvalue))

    print("\nHolm — caso montado a mao (o empate forca a monotonicidade)")
    brutos = {"a": 0.01, "b": 0.04, "c": 0.03, "d": 0.005}
    esperado = {"d": 0.02, "a": 0.03, "c": 0.06, "b": 0.06}
    meu = est.holm(brutos)
    for chave in ("d", "a", "c", "b"):
        tudo_bate &= _linha(f"p_{chave} bruto={brutos[chave]}",
                            meu[chave], esperado[chave], fonte="a mao")

    print("\nIC de Wilson — contra a proporcao exata do SciPy")
    for sucessos, total in ((0, 60), (3, 100), (50, 100)):
        meu_inf, meu_sup = est.wilson(sucessos, total)
        ref = stats.binomtest(sucessos, total).proportion_ci(method="wilson")
        tudo_bate &= _linha(f"{sucessos}/{total} inferior", meu_inf, float(ref.low))
        tudo_bate &= _linha(f"{sucessos}/{total} superior", meu_sup, float(ref.high))

    return tudo_bate


if __name__ == "__main__":
    print(f"conferindo estatistica.py contra o SciPy {stats.__name__} "
          f"(tolerancia {TOLERANCIA})\n")
    if conferir():
        print("\nTudo bate.")
    else:
        print("\nHa divergencia acima.")
        raise SystemExit(1)
