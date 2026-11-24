"""Valida a base consolidada do Lab05 e gera a base validada (issue #134).

O QUE FAZ

Le a base de `Sprint02/base/` (gerada por `consolidar_base.py`), sem altera-la,
roda o catalogo de verificacoes `REGRAS` e grava em `Sprint02/base_validada/`:

- `consultas.csv.gz`: as consultas que ficam, com as mesmas colunas da base,
  copiadas sem conversao, mais `sinalizacoes` (codigos separados por `;`).
- `exclusoes.csv`: as consultas que saem, uma linha por consulta, com a regra
  e a justificativa. Validadas + excluidas = base, sem sobra nem falta.
- `rodadas.csv`: as rodadas da base com o resultado da validacao
  (`n_excluidas`, `pop_1111`, `sinalizacoes`).
- `ocorrencias.csv`: tudo o que as verificacoes encontraram, inclusive o que
  nao muda nenhuma linha.
- `relatorio_validacao.md`: o resumo, com a contagem de cada regra (zero
  tambem e' resultado: a verificacao rodou e nao achou nada).

O QUE CADA NIVEL FAZ

- `exclui`: a consulta sai da base validada e entra em `exclusoes.csv`. So'
  para registro invalido (o numero nao e' medida) ou para as regras de
  exclusao pre-registradas no planejamento (secao 10.4 e ficha (c)).
- `sinaliza`: a consulta fica e ganha o codigo em `sinalizacoes`. E' o caso
  dos discrepantes: sao investigados, nunca removidos automaticamente.
- `registra`: so' entra em `ocorrencias.csv` (rodada, execucao ou dia).
- `bloqueia`: nada e' gravado. Hoje so' a privacidade (IP publico inteiro).

As regras estao documentadas em `Sprint02/base_validada/README.md`.

Uso (a partir de Lab5/, so' biblioteca padrao):

    python Sprint02/validar_base.py              # regenera a base validada
    python Sprint02/validar_base.py --verificar  # confere se esta' em dia
"""

from __future__ import annotations

import argparse
import csv
import io
import ipaddress
import math
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import consolidar_base as cb  # noqa: E402

SAIDA = cb.LAB5 / "Sprint02" / "base_validada"

# Medidor (Sprint01/coleta/medidor.py): timeout de 2 s, censurado em 2.000 ms.
CENSURA_MS = 2000.0
# Enderecos dos publicos que podem aparecer inteiros (Planejamento, 9.6; R6).
IPS_PERMITIDOS = {"1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"}
PUBLICOS = {"1.1.1.1", "8.8.8.8"}
# RFC 8767 recomenda limitar o TTL a 7 dias; acima disso o valor e' suspeito.
TTL_MAXIMO_S = 7 * 24 * 3600
# Discrepantes: cercas de Tukey "extremas" (3 IQR) sobre o log da latencia.
FATOR_IQR = 3.0
MIN_SUCESSOS_POR_GRUPO = 20
MIN_RODADAS = 10
# Lacuna: intervalo entre rodadas maior que 1,5 vez a mediana dos intervalos.
FATOR_LACUNA = 1.5
# Uma consulta com carimbo mais de 1 intervalo nominal (30 min) depois do
# inicio da rodada ja' estaria dentro da rodada seguinte.
LIMITE_DENTRO_DA_RODADA = timedelta(seconds=1800)


@dataclass(frozen=True)
class Regra:
    nivel: str        # erro | aviso | info
    tratamento: str   # exclui | sinaliza | registra | bloqueia
    escopo: str       # consulta | rodada | execucao | dia | rede | base
    descricao: str


# A ordem e' a do relatorio. Uma regra que nao achou nada tambem aparece la'.
REGRAS: dict[str, Regra] = {
    # -- registro invalido: o numero nao e' uma medida
    "campo_obrigatorio_vazio": Regra(
        "erro", "exclui", "consulta",
        "Campo que o coletor sempre preenche esta' vazio"),
    "tipo_invalido": Regra(
        "erro", "exclui", "consulta",
        "Valor que nao e' do tipo da coluna (numero, inteiro, data UTC, rodada_id, logico)"),
    "valor_fora_da_faixa": Regra(
        "erro", "exclui", "consulta",
        "Numero fisicamente impossivel: latencia ou RTT <= 0, tempo ou TTL negativo, ordem < 1"),
    "campo_deveria_estar_vazio": Regra(
        "erro", "exclui", "consulta",
        "Campo preenchido onde nao se aplica (handshake fora de DoT nova, usou_tcp fora de Do53, rcode junto com erro...)"),
    "combinacao_invalida": Regra(
        "erro", "exclui", "consulta",
        "Combinacao fora do desenho (5.2): Do53 sem conexao unica, E-1 fora de Do53, E-2/DoT/DoH fora dos publicos, posicao incoerente com a condicao"),
    "sucesso_inconsistente": Regra(
        "erro", "exclui", "consulta",
        "A coluna `sucesso` nao segue a regra erro vazio e rcode NOERROR"),
    "ts_antes_da_rodada": Regra(
        "erro", "exclui", "consulta",
        "Carimbo da consulta anterior ao inicio da rodada"),
    "duplicata_exata": Regra(
        "erro", "exclui", "consulta",
        "As 30 colunas do coletor repetem outra consulta (mesmo carimbo ao milissegundo); fica a primeira"),
    "duplicata_de_tratamento": Regra(
        "erro", "exclui", "consulta",
        "O mesmo tratamento na mesma posicao aparece duas vezes na rodada; fica a de menor ordem"),
    # -- regras de exclusao pre-registradas
    "falha_rede_local": Regra(
        "aviso", "exclui", "rodada",
        "Todas as consultas da rodada falharam: falha da rede local (Planejamento, 10.4)"),
    "falha_dominio": Regra(
        "aviso", "exclui", "consulta",
        "O nome falhou em todos os resolvedores na rodada: falha do dominio (Planejamento, 10.4)"),
    "rede_interceptada": Regra(
        "aviso", "exclui", "consulta",
        "Do53 num dia em que a ficha classificou a rede como (c): a porta 53 nao chega ao resolvedor nominal"),
    # -- avisos sobre a consulta: fica, com sinalizacao
    "campo_esperado_vazio": Regra(
        "aviso", "sinaliza", "consulta",
        "Campo que deveria vir preenchido esta' vazio, sem invalidar a medida (TTL sem resposta, handshake de DoT, pop_id do 1.1.1.1, usou_tcp)"),
    "timeout_fora_da_censura": Regra(
        "aviso", "sinaliza", "consulta",
        "Timeout com latencia diferente de 2.000 ms (a censura da 10.4)"),
    "latencia_acima_do_timeout": Regra(
        "aviso", "sinaliza", "consulta",
        "Sucesso com latencia acima de 2.000 ms"),
    "ttl_acima_de_7_dias": Regra(
        "aviso", "sinaliza", "consulta",
        "TTL acima de 7 dias (RFC 8767)"),
    "ts_alem_da_rodada": Regra(
        "aviso", "sinaliza", "consulta",
        "Carimbo mais de 30 min depois do inicio da rodada"),
    # -- discrepantes: investigados, nunca removidos
    "latencia_discrepante": Regra(
        "info", "sinaliza", "consulta",
        "Latencia fora das cercas de 3 IQR (escala log) do seu tratamento, na rede e no lote"),
    "rodada_discrepante": Regra(
        "info", "sinaliza", "rodada",
        "A rodada inteira esta' deslocada: mediana dos residuos fora das cercas de 3 IQR das rodadas"),
    "pop_mudou": Regra(
        "info", "sinaliza", "rodada",
        "O sitio do 1.1.1.1 (letras do pop_id, `gru` em `gru22`) mudou em relacao a rodada anterior (sensibilidade 3, secao 10.6)"),
    # -- estrutura das rodadas
    "rodada_incompleta": Regra(
        "aviso", "sinaliza", "rodada",
        "Menos consultas que as outras rodadas da mesma execucao, ou `ordem` com lacuna"),
    "ordem_fora_do_tempo": Regra(
        "aviso", "registra", "rodada",
        "Os carimbos nao crescem com a `ordem` dentro da rodada"),
    "pop_varia_na_rodada": Regra(
        "aviso", "sinaliza", "rodada",
        "Mais de um pop_id do 1.1.1.1 na mesma rodada (o pop e' medido uma vez por rodada)"),
    "lacuna_entre_rodadas": Regra(
        "aviso", "registra", "rodada",
        "Intervalo ate' a rodada seguinte maior que 1,5 vez a mediana dos intervalos"),
    "rodada_sem_execucao": Regra(
        "aviso", "registra", "rodada",
        "Rodada de um lote com log que nao aparece no log"),
    # -- execucoes, dias e redes
    "execucao_interrompida": Regra(
        "aviso", "registra", "execucao",
        "O coletor terminou antes das rodadas previstas ou sem codigo de saida 0"),
    "rodadas_divergem_do_log": Regra(
        "aviso", "registra", "execucao",
        "Numero de rodadas no CSV diferente do numero de rodadas que o log registra"),
    "ambiente_misto": Regra(
        "aviso", "registra", "rede",
        "Mais de uma combinacao de versoes (Python, OpenSSL, dnspython, httpx) na mesma rede e lote"),
    "mais_de_um_padrao": Regra(
        "aviso", "registra", "rede",
        "Mais de um resolvedor padrao na mesma rede (R6 exige exatamente um)"),
    "dia_sem_ficha": Regra(
        "aviso", "registra", "dia",
        "Dia com consultas e sem ficha de rede (6.6 pede uma por dia)"),
    "classificacao_mudou": Regra(
        "aviso", "registra", "rede",
        "A classificacao da rede mudou entre fichas"),
    # -- privacidade
    "ip_publico_exposto": Regra(
        "erro", "bloqueia", "base",
        "Endereco IP publico inteiro em algum campo (Planejamento, 9.6)"),
}

