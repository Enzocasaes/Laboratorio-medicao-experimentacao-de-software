"""Confere o estudo de poder da Q2 (Lab04 — Issue #109).

Curva de poder não tem "resposta certa" tabelada como um p-valor tem, mas tem
propriedades que, quebradas, indicam bug e não resultado:

  - **reprodutibilidade**: a mesma semente tem de dar exatamente a mesma taxa;
  - **monotonicidade**: poder cresce com o efeito e com o tamanho da amostra;
  - **o ponto de partida**: em efeito 0 a curva volta a ser a taxa de erro tipo
    I, e tem de cair perto de α;
  - **a tese do laboratório**: com cauda pesada e com outliers o Wilcoxon tem
    de ter MAIS poder que o t; com diferenças normais, menos;
  - **concordância entre estudos**: em efeito 0 as taxas daqui têm de bater com
    as que a Q1 e a Q3 já publicaram, a menos do erro de Monte Carlo.
"""

from __future__ import annotations

import math
import statistics
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from comparacao_erro import NATUREZA_ERRO, NATUREZA_REJEICAO, TESTE_T, TESTE_W  # noqa: E402
from distribuicoes import normal_cdf  # noqa: E402
from testes import hodges_lehmann  # noqa: E402
from poder import (  # noqa: E402
    ALFA,
    CENARIOS,
    CENTRALIZADO,
    COLUNAS_TAXAS,
    carregar_celulas,
    DESVIO,
    NATUREZA_PODER,
    SIMETRIZADO,
    conferir_efeito_zero,
    curva,
    efeito_minimo_detectavel,
    gerar,
    gerar_bootstrap,
    h0_verdadeira,
    linhas_taxas,
    natureza,
    residuos_reais,
    rodar_celula,
    rodar_estudo,
    semente_da_celula,
)

RESIDUOS = residuos_reais()


def _assimetria(valores: list[float]) -> float:
    media, desvio = statistics.fmean(valores), statistics.stdev(valores)
    return sum(((v - media) / desvio) ** 3 for v in valores) / len(valores)


class TestResiduos(unittest.TestCase):
    def test_trinta_residuos_de_media_zero(self):
        self.assertEqual(len(RESIDUOS), 30)
        self.assertAlmostEqual(statistics.fmean(RESIDUOS), 0.0, places=12)

    def test_desvio_e_o_usado_na_escala(self):
        """DESVIO é o desvio das diferenças reais — é o que liga δ a segundos."""
        self.assertAlmostEqual(statistics.stdev(RESIDUOS), DESVIO, places=4)


class TestGeracao(unittest.TestCase):
    def test_mesma_semente_mesmos_dados(self):
        import random
        for cenario in CENARIOS:
            with self.subTest(cenario=cenario):
                a = gerar(cenario, 40, 0.3, random.Random(7), RESIDUOS)
                b = gerar(cenario, 40, 0.3, random.Random(7), RESIDUOS)
                self.assertEqual(a, b)

    def test_sementes_diferentes_dados_diferentes(self):
        import random
        a = gerar(SIMETRIZADO, 40, 0.0, random.Random(1), RESIDUOS)
        b = gerar(SIMETRIZADO, 40, 0.0, random.Random(2), RESIDUOS)
        self.assertNotEqual(a, b)

    def test_efeito_desloca_a_media(self):
        import random
        for cenario in CENARIOS:
            with self.subTest(cenario=cenario):
                d = gerar(cenario, 20000, 0.5, random.Random(3), RESIDUOS)
                self.assertAlmostEqual(statistics.fmean(d), 0.5 * DESVIO, delta=0.02)

    def test_simetrizado_e_simetrico_centralizado_nao(self):
        """É o que separa as duas H0: no centralizado a do Wilcoxon já é falsa.

        Os resíduos reais são assimétricos **à esquerda** (poucos builds sem
        cache muito mais rápidos que o normal puxam uma cauda inferior longa).
        A troca de sinal do simetrizado apaga isso; sem ela, a assimetria fica
        de pé — e é ela que torna a H0 do Wilcoxon falsa com média 0.
        """
        import random
        simetrico = gerar_bootstrap(SIMETRIZADO, 20000, 0.0, random.Random(4), RESIDUOS)
        torto = gerar_bootstrap(CENTRALIZADO, 20000, 0.0, random.Random(4), RESIDUOS)
        self.assertAlmostEqual(_assimetria(simetrico), 0.0, delta=0.1)
        self.assertLess(_assimetria(torto), -0.5)

    def test_no_centralizado_a_pseudomediana_e_positiva(self):
        """A razão concreta de a H0 do Wilcoxon ser falsa em efeito 0.

        O Wilcoxon é sensível à pseudomediana (o Hodges-Lehmann), não à média.
        Com assimetria à esquerda e média 0, a pseudomediana fica acima de
        zero — então o teste rejeita na direção `greater` sem que exista
        deslocamento nenhum. É o que a Q1 mediu como 27,94% de rejeição.
        """
        self.assertAlmostEqual(statistics.fmean(RESIDUOS), 0.0, places=12)
        self.assertGreater(hodges_lehmann(RESIDUOS), 0.0)
        # e o simetrizado desfaz isso: o HL da distribuição geradora é 0
        import random
        simetrico = gerar_bootstrap(SIMETRIZADO, 4000, 0.0, random.Random(8), RESIDUOS)
        self.assertAlmostEqual(hodges_lehmann(simetrico), 0.0, delta=0.02)

    def test_bootstrap_so_usa_valores_dos_residuos(self):
        """Reamostragem é sorteio com reposição: nenhum valor novo aparece."""
        import random
        d = gerar_bootstrap(CENTRALIZADO, 200, 0.0, random.Random(5), RESIDUOS)
        for valor in d:
            self.assertTrue(any(math.isclose(valor, r) for r in RESIDUOS))

    def test_cenario_desconhecido(self):
        import random
        with self.assertRaises(ValueError):
            gerar("exponencial", 10, 0.0, random.Random(1), RESIDUOS)
        with self.assertRaises(ValueError):
            gerar_bootstrap("normal", 10, 0.0, random.Random(1), RESIDUOS)


