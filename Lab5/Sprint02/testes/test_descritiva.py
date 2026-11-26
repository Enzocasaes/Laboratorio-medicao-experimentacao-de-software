"""Testes da descritiva (Lab05, issue #135).

O que pode dar errado aqui nao e' o relatorio ficar feio: e' um numero sair
certo por engano. Dois erros reais foram pegos escrevendo estes testes e estao
cobertos abaixo, para nao voltarem:

- `estatistica.percentil` recebe a escala **0 a 100**, e nao 0 a 1. Chamada com
  0.5, ela devolvia um valor perto do minimo, e o "p50" da tabela nao era a
  mediana;
- `analise.tratamento` nao distingue E-1 de E-2, entao agrupar por ele juntava
  as 300 consultas do E-1 com as 60 do E-2 do mesmo resolvedor, e a media saia
  de uma celula que nao existe no desenho.

Rodam so' com a biblioteca padrao, a partir de Lab5/:

    python -m unittest discover -s Sprint02/testes -v
"""

from __future__ import annotations

import statistics
import sys
import unittest
from pathlib import Path

LAB5 = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB5 / "Sprint02"))
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import descritiva as des  # noqa: E402
import estatistica as est  # noqa: E402


def consulta(rodada: int, resolvedor: str, latencia: float, nome="a.org",
             experimento="E-1", protocolo="Do53", conexao="unica", rtt=None,
             pop="", t_tcp=None, t_tls=None, tls_versao="", http_versao="",
             sucesso=True) -> dict:
    return {
        "lote": "provisoria", "rede_id": "rede-x", "rodada_id": f"R{rodada:03d}",
        "ts_utc": f"2026-11-24T17:{rodada % 60:02d}:00.000+00:00", "ordem": str(rodada + 1),
        "experimento": experimento, "resolvedor": resolvedor, "protocolo": protocolo,
        "conexao": conexao, "condicao_cache": "C3", "nome": nome, "posicao": nome,
        "latencia_ms": latencia, "t_tcp_ms": t_tcp, "t_tls_ms": t_tls,
        "tls_versao": tls_versao, "http_versao": http_versao,
        "rtt_ms": rtt, "pop_id": pop, "sucesso": sucesso,
        "erro": "" if sucesso else "timeout", "rcode": "NOERROR" if sucesso else "",
    }


class TestForma(unittest.TestCase):
    def test_simetrico_tem_assimetria_zero(self):
        self.assertAlmostEqual(des.assimetria([1, 2, 3, 4, 5]), 0.0, places=12)

    def test_cauda_a_direita_da_assimetria_positiva(self):
        """E' o formato esperado de latencia: piso duro, sem teto."""
        self.assertGreater(des.assimetria([1, 1, 1, 1, 1, 1, 1, 1, 1, 50]), 2)

    def test_cauda_a_esquerda_da_assimetria_negativa(self):
        self.assertLess(des.assimetria([50, 50, 50, 50, 50, 50, 50, 50, 50, 1]), -2)

    def test_curtose_e_em_excesso(self):
        """Uniforme tem curtose em excesso negativa; com um valor extremo, positiva."""
        self.assertLess(des.curtose(list(range(1, 101))), 0)
        self.assertGreater(des.curtose([1] * 99 + [1000]), 50)

    def test_valor_constante_nao_quebra(self):
        self.assertEqual(des.assimetria([7, 7, 7, 7]), 0.0)
        self.assertEqual(des.curtose([7, 7, 7, 7]), 0.0)


class TestComplementoDaMediana(unittest.TestCase):
    def test_separa_e1_de_e2(self):
        """Regressao: agrupar so' por `tratamento` juntava E-1 com E-2."""
        linhas = ([consulta(i, "1.1.1.1", 10.0) for i in range(5)]
                  + [consulta(i, "1.1.1.1", 100.0, experimento="E-2") for i in range(5)])
        celulas = {c["tratamento"][0]: c for c in des.complemento_da_mediana(linhas)}
        self.assertEqual(sorted(celulas), ["E-1", "E-2"])
        self.assertEqual(celulas["E-1"]["n"], 5)
        self.assertAlmostEqual(celulas["E-1"]["media"], 10.0)
        self.assertAlmostEqual(celulas["E-2"]["media"], 100.0)

    def test_razao_media_mediana_denuncia_a_cauda(self):
        linhas = [consulta(i, "1.1.1.1", v) for i, v in enumerate([10] * 9 + [1000])]
        celula = des.complemento_da_mediana(linhas)[0]
        self.assertAlmostEqual(celula["mediana"], 10.0)
        self.assertGreater(celula["razao"], 9)

    def test_consulta_que_falhou_fica_de_fora(self):
        linhas = [consulta(0, "1.1.1.1", 10.0), consulta(1, "1.1.1.1", 2000.0, sucesso=False)]
        self.assertEqual(des.complemento_da_mediana(linhas)[0]["n"], 1)