COLUNAS_VALIDADAS = (*cb.COLUNAS_CONSULTAS, "sinalizacoes")
COLUNAS_EXCLUSOES = ("lote", "rede_id", "rodada_id", "ordem", "regra",
                     "justificativa", "arquivo_origem", "linha_origem")
COLUNAS_RODADAS_VALIDADAS = (*cb.COLUNAS_RODADAS, "n_excluidas", "pop_1111",
                             "sinalizacoes")
COLUNAS_OCORRENCIAS = ("regra", "nivel", "tratamento", "escopo", "lote",
                       "rede_id", "rodada_id", "ordem", "coluna", "valor",
                       "detalhe")

# Tipos das colunas brutas (dicionario da base, 5.1).
TIPOS = {
    **{c: "decimal" for c in cb.DECIMAIS},
    **{c: "inteiro" for c in cb.INTEIROS},
    "ts_utc": "data_utc", "rodada_id": "rodada_id",
    "usou_tcp": "logico", "reconectou": "logico", "sucesso": "logico",
}
# Minimos: `> 0` para o que e' tempo de ida e volta, `>= 0` para o resto.
POSITIVOS = {"latencia_ms", "rtt_ms"}
MINIMOS = {"t_tcp_ms": 0, "t_tls_ms": 0, "s_desde_ultima_consulta": 0,
           "ttl": 0, "ttl_autoritativo": 0, "ordem": 1}
SEMPRE_PREENCHIDAS = (
    "lote", "ts_utc", "rede_id", "rodada_id", "ordem", "experimento",
    "resolvedor", "protocolo", "conexao", "condicao_cache", "nome", "posicao",
    "latencia_ms", "reconectou", "versao_python", "versao_openssl",
    "versao_dnspython", "versao_httpx", "sucesso", "arquivo_origem",
    "linha_origem")
# Por que um vazio e' esperado (aparece no relatorio de valores ausentes).
MOTIVO_DO_VAZIO = {
    "t_tcp_ms": "so' DoT com conexao nova; o DoH nao separa os tempos",
    "t_tls_ms": "so' DoT com conexao nova; o DoH nao separa os tempos",
    "tls_versao": "so' DoT com conexao nova",
    "http_versao": "nunca gravada (V5)",
    "rcode": "vazio quando ha' erro de transporte",
    "erro": "vazio = sem erro de transporte",
    "usou_tcp": "so' Do53",
    "ttl": "vazio em falha ou resposta sem registros",
    "ttl_autoritativo": "depende da zona do grupo (D1)",
    "s_desde_ultima_consulta": "primeira consulta do par em cada execucao (V10)",
    "pop_id": "so' o 1.1.1.1 responde id.server (DefinicaoDasMetricas 2.4)",
    "rtt_ms": "alvo nao aceitou TCP na porta (ausencia e' informacao, 2.3)",
    "interface": "vazia no Windows (V6)",
}

RE_RODADA_ID = re.compile(r"\d{8}T\d{6}Z")
RE_IPV4 = re.compile(r"(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])")


@dataclass
class Ocorrencia:
    regra: str
    lote: str = ""
    rede_id: str = ""
    rodada_id: str = ""
    ordem: str = ""
    coluna: str = ""
    valor: str = ""
    detalhe: str = ""

    def linha(self) -> dict:
        regra = REGRAS[self.regra]
        return {"regra": self.regra, "nivel": regra.nivel,
                "tratamento": regra.tratamento, "escopo": regra.escopo,
                **{k: v for k, v in asdict(self).items() if k != "regra"}}


class ErroDeValidacao(Exception):
    """Uma regra `bloqueia` disparou; nada e' gravado."""


# ------------------------------------------------------------- leitura


def ler_csv(texto: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(texto)))


