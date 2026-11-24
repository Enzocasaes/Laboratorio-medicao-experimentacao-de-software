"""Coletor do Lab05 (Participante C, secoes 9.2, 9.3 e 9.6).

Executa rodadas e grava **uma linha de CSV por consulta**. Nao calcula nada:
agregacao e' trabalho da analise, e misturar as duas coisas impediria refazer
a analise sem refazer a coleta.

O QUE UMA RODADA FAZ, NESTA ORDEM

1. Mede as covariaveis da rodada: RTT de rede (M11) e identificador do ponto
   de presenca de cada resolvedor publico. Vem antes porque descrevem o estado
   da rede no momento, e todas as consultas da rodada herdam esses valores.
2. Monta a lista de tratamentos da rodada (E-1 e E-2). Em C3 entra so' o
   subconjunto da vez (rodizio, `--subconjuntos`): cada dominio e'
   consultado uma rodada em cada tres. Com zona, **aquece C2**: consulta
   cada nome C2 uma vez em cada resolvedor e espera 2 s antes de medir.
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
    *((d, "global") for d in ("google.com", "wikipedia.org", "cloudflare.com",
                              "github.com", "amazon.com")),
    *((d, "brasil") for d in ("globo.com", "uol.com.br", "mercadolivre.com.br",
                              "gov.br", "ifood.com.br")),
    *((d, "cauda") for d in ("sqlite.org", "rfc-editor.org", "unicode.org",
                             "postgresql.org", "gnu.org")),
)

# Rodizio de C3 (secoes 9.3 e 9.6, decisao D3): os dominios sao divididos em
# subconjuntos que se alternam entre rodadas. Com 3 subconjuntos e rodadas a
# cada 30 min, cada dominio e' consultado a cada 90 min, e nao a cada 30 — o
# que reduz o autoaquecimento do cache pelas proprias consultas do grupo.
SUBCONJUNTOS_PADRAO = 3

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


# ------------------------------------------------------------- rodizio C3


def ler_dominios(texto: str) -> list[tuple[str, str]]:
    """Le a lista de C3: um dominio por linha, estrato opcional na 2a coluna.

    Formato (linhas vazias e o que vier depois de `#` sao ignorados):

        wikipedia.org     global
        uol.com.br        brasil
        sqlite.org        cauda

    A **primeira** linha e' tambem o nome do E-2 quando nao ha' zona
    (Protocolo, R7). Dominio repetido e' erro: ele seria consultado em dobro e
    entraria em dois subconjuntos.
    """
    dominios: list[tuple[str, str]] = []
    vistos: set[str] = set()
    for numero, linha in enumerate(texto.splitlines(), start=1):
        campos = linha.split("#", 1)[0].split()
        if not campos:
            continue
        if len(campos) > 2:
            raise ValueError(f"linha {numero}: esperado 'dominio [estrato]', "
                             f"recebido {linha.strip()!r}")
        dominio = campos[0].lower().rstrip(".")
        if dominio in vistos:
            raise ValueError(f"linha {numero}: dominio repetido {dominio!r}")
        vistos.add(dominio)
        dominios.append((dominio, campos[1] if len(campos) == 2 else ""))
    return dominios


def dividir_em_subconjuntos(dominios: list[tuple[str, str]],
                            quantidade: int) -> list[list[str]]:
    """Divide os dominios em `quantidade` subconjuntos, estrato por estrato.

    Os dominios sao agrupados por estrato (na ordem em que cada estrato
    aparece no arquivo, e na ordem do arquivo dentro dele) e distribuidos em
    rodizio sobre essa sequencia. A contagem **nao recomeca** a cada estrato:
    se recomecasse, as sobras de todos os estratos cairiam sempre nos
    primeiros subconjuntos (com 5 por estrato, 6/6/3 em vez de 5/5/5).
    Resultado: os subconjuntos diferem em no maximo um dominio, no total e em
    cada estrato, e a divisao depende **so' do arquivo** — as tres redes, com
    a mesma lista versionada, obtem os mesmos subconjuntos.
    """
    if quantidade < 1:
        raise ValueError("o numero de subconjuntos precisa ser >= 1")
    if dominios and quantidade > len(dominios):
        raise ValueError(f"{quantidade} subconjuntos para {len(dominios)} "
                         f"dominios: algum ficaria vazio")
    por_estrato: dict[str, list[str]] = {}
    for dominio, estrato in dominios:
        por_estrato.setdefault(estrato, []).append(dominio)
    sequencia = [d for grupo in por_estrato.values() for d in grupo]
    subconjuntos: list[list[str]] = [[] for _ in range(quantidade)]
    for posicao, dominio in enumerate(sequencia):
        subconjuntos[posicao % quantidade].append(dominio)
    return subconjuntos


def rodadas_ja_gravadas(caminho: Path) -> int:
    """Quantas rodadas distintas o CSV de saida ja' tem.

    O rodizio continua de onde parou quando a coleta e' reiniciada com o mesmo
    `--saida` (Protocolo, 6.7). Se recomecasse do subconjunto 0, os dominios
    dele seriam consultados de novo antes de completar o ciclo de 90 min.
    """
    if not caminho.exists():
        return 0
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        return len({linha["rodada_id"] for linha in csv.DictReader(arquivo)
                    if linha.get("rodada_id")})


def montar_rodada(resolvedores: list[md.Resolvedor], dominios: list[str],
                  zona: str | None, rede_id: str, rodada_id: str,
                  nomes_c1: int, nomes_c2: int,
                  nome_e2: str | None = None) -> list[Tratamento]:
    """Todos os tratamentos da rodada, ainda em ordem determinista.

    `dominios` sao os de C3 **desta rodada** (o subconjunto da vez).
    `nome_e2` e' o nome do E-2 sem zona; ele vem de fora porque e' fixo na
    coleta inteira, enquanto o subconjunto muda a cada rodada. Sem ele, usa-se
    o primeiro dominio da rodada.

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
    # custo de transporte. Sem a zona do grupo, o E-2 cai num dominio real
    # popular e fixo (a primeira linha da lista, Protocolo R7) — aproximacao
    # declarada. Com a lista de C3 vazia e sem zona nao ha' nome nenhum para o
    # E-2, e ele simplesmente nao roda: melhor um sub-experimento ausente do
    # que um nome inventado.
    if zona:
        nomes_e2 = [f"c2-{i}.{zona}" for i in range(nomes_c2)]
    elif nome_e2:
        nomes_e2 = [nome_e2]
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


