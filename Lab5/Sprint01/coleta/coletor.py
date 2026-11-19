"""Coletor do Lab05 (Participante C, secoes 9.2, 9.3 e 9.6).

Executa rodadas e grava **uma linha de CSV por consulta**. Nao calcula nada:
agregacao e' trabalho da analise, e misturar as duas coisas impediria refazer
a analise sem refazer a coleta.

O QUE UMA RODADA FAZ, NESTA ORDEM

1. Mede as covariaveis da rodada: RTT de rede (M11) e identificador do ponto
   de presenca de cada resolvedor publico. Vem antes porque descrevem o estado
   da rede no momento, e todas as consultas da rodada herdam esses valores.
2. Monta a lista de tratamentos da rodada (E-1 e E-2).
3. **Embaralha a lista** com semente registrada e executa. Sem isso, um
   resolvedor seria sempre o primeiro, e a posicao na fila viraria parte da
   diferenca medida.
4. Grava cada medida assim que ela termina.

POR QUE GRAVAR NO MEIO E NAO NO FIM. Uma coleta de 7 dias cai: a maquina
dorme, o Wi-Fi some, alguem fecha o terminal. Gravando linha a linha, o que
ja' foi medido esta' salvo.

O RESOLVEDOR PADRAO PODE SER MAIS DE UM

Nesta rede de teste a maquina nao tem **nenhum** nameserver IPv4 configurado:
o provedor anuncia so' IPv6 (`2804:...`), enquanto o gateway (192.168.0.1)
tambem atende DNS em IPv4. Sao dois resolvedores diferentes, e chamar qualquer
um deles de "o padrao da rede" esconde a escolha. Por isso `--padrao` aceita
`id=ip` e pode ser repetido: o identificador vai para o CSV, e a analise sabe
qual foi medido. O medidor aceita enderecos IPv6 sem mudanca.

CONDICOES DE CACHE E A ZONA DO GRUPO

C1 (ausencia forcada) e C2 (cache quente) exigem um dominio do grupo, com
servidor autoritativo proprio (pendencia D1). Enquanto ele nao existe, o
coletor roda **so' com C3**, avisa no inicio e grava `condicao_cache=C3` em
tudo — nao inventa um estado de cache que nao controla. Com `--zona` passada,
C1 e C2 entram automaticamente.

Uso (a partir de Lab5/):

    .venv/bin/python Sprint01/coleta/coletor.py --rede-id casa-leo --rodadas 1
    .venv/bin/python Sprint01/coleta/coletor.py --rede-id casa-leo \
        --rodadas 336 --intervalo 1800 --zona dns-lab.exemplo.br \
        --padrao padrao-gateway=192.168.0.1
"""

from __future__ import annotations

import argparse
import csv
import itertools
import random
import socket
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import medidor as md  # noqa: E402
from ambiente import Ambiente, exigir  # noqa: E402

PASTA_PADRAO = Path(__file__).resolve().parent.parent / "dados"

# Amostra minima de C3 para o piloto, com os tres estratos da secao 9.7
# representados. A lista definitiva sai da Tranco congelada (decisao de B);
# esta aqui serve para o coletor rodar antes dessa decisao.
DOMINIOS_PILOTO = (
    # popular global
    "google.com", "wikipedia.org", "cloudflare.com", "github.com", "amazon.com",
    # popular no Brasil
    "globo.com", "uol.com.br", "mercadolivre.com.br", "gov.br", "ifood.com.br",
    # cauda longa
    "sqlite.org", "rfc-editor.org", "unicode.org", "postgresql.org", "gnu.org",
)

PROTOCOLOS_E2 = (
    ("Do53", "unica"),
    ("DoT", "nova"), ("DoT", "reaproveitada"),
    ("DoH", "nova"), ("DoH", "reaproveitada"),
)


# ------------------------------------------------------------- tratamento


class Tratamento:
    """Uma consulta a executar: o que medir, com que protocolo, em que nome."""

    __slots__ = ("experimento", "resolvedor", "protocolo", "conexao",
                 "condicao_cache", "nome", "posicao")

    def __init__(self, experimento: str, resolvedor: md.Resolvedor,
                 protocolo: str, conexao: str, condicao_cache: str, nome: str,
                 posicao: str | None = None):
        self.experimento = experimento
        self.resolvedor = resolvedor
        self.protocolo = protocolo
        self.conexao = conexao
        self.condicao_cache = condicao_cache
        self.nome = nome
        # sem posicao explicita, o nome e' a posicao (C2 e C3)
        self.posicao = nome if posicao is None else posicao