class TestQualH0Vale(unittest.TestCase):
    def test_sem_efeito_as_duas_h0_valem_nos_simetricos(self):
        for cenario in ("normal", "cauda_pesada", "contaminada", SIMETRIZADO):
            with self.subTest(cenario=cenario):
                self.assertEqual(h0_verdadeira(cenario, 0.0),
                                 {TESTE_T: True, TESTE_W: True})

    def test_no_centralizado_a_do_wilcoxon_ja_e_falsa_sem_efeito(self):
        self.assertEqual(h0_verdadeira(CENTRALIZADO, 0.0),
                         {TESTE_T: True, TESTE_W: False})

    def test_com_efeito_nenhuma_h0_vale(self):
        for cenario in CENARIOS:
            with self.subTest(cenario=cenario):
                self.assertEqual(h0_verdadeira(cenario, 0.3),
                                 {TESTE_T: False, TESTE_W: False})

    def test_natureza_da_taxa(self):
        self.assertEqual(natureza(True, 0.0), NATUREZA_ERRO)
        self.assertEqual(natureza(False, 0.3), NATUREZA_PODER)
        # efeito 0 com a H0 do teste já falsa: não é erro tipo I nem poder
        self.assertEqual(natureza(False, 0.0), NATUREZA_REJEICAO)


class TestMDE(unittest.TestCase):
    def test_interpola_entre_dois_pontos(self):
        """Entre (0,4; 70%) e (0,5; 90%), 80% cai exatamente no meio."""
        pontos = [(0.0, 0.05), (0.2, 0.30), (0.4, 0.70), (0.5, 0.90)]
        self.assertAlmostEqual(efeito_minimo_detectavel(pontos), 0.45)

    def test_ponto_exato_na_grade(self):
        self.assertAlmostEqual(
            efeito_minimo_detectavel([(0.0, 0.05), (0.3, 0.80)]), 0.30)

    def test_nunca_alcanca_o_alvo(self):
        self.assertIsNone(efeito_minimo_detectavel([(0.0, 0.05), (1.5, 0.42)]))

    def test_alvo_alcancado_no_primeiro_ponto(self):
        self.assertAlmostEqual(efeito_minimo_detectavel([(0.0, 0.95)]), 0.0)


class TestSementes(unittest.TestCase):
    def test_celulas_diferentes_sementes_diferentes(self):
        vistas = {semente_da_celula(42, c, n, e)
                  for c in CENARIOS for n in (5, 10, 30, 50)
                  for e in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1.0, 1.25, 1.5)}
        self.assertEqual(len(vistas), len(CENARIOS) * 4 * 11)

    def test_celula_isolada_bate_com_o_estudo(self):
        """Rodar uma célula sozinha tem de dar o mesmo que rodar o estudo todo."""
        estudo = rodar_estudo(repeticoes=120, residuos=RESIDUOS,
                              cenarios=("normal",), tamanhos=(10,),
                              efeitos=(0.0, 0.3))
        sozinha = rodar_celula("normal", 10, 0.3, 120,
                               semente_da_celula(42, "normal", 10, 0.3), RESIDUOS)
        igual = [c for c in estudo if c.efeito == 0.3][0]
        self.assertEqual(sozinha.rejeicoes_t, igual.rejeicoes_t)
        self.assertEqual(sozinha.rejeicoes_w, igual.rejeicoes_w)


