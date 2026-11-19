"""Primitivas de medicao Do53/DoT/DoH (Lab05, Participante C, secao 9.4).

Aqui mora a instrumentacao: e' o unico lugar do projeto que cronometra uma
consulta. O coletor so' decide **o que** medir e em que ordem; **como** medir
esta' todo neste arquivo, para a definicao da metrica M1 ter um dono so'.

TRES DECISOES QUE MUDAM O NUMERO MEDIDO

1. **`TCP_NODELAY` em todo socket TCP.** Sem ele, a primeira consulta DoT
   depois do handshake atrasa dezenas de milissegundos. Medido nesta maquina,
   com TLS 1.3: 51,4 ms sem a opcao contra 5,6 ms com ela no 1.1.1.1, e
   31,5 contra 14,5 no 8.8.8.8. O `dns.query.tls` do dnspython nao liga a
   opcao; o cliente HTTP do DoH liga. Sem a correcao, o experimento cobraria
   do DoT um custo que e' do cliente e favoreceria o DoH na comparacao.
   A magnitude (~40 ms no caso do 1.1.1.1) e' compativel com o temporizador
   de ACK retardado interagindo com o algoritmo de Nagle.

2. **Onde o cronometro comeca.** Com conexao reaproveitada, a medida cobre so'
   a consulta sobre a conexao ja' aberta. Com conexao nova, cobre desde a
   abertura do socket, incluindo os handshakes TCP e TLS — que tambem vao
   gravados em separado, para a analise poder decompor o custo.

3. **Consulta identica em todos os tratamentos.** Tipo A, classe IN, EDNS0 com
   payload de 1.232 bytes e sem o bit DO. Se a mensagem mudasse entre
   protocolos, a diferenca medida nao seria so' do protocolo.

NADA AQUI LEVANTA EXCECAO. Toda funcao de medida devolve uma `Medida`, com
`erro` preenchido quando a consulta falha. Uma excecao escapando interromperia
a rodada e perderia as outras medidas do mesmo bloco, que e' justamente o que
o pareamento precisa manter junto.
"""

from __future__ import annotations

import socket
import ssl
import time
from dataclasses import dataclass, field, fields
from typing import Any

import dns.exception
import dns.message
import dns.query
import dns.rcode
import dns.rdataclass
import dns.rdatatype

try:  # dnspython >= 2.9 usa httpx2
    import httpx2 as httpx
except ImportError:  # pragma: no cover
    import httpx

TIMEOUT_S = 2.0          # secao 9.4: uma tentativa, 2 s
CENSURA_MS = 2000.0      # secao 10.4: timeouts entram censurados neste valor
PAYLOAD_EDNS = 1232      # secao 9.4
PORTA_DOT = 853
PORTA_DOH = 443
PORTA_DO53 = 53


@dataclass(frozen=True)
class Resolvedor:
    """Um alvo de medicao. `tls_host` e `doh_url` sao None no padrao da rede."""

    id: str                      # "1.1.1.1", "8.8.8.8", "padrao"
    ip: str
    tls_host: str | None = None
    doh_url: str | None = None

    @property
    def tem_cifrado(self) -> bool:
        return self.tls_host is not None and self.doh_url is not None


# Os dois resolvedores publicos comparados. O padrao da rede entra com o IP
# descoberto por `validar_rede.py`, porque muda de rede para rede.
PUBLICOS = (
    Resolvedor("1.1.1.1", "1.1.1.1", "cloudflare-dns.com",
               "https://1.1.1.1/dns-query"),
    Resolvedor("8.8.8.8", "8.8.8.8", "dns.google",
               "https://8.8.8.8/dns-query"),
)


@dataclass
class Medida:
    """Uma linha do CSV: exatamente uma consulta (esquema da secao 9.6)."""

    ts_utc: str = ""
    rede_id: str = ""
    rodada_id: str = ""
    ordem: int = 0
    experimento: str = ""          # E-1 | E-2
    resolvedor: str = ""
    protocolo: str = ""            # Do53 | DoT | DoH
    conexao: str = ""              # unica | nova | reaproveitada
    condicao_cache: str = ""       # C1 | C2 | C3
    nome: str = ""
    # A unidade de pareamento do bloco (secao 7.4): rede x rodada x POSICAO.
    # Em C2 e C3 a posicao e' o proprio nome. Em C1 ela **tem** de ser outra
    # coisa, porque ali cada resolvedor recebe um nome unico diferente para
    # nao aquecer o cache dos outros — parear pelo nome nunca encontraria par.
    posicao: str = ""
    latencia_ms: float | None = None
    t_tcp_ms: float | None = None
    t_tls_ms: float | None = None
    tls_versao: str = ""
    http_versao: str = ""
    rcode: str = ""
    erro: str = ""                 # vazio = sucesso
    usou_tcp: bool | None = None
    ttl: int | None = None
    ttl_autoritativo: int | None = None
    s_desde_ultima_consulta: float | None = None
    pop_id: str = ""
    rtt_ms: float | None = None
    interface: str = ""
    versao_python: str = ""
    versao_openssl: str = ""
    versao_dnspython: str = ""
    versao_httpx: str = ""
    # M12: esta medida foi feita depois de o servidor derrubar a conexao
    # ociosa e o coletor reabri-la. Sem esta coluna, a reconexao sumiria do
    # dado: a medida que falhou e' descartada e a refeita parece normal.
    reconectou: bool = False

    @property
    def sucesso(self) -> bool:
        return not self.erro and self.rcode == "NOERROR"


