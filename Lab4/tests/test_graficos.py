"""Confere os gráficos G1 e G2 e a montagem do dashboard (Lab04, Issues #100 e #101).

Gráfico não tem "resultado certo" como um p-valor tem, mas tem invariantes que,
quebradas, produzem uma figura que mente:

- uma escala que não leva o mínimo e o máximo às bordas desenha fora do painel;
- um histograma que perde observações mostra uma distribuição que não existe;
- um eixo com marca 2,5 impressa como "2" faz o leitor ler contagem errada;
- um SVG mal formado simplesmente não aparece no navegador.

São essas que os testes abaixo cobrem, além dos dois valores críticos de G2,
que precisam bater com as funções do Integrante 2.
"""

from __future__ import annotations

import math
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dashboard import (  # noqa: E402
    CENARIOS_VIOLACAO,
    TAMANHOS_G4,
    TESTE_T_NOME,
    TESTE_W_NOME,
    _curvas_do_g4,
    carregar_poder,
    carregar_violacao,
    dados_para_o_interativo,
    javascript_do_poder,
    menor_w_rejeitado,
    montar,
)
from comparacao_erro import carregar_comparacoes  # noqa: E402
from distribuicoes import wilcoxon_p_exato  # noqa: E402
from graficos import (  # noqa: E402
    CurvaPoder,
    Escala,
    assimetria,
    classes_histograma,
    densidade_t,
    eixo_vertical_pct,
    escapar,
    faixa_entre,
    grafico_g1,
    grafico_g2,
    grafico_g4,
    marcas_bonitas,
    mediana,
    numero,
    _indice_de_maior_separacao,
)

LAB4_DIR = Path(__file__).resolve().parent.parent


class TestEscala(unittest.TestCase):
    def test_leva_extremos_as_bordas(self):
        escala = Escala(0, 10, 100, 300)
        self.assertAlmostEqual(escala.px(0), 100)
        self.assertAlmostEqual(escala.px(10), 300)
        self.assertAlmostEqual(escala.px(5), 200)

    def test_eixo_invertido(self):
        """Em SVG o y cresce para baixo: o maior valor tem de ficar mais acima."""
        escala = Escala(0, 1, 200, 50)
        self.assertGreater(escala.px(0), escala.px(1))

    def test_serie_constante_nao_divide_por_zero(self):
        escala = Escala(7, 7, 0, 100)
        self.assertAlmostEqual(escala.px(7), 50)


class TestMarcas(unittest.TestCase):
    def test_passo_redondo(self):
        self.assertEqual(marcas_bonitas(0, 10, 5), [0, 2, 4, 6, 8, 10])

    def test_contagem_nunca_usa_passo_fracionario(self):
        # com alvo 3 e máximo 7, o passo "bonito" seria 2,5 — que impresso
        # sem casas decimais viraria a marca "2" em cima da linha do 2,5
        marcas = marcas_bonitas(0, 7, 3, inteiro=True)
        for marca in marcas:
            self.assertEqual(marca, int(marca), f"marca fracionária: {marca}")

    def test_marcas_dentro_do_intervalo(self):
        for marca in marcas_bonitas(3.2, 8.7):
            self.assertGreaterEqual(marca, 3.2)
            self.assertLessEqual(marca, 8.7)


class TestHistograma(unittest.TestCase):
    def test_nenhuma_observacao_se_perde(self):
        valores = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 9.9]
        _, contagens = classes_histograma(valores, 5)
        self.assertEqual(sum(contagens), len(valores))

    def test_maximo_entra_na_ultima_classe(self):
        """Sem o fechamento à direita, o maior valor cairia fora do histograma."""
        bordas, contagens = classes_histograma([0.0, 1.0, 2.0], 2)
        self.assertEqual(bordas[0], 0.0)
        self.assertEqual(bordas[-1], 2.0)
        self.assertEqual(contagens[-1], 2)  # o 1,0 e o 2,0

    def test_serie_constante_tem_largura_simbolica(self):
        bordas, contagens = classes_histograma([4.0] * 6, 4)
        self.assertLess(bordas[0], 4.0)
        self.assertGreater(bordas[-1], 4.0)
        self.assertEqual(sum(contagens), 6)

    def test_lista_vazia_e_erro(self):
        with self.assertRaises(ValueError):
            classes_histograma([], 5)


