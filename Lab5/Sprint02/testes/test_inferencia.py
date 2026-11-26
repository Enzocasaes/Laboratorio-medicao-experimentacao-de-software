"""Testes dos testes de hipotese e dos graficos (Lab05, issues #136 e #137).

Rodam so' com a biblioteca padrao, a partir de Lab5/:

    python -m unittest discover -s Sprint02/testes -v
"""

from __future__ import annotations

import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

LAB5 = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB5 / "Sprint02"))
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import analise as ana  # noqa: E402
import graficos as gr  # noqa: E402
import inferencia as inf  # noqa: E402

REPLICAS = 200


def consulta(rodada: int, resolvedor: str, latencia: float, nome="a.org", experimento="E-1",
             protocolo="Do53", conexao="unica", rtt=5.0, ttl=300, s_desde=None,
             sucesso=True, sinalizacoes="") -> dict:
    return {
        "lote": "provisoria", "rede_id": "rede-x", "rodada_id": f"20261124T17{rodada:02d}00Z",
        "ts_utc": f"2026-11-24T17:{rodada:02d}:00.000+00:00",
        "experimento": experimento, "resolvedor": resolvedor, "protocolo": protocolo,
        "conexao": conexao, "condicao_cache": "C3", "nome": nome, "posicao": nome,
        "latencia_ms": latencia if sucesso else 2000.0, "rtt_ms": rtt, "ttl": ttl,
        "s_desde_ultima_consulta": s_desde, "sucesso": sucesso,
        "erro": "" if sucesso else "timeout", "rcode": "NOERROR" if sucesso else "",
        "sinalizacoes": sinalizacoes, "pop_id": "", "reconectou": "",
    }


def base_e1(vantagem: float = 3.0, nomes: int = 8, rodadas: int = 6) -> list[dict]:
    """1.1.1.1 mais rapido que o 8.8.8.8 por `vantagem` ms em todo nome."""
    linhas = []
    for r in range(rodadas):
        for i in range(nomes):
            nome = f"n{i}.org"
            base = 20.0 + i + 0.1 * r
            linhas.append(consulta(r, "1.1.1.1", base, nome))
            linhas.append(consulta(r, "8.8.8.8", base + vantagem + 0.01 * i, nome))
            linhas.append(consulta(r, "padrao", base - 10, nome))
    return linhas


class TestPareamento(unittest.TestCase):
    def test_pares_iguais_aos_do_analise(self):
        """O pareamento novo tem de dar os mesmos Δ do analise.py da Sprint 01."""
        linhas = base_e1()
        meus = inf.pares(linhas, "E-1", "1.1.1.1", "8.8.8.8")
        deles = ana.diferencas_por_unidade(linhas, "E-1", "1.1.1.1", "8.8.8.8")
        self.assertEqual(sorted(meus), sorted(deles))
        for unidade, ps in meus.items():
            self.assertEqual(sorted(inf.delta_bruto(a, b) for a, b in ps), sorted(deles[unidade]))

    def test_falha_so_entra_com_censura(self):
        linhas = base_e1()
        linhas.append(consulta(9, "1.1.1.1", 0, "n0.org", sucesso=False))
        linhas.append(consulta(9, "8.8.8.8", 25.0, "n0.org"))
        sem = sum(len(p) for p in inf.pares(linhas, "E-1", "1.1.1.1", "8.8.8.8").values())
        com = inf.pares(linhas, "E-1", "1.1.1.1", "8.8.8.8", incluir_falhas=True)
        self.assertEqual(sum(len(p) for p in com.values()), sem + 1)
        deltas = [inf.delta_bruto(a, b) for ps in com.values() for a, b in ps]
        self.assertIn(2000.0 - 25.0, deltas)

    def test_delta_sem_rtt_desconta_a_distancia(self):
        a = consulta(0, "1.1.1.1", 30.0, rtt=20.0)
        b = consulta(0, "8.8.8.8", 32.0, rtt=12.0)
        self.assertEqual(inf.delta_bruto(a, b), -2.0)
        self.assertEqual(inf.delta_sem_rtt(a, b), 10.0 - 20.0)


