"""Testes da consolidacao da base (Lab05, issue #133).

Rodam so' com a biblioteca padrao, a partir de Lab5/:

    python -m unittest discover -s Sprint02/testes -v

O unico teste que precisa do dnspython (esquema igual ao do coletor) se pula
sozinho sem ele, como os da Sprint 01.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

LAB5 = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB5 / "Sprint02"))
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import consolidar_base as cb  # noqa: E402
import analise as ana  # noqa: E402

try:
    import dns.rdataclass  # noqa: F401
    import medidor as md
    TEM_DNSPYTHON = True
except ImportError:
    TEM_DNSPYTHON = False


def _consulta(rede="rede-x", rodada="20261124T000000Z", ordem=1, **campos) -> dict:
    linha = {c: "" for c in cb.COLUNAS_BRUTAS}
    linha.update(ts_utc="2026-11-24T00:00:00.000+00:00", rede_id=rede,
                 rodada_id=rodada, ordem=str(ordem), experimento="E-1",
                 resolvedor="1.1.1.1", protocolo="Do53", conexao="unica",
                 condicao_cache="C3", nome="a.org", posicao="a.org",
                 latencia_ms="12.5", rcode="NOERROR", usou_tcp="False",
                 ttl="300", reconectou="False")
    linha.update(campos)
    return linha


LOG = """﻿=== inicio 2026-11-24T14:15:16-03:00 rodadas=2 intervalo=10 padrao=padrao (roteador) dominios=piloto zona=-
Python 3.14.0 · OpenSSL 3.0.18 · dnspython 2.9.2 · httpx2 2.16.2
rede=rede-x interface=? semente=123
AVISO: sem --zona, so' C3 e' coletada
[1/2] 20261124T000000Z subconjunto 1/3, 2 consultas, 1 falhas, 1.5 s
=== fim 2026-11-24T14:25:37-03:00 codigo=0
"""


class Arvore:
    """Uma copia minima de Lab5/ num diretorio temporario."""

    def __init__(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self._tmp.name)
        self.patch = mock.patch.object(cb, "LAB5", self.raiz)
        self.patch.start()

    def fechar(self) -> None:
        self.patch.stop()
        self._tmp.cleanup()

    def csv(self, relativo: str, linhas: list[dict], colunas=cb.COLUNAS_BRUTAS,
            fim="\r\n") -> Path:
        caminho = self.raiz / relativo
        caminho.parent.mkdir(parents=True, exist_ok=True)
        with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
            escritor = csv.DictWriter(arquivo, fieldnames=colunas, lineterminator=fim)
            escritor.writeheader()
            escritor.writerows(linhas)
        return caminho

    def texto(self, relativo: str, conteudo: str) -> Path:
        caminho = self.raiz / relativo
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(conteudo, encoding="utf-8")
        return caminho


class ComArvore(unittest.TestCase):
    def setUp(self) -> None:
        self.arvore = Arvore()
        self.addCleanup(self.arvore.fechar)


# ---------------------------------------------------------------- esquema


@unittest.skipUnless(TEM_DNSPYTHON, "dnspython ausente")
class TestEsquema(unittest.TestCase):
    def test_esquema_igual_ao_do_coletor(self):
        """A copia do esquema na consolidacao nao pode divergir do coletor."""
        self.assertEqual(cb.COLUNAS_BRUTAS, md.COLUNAS)


class TestConvencaoDeNomes(unittest.TestCase):
    def test_colunas_em_snake_case_ascii(self):
        for colunas in (cb.COLUNAS_CONSULTAS, cb.COLUNAS_RODADAS,
                        cb.COLUNAS_EXECUCOES, cb.COLUNAS_FICHAS,
                        cb.COLUNAS_MANIFESTO):
            for coluna in colunas:
                with self.subTest(coluna=coluna):
                    self.assertRegex(coluna, r"^[a-z][a-z0-9_]*$")

    def test_base_preserva_as_colunas_brutas_na_ordem(self):
        self.assertEqual(cb.COLUNAS_CONSULTAS[1:31], cb.COLUNAS_BRUTAS)


# ----------------------------------------------------------- consolidacao


class TestConsolidacao(ComArvore):
    def _definitiva(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv", [
            _consulta(ordem=1),
            _consulta(ordem=2, rcode="", erro="timeout", latencia_ms=""),
        ])
        self.arvore.texto("Sprint02/dados/rede-x.log", LOG)
        self.arvore.texto("Sprint02/dados/rede-x_ficha_20261124.json", json.dumps({
            "rede_id": "rede-x", "ts_utc": "2026-11-24T00:00:00+00:00",
            "padroes": {"padrao": {"upstreams": [{"asn": "13335"}, {"asn": "13335"}],
                                   "classificacao": "encaminha", "endereco_privado": True}},
            "interceptacao": {"interceptacao_detectada": False, "id_server_1111": "gru1"},
            "classificacao": "(b) encaminha a um publico"}))

    def test_linhas_levam_lote_sucesso_e_origem(self):
        self._definitiva()
        base = cb.consolidar()
        self.assertEqual(len(base.consultas), 2)
        primeira, segunda = base.consultas
        self.assertEqual(primeira["lote"], "definitiva")
        self.assertEqual(primeira["arquivo_origem"], "Sprint02/dados/rede-x.csv")
        self.assertEqual((primeira["linha_origem"], segunda["linha_origem"]), ("2", "3"))
        self.assertEqual((primeira["sucesso"], segunda["sucesso"]), ("True", "False"))

    def test_valores_brutos_copiados_sem_conversao(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv",
                        [_consulta(latencia_ms="185.35530000008293")])
        self.assertEqual(cb.consolidar().consultas[0]["latencia_ms"], "185.35530000008293")

    def test_rodada_junta_csv_e_log(self):
        self._definitiva()
        base = cb.consolidar()
        (rodada,) = base.rodadas
        self.assertEqual(rodada["subconjunto_c3"], "1/3")
        self.assertEqual(rodada["execucao"], "1")
        self.assertEqual((rodada["n_consultas"], rodada["n_falhas"]), ("2", "1"))
        (execucao,) = base.execucoes
        self.assertEqual(execucao["semente"], "123")
        self.assertEqual(execucao["interface"], "")
        self.assertEqual(execucao["n_avisos"], "1")
        self.assertEqual(execucao["codigo_saida"], "0")
        self.assertEqual(execucao["rodadas_previstas"], "2")
        self.assertIn("dnspython 2.9.2", execucao["ambiente"])

    def test_ficha_vira_uma_linha_por_padrao(self):
        self._definitiva()
        (ficha,) = cb.consolidar().fichas
        self.assertEqual(ficha["classificacao"], "(b)")
        self.assertEqual(ficha["padrao_upstream_asn"], "13335")
        self.assertEqual(ficha["data"], "20261124")

    def test_provisoria_nao_entra_na_definitiva(self):
        self.arvore.csv("Sprint02/dados/provisoria/rede-x.csv", [_consulta()])
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta()])
        lotes = sorted(l["lote"] for l in cb.consolidar().consultas)
        self.assertEqual(lotes, ["definitiva", "provisoria"])


class TestRecusa(ComArvore):
    def _recusa(self, trecho: str):
        with self.assertRaises(cb.ErroDeConsolidacao) as contexto:
            cb.consolidar()
        self.assertIn(trecho, str(contexto.exception))

    def test_cabecalho_fora_do_esquema(self):
        colunas = tuple(c if c != "s_desde_ultima_consulta" else "desde_ultima_s"
                        for c in cb.COLUNAS_BRUTAS)
        linha = _consulta()
        linha["desde_ultima_s"] = linha.pop("s_desde_ultima_consulta")
        self.arvore.csv("Sprint02/dados/rede-x.csv", [linha], colunas=colunas)
        self._recusa("cabecalho fora do esquema")

    def test_valor_fora_do_dominio(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta(protocolo="DoQ")])
        self._recusa("protocolo='DoQ'")

    def test_numero_ilegivel(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta(latencia_ms="12,5")])
        self._recusa("latencia_ms='12,5'")

    def test_rede_diferente_do_nome_do_arquivo(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta(rede="rede-y")])
        self._recusa("rede_id='rede-y'")

    def test_consulta_repetida(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta(), _consulta()])
        self._recusa("consultas repetidas")


# ------------------------------------------------------------ preservacao


class TestPreservacao(ComArvore):
    def test_hash_ignora_final_de_linha(self):
        crlf = self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta()], fim="\r\n")
        lf = self.arvore.csv("Sprint02/dados/rede-y.csv", [_consulta(rede="rede-y")], fim="\n")
        lf.write_bytes(crlf.read_bytes().replace(b"\r\n", b"\n"))
        self.assertEqual(cb.sha256_normalizado(crlf), cb.sha256_normalizado(lf))

    def test_verificar_acusa_bruto_alterado(self):
        bruto = self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta()])
        saida = self.arvore.raiz / "base"
        cb.gravar(cb.tabelas(cb.consolidar()), saida)
        self.assertEqual(cb.verificar(cb.tabelas(cb.consolidar()), saida), [])

        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta(latencia_ms="1.0")])
        divergencias = cb.verificar(cb.tabelas(cb.consolidar()), saida)
        self.assertIn(f"bruto alterado depois de consolidado: {cb.relativo(bruto)}",
                      divergencias)

    def test_verificar_acusa_bruto_novo(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta()])
        saida = self.arvore.raiz / "base"
        cb.gravar(cb.tabelas(cb.consolidar()), saida)
        self.arvore.csv("Sprint02/dados/rede-y.csv", [_consulta(rede="rede-y")])
        divergencias = cb.verificar(cb.tabelas(cb.consolidar()), saida)
        self.assertIn("bruto novo, ainda fora da base: Sprint02/dados/rede-y.csv",
                      divergencias)

    def test_gzip_deterministico(self):
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta()])
        conteudos = cb.tabelas(cb.consolidar())
        cb.gravar(conteudos, self.arvore.raiz / "a")
        cb.gravar(conteudos, self.arvore.raiz / "b")
        self.assertEqual((self.arvore.raiz / "a" / "consultas.csv.gz").read_bytes(),
                         (self.arvore.raiz / "b" / "consultas.csv.gz").read_bytes())


class TestBaseVersionada(unittest.TestCase):
    def test_base_do_repositorio_confere_com_o_bruto(self):
        """A base commitada e' exatamente a que o bruto commitado gera."""
        divergencias = cb.verificar(cb.tabelas(cb.consolidar()), cb.BASE)
        self.assertEqual(divergencias, [])