class TestResumos(unittest.TestCase):
    def test_mediana_par_e_impar(self):
        self.assertEqual(mediana([3, 1, 2]), 2)
        self.assertEqual(mediana([4, 1, 3, 2]), 2.5)

    def test_assimetria_simetrica_e_zero(self):
        self.assertAlmostEqual(assimetria([-2, -1, 0, 1, 2]), 0.0, places=12)

    def test_assimetria_positiva_na_cauda_a_direita(self):
        self.assertGreater(assimetria([1, 1, 1, 2, 2, 9]), 0)


class TestFormatacao(unittest.TestCase):
    def test_padrao_brasileiro(self):
        self.assertEqual(numero(1234.5, 2), "1.234,50")
        self.assertEqual(numero(0.0076, 4), "0,0076")

    def test_escapa_o_que_quebra_xml(self):
        self.assertEqual(escapar("a < b & c"), "a &lt; b &amp; c")


class TestDensidadeT(unittest.TestCase):
    def test_caso_fechado_da_cauchy(self):
        """Com 1 grau de liberdade a t é a Cauchy, cuja densidade em 0 é 1/π."""
        self.assertAlmostEqual(densidade_t(0.0, 1), 1 / math.pi, places=12)

    def test_simetrica(self):
        self.assertAlmostEqual(densidade_t(1.7, 29), densidade_t(-1.7, 29), places=14)

    def test_integra_um(self):
        """Soma de Riemann em [-12, 12]: tem de dar praticamente 1."""
        passos, limite = 24000, 12.0
        largura = 2 * limite / passos
        total = sum(
            densidade_t(-limite + (i + 0.5) * largura, 29) * largura
            for i in range(passos)
        )
        self.assertAlmostEqual(total, 1.0, places=5)


class TestValorCriticoWilcoxon(unittest.TestCase):
    def test_e_o_primeiro_valor_que_cabe_em_alfa(self):
        n = 30
        critico = menor_w_rejeitado(n)
        self.assertLessEqual(wilcoxon_p_exato(critico, n), 0.05)
        self.assertGreater(wilcoxon_p_exato(critico - 1, n), 0.05)

    def test_amostra_pequena_nao_rejeita_nem_no_extremo(self):
        """Com n = 4 o menor p possível é 1/16 = 0,0625: nada cai em 5%."""
        n = 4
        maximo = n * (n + 1) // 2
        self.assertEqual(menor_w_rejeitado(n), maximo)
        self.assertGreater(wilcoxon_p_exato(maximo, n), 0.05)


class TestSvgBemFormado(unittest.TestCase):
    """Um SVG com XML quebrado não dá erro: ele simplesmente não aparece."""

    def setUp(self):
        self.reais = {
            "sem cache": [31.0 + i * 0.05 for i in range(30)],
            "com cache": [4.0 + (i % 5) * 0.1 for i in range(30)],
            "diferenças": [27.0 + (i % 7) * 0.1 for i in range(30)],
        }
        self.simulados = {
            "normal": [(-1) ** i * (i % 9) * 0.1 for i in range(30)],
            "lognormal_deslocada": [math.exp(i % 5) * 0.05 for i in range(30)],
            "contaminada": [0.1 * (i % 4) - (3.0 if i == 7 else 0) for i in range(30)],
        }

    def test_g1_e_xml_valido_e_tem_os_seis_paineis(self):
        svg = grafico_g1(self.reais, self.simulados)
        raiz = ET.fromstring(svg)
        self.assertTrue(raiz.tag.endswith("svg"))
        textos = " ".join(t.text or "" for t in raiz.iter())
        for esperado in ("sem cache", "com cache", "normal", "lognormal", "contaminada"):
            self.assertIn(esperado, textos)

    def test_g2_e_xml_valido_e_mostra_os_dois_testes(self):
        svg = grafico_g2(
            gl=29, t_critico=1.699, t_observado=2.579, t_p=0.0076,
            contagens=(1, 1, 1, 2, 2, 2, 2, 1, 1, 1), n_wilcoxon=4,
            w_critico=9, w_observado=8, w_p=0.0082,
        )
        raiz = ET.fromstring(svg)
        textos = " ".join(t.text or "" for t in raiz.iter())
        self.assertIn("Teste t pareado", textos)
        self.assertIn("Wilcoxon pareado", textos)
        self.assertIn("0,0076", textos)  # o p-valor aparece junto da área

    def test_titulo_acessivel(self):
        raiz = ET.fromstring(grafico_g1(self.reais, self.simulados))
        self.assertEqual(raiz.get("role"), "img")
        self.assertTrue((raiz.get("aria-label") or "").startswith("G1"))


