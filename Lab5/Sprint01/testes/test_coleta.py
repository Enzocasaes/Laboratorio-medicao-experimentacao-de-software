"""Confere a instrumentacao e a analise sem tocar na rede (Lab05, Part. C).

O que precisa de rede foi validado a mao e esta' registrado no
`Docs/PlanoDeInstrumentacao.md`. Aqui ficam as invariantes que um teste
automatico consegue garantir a cada mudanca:

- a mensagem DNS e' a mesma em todos os tratamentos (senao a diferenca medida
  nao seria so' do protocolo);
- o esquema do CSV nao perde coluna em silencio;
- os nomes de C1 sao distintos por resolvedor (senao um resolvedor aquece o
  cache do outro);
- a unidade de inferencia e' o nome em C3 e a janela de 6 h nas demais (e' o
  passo que impede a pseudorreplicacao);
- um timeout entra censurado e fora da mediana.
"""

from __future__ import annotations

import csv
import sys
import tempfile
import unittest
from pathlib import Path

COLETA = Path(__file__).resolve().parent.parent / "coleta"
sys.path.insert(0, str(COLETA))

try:
    import dns.rdataclass  # noqa: F401
    import medidor as md
    import coletor as col
    TEM_DNSPYTHON = True
except ImportError:  # a analise roda sem dnspython; a coleta nao
    TEM_DNSPYTHON = False

import analise as ana  # noqa: E402


# --------------------------------------------------------- instrumentacao


@unittest.skipUnless(TEM_DNSPYTHON, "dnspython ausente: so' a analise roda sem ele")
class TestMensagem(unittest.TestCase):
    def test_a_mesma_mensagem_para_todos(self):
        """Tipo A, classe IN, EDNS0 com 1232 e SEM o bit DO (secao 9.4)."""
        pergunta = md.consulta("exemplo.com")
        self.assertEqual(pergunta.question[0].rdtype, md.dns.rdatatype.A)
        self.assertEqual(pergunta.question[0].rdclass, md.dns.rdataclass.IN)
        self.assertEqual(pergunta.payload, md.PAYLOAD_EDNS)
        self.assertEqual(pergunta.edns, 0)
        self.assertFalse(pergunta.want_dnssec())

    def test_duas_chamadas_dao_a_mesma_pergunta(self):
        a, b = md.consulta("exemplo.com"), md.consulta("exemplo.com")
        self.assertEqual(a.question[0].to_text(), b.question[0].to_text())


@unittest.skipUnless(TEM_DNSPYTHON, "dnspython ausente")
class TestEsquema(unittest.TestCase):
    OBRIGATORIAS = (
        "ts_utc", "rede_id", "rodada_id", "ordem", "experimento", "resolvedor",
        "protocolo", "conexao", "condicao_cache", "nome", "latencia_ms",
        "t_tcp_ms", "t_tls_ms", "tls_versao", "http_versao", "rcode", "erro",
        "usou_tcp", "ttl", "ttl_autoritativo", "s_desde_ultima_consulta",
        "pop_id", "rtt_ms", "interface", "versao_python", "versao_openssl",
        "versao_dnspython",
    )

    def test_todas_as_colunas_da_secao_96_existem(self):
        for coluna in self.OBRIGATORIAS:
            with self.subTest(coluna=coluna):
                self.assertIn(coluna, md.COLUNAS)

    def test_as_colunas_acrescentadas_estao_documentadas(self):
        """Qualquer coluna extra e' decisao de C e precisa de justificativa."""
        extras = set(md.COLUNAS) - set(self.OBRIGATORIAS)
        self.assertEqual(extras, {"versao_httpx", "reconectou", "posicao"})

    def test_medida_vazia_vira_linha_valida(self):
        linha = {c: getattr(md.Medida(), c) for c in md.COLUNAS}
        self.assertEqual(set(linha), set(md.COLUNAS))

    def test_sucesso_exige_noerror_e_sem_erro(self):
        self.assertFalse(md.Medida().sucesso)
        self.assertTrue(md.Medida(rcode="NOERROR").sucesso)
        self.assertFalse(md.Medida(rcode="NOERROR", erro="timeout").sucesso)
        self.assertFalse(md.Medida(rcode="SERVFAIL").sucesso)


