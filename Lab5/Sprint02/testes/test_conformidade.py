"""Testes da consistencia metodologica (Lab05, issue #130).

Um relatorio de conformidade que diz "conforme" para tudo nao serve. Cada
teste abaixo monta uma base que **deveria** reprovar numa verificacao e
confere que ela reprova, e uma que deveria passar e confere que passa. Sem
isso, a tabela de vereditos seria decorativa.

Rodam so' com a biblioteca padrao, a partir de Lab5/:

    python -m unittest discover -s Sprint02/testes -v
"""

from __future__ import annotations

import random
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

LAB5 = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB5 / "Sprint02"))
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import conformidade as cf  # noqa: E402

INICIO = datetime(2026, 11, 24, 17, 0, 0, tzinfo=timezone.utc)


def consulta(segundos: float, resolvedor: str, *, rodada: int = 0, ordem: int = 1,
             nome="a.org", experimento="E-1", protocolo="Do53", conexao="unica",
             cache="C3", rede="rede-c", pop="", tls_versao="", http_versao="",
             t_tcp=None, t_tls=None, sucesso=True) -> dict:
    return {
        "lote": "provisoria", "rede_id": rede, "rodada_id": f"R{rodada:03d}",
        "ts_utc": (INICIO + timedelta(seconds=segundos)).isoformat(),
        "ordem": str(ordem), "experimento": experimento, "resolvedor": resolvedor,
        "protocolo": protocolo, "conexao": conexao, "condicao_cache": cache,
        "nome": nome, "posicao": nome, "latencia_ms": 10.0,
        "t_tcp_ms": t_tcp, "t_tls_ms": t_tls, "tls_versao": tls_versao,
        "http_versao": http_versao, "rtt_ms": 30.0, "pop_id": pop, "sucesso": sucesso,
        "erro": "" if sucesso else "timeout", "rcode": "NOERROR" if sucesso else "",
    }


def rodada_completa(rodada: int, inicio: float, *, passo: float = 0.01) -> list[dict]:
    """Um bloco com os tres resolvedores, bem juntos, em ordem sorteada.

    O sorteio e' semeado pela rodada, para o teste ser reprodutivel e para a
    ordem nao ser uma alternancia sistematica -- que e' justamente o que a
    verificacao C9 deve reprovar.
    """
    resolvedores = random.Random(rodada).sample(["1.1.1.1", "8.8.8.8", "padrao"], 3)
    return [consulta(inicio + i * passo, r, rodada=rodada, ordem=i + 1)
            for i, r in enumerate(resolvedores)]


class TestCadencia(unittest.TestCase):
    def test_rajada_reprova(self):
        linhas = [consulta(i * 0.01, "1.1.1.1", rodada=i) for i in range(10)]
        v = cf.v_cadencia(linhas)
        self.assertEqual(v.veredito, cf.DIVERGENTE)
        self.assertIn("10", v.observado)

    def test_uma_por_segundo_passa(self):
        linhas = [consulta(i * 1.5, "1.1.1.1", rodada=i) for i in range(10)]
        self.assertEqual(cf.v_cadencia(linhas).veredito, cf.CONFORME)

    def test_o_limite_e_por_servico(self):
        """Tres consultas no mesmo instante, uma para cada servico, estao dentro."""
        linhas = ([consulta(i * 1.5, "1.1.1.1", rodada=i) for i in range(5)]
                  + [consulta(i * 1.5, "8.8.8.8", rodada=i) for i in range(5)])
        self.assertEqual(cf.v_cadencia(linhas).veredito, cf.CONFORME)


class TestBlocos(unittest.TestCase):
    def test_bloco_completo_passa(self):
        linhas = []
        for r in range(3):
            linhas += rodada_completa(r, r * 10)
        self.assertEqual(cf.v_blocos(linhas).veredito, cf.CONFORME)

    def test_bloco_faltando_um_tratamento_reprova(self):
        linhas = rodada_completa(0, 0) + rodada_completa(1, 10)[:2]
        self.assertEqual(cf.v_blocos(linhas).veredito, cf.DIVERGENTE)