# ----------------------------------------------------------------- analise


class TestAnaliseLeBase(ComArvore):
    def _base(self) -> Path:
        self.arvore.csv("Sprint01/dados/piloto_c.csv", [_consulta(rede="piloto-c")])
        self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta(), _consulta(ordem=2)])
        saida = self.arvore.raiz / "base"
        cb.gravar(cb.tabelas(cb.consolidar()), saida)
        return saida / "consultas.csv.gz"

    def test_filtra_o_lote(self):
        linhas = ana.carregar(self._base(), "definitiva")
        self.assertEqual(len(linhas), 2)
        self.assertEqual(linhas[0]["latencia_ms"], 12.5)

    def test_recusa_misturar_lotes(self):
        with self.assertRaisesRegex(ValueError, "--lote"):
            ana.carregar(self._base())

    def test_lote_inexistente(self):
        with self.assertRaisesRegex(ValueError, "nao tem o lote"):
            ana.carregar(self._base(), "provisoria")

    def test_csv_bruto_continua_lido_sem_lote(self):
        bruto = self.arvore.csv("Sprint02/dados/rede-x.csv", [_consulta()])
        self.assertEqual(len(ana.carregar(bruto)), 1)
        with self.assertRaisesRegex(ValueError, "coluna `lote`"):
            ana.carregar(bruto, "definitiva")


if __name__ == "__main__":
    unittest.main()
