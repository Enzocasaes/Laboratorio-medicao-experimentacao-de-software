"""Consolida os dados brutos do Lab05 na base versionada (issue #133).

O QUE FAZ

Le os arquivos brutos de cada lote, sem altera-los, e gera em `Sprint02/base/`:

- `arquivos_brutos.csv`: o manifesto. Cada arquivo bruto com tamanho, linhas
  e SHA-256. E' o que prova que o bruto nao mudou depois de consolidado.
- `consultas.csv.gz`: todas as consultas de todos os lotes, uma por linha,
  com as 30 colunas do coletor copiadas sem conversao, mais `lote`,
  `sucesso` e a origem (arquivo e linha do bruto).
- `rodadas.csv`: uma linha por rodada, com o subconjunto de C3 e a execucao
  do coletor tirados do log.
- `execucoes.csv`: uma linha por execucao do coletor (semente, ambiente,
  avisos, codigo de saida), tirada do log.
- `fichas.csv`: as fichas de rede, uma linha por ficha e resolvedor padrao.

O dicionario de dados esta' em `Sprint02/base/README.md`.

O QUE RECUSA

Um arquivo bruto com cabecalho diferente do esquema do coletor, linha com
numero errado de campos, valor fora do dominio (experimento, protocolo,
conexao, condicao de cache), numero ou data ilegivel, `rede_id` diferente do
nome do arquivo, ou consulta repetida. Nesses casos nada e' gravado: o erro
tem de ser resolvido na origem e documentado, e nao contornado na base.

O SHA-256 e' calculado com os finais de linha normalizados para LF. Com
`core.autocrlf=true` o Git grava CRLF no Windows e LF no Linux; sem a
normalizacao, o mesmo arquivo teria dois hashes.

Uso (a partir de Lab5/, so' biblioteca padrao):

    python Sprint02/consolidar_base.py              # regenera a base
    python Sprint02/consolidar_base.py --verificar  # confere bruto e base
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

LAB5 = Path(__file__).resolve().parent.parent
BASE = LAB5 / "Sprint02" / "base"

# O esquema do coletor (Sprint01/coleta/medidor.py, `COLUNAS`), na mesma
# ordem. Fica copiado aqui para a consolidacao rodar sem dnspython; o teste
# `test_esquema_igual_ao_do_coletor` garante que as duas listas nao divergem.
COLUNAS_BRUTAS: tuple[str, ...] = (
    "ts_utc", "rede_id", "rodada_id", "ordem", "experimento", "resolvedor",
    "protocolo", "conexao", "condicao_cache", "nome", "posicao",
    "latencia_ms", "t_tcp_ms", "t_tls_ms", "tls_versao", "http_versao",
    "rcode", "erro", "usou_tcp", "ttl", "ttl_autoritativo",
    "s_desde_ultima_consulta", "pop_id", "rtt_ms", "interface",
    "versao_python", "versao_openssl", "versao_dnspython", "versao_httpx",
    "reconectou",
)

COLUNAS_CONSULTAS = ("lote", *COLUNAS_BRUTAS, "sucesso", "arquivo_origem",
                     "linha_origem")
COLUNAS_RODADAS = ("lote", "rede_id", "rodada_id", "execucao", "inicio_utc",
                   "fim_utc", "subconjunto_c3", "n_consultas", "n_falhas",
                   "n_reconexoes", "duracao_s", "arquivo_origem")
COLUNAS_EXECUCOES = ("lote", "rede_id", "execucao", "semente", "interface",
                     "ambiente", "rodadas_previstas", "rodadas_no_log",
                     "n_avisos", "codigo_saida", "arquivo_origem",
                     "linha_origem")
COLUNAS_FICHAS = ("lote", "rede_id", "data", "ts_utc", "classificacao",
                  "interceptacao_detectada", "padrao_id",
                  "padrao_endereco_privado", "padrao_upstream_asn",
                  "padrao_classificacao", "id_server_1111", "arquivo_origem")
COLUNAS_MANIFESTO = ("lote", "tipo", "caminho", "bytes", "linhas", "sha256")

# Dominios fechados (PlanejamentoEPesquisa 9.6; ProtocoloExperimental 5.2).
DOMINIOS = {
    "experimento": {"E-1", "E-2"},
    "protocolo": {"Do53", "DoT", "DoH"},
    "conexao": {"unica", "nova", "reaproveitada"},
    "condicao_cache": {"C1", "C2", "C3"},
    "reconectou": {"True", "False"},
    "usou_tcp": {"", "True", "False"},
}
DECIMAIS = ("latencia_ms", "t_tcp_ms", "t_tls_ms", "s_desde_ultima_consulta",
            "rtt_ms")
INTEIROS = ("ordem", "ttl", "ttl_autoritativo")


@dataclass(frozen=True)
class Lote:
    """Um conjunto de coletas com o mesmo status na analise."""

    nome: str
    pasta: str               # relativa a Lab5/
    consultas: str           # padrao glob, sem recursao
    logs: str
    fichas: str
    rede_no_nome: bool       # o `rede_id` tem de ser o nome do arquivo


# A ordem e' a da base. Cada pasta e' lida sem recursao, entao a provisoria
# nao entra na definitiva.
LOTES: tuple[Lote, ...] = (
    Lote("piloto", "Sprint01/dados", "piloto_*.csv", "*.log", "rede_*.json",
         rede_no_nome=False),
    Lote("provisoria", "Sprint02/dados/provisoria", "rede-*.csv", "rede-*.log",
         "rede-*_ficha_*.json", rede_no_nome=True),
    Lote("definitiva", "Sprint02/dados", "rede-*.csv", "rede-*.log",
         "rede-*_ficha_*.json", rede_no_nome=True),
)


class ErroDeConsolidacao(Exception):
    """O bruto viola o esquema; nada e' gravado."""