class TestPercentis(unittest.TestCase):
    def test_p50_e_a_mediana(self):
        """Regressao: `percentil` usa 0 a 100; chamado com 0.5 devolvia quase o minimo."""
        valores = [float(v) for v in range(1, 101)]
        linhas = [consulta(i, "1.1.1.1", v) for i, v in enumerate(valores)]
        perfil = des.perfil_de_percentis(linhas)[0]
        self.assertAlmostEqual(perfil["p50"], est.mediana(valores))
        self.assertAlmostEqual(perfil["p50"], statistics.median(valores))

    def test_percentis_crescem(self):
        linhas = [consulta(i, "1.1.1.1", float(i)) for i in range(200)]
        perfil = des.perfil_de_percentis(linhas)[0]
        anteriores = [perfil[f"p{p}"] for p in des.PERCENTIS]
        self.assertEqual(anteriores, sorted(anteriores))
        self.assertLessEqual(perfil["p99"], perfil["maximo"])


class TestPorNome(unittest.TestCase):
    def test_aponta_o_resolvedor_mais_rapido_de_cada_nome(self):
        linhas = []
        for i in range(4):
            linhas += [consulta(i, "1.1.1.1", 10.0, nome="a.org"),
                       consulta(i, "8.8.8.8", 20.0, nome="a.org"),
                       consulta(i, "padrao", 30.0, nome="a.org"),
                       consulta(i, "1.1.1.1", 90.0, nome="b.org"),
                       consulta(i, "8.8.8.8", 20.0, nome="b.org"),
                       consulta(i, "padrao", 30.0, nome="b.org")]
        por = {d["nome"]: d for d in des.por_nome(linhas)}
        self.assertEqual(por["a.org"]["mais_rapido"], "1.1.1.1")
        self.assertEqual(por["b.org"]["mais_rapido"], "8.8.8.8")
        self.assertEqual(por["a.org"]["n"], 4)

    def test_so_olha_o_e1(self):
        linhas = [consulta(0, "1.1.1.1", 10.0, experimento="E-2")]
        self.assertEqual(des.por_nome(linhas), [])


class TestDecomposicaoDoCifrado(unittest.TestCase):
    def base_dot(self) -> list[dict]:
        # o resto por consulta e' 10, 10, 10 e 100 -> mediana 10. Ja' a conta
        # "mediana do total - mediana do TCP - mediana do TLS" da' 50, porque
        # cada mediana vem de uma consulta diferente. E' o caso que separa os
        # dois calculos.
        return [consulta(0, "1.1.1.1", 30.0, protocolo="DoT", conexao="nova",
                         experimento="E-2", t_tcp=10.0, t_tls=10.0),
                consulta(1, "1.1.1.1", 70.0, protocolo="DoT", conexao="nova",
                         experimento="E-2", t_tcp=50.0, t_tls=10.0),
                consulta(2, "1.1.1.1", 70.0, protocolo="DoT", conexao="nova",
                         experimento="E-2", t_tcp=10.0, t_tls=50.0),
                consulta(3, "1.1.1.1", 120.0, protocolo="DoT", conexao="nova",
                         experimento="E-2", t_tcp=10.0, t_tls=10.0)]

    def test_resto_e_calculado_consulta_a_consulta(self):
        celula = des.decomposicao_do_cifrado(self.base_dot())[0]
        self.assertAlmostEqual(celula["resto"], 10.0)
        # subtrair medianas daria 50, e e' por isso que nao se faz assim
        self.assertAlmostEqual(celula["total"] - celula["tcp"] - celula["tls"], 50.0)

    def test_protocolo_sem_handshake_registrado(self):
        """No DoH o cliente HTTP nao expoe TCP e TLS: tem de sair vazio, nao zero."""
        linhas = [consulta(0, "1.1.1.1", 64.0, protocolo="DoH", conexao="nova",
                           experimento="E-2")]
        celula = des.decomposicao_do_cifrado(linhas)[0]
        self.assertEqual(celula["n_handshake"], 0)
        self.assertIsNone(celula["tcp"])
        self.assertIsNone(celula["tls"])
        self.assertAlmostEqual(celula["total"], 64.0)

    def test_so_conexao_nova(self):
        linhas = self.base_dot() + [consulta(9, "1.1.1.1", 14.0, protocolo="DoT",
                                             conexao="reaproveitada", experimento="E-2")]
        self.assertEqual(len(des.decomposicao_do_cifrado(linhas)), 1)

    def test_reaproveitada_nao_repete_a_conexao_nova(self):
        linhas = self.base_dot() + [consulta(9, "1.1.1.1", 14.0, protocolo="DoT",
                                             conexao="reaproveitada", experimento="E-2")]
        conexoes = {r["chave"][2] for r in des.reaproveitada(linhas)}
        self.assertNotIn("nova", conexoes)


