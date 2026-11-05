"""Confere o teste t pareado e o Wilcoxon pareado (Lab04).

Os casos são pequenos e montados à mão, com o resultado conferido no papel —
é o que permite afirmar que o número está certo, e não apenas que o código
roda sem erro.
"""

from __future__ import annotations

import statistics
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from testes import (  # noqa: E402
    carregar_diferencas,
    hodges_lehmann,
    postos_medios,
    teste_t_pareado,
    wilcoxon_pareado,
)

LAB4_DIR = Path(__file__).resolve().parent.parent


class TestPostos(unittest.TestCase):
    def test_sem_empates(self):
        self.assertEqual(postos_medios([3.0, 1.0, 2.0]), [3.0, 1.0, 2.0])

    def test_com_empates_recebe_posto_medio(self):
        # dois valores iguais nas posições 1 e 2 -> ambos recebem 1,5
        self.assertEqual(postos_medios([1.0, 1.0, 5.0]), [1.5, 1.5, 3.0])

    def test_todos_iguais(self):
        self.assertEqual(postos_medios([2.0] * 4), [2.5] * 4)

    def test_soma_dos_postos(self):
        """Com ou sem empates, a soma é sempre n(n+1)/2."""
        for valores in ([5.0, 1.0, 3.0, 3.0], [1.0, 2.0, 3.0], [7.0] * 5):
            n = len(valores)
            self.assertAlmostEqual(sum(postos_medios(valores)), n * (n + 1) / 2)


class TestHodgesLehmann(unittest.TestCase):
    def test_caso_na_mao(self):
        """d = [1, 2, 6]. Médias de Walsh (i <= j): 1; 1,5; 3,5; 2; 4; 6.

        Ordenadas: 1; 1,5; 2; 3,5; 4; 6 -> mediana = (2 + 3,5)/2 = 2,75.
        """
        self.assertAlmostEqual(hodges_lehmann([1.0, 2.0, 6.0]), 2.75)

    def test_um_elemento(self):
        self.assertAlmostEqual(hodges_lehmann([4.2]), 4.2)

    def test_simetrico_em_zero(self):
        self.assertAlmostEqual(hodges_lehmann([-2.0, -1.0, 1.0, 2.0]), 0.0)