def nome_c1(zona: str, rede_id: str, rodada_id: str, resolvedor: str,
            posicao: int) -> str:
    """Nome unico por resolvedor, para forcar ausencia de cache (secao 9.3).

    O nome precisa ser diferente **em cada resolvedor**: se fosse o mesmo, um
    resolvedor que encaminha para o 8.8.8.8 encontraria em cache o nome que o
    proprio 8.8.8.8 acabou de resolver, e C1 mediria cache em vez de recursao.
    """
    sufixo = uuid.uuid4().hex[:8]
    etiqueta = f"{rede_id}-{rodada_id}-{resolvedor}-{posicao}-{sufixo}"
    seguro = "".join(c if c.isalnum() or c == "-" else "-" for c in etiqueta)
    return f"{seguro}.c1.{zona}"


def montar_rodada(resolvedores: list[md.Resolvedor], dominios: list[str],
                  zona: str | None, rede_id: str, rodada_id: str,
                  nomes_c1: int, nomes_c2: int) -> list[Tratamento]:
    """Todos os tratamentos da rodada, ainda em ordem determinista.

    O embaralhamento fica por conta de quem chama, para a semente ser
    registrada junto da rodada.
    """
    tratamentos: list[Tratamento] = []
    publicos = [r for r in resolvedores if r.tem_cifrado]

    # E-1: resolvedor x condicao de cache, sempre em Do53
    for resolvedor in resolvedores:
        for dominio in dominios:
            tratamentos.append(Tratamento("E-1", resolvedor, "Do53", "unica",
                                          "C3", dominio))
        if zona:
            for posicao in range(nomes_c1):
                tratamentos.append(Tratamento(
                    "E-1", resolvedor, "Do53", "unica", "C1",
                    nome_c1(zona, rede_id, rodada_id, resolvedor.id, posicao),
                    posicao=f"c1-{posicao}"))
            for posicao in range(nomes_c2):
                tratamentos.append(Tratamento(
                    "E-1", resolvedor, "Do53", "unica", "C2",
                    f"c2-{posicao}.{zona}"))

    # E-2: protocolo x estado da conexao, nos publicos.
    # Em nomes de cache quente, para o tempo de recursao nao se misturar com o
    # custo de transporte. Sem a zona do grupo, usa-se um dominio real popular
    # ja' aquecido pela propria rodada de E-1 — aproximacao declarada.
    # Sem a zona do grupo, o E-2 cai num dominio real ja' aquecido pela
    # propria rodada de E-1 — aproximacao declarada. Com a lista de C3 vazia
    # e sem zona nao ha' nome nenhum para o E-2, e ele simplesmente nao roda:
    # melhor um sub-experimento ausente do que um nome inventado.
    if zona:
        nomes_e2 = [f"c2-{i}.{zona}" for i in range(nomes_c2)]
    elif dominios:
        nomes_e2 = [dominios[0]]
    else:
        nomes_e2 = []
    for resolvedor in publicos:
        for nome in nomes_e2:
            for protocolo, conexao in PROTOCOLOS_E2:
                tratamentos.append(Tratamento("E-2", resolvedor, protocolo,
                                              conexao, "C2" if zona else "C3",
                                              nome))
    return tratamentos


# ---------------------------------------------------------------- rodada


class Conexoes:
    """As conexoes reaproveitadas da rodada, uma por resolvedor e protocolo.

    Abertas sob demanda e com a primeira consulta descartada (secao 9.4): a
    primeira sobre uma conexao nova ainda carrega efeito de inicio e nao
    representa o regime estavel que se quer medir.
    """

    def __init__(self) -> None:
        self._tls: dict[str, object] = {}
        self._doh: dict[str, object] = {}
        self.reconexoes = 0

    def tls(self, resolvedor: md.Resolvedor, nome_aquecimento: str):
        if resolvedor.id not in self._tls:
            sock, *_ = md.abrir_tls(resolvedor)
            md.medir_dot(resolvedor, nome_aquecimento, sock=sock)  # descartada
            self._tls[resolvedor.id] = sock
        return self._tls[resolvedor.id]

    def doh(self, resolvedor: md.Resolvedor, nome_aquecimento: str):
        if resolvedor.id not in self._doh:
            cliente = md.abrir_doh()
            md.medir_doh(resolvedor, nome_aquecimento, cliente=cliente)
            self._doh[resolvedor.id] = cliente
        return self._doh[resolvedor.id]

    def reabrir_tls(self, resolvedor: md.Resolvedor, nome_aquecimento: str):
        """O servidor pode fechar a conexao ociosa; a reconexao fica contada."""
        md.fechar(self._tls.pop(resolvedor.id, None))
        self.reconexoes += 1
        return self.tls(resolvedor, nome_aquecimento)

    def fechar(self) -> None:
        for recurso in itertools.chain(self._tls.values(), self._doh.values()):
            md.fechar(recurso)
        self._tls.clear()
        self._doh.clear()