def ler_base(pasta: Path) -> dict[str, list[dict]]:
    tabelas = {}
    for nome in ("consultas.csv.gz", "rodadas.csv", "execucoes.csv", "fichas.csv"):
        texto = cb.ler_gravado(pasta / nome)
        if texto is None:
            raise FileNotFoundError(f"{pasta / nome} nao existe: rode consolidar_base.py")
        tabelas[nome.split(".")[0]] = ler_csv(texto)
    return tabelas


def chave(linha: dict) -> tuple[str, str, str, str]:
    """A chave da consulta na base (dicionario, 5.1)."""
    return (linha["lote"], linha["rede_id"], linha["rodada_id"], linha["ordem"])


def oc(regra: str, linha: dict, **campos) -> Ocorrencia:
    return Ocorrencia(regra, linha.get("lote", ""), linha.get("rede_id", ""),
                      linha.get("rodada_id", ""), linha.get("ordem", ""), **campos)


# ---------------------------------------------------- 1. a consulta sozinha


def preenchimento(coluna: str, linha: dict) -> str:
    """O que se espera do campo nesta linha.

    `obrigatorio` (vazio invalida), `esperado` (vazio e' aviso), `vazio`
    (preenchido invalida) ou `livre`. E' a mesma regra que o relatorio de
    valores ausentes usa para separar o vazio esperado do inesperado.
    """
    if coluna in SEMPRE_PREENCHIDAS:
        return "obrigatorio"
    protocolo, conexao = linha["protocolo"], linha["conexao"]
    falhou = bool(linha["erro"]) or linha["rcode"] != "NOERROR"
    if coluna in ("t_tcp_ms", "t_tls_ms", "tls_versao"):
        if protocolo == "DoT" and conexao == "nova":
            return "livre" if falhou else "esperado"
        return "vazio"
    if coluna == "http_versao":
        return "livre" if protocolo == "DoH" else "vazio"
    if coluna == "rcode":
        return "vazio" if linha["erro"] else "obrigatorio"
    if coluna == "usou_tcp":
        if protocolo != "Do53":
            return "vazio"
        return "livre" if linha["erro"] else "esperado"
    if coluna == "ttl":
        return "livre" if falhou else "esperado"
    if coluna == "pop_id":
        # 8.8.8.8 fica livre: P1 propoe guardar ali a instancia do Google.
        return {"1.1.1.1": "esperado", "8.8.8.8": "livre"}.get(linha["resolvedor"], "vazio")
    return "livre"


def tipo_ok(tipo: str, valor: str) -> bool:
    if tipo == "decimal":
        try:
            return math.isfinite(float(valor))
        except ValueError:
            return False
    if tipo == "inteiro":
        return re.fullmatch(r"-?\d+", valor) is not None
    if tipo == "data_utc":
        try:
            momento = datetime.fromisoformat(valor)
        except ValueError:
            return False
        return momento.utcoffset() == timedelta(0)
    if tipo == "rodada_id":
        if not RE_RODADA_ID.fullmatch(valor):
            return False
        try:
            datetime.strptime(valor, "%Y%m%dT%H%M%SZ")
        except ValueError:
            return False
        return True
    if tipo == "logico":
        return valor in ("True", "False")
    return True


def verificar_consulta(linha: dict) -> list[Ocorrencia]:
    """Regras que olham uma linha de cada vez."""
    achados = []
    for coluna in cb.COLUNAS_CONSULTAS:
        valor, regra = linha[coluna], preenchimento(coluna, linha)
        if not valor and regra in ("obrigatorio", "esperado"):
            achados.append(oc("campo_obrigatorio_vazio" if regra == "obrigatorio"
                              else "campo_esperado_vazio", linha, coluna=coluna))
        elif valor and regra == "vazio":
            achados.append(oc("campo_deveria_estar_vazio", linha, coluna=coluna, valor=valor))

    numeros = {}
    for coluna, tipo in TIPOS.items():
        valor = linha[coluna]
        if not valor:
            continue
        if not tipo_ok(tipo, valor):
            achados.append(oc("tipo_invalido", linha, coluna=coluna, valor=valor,
                              detalhe=f"esperado {tipo}"))
        elif tipo in ("decimal", "inteiro"):
            numeros[coluna] = float(valor)
    for coluna, numero in numeros.items():
        if coluna in POSITIVOS and numero <= 0:
            achados.append(oc("valor_fora_da_faixa", linha, coluna=coluna,
                              valor=linha[coluna], detalhe="tem de ser > 0"))
        elif coluna in MINIMOS and numero < MINIMOS[coluna]:
            achados.append(oc("valor_fora_da_faixa", linha, coluna=coluna,
                              valor=linha[coluna], detalhe=f"tem de ser >= {MINIMOS[coluna]}"))

    achados += [oc("combinacao_invalida", linha, detalhe=d) for d in combinacoes_invalidas(linha)]

    sucesso = not linha["erro"] and linha["rcode"] == "NOERROR"
    if linha["sucesso"] in ("True", "False") and linha["sucesso"] != str(sucesso):
        achados.append(oc("sucesso_inconsistente", linha, coluna="sucesso",
                          valor=linha["sucesso"], detalhe=f"a regra da' {sucesso}"))

    latencia = numeros.get("latencia_ms")
    if latencia is not None:
        if linha["erro"] == "timeout" and latencia != CENSURA_MS:
            achados.append(oc("timeout_fora_da_censura", linha, coluna="latencia_ms",
                              valor=linha["latencia_ms"]))
        if sucesso and latencia > CENSURA_MS:
            achados.append(oc("latencia_acima_do_timeout", linha, coluna="latencia_ms",
                              valor=linha["latencia_ms"]))
    if numeros.get("ttl", 0) > TTL_MAXIMO_S:
        achados.append(oc("ttl_acima_de_7_dias", linha, coluna="ttl", valor=linha["ttl"]))

    if tipo_ok("data_utc", linha["ts_utc"]) and tipo_ok("rodada_id", linha["rodada_id"]):
        inicio = datetime.strptime(linha["rodada_id"], "%Y%m%dT%H%M%SZ").replace(
            tzinfo=timezone.utc)
        atraso = datetime.fromisoformat(linha["ts_utc"]) - inicio
        if atraso < timedelta(0):
            achados.append(oc("ts_antes_da_rodada", linha, coluna="ts_utc",
                              valor=linha["ts_utc"]))
        elif atraso > LIMITE_DENTRO_DA_RODADA:
            achados.append(oc("ts_alem_da_rodada", linha, coluna="ts_utc",
                              valor=linha["ts_utc"], detalhe=f"{atraso.total_seconds():.0f} s"))
    return achados


