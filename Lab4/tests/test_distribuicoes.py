"""Confere as distribuições contra valores de tabela (Lab04).

Os p-valores de todo o laboratório saem daqui, então estes testes comparam
com números que dá para olhar numa tabela de t de Student impressa.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from distribuicoes import (  # noqa: E402
    beta_incompleta_regularizada,
    distribuicao_wilcoxon,
    normal_cdf,
    t_cdf,
    t_quantil,
    t_sobrevivencia,
    wilcoxon_p_exato,
)


class TestNormal(unittest.TestCase):
    def test_valores_conhecidos(self):
        self.assertAlmostEqual(normal_cdf(0.0), 0.5, places=12)
        self.assertAlmostEqual(normal_cdf(1.96), 0.975, places=4)
        self.assertAlmostEqual(normal_cdf(-1.96), 0.025, places=4)
        self.assertAlmostEqual(normal_cdf(1.645), 0.95, places=4)

    def test_simetrica(self):
        for z in (0.3, 1.0, 2.5):
            self.assertAlmostEqual(normal_cdf(z) + normal_cdf(-z), 1.0, places=12)


class TestBetaIncompleta(unittest.TestCase):
    def test_bordas(self):
        self.assertEqual(beta_incompleta_regularizada(0.0, 2.0, 3.0), 0.0)
        self.assertEqual(beta_incompleta_regularizada(1.0, 2.0, 3.0), 1.0)

    def test_caso_fechado(self):
        """Com a = b = 1 a beta é uniforme: I_x(1,1) = x."""
        for x in (0.1, 0.5, 0.9):
            self.assertAlmostEqual(beta_incompleta_regularizada(x, 1.0, 1.0), x, places=12)

    def test_simetria(self):
        """I_x(a,b) = 1 - I_{1-x}(b,a)."""
        for x, a, b in ((0.3, 2.0, 5.0), (0.7, 4.5, 1.5)):
            self.assertAlmostEqual(
                beta_incompleta_regularizada(x, a, b),
                1.0 - beta_incompleta_regularizada(1.0 - x, b, a), places=12)

    def test_x_invalido(self):
        with self.assertRaises(ValueError):
            beta_incompleta_regularizada(1.5, 2.0, 2.0)


class TestTStudent(unittest.TestCase):
    # Valores de tabela: t_{p, gl} tais que P(T <= t) = p.
    TABELA = [
        (2.262, 9, 0.975),    # t de 9 gl a 2,5% na cauda
        (1.833, 9, 0.950),
        (3.250, 9, 0.995),
        (2.045, 29, 0.975),   # 29 gl = os 30 pares reais
        (1.699, 29, 0.950),
        (1.960, 100000, 0.975),  # com gl enorme a t vira normal
    ]

    def test_cdf_contra_tabela(self):
        for t, gl, esperado in self.TABELA:
            with self.subTest(t=t, gl=gl):
                self.assertAlmostEqual(t_cdf(t, gl), esperado, places=4)

    def test_cdf_simetrica(self):
        for t, gl in ((0.5, 5), (2.0, 17), (3.1, 40)):
            self.assertAlmostEqual(t_cdf(t, gl) + t_cdf(-t, gl), 1.0, places=12)

    def test_mediana_em_zero(self):
        for gl in (1, 5, 30):
            self.assertEqual(t_cdf(0.0, gl), 0.5)

    def test_sobrevivencia_complementa_a_cdf(self):
        for t, gl in ((0.5, 5), (2.0, 29), (-1.3, 12)):
            self.assertAlmostEqual(t_sobrevivencia(t, gl) + t_cdf(t, gl), 1.0, places=12)

    def test_sobrevivencia_nao_satura_na_cauda(self):
        """Com t grande, 1 - cdf daria 0; a cauda direta tem de dar positivo.

        É o caso dos dados reais (t ~ 379), em que o p-valor só existe se for
        calculado pela cauda.
        """
        p = t_sobrevivencia(50.0, 29)
        self.assertGreater(p, 0.0)
        self.assertLess(p, 1e-25)

    def test_quantil_inverte_a_cdf(self):
        for p, gl in ((0.9, 5), (0.95, 29), (0.975, 10), (0.01, 7)):
            with self.subTest(p=p, gl=gl):
                self.assertAlmostEqual(t_cdf(t_quantil(p, gl), gl), p, places=9)

    def test_quantil_contra_tabela(self):
        self.assertAlmostEqual(t_quantil(0.95, 29), 1.6991, places=3)
        self.assertAlmostEqual(t_quantil(0.975, 9), 2.2622, places=3)

    def test_argumentos_invalidos(self):
        with self.assertRaises(ValueError):
            t_cdf(1.0, 0)
        with self.assertRaises(ValueError):
            t_quantil(0.0, 5)
        with self.assertRaises(ValueError):
            t_quantil(1.0, 5)


class TestWilcoxonExata(unittest.TestCase):
    def test_soma_das_contagens(self):
        """São 2^n subconjuntos de {1..n}, todos contados uma vez."""
        for n in (1, 5, 10, 20):
            with self.subTest(n=n):
                self.assertEqual(sum(distribuicao_wilcoxon(n)), 2**n)

    def test_simetrica(self):
        """W+ e W- têm a mesma distribuição sob H0."""
        for n in (3, 8, 15):
            contagens = distribuicao_wilcoxon(n)
            self.assertEqual(list(contagens), list(reversed(contagens)))

    def test_tamanho(self):
        """O maior W+ possível é 1+2+...+n."""
        for n in (4, 11):
            self.assertEqual(len(distribuicao_wilcoxon(n)) - 1, n * (n + 1) // 2)

    def test_caso_pequeno_na_mao(self):
        """n = 3: subconjuntos de {1,2,3} somam 0,1,2,3,3,4,5,6."""
        self.assertEqual(list(distribuicao_wilcoxon(3)), [1, 1, 1, 2, 1, 1, 1])

    def test_p_extremo(self):
        """Todas as diferenças positivas: só 1 dos 2^n arranjos é tão extremo."""
        for n in (5, 10, 30):
            with self.subTest(n=n):
                maximo = n * (n + 1) // 2
                self.assertAlmostEqual(wilcoxon_p_exato(maximo, n), 1.0 / 2**n, places=15)

    def test_p_minimo_e_maximo(self):
        self.assertEqual(wilcoxon_p_exato(0, 6), 1.0)        # P(W+ >= 0) = 1
        self.assertEqual(wilcoxon_p_exato(100, 6), 0.0)      # acima do máximo

    def test_mediana(self):
        """Em n(n+1)/4 (o valor esperado) a cauda fica perto de 0,5."""
        n = 20
        esperado = n * (n + 1) / 4
        self.assertAlmostEqual(wilcoxon_p_exato(esperado, n), 0.5, delta=0.03)

    def test_n_negativo(self):
        with self.assertRaises(ValueError):
            distribuicao_wilcoxon(-1)


if __name__ == "__main__":
    unittest.main()
