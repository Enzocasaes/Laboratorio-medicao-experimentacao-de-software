"""Confere a estatistica da secao 10 (Lab05, Participante C).

Os casos sao pequenos e com o resultado conferido no papel ou em tabela. E' o
que permite dizer que o numero esta' certo, e nao apenas que o codigo roda.

A conferencia contra o SciPy fica em `Sprint01/coleta/conferir_estatistica.py`,
fora da suite: o SciPy nao e' dependencia do projeto e a CI nao o instala.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "coleta"))

import estatistica as est  # noqa: E402


class TestDescritiva(unittest.TestCase):
    def test_mediana_par_e_impar(self):
        self.assertEqual(est.mediana([3, 1, 2]), 2)
        self.assertEqual(est.mediana([4, 1, 3, 2]), 2.5)

    def test_percentil_nos_extremos(self):
        valores = [1, 2, 3, 4, 5]
        self.assertEqual(est.percentil(valores, 0), 1)
        self.assertEqual(est.percentil(valores, 100), 5)
        self.assertEqual(est.percentil(valores, 50), 3)

    def test_percentil_interpola(self):
        """Entre 1 e 2, o percentil 25 de [1,2,3,4,5] cai em 2 (posicao 1,0)."""
        self.assertAlmostEqual(est.percentil([1, 2, 3, 4, 5], 25), 2.0)
        # caso com interpolacao de verdade: posicao 1,5 entre 2 e 3
        self.assertAlmostEqual(est.percentil([1, 2, 3, 4], 50), 2.5)

    def test_iqr(self):
        self.assertAlmostEqual(est.iqr([1, 2, 3, 4, 5]), 2.0)

    def test_lista_vazia_e_erro(self):
        """Melhor estourar do que devolver zero e virar um numero no relatorio."""
        with self.assertRaises(ValueError):
            est.mediana([])
        with self.assertRaises(ValueError):
            est.percentil([], 50)


class TestQuiQuadrado(unittest.TestCase):
    TABELA = ((3.841, 1), (5.991, 2), (7.815, 3), (9.488, 4), (11.070, 5))

    def test_contra_valores_de_tabela(self):
        for x, gl in self.TABELA:
            with self.subTest(gl=gl):
                self.assertAlmostEqual(est.qui2_sobrevivencia(x, gl), 0.05, places=3)

    def test_monotonica(self):
        for gl in (1, 2, 3):
            anterior = 1.0
            for x in (0.5, 1, 2, 5, 10):
                atual = est.qui2_sobrevivencia(x, gl)
                self.assertLess(atual, anterior)
                anterior = atual

    def test_em_zero_vale_um(self):
        self.assertEqual(est.qui2_sobrevivencia(0.0, 2), 1.0)


class TestWilcoxon(unittest.TestCase):
    def test_todas_positivas_da_o_p_minimo(self):
        """Sem empates, W+ maximo -> p bilateral = 2/2^n. n=5: 2/32 = 0,0625."""
        r = est.wilcoxon_pareado([1, 2, 3, 4, 5])
        self.assertEqual(r.estatistica, 15.0)
        self.assertEqual(r.metodo, "exato")
        self.assertAlmostEqual(r.p_valor, 2 / 32)

    def test_simetrico_nao_rejeita(self):
        """Dados simetricos nao dao evidencia de deslocamento.

        Um conjunto perfeitamente simetrico tem empates em |d| por
        construcao, entao o metodo cai para a normal — e' o esperado, nao
        um defeito.
        """
        r = est.wilcoxon_pareado([-2, -1, 1, 2])
        self.assertEqual(r.metodo, "normal")
        self.assertGreater(r.p_valor, 0.5)

    def test_zeros_sao_descartados(self):
        r = est.wilcoxon_pareado([1, 0, 2, 0])
        self.assertEqual(r.n_total, 4)
        self.assertEqual(r.n_usado, 2)

    def test_tudo_zero_e_indefinido(self):
        r = est.wilcoxon_pareado([0, 0, 0])
        self.assertEqual(r.metodo, "indefinido")
        self.assertEqual(r.p_valor, 1.0)

    def test_empates_caem_para_normal_e_avisam(self):
        """Com |d| repetido o p exato deixa de valer; o metodo tem de dizer."""
        r = est.wilcoxon_pareado([1, -1, 2, -2, 3, -3])
        self.assertEqual(r.metodo, "normal")

    def test_acima_do_limite_usa_normal(self):
        r = est.wilcoxon_pareado([i + 0.5 for i in range(30)], exato_ate=25)
        self.assertEqual(r.metodo, "normal")

    def test_r_cresce_com_a_assimetria(self):
        fraco = est.wilcoxon_pareado([1, -1.1, 2, -2.1, 3, -2.9, 4, -4.2])
        forte = est.wilcoxon_pareado([1, 2, 3, 4, 5, 6, 7, 8])
        self.assertLess(fraco.r, forte.r)


class TestFriedman(unittest.TestCase):
    def test_caso_na_mao(self):
        """6 blocos, 3 tratamentos. Q conferido pela formula."""
        blocos = [{"a": 1, "b": 2, "c": 3}, {"a": 2, "b": 3, "c": 1},
                  {"a": 1, "b": 3, "c": 2}, {"a": 1, "b": 2, "c": 3},
                  {"a": 2, "b": 1, "c": 3}, {"a": 1, "b": 2, "c": 3}]
        r = est.friedman(blocos)
        self.assertEqual((r.k, r.n, r.gl), (3, 6, 2))
        self.assertAlmostEqual(r.estatistica, 4.333333, places=5)

    def test_tratamento_sempre_melhor_rejeita(self):
        blocos = [{"a": i, "b": i + 10, "c": i + 20} for i in range(12)]
        r = est.friedman(blocos)
        self.assertLess(r.p_valor, 0.001)
        self.assertLess(r.postos_medios["a"], r.postos_medios["c"])

    def test_sem_blocos_e_erro(self):
        with self.assertRaises(ValueError):
            est.friedman([])


class TestHolm(unittest.TestCase):
    def test_caso_na_mao(self):
        ajustados = est.holm({"a": 0.01, "b": 0.04, "c": 0.03, "d": 0.005})
        self.assertAlmostEqual(ajustados["d"], 0.02)
        self.assertAlmostEqual(ajustados["a"], 0.03)
        self.assertAlmostEqual(ajustados["c"], 0.06)
        self.assertAlmostEqual(ajustados["b"], 0.06)  # monotonicidade

    def test_nunca_passa_de_um(self):
        for p in est.holm({"a": 0.9, "b": 0.8, "c": 0.95}).values():
            self.assertLessEqual(p, 1.0)

    def test_um_teste_so_nao_muda_nada(self):
        self.assertAlmostEqual(est.holm({"a": 0.03})["a"], 0.03)

    def test_e_monotonica(self):
        brutos = {f"t{i}": p for i, p in enumerate([0.001, 0.01, 0.02, 0.04, 0.3])}
        ajustados = est.holm(brutos)
        ordenados = [ajustados[k] for k, _ in sorted(brutos.items(), key=lambda kv: kv[1])]
        self.assertEqual(ordenados, sorted(ordenados))


class TestBootstrap(unittest.TestCase):
    def test_reprodutivel(self):
        unidades = [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0], [7.0, 8.0]]
        a = est.bootstrap_conglomerado(unidades, est.mediana, replicas=500, semente=1)
        b = est.bootstrap_conglomerado(unidades, est.mediana, replicas=500, semente=1)
        self.assertEqual(a, b)

    def test_intervalo_contem_o_observado(self):
        unidades = [[float(i)] * 5 for i in range(30)]
        obs, inf, sup = est.bootstrap_conglomerado(unidades, est.mediana,
                                                   replicas=1000, semente=2)
        self.assertLessEqual(inf, obs)
        self.assertLessEqual(obs, sup)

    def test_reamostra_unidades_e_nao_observacoes(self):
        """Com uma unidade so', toda replica e' igual: o IC colapsa.

        E' a prova de que a reamostragem e' por conglomerado. Se ela fosse por
        observacao, o IC teria largura mesmo com uma unidade — e seria um IC
        que trata como independentes dados que nao sao.
        """
        _, inf, sup = est.bootstrap_conglomerado([[1.0, 5.0, 9.0]], est.mediana,
                                                 replicas=200, semente=3)
        self.assertEqual(inf, sup)

    def test_sem_unidades_e_erro(self):
        with self.assertRaises(ValueError):
            est.bootstrap_conglomerado([], est.mediana)


class TestWilson(unittest.TestCase):
    def test_nao_sai_do_intervalo(self):
        inf, sup = est.wilson(0, 60)
        self.assertEqual(inf, 0.0)
        self.assertGreater(sup, 0.0)
        inf, sup = est.wilson(60, 60)
        self.assertLess(inf, 1.0)
        # em aritmetica exata o limite superior e' 1; em ponto flutuante,
        # 0,9999999999999998
        self.assertAlmostEqual(sup, 1.0, places=12)
        self.assertLessEqual(sup, 1.0)

    def test_centrado_em_meio(self):
        inf, sup = est.wilson(50, 100)
        self.assertAlmostEqual((inf + sup) / 2, 0.5, places=6)

    def test_total_zero_nao_estoura(self):
        self.assertEqual(est.wilson(0, 0), (0.0, 0.0))


class TestCliffDelta(unittest.TestCase):
    def test_separacao_total(self):
        delta, rotulo = est.cliff_delta([1, 2, 3], [10, 11, 12])
        self.assertAlmostEqual(delta, 1.0)   # o primeiro e' sempre MENOR
        self.assertEqual(rotulo, "grande")

    def test_identicos_dao_zero(self):
        delta, rotulo = est.cliff_delta([1, 2, 3], [1, 2, 3])
        self.assertAlmostEqual(delta, 0.0)
        self.assertEqual(rotulo, "desprezivel")

    def test_sinal_indica_quem_e_menor(self):
        delta, _ = est.cliff_delta([10, 11, 12], [1, 2, 3])
        self.assertLess(delta, 0)


if __name__ == "__main__":
    unittest.main()