def combinacoes_invalidas(linha: dict) -> list[str]:
    """O desenho da secao 5.2, linha a linha."""
    problemas = []
    protocolo, conexao = linha["protocolo"], linha["conexao"]
    if (protocolo == "Do53") != (conexao == "unica"):
        problemas.append(f"{protocolo} com conexao {conexao}")
    if linha["experimento"] == "E-1" and protocolo != "Do53":
        problemas.append(f"E-1 em {protocolo}")
    if (linha["experimento"] == "E-2" or protocolo != "Do53") and linha["resolvedor"] not in PUBLICOS:
        problemas.append(f"{linha['experimento']}/{protocolo} no resolvedor {linha['resolvedor']}")
    condicao, posicao, nome = linha["condicao_cache"], linha["posicao"], linha["nome"]
    if condicao == "C1" and not posicao.startswith("c1-"):
        problemas.append(f"C1 com posicao {posicao!r}")
    if condicao in ("C2", "C3") and posicao != nome:
        problemas.append(f"{condicao} com posicao {posicao!r} diferente do nome")
    return problemas


def ips_publicos(texto: str) -> list[str]:
    achados = []
    for candidato in RE_IPV4.findall(texto):
        try:
            endereco = ipaddress.IPv4Address(candidato)
        except ValueError:
            continue
        if endereco.is_global and candidato not in IPS_PERMITIDOS:
            achados.append(candidato)
    return achados


def verificar_privacidade(tabelas: dict[str, list[dict]]) -> list[Ocorrencia]:
    achados = []
    for nome, linhas in tabelas.items():
        for numero, linha in enumerate(linhas, start=2):
            for coluna, valor in linha.items():
                for ip in ips_publicos(valor or ""):
                    achados.append(Ocorrencia(
                        "ip_publico_exposto", linha.get("lote", ""),
                        linha.get("rede_id", ""), linha.get("rodada_id", ""),
                        linha.get("ordem", ""), coluna=coluna,
                        valor=ip.rsplit(".", 1)[0] + ".x",
                        detalhe=f"{nome}, linha {numero}"))
    return achados


# --------------------------------------------- 2. duplicatas e estrutura


def verificar_duplicatas(consultas: list[dict]) -> list[Ocorrencia]:
    """A chave (lote, rede, rodada, ordem) repetida ja' e' recusada na consolidacao.

    Aqui entram as duas repeticoes que ela nao pega: o mesmo conteudo com
    outra chave (um CSV copiado para outro lote ou rodada) e o mesmo
    tratamento medido duas vezes na mesma posicao da rodada.
    """
    achados = []
    vistos: dict[tuple, dict] = {}
    for linha in consultas:
        conteudo = tuple(linha[c] for c in cb.COLUNAS_BRUTAS)
        if conteudo in vistos:
            primeira = vistos[conteudo]
            achados.append(oc("duplicata_exata", linha, detalhe=(
                f"repete {primeira['arquivo_origem']}:{primeira['linha_origem']} "
                f"(lote {primeira['lote']})")))
        else:
            vistos[conteudo] = linha

    por_tratamento: dict[tuple, list[dict]] = defaultdict(list)
    for linha in consultas:
        por_tratamento[(linha["lote"], linha["rede_id"], linha["rodada_id"],
                        linha["experimento"], linha["resolvedor"], linha["protocolo"],
                        linha["conexao"], linha["condicao_cache"], linha["posicao"])].append(linha)
    for grupo in por_tratamento.values():
        grupo.sort(key=lambda l: int(l["ordem"]) if l["ordem"].isdigit() else 0)
        for repetida in grupo[1:]:
            achados.append(oc("duplicata_de_tratamento", repetida,
                              detalhe=f"repete a ordem {grupo[0]['ordem']}"))
    return achados


def agrupar_rodadas(consultas: list[dict]) -> dict[tuple, list[dict]]:
    rodadas: dict[tuple, list[dict]] = defaultdict(list)
    for linha in consultas:
        rodadas[(linha["lote"], linha["rede_id"], linha["rodada_id"])].append(linha)
    return rodadas


def verificar_rodadas(rodadas: dict[tuple, list[dict]], tabela_rodadas: list[dict],
                      execucoes: list[dict]) -> list[Ocorrencia]:
    achados = []
    execucao_da_rodada = {(r["lote"], r["rede_id"], r["rodada_id"]): r["execucao"]
                          for r in tabela_rodadas}
    lotes_com_log = {e["lote"] for e in execucoes}

    # Tamanho de rodada tipico por execucao (ou por arquivo, sem log).
    tamanhos: dict[tuple, Counter] = defaultdict(Counter)
    for (lote, rede, rodada), grupo in rodadas.items():
        grupo_execucao = (lote, rede, execucao_da_rodada.get((lote, rede, rodada), ""))
        tamanhos[grupo_execucao][len(grupo)] += 1

    for (lote, rede, rodada), grupo in sorted(rodadas.items()):
        base = {"lote": lote, "rede_id": rede, "rodada_id": rodada}
        execucao = execucao_da_rodada.get((lote, rede, rodada), "")
        tipico = tamanhos[(lote, rede, execucao)].most_common(1)[0][0]
        ordens = sorted(int(l["ordem"]) for l in grupo if l["ordem"].isdigit())
        if len(grupo) < tipico or ordens != list(range(1, len(ordens) + 1)):
            achados.append(oc("rodada_incompleta", base, detalhe=(
                f"{len(grupo)} consultas (tipico {tipico}); ordem de "
                f"{ordens[0] if ordens else '?'} a {ordens[-1] if ordens else '?'}")))

        em_ordem = sorted(grupo, key=lambda l: int(l["ordem"]) if l["ordem"].isdigit() else 0)
        carimbos = [l["ts_utc"] for l in em_ordem]
        if all(tipo_ok("data_utc", c) for c in carimbos):
            momentos = [datetime.fromisoformat(c) for c in carimbos]
            if any(b < a for a, b in zip(momentos, momentos[1:])):
                achados.append(oc("ordem_fora_do_tempo", base))

        pops = sorted({l["pop_id"] for l in grupo if l["resolvedor"] == "1.1.1.1" and l["pop_id"]})
        if len(pops) > 1:
            achados.append(oc("pop_varia_na_rodada", base, coluna="pop_id", valor=";".join(pops)))

        if lote in lotes_com_log and not execucao:
            achados.append(oc("rodada_sem_execucao", base))

    # Lacunas entre rodadas e mudanca de pop, por rede e lote, na ordem do tempo.
    por_rede: dict[tuple, list[str]] = defaultdict(list)
    for lote, rede, rodada in rodadas:
        por_rede[(lote, rede)].append(rodada)
    for (lote, rede), lista in por_rede.items():
        lista.sort()
        inicios = [datetime.strptime(r, "%Y%m%dT%H%M%SZ") for r in lista if tipo_ok("rodada_id", r)]
        intervalos = [(b - a).total_seconds() for a, b in zip(inicios, inicios[1:])]
        if len(intervalos) >= 2:
            mediana = statistics.median(intervalos)
            for anterior, seguinte, segundos in zip(lista, lista[1:], intervalos):
                if mediana > 0 and segundos > FATOR_LACUNA * mediana:
                    achados.append(oc("lacuna_entre_rodadas",
                                      {"lote": lote, "rede_id": rede, "rodada_id": anterior},
                                      detalhe=f"{segundos:.0f} s ate' {seguinte} (mediana {mediana:.0f} s)"))

    # Contagem de rodadas por execucao contra o log.
    no_csv = Counter((r["lote"], r["rede_id"], r["execucao"]) for r in tabela_rodadas if r["execucao"])
    for execucao in execucoes:
        base = {"lote": execucao["lote"], "rede_id": execucao["rede_id"]}
        ident = f"execucao {execucao['execucao']} (semente {execucao['semente']})"
        previstas, no_log = execucao["rodadas_previstas"], execucao["rodadas_no_log"]
        if (previstas and no_log and int(no_log) < int(previstas)) or execucao["codigo_saida"] != "0":
            achados.append(oc("execucao_interrompida", base, detalhe=(
                f"{ident}: {no_log} de {previstas or '?'} rodadas, "
                f"codigo de saida {execucao['codigo_saida'] or 'nao registrado'}")))
        csv_n = no_csv[(execucao["lote"], execucao["rede_id"], execucao["execucao"])]
        if no_log and csv_n != int(no_log):
            achados.append(oc("rodadas_divergem_do_log", base, detalhe=(
                f"{ident}: {csv_n} rodadas no CSV, {no_log} no log")))
    return achados


