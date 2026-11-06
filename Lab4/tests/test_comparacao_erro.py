"""Confere a comparação das taxas de erro tipo I e o G3 (Lab04, Issue #108).

Os valores de referência foram calculados à mão (casos pequenos) ou com o
SciPy (`binomtest(...).proportion_ci(method="wilson")`, `binomtest` para o
McNemar exato), e ficam fixos aqui para a suíte rodar sem dependências.
"""

from __future__ import annotations

import csv
import math
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from comparacao_erro import (  # noqa: E402
    CENTRALIZADO,
    COMPATIVEL,
    EMPATE_TECNICO,
    NAO_SE_APLICA,
    SIMETRIZADO,
    TESTE_T,
    TESTE_W,
    carregar_comparacoes,
    carregar_decisoes,
    classificar,
    comparar,
    Decisoes,
    diferenca_pareada,
    faixa_acaso,
    formatar_p,
    mcnemar,
    wilson,
)
from graficos import (  # noqa: E402
    REFERENCIA,
    BarraErro,
    Escala,
    PainelErro,
    grafico_g3,
    teto_eixo_pct,
)

LAB4_DIR = Path(__file__).resolve().parent.parent
DADOS = LAB4_DIR / "data"


class TestWilson(unittest.TestCase):
    def test_bate_com_scipy(self):
        inf, sup = wilson(502, 10_000)
        self.assertAlmostEqual(inf, 0.046090332946713386, places=12)
        self.assertAlmostEqual(sup, 0.05465511198754727, places=12)

    def test_zero_sucessos_nao_fica_negativo(self):
        inf, sup = wilson(0, 20)
        self.assertEqual(inf, 0.0)
        self.assertGreater(sup, 0.0)

    def test_todos_sucessos_nao_passa_de_um(self):
        inf, sup = wilson(20, 20)
        self.assertLessEqual(sup, 1.0)
        self.assertLess(inf, 1.0)

    def test_rejeita_entrada_invalida(self):
        with self.assertRaises(ValueError):
            wilson(11, 10)
        with self.assertRaises(ValueError):
            wilson(0, 0)


class TestClassificacao(unittest.TestCase):
    def test_tres_casos(self):
        self.assertEqual(classificar(0.06, 0.07, 0.05), "liberal")
        self.assertEqual(classificar(0.03, 0.04, 0.05), "conservador")
        self.assertEqual(classificar(0.045, 0.055, 0.05), "compatível com α")


class TestMcNemar(unittest.TestCase):
    def test_caso_feito_a_mao(self):
        """a = 1, b = 0, c = 7, d = 2: p exato = 2 · (1/2)⁷; χ² = (7 − 1)²/7."""
        rt = [True] + [False] * 9
        rw = [True] * 8 + [False] * 2
        m = mcnemar(rt, rw)
        self.assertEqual((m.ambos_rejeitam, m.so_t_rejeita, m.so_w_rejeita, m.nenhum_rejeita),
                         (1, 0, 7, 2))
        self.assertAlmostEqual(m.p_exato, 2 * 0.5**7)
        self.assertAlmostEqual(m.qui2_cc, 36 / 7)

    def test_discordantes_equilibrados_dao_p_um(self):
        m = mcnemar([True, False], [False, True])
        self.assertAlmostEqual(m.p_exato, 1.0)
        self.assertAlmostEqual(m.qui2_cc, 0.0)

    def test_sem_discordantes(self):
        m = mcnemar([True, False, False], [True, False, False])
        self.assertEqual(m.discordantes, 0)
        self.assertEqual(m.p_exato, 1.0)

    def test_p_minusculo_nao_vira_zero_no_log(self):
        """Com 1733 discordantes e 39 × 1694, o p fica abaixo do menor float."""
        rt = [True] * 39 + [False] * 1694
        rw = [False] * 39 + [True] * 1694
        m = mcnemar(rt, rw)
        self.assertEqual(m.p_exato, 0.0)
        self.assertTrue(math.isfinite(m.log10_p_exato))
        self.assertLess(m.log10_p_exato, -400)
        self.assertIn("10^", formatar_p(m))

    def test_tamanhos_diferentes(self):
        with self.assertRaises(ValueError):
            mcnemar([True], [True, False])