class TestMonteCarlo(unittest.TestCase):
    def test_reprodutivel(self):
        a = rodar_celula("normal", 15, 0.3, 200, 11, RESIDUOS)
        b = rodar_celula("normal", 15, 0.3, 200, 11, RESIDUOS)
        self.assertEqual((a.rejeicoes_t, a.rejeicoes_w),
                         (b.rejeicoes_t, b.rejeicoes_w))

    def test_poder_cresce_com_o_efeito(self):
        for cenario in CENARIOS:
            with self.subTest(cenario=cenario):
                taxas = [rodar_celula(cenario, 30, efeito, 400, 13, RESIDUOS).taxa_t
                         for efeito in (0.0, 0.3, 0.8)]
                self.assertEqual(taxas, sorted(taxas))
                self.assertLess(taxas[0], taxas[-1])

    def test_poder_cresce_com_n(self):
        pequeno = rodar_celula("normal", 10, 0.3, 400, 14, RESIDUOS)
        grande = rodar_celula("normal", 50, 0.3, 400, 14, RESIDUOS)
        self.assertLess(pequeno.taxa_t, grande.taxa_t)

    def test_em_efeito_zero_a_curva_volta_para_alfa(self):
        """O ponto de partida é erro tipo I: fora de α, o problema não é poder."""
        celula = rodar_celula("normal", 30, 0.0, 3000, 12, RESIDUOS)
        for teste in (TESTE_T, TESTE_W):
            with self.subTest(teste=teste):
                self.assertAlmostEqual(celula.taxa(teste), ALFA,
                                       delta=4 * celula.erro_padrao(teste))

    def test_wilcoxon_ganha_com_cauda_pesada_e_com_outliers(self):
        """A tese do laboratório: a robustez aparece como PODER, não como nível."""
        for cenario in ("cauda_pesada", "contaminada"):
            with self.subTest(cenario=cenario):
                c = rodar_celula(cenario, 30, 0.3, 1500, 15, RESIDUOS)
                self.assertGreater(c.taxa_w, c.taxa_t)

    def test_t_ganha_quando_os_pressupostos_dele_valem(self):
        c = rodar_celula("normal", 10, 0.5, 2000, 16, RESIDUOS)
        self.assertGreater(c.taxa_t, c.taxa_w)

    def test_poder_do_t_bate_com_a_teoria_no_cenario_normal(self):
        """Aproximação normal do poder: Φ(δ√n − z₀,₉₅).

        O valor exato vem da t não central; a aproximação erra poucos pontos
        percentuais com n = 30, e serve para pegar erro grosseiro — um p-valor
        trocado de cauda, por exemplo, sairia dezenas de p.p. fora.
        """
        z = 1.6448536269514722  # z_{0,95}
        for efeito, repeticoes in ((0.3, 3000), (0.5, 3000)):
            with self.subTest(efeito=efeito):
                esperado = normal_cdf(efeito * math.sqrt(30) - z)
                obtido = rodar_celula("normal", 30, efeito, repeticoes, 17,
                                      RESIDUOS).taxa_t
                self.assertAlmostEqual(obtido, esperado, delta=0.03)


class TestSaidas(unittest.TestCase):
    def test_duas_linhas_por_celula_com_todas_as_colunas(self):
        celulas = rodar_estudo(repeticoes=60, residuos=RESIDUOS,
                               cenarios=("normal",), tamanhos=(10,),
                               efeitos=(0.0, 0.3))
        linhas = linhas_taxas(celulas)
        self.assertEqual(len(linhas), 2 * len(celulas))
        for linha in linhas:
            self.assertEqual(set(linha), set(COLUNAS_TAXAS))

    def test_natureza_das_linhas_de_efeito_zero(self):
        celulas = rodar_estudo(repeticoes=60, residuos=RESIDUOS,
                               cenarios=(CENTRALIZADO,), tamanhos=(10,),
                               efeitos=(0.0,))
        por_teste = {l["teste"]: l for l in linhas_taxas(celulas)}
        self.assertEqual(por_teste[TESTE_T]["natureza"], NATUREZA_ERRO)
        self.assertEqual(por_teste[TESTE_W]["natureza"], NATUREZA_REJEICAO)

    def test_curva_sai_ordenada_por_efeito(self):
        celulas = rodar_estudo(repeticoes=60, residuos=RESIDUOS,
                               cenarios=("normal",), tamanhos=(10,),
                               efeitos=(0.8, 0.0, 0.3))
        efeitos = [e for e, _ in curva(celulas, "normal", 10, TESTE_T)]
        self.assertEqual(efeitos, [0.0, 0.3, 0.8])