def verificar_redes(consultas: list[dict], fichas: list[dict]) -> tuple[list[Ocorrencia], set]:
    """Ambiente, padrao, fichas por dia. Devolve tambem os dias (c)."""
    achados = []
    por_rede: dict[tuple, list[dict]] = defaultdict(list)
    for linha in consultas:
        por_rede[(linha["lote"], linha["rede_id"])].append(linha)

    fichas_por_rede: dict[tuple, list[dict]] = defaultdict(list)
    for ficha in fichas:
        fichas_por_rede[(ficha["lote"], ficha["rede_id"])].append(ficha)

    dias_interceptados = set()
    for (lote, rede), linhas in sorted(por_rede.items()):
        base = {"lote": lote, "rede_id": rede}
        ambientes = Counter((l["versao_python"], l["versao_openssl"], l["versao_dnspython"],
                             l["versao_httpx"]) for l in linhas)
        if len(ambientes) > 1:
            achados.append(oc("ambiente_misto", base, detalhe=" | ".join(
                f"{' · '.join(a)} ({n})" for a, n in sorted(ambientes.items()))))
        padroes = sorted({l["resolvedor"] for l in linhas} - PUBLICOS)
        if len(padroes) > 1:
            achados.append(oc("mais_de_um_padrao", base, coluna="resolvedor",
                              valor=";".join(padroes)))

        dias = sorted({l["ts_utc"][:10].replace("-", "") for l in linhas})
        da_rede = fichas_por_rede.get((lote, rede), [])
        classificacao_do_dia: dict[str, set] = defaultdict(set)
        for ficha in da_rede:
            classificacao_do_dia[ficha["data"]].add(ficha["classificacao"])
        for dia in dias:
            if dia not in classificacao_do_dia:
                achados.append(oc("dia_sem_ficha", base, detalhe=dia))
        for dia, classes in classificacao_do_dia.items():
            if "(c)" in classes:
                dias_interceptados.add((lote, rede, dia))
        sequencia = [c for _, cs in sorted(classificacao_do_dia.items()) for c in sorted(cs)]
        if len(set(sequencia)) > 1:
            achados.append(oc("classificacao_mudou", base, detalhe=" -> ".join(
                f"{d} {'/'.join(sorted(cs))}" for d, cs in sorted(classificacao_do_dia.items()))))
    return achados, dias_interceptados


# -------------------------------------------- 3. exclusoes pre-registradas


def verificar_falhas(rodadas: dict[tuple, list[dict]]) -> list[Ocorrencia]:
    """Planejamento 10.4: falha da rede local e falha do dominio."""
    achados = []
    for (lote, rede, rodada), grupo in sorted(rodadas.items()):
        if all(l["sucesso"] != "True" for l in grupo):
            for linha in grupo:
                achados.append(oc("falha_rede_local", linha, detalhe=(
                    f"as {len(grupo)} consultas da rodada falharam")))
            continue
        por_nome: dict[str, list[dict]] = defaultdict(list)
        for linha in grupo:
            por_nome[linha["nome"]].append(linha)
        for nome, consultas in por_nome.items():
            resolvedores = {l["resolvedor"] for l in consultas}
            if len(resolvedores) > 1 and all(l["sucesso"] != "True" for l in consultas):
                for linha in consultas:
                    achados.append(oc("falha_dominio", linha, coluna="nome", valor=nome,
                                      detalhe=f"falhou nos {len(resolvedores)} resolvedores"))
    return achados


def verificar_interceptacao(consultas: list[dict], dias: set) -> list[Ocorrencia]:
    return [oc("rede_interceptada", l, detalhe=f"ficha (c) em {l['ts_utc'][:10]}")
            for l in consultas
            if l["protocolo"] == "Do53"
            and (l["lote"], l["rede_id"], l["ts_utc"][:10].replace("-", "")) in dias]


# ------------------------------------------------------ 4. discrepantes


def tratamento_da_linha(linha: dict) -> tuple[str, ...]:
    return (linha["lote"], linha["rede_id"], linha["experimento"], linha["resolvedor"],
            linha["protocolo"], linha["conexao"], linha["condicao_cache"])


def cercas(valores: list[float]) -> tuple[float, float, float]:
    """(inferior, mediana, superior) de Tukey com FATOR_IQR.

    Quartis com interpolacao linear, o mesmo `statistics.quantiles` da analise.
    """
    q1, mediana, q3 = statistics.quantiles(valores, n=4, method="inclusive")
    iqr = q3 - q1
    return q1 - FATOR_IQR * iqr, mediana, q3 + FATOR_IQR * iqr


@dataclass
class Discrepancias:
    ocorrencias: list[Ocorrencia]
    grupos_avaliados: int
    grupos_pequenos: int
    mediana_do_grupo: dict[tuple, float]