class TestDiferenca(unittest.TestCase):
    def test_sinal_e_simetria(self):
        dif, inf, sup = diferenca_pareada(so_t=10, so_w=30, total=1000)
        self.assertAlmostEqual(dif, 0.02)
        self.assertAlmostEqual(dif - inf, sup - dif)
        self.assertLess(inf, dif)

    def test_faixa_acaso(self):
        inf, sup = faixa_acaso(0.05, 10_000)
        self.assertAlmostEqual((inf + sup) / 2, 0.05)
        self.assertAlmostEqual(sup - 0.05, 0.004271, places=5)


class TestDadosReaisDaQ1(unittest.TestCase):
    """A comparação lida dos arquivos versionados da Q1 (Issue #107)."""

    @classmethod
    def setUpClass(cls):
        cls.comparacoes, cls.alfa = carregar_comparacoes(DADOS)

    def test_mesmos_10000_conjuntos_para_os_dois_testes(self):
        for comp in self.comparacoes.values():
            self.assertEqual(comp.t.repeticoes, 10_000)
            self.assertEqual(comp.w.repeticoes, comp.t.repeticoes)
            m = comp.mcnemar
            self.assertEqual(m.ambos_rejeitam + m.so_t_rejeita + m.so_w_rejeita
                             + m.nenhum_rejeita, comp.t.repeticoes)
            self.assertEqual(m.ambos_rejeitam + m.so_t_rejeita, comp.t.rejeicoes)
            self.assertEqual(m.ambos_rejeitam + m.so_w_rejeita, comp.w.rejeicoes)

    def test_bate_com_resultados_q1(self):
        with open(DADOS / "resultados_q1.csv", newline="", encoding="utf-8") as arquivo:
            linhas = list(csv.DictReader(arquivo))
        for linha in linhas:
            comp = self.comparacoes[linha["cenario"]]
            taxa = comp.t if linha["teste"] == TESTE_T else comp.w
            self.assertEqual(taxa.rejeicoes, int(linha["rejeicoes"]))
            self.assertAlmostEqual(taxa.taxa, float(linha["taxa_rejeicao"]))
            self.assertAlmostEqual(taxa.ic_wilson_inf, float(linha["ic95_wilson_inferior"]))
            self.assertAlmostEqual(taxa.ic_wilson_sup, float(linha["ic95_wilson_superior"]))
            self.assertEqual(taxa.h0_verdadeira, linha["h0_do_teste_verdadeira"] == "True")
            self.assertEqual(taxa.classificacao, linha["classificacao"])

    def test_qual_h0_vale_em_cada_cenario(self):
        """Simetrizado: as duas H0 valem. Centralizado: média 0 vale, simetria não."""
        s, c = self.comparacoes[SIMETRIZADO], self.comparacoes[CENTRALIZADO]
        self.assertTrue(s.t.h0_verdadeira and s.w.h0_verdadeira)
        self.assertTrue(c.t.h0_verdadeira)
        self.assertFalse(c.w.h0_verdadeira)

    def test_simetrizado_compativel_com_alfa(self):
        """Calibração: com as duas H0 verdadeiras, as taxas têm de cair perto de 5%."""
        s = self.comparacoes[SIMETRIZADO]
        self.assertEqual(s.t.classificacao, COMPATIVEL)
        self.assertEqual(s.w.classificacao, COMPATIVEL)
        self.assertAlmostEqual(s.mcnemar.p_exato, 0.40899949606305985, places=10)
        self.assertEqual((s.mcnemar.so_t_rejeita, s.mcnemar.so_w_rejeita), (157, 173))
        self.assertEqual(s.mais_proximo, EMPATE_TECNICO)

    def test_wilcoxon_do_centralizado_nao_e_erro_tipo_i(self):
        c = self.comparacoes[CENTRALIZADO]
        self.assertEqual(c.w.classificacao, NAO_SE_APLICA)
        self.assertIsNone(c.w.distancia_alfa_pp)
        self.assertIsNone(c.mais_proximo)
        self.assertFalse(c.compara_erro_tipo_i)
        self.assertEqual(c.t.classificacao, "liberal")

    def test_ordem_de_apresentacao(self):
        self.assertEqual(list(self.comparacoes), [SIMETRIZADO, CENTRALIZADO])


