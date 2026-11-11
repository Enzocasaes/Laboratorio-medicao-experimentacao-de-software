"""Confere o estudo de violação de pressupostos (Lab04, Issues #111 e #112).

O resultado principal da Q3 — o Wilcoxon exato travar em ~3,1% com n = 5 — só
vale como achado se não for efeito de um gerador torto. Por isso os testes
abaixo cobrem, antes de qualquer coisa, as duas propriedades de que a leitura
depende:

- os cenários são **simétricos em torno da média** e têm o **desvio pedido**;
  é isso que mantém as duas H0 verdadeiras e as duas taxas comparáveis;
- a cauda é mesmo mais pesada que a da normal, senão o cenário não viola nada.

Depois vêm a reprodutibilidade, a coerência entre as contagens e o teto de
3,125% do Wilcoxon com n = 5, que é um fato da distribuição e não da simulação.
"""

from __future__ import annotations

import math
import random
import statistics
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from distribuicoes import wilcoxon_p_exato  # noqa: E402
from violacao import (  # noqa: E402
    CENARIOS,
    DESVIO,
    TAMANHOS,
    Celula,
    gerar_cauda_pesada,
    gerar_diferencas,
    linhas_mcnemar,
    linhas_taxas,
    rodar_celula,
    rodar_estudo,
    simetrico,
)


def amostra(cenario: str, n: int = 20000, efeito: float = 0.0,
            semente: int = 7) -> list[float]:
    return gerar_diferencas(cenario, n, efeito, random.Random(semente))


class TestGeradores(unittest.TestCase):
    def test_todos_os_cenarios_tem_media_zero_sob_h0(self):
        for cenario in CENARIOS:
            valores = amostra(cenario)
            media = statistics.fmean(valores)
            erro_padrao = statistics.stdev(valores) / math.sqrt(len(valores))
            self.assertLess(abs(media), 4 * erro_padrao,
                            f"{cenario}: média longe de zero sob H0")

    def test_todos_os_cenarios_tem_o_desvio_pedido(self):
        for cenario in CENARIOS:
            desvio = statistics.stdev(amostra(cenario))
            self.assertAlmostEqual(desvio / DESVIO, 1.0, delta=0.05,
                                   msg=f"{cenario}: desvio fora da escala comum")

    def test_todos_os_cenarios_sao_simetricos(self):
        """Sem simetria, a H0 do Wilcoxon seria falsa e a taxa dele não seria erro tipo I."""
        for cenario in CENARIOS:
            valores = amostra(cenario)
            media = statistics.fmean(valores)
            desvio = statistics.stdev(valores)
            assimetria = (sum(((v - media) / desvio) ** 3 for v in valores)
                          / len(valores))
            self.assertLess(abs(assimetria), 0.35, f"{cenario}: assimétrico demais")
            self.assertTrue(simetrico(cenario))

    def test_cauda_pesada_tem_cauda_mais_pesada_que_a_normal(self):
        """Se não tiver, o cenário não viola a normalidade e não serve à Q3."""
        def fora_de_tres_desvios(valores):
            desvio = statistics.stdev(valores)
            return sum(1 for v in valores if abs(v) > 3 * desvio) / len(valores)

        pesada = fora_de_tres_desvios(amostra("cauda_pesada"))
        normal = fora_de_tres_desvios(amostra("normal"))
        self.assertGreater(pesada, 2 * normal)
        self.assertGreater(pesada, 0.01)  # na normal seriam ~0,27%

    def test_efeito_desloca_a_media_em_unidades_de_desvio(self):
        """A Issue #109 reaproveita esta função com efeito > 0, no estudo de poder."""
        valores = amostra("normal", efeito=0.5)
        self.assertAlmostEqual(statistics.fmean(valores) / DESVIO, 0.5, delta=0.05)

    def test_cenario_desconhecido_e_erro(self):
        with self.assertRaises(ValueError):
            gerar_diferencas("lognormal_deslocada", 10, 0.0, random.Random(1))

    def test_mesma_semente_gera_a_mesma_amostra(self):
        for cenario in CENARIOS:
            self.assertEqual(amostra(cenario, 50, semente=3),
                             amostra(cenario, 50, semente=3))

    def test_cauda_pesada_centrada_na_media_pedida(self):
        valores = gerar_cauda_pesada(20000, 2.0, 1.0, random.Random(11))
        self.assertAlmostEqual(statistics.median(valores), 2.0, delta=0.05)