def executar_rodada(tratamentos: list[Tratamento], ambiente: Ambiente,
                    rede_id: str, rodada_id: str, interface: str,
                    covariaveis: dict[str, dict[str, object]],
                    ultima_consulta: dict[tuple[str, str], float]) -> list[md.Medida]:
    """Executa os tratamentos **na ordem recebida** (ja' embaralhada)."""
    conexoes = Conexoes()
    medidas: list[md.Medida] = []
    try:
        for ordem, t in enumerate(tratamentos, start=1):
            agora = time.time()
            chave = (t.resolvedor.id, t.nome)
            desde = (agora - ultima_consulta[chave]) if chave in ultima_consulta else None

            if t.protocolo == "Do53":
                medida = md.medir_do53(t.resolvedor, t.nome)
            elif t.protocolo == "DoT":
                sock = (conexoes.tls(t.resolvedor, t.nome)
                        if t.conexao == "reaproveitada" else None)
                medida = md.medir_dot(t.resolvedor, t.nome, sock=sock)
                if medida.erro and t.conexao == "reaproveitada":
                    # conexao caida: reabre, conta e mede de novo. A medida
                    # refeita fica marcada (M12), senao a reconexao nao
                    # deixaria rastro nenhum no CSV
                    sock = conexoes.reabrir_tls(t.resolvedor, t.nome)
                    medida = md.medir_dot(t.resolvedor, t.nome, sock=sock)
                    medida.reconectou = True
            else:
                cliente = (conexoes.doh(t.resolvedor, t.nome)
                           if t.conexao == "reaproveitada" else None)
                medida = md.medir_doh(t.resolvedor, t.nome, cliente=cliente)

            covariavel = covariaveis.get(t.resolvedor.id, {})
            medida.ts_utc = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
            medida.rede_id = rede_id
            medida.rodada_id = rodada_id
            medida.ordem = ordem
            medida.experimento = t.experimento
            medida.condicao_cache = t.condicao_cache
            medida.posicao = t.posicao
            medida.s_desde_ultima_consulta = desde
            medida.pop_id = str(covariavel.get("pop_id", ""))
            medida.rtt_ms = covariavel.get("rtt_ms")
            medida.interface = interface
            medida.versao_python = ambiente.versao_python
            medida.versao_openssl = ambiente.versao_openssl
            medida.versao_dnspython = ambiente.versao_dnspython
            medida.versao_httpx = ambiente.versao_httpx
            medidas.append(medida)
            ultima_consulta[chave] = agora
    finally:
        conexoes.fechar()
    return medidas


def covariaveis_da_rodada(resolvedores: list[md.Resolvedor]) -> dict[str, dict[str, object]]:
    """M11 e ponto de presenca, uma vez por rodada e por resolvedor."""
    return {r.id: {"rtt_ms": md.rtt_tcp(r),
                   "pop_id": md.pop_id(r) if r.tem_cifrado else ""}
            for r in resolvedores}


def interface_ativa() -> str:
    """Rotulo grosseiro da interface, so' para separar cabo de Wi-Fi.

    Nao grava endereco nenhum: a secao 9.6 proibe IP nos arquivos versionados
    e o nome da interface (`en0`, `eth0`, `wlan0`) nao identifica ninguem.

    Cada sistema responde de um jeito, e os integrantes coletam em maquinas
    diferentes. Quando nenhum caminho funciona — Windows, por exemplo — devolve
    vazio: a interface e' contexto util, nao requisito, e inventar um rotulo
    seria pior que deixar em branco.
    """
    import subprocess

    tentativas = (
        ["route", "get", "1.1.1.1"],          # macOS e BSD
        ["ip", "-o", "route", "get", "1.1.1.1"],  # Linux
    )
    for comando in tentativas:
        try:
            saida = subprocess.run(comando, capture_output=True, text=True,
                                   timeout=5).stdout
        except Exception:  # noqa: BLE001 - comando ausente: tenta o proximo
            continue
        for linha in saida.splitlines():
            if "interface:" in linha:                  # macOS
                return linha.split(":", 1)[1].strip()
            if " dev " in linha:                       # Linux
                partes = linha.split()
                indice = partes.index("dev")
                if indice + 1 < len(partes):
                    return partes[indice + 1]
    return ""