class TestRecarregarDoCSV(unittest.TestCase):
    """`--so-relatorio` só vale se o que volta do CSV for o que foi gravado."""

    def test_ida_e_volta_preserva_as_contagens(self):
        import tempfile
        from pathlib import Path as _Path
        from poder import COLUNAS_TAXAS as _colunas, escrever_csv, linhas_taxas

        celulas = rodar_estudo(repeticoes=80, residuos=RESIDUOS,
                               cenarios=("normal", CENTRALIZADO), tamanhos=(10,),
                               efeitos=(0.0, 0.3))
        with tempfile.TemporaryDirectory() as pasta:
            escrever_csv(_Path(pasta) / "resultados_q2.csv", _colunas,
                         linhas_taxas(celulas))
            voltaram = carregar_celulas(_Path(pasta))

        self.assertEqual(len(voltaram), len(celulas))
        for antes, depois in zip(celulas, voltaram):
            with self.subTest(cenario=antes.cenario, efeito=antes.efeito):
                self.assertEqual(
                    (antes.cenario, antes.n, antes.efeito, antes.semente,
                     antes.rejeicoes_t, antes.rejeicoes_w, antes.repeticoes),
                    (depois.cenario, depois.n, depois.efeito, depois.semente,
                     depois.rejeicoes_t, depois.rejeicoes_w, depois.repeticoes))

    def test_o_relatorio_regerado_e_identico(self):
        """A prova de que regerar do CSV não muda uma vírgula do texto."""
        import tempfile
        from pathlib import Path as _Path
        from poder import COLUNAS_TAXAS as _colunas, escrever_csv, escrever_relatorio, linhas_taxas

        celulas = rodar_estudo(repeticoes=80, residuos=RESIDUOS,
                               cenarios=("normal", "cauda_pesada", "contaminada",
                                         SIMETRIZADO, CENTRALIZADO),
                               tamanhos=(5, 30), efeitos=(0.0, 0.3, 1.5))
        with tempfile.TemporaryDirectory() as pasta:
            caminho = _Path(pasta)
            escrever_csv(caminho / "resultados_q2.csv", _colunas, linhas_taxas(celulas))
            direto, recarregado = caminho / "a.md", caminho / "b.md"
            escrever_relatorio(direto, celulas, [], [],
                               tamanhos=(5, 30), efeitos=(0.0, 0.3, 1.5))
            escrever_relatorio(recarregado, carregar_celulas(caminho), [], [],
                               tamanhos=(5, 30), efeitos=(0.0, 0.3, 1.5))
            self.assertEqual(direto.read_text(encoding="utf-8"),
                             recarregado.read_text(encoding="utf-8"))


class TestConferenciaCruzada(unittest.TestCase):
    """O ponto de efeito 0 contra as taxas que a Q1 e a Q3 já publicaram.

    Os dois estudos sorteiam números diferentes (aqui é `random.Random`, na Q1
    é o NumPy), então o que tem de valer é |z| ≤ 1,96 na comparação de duas
    proporções independentes. É o teste que pega um gerador reescrito errado.
    """

    def test_bate_com_a_q3_nos_cenarios_de_violacao(self):
        celulas = rodar_estudo(repeticoes=4000, residuos=RESIDUOS,
                               cenarios=("normal", "contaminada"),
                               tamanhos=(30,), efeitos=(0.0,))
        comparacoes = conferir_efeito_zero(celulas)
        self.assertEqual(len(comparacoes), 4)
        for c in comparacoes:
            with self.subTest(cenario=c["cenario"], teste=c["teste"]):
                self.assertTrue(c["compativel"],
                                f"z = {c['z']:.2f}: aqui {c['taxa_aqui']:.4f}, "
                                f"publicada {c['taxa_publicada']:.4f}")

    def test_bate_com_a_q1_no_bootstrap(self):
        celulas = rodar_estudo(repeticoes=4000, residuos=RESIDUOS,
                               cenarios=(SIMETRIZADO, CENTRALIZADO),
                               tamanhos=(30,), efeitos=(0.0,))
        comparacoes = conferir_efeito_zero(celulas)
        self.assertEqual(len(comparacoes), 4)
        for c in comparacoes:
            with self.subTest(cenario=c["cenario"], teste=c["teste"]):
                self.assertTrue(c["compativel"],
                                f"z = {c['z']:.2f}: aqui {c['taxa_aqui']:.4f}, "
                                f"publicada {c['taxa_publicada']:.4f}")


if __name__ == "__main__":
    unittest.main()