class TestRegraDaH0(unittest.TestCase):
    """A classificação só existe quando a H0 do próprio teste é verdadeira."""

    def _decisoes(self):
        # 30 de 100 rejeições no t e 8 no Wilcoxon
        p_t = [0.01] * 30 + [0.5] * 70
        p_w = [0.01] * 8 + [0.5] * 92
        return Decisoes("x", 0.05, p_t, p_w)

    def test_h0_falsa_nao_classifica(self):
        comp = comparar(self._decisoes(), {TESTE_T: False, TESTE_W: True})
        self.assertEqual(comp.t.classificacao, NAO_SE_APLICA)
        self.assertIsNone(comp.t.razao_alfa)
        self.assertEqual(comp.w.classificacao, COMPATIVEL)
        self.assertIsNone(comp.mais_proximo)

    def test_h0_verdadeira_classifica(self):
        comp = comparar(self._decisoes(), {TESTE_T: True, TESTE_W: True})
        self.assertEqual(comp.t.classificacao, "liberal")
        self.assertEqual(comp.mais_proximo, TESTE_W)


class TestConferenciaDosArquivos(unittest.TestCase):
    def _escrever(self, pasta: Path, linhas: list[list[str]]) -> Path:
        caminho = pasta / "pvalores.csv"
        with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
            escritor = csv.writer(arquivo)
            escritor.writerow(["repeticao", "p_valor_t", "rejeitou_t", "p_valor_wilcoxon",
                               "rejeitou_wilcoxon", "metodo_wilcoxon"])
            escritor.writerows(linhas)
        return caminho

    def test_decisao_gravada_divergente_interrompe(self):
        with tempfile.TemporaryDirectory() as tmp:
            caminho = self._escrever(Path(tmp), [["1", "0.01", "False", "0.5", "False", "normal"]])
            with self.assertRaises(ValueError):
                carregar_decisoes(caminho, CENTRALIZADO, 0.05)

    def test_repeticao_fora_de_ordem_interrompe(self):
        with tempfile.TemporaryDirectory() as tmp:
            caminho = self._escrever(Path(tmp), [["2", "0.5", "False", "0.5", "False", "normal"]])
            with self.assertRaises(ValueError):
                carregar_decisoes(caminho, CENTRALIZADO, 0.05)

    def test_arquivo_ausente_explica_o_que_falta(self):
        with self.assertRaises(FileNotFoundError) as contexto:
            carregar_decisoes(Path("nao_existe.csv"), CENTRALIZADO, 0.05)
        self.assertIn("erro_tipo_i.py", str(contexto.exception))