def verificar_discrepantes(consultas: list[dict],
                           rodadas: dict[tuple, list[dict]]) -> Discrepancias:
    """Sinaliza, sem remover, latencias e rodadas fora do padrao.

    A escala e' log porque a latencia de DNS e' assimetrica: um acerto de
    cache e uma recursao completa diferem por uma ordem de grandeza, e as
    cercas na escala linear marcariam toda recursao como discrepante. So' os
    sucessos entram: a falha ja' tem regra propria e o timeout e' censurado.
    """
    def latencia(linha: dict) -> float | None:
        if linha["sucesso"] != "True":
            return None
        try:
            valor = float(linha["latencia_ms"])
        except ValueError:
            return None
        return valor if math.isfinite(valor) and valor > 0 else None

    grupos: dict[tuple, list[dict]] = defaultdict(list)
    for linha in consultas:
        if latencia(linha) is not None:
            grupos[tratamento_da_linha(linha)].append(linha)

    achados, medianas, pequenos = [], {}, 0
    for grupo, linhas in sorted(grupos.items()):
        if len(linhas) < MIN_SUCESSOS_POR_GRUPO:
            pequenos += 1
            continue
        logs = [math.log(latencia(l)) for l in linhas]
        inferior, mediana, superior = cercas(logs)
        medianas[grupo] = mediana
        for linha, valor in zip(linhas, logs):
            if not inferior <= valor <= superior:
                lado = "acima" if valor > superior else "abaixo"
                achados.append(oc("latencia_discrepante", linha, coluna="latencia_ms",
                                  valor=linha["latencia_ms"], detalhe=(
                                      f"{lado}; mediana do tratamento {math.exp(mediana):.1f} ms, "
                                      f"cercas {math.exp(inferior):.1f}-{math.exp(superior):.1f} ms")))

    # Rodada inteira deslocada: mediana dos residuos log(latencia) - mediana do tratamento.
    escores: dict[tuple, dict[str, float]] = defaultdict(dict)
    for (lote, rede, rodada), grupo in rodadas.items():
        residuos = [math.log(latencia(l)) - medianas[tratamento_da_linha(l)]
                    for l in grupo
                    if latencia(l) is not None and tratamento_da_linha(l) in medianas]
        if residuos:
            escores[(lote, rede)][rodada] = statistics.median(residuos)
    for (lote, rede), por_rodada in sorted(escores.items()):
        if len(por_rodada) < MIN_RODADAS:
            continue
        inferior, _, superior = cercas(list(por_rodada.values()))
        for rodada, escore in sorted(por_rodada.items()):
            if not inferior <= escore <= superior:
                achados.append(oc("rodada_discrepante",
                                  {"lote": lote, "rede_id": rede, "rodada_id": rodada},
                                  detalhe=f"latencias {math.exp(escore):.2f}x a mediana do tratamento"))
    return Discrepancias(achados, len(medianas), pequenos, medianas)


def pop_por_rodada(rodadas: dict[tuple, list[dict]]) -> dict[tuple, str]:
    pops = {}
    for chave_rodada, grupo in rodadas.items():
        valores = Counter(l["pop_id"] for l in grupo if l["resolvedor"] == "1.1.1.1" and l["pop_id"])
        pops[chave_rodada] = valores.most_common(1)[0][0] if valores else ""
    return pops


def sitio(pop: str) -> str:
    """`gru22` -> `gru`. O codigo IATA e' o sitio; o numero, a maquina nele.

    [Hipotese] Na provisoria o `id.server` alternou entre 12 numeros de `gru`
    em 60 rodadas de 10 s, sem mudanca de rota (RTT estavel): e' balanceamento
    dentro do mesmo ponto de presenca, nao troca de ponto. Comparar o valor
    inteiro faria a sensibilidade 3 descartar 93% das rodadas.
    """
    m = re.match(r"[A-Za-z]+", pop)
    return m.group(0).lower() if m else pop


def verificar_pop(pops: dict[tuple, str]) -> list[Ocorrencia]:
    achados = []
    por_rede: dict[tuple, list[tuple[str, str]]] = defaultdict(list)
    for (lote, rede, rodada), pop in pops.items():
        if pop:
            por_rede[(lote, rede)].append((rodada, pop))
    for (lote, rede), lista in sorted(por_rede.items()):
        lista.sort()
        for (_, anterior), (rodada, atual) in zip(lista, lista[1:]):
            if sitio(atual) != sitio(anterior):
                achados.append(oc("pop_mudou", {"lote": lote, "rede_id": rede, "rodada_id": rodada},
                                  coluna="pop_id", valor=atual, detalhe=f"antes {anterior}"))
    return achados


# --------------------------------------------------------- 5. a validacao


@dataclass
class Validacao:
    validadas: list[dict]
    exclusoes: list[dict]
    rodadas: list[dict]
    ocorrencias: list[Ocorrencia]
    consultas: list[dict]
    discrepancias: Discrepancias
    entradas: dict[str, str]  # arquivo da base -> sha256


def validar(pasta: Path | None = None) -> Validacao:
    pasta = pasta or cb.BASE
    tabelas = ler_base(pasta)
    consultas = tabelas["consultas"]

    bloqueios = verificar_privacidade(tabelas)
    if bloqueios:
        raise ErroDeValidacao("\n".join(
            f"{o.detalhe}, coluna {o.coluna}: IP publico {o.valor}" for o in bloqueios[:20]))

    rodadas = agrupar_rodadas(consultas)
    pops = pop_por_rodada(rodadas)
    achados_redes, dias_interceptados = verificar_redes(consultas, tabelas["fichas"])
    discrepancias = verificar_discrepantes(consultas, rodadas)
    ocorrencias: list[Ocorrencia] = []
    for linha in consultas:
        ocorrencias += verificar_consulta(linha)
    ocorrencias += verificar_duplicatas(consultas)
    ocorrencias += verificar_falhas(rodadas)
    ocorrencias += verificar_interceptacao(consultas, dias_interceptados)
    ocorrencias += verificar_rodadas(rodadas, tabelas["rodadas"], tabelas["execucoes"])
    ocorrencias += achados_redes
    ocorrencias += discrepancias.ocorrencias
    ocorrencias += verificar_pop(pops)

    # Aplica: a primeira regra `exclui` de cada consulta e' o motivo; todas
    # as regras `sinaliza` (da consulta ou da rodada) viram `sinalizacoes`.
    motivo: dict[tuple, list[Ocorrencia]] = defaultdict(list)
    sinais: dict[tuple, set] = defaultdict(set)
    sinais_rodada: dict[tuple, set] = defaultdict(set)
    ordem_regra = {nome: i for i, nome in enumerate(REGRAS)}
    for o in ocorrencias:
        regra = REGRAS[o.regra]
        if regra.escopo in ("consulta", "rodada") and o.ordem:
            alvo = (o.lote, o.rede_id, o.rodada_id, o.ordem)
            if regra.tratamento == "exclui":
                motivo[alvo].append(o)
            elif regra.tratamento == "sinaliza":
                sinais[alvo].add(o.regra)
        elif regra.tratamento == "sinaliza" and regra.escopo == "rodada":
            sinais_rodada[(o.lote, o.rede_id, o.rodada_id)].add(o.regra)

    validadas, exclusoes = [], []
    excluidas_por_rodada: Counter = Counter()
    for linha in consultas:
        k = chave(linha)
        if k in motivo:
            principais = sorted(motivo[k], key=lambda o: ordem_regra[o.regra])
            regras = sorted({o.regra for o in principais}, key=ordem_regra.get)
            exclusoes.append({
                "lote": linha["lote"], "rede_id": linha["rede_id"],
                "rodada_id": linha["rodada_id"], "ordem": linha["ordem"],
                "regra": ";".join(regras),
                "justificativa": "; ".join(
                    REGRAS[o.regra].descricao + (f" [{o.coluna}={o.valor}]" if o.coluna else "")
                    + (f" ({o.detalhe})" if o.detalhe else "") for o in principais),
                "arquivo_origem": linha["arquivo_origem"],
                "linha_origem": linha["linha_origem"]})
            excluidas_por_rodada[k[:3]] += 1
            continue
        codigos = sinais[k] | sinais_rodada[k[:3]]
        validadas.append({**linha, "sinalizacoes": ";".join(sorted(codigos, key=ordem_regra.get))})

    # Os originais se preservam: cada consulta da base esta' em exatamente um lado.
    lados = [chave(l) for l in validadas] + [chave(e) for e in exclusoes]
    if sorted(lados) != sorted(chave(l) for l in consultas):
        raise AssertionError("validadas + excluidas nao reconstroem a base")

    tabela_rodadas = []
    for rodada in tabelas["rodadas"]:
        k = (rodada["lote"], rodada["rede_id"], rodada["rodada_id"])
        tabela_rodadas.append({
            **rodada, "n_excluidas": str(excluidas_por_rodada[k]), "pop_1111": pops.get(k, ""),
            "sinalizacoes": ";".join(sorted(sinais_rodada[k], key=ordem_regra.get))})

    ocorrencias.sort(key=lambda o: (ordem_regra[o.regra], o.lote, o.rede_id, o.rodada_id,
                                    int(o.ordem) if o.ordem.isdigit() else 0, o.coluna))
    entradas = {nome: cb.sha256_normalizado(pasta / nome)
                for nome in ("consultas.csv.gz", "rodadas.csv", "execucoes.csv", "fichas.csv")}
    return Validacao(validadas, exclusoes, tabela_rodadas, ocorrencias, consultas,
                     discrepancias, entradas)