class TestCovariaveis(unittest.TestCase):
    def test_rtt_e_uma_medida_por_rodada(self):
        linhas = []
        for i in range(3):
            linhas += [consulta(i, "1.1.1.1", 10.0, rtt=30.0),
                       consulta(i, "8.8.8.8", 10.0, rtt=34.0)]
        cov = des.rtt_por_rodada(linhas)
        self.assertEqual(cov["rodadas"], 3)
        self.assertAlmostEqual(cov["delta"]["mediana"], -4.0)
        self.assertEqual(cov["delta"]["a_favor"], 3)

    def test_conta_troca_de_instancia_e_de_sitio(self):
        linhas = [consulta(0, "1.1.1.1", 10.0, pop="gru11"),
                  consulta(1, "1.1.1.1", 12.0, pop="gru19"),
                  consulta(2, "1.1.1.1", 14.0, pop="gru19")]
        pop = des.pontos_de_presenca(linhas)
        self.assertEqual(pop["distintas"], 2)
        self.assertEqual(pop["sitios"], ["gru"])
        self.assertEqual(pop["trocas"], 1)
        self.assertEqual(pop["transicoes"], 2)

    def test_uma_leitura_de_pop_por_rodada(self):
        """O coletor consulta o id.server uma vez por rodada; o resto fica vazio."""
        linhas = [consulta(0, "1.1.1.1", 10.0, pop="gru11"),
                  consulta(0, "1.1.1.1", 11.0, pop="")]
        self.assertEqual(des.pontos_de_presenca(linhas)["transicoes"], 0)


class TestRelatorio(unittest.TestCase):
    def base(self) -> list[dict]:
        linhas = []
        for i in range(6):
            for nome in ("a.org", "b.org"):
                linhas += [consulta(i, "1.1.1.1", 12.0 + i, nome=nome, rtt=30.0, pop="gru11"),
                           consulta(i, "8.8.8.8", 14.0 + i, nome=nome, rtt=32.0),
                           consulta(i, "padrao", 4.0 + i, nome=nome, rtt=16.0)]
            linhas += [consulta(i, "1.1.1.1", 70.0, protocolo="DoT", conexao="nova",
                                experimento="E-2", t_tcp=29.0, t_tls=17.0,
                                tls_versao="TLSv1.3"),
                       consulta(i, "1.1.1.1", 14.0, protocolo="DoT",
                                conexao="reaproveitada", experimento="E-2")]
        return linhas

    def test_monta_as_seis_secoes(self):
        texto = "\n".join(des.relatorio(self.base(), "provisoria"))
        for titulo in ("## 1.", "## 2.", "## 3.", "## 4.", "### 5.1", "### 5.2", "## 6."):
            self.assertIn(titulo, texto)

    def test_e_deterministico(self):
        linhas = self.base()
        self.assertEqual(des.relatorio(linhas, "provisoria"),
                         des.relatorio(linhas, "provisoria"))

    def test_nao_inventa_numero_onde_falta_dado(self):
        """Celula sem handshake aparece com travessao, nao com zero."""
        linhas = [l for l in self.base() if l["protocolo"] != "DoT"]
        linhas += [consulta(0, "1.1.1.1", 64.0, protocolo="DoH", conexao="nova",
                            experimento="E-2")]
        texto = "\n".join(des.relatorio(linhas, "provisoria"))
        self.assertIn("| 1.1.1.1 | DoH | 1 | — | — | — |", texto)


if __name__ == "__main__":
    unittest.main()