class TestDashboard(unittest.TestCase):
    """Monta a página com os CSVs reais do repositório."""

    @classmethod
    def setUpClass(cls):
        import csv

        def ler(caminho):
            with open(caminho, newline="", encoding="utf-8") as arquivo:
                return list(csv.DictReader(arquivo))

        dados = LAB4_DIR / "data"
        pares = ler(dados / "dados_reais.csv")
        sem = [float(l["tempo_sem_cache"]) for l in pares]
        com = [float(l["tempo_com_cache"]) for l in pares]
        simulados: dict[str, list[float]] = {}
        for linha in ler(dados / "simulacao" / "cenarios.csv"):
            simulados.setdefault(linha["cenario"], []).append(float(linha["diferenca"]))

        cls.pagina = montar(
            reais={"sem cache": sem, "com cache": com,
                   "diferenças": [s - c for s, c in zip(sem, com)]},
            simulados=simulados,
            reais_resultados=ler(dados / "resultados_reais.csv"),
            exemplo=ler(dados / "simulacao" / "resultados_exemplo.csv"),
        )

    def test_tem_as_sete_secoes_na_ordem_do_enunciado(self):
        titulos = ["Cenário", "Os dados", "Como os testes funcionam", "Erro tipo I",
                   "Poder", "Dados reais", "Conclusão"]
        posicoes = [self.pagina.find(t) for t in titulos]
        self.assertNotIn(-1, posicoes, "faltou uma seção")
        self.assertEqual(posicoes, sorted(posicoes), "seções fora de ordem")

    def test_mostra_os_dois_graficos_da_sprint_01(self):
        self.assertIn("G1 —", self.pagina)
        self.assertIn("G2 —", self.pagina)

    def test_marca_o_que_ainda_falta(self):
        """O dashboard não pode dar a impressão de que G3 e G4 já existem."""
        self.assertIn("Sprint 02", self.pagina)

    def test_traz_os_numeros_dos_dados_reais(self):
        self.assertIn("379", self.pagina)   # estatística t
        self.assertIn("465", self.pagina)   # W+ máximo

    def test_link_do_repositorio_no_topo(self):
        self.assertIn("github.com/Enzocasaes", self.pagina)


# ------------------------------------------------------------------- G4


def _curva_de_teste(**ajustes) -> CurvaPoder:
    efeitos = [0.0, 0.3, 0.6, 0.9]
    base = dict(
        grupo="Cenário", rotulo="n = 30",
        pontos_t=list(zip(efeitos, [0.05, 0.40, 0.80, 0.97])),
        pontos_w=list(zip(efeitos, [0.05, 0.55, 0.92, 0.99])),
        ic_t=[(0.04, 0.06), (0.38, 0.42), (0.78, 0.82), (0.96, 0.98)],
        ic_w=[(0.04, 0.06), (0.53, 0.57), (0.90, 0.94), (0.98, 1.00)],
        mde_t=0.60, mde_w=0.47,
    )
    base.update(ajustes)
    return CurvaPoder(**base)


class TestFaixaEntre(unittest.TestCase):
    def test_fecha_o_poligono(self):
        caminho = faixa_entre([(0.0, 10.0), (10.0, 20.0)],
                              [(0.0, 30.0), (10.0, 40.0)], cor="#000")
        self.assertTrue(caminho.endswith('Z" fill="#000" fill-opacity="0.16" '
                                         'stroke="none"/>'))
        self.assertIn("M0.0,10.0", caminho)

    def test_series_de_tamanhos_diferentes_nao_desenham(self):
        """Melhor nada do que uma banda fechada no lugar errado."""
        self.assertEqual(faixa_entre([(0.0, 1.0)], [], cor="#000"), "")