# ------------------------------------------------------------ relatorio


def tabela_md(cabecalho: list[str], linhas: list[list]) -> list[str]:
    saida = ["| " + " | ".join(cabecalho) + " |",
             "| " + " | ".join("---" for _ in cabecalho) + " |"]
    saida += ["| " + " | ".join(str(c) for c in linha) + " |" for linha in linhas]
    return saida


def relatorio(v: Validacao) -> str:
    lotes = [l.nome for l in cb.LOTES if any(c["lote"] == l.nome for c in v.consultas)]
    por_regra = Counter(o.regra for o in v.ocorrencias)
    excl_por_lote = Counter(e["lote"] for e in v.exclusoes)
    val_por_lote = Counter(l["lote"] for l in v.validadas)
    base_por_lote = Counter(l["lote"] for l in v.consultas)

    s = ["# Lab05 — Relatório de validação da base",
         "",
         "> Gerado por `python Sprint02/validar_base.py`. **Não editar à mão.** "
         "As regras e o tratamento estão em [`README.md`](README.md).",
         "",
         "## 1. Entrada",
         "",
         "Base consolidada de [`../base/`](../base/README.md), lida sem alteração:",
         ""]
    s += tabela_md(["Arquivo", "SHA-256 (LF)"],
                   [[f"`{n}`", f"`{h}`"] for n, h in v.entradas.items()])
    s += ["", "## 2. Resultado por lote", ""]
    s += tabela_md(["Lote", "Consultas na base", "Excluídas", "Na base validada",
                    "Com sinalização"],
                   [[lote, base_por_lote[lote], excl_por_lote[lote], val_por_lote[lote],
                     sum(1 for l in v.validadas if l["lote"] == lote and l["sinalizacoes"])]
                    for lote in lotes])
    s += ["", f"Base validada + exclusões = {len(v.validadas)} + {len(v.exclusoes)} = "
              f"{len(v.validadas) + len(v.exclusoes)} consultas, as mesmas "
              f"{len(v.consultas)} da base (conferido a cada execução).",
          "", "## 3. Verificações realizadas", "",
          "Toda regra do catálogo roda sobre toda a base; zero quer dizer que a "
          "verificação rodou e não achou nada.", ""]
    s += tabela_md(["Regra", "Nível", "Tratamento", "Escopo", "Ocorrências", "O que verifica"],
                   [[f"`{nome}`", r.nivel, r.tratamento, r.escopo, por_regra[nome], r.descricao]
                    for nome, r in REGRAS.items()])

    s += ["", "## 4. Valores ausentes", "",
          "Vazio **esperado** é o que o dicionário prevê para aquela linha (por "
          "exemplo, handshake em Do53); **inesperado** é o vazio num campo que "
          "deveria vir preenchido. Só colunas com algum vazio aparecem.", ""]
    linhas_ausentes = []
    por_lote = {lote: [l for l in v.consultas if l["lote"] == lote] for lote in lotes}
    for coluna in cb.COLUNAS_CONSULTAS:
        for lote in lotes:
            do_lote = por_lote[lote]
            vazios = [l for l in do_lote if not l[coluna]]
            if not vazios:
                continue
            inesperados = sum(preenchimento(coluna, l) in ("obrigatorio", "esperado") for l in vazios)
            linhas_ausentes.append([f"`{coluna}`", lote, f"{len(vazios)} de {len(do_lote)}",
                                    len(vazios) - inesperados, inesperados,
                                    MOTIVO_DO_VAZIO.get(coluna, "")])
    s += tabela_md(["Coluna", "Lote", "Vazios", "Esperados", "Inesperados", "Por que fica vazio"],
                   linhas_ausentes)

    s += ["", "## 5. Exclusões", ""]
    if v.exclusoes:
        contagem = Counter((e["lote"], e["regra"]) for e in v.exclusoes)
        s += tabela_md(["Lote", "Regra", "Consultas"],
                       [[l, f"`{r}`", n] for (l, r), n in sorted(contagem.items())])
        s += ["", "Cada consulta excluída, com a justificativa, está em "
                  "[`exclusoes.csv`](exclusoes.csv)."]
    else:
        s += ["Nenhuma consulta excluída."]

    s += ["", "## 6. Discrepantes (investigados, não removidos)", "",
          f"Cercas de Tukey com {FATOR_IQR:g} IQR sobre o log da latência dos sucessos, "
          f"por lote, rede e tratamento (experimento, resolvedor, protocolo, conexão, "
          f"condição). Avaliados {v.discrepancias.grupos_avaliados} tratamentos; "
          f"{v.discrepancias.grupos_pequenos} ficaram de fora por terem menos de "
          f"{MIN_SUCESSOS_POR_GRUPO} sucessos.", ""]
    discrepantes = [o for o in v.ocorrencias if o.regra == "latencia_discrepante"]
    indice = {chave(l): l for l in v.consultas}
    por_tratamento = Counter(tratamento_da_linha(indice[(o.lote, o.rede_id, o.rodada_id, o.ordem)])
                             for o in discrepantes)
    if discrepantes:
        totais = Counter(tratamento_da_linha(l) for l in v.consultas if l["sucesso"] == "True")
        s += tabela_md(["Lote", "Rede", "Exp.", "Resolvedor", "Protocolo", "Conexão", "Cond.",
                        "Discrepantes", "Sucessos"],
                       [[*t, n, totais[t]] for t, n in sorted(por_tratamento.items())])
        s += ["", "Os mais distantes da mediana do tratamento:", ""]
        def distancia(o: Ocorrencia) -> float:
            l = indice[(o.lote, o.rede_id, o.rodada_id, o.ordem)]
            return abs(math.log(float(l["latencia_ms"])) - v.discrepancias.mediana_do_grupo[tratamento_da_linha(l)])
        linhas_top = []
        for o in sorted(discrepantes, key=distancia, reverse=True)[:15]:
            l = indice[(o.lote, o.rede_id, o.rodada_id, o.ordem)]
            mediana = math.exp(v.discrepancias.mediana_do_grupo[tratamento_da_linha(l)])
            linhas_top.append([l["lote"], l["rodada_id"], l["resolvedor"],
                               f"{l['protocolo']}/{l['conexao']}", l["nome"],
                               f"{float(l['latencia_ms']):.1f}", f"{mediana:.1f}",
                               l["ttl"] or "—", f"{float(l['rtt_ms']):.1f}" if l["rtt_ms"] else "—",
                               f"{l['arquivo_origem']}:{l['linha_origem']}"])
        s += tabela_md(["Lote", "Rodada", "Resolvedor", "Protocolo", "Nome", "Latência (ms)",
                        "Mediana do trat. (ms)", "TTL", "RTT (ms)", "Origem"], linhas_top)
    else:
        s += ["Nenhuma latência discrepante."]

    rodadas_discrepantes = [o for o in v.ocorrencias if o.regra == "rodada_discrepante"]
    s += ["", f"Rodadas inteiras deslocadas (`rodada_discrepante`, mínimo de {MIN_RODADAS} "
              f"rodadas por rede): {len(rodadas_discrepantes)}."]
    if rodadas_discrepantes:
        s += [""] + tabela_md(["Lote", "Rede", "Rodada", "Detalhe"],
                              [[o.lote, o.rede_id, o.rodada_id, o.detalhe] for o in rodadas_discrepantes])

    pops = [o for o in v.ocorrencias if o.regra == "pop_mudou"]
    s += ["", "## 7. Ponto de presença do 1.1.1.1", ""]
    linhas_pop = []
    for lote in lotes:
        por_rede: dict[str, list[str]] = defaultdict(list)
        for r in sorted(v.rodadas, key=lambda r: r["rodada_id"]):
            if r["lote"] == lote and r["pop_1111"]:
                por_rede[r["rede_id"]].append(r["pop_1111"])
        for rede, lista in sorted(por_rede.items()):
            mudancas = sum(1 for o in pops if o.lote == lote and o.rede_id == rede)
            trocas = sum(1 for a, b in zip(lista, lista[1:]) if a != b)
            linhas_pop.append([lote, rede, len(lista),
                               ", ".join(sorted({sitio(p) for p in lista})), mudancas,
                               len(set(lista)), trocas,
                               ", ".join(f"{p} ({n})" for p, n in Counter(lista).most_common())])
    s += ["Uma linha por rede. `pop_mudou` compara o **sítio** (as letras do `pop_id`); "
          "a troca de **instância** dentro do mesmo sítio (`gru11` → `gru19`) só é contada "
          "aqui, sem sinalizar a rodada.", ""]
    s += tabela_md(["Lote", "Rede", "Rodadas", "Sítios", "Mudanças de sítio",
                    "Instâncias", "Trocas de instância", "Instâncias (rodadas)"],
                   linhas_pop)

    # O que nao e' de uma consulta so' e ainda nao apareceu nas secoes 6 e 7.
    outras = [o for o in v.ocorrencias
              if not o.ordem and o.regra not in ("rodada_discrepante", "pop_mudou")]
    s += ["", "## 8. Rodadas, execuções, dias e redes", ""]
    if outras:
        s += tabela_md(["Regra", "Lote", "Rede", "Rodada", "Detalhe"],
                       [[f"`{o.regra}`", o.lote, o.rede_id, o.rodada_id or "—",
                         (o.detalhe or o.valor).replace("|", "/")] for o in outras])
    else:
        s += ["Nenhuma ocorrência."]
    return "\n".join(s) + "\n"