COLUNAS: tuple[str, ...] = tuple(f.name for f in fields(Medida))


# ----------------------------------------------------------------- apoio


def _ms(inicio: float) -> float:
    return (time.perf_counter() - inicio) * 1000.0


def consulta(nome: str, rdtype: str = "A") -> dns.message.Message:
    """A mensagem DNS usada em TODOS os tratamentos (secao 9.4)."""
    mensagem = dns.message.make_query(nome, rdtype, rdclass=dns.rdataclass.IN)
    mensagem.use_edns(0, ednsflags=0, payload=PAYLOAD_EDNS)  # sem o bit DO
    return mensagem


def _nome_do_erro(excecao: BaseException) -> str:
    """Rotulo curto e estavel, para a classificacao de falhas da secao 10.4."""
    if isinstance(excecao, dns.exception.Timeout):
        return "timeout"
    return type(excecao).__name__


def _menor_ttl(resposta: dns.message.Message) -> int | None:
    ttls = [conjunto.ttl for conjunto in resposta.answer]
    return min(ttls) if ttls else None


def _preencher(medida: Medida, resposta: dns.message.Message) -> None:
    medida.rcode = dns.rcode.to_text(resposta.rcode())
    medida.ttl = _menor_ttl(resposta)


def _falha(medida: Medida, excecao: BaseException) -> Medida:
    """Marca a medida como falha. Timeout entra censurado (secao 10.4)."""
    medida.erro = _nome_do_erro(excecao)
    medida.rcode = ""
    if medida.erro == "timeout":
        medida.latencia_ms = CENSURA_MS
    return medida


# ------------------------------------------------------------- conexoes


def abrir_tcp(ip: str, porta: int, timeout: float = TIMEOUT_S) -> tuple[socket.socket, float]:
    """Socket TCP com `TCP_NODELAY` ligado, e o tempo do handshake TCP.

    O `TCP_NODELAY` entra aqui, e nao em cada chamador, para nao existir
    caminho no projeto que abra um socket sem ele.
    """
    inicio = time.perf_counter()
    bruto = socket.create_connection((ip, porta), timeout=timeout)
    t_tcp = _ms(inicio)
    bruto.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    return bruto, t_tcp


def abrir_tls(resolvedor: Resolvedor,
              timeout: float = TIMEOUT_S) -> tuple[ssl.SSLSocket, float, float, str]:
    """Socket TLS pronto para o `dns.query.tls`, com os dois handshakes medidos.

    O socket sai **nao bloqueante** porque e' assim que o `dns.query.tls`
    espera recebe-lo em `sock=`; o proprio dnspython cuida da espera.
    """
    bruto, t_tcp = abrir_tcp(resolvedor.ip, PORTA_DOT, timeout)
    contexto = ssl.create_default_context()
    inicio = time.perf_counter()
    seguro = contexto.wrap_socket(bruto, server_hostname=resolvedor.tls_host)
    t_tls = _ms(inicio)
    versao = seguro.version() or ""
    seguro.setblocking(False)
    return seguro, t_tcp, t_tls, versao


def abrir_doh() -> Any:
    """Cliente HTTP/2 para o DoH.

    O `httpcore` liga `TCP_NODELAY` por conta propria (conferido em
    `validar_instrumentacao.py`), entao aqui nao ha o que corrigir.
    """
    return httpx.Client(http2=True, timeout=TIMEOUT_S)


def fechar(recurso: Any) -> None:
    """Fecha socket ou cliente sem deixar excecao escapar."""
    try:
        recurso.close()
    except Exception:  # noqa: BLE001 - fechar nunca pode derrubar a rodada
        pass


# -------------------------------------------------------------- medidas


def rtt_tcp(resolvedor: Resolvedor, porta: int | None = None,
            timeout: float = TIMEOUT_S) -> float | None:
    """M11: RTT de rede pelo tempo de `connect` TCP.

    Porta 443 nos publicos; 53 no padrao da rede, que costuma nao ter 443.
    Devolve None quando o alvo nao aceita TCP naquela porta — e' informacao,
    nao erro.
    """
    if porta is None:
        porta = PORTA_DOH if resolvedor.tem_cifrado else PORTA_DO53
    try:
        conexao, t_tcp = abrir_tcp(resolvedor.ip, porta, timeout)
        fechar(conexao)
        return t_tcp
    except Exception:  # noqa: BLE001
        return None