class TestEixoVertical(unittest.TestCase):
    def test_rotulos_em_porcentagem(self):
        marcacao = eixo_vertical_pct(Escala(0.0, 1.0, 200, 50), 60)
        self.assertIn(">0%<", marcacao)
        self.assertIn(">100%<", marcacao)

    def test_sem_rotulos_so_desenha_as_marcas(self):
        marcacao = eixo_vertical_pct(Escala(0.0, 1.0, 200, 50), 60,
                                     com_rotulos=False)
        self.assertNotIn("<text", marcacao)


class TestRotulosDiretos(unittest.TestCase):
    def test_escolhe_o_ponto_de_maior_separacao(self):
        curva_poder = _curva_de_teste()  # maior distância em δ = 0,3
        self.assertEqual(_indice_de_maior_separacao(curva_poder), 1)

    def test_curvas_coladas_caem_no_meio(self):
        iguais = [(0.0, 0.1), (0.3, 0.2), (0.6, 0.3), (0.9, 0.4)]
        curva_poder = _curva_de_teste(pontos_t=iguais, pontos_w=iguais)
        self.assertEqual(_indice_de_maior_separacao(curva_poder), 2)


class TestG4(unittest.TestCase):
    def test_e_xml_valido_com_titulo_acessivel(self):
        svg = grafico_g4([_curva_de_teste()], alfa=0.05, colunas=1)
        raiz = ET.fromstring(svg)
        self.assertEqual(raiz.find("{http://www.w3.org/2000/svg}title").text[:2], "G4")
        self.assertTrue(raiz.get("aria-label"))

    def test_um_painel_por_curva(self):
        curvas = [_curva_de_teste(grupo=f"C{i}", rotulo=f"n = {i}") for i in (5, 10, 30)]
        svg = grafico_g4(curvas, alfa=0.05, colunas=3)
        for c in curvas:
            self.assertIn(c.rotulo, svg)
            self.assertIn(c.grupo, svg)

    def test_a_curva_que_nao_e_poder_sai_tracejada(self):
        """Mesma cor (é o mesmo teste), traço diferente (não se lê igual)."""
        normal = grafico_g4([_curva_de_teste()], alfa=0.05, colunas=1)
        marcada = grafico_g4([_curva_de_teste(h0_w_falsa_em_zero=True)],
                             alfa=0.05, colunas=1)
        self.assertNotIn('stroke-dasharray="6 3"', normal)
        self.assertIn('stroke-dasharray="6 3"', marcada)
        self.assertIn("não é poder", marcada)

    def test_eixo_vai_ate_cem_por_cento(self):
        """Cortar a escala no máximo observado deixaria a curva mais íngreme
        do que ela é — e é a inclinação que o leitor usa para julgar."""
        svg = grafico_g4([_curva_de_teste()], alfa=0.05, colunas=1)
        self.assertIn(">100%<", svg)
        self.assertIn(">0%<", svg)

    def test_sem_curvas_e_erro(self):
        with self.assertRaises(ValueError):
            grafico_g4([], alfa=0.05)