class TestOrdem(unittest.TestCase):
    def test_ordem_sorteada_passa(self):
        linhas = []
        for r in range(40):
            linhas += rodada_completa(r, r * 10)
        self.assertEqual(cf.v_ordem(linhas).veredito, cf.CONFORME)

    def test_tratamento_sempre_na_mesma_posicao_reprova(self):
        """Se o 1.1.1.1 e' sempre o primeiro, nao houve sorteio."""
        linhas = []
        for r in range(40):
            for i, resolvedor in enumerate(("1.1.1.1", "8.8.8.8", "padrao")):
                linhas.append(consulta(r * 10 + i * 0.01, resolvedor, rodada=r, ordem=i + 1))
        self.assertEqual(cf.v_ordem(linhas).veredito, cf.DIVERGENTE)

    def test_lacuna_na_ordem_reprova(self):
        linhas = [consulta(0, "1.1.1.1", ordem=1), consulta(0.1, "8.8.8.8", ordem=3)]
        self.assertEqual(cf.v_ordem(linhas).veredito, cf.DIVERGENTE)


class TestPareamento(unittest.TestCase):
    def test_bloco_compacto_passa(self):
        linhas = rodada_completa(0, 0, passo=0.01)
        self.assertEqual(cf.v_pareamento(linhas).veredito, cf.CONFORME)

    def test_bloco_esticado_reprova(self):
        linhas = rodada_completa(0, 0, passo=1.0)
        self.assertEqual(cf.v_pareamento(linhas).veredito, cf.DIVERGENTE)


class TestEscalaDaColeta(unittest.TestCase):
    def test_uma_rede_reprova_e_tres_passam(self):
        uma = [consulta(0, "1.1.1.1", rede="rede-c")]
        tres = [consulta(0, "1.1.1.1", rede=r) for r in ("rede-a", "rede-b", "rede-c")]
        self.assertEqual(cf.v_redes(uma).veredito, cf.DIVERGENTE)
        self.assertEqual(cf.v_redes(tres).veredito, cf.CONFORME)

    def test_dez_minutos_reprovam_e_sete_dias_passam(self):
        curta = [consulta(0, "1.1.1.1"), consulta(600, "1.1.1.1", rodada=1)]
        longa = [consulta(0, "1.1.1.1"), consulta(8 * 86400, "1.1.1.1", rodada=1)]
        self.assertEqual(cf.v_duracao(curta).veredito, cf.DIVERGENTE)
        self.assertEqual(cf.v_duracao(longa).veredito, cf.CONFORME)

    def test_intervalo_de_dez_segundos_reprova(self):
        linhas = [consulta(i * 10, "1.1.1.1", rodada=i) for i in range(5)]
        v = cf.v_intervalo(linhas)
        self.assertEqual(v.veredito, cf.DIVERGENTE)
        self.assertIn("10 s", v.observado)

    def test_intervalo_de_trinta_minutos_passa(self):
        linhas = [consulta(i * 1800, "1.1.1.1", rodada=i) for i in range(5)]
        self.assertEqual(cf.v_intervalo(linhas).veredito, cf.CONFORME)

    def test_so_c3_reprova_e_as_tres_condicoes_passam(self):
        so_c3 = [consulta(0, "1.1.1.1", cache="C3")]
        todas = [consulta(0, "1.1.1.1", cache=c) for c in ("C1", "C2", "C3")]
        self.assertEqual(cf.v_cache(so_c3).veredito, cf.DIVERGENTE)
        self.assertEqual(cf.v_cache(todas).veredito, cf.CONFORME)