def tabelas(v: Validacao) -> dict[str, str]:
    return {
        "consultas.csv.gz": cb.para_csv(v.validadas, COLUNAS_VALIDADAS),
        "exclusoes.csv": cb.para_csv(v.exclusoes, COLUNAS_EXCLUSOES),
        "rodadas.csv": cb.para_csv(v.rodadas, COLUNAS_RODADAS_VALIDADAS),
        "ocorrencias.csv": cb.para_csv([o.linha() for o in v.ocorrencias], COLUNAS_OCORRENCIAS),
        "relatorio_validacao.md": relatorio(v),
    }


def resumo(v: Validacao) -> str:
    por_nivel = Counter(REGRAS[o.regra].nivel for o in v.ocorrencias)
    return (f"{len(v.consultas)} consultas na base: {len(v.validadas)} validadas, "
            f"{len(v.exclusoes)} excluidas, "
            f"{sum(1 for l in v.validadas if l['sinalizacoes'])} com sinalizacao; "
            f"ocorrencias: {por_nivel['erro']} erro, {por_nivel['aviso']} aviso, "
            f"{por_nivel['info']} info")


def main() -> int:
    analisador = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    analisador.add_argument("--verificar", action="store_true",
                            help="nao grava; falha se a base validada esta' desatualizada")
    analisador.add_argument("--base", type=Path, default=cb.BASE)
    analisador.add_argument("--saida", type=Path, default=SAIDA)
    argumentos = analisador.parse_args()

    if argumentos.saida.resolve() == argumentos.base.resolve():
        print("ERRO: a saida nao pode ser a pasta da base (os originais se preservam)",
              file=sys.stderr)
        return 2
    try:
        v = validar(argumentos.base)
    except ErroDeValidacao as erro:
        print(f"ERRO: dado pessoal na base; nada foi gravado.\n{erro}", file=sys.stderr)
        return 2
    conteudos = tabelas(v)
    print(resumo(v))

    if argumentos.verificar:
        divergencias = [f"falta: {n}" if cb.ler_gravado(argumentos.saida / n) is None
                        else f"desatualizado: {n}"
                        for n, texto in conteudos.items()
                        if cb.ler_gravado(argumentos.saida / n) != texto]
        for texto in divergencias:
            print(f"  {texto}", file=sys.stderr)
        print("base validada em dia" if not divergencias else
              "base validada NAO confere: rode `python Sprint02/validar_base.py` e versione")
        return 1 if divergencias else 0

    cb.gravar(conteudos, argumentos.saida)
    try:
        destino = cb.relativo(argumentos.saida) + "/"
    except ValueError:
        destino = str(argumentos.saida)
    print(f"gravado em {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