class TestSecoesDaSprint02(unittest.TestCase):
    """A seção 5 e a 7 montadas com os CSVs reais da Q2."""

    @classmethod
    def setUpClass(cls):
        cls.grade = carregar_poder(LAB4_DIR / "data")
        if cls.grade is None:
            raise unittest.SkipTest("data/resultados_q2.csv ainda nao foi gerado")

    def test_o_g4_cobre_as_condicoes_prometidas(self):
        curvas = _curvas_do_g4(self.grade, CENARIOS_VIOLACAO, TAMANHOS_G4)
        self.assertEqual(len(curvas), len(CENARIOS_VIOLACAO) * len(TAMANHOS_G4))
        # ordem de linha: a primeira linha tem de ser um cenário por coluna
        primeiros = [c.grupo for c in curvas[:len(CENARIOS_VIOLACAO)]]
        self.assertEqual(len(set(primeiros)), len(CENARIOS_VIOLACAO))

    def test_as_curvas_partem_do_nivel_nominal(self):
        """Em δ = 0 não há efeito: a curva é a taxa de erro tipo I."""
        for cenario in CENARIOS_VIOLACAO:
            for teste in (TESTE_T_NOME, TESTE_W_NOME):
                with self.subTest(cenario=cenario, teste=teste):
                    taxa = self.grade.taxa(cenario, 30, 0.0, teste)
                    self.assertLess(abs(taxa - self.grade.alfa), 0.02)

    def test_o_poder_nunca_decresce_na_grade(self):
        for cenario in self.grade.cenarios:
            for n in self.grade.tamanhos:
                for teste in (TESTE_T_NOME, TESTE_W_NOME):
                    with self.subTest(cenario=cenario, n=n, teste=teste):
                        taxas = [t for _, t in self.grade.pontos(cenario, n, teste)]
                        # ruído de Monte Carlo pode inverter dois pontos vizinhos
                        # por pouco; uma queda de verdade é outra coisa
                        for antes, depois in zip(taxas, taxas[1:]):
                            self.assertGreater(depois, antes - 0.02)

    def test_o_interativo_le_os_mesmos_numeros_do_csv(self):
        """Se o JSON do bônus e o CSV discordassem, um dos dois mentiria."""
        import json
        dados = json.loads(dados_para_o_interativo(self.grade))
        indice = dados["efeitos"].index(0.5)
        for cenario in CENARIOS_VIOLACAO:
            with self.subTest(cenario=cenario):
                self.assertAlmostEqual(
                    dados["series"][f"{cenario}|30"]["t"]["taxa"][indice],
                    self.grade.taxa(cenario, 30, 0.5, TESTE_T_NOME))

    def test_o_grafico_interativo_do_bonus_funciona(self):
        """Roda o `src/poder.js` de verdade, contra um DOM mínimo.

        Um erro de JavaScript ali não quebraria a página: o bloco interativo
        simplesmente ficaria vazio, e ninguém perceberia até a apresentação.
        O script confere que as duas curvas são desenhadas, que a leitura
        ponto a ponto responde ao teclado e que o número mostrado é o do CSV.
        """
        import shutil
        import subprocess
        if not shutil.which("node"):
            self.skipTest("node nao esta instalado nesta maquina")
        pagina = LAB4_DIR / "dashboard" / "index.html"
        if not pagina.exists():
            self.skipTest("rode python src/dashboard.py antes")
        retorno = subprocess.run(
            ["node", str(LAB4_DIR / "tests" / "checar_poder_js.js")],
            capture_output=True, text=True)
        self.assertEqual(retorno.returncode, 0, retorno.stdout + retorno.stderr)

    def test_a_pagina_completa_nao_tem_mais_pendencia(self):
        import csv as _csv

        def ler(caminho):
            with open(caminho, newline="", encoding="utf-8") as arquivo:
                return list(_csv.DictReader(arquivo))

        dados = LAB4_DIR / "data"
        pares = ler(dados / "dados_reais.csv")
        sem = [float(l["tempo_sem_cache"]) for l in pares]
        com = [float(l["tempo_com_cache"]) for l in pares]
        simulados: dict[str, list[float]] = {}
        for linha in ler(dados / "simulacao" / "cenarios.csv"):
            simulados.setdefault(linha["cenario"], []).append(float(linha["diferenca"]))

        pagina = montar(
            reais={"sem cache": sem, "com cache": com,
                   "diferenças": [s - c for s, c in zip(sem, com)]},
            simulados=simulados,
            reais_resultados=ler(dados / "resultados_reais.csv"),
            exemplo=ler(dados / "simulacao" / "resultados_exemplo.csv"),
            erro_tipo_i=carregar_comparacoes(dados),
            violacao=carregar_violacao(dados),
            poder=self.grade,
            javascript=javascript_do_poder(),
        )
        self.assertNotIn('class="pendencia"', pagina)
        self.assertIn("G4 —", pagina)
        self.assertIn('id="dados-poder"', pagina)
        self.assertIn("O que esperávamos", pagina)
        self.assertIn("Recomendação", pagina)


if __name__ == "__main__":
    unittest.main()