class TestEsquemaEFalhas(unittest.TestCase):
    def test_doh_sem_versao_de_http_reprova(self):
        linhas = [consulta(0, "1.1.1.1", protocolo="DoH", conexao="nova", experimento="E-2")]
        self.assertEqual(cf.v_esquema(linhas).veredito, cf.DIVERGENTE)

    def test_tudo_registrado_passa(self):
        linhas = [consulta(0, "1.1.1.1", protocolo="DoH", conexao="nova", experimento="E-2",
                           tls_versao="TLSv1.3", http_versao="HTTP/2", t_tcp=9.0, t_tls=8.0),
                  consulta(1, "1.1.1.1", protocolo="DoT", conexao="nova", experimento="E-2",
                           tls_versao="TLSv1.3", t_tcp=9.0, t_tls=8.0)]
        self.assertEqual(cf.v_esquema(linhas).veredito, cf.CONFORME)

    def test_sem_falha_nenhuma_as_regras_nao_sao_exercitadas(self):
        linhas = [consulta(0, "1.1.1.1")]
        self.assertEqual(cf.v_falhas(linhas).veredito, cf.NAO_EXERCITADO)

    def test_com_falha_as_regras_rodam(self):
        linhas = [consulta(0, "1.1.1.1"), consulta(1, "8.8.8.8", sucesso=False)]
        self.assertEqual(cf.v_falhas(linhas).veredito, cf.CONFORME)


class TestPontoDePresenca(unittest.TestCase):
    def test_troca_de_instancia_sem_troca_de_sitio_reprova(self):
        """E' o caso real: S3 compara sitio, e o sitio nunca muda."""
        linhas = [consulta(0, "1.1.1.1", rodada=0, pop="gru11"),
                  consulta(10, "1.1.1.1", rodada=1, pop="gru19")]
        v = cf.v_sensibilidade_pop(linhas)
        self.assertEqual(v.veredito, cf.DIVERGENTE)
        self.assertIn("1 de instância", v.observado)

    def test_instancia_estavel_passa(self):
        linhas = [consulta(0, "1.1.1.1", rodada=0, pop="gru11"),
                  consulta(10, "1.1.1.1", rodada=1, pop="gru11")]
        self.assertEqual(cf.v_sensibilidade_pop(linhas).veredito, cf.CONFORME)


class TestPrivacidade(unittest.TestCase):
    def test_endereco_do_resolvedor_e_legitimo(self):
        self.assertEqual(cf.v_privacidade([consulta(0, "1.1.1.1")]).veredito, cf.CONFORME)

    def test_endereco_em_outra_coluna_reprova(self):
        linha = consulta(0, "1.1.1.1")
        linha["nome"] = "host-200.144.10.22.exemplo.com"
        self.assertEqual(cf.v_privacidade([linha]).veredito, cf.DIVERGENTE)

    def test_coluna_com_nome_de_ip_reprova(self):
        linha = consulta(0, "1.1.1.1")
        linha["ip_publico"] = ""
        self.assertEqual(cf.v_privacidade([linha]).veredito, cf.DIVERGENTE)


class TestRelatorio(unittest.TestCase):
    def base(self) -> list[dict]:
        linhas = []
        for r in range(6):
            linhas += rodada_completa(r, r * 10)
            linhas += [consulta(r * 10 + 0.5, "1.1.1.1", rodada=r, ordem=4, experimento="E-2",
                                protocolo="DoT", conexao="nova", t_tcp=29.0, t_tls=17.0,
                                tls_versao="TLSv1.3"),
                       consulta(r * 10 + 0.6, "1.1.1.1", rodada=r, ordem=5, experimento="E-2",
                                protocolo="DoT", conexao="reaproveitada")]
        return linhas

    def test_toda_verificacao_aparece_na_tabela_e_na_secao(self):
        texto = "\n".join(cf.relatorio(self.base(), "provisoria"))
        for v in cf.VERIFICACOES:
            resultado = v(self.base())
            self.assertIn(f"| {resultado.id} |", texto)
            self.assertIn(f"## {resultado.id}.", texto)

    def test_todo_veredito_e_um_dos_tres(self):
        for v in cf.VERIFICACOES:
            self.assertIn(v(self.base()).veredito,
                          (cf.CONFORME, cf.DIVERGENTE, cf.NAO_EXERCITADO))

    def test_e_deterministico(self):
        linhas = self.base()
        self.assertEqual(cf.relatorio(linhas, "provisoria"),
                         cf.relatorio(linhas, "provisoria"))


if __name__ == "__main__":
    unittest.main()