class TestTetoDoWilcoxon(unittest.TestCase):
    """O resultado central da Q3 é um fato da distribuição, não da simulação."""

    def test_com_n_5_a_menor_cauda_vale_um_trinta_e_dois_avos(self):
        maximo = 5 * 6 // 2  # W+ = 15
        self.assertAlmostEqual(wilcoxon_p_exato(maximo, 5), 1 / 32)
        # nenhum valor de W+ produz uma cauda entre 3,125% e 5%
        self.assertGreater(wilcoxon_p_exato(maximo - 1, 5), 0.05)

    def test_com_n_30_a_granularidade_some(self):
        """Com 2³⁰ somas possíveis há cauda praticamente colada em 5%."""
        for w in range(300, 400):
            if wilcoxon_p_exato(w, 30) <= 0.05:
                self.assertGreater(wilcoxon_p_exato(w, 30), 0.045)
                break
        else:
            self.fail("nenhum valor crítico encontrado para n = 30")


class TestCelula(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.celula = rodar_celula("normal", 10, repeticoes=600, semente=99)

    def test_e_reprodutivel(self):
        outra = rodar_celula("normal", 10, repeticoes=600, semente=99)
        self.assertEqual(self.celula.rejeicoes_t, outra.rejeicoes_t)
        self.assertEqual(self.celula.rejeicoes_w, outra.rejeicoes_w)

    def test_contagens_do_mcnemar_fecham_com_as_taxas(self):
        m = self.celula.mcnemar
        self.assertEqual(m.ambos_rejeitam + m.so_t_rejeita, self.celula.rejeicoes_t)
        self.assertEqual(m.ambos_rejeitam + m.so_w_rejeita, self.celula.rejeicoes_w)
        self.assertEqual(
            m.ambos_rejeitam + m.so_t_rejeita + m.so_w_rejeita + m.nenhum_rejeita,
            self.celula.repeticoes,
        )

    def test_taxa_do_t_fica_perto_do_nominal_sem_violacao(self):
        """Calibração, não código: no cenário normal o t tem de rondar os 5%."""
        self.assertLess(abs(self.celula.taxa_t - 0.05), 0.03)

    def test_wilcoxon_com_n_5_nao_passa_do_teto_teorico(self):
        celula = rodar_celula("cauda_pesada", 5, repeticoes=600, semente=5)
        self.assertLessEqual(celula.taxa_w, 1 / 32 + 0.01)


class TestSaidas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.celulas = [rodar_celula("normal", 5, repeticoes=200, semente=1),
                       rodar_celula("contaminada", 10, repeticoes=200, semente=2)]

    def test_duas_linhas_por_celula_uma_por_teste(self):
        linhas = linhas_taxas(self.celulas)
        self.assertEqual(len(linhas), 2 * len(self.celulas))
        self.assertEqual({l["teste"] for l in linhas},
                         {"t pareado", "Wilcoxon pareado"})

    def test_toda_taxa_e_erro_tipo_i_porque_a_simetria_foi_preservada(self):
        for linha in linhas_taxas(self.celulas):
            self.assertTrue(linha["h0_do_teste_verdadeira"])

    def test_ic_de_wilson_contem_a_taxa(self):
        for linha in linhas_taxas(self.celulas):
            self.assertLessEqual(linha["ic95_wilson_inferior"], linha["taxa_rejeicao"])
            self.assertGreaterEqual(linha["ic95_wilson_superior"], linha["taxa_rejeicao"])

    def test_mcnemar_sai_uma_linha_por_celula(self):
        linhas = linhas_mcnemar(self.celulas)
        self.assertEqual(len(linhas), len(self.celulas))
        for linha in linhas:
            total = (linha["ambos_rejeitam"] + linha["so_t_rejeita"]
                     + linha["so_w_rejeita"] + linha["nenhum_rejeita"])
            self.assertEqual(total, 200)


class TestEstudo(unittest.TestCase):
    def test_cobre_todos_os_cenarios_e_tamanhos(self):
        celulas = rodar_estudo(repeticoes=40, semente=42)
        self.assertEqual(len(celulas), len(CENARIOS) * len(TAMANHOS))
        self.assertEqual({(c.cenario, c.n) for c in celulas},
                         {(c, n) for c in CENARIOS for n in TAMANHOS})

    def test_cada_celula_tem_a_propria_semente(self):
        sementes = [c.semente for c in rodar_estudo(repeticoes=20, semente=42)]
        self.assertEqual(len(set(sementes)), len(sementes))

    def test_celula_isolada_reproduz_a_do_estudo(self):
        """Rodar uma célula sozinha tem de dar o mesmo que rodar o estudo inteiro."""
        celulas = rodar_estudo(repeticoes=50, semente=42)
        alvo: Celula = celulas[4]
        sozinha = rodar_celula(alvo.cenario, alvo.n, repeticoes=50, semente=alvo.semente)
        self.assertEqual(sozinha.rejeicoes_t, alvo.rejeicoes_t)
        self.assertEqual(sozinha.rejeicoes_w, alvo.rejeicoes_w)


if __name__ == "__main__":
    unittest.main()