class TestEfeitoEVeredito(unittest.TestCase):
    def test_vantagem_consistente_sustenta_h_a(self):
        r = inf.familia_e1(base_e1(), replicas=REPLICAS)["8.8.8.8"]
        self.assertAlmostEqual(r["delta_ms"], -3.035, places=2)
        self.assertLess(r["ic95"][1], 0)
        self.assertGreater(r["cliff"], 0)  # M4b: > 0 = 1.1.1.1 tende a ser mais rapido
        self.assertEqual(r["vitoria"]["taxa"], 1.0)
        self.assertEqual(r["r_rotulo"], "grande")
        self.assertEqual(inf.veredito_direcional(r, -1), "sustentada")
        # o mesmo resultado, com o sinal previsto ao contrario, e' refutacao
        self.assertTrue(inf.veredito_direcional(r, +1).startswith("refutada"))

    def test_sem_diferenca_nao_sustenta(self):
        # metade dos nomes para cada lado, com tamanhos que se compensam:
        # Δ por nome = +1, −2, +3, −4, ... (W+ = 16 contra W− = 20)
        linhas = base_e1(vantagem=0.0)
        for l in linhas:
            if l["resolvedor"] == "8.8.8.8":
                i = int(l["nome"][1])
                l["latencia_ms"] = l["latencia_ms"] - 0.01 * i - (i + 1) * (1 if i % 2 else -1)
        r = inf.familia_e1(linhas, replicas=REPLICAS)["8.8.8.8"]
        self.assertTrue(inf.veredito_direcional(r, -1).startswith("não sustentada"))

    def test_uma_unidade_nao_e_testavel(self):
        linhas = base_e1(nomes=1)
        r = inf.familia_e1(linhas, replicas=REPLICAS)["8.8.8.8"]
        self.assertIsNone(r["wilcoxon"])
        self.assertEqual(inf.veredito_direcional(r, -1), "não testável")
        self.assertEqual(inf.veredito_equivalencia(r), "não testável")

    def test_equivalencia_r2(self):
        def com_ic(a, b):
            return {"ic95": (a, b)}
        self.assertEqual(inf.veredito_equivalencia(com_ic(-1.0, 4.9)), "sustentada")
        self.assertTrue(inf.veredito_equivalencia(com_ic(-1.0, 5.1)).startswith("inconclusiva"))
        self.assertTrue(inf.veredito_equivalencia(com_ic(6.0, 9.0)).startswith("refutada"))

    def test_rotulo_r(self):
        self.assertEqual([inf.rotulo_r(v) for v in (0.05, 0.2, 0.4, 0.6)],
                         ["desprezivel", "pequeno", "medio", "grande"])

    def test_kendall_w_concordancia_total(self):
        """Todos os blocos na mesma ordem: W = 1."""
        f = ana.friedman_resolvedores(base_e1(), "C3")
        self.assertAlmostEqual(inf.kendall_w(f), 1.0)


class TestSensibilidade(unittest.TestCase):
    def test_autoaquecimento_usa_o_ttl_da_consulta_anterior(self):
        linhas = [
            consulta(0, "1.1.1.1", 10, ttl=60, s_desde=None),
            consulta(1, "1.1.1.1", 10, ttl=60, s_desde=30.0),   # 30 < 60: aquecida
            consulta(2, "1.1.1.1", 10, ttl=20, s_desde=30.0),   # 30 < 60 (anterior)
            consulta(3, "1.1.1.1", 10, ttl=20, s_desde=30.0),   # 30 >= 20: fria
        ]
        inf.marcar_autoaquecimento(linhas)
        self.assertEqual([l["autoaquecida"] for l in linhas], [False, True, True, False])

    def test_cenarios_filtram_pelas_sinalizacoes(self):
        linhas = base_e1()
        linhas[0]["sinalizacoes"] = "latencia_discrepante"
        linhas[1]["sinalizacoes"] = "pop_mudou;latencia_discrepante"
        por_id = {c["id"]: c for c in inf.cenarios(linhas)}
        self.assertEqual(len(por_id["S6"]["linhas"]), len(linhas) - 2)
        self.assertEqual(len(por_id["S3"]["linhas"]), len(linhas) - 1)
        self.assertIsNone(por_id["S5"]["linhas"])


class TestGraficos(unittest.TestCase):
    def test_svgs_sao_xml_valido(self):
        linhas = base_e1()
        # E-2 minimo para o G3
        for r in range(6):
            for res in ("1.1.1.1", "8.8.8.8"):
                linhas.append(consulta(r, res, 15.0, "google.com", "E-2"))
                for p, c in inf.CONDICOES_E2:
                    custo = 50.0 if c == "nova" else 0.5
                    linhas.append(consulta(r, res, 15.0 + custo + 0.1 * r, "google.com",
                                           "E-2", p, c))
        resultado = inf._limpar(inf.executar(linhas, REPLICAS))
        svgs = gr.gerar(linhas, resultado)
        self.assertEqual(len(svgs), 5)
        for nome, svg in svgs.items():
            with self.subTest(nome=nome):
                raiz = ET.fromstring(svg)
                self.assertTrue(raiz.tag.endswith("svg"))
                self.assertNotIn("nan", svg.lower().replace("nanosec", ""))


if __name__ == "__main__":
    unittest.main()