# ------------------------------------------------------- aquecimento C2

# Espera minima entre o aquecimento e a primeira consulta medida (secao 9.3).
# O TTL so' cai em segundos inteiros: com menos de 1 s, a resposta de cache
# volta com o TTL integral, igual a uma vinda do autoritativo, e a checagem
# M6 nao distingue as duas. 2 s garantem que o TTL ja' caiu ao menos 1 s.
ESPERA_C2_S = 2.0


def pares_a_aquecer(tratamentos: list[Tratamento]) -> list[tuple[md.Resolvedor, str]]:
    """Os pares (resolvedor, nome) de C2 da rodada, sem repeticao.

    Inclui os nomes C2 do E-2: a secao 9.3 estende a eles a mesma garantia.
    A ordem segue a de `tratamentos` (antes do embaralhamento), entao e'
    determinista.
    """
    pares: dict[tuple[str, str], tuple[md.Resolvedor, str]] = {}
    for t in tratamentos:
        if t.condicao_cache == "C2":
            pares.setdefault((t.resolvedor.id, t.nome), (t.resolvedor, t.nome))
    return list(pares.values())


def aquecer_c2(pares: list[tuple[md.Resolvedor, str]],
               ultima_consulta: dict[tuple[str, str], float],
               espera_min: float = ESPERA_C2_S,
               medir=None, dormir=time.sleep, relogio=time.monotonic,
               agora=time.time) -> list[md.Medida]:
    """Consulta cada nome C2 uma vez em cada resolvedor e espera `espera_min`.

    POR QUE. C2 mede o custo de uma resposta **de cache**. Sem aquecimento, a
    primeira consulta C2 de cada resolvedor — e toda consulta depois de o TTL
    vencer — mediria uma resolucao recursiva, e a condicao viraria uma
    mistura de C1 com C2 que so' a checagem M6 denunciaria, depois da coleta.

    COMO. O aquecimento e' em Do53, no mesmo endereco anycast usado pelo DoT e
    pelo DoH do E-2. **[Hipotese]** o cache e' compartilhado entre os
    protocolos na mesma instancia; a M6 confere isso pelo TTL decrementado
    nas consultas medidas.

    A espera conta a partir do **ultimo** aquecimento, entao vale para todos
    os pares. O aquecimento atualiza `ultima_consulta`: ele e' uma consulta
    do grupo, e `s_desde_ultima_consulta` das medidas C2 passa a registrar a
    distancia real ate' ele — e' o que permite auditar a espera no CSV.

    Os resultados nao vao para o CSV (nao sao tratamentos); voltam para quem
    chamou contar falhas no log. Uma falha de aquecimento nao cancela a
    medida: ela e' feita mesmo assim, e a M6 a classifica.
    """
    medir = medir or md.medir_do53
    resultados: list[md.Medida] = []
    if not pares:
        return resultados
    for resolvedor, nome in pares:
        resultados.append(medir(resolvedor, nome))
        ultima_consulta[(resolvedor.id, nome)] = agora()
    fim = relogio()
    # espera contada do fim do ultimo aquecimento; dorme em fatias para nao
    # depender de o sleep do sistema ser exato
    while (restante := espera_min - (relogio() - fim)) > 0:
        dormir(restante)
    return resultados


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
            # errors="replace": no Windows, `route` e' o route.exe, que
            # responde em cp850; com PYTHONUTF8=1 a leitura quebrava e
            # despejava um traceback (com a pasta do usuario) no log
            saida = subprocess.run(comando, capture_output=True, text=True,
                                   errors="replace", timeout=5).stdout
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
                            help="lista de C3: 'dominio [estrato]' por linha")
    analisador.add_argument("--subconjuntos", type=int, default=SUBCONJUNTOS_PADRAO,
                            help="rodizio de C3: em quantos subconjuntos a lista "
                                 "e' dividida (1 = todos em toda rodada)")
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

    lista = (ler_dominios(argumentos.dominios.read_text(encoding="utf-8"))
             if argumentos.dominios else list(DOMINIOS_PILOTO))
    try:
        subconjuntos = dividir_em_subconjuntos(lista, argumentos.subconjuntos)
    except ValueError as erro:
        raise SystemExit(f"--subconjuntos: {erro}") from erro
    nome_e2 = lista[0][0] if lista else None

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
    ja_gravadas = rodadas_ja_gravadas(saida)
    print(f"rodizio C3: {len(lista)} dominios em {len(subconjuntos)} subconjuntos "
          f"({', '.join(str(len(s)) for s in subconjuntos)}); "
          f"{ja_gravadas} rodadas ja' gravadas na saida", file=sys.stderr)

    for numero in range(1, argumentos.rodadas + 1):
        inicio = time.monotonic()
        rodada_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        covariaveis = covariaveis_da_rodada(resolvedores)
        indice = (ja_gravadas + numero - 1) % len(subconjuntos)
        tratamentos = montar_rodada(resolvedores, subconjuntos[indice],
                                    argumentos.zona, argumentos.rede_id,
                                    rodada_id, argumentos.nomes_c1,
                                    argumentos.nomes_c2, nome_e2=nome_e2)
        aquecimento = aquecer_c2(pares_a_aquecer(tratamentos), ultima_consulta)
        sorteio.shuffle(tratamentos)
        medidas = executar_rodada(tratamentos, ambiente, argumentos.rede_id,
                                  rodada_id, interface, covariaveis,
                                  ultima_consulta)
        escrever(saida, medidas, cabecalho=primeira)
        primeira = False

        falhas = sum(1 for m in medidas if not m.sucesso)
        duracao = time.monotonic() - inicio
        texto_aquecimento = ""
        if aquecimento:
            falhas_aquecimento = sum(1 for m in aquecimento if not m.sucesso)
            texto_aquecimento = (f"aquecimento C2 {len(aquecimento)} "
                                 f"({falhas_aquecimento} falhas), ")
        print(f"[{numero}/{argumentos.rodadas}] {rodada_id} "
              f"subconjunto {indice + 1}/{len(subconjuntos)}, {texto_aquecimento}"
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
