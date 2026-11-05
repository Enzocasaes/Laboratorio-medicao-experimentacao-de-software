"""Confere os dois testes contra o SciPy (Lab04) — opcional.

O Lab04 não depende do SciPy: `src/` usa só a biblioteca padrão. Mas uma
implementação própria de p-valor merece uma conferência independente, e o
SciPy é a referência óbvia.

Estes testes **se pulam sozinhos** quando o SciPy não está instalado, então a
suíte continua passando numa máquina limpa e na CI. Para rodá-los de verdade:

    python3 -m venv .venv && .venv/bin/pip install scipy
    .venv/bin/python -m unittest discover -s tests

Comparamos com:

    scipy.stats.ttest_rel(sem, com, alternative="greater")
    scipy.stats.wilcoxon(sem, com, alternative="greater")   # zero_method="wilcox"

passando os tempos originais (e não as diferenças), que é como o cenário
experimental descreve a chamada na seção 3.2.
"""

from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from testes import carregar_diferencas, teste_t_pareado, wilcoxon_pareado  # noqa: E402

LAB4_DIR = Path(__file__).resolve().parent.parent

try:
    from scipy import stats  # type: ignore
    TEM_SCIPY = True
except ImportError:  # pragma: no cover - depende do ambiente
    TEM_SCIPY = False

motivo = "SciPy não instalado (conferência opcional; veja o docstring)"


def pares_a_partir_de(diferencas: list[float]) -> tuple[list[float], list[float]]:
    """Reconstrói um par (sem, com) com a diferença pedida.

    O SciPy recebe as duas amostras; a nossa implementação recebe as
    diferenças. Fixar `com` em zero mantém d = sem - com exatamente igual.
    """
    return list(diferencas), [0.0] * len(diferencas)


@unittest.skipUnless(TEM_SCIPY, motivo)
class TestContraScipy(unittest.TestCase):

    def conferir(self, diferencas: list[float], casas: int = 10) -> None:
        sem, com = pares_a_partir_de(diferencas)

        nosso_t = teste_t_pareado(diferencas)
        scipy_t = stats.ttest_rel(sem, com, alternative="greater")
        self.assertAlmostEqual(nosso_t.estatistica, float(scipy_t.statistic), places=casas)
        self.assertAlmostEqual(nosso_t.p_valor, float(scipy_t.pvalue), places=casas)

        nosso_w = wilcoxon_pareado(diferencas)
        scipy_w = stats.wilcoxon(sem, com, alternative="greater", zero_method="wilcox")
        self.assertAlmostEqual(nosso_w.estatistica, float(scipy_w.statistic), places=casas)
        self.assertAlmostEqual(nosso_w.p_valor, float(scipy_w.pvalue), places=casas)

    def test_dados_reais(self):
        self.conferir(carregar_diferencas(LAB4_DIR / "data" / "dados_reais.csv"))

    def test_amostras_aleatorias_normais(self):
        for semente in range(10):
            with self.subTest(semente=semente):
                rng = random.Random(semente)
                self.conferir([rng.gauss(0.2, 1.0) for _ in range(30)])

    def test_amostras_pequenas(self):
        """n pequeno é onde o p exato do Wilcoxon mais importa."""
        for n in (5, 8, 12):
            with self.subTest(n=n):
                rng = random.Random(100 + n)
                self.conferir([rng.gauss(0.5, 1.0) for _ in range(n)])

    def test_assimetrica(self):
        rng = random.Random(55)
        self.conferir([rng.lognormvariate(0.0, 0.6) - 1.0 for _ in range(30)])

    def test_sem_efeito(self):
        rng = random.Random(77)
        self.conferir([rng.gauss(0.0, 1.0) for _ in range(30)])

    def test_com_empates(self):
        """Com empates os dois caem na aproximação normal com correção.

        O SciPy usa `correction=False` por padrão; o nosso módulo sempre
        aplica a correção de continuidade, então aqui a comparação é feita
        com `correction=True` dos dois lados.
        """
        diferencas = [1.0, -1.0, 2.0, -2.0, 3.0, 3.0, -4.0, 5.0, 5.0, -6.0]
        sem, com = pares_a_partir_de(diferencas)
        nosso = wilcoxon_pareado(diferencas)
        self.assertEqual(nosso.metodo, "normal")
        deles = stats.wilcoxon(sem, com, alternative="greater", zero_method="wilcox",
                               correction=True, method="approx")
        self.assertAlmostEqual(nosso.estatistica, float(deles.statistic), places=10)
        self.assertAlmostEqual(nosso.p_valor, float(deles.pvalue), places=10)

    def test_hodges_lehmann_contra_mediana_de_walsh(self):
        """O SciPy não expõe Hodges-Lehmann; confere-se pela definição."""
        import itertools

        rng = random.Random(9)
        d = [rng.gauss(1.0, 2.0) for _ in range(15)]
        walsh = [(a + b) / 2 for i, a in enumerate(d) for b in d[i:]]
        import statistics as st
        self.assertAlmostEqual(wilcoxon_pareado(d).hodges_lehmann, st.median(walsh), places=12)
        self.assertEqual(len(walsh), 15 * 16 // 2)
        del itertools  # só para deixar claro que não foi usado


@unittest.skipIf(TEM_SCIPY, "SciPy presente: a conferência roda de verdade")
class TestAvisoSemScipy(unittest.TestCase):
    def test_suite_passa_sem_scipy(self):
        """Documenta que a ausência do SciPy é esperada, não um erro."""
        self.assertFalse(TEM_SCIPY)


if __name__ == "__main__":
    unittest.main()
