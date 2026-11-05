"""Confere a geração dos dados simulados e o estudo de Monte Carlo (Lab04).

Dois tipos de garantia:

  - **reprodutibilidade**: a mesma semente tem de dar exatamente os mesmos
    dados, senão os números do relatório não podem ser conferidos por ninguém;
  - **calibração**: no cenário normal sob H0, a taxa de erro tipo I tem de cair
    perto de α. Se não cair, o p-valor está errado em algum lugar.
"""

from __future__ import annotations

import random
import statistics
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from simulacao import (  # noqa: E402
    CENARIOS,
    gerar,
    rodar_celula,
    simetrico_sob_h0,
)

DESVIO = 1.0  # escala irrelevante para estes testes; 1 facilita a leitura


class TestGeracao(unittest.TestCase):
    def test_tamanho_e_tipo(self):
        for cenario in CENARIOS:
            with self.subTest(cenario=cenario):
                d = gerar(cenario, 25, 0.0, DESVIO, random.Random(1))
                self.assertEqual(len(d), 25)
                self.assertTrue(all(isinstance(v, float) for v in d))

    def test_mesma_semente_mesmos_dados(self):
        for cenario in CENARIOS:
            with self.subTest(cenario=cenario):
                a = gerar(cenario, 40, 0.3, DESVIO, random.Random(7))
                b = gerar(cenario, 40, 0.3, DESVIO, random.Random(7))
                self.assertEqual(a, b)

    def test_sementes_diferentes_dados_diferentes(self):
        a = gerar("normal", 40, 0.0, DESVIO, random.Random(1))
        b = gerar("normal", 40, 0.0, DESVIO, random.Random(2))
        self.assertNotEqual(a, b)

    def test_media_e_desvio_pedidos(self):
        """Os três cenários têm de sair com a MESMA média e o MESMO desvio.

        É o que garante que a diferença de poder entre eles venha da forma da
        distribuição, e não da escala.
        """
        for cenario in CENARIOS:
            with self.subTest(cenario=cenario):
                # gerar() recebe a MÉDIA absoluta (em rodar_celula ela vem
                # de efeito * desvio), não o efeito padronizado.
                d = gerar(cenario, 20000, 1.0, 2.0, random.Random(3))
                self.assertAlmostEqual(statistics.fmean(d), 1.0, delta=0.12)
                self.assertAlmostEqual(statistics.stdev(d), 2.0, delta=0.15)

    def test_lognormal_e_assimetrica_a_direita(self):
        d = gerar("lognormal_deslocada", 20000, 0.0, 1.0, random.Random(4))
        media, s = statistics.fmean(d), statistics.stdev(d)
        assimetria = sum(((v - media) / s) ** 3 for v in d) / len(d)
        self.assertGreater(assimetria, 1.0)

    def test_normal_e_simetrica(self):
        d = gerar("normal", 20000, 0.0, 1.0, random.Random(5))
        media, s = statistics.fmean(d), statistics.stdev(d)
        assimetria = sum(((v - media) / s) ** 3 for v in d) / len(d)
        self.assertAlmostEqual(assimetria, 0.0, delta=0.15)

    def test_contaminada_tem_cauda_mais_pesada(self):
        """Mesma variância da normal, mas com curtose maior."""
        def curtose(valores):
            media, s = statistics.fmean(valores), statistics.stdev(valores)
            return sum(((v - media) / s) ** 4 for v in valores) / len(valores)

        normal = gerar("normal", 20000, 0.0, 1.0, random.Random(6))
        contaminada = gerar("contaminada", 20000, 0.0, 1.0, random.Random(6))
        self.assertGreater(curtose(contaminada), curtose(normal) + 1.0)

    def test_cenario_desconhecido(self):
        with self.assertRaises(ValueError):
            gerar("exponencial", 10, 0.0, 1.0, random.Random(1))


class TestSimetriaSobH0(unittest.TestCase):
    def test_quais_cenarios_cumprem_a_hipotese_do_wilcoxon(self):
        self.assertTrue(simetrico_sob_h0("normal"))
        self.assertTrue(simetrico_sob_h0("contaminada"))
        self.assertFalse(simetrico_sob_h0("lognormal_deslocada"))


class TestMonteCarlo(unittest.TestCase):
    def test_reprodutivel(self):
        a = rodar_celula("normal", 15, 0.2, DESVIO, 100, semente=11)
        b = rodar_celula("normal", 15, 0.2, DESVIO, 100, semente=11)
        self.assertEqual(a.rejeicoes_t, b.rejeicoes_t)
        self.assertEqual(a.rejeicoes_w, b.rejeicoes_w)

    def test_erro_tipo_i_calibrado_no_cenario_normal(self):
        """Sob H0 com distribuição normal, os dois testes têm de rejeitar
        perto de 5%. É a checagem que pega um p-valor errado."""
        c = rodar_celula("normal", 30, 0.0, DESVIO, 3000, semente=12)
        for taxa, nome in ((c.taxa_t, "t"), (c.taxa_w, "Wilcoxon")):
            with self.subTest(teste=nome):
                # 4 erros padrão de Monte Carlo: folgado o bastante para o
                # teste não falhar por acaso, apertado o bastante para pegar
                # um p-valor sistematicamente errado.
                self.assertAlmostEqual(taxa, 0.05, delta=4 * c.erro_padrao(0.05))

    def test_poder_cresce_com_o_efeito(self):
        sem = rodar_celula("normal", 30, 0.0, DESVIO, 500, semente=13)
        medio = rodar_celula("normal", 30, 0.3, DESVIO, 500, semente=13)
        grande = rodar_celula("normal", 30, 0.8, DESVIO, 500, semente=13)
        self.assertLess(sem.taxa_t, medio.taxa_t)
        self.assertLess(medio.taxa_t, grande.taxa_t)

    def test_poder_cresce_com_n(self):
        pequeno = rodar_celula("normal", 10, 0.3, DESVIO, 500, semente=14)
        grande = rodar_celula("normal", 60, 0.3, DESVIO, 500, semente=14)
        self.assertLess(pequeno.taxa_t, grande.taxa_t)

    def test_wilcoxon_ganha_com_valores_extremos(self):
        """O ponto do laboratório: com caudas pesadas o Wilcoxon tem mais poder.

        Com a distribuição contaminada, a média (e portanto o t) é puxada
        pelos extremos, enquanto os postos quase não sentem.
        """
        c = rodar_celula("contaminada", 30, 0.3, DESVIO, 1500, semente=15)
        self.assertGreater(c.taxa_w, c.taxa_t)

    def test_identificacao_da_celula(self):
        c = rodar_celula("normal", 20, 0.0, DESVIO, 50, semente=16)
        self.assertEqual((c.cenario, c.n, c.efeito, c.repeticoes), ("normal", 20, 0.0, 50))
        self.assertTrue(c.sob_h0)
        self.assertFalse(rodar_celula("normal", 20, 0.1, DESVIO, 50, semente=16).sob_h0)


if __name__ == "__main__":
    unittest.main()
