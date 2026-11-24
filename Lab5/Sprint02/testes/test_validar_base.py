"""Testes da validacao da base (Lab05, issue #134).

Rodam so' com a biblioteca padrao, a partir de Lab5/:

    python -m unittest discover -s Sprint02/testes -v
"""

from __future__ import annotations

import contextlib
import csv
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

LAB5 = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(LAB5 / "Sprint02"))
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import consolidar_base as cb  # noqa: E402
import validar_base as vb  # noqa: E402
import analise as ana  # noqa: E402

RESOLVEDORES = ("1.1.1.1", "8.8.8.8", "padrao")
NOMES = ("a.org", "b.org", "c.org")


def consulta(lote="definitiva", rede="rede-x", rodada="20261201T000000Z", ordem=1,
             segundo=0, **campos) -> dict:
    linha = {c: "" for c in cb.COLUNAS_CONSULTAS}
    linha.update(
        lote=lote, rede_id=rede, rodada_id=rodada, ordem=str(ordem),
        ts_utc=f"{rodada[:4]}-{rodada[4:6]}-{rodada[6:8]}T{rodada[9:11]}:{rodada[11:13]}:"
               f"{segundo:02d}.{ordem:03d}+00:00",
        experimento="E-1", resolvedor="1.1.1.1", protocolo="Do53", conexao="unica",
        condicao_cache="C3", nome="a.org", posicao="a.org", latencia_ms="10.0",
        rcode="NOERROR", usou_tcp="False", ttl="300", pop_id="gru11", rtt_ms="5.0",
        versao_python="3.12.0", versao_openssl="OpenSSL 3", versao_dnspython="2.9.2",
        versao_httpx="2.16.2", reconectou="False", sucesso="True",
        arquivo_origem=f"Sprint02/dados/{rede}.csv", linha_origem=str(ordem + 1))
    linha.update(campos)
    if linha["resolvedor"] != "1.1.1.1" and "pop_id" not in campos:
        linha["pop_id"] = ""
    linha["posicao"] = campos.get("posicao", linha["nome"])
    return linha


def rodada(rodada_id="20261201T000000Z", lote="definitiva", rede="rede-x",
           linha_inicial=2, pop="gru11", **por_linha) -> list[dict]:
    """3 resolvedores x 3 nomes, em E-1/Do53/C3."""
    linhas = []
    for ordem, (resolvedor, nome) in enumerate(
            ((r, n) for r in RESOLVEDORES for n in NOMES), start=1):
        linhas.append(consulta(lote, rede, rodada_id, ordem, resolvedor=resolvedor, nome=nome,
                               latencia_ms=f"{10 + ordem % 3}.0",
                               linha_origem=str(linha_inicial + ordem - 1),
                               **({"pop_id": pop} if resolvedor == "1.1.1.1" else {})))
    return linhas


def rodadas_de(consultas: list[dict]) -> list[dict]:
    grupos: dict[tuple, list[dict]] = {}
    for l in consultas:
        grupos.setdefault((l["lote"], l["rede_id"], l["rodada_id"]), []).append(l)
    return [{"lote": lote, "rede_id": rede, "rodada_id": r, "execucao": "",
             "inicio_utc": g[0]["ts_utc"], "fim_utc": g[-1]["ts_utc"], "subconjunto_c3": "",
             "n_consultas": str(len(g)), "n_falhas": "0", "n_reconexoes": "0",
             "duracao_s": "", "arquivo_origem": g[0]["arquivo_origem"]}
            for (lote, rede, r), g in grupos.items()]


def ficha(lote="definitiva", rede="rede-x", data="20261201", classificacao="(a)") -> dict:
    linha = {c: "" for c in cb.COLUNAS_FICHAS}
    linha.update(lote=lote, rede_id=rede, data=data, classificacao=classificacao,
                 padrao_id="padrao")
    return linha


