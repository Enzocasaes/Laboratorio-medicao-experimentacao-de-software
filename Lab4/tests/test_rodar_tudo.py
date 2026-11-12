"""Confere o comando único que roda o Lab04 inteiro (src/rodar_tudo.py).

O módulo não calcula nada: ele é a *ordem* das etapas, escrita uma vez só.
Então o que pode dar errado nele não é conta, é desencontro — um módulo
renomeado, uma etapa nova fora de ordem, ou uma saída declarada com o nome
errado, que só apareceria na hora de entregar.

Os testes abaixo cobrem exatamente isso, sem rodar nenhuma simulação.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

LAB4_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAB4_DIR / "src"))

from rodar_tudo import ETAPAS, ULTIMA, Etapa, conferir_saidas  # noqa: E402


def posicao(modulo: str) -> int:
    return [e.modulo for e in ETAPAS].index(modulo)


class TestPlano(unittest.TestCase):
    def test_todo_modulo_declarado_existe(self):
        for etapa in ETAPAS:
            self.assertTrue(etapa.caminho.is_file(), f"src/{etapa.modulo}.py não existe")

    def test_nenhuma_etapa_repetida(self):
        modulos = [e.modulo for e in ETAPAS]
        self.assertEqual(len(set(modulos)), len(modulos))

    def test_o_dashboard_e_a_ultima_etapa(self):
        """Ele lê os CSVs de todas as outras; rodar antes mostraria números velhos."""
        self.assertEqual(ULTIMA.modulo, "dashboard")
        self.assertEqual(posicao("dashboard"), len(ETAPAS) - 1)

    def test_cada_etapa_vem_depois_de_quem_a_alimenta(self):
        for depois, antes in (("comparacao_erro", "erro_tipo_i"),
                              ("poder", "violacao"),
                              ("simulacao", "testes")):
            self.assertGreater(posicao(depois), posicao(antes),
                               f"{depois} roda antes de {antes}")

    def test_so_a_q1_depende_de_pacote_de_terceiro(self):
        """O resto do Lab04 roda com a biblioteca padrão — é o que o README promete."""
        com_pacotes = {e.modulo for e in ETAPAS if e.pacotes}
        self.assertEqual(com_pacotes, {"erro_tipo_i"})
        self.assertEqual(set(ETAPAS[posicao("erro_tipo_i")].pacotes),
                         {"numpy", "pandas"})

    def test_as_saidas_declaradas_batem_com_as_que_estao_no_repositorio(self):
        """Se uma etapa declara um arquivo com nome errado, a rodada falha no fim."""
        for etapa in ETAPAS:
            self.assertEqual(conferir_saidas(etapa), (),
                             f"{etapa.modulo} declara saída que não existe")

    def test_a_etapa_cobre_todos_os_modulos_que_geram_dado(self):
        """Um módulo novo que escreve CSV precisa entrar no plano, senão fica fora."""
        geradores = {"testes", "simulacao", "erro_tipo_i", "comparacao_erro",
                     "violacao", "poder", "dashboard"}
        self.assertTrue(geradores.issubset({e.modulo for e in ETAPAS}))


class TestDeteccaoDePacote(unittest.TestCase):
    def test_pacote_inexistente_e_reportado_como_faltando(self):
        etapa = Etapa("erro_tipo_i", "x", "y", (), pacotes=("pacote_que_nao_existe_xyz",))
        self.assertEqual(etapa.pacotes_faltando(), ("pacote_que_nao_existe_xyz",))

    def test_pacote_da_biblioteca_padrao_nunca_falta(self):
        etapa = Etapa("testes", "x", "y", (), pacotes=("statistics", "csv"))
        self.assertEqual(etapa.pacotes_faltando(), ())


if __name__ == "__main__":
    unittest.main()