class TestTPareado(unittest.TestCase):
    def test_estatistica_na_mao(self):
        """d = [1,2,3,4,5]: média 3, desvio sqrt(2,5), EP = desvio/sqrt(5)."""
        r = teste_t_pareado([1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertEqual(r.n, 5)
        self.assertEqual(r.graus_liberdade, 4)
        self.assertAlmostEqual(r.media, 3.0)
        self.assertAlmostEqual(r.desvio, statistics.stdev([1, 2, 3, 4, 5]))
        self.assertAlmostEqual(r.erro_padrao, r.desvio / 5**0.5)
        self.assertAlmostEqual(r.estatistica, 3.0 / (statistics.stdev([1, 2, 3, 4, 5]) / 5**0.5))
        self.assertAlmostEqual(r.d_z, 3.0 / statistics.stdev([1, 2, 3, 4, 5]))

    def test_p_entre_valores_de_tabela(self):
        """t(4) = 4,243 fica entre t_{0,99}=3,747 e t_{0,995}=4,604."""
        r = teste_t_pareado([1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertGreater(r.p_valor, 0.005)
        self.assertLess(r.p_valor, 0.01)

    def test_direcao_importa(self):
        """O teste é unilateral 'maior que': diferenças negativas não rejeitam."""
        positivas = teste_t_pareado([1.0, 2.0, 3.0, 4.0, 5.0])
        negativas = teste_t_pareado([-1.0, -2.0, -3.0, -4.0, -5.0])
        self.assertTrue(positivas.significativo)
        self.assertFalse(negativas.significativo)
        self.assertAlmostEqual(positivas.p_valor + negativas.p_valor, 1.0, places=12)

    def test_media_zero_da_meio(self):
        r = teste_t_pareado([-2.0, -1.0, 1.0, 2.0])
        self.assertAlmostEqual(r.media, 0.0)
        self.assertAlmostEqual(r.p_valor, 0.5, places=12)

    def test_ic_unilateral_abaixo_da_media(self):
        r = teste_t_pareado([1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertLess(r.ic95_inferior, r.media)
        # significativo a 5% <=> o limite inferior do IC de 95% passa de zero
        self.assertEqual(r.significativo, r.ic95_inferior > 0)

    def test_desvio_zero(self):
        """Diferenças todas iguais: o t não existe; o módulo decide pelo sinal."""
        positivo = teste_t_pareado([2.0, 2.0, 2.0])
        self.assertEqual(positivo.p_valor, 0.0)
        self.assertTrue(positivo.significativo)
        nulo = teste_t_pareado([0.0, 0.0, 0.0])
        self.assertEqual(nulo.p_valor, 1.0)
        self.assertFalse(nulo.significativo)

    def test_precisa_de_dois_pares(self):
        with self.assertRaises(ValueError):
            teste_t_pareado([1.0])


class TestWilcoxonPareado(unittest.TestCase):
    def test_todas_positivas_da_o_p_minimo(self):
        """Sem empates, W+ máximo -> p = 1/2^n. Para n=5, 1/32 = 0,03125."""
        r = wilcoxon_pareado([1.0, 2.0, 3.0, 4.0, 5.0])
        self.assertEqual(r.estatistica, 15.0)   # 1+2+3+4+5
        self.assertEqual(r.w_menos, 0.0)
        self.assertEqual(r.metodo, "exato")
        self.assertAlmostEqual(r.p_valor, 1 / 32)
        self.assertAlmostEqual(r.correlacao_rank_biserial, 1.0)

    def test_todas_negativas_nao_rejeita(self):
        r = wilcoxon_pareado([-1.0, -2.0, -3.0, -4.0, -5.0])
        self.assertEqual(r.estatistica, 0.0)
        self.assertAlmostEqual(r.p_valor, 1.0)
        self.assertFalse(r.significativo)
        self.assertAlmostEqual(r.correlacao_rank_biserial, -1.0)

    def test_zeros_sao_descartados(self):
        r = wilcoxon_pareado([1.0, 0.0, 2.0, 0.0])
        self.assertEqual(r.n_total, 4)
        self.assertEqual(r.n_usado, 2)
        self.assertEqual(r.zeros_descartados, 2)
        # com zero descartado o p deixa de ser exato
        self.assertEqual(r.metodo, "normal")

    def test_empates_caem_para_normal_e_avisam(self):
        """|d| repetido impede o p exato; o método tem de dizer isso."""
        r = wilcoxon_pareado([1.0, -1.0, 2.0, -2.0, 3.0, -3.0])
        self.assertTrue(r.tem_empates)
        self.assertEqual(r.metodo, "normal")
        self.assertAlmostEqual(r.estatistica, r.w_menos)  # simétrico
        self.assertGreater(r.p_valor, 0.4)                # nada de evidência

    def test_sem_empates_usa_exato(self):
        r = wilcoxon_pareado([0.5, -1.0, 2.0, -3.0, 4.0])
        self.assertFalse(r.tem_empates)
        self.assertEqual(r.metodo, "exato")

    def test_soma_dos_postos(self):
        """W+ + W- = n(n+1)/2 sempre."""
        r = wilcoxon_pareado([1.0, -2.0, 3.0, -4.0, 5.0, 6.0])
        self.assertAlmostEqual(r.estatistica + r.w_menos, 6 * 7 / 2)

    def test_tudo_zero(self):
        r = wilcoxon_pareado([0.0, 0.0, 0.0])
        self.assertEqual(r.n_usado, 0)
        self.assertEqual(r.p_valor, 1.0)
        self.assertEqual(r.metodo, "indefinido")
        self.assertFalse(r.significativo)

    def test_tolerancia_de_zero(self):
        """Abaixo de meio milissegundo é ruído de ponto flutuante, não medição."""
        r = wilcoxon_pareado([1.0, 1e-9, 2.0])
        self.assertEqual(r.zeros_descartados, 1)

    def test_mediana_e_hodges_lehmann(self):
        r = wilcoxon_pareado([1.0, 2.0, 6.0])
        self.assertAlmostEqual(r.mediana, 2.0)
        self.assertAlmostEqual(r.hodges_lehmann, 2.75)

    def test_completo_false_nao_muda_o_p(self):
        d = [0.5, -1.0, 2.0, -3.0, 4.0, 7.0, 1.5]
        self.assertAlmostEqual(wilcoxon_pareado(d).p_valor,
                               wilcoxon_pareado(d, completo=False).p_valor)


class TestDadosReais(unittest.TestCase):
    """Os 30 pares coletados: um caso em que o resultado é conferível na mão."""

    @classmethod
    def setUpClass(cls):
        cls.diferencas = carregar_diferencas(LAB4_DIR / "data" / "dados_reais.csv")

    def test_trinta_pares_todos_positivos(self):
        self.assertEqual(len(self.diferencas), 30)
        self.assertTrue(all(d > 0 for d in self.diferencas))

    def test_wilcoxon_da_o_p_minimo_possivel(self):
        """Com as 30 diferenças positivas, W+ é o máximo e p = 1/2^30."""
        r = wilcoxon_pareado(self.diferencas)
        self.assertEqual(r.estatistica, 30 * 31 / 2)
        self.assertEqual(r.metodo, "exato")
        self.assertAlmostEqual(r.p_valor, 1 / 2**30, places=15)

    def test_os_dois_rejeitam(self):
        self.assertTrue(teste_t_pareado(self.diferencas).significativo)
        self.assertTrue(wilcoxon_pareado(self.diferencas).significativo)


if __name__ == "__main__":
    unittest.main()