class ComBase(unittest.TestCase):
    """Grava uma base minima num diretorio temporario e valida."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self._tmp.name) / "base"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def gravar(self, consultas, fichas=None, execucoes=(), rodadas=None) -> Path:
        fichas = [ficha()] if fichas is None else fichas
        cb.gravar({
            "consultas.csv.gz": cb.para_csv(consultas, cb.COLUNAS_CONSULTAS),
            "rodadas.csv": cb.para_csv(rodadas_de(consultas) if rodadas is None else rodadas,
                                       cb.COLUNAS_RODADAS),
            "execucoes.csv": cb.para_csv(list(execucoes), cb.COLUNAS_EXECUCOES),
            "fichas.csv": cb.para_csv(fichas, cb.COLUNAS_FICHAS),
        }, self.pasta)
        return self.pasta

    def validar(self, consultas, **kw) -> vb.Validacao:
        return vb.validar(self.gravar(consultas, **kw))

    def regras(self, v: vb.Validacao) -> set[str]:
        return {o.regra for o in v.ocorrencias}

    def excluidas(self, v: vb.Validacao) -> dict[str, str]:
        """ordem -> regra(s) da exclusao."""
        return {e["ordem"]: e["regra"] for e in v.exclusoes}


class TestBaseLimpa(ComBase):
    def test_base_limpa_passa_inteira(self):
        consultas = rodada()
        v = self.validar(consultas)
        self.assertEqual(v.exclusoes, [])
        self.assertEqual(len(v.validadas), len(consultas))
        self.assertLessEqual({vb.REGRAS[o.regra].nivel for o in v.ocorrencias}, {"info"})

    def test_todas_as_regras_tem_descricao_e_tratamento_valido(self):
        for nome, regra in vb.REGRAS.items():
            self.assertIn(regra.tratamento, {"exclui", "sinaliza", "registra", "bloqueia"}, nome)
            self.assertIn(regra.nivel, {"erro", "aviso", "info"}, nome)
            self.assertTrue(regra.descricao, nome)


class TestPreservacao(ComBase):
    def test_base_de_entrada_nao_e_alterada(self):
        pasta = self.gravar(rodada())
        antes = {p.name: p.read_bytes() for p in pasta.iterdir()}
        v = vb.validar(pasta)
        cb.gravar(vb.tabelas(v), Path(self._tmp.name) / "validada")
        self.assertEqual({p.name: p.read_bytes() for p in pasta.iterdir()}, antes)

    def test_validadas_mais_excluidas_reconstroem_a_base(self):
        consultas = rodada()
        consultas[0]["latencia_ms"] = "0"
        v = self.validar(consultas)
        chaves = sorted([vb.chave(l) for l in v.validadas] + [
            (e["lote"], e["rede_id"], e["rodada_id"], e["ordem"]) for e in v.exclusoes])
        self.assertEqual(chaves, sorted(vb.chave(l) for l in consultas))
        self.assertEqual(len(v.exclusoes), 1)

    def test_colunas_da_base_copiadas_sem_conversao(self):
        consultas = rodada()
        consultas[0]["latencia_ms"] = "185.35530000008293"
        v = self.validar(consultas)
        for original, validada in zip(consultas, v.validadas):
            self.assertEqual({c: validada[c] for c in cb.COLUNAS_CONSULTAS}, original)
        self.assertEqual(vb.COLUNAS_VALIDADAS[:-1], cb.COLUNAS_CONSULTAS)

    def test_exclusao_aponta_a_origem_e_justifica(self):
        consultas = rodada()
        consultas[2]["latencia_ms"] = "-1"
        excluida = self.validar(consultas).exclusoes[0]
        self.assertEqual(excluida["regra"], "valor_fora_da_faixa")
        self.assertEqual((excluida["arquivo_origem"], excluida["linha_origem"]),
                         (consultas[2]["arquivo_origem"], consultas[2]["linha_origem"]))
        self.assertIn("latencia_ms=-1", excluida["justificativa"])

    def test_saida_na_pasta_da_base_e_recusada(self):
        pasta = self.gravar(rodada())
        argv = ["validar_base.py", "--base", str(pasta), "--saida", str(pasta)]
        with mock.patch.object(sys, "argv", argv), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(vb.main(), 2)


class TestRegistroInvalido(ComBase):
    def caso(self, indice: int, **campos) -> dict[str, str]:
        consultas = rodada()
        consultas[indice].update(campos)
        return self.excluidas(self.validar(consultas))

    def test_campo_obrigatorio_vazio(self):
        self.assertEqual(self.caso(0, latencia_ms=""), {"1": "campo_obrigatorio_vazio"})

    def test_data_fora_de_utc(self):
        self.assertEqual(self.caso(0, ts_utc="2026-12-01T00:00:00.001-03:00"),
                         {"1": "tipo_invalido"})

    def test_numero_nao_finito(self):
        self.assertEqual(self.caso(0, rtt_ms="nan"), {"1": "tipo_invalido"})

    def test_latencia_zero(self):
        self.assertEqual(self.caso(0, latencia_ms="0"), {"1": "valor_fora_da_faixa"})

    def test_handshake_em_do53(self):
        self.assertEqual(self.caso(0, t_tcp_ms="3.0"), {"1": "campo_deveria_estar_vazio"})

    def test_rcode_junto_com_erro(self):
        self.assertIn("campo_deveria_estar_vazio",
                      self.caso(0, erro="timeout", latencia_ms="2000.0", sucesso="False")["1"])

    def test_e1_fora_de_do53(self):
        self.assertIn("combinacao_invalida", self.caso(0, protocolo="DoT", conexao="nova",
                                                       usou_tcp="")["1"])

    def test_dot_no_padrao(self):
        self.assertIn("combinacao_invalida",
                      self.caso(8, experimento="E-2", protocolo="DoT", conexao="nova",
                                usou_tcp="", t_tcp_ms="1", t_tls_ms="1", tls_versao="TLSv1.3")["9"])

    def test_sucesso_inconsistente(self):
        self.assertEqual(self.caso(0, sucesso="False"), {"1": "sucesso_inconsistente"})

    def test_carimbo_antes_da_rodada(self):
        self.assertEqual(self.caso(0, ts_utc="2026-11-30T23:59:59.000+00:00"),
                         {"1": "ts_antes_da_rodada"})


class TestDuplicatas(ComBase):
    def test_mesmo_conteudo_em_outro_lote_fica_so_a_primeira(self):
        provisoria = rodada(lote="provisoria")
        definitiva = [{**l, "lote": "definitiva"} for l in provisoria]
        v = self.validar(provisoria + definitiva,
                         fichas=[ficha("provisoria"), ficha("definitiva")])
        self.assertEqual({e["lote"] for e in v.exclusoes}, {"definitiva"})
        self.assertEqual(len(v.exclusoes), len(definitiva))
        self.assertEqual({e["regra"] for e in v.exclusoes}, {"duplicata_exata"})

    def test_mesmo_tratamento_duas_vezes_na_rodada(self):
        consultas = rodada()
        repetida = {**consultas[0], "ordem": "10", "latencia_ms": "11.5",
                    "ts_utc": "2026-12-01T00:00:01.000+00:00", "linha_origem": "11"}
        excluidas = self.excluidas(self.validar(consultas + [repetida]))
        self.assertEqual(excluidas, {"10": "duplicata_de_tratamento"})

    def test_mesmo_nome_em_e1_e_e2_nao_e_duplicata(self):
        consultas = rodada()
        e2 = {**consultas[0], "ordem": "10", "experimento": "E-2",
              "ts_utc": "2026-12-01T00:00:01.000+00:00"}
        self.assertEqual(self.validar(consultas + [e2]).exclusoes, [])


class TestExclusoesPreRegistradas(ComBase):
    def test_rodada_toda_com_falha_e_falha_da_rede_local(self):
        consultas = rodada()
        for l in consultas:
            l.update(erro="timeout", rcode="", latencia_ms="2000.0", sucesso="False",
                     ttl="", usou_tcp="")
        v = self.validar(consultas)
        self.assertEqual(set(self.excluidas(v).values()), {"falha_rede_local"})
        self.assertEqual(len(v.exclusoes), len(consultas))

    def test_nome_que_falha_em_todos_os_resolvedores(self):
        consultas = rodada()
        for l in consultas:
            if l["nome"] == "b.org":
                l.update(rcode="SERVFAIL", sucesso="False", ttl="")
        v = self.validar(consultas)
        self.assertEqual(set(self.excluidas(v).values()), {"falha_dominio"})
        self.assertEqual(len(v.exclusoes), 3)

    def test_falha_num_resolvedor_so_conta_em_m8(self):
        consultas = rodada()
        consultas[0].update(erro="timeout", rcode="", latencia_ms="2000.0", sucesso="False",
                            ttl="", usou_tcp="")
        v = self.validar(consultas)
        self.assertEqual(v.exclusoes, [])

    def test_rede_c_perde_o_do53(self):
        consultas = rodada()
        dot = consulta(ordem=10, experimento="E-2", protocolo="DoT", conexao="nova",
                       usou_tcp="", t_tcp_ms="1", t_tls_ms="1", tls_versao="TLSv1.3")
        v = self.validar(consultas + [dot], fichas=[ficha(classificacao="(c)")])
        self.assertEqual(len(v.exclusoes), len(consultas))
        self.assertEqual([l["protocolo"] for l in v.validadas], ["DoT"])


class TestSinalizacoes(ComBase):
    def test_ttl_ausente_em_sucesso_fica_sinalizado(self):
        consultas = rodada()
        consultas[0]["ttl"] = ""
        v = self.validar(consultas)
        self.assertEqual(v.exclusoes, [])
        self.assertEqual(v.validadas[0]["sinalizacoes"], "campo_esperado_vazio")

    def test_discrepante_fica_na_base(self):
        consultas = []
        for i in range(10):
            consultas += rodada(f"20261201T0{i}0000Z")
        consultas[0]["latencia_ms"] = "900.0"  # 1.1.1.1, ~10 ms no resto
        v = self.validar(consultas, fichas=[ficha()])
        self.assertEqual(v.exclusoes, [])
        self.assertEqual(v.validadas[0]["sinalizacoes"], "latencia_discrepante")
        self.assertEqual(sum(1 for l in v.validadas if l["sinalizacoes"]), 1)

    def test_grupo_pequeno_nao_e_avaliado(self):
        consultas = rodada()
        consultas[0]["latencia_ms"] = "900.0"
        v = self.validar(consultas)
        self.assertNotIn("latencia_discrepante", self.regras(v))
        self.assertGreater(v.discrepancias.grupos_pequenos, 0)

    def test_pop_mudou_compara_o_sitio(self):
        consultas = (rodada("20261201T000000Z", pop="gru11")
                     + rodada("20261201T003000Z", pop="gru19")
                     + rodada("20261201T010000Z", pop="eze01"))
        v = self.validar(consultas)
        mudancas = [o.rodada_id for o in v.ocorrencias if o.regra == "pop_mudou"]
        self.assertEqual(mudancas, ["20261201T010000Z"])
        sinal = {l["rodada_id"]: l["sinalizacoes"] for l in v.validadas}
        self.assertEqual(sinal["20261201T003000Z"], "")
        self.assertEqual(sinal["20261201T010000Z"], "pop_mudou")
        pops = {r["rodada_id"]: r["pop_1111"] for r in v.rodadas}
        self.assertEqual(pops["20261201T003000Z"], "gru19")

    def test_rodada_incompleta(self):
        consultas = rodada("20261201T000000Z") + rodada("20261201T003000Z")[:-1]
        v = self.validar(consultas)
        incompletas = [o.rodada_id for o in v.ocorrencias if o.regra == "rodada_incompleta"]
        self.assertEqual(incompletas, ["20261201T003000Z"])


class TestRegistros(ComBase):
    def test_dia_sem_ficha(self):
        v = self.validar(rodada(), fichas=[])
        self.assertIn("dia_sem_ficha", self.regras(v))

    def test_dois_padroes(self):
        consultas = rodada()
        for l in consultas:
            if l["resolvedor"] == "padrao" and l["nome"] == "a.org":
                l["resolvedor"] = "padrao-2"
        self.assertIn("mais_de_um_padrao", self.regras(self.validar(consultas)))

    def test_ambiente_misto(self):
        consultas = rodada("20261201T000000Z") + rodada("20261201T003000Z")
        for l in consultas[9:]:
            l["versao_python"] = "3.14.0"
        self.assertIn("ambiente_misto", self.regras(self.validar(consultas)))

    def test_lacuna_entre_rodadas(self):
        consultas = sum((rodada(r) for r in ("20261201T000000Z", "20261201T003000Z",
                                             "20261201T010000Z", "20261201T030000Z")), [])
        v = self.validar(consultas)
        lacunas = [o.rodada_id for o in v.ocorrencias if o.regra == "lacuna_entre_rodadas"]
        self.assertEqual(lacunas, ["20261201T010000Z"])

    def test_execucao_interrompida_e_divergente_do_log(self):
        consultas = rodada()
        rodadas = rodadas_de(consultas)
        rodadas[0]["execucao"] = "1"
        execucao = {c: "" for c in cb.COLUNAS_EXECUCOES}
        execucao.update(lote="definitiva", rede_id="rede-x", execucao="1", semente="7",
                        rodadas_previstas="336", rodadas_no_log="2", codigo_saida="")
        v = self.validar(consultas, rodadas=rodadas, execucoes=[execucao])
        self.assertTrue({"execucao_interrompida", "rodadas_divergem_do_log"} <= self.regras(v))


class TestPrivacidade(ComBase):
    def test_ip_publico_bloqueia_a_gravacao(self):
        consultas = rodada()
        consultas[0]["interface"] = "200.160.2.3"
        with self.assertRaises(vb.ErroDeValidacao) as erro:
            self.validar(consultas)
        self.assertNotIn("200.160.2.3", str(erro.exception))

    def test_publicos_e_privados_passam(self):
        self.assertEqual(vb.ips_publicos("1.1.1.1 8.8.8.8 192.168.0.1 10.0.0.1 OpenSSL 3.0.18"), [])
        self.assertEqual(vb.ips_publicos("x 177.10.20.30 y"), ["177.10.20.30"])


class TestPreenchimento(unittest.TestCase):
    def test_doh_nova_nao_tem_handshake(self):
        linha = consulta(experimento="E-2", protocolo="DoH", conexao="nova", usou_tcp="")
        self.assertEqual(vb.preenchimento("t_tcp_ms", linha), "vazio")
        self.assertEqual(vb.preenchimento("usou_tcp", linha), "vazio")

    def test_dot_nova_com_sucesso_espera_handshake(self):
        linha = consulta(experimento="E-2", protocolo="DoT", conexao="nova", usou_tcp="")
        self.assertEqual(vb.preenchimento("t_tls_ms", linha), "esperado")

    def test_pop_por_resolvedor(self):
        self.assertEqual(vb.preenchimento("pop_id", consulta()), "esperado")
        self.assertEqual(vb.preenchimento("pop_id", consulta(resolvedor="8.8.8.8")), "livre")
        self.assertEqual(vb.preenchimento("pop_id", consulta(resolvedor="padrao")), "vazio")


class TestVerificar(ComBase):
    def test_verificar_acusa_validada_desatualizada(self):
        pasta = self.gravar(rodada())
        saida = Path(self._tmp.name) / "validada"
        argv = ["validar_base.py", "--base", str(pasta), "--saida", str(saida)]
        silencio = contextlib.redirect_stdout(io.StringIO())
        with mock.patch.object(sys, "argv", argv), silencio:
            self.assertEqual(vb.main(), 0)
        with mock.patch.object(sys, "argv", argv + ["--verificar"]), silencio, \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(vb.main(), 0)
            self.gravar(rodada()[:-1])
            self.assertEqual(vb.main(), 1)

    def test_saida_deterministica(self):
        pasta = self.gravar(rodada())
        self.assertEqual(vb.tabelas(vb.validar(pasta)), vb.tabelas(vb.validar(pasta)))


class TestBaseValidadaVersionada(unittest.TestCase):
    def test_base_validada_do_repositorio_esta_em_dia(self):
        conteudos = vb.tabelas(vb.validar())
        for nome, texto in conteudos.items():
            with self.subTest(arquivo=nome):
                self.assertEqual(cb.ler_gravado(vb.SAIDA / nome), texto,
                                 "rode `python Sprint02/validar_base.py` e versione")

    def test_analise_le_a_base_validada(self):
        linhas = ana.carregar(vb.SAIDA / "consultas.csv.gz", "piloto")
        self.assertTrue(linhas)
        self.assertEqual({l["lote"] for l in linhas}, {"piloto"})


if __name__ == "__main__":
    unittest.main()