def pop_id(resolvedor: Resolvedor, timeout: float = TIMEOUT_S) -> str:
    """Identificador do ponto de presenca (`id.server`, classe CHAOS).

    O piloto 2 viu a mesma maquina ser atendida por `gru22` e depois por
    `gru02`. Sem registrar isso, uma mudanca de instancia viraria "variacao do
    resolvedor" na analise.
    """
    try:
        pergunta = dns.message.make_query("id.server", dns.rdatatype.TXT,
                                          rdclass=dns.rdataclass.CH)
        resposta = dns.query.udp(pergunta, resolvedor.ip, timeout=timeout)
        for conjunto in resposta.answer:
            for item in conjunto:
                return b"".join(item.strings).decode("ascii", "replace")
    except Exception:  # noqa: BLE001
        pass
    return ""


def medir_do53(resolvedor: Resolvedor, nome: str,
               timeout: float = TIMEOUT_S) -> Medida:
    """Do53 por UDP, com queda para TCP quando a resposta vem truncada.

    O `usou_tcp` fica registrado porque essa queda custa um RTT a mais e
    precisa ser identificavel na analise.
    """
    medida = Medida(resolvedor=resolvedor.id, protocolo="Do53",
                    conexao="unica", nome=nome)
    pergunta = consulta(nome)
    inicio = time.perf_counter()
    try:
        resposta, usou_tcp = dns.query.udp_with_fallback(
            pergunta, resolvedor.ip, timeout=timeout)
        medida.latencia_ms = _ms(inicio)
        medida.usou_tcp = usou_tcp
        _preencher(medida, resposta)
    except Exception as excecao:  # noqa: BLE001
        medida.latencia_ms = _ms(inicio)
        _falha(medida, excecao)
    return medida


def medir_dot(resolvedor: Resolvedor, nome: str, sock: ssl.SSLSocket | None = None,
              timeout: float = TIMEOUT_S) -> Medida:
    """DoT. Com `sock`, mede a conexao reaproveitada; sem ele, abre uma nova.

    Na conexao nova o cronometro comeca ANTES do socket: o custo dos
    handshakes e' parte do que o usuario paga, e e' exatamente o que a Q3
    quer medir.
    """
    reaproveitada = sock is not None
    medida = Medida(resolvedor=resolvedor.id, protocolo="DoT",
                    conexao="reaproveitada" if reaproveitada else "nova",
                    nome=nome)
    pergunta = consulta(nome)
    inicio = time.perf_counter()
    try:
        if not reaproveitada:
            sock, t_tcp, t_tls, versao = abrir_tls(resolvedor, timeout)
            medida.t_tcp_ms, medida.t_tls_ms, medida.tls_versao = t_tcp, t_tls, versao
        resposta = dns.query.tls(pergunta, resolvedor.ip, timeout=timeout, sock=sock)
        medida.latencia_ms = _ms(inicio)
        _preencher(medida, resposta)
    except Exception as excecao:  # noqa: BLE001
        medida.latencia_ms = _ms(inicio)
        _falha(medida, excecao)
    finally:
        if not reaproveitada and sock is not None:
            fechar(sock)
    return medida


def medir_doh(resolvedor: Resolvedor, nome: str, cliente: Any | None = None,
              timeout: float = TIMEOUT_S) -> Medida:
    """DoH sobre HTTP/2, por URL de IP (secao 9.4).

    A URL usa o IP, e nao `cloudflare-dns.com`, por dois motivos: evita uma
    resolucao DNS escondida dentro da medida e mantem o mesmo endereco anycast
    do Do53, para a comparacao entre protocolos nao virar comparacao entre
    rotas. Em troca, o DoH medido nao e' exatamente o que um navegador usa —
    limite declarado na secao 10.7.
    """
    reaproveitado = cliente is not None
    medida = Medida(resolvedor=resolvedor.id, protocolo="DoH",
                    conexao="reaproveitada" if reaproveitado else "nova",
                    nome=nome)
    pergunta = consulta(nome)
    proprio = None
    inicio = time.perf_counter()
    try:
        if not reaproveitado:
            proprio = abrir_doh()
            cliente = proprio
        resposta = dns.query.https(pergunta, resolvedor.doh_url,
                                   timeout=timeout, session=cliente)
        medida.latencia_ms = _ms(inicio)
        _preencher(medida, resposta)
    except Exception as excecao:  # noqa: BLE001
        medida.latencia_ms = _ms(inicio)
        _falha(medida, excecao)
    finally:
        if proprio is not None:
            fechar(proprio)
    return medida
