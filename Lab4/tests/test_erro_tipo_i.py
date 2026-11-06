"""Confere a simulação da Q1 (Lab04, Issue #107).

`src/erro_tipo_i.py` usa NumPy e pandas para gerar os dados. Sem eles (é o
caso da CI, que roda só com a biblioteca padrão), estes testes se pulam
sozinhos, como a conferência contra o SciPy.

O que se confere aqui é a parte metodológica: em qual cenário a H0 de cada
teste é verdadeira, se o simetrizado é de fato simétrico e se a simulação
reproduz os p-valores versionados com a mesma semente.
"""

from __future__ import annotations

import csv
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

try:
    import numpy as np
    import pandas  # noqa: F401
    TEM_NUMPY = True
except ImportError:  # pragma: no cover - é o caminho da CI
    TEM_NUMPY = False

LAB4_DIR = Path(__file__).resolve().parent.parent
DADOS = LAB4_DIR / "data"


@unittest.skipUnless(TEM_NUMPY, "NumPy/pandas ausentes: a simulação da Q1 não roda aqui")
class TestHipotesesNulas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from erro_tipo_i import residuos_centralizados
        from testes import carregar_diferencas

        cls.residuos = residuos_centralizados(carregar_diferencas(DADOS / "dados_reais.csv"))

    def test_centralizado_media_zero_mas_assimetrico(self):
        from erro_tipo_i import CENTRALIZADO, TESTE_T, TESTE_W, distribuicao_geradora, hipoteses_nulas

        h = hipoteses_nulas(distribuicao_geradora(self.residuos, CENTRALIZADO))
        self.assertTrue(h[TESTE_T], "a média dos resíduos é 0: a H0 do t vale")
        self.assertFalse(h["simetrica"])
        self.assertFalse(h[TESTE_W], "pseudomediana positiva: a H0 do Wilcoxon é falsa")
        self.assertGreater(h["p_soma_positiva"], 0.5)
        self.assertGreater(h["pseudomediana"], 0)

    def test_simetrizado_satisfaz_as_duas(self):
        from erro_tipo_i import SIMETRIZADO, TESTE_T, TESTE_W, distribuicao_geradora, hipoteses_nulas

        h = hipoteses_nulas(distribuicao_geradora(self.residuos, SIMETRIZADO))
        self.assertTrue(h["simetrica"])
        self.assertTrue(h[TESTE_T])
        self.assertTrue(h[TESTE_W])
        self.assertAlmostEqual(h["p_soma_positiva"], h["p_soma_negativa"])

    def test_casos_montados(self):
        from erro_tipo_i import TESTE_T, TESTE_W, hipoteses_nulas

        simetrica = hipoteses_nulas(np.array([-2.0, -1.0, 1.0, 2.0]))
        self.assertTrue(simetrica[TESTE_T] and simetrica[TESTE_W])
        # média 0, assimétrica à esquerda: um valor muito negativo e três positivos
        assimetrica = hipoteses_nulas(np.array([-3.0, 1.0, 1.0, 1.0]))
        self.assertTrue(assimetrica[TESTE_T])
        self.assertFalse(assimetrica[TESTE_W])
        # média positiva: a H0 do t (μ ≤ 0) é falsa
        deslocada = hipoteses_nulas(np.array([1.0, 2.0, 3.0]))
        self.assertFalse(deslocada[TESTE_T])


@unittest.skipUnless(TEM_NUMPY, "NumPy/pandas ausentes: a simulação da Q1 não roda aqui")
class TestGeracao(unittest.TestCase):
    def test_simetrizado_sinal_independente_da_magnitude(self):
        from erro_tipo_i import SIMETRIZADO, gerar_conjuntos

        residuos = np.array([-1.5, -0.2, 0.1, 0.3, 0.5, 0.8])
        dados = gerar_conjuntos(residuos, SIMETRIZADO, 4000, 30, np.random.default_rng(7))
        self.assertEqual(dados.shape, (4000, 30))
        positivos = dados > 0
        alta = np.abs(dados) > 0.6
        self.assertAlmostEqual(positivos.mean(), 0.5, delta=0.01)
        self.assertAlmostEqual(positivos[alta].mean(), positivos[~alta].mean(), delta=0.015)

    def test_reproduz_os_pvalores_versionados(self):
        """Mesma semente → mesmos p-valores nas primeiras repetições do centralizado.

        `Generator.choice` consome o fluxo em ordem, então as primeiras 50
        linhas de uma matriz 50 × 30 são as primeiras 50 de uma 10.000 × 30.
        """
        from erro_tipo_i import CENTRALIZADO, residuos_centralizados, rodar_cenario
        from testes import carregar_diferencas

        residuos = residuos_centralizados(carregar_diferencas(DADOS / "dados_reais.csv"))
        r = rodar_cenario(residuos, CENTRALIZADO, repeticoes=50, n=30, alfa=0.05, semente=42)
        with open(DADOS / "pvalores_q1.csv", newline="", encoding="utf-8") as arquivo:
            versionados = [l for _, l in zip(range(50), csv.DictReader(arquivo))]
        for calculado_t, calculado_w, linha in zip(r.p_t, r.p_w, versionados):
            self.assertAlmostEqual(calculado_t, float(linha["p_valor_t"]), places=12)
            self.assertAlmostEqual(calculado_w, float(linha["p_valor_wilcoxon"]), places=12)


if __name__ == "__main__":
    unittest.main()