@unittest.skipUnless(TEM_DNSPYTHON, "dnspython ausente")
class TestResolvedor(unittest.TestCase):
    def test_publicos_tem_cifrado_e_padrao_nao(self):
        for resolvedor in md.PUBLICOS:
            self.assertTrue(resolvedor.tem_cifrado)
        self.assertFalse(md.Resolvedor("padrao", "192.168.0.1").tem_cifrado)

    def test_rtt_usa_porta_443_no_publico_e_53_no_padrao(self):
        """Nao e' detalhe: o padrao de uma rede quase nunca atende em 443."""
        self.assertEqual(md.PORTA_DOH, 443)
        self.assertEqual(md.PORTA_DO53, 53)


@unittest.skipUnless(TEM_DNSPYTHON, "dnspython ausente")
class TestRodada(unittest.TestCase):
    def test_nome_c1_e_distinto_por_resolvedor(self):
        """Se o nome fosse igual, um resolvedor aqueceria o cache do outro —
        e C1 mediria cache em vez de recursao (secao 9.3)."""
        a = col.nome_c1("zona.br", "rede", "rod", "1.1.1.1", 0)
        b = col.nome_c1("zona.br", "rede", "rod", "8.8.8.8", 0)
        self.assertNotEqual(a, b)
        self.assertTrue(a.endswith(".c1.zona.br"))

    def test_c1_pareia_por_posicao_e_nao_por_nome(self):
        """O bug que isto pega: em C1 os nomes sao distintos por resolvedor.

        Se o bloco fosse chaveado pelo nome, C1 nunca encontraria par e a
        condicao mais cara do experimento — a resolucao recursiva completa —
        ficaria sem analise nenhuma.
        """
        tratamentos = col.montar_rodada(list(md.PUBLICOS), [], "zona.br",
                                        "rede", "rod", 2, 0)
        c1 = [t for t in tratamentos if t.condicao_cache == "C1"]
        self.assertEqual(len({t.nome for t in c1}), len(c1))     # nomes todos distintos
        self.assertEqual({t.posicao for t in c1}, {"c1-0", "c1-1"})  # posicoes compartilhadas

    def test_em_c2_e_c3_a_posicao_e_o_proprio_nome(self):
        tratamentos = col.montar_rodada(list(md.PUBLICOS), ["a.com"], "zona.br",
                                        "rede", "rod", 0, 1)
        for t in tratamentos:
            if t.condicao_cache in ("C2", "C3"):
                with self.subTest(nome=t.nome):
                    self.assertEqual(t.posicao, t.nome)

    def test_nome_c1_nunca_se_repete(self):
        nomes = {col.nome_c1("z.br", "r", "rod", "1.1.1.1", 0) for _ in range(50)}
        self.assertEqual(len(nomes), 50)

    def test_sem_zona_so_ha_c3(self):
        tratamentos = col.montar_rodada(list(md.PUBLICOS), ["a.com", "b.com"],
                                        None, "rede", "rod", 2, 2)
        self.assertEqual({t.condicao_cache for t in tratamentos}, {"C3"})

    def test_com_zona_entram_c1_e_c2(self):
        tratamentos = col.montar_rodada(list(md.PUBLICOS), ["a.com"],
                                        "zona.br", "rede", "rod", 2, 2)
        self.assertEqual({t.condicao_cache for t in tratamentos}, {"C1", "C2", "C3"})

    def test_e2_cobre_as_cinco_condicoes_nos_publicos(self):
        tratamentos = col.montar_rodada(list(md.PUBLICOS), ["a.com"], None,
                                        "rede", "rod", 1, 1)
        e2 = [t for t in tratamentos if t.experimento == "E-2"]
        combinacoes = {(t.resolvedor.id, t.protocolo, t.conexao) for t in e2}
        self.assertEqual(len(combinacoes), 2 * len(col.PROTOCOLOS_E2))

    def test_o_padrao_nao_entra_no_e2(self):
        """Ele so' oferece Do53; medir DoT nele nao faria sentido."""
        resolvedores = list(md.PUBLICOS) + [md.Resolvedor("padrao", "192.168.0.1")]
        tratamentos = col.montar_rodada(resolvedores, ["a.com"], None,
                                        "rede", "rod", 1, 1)
        e2 = {t.resolvedor.id for t in tratamentos if t.experimento == "E-2"}
        self.assertNotIn("padrao", e2)


# ------------------------------------------------------------- analise