# ------------------------------------------------------------------- CLI


def escrever(caminho: Path, medidas: list[md.Medida], cabecalho: bool) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "a", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=md.COLUNAS)
        if cabecalho:
            escritor.writeheader()
        for medida in medidas:
            escritor.writerow({c: getattr(medida, c) for c in md.COLUNAS})


def main() -> None:
    analisador = argparse.ArgumentParser(description="Coletor do Lab05.")
    analisador.add_argument("--rede-id", required=True,
                            help="identificador curto da rede (sem IP, sem nome de pessoa)")
    analisador.add_argument("--rodadas", type=int, default=1)
    analisador.add_argument("--intervalo", type=float, default=1800,
                            help="segundos entre o inicio de duas rodadas")
    analisador.add_argument("--padrao", action="append", default=[],
                            metavar="ID=IP",
                            help="resolvedor padrao como id=ip; pode repetir. "
                                 "Ex.: padrao-gateway=192.168.0.1. Ver validar_rede.py")
    analisador.add_argument("--zona", default=None,
                            help="zona do grupo; sem ela, C1 e C2 nao sao coletadas")
    analisador.add_argument("--dominios", type=Path, default=None,
                            help="arquivo com um dominio por linha (C3)")
    analisador.add_argument("--nomes-c1", type=int, default=2)
    analisador.add_argument("--nomes-c2", type=int, default=2)
    analisador.add_argument("--semente", type=int, default=None,
                            help="semente da ordem; o padrao sorteia e registra")
    analisador.add_argument("--saida", type=Path, default=None)
    argumentos = analisador.parse_args()

    ambiente = exigir()

    resolvedores = list(md.PUBLICOS)
    for item in argumentos.padrao:
        if "=" not in item:
            raise SystemExit(f"--padrao espera id=ip, recebeu {item!r}")
        identificador, endereco = item.split("=", 1)
        resolvedores.append(md.Resolvedor(identificador.strip(), endereco.strip()))

    dominios = (argumentos.dominios.read_text(encoding="utf-8").split()
                if argumentos.dominios else list(DOMINIOS_PILOTO))

    semente = argumentos.semente if argumentos.semente is not None \
        else random.SystemRandom().randrange(2**31)
    sorteio = random.Random(semente)

    carimbo = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    saida = argumentos.saida or (PASTA_PADRAO / f"{argumentos.rede_id}_{carimbo}.csv")
    interface = interface_ativa()

    print(f"{ambiente.resumo()}", file=sys.stderr)
    print(f"rede={argumentos.rede_id} interface={interface or '?'} semente={semente}",
          file=sys.stderr)
    if not argumentos.zona:
        print("AVISO: sem --zona, so' C3 e' coletada (C1 e C2 dependem da "
              "pendencia D1, dominio proprio do grupo)", file=sys.stderr)
    print(f"saida: {saida}", file=sys.stderr)

    ultima_consulta: dict[tuple[str, str], float] = {}
    primeira = not saida.exists()

    for numero in range(1, argumentos.rodadas + 1):
        inicio = time.monotonic()
        rodada_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        covariaveis = covariaveis_da_rodada(resolvedores)
        tratamentos = montar_rodada(resolvedores, dominios, argumentos.zona,
                                    argumentos.rede_id, rodada_id,
                                    argumentos.nomes_c1, argumentos.nomes_c2)
        sorteio.shuffle(tratamentos)
        medidas = executar_rodada(tratamentos, ambiente, argumentos.rede_id,
                                  rodada_id, interface, covariaveis,
                                  ultima_consulta)
        escrever(saida, medidas, cabecalho=primeira)
        primeira = False

        falhas = sum(1 for m in medidas if not m.sucesso)
        duracao = time.monotonic() - inicio
        print(f"[{numero}/{argumentos.rodadas}] {rodada_id} "
              f"{len(medidas)} consultas, {falhas} falhas, {duracao:.1f} s",
              file=sys.stderr, flush=True)

        if numero < argumentos.rodadas:
            espera = argumentos.intervalo - (time.monotonic() - inicio)
            if espera > 0:
                time.sleep(espera)
            else:
                print(f"AVISO: a rodada levou mais que o intervalo "
                      f"({duracao:.1f} s > {argumentos.intervalo} s)", file=sys.stderr)

    print(f"\ngerado: {saida}")


if __name__ == "__main__":
    main()