class TestG3(unittest.TestCase):
    def setUp(self):
        self.paineis = [
            PainelErro("A", "a", (BarraErro("t pareado", 0.1139, 0.1078, 0.1203, 1139, 10_000),
                                  BarraErro("Wilcoxon pareado", 0.2794, 0.2707, 0.2883, 2794, 10_000))),
            PainelErro("B", "b", (BarraErro("t pareado", 0.0502, 0.0461, 0.0547, 502, 10_000),
                                  BarraErro("Wilcoxon pareado", 0.0518, 0.0476, 0.0563, 518, 10_000))),
        ]
        self.svg = grafico_g3(self.paineis, alfa=0.05, faixa=faixa_acaso(0.05, 10_000))

    def test_svg_bem_formado(self):
        ET.fromstring(self.svg)

    def test_rotulos_e_titulo(self):
        self.assertIn("G3 —", self.svg)
        for valor in ("11,39%", "27,94%", "5,02%", "5,18%", "α = 5%"):
            self.assertIn(valor, self.svg)

    def test_linha_de_referencia_exatamente_em_5_por_cento(self):
        """A linha vermelha tem de estar na altura que a escala dá para 5%."""
        raiz = ET.fromstring(self.svg)
        ns = "{http://www.w3.org/2000/svg}"
        refs = [l for l in raiz.iter(f"{ns}line") if l.get("stroke") == REFERENCIA
                and float(l.get("x2")) - float(l.get("x1")) > 100]
        self.assertEqual(len(refs), 2)  # uma por painel
        # Reconstrói a escala do primeiro painel (mesmas margens de painel_erro)
        teto, _ = teto_eixo_pct(100 * 0.2883, 5)
        y0, altura = 54, 350   # topo e altura do painel em grafico_g3
        escala = Escala(0, teto, y0 + altura - 66, y0 + 58)
        self.assertAlmostEqual(float(refs[0].get("y1")), escala.px(5.0), delta=0.06)
        self.assertEqual(refs[0].get("y1"), refs[0].get("y2"))

    def test_teto_cobre_o_maior_ic_e_deixa_espaco_sobre_alfa(self):
        teto, marcas = teto_eixo_pct(28.83, 5)
        self.assertGreater(teto, 28.83)
        self.assertEqual(teto, marcas[-1])
        teto, _ = teto_eixo_pct(5.6, 5)
        self.assertGreaterEqual(teto, 7.5)

    def test_sem_listras_quando_todas_as_h0_valem(self):
        self.assertNotIn("url(#g3-listras", self.svg)
        self.assertNotIn("não é erro tipo I", self.svg)

    def test_barra_com_h0_falsa_sai_listrada_e_avisada(self):
        painel = PainelErro("C", "c", (
            BarraErro("t pareado", 0.1139, 0.1078, 0.1203, 1139, 10_000),
            BarraErro("Wilcoxon pareado", 0.2794, 0.2707, 0.2883, 2794, 10_000,
                      h0_verdadeira=False)))
        svg = grafico_g3([painel], alfa=0.05, faixa=faixa_acaso(0.05, 10_000))
        ET.fromstring(svg)
        self.assertEqual(svg.count('fill="url(#g3-listras-d97706)"'), 2)  # barra + legenda
        self.assertIn("não é erro tipo I (H₀ do teste falsa)", svg)
        # a barra com H0 falsa não ganha distância para 5%
        self.assertNotIn("+22,94 p.p.", svg)
        self.assertIn("+6,39 p.p.", svg)

    def test_sem_paineis(self):
        with self.assertRaises(ValueError):
            grafico_g3([], alfa=0.05, faixa=(0.045, 0.055))


class TestDashboardComG3(unittest.TestCase):
    def test_secao_4_traz_o_g3_e_mantem_o_resto_pendente(self):
        from dashboard import dados_reais, diferencas_simuladas, ler_csv, montar

        pagina = montar(
            reais=dados_reais(),
            simulados=diferencas_simuladas(),
            reais_resultados=ler_csv(DADOS / "resultados_reais.csv"),
            exemplo=ler_csv(DADOS / "simulacao" / "resultados_exemplo.csv"),
            erro_tipo_i=carregar_comparacoes(DADOS),
        )
        self.assertIn("G3 —", pagina)
        self.assertIn("11,39%", pagina)
        self.assertIn("27,94%", pagina)
        self.assertIn("não é erro tipo I", pagina)
        # a leitura antiga ("o t controla melhor o erro tipo I") não pode voltar
        self.assertNotIn("o t controla melhor", pagina)
        # G4 e a conclusão continuam pendentes
        self.assertIn("Sprint 02.", pagina)
        self.assertLess(pagina.find("Erro tipo I"), pagina.find("G3 —"))
        self.assertLess(pagina.find("G3 —"), pagina.find("Poder"))


if __name__ == "__main__":
    unittest.main()