def _linha(**campos) -> dict:
    base = {
        "ts_utc": "2026-11-19T02:30:00.000+00:00", "rede_id": "r1",
        "rodada_id": "rod1", "ordem": "1", "experimento": "E-1",
        "resolvedor": "1.1.1.1", "protocolo": "Do53", "conexao": "unica",
        "condicao_cache": "C3", "nome": "a.com", "latencia_ms": "10.0",
        "t_tcp_ms": "", "t_tls_ms": "", "tls_versao": "", "http_versao": "",
        "rcode": "NOERROR", "erro": "", "usou_tcp": "False", "ttl": "60",
        "ttl_autoritativo": "", "s_desde_ultima_consulta": "", "pop_id": "cnf01",
        "rtt_ms": "7.0", "interface": "en0", "versao_python": "3.13.7",
        "versao_openssl": "OpenSSL", "versao_dnspython": "2.9.2",
        "versao_httpx": "2.16.2", "reconectou": "False", "posicao": "a.com",
    }
    base.update({k: str(v) for k, v in campos.items()})
    return base


def _csv_temporario(linhas: list[dict]) -> Path:
    arquivo = Path(tempfile.mkdtemp()) / "coleta.csv"
    with open(arquivo, "w", newline="", encoding="utf-8") as saida:
        escritor = csv.DictWriter(saida, fieldnames=list(linhas[0]))
        escritor.writeheader()
        escritor.writerows(linhas)
    return arquivo


class TestUnidadeDeInferencia(unittest.TestCase):
    def test_c3_agrega_por_nome(self):
        linha = ana.carregar(_csv_temporario([_linha()]))[0]
        self.assertEqual(ana.unidade_de_inferencia(linha), "nome:a.com")

    def test_c1_e_c2_agregam_por_janela(self):
        """Os nomes de C1 e C2 sao replicas sinteticas; trata-los como
        unidades seria pseudorreplicacao (secao 10.2)."""
        for condicao in ("C1", "C2"):
            with self.subTest(condicao=condicao):
                linha = ana.carregar(_csv_temporario(
                    [_linha(condicao_cache=condicao)]))[0]
                self.assertTrue(ana.unidade_de_inferencia(linha).startswith("janela:"))

    def test_e2_agrega_por_janela_mesmo_em_c3(self):
        linha = ana.carregar(_csv_temporario([_linha(experimento="E-2")]))[0]
        self.assertTrue(ana.unidade_de_inferencia(linha).startswith("janela:"))

    def test_as_quatro_janelas_do_dia(self):
        horas = {"01": 0, "07": 1, "13": 2, "19": 3}
        for hora, esperado in horas.items():
            with self.subTest(hora=hora):
                linha = ana.carregar(_csv_temporario(
                    [_linha(ts_utc=f"2026-11-19T{hora}:00:00.000+00:00")]))[0]
                self.assertEqual(ana.janela_6h(linha), f"2026-11-19#{esperado}")


class TestCarregar(unittest.TestCase):
    def test_timeout_entra_censurado_e_fora_da_mediana(self):
        linhas = ana.carregar(_csv_temporario([
            _linha(latencia_ms=10.0),
            _linha(latencia_ms=2000.0, erro="timeout", rcode=""),
        ]))
        self.assertTrue(linhas[0]["sucesso"])
        self.assertFalse(linhas[1]["sucesso"])
        self.assertEqual(linhas[1]["latencia_ms"], 2000.0)
        resumo = ana.descritiva(linhas)[0]
        self.assertEqual(resumo["mediana_ms"], 10.0)   # o timeout ficou de fora
        self.assertEqual(resumo["falhas"], 1)

    def test_servfail_nao_conta_como_sucesso(self):
        linhas = ana.carregar(_csv_temporario([_linha(rcode="SERVFAIL")]))
        self.assertFalse(linhas[0]["sucesso"])

    def test_p95_so_com_amostra_suficiente(self):
        poucas = ana.carregar(_csv_temporario([_linha() for _ in range(50)]))
        muitas = ana.carregar(_csv_temporario([_linha() for _ in range(120)]))
        self.assertIsNone(ana.descritiva(poucas)[0]["p95_ms"])
        self.assertIsNotNone(ana.descritiva(muitas)[0]["p95_ms"])


class TestPareamento(unittest.TestCase):
    def test_so_pareia_dentro_do_bloco(self):
        """Blocos diferentes nao se misturam: e' o que remove o efeito da rodada."""
        linhas = ana.carregar(_csv_temporario([
            _linha(rodada_id="r1", resolvedor="1.1.1.1", latencia_ms=10),
            _linha(rodada_id="r1", resolvedor="8.8.8.8", latencia_ms=25),
            _linha(rodada_id="r2", resolvedor="1.1.1.1", latencia_ms=12),
            # sem o par do 8.8.8.8 em r2: a rodada 2 nao gera delta
        ]))
        deltas = ana.diferencas_por_unidade(linhas, "E-1", "1.1.1.1", "8.8.8.8")
        self.assertEqual(deltas, {"nome:a.com": [-15.0]})

    def test_falha_nao_entra_no_pareamento(self):
        linhas = ana.carregar(_csv_temporario([
            _linha(resolvedor="1.1.1.1", latencia_ms=10),
            _linha(resolvedor="8.8.8.8", latencia_ms=2000, erro="timeout", rcode=""),
        ]))
        self.assertEqual(ana.diferencas_por_unidade(linhas, "E-1",
                                                    "1.1.1.1", "8.8.8.8"), {})