# ------------------------------------------------------------- leitura


def texto_normalizado(caminho: Path) -> str:
    """Conteudo em UTF-8, sem BOM, com finais de linha LF."""
    bruto = caminho.read_bytes().replace(b"\r\n", b"\n")
    return bruto.decode("utf-8-sig")


def sha256_normalizado(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def relativo(caminho: Path) -> str:
    """Caminho a partir de Lab5/, com `/`: o mesmo em qualquer sistema."""
    return caminho.resolve().relative_to(LAB5.resolve()).as_posix()


def arquivos_do_lote(lote: Lote, raiz: Path) -> dict[str, list[Path]]:
    pasta = raiz / lote.pasta
    return {tipo: sorted(p for p in pasta.glob(padrao) if p.is_file())
            for tipo, padrao in (("consultas", lote.consultas),
                                 ("log", lote.logs), ("ficha", lote.fichas))}


def validar_linha(linha: dict, onde: str) -> list[str]:
    problemas = []
    for coluna, aceitos in DOMINIOS.items():
        if linha[coluna] not in aceitos:
            problemas.append(f"{onde}: {coluna}={linha[coluna]!r} fora de {sorted(aceitos)}")
    for coluna in DECIMAIS:
        if linha[coluna]:
            try:
                float(linha[coluna])
            except ValueError:
                problemas.append(f"{onde}: {coluna}={linha[coluna]!r} nao e' numero")
    for coluna in INTEIROS:
        if linha[coluna] and not re.fullmatch(r"-?\d+", linha[coluna]):
            problemas.append(f"{onde}: {coluna}={linha[coluna]!r} nao e' inteiro")
    try:
        datetime.fromisoformat(linha["ts_utc"])
    except ValueError:
        problemas.append(f"{onde}: ts_utc={linha['ts_utc']!r} ilegivel")
    if not linha["rodada_id"] or not linha["rede_id"]:
        problemas.append(f"{onde}: rede_id ou rodada_id vazio")
    return problemas


def ler_consultas(lote: Lote, caminho: Path) -> list[dict]:
    """Le um CSV bruto e devolve as linhas da base; levanta se violar o esquema."""
    origem = relativo(caminho)
    leitor = csv.reader(io.StringIO(texto_normalizado(caminho)))
    cabecalho = next(leitor, None)
    if tuple(cabecalho or ()) != COLUNAS_BRUTAS:
        faltam = [c for c in COLUNAS_BRUTAS if c not in (cabecalho or ())]
        sobram = [c for c in (cabecalho or ()) if c not in COLUNAS_BRUTAS]
        raise ErroDeConsolidacao(
            f"{origem}: cabecalho fora do esquema do coletor "
            f"(faltam {faltam}, sobram {sobram}, ou a ordem difere)")

    linhas, problemas = [], []
    for numero, campos in enumerate(leitor, start=2):
        onde = f"{origem}:{numero}"
        if len(campos) != len(COLUNAS_BRUTAS):
            problemas.append(f"{onde}: {len(campos)} campos, esperados {len(COLUNAS_BRUTAS)}")
            continue
        linha = dict(zip(COLUNAS_BRUTAS, campos))
        problemas += validar_linha(linha, onde)
        if lote.rede_no_nome and linha["rede_id"] != caminho.stem:
            problemas.append(f"{onde}: rede_id={linha['rede_id']!r} num arquivo {caminho.name}")
        sucesso = not linha["erro"] and linha["rcode"] == "NOERROR"
        linhas.append({"lote": lote.nome, **linha, "sucesso": str(sucesso),
                       "arquivo_origem": origem, "linha_origem": str(numero)})
    if problemas:
        raise ErroDeConsolidacao("\n".join(problemas[:20] + (
            [f"... e mais {len(problemas) - 20}"] if len(problemas) > 20 else [])))
    return linhas


# ----------------------------------------------------------------- log


RE_SEMENTE = re.compile(r"^rede=(\S+) interface=(\S*) semente=(\d+)")
RE_AMBIENTE = re.compile(r"^Python .+ · dnspython .+")
RE_INICIO = re.compile(r"^=== inicio .*?rodadas=(\d+)")
RE_FIM = re.compile(r"^=== fim .*codigo=(-?\d+)")
RE_RODADA = re.compile(
    r"^\[(\d+)/(\d+)\] (\S+) subconjunto (\d+)/(\d+), .*?(\d+) consultas, "
    r"(\d+) falhas, ([\d.]+) s")


@dataclass
class Execucao:
    lote: str
    rede_id: str
    numero: int
    semente: str
    interface: str
    ambiente: str
    linha: int
    arquivo: str
    rodadas_previstas: str = ""
    codigo_saida: str = ""
    n_avisos: int = 0
    rodadas: dict[str, dict] = field(default_factory=dict)


def ler_log(lote: Lote, caminho: Path) -> list[Execucao]:
    """Cada execucao do coletor comeca na linha da semente (V9).

    `rodadas=` do `=== inicio` (gravado por coletar_rede.ps1) e' o que foi
    pedido; o numero de linhas `[i/N]` e' o que de fato rodou.
    """
    origem = relativo(caminho)
    execucoes: list[Execucao] = []
    previstas = ambiente = ""
    for numero, texto in enumerate(texto_normalizado(caminho).split("\n"), start=1):
        if m := RE_INICIO.match(texto):
            previstas = m.group(1)
        elif RE_AMBIENTE.match(texto):
            ambiente = texto
        elif m := RE_SEMENTE.match(texto):
            execucoes.append(Execucao(
                lote.nome, m.group(1), len(execucoes) + 1, m.group(3),
                "" if m.group(2) == "?" else m.group(2), ambiente, numero, origem,
                rodadas_previstas=previstas))
            previstas = ambiente = ""
        elif not execucoes:
            continue
        elif m := RE_RODADA.match(texto):
            execucoes[-1].rodadas[m.group(3)] = {
                "subconjunto_c3": f"{m.group(4)}/{m.group(5)}",
                "duracao_s": m.group(8)}
            execucoes[-1].rodadas_previstas = execucoes[-1].rodadas_previstas or m.group(2)
        elif texto.startswith("AVISO"):
            execucoes[-1].n_avisos += 1
        elif m := RE_FIM.match(texto):
            execucoes[-1].codigo_saida = m.group(1)
    return execucoes


# --------------------------------------------------------------- fichas


def ler_ficha(lote: Lote, caminho: Path) -> list[dict]:
    """Uma linha por resolvedor padrao sondado (a ficha pode ter mais de um)."""
    ficha = json.loads(texto_normalizado(caminho))
    data = re.search(r"_(\d{8})\.json$", caminho.name)
    classificacao = re.match(r"\s*(\([a-z]\))", ficha.get("classificacao", ""))
    interceptacao = ficha.get("interceptacao", {})
    comum = {
        "lote": lote.nome,
        "rede_id": ficha.get("rede_id", ""),
        "data": data.group(1) if data else ficha.get("ts_utc", "")[:10].replace("-", ""),
        "ts_utc": ficha.get("ts_utc", ""),
        "classificacao": classificacao.group(1) if classificacao else "",
        "interceptacao_detectada": str(interceptacao.get("interceptacao_detectada", "")),
        "id_server_1111": interceptacao.get("id_server_1111", ""),
        "arquivo_origem": relativo(caminho),
    }
    linhas = []
    for padrao_id, sonda in sorted(ficha.get("padroes", {}).items()):
        asns = sorted({u["asn"] for u in sonda.get("upstreams", []) if u.get("asn")})
        linhas.append({**comum, "padrao_id": padrao_id,
                       "padrao_endereco_privado": str(sonda.get("endereco_privado", "")),
                       "padrao_upstream_asn": ";".join(asns),
                       "padrao_classificacao": sonda.get("classificacao", "")})
    return linhas or [{**comum, "padrao_id": "", "padrao_endereco_privado": "",
                       "padrao_upstream_asn": "", "padrao_classificacao": ""}]


# ---------------------------------------------------------- consolidacao


@dataclass
class Base:
    consultas: list[dict]
    rodadas: list[dict]
    execucoes: list[dict]
    fichas: list[dict]
    manifesto: list[dict]


def consolidar(raiz: Path | None = None) -> Base:
    raiz = raiz or LAB5
    consultas, rodadas, execucoes, fichas, manifesto = [], [], [], [], []
    problemas: list[str] = []

    for lote in LOTES:
        arquivos = arquivos_do_lote(lote, raiz)
        for tipo, caminhos in arquivos.items():
            for caminho in caminhos:
                texto = texto_normalizado(caminho)
                manifesto.append({
                    "lote": lote.nome, "tipo": tipo, "caminho": relativo(caminho),
                    "bytes": str(len(caminho.read_bytes().replace(b"\r\n", b"\n"))),
                    "linhas": str(texto.count("\n")),
                    "sha256": sha256_normalizado(caminho)})

        do_log: dict[tuple[str, str], tuple[Execucao, dict]] = {}
        for caminho in arquivos["log"]:
            for execucao in ler_log(lote, caminho):
                execucoes.append({
                    "lote": lote.nome, "rede_id": execucao.rede_id,
                    "execucao": str(execucao.numero), "semente": execucao.semente,
                    "interface": execucao.interface, "ambiente": execucao.ambiente,
                    "rodadas_previstas": execucao.rodadas_previstas,
                    "rodadas_no_log": str(len(execucao.rodadas)),
                    "n_avisos": str(execucao.n_avisos),
                    "codigo_saida": execucao.codigo_saida,
                    "arquivo_origem": execucao.arquivo,
                    "linha_origem": str(execucao.linha)})
                for rodada_id, dados in execucao.rodadas.items():
                    do_log[(execucao.rede_id, rodada_id)] = (execucao, dados)

        for caminho in arquivos["consultas"]:
            try:
                linhas = ler_consultas(lote, caminho)
            except ErroDeConsolidacao as erro:
                problemas.append(str(erro))
                continue
            consultas += linhas
            por_rodada: dict[tuple[str, str], list[dict]] = {}
            for linha in linhas:
                por_rodada.setdefault((linha["rede_id"], linha["rodada_id"]), []).append(linha)
            for (rede_id, rodada_id), grupo in por_rodada.items():
                execucao, dados = do_log.get((rede_id, rodada_id), (None, {}))
                carimbos = sorted(l["ts_utc"] for l in grupo)
                rodadas.append({
                    "lote": lote.nome, "rede_id": rede_id, "rodada_id": rodada_id,
                    "execucao": str(execucao.numero) if execucao else "",
                    "inicio_utc": carimbos[0], "fim_utc": carimbos[-1],
                    "subconjunto_c3": dados.get("subconjunto_c3", ""),
                    "n_consultas": str(len(grupo)),
                    "n_falhas": str(sum(l["sucesso"] == "False" for l in grupo)),
                    "n_reconexoes": str(sum(l["reconectou"] == "True" for l in grupo)),
                    "duracao_s": dados.get("duracao_s", ""),
                    "arquivo_origem": relativo(caminho)})

        for caminho in arquivos["ficha"]:
            fichas += ler_ficha(lote, caminho)

    chaves = Counter((l["lote"], l["rede_id"], l["rodada_id"], l["ordem"]) for l in consultas)
    repetidas = [c for c, n in chaves.items() if n > 1]
    if repetidas:
        problemas.append(f"consultas repetidas (lote, rede, rodada, ordem): {repetidas[:5]}")
    if problemas:
        raise ErroDeConsolidacao("\n".join(problemas))
    return Base(consultas, rodadas, execucoes, fichas, manifesto)


# ------------------------------------------------------------- gravacao


def para_csv(linhas: list[dict], colunas: tuple[str, ...]) -> str:
    saida = io.StringIO()
    escritor = csv.DictWriter(saida, fieldnames=colunas, lineterminator="\n")
    escritor.writeheader()
    escritor.writerows(linhas)
    return saida.getvalue()


def tabelas(base: Base) -> dict[str, str]:
    """Nome do arquivo -> conteudo CSV (texto), na ordem do README."""
    return {
        "arquivos_brutos.csv": para_csv(base.manifesto, COLUNAS_MANIFESTO),
        "consultas.csv.gz": para_csv(base.consultas, COLUNAS_CONSULTAS),
        "rodadas.csv": para_csv(base.rodadas, COLUNAS_RODADAS),
        "execucoes.csv": para_csv(base.execucoes, COLUNAS_EXECUCOES),
        "fichas.csv": para_csv(base.fichas, COLUNAS_FICHAS),
    }


def gravar(conteudos: dict[str, str], pasta: Path) -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    for nome, texto in conteudos.items():
        destino = pasta / nome
        if nome.endswith(".gz"):
            # mtime=0 e sem nome de arquivo: o mesmo conteudo da' os mesmos bytes
            with open(destino, "wb") as bruto, gzip.GzipFile(
                    filename="", mode="wb", fileobj=bruto, mtime=0) as arquivo:
                arquivo.write(texto.encode("utf-8"))
        else:
            destino.write_text(texto, encoding="utf-8", newline="\n")


def ler_gravado(caminho: Path) -> str | None:
    if not caminho.exists():
        return None
    if caminho.suffix == ".gz":
        with gzip.open(caminho, "rt", encoding="utf-8", newline="") as arquivo:
            return arquivo.read().replace("\r\n", "\n")
    return texto_normalizado(caminho)


def verificar(conteudos: dict[str, str], pasta: Path) -> list[str]:
    """O que difere entre a base versionada e a base regenerada do bruto."""
    divergencias = []
    gravado = ler_gravado(pasta / "arquivos_brutos.csv")
    if gravado is not None:
        antigo = {l["caminho"]: l for l in csv.DictReader(io.StringIO(gravado))}
        novo = {l["caminho"]: l for l in csv.DictReader(io.StringIO(conteudos["arquivos_brutos.csv"]))}
        for caminho in sorted(antigo.keys() - novo.keys()):
            divergencias.append(f"bruto removido: {caminho}")
        for caminho in sorted(novo.keys() - antigo.keys()):
            divergencias.append(f"bruto novo, ainda fora da base: {caminho}")
        for caminho in sorted(antigo.keys() & novo.keys()):
            if antigo[caminho]["sha256"] != novo[caminho]["sha256"]:
                divergencias.append(f"bruto alterado depois de consolidado: {caminho}")
    for nome, texto in conteudos.items():
        atual = ler_gravado(pasta / nome)
        if atual is None:
            divergencias.append(f"falta na base: {nome}")
        elif atual != texto:
            divergencias.append(f"desatualizado: {nome}")
    return divergencias


def resumo(base: Base) -> str:
    por_lote = Counter(l["lote"] for l in base.consultas)
    redes = sorted({(l["lote"], l["rede_id"]) for l in base.rodadas})
    linhas = [f"{len(base.manifesto)} arquivos brutos, {len(base.consultas)} consultas, "
              f"{len(base.rodadas)} rodadas, {len(base.execucoes)} execucoes, "
              f"{len(base.fichas)} linhas de ficha"]
    for lote in LOTES:
        nomes = ", ".join(r for l, r in redes if l == lote.nome) or "-"
        linhas.append(f"  {lote.nome:<11} {por_lote.get(lote.nome, 0):>7} consultas  redes: {nomes}")
    return "\n".join(linhas)


def main() -> int:
    analisador = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    analisador.add_argument("--verificar", action="store_true",
                            help="nao grava; falha se o bruto mudou ou a base esta' desatualizada")
    analisador.add_argument("--saida", type=Path, default=BASE)
    argumentos = analisador.parse_args()

    try:
        base = consolidar()
    except ErroDeConsolidacao as erro:
        print(f"ERRO: o bruto viola o esquema; nada foi gravado.\n{erro}", file=sys.stderr)
        return 2
    conteudos = tabelas(base)
    print(resumo(base))

    if argumentos.verificar:
        divergencias = verificar(conteudos, argumentos.saida)
        for texto in divergencias:
            print(f"  {texto}", file=sys.stderr)
        print("base confere com o bruto" if not divergencias else
              "base NAO confere: rode `python Sprint02/consolidar_base.py` "
              "e versione o resultado, ou restaure o bruto alterado")
        return 1 if divergencias else 0

    gravar(conteudos, argumentos.saida)
    print(f"gravado em {relativo(argumentos.saida)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