class TestTaxaDeVitoria(unittest.TestCase):
    def test_diferenca_pequena_e_empate(self):
        """Menos de 1 ms e' ruido, nao vitoria (M5)."""
        resultado = ana.taxa_de_vitoria([-0.5, 0.4, -5.0, 3.0])
        self.assertEqual(resultado["empates"], 2)
        self.assertEqual(resultado["vitorias"], 1)
        self.assertEqual(resultado["derrotas"], 1)
        self.assertAlmostEqual(resultado["taxa"], 0.5)

    def test_tudo_empate_nao_tem_taxa(self):
        self.assertIsNone(ana.taxa_de_vitoria([0.1, -0.2])["taxa"])


class TestComparacaoInsuficiente(unittest.TestCase):
    def test_uma_unica_unidade_vira_descritiva_e_nao_some(self):
        """Resultado ausente precisa ser visivel: a linha aparece sem IC."""
        linhas = ana.carregar(_csv_temporario([
            _linha(experimento="E-2", protocolo="Do53", latencia_ms=10),
            _linha(experimento="E-2", protocolo="DoT", conexao="nova",
                   latencia_ms=40),
        ]))
        resultado = ana.comparar(linhas, "E-2", "1.1.1.1|DoT|nova",
                                 "1.1.1.1|Do53|unica", replicas=50)
        self.assertIsNotNone(resultado)
        self.assertEqual(resultado["unidades"], 1)
        self.assertIsNone(resultado["ic95"])
        self.assertIsNone(resultado["wilcoxon"])
        self.assertIn("unica unidade", resultado["insuficiente"])


if __name__ == "__main__":
    unittest.main()


class TestPareamentoEmC1(unittest.TestCase):
    """O pareamento de C1 sobre dados sinteticos, ponta a ponta."""

    def test_nomes_distintos_mas_blocos_pareados(self):
        linhas = ana.carregar(_csv_temporario([
            _linha(condicao_cache="C1", resolvedor="1.1.1.1",
                   nome="rede-rod-1111-0-abc.c1.zona.br", posicao="c1-0",
                   latencia_ms=120),
            _linha(condicao_cache="C1", resolvedor="8.8.8.8",
                   nome="rede-rod-8888-0-xyz.c1.zona.br", posicao="c1-0",
                   latencia_ms=200),
        ]))
        deltas = ana.diferencas_por_unidade(linhas, "E-1", "1.1.1.1", "8.8.8.8")
        self.assertEqual(list(deltas.values()), [[-80.0]])
        # e a unidade de inferencia de C1 e' a janela, nao o nome
        self.assertTrue(list(deltas)[0].startswith("janela:"))

    def test_csv_sem_a_coluna_posicao_ainda_pareia_por_nome(self):
        """Compatibilidade: um CSV antigo nao quebra a analise."""
        antigo = _linha()
        del antigo["posicao"]
        linhas = ana.carregar(_csv_temporario([
            {**antigo, "resolvedor": "1.1.1.1", "latencia_ms": "10"},
            {**antigo, "resolvedor": "8.8.8.8", "latencia_ms": "25"},
        ]))
        deltas = ana.diferencas_por_unidade(linhas, "E-1", "1.1.1.1", "8.8.8.8")
        self.assertEqual(list(deltas.values()), [[-15.0]])


@unittest.skipUnless(TEM_DNSPYTHON, "dnspython ausente")
class TestRodadaSemNomes(unittest.TestCase):
    def test_sem_dominios_e_sem_zona_nao_estoura(self):
        """Melhor um sub-experimento ausente do que um nome inventado."""
        tratamentos = col.montar_rodada(list(md.PUBLICOS), [], None,
                                        "rede", "rod", 1, 1)
        self.assertEqual(tratamentos, [])

    def test_sem_dominios_mas_com_zona_roda_c1_c2_e_e2(self):
        tratamentos = col.montar_rodada(list(md.PUBLICOS), [], "zona.br",
                                        "rede", "rod", 1, 1)
        self.assertEqual({t.condicao_cache for t in tratamentos}, {"C1", "C2"})
        self.assertTrue(any(t.experimento == "E-2" for t in tratamentos))
