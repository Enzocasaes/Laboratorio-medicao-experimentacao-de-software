"""Verifica e registra o ambiente de coleta (Lab05, Participante C, D7).

POR QUE ISTO EXISTE. O piloto 2 mediu a mesma coisa em dois Pythons da mesma
maquina, com um minuto de diferenca, e achou handshakes TLS de 49 ms e de
34 ms. A diferenca nao era do servidor: o Python do macOS usa LibreSSL, nao
oferece TLS 1.3 e negociou TLS 1.2. Se cada integrante coletar com uma pilha
diferente, parte do "custo do protocolo cifrado" medido sera custo do cliente,
e a comparacao entre redes deixa de valer.

Entao o coletor **aborta** quando o ambiente nao atende ao minimo, em vez de
produzir dados que parecem bons. E o que ele aceita vai gravado em toda linha
do CSV, para a auditoria ser possivel depois.

Uso (a partir de Lab5/):

    .venv/bin/python Sprint01/coleta/ambiente.py           # confere e imprime
    .venv/bin/python Sprint01/coleta/ambiente.py --json    # para a ficha da rede
"""

from __future__ import annotations

import argparse
import json
import platform
import socket
import ssl
import sys
from dataclasses import asdict, dataclass

# Minimos exigidos. Python 3.10 e' o piso da secao 9.4; o TLS 1.3 e' o ponto
# que o piloto 2 provou ser decisivo.
PYTHON_MINIMO = (3, 10)
DNSPYTHON_MINIMO = (2, 7)


@dataclass(frozen=True)
class Ambiente:
    """O que vai em toda linha do CSV, para o dado ser auditavel."""

    versao_python: str
    versao_openssl: str
    versao_dnspython: str
    versao_httpx: str
    tem_tls13: bool
    sistema: str
    maquina: str
    hostname_curto: str

    def resumo(self) -> str:
        return (f"Python {self.versao_python} · {self.versao_openssl} · "
                f"dnspython {self.versao_dnspython} · httpx2 {self.versao_httpx}")


def _versao_tupla(texto: str) -> tuple[int, ...]:
    partes = []
    for pedaco in texto.split("."):
        digitos = "".join(c for c in pedaco if c.isdigit())
        if not digitos:
            break
        partes.append(int(digitos))
    return tuple(partes)


def coletar() -> Ambiente:
    """Le o ambiente atual. Nao julga; so' descreve."""
    import dns.version

    try:  # dnspython >= 2.9 usa httpx2; versoes anteriores, httpx
        import httpx2 as httpx
    except ImportError:  # pragma: no cover - caminho das versoes antigas
        import httpx

    return Ambiente(
        versao_python=platform.python_version(),
        versao_openssl=ssl.OPENSSL_VERSION,
        versao_dnspython=dns.version.version,
        versao_httpx=getattr(httpx, "__version__", "desconhecida"),
        tem_tls13=bool(ssl.HAS_TLSv1_3),
        sistema=f"{platform.system()} {platform.release()}",
        maquina=platform.machine(),
        # so' o nome curto da maquina; nada de IP nem de dominio da rede
        hostname_curto=socket.gethostname().split(".")[0],
    )


def problemas(ambiente: Ambiente) -> list[str]:
    """Lista o que impede a coleta. Lista vazia = ambiente aprovado."""
    erros = []

    if sys.version_info[:2] < PYTHON_MINIMO:
        erros.append(
            f"Python {ambiente.versao_python}: a coleta exige "
            f"{PYTHON_MINIMO[0]}.{PYTHON_MINIMO[1]} ou mais novo (secao 9.4)")

    if not ambiente.tem_tls13:
        erros.append(
            "esta build do Python nao oferece TLS 1.3 (ssl.HAS_TLSv1_3 e' falso). "
            "E' o caso do Python do sistema no macOS, que usa LibreSSL: ele "
            "negocia TLS 1.2 e infla o handshake do DoT. Use um Python com "
            "OpenSSL (Homebrew, pyenv ou python.org)")

    if "openssl" not in ambiente.versao_openssl.lower():
        erros.append(
            f"biblioteca TLS inesperada: {ambiente.versao_openssl}. A coleta "
            "foi especificada sobre OpenSSL")

    if _versao_tupla(ambiente.versao_dnspython) < DNSPYTHON_MINIMO:
        erros.append(
            f"dnspython {ambiente.versao_dnspython}: a coleta exige "
            f"{DNSPYTHON_MINIMO[0]}.{DNSPYTHON_MINIMO[1]} ou mais novo")

    return erros


def exigir() -> Ambiente:
    """Devolve o ambiente ou interrompe a coleta explicando por que.

    Chamado pelo coletor antes da primeira consulta: e' melhor nao coletar do
    que coletar dados que nao podem ser comparados com os das outras redes.
    """
    ambiente = coletar()
    erros = problemas(ambiente)
    if erros:
        print("Ambiente inadequado para a coleta:", file=sys.stderr)
        for erro in erros:
            print(f"  - {erro}", file=sys.stderr)
        print("\nVeja Sprint01/coleta/requirements.txt.", file=sys.stderr)
        raise SystemExit(2)
    return ambiente


def main() -> None:
    analisador = argparse.ArgumentParser(
        description="Confere o ambiente de coleta do Lab05.")
    analisador.add_argument("--json", action="store_true",
                            help="imprime em JSON, para a ficha da rede")
    argumentos = analisador.parse_args()

    ambiente = coletar()
    erros = problemas(ambiente)

    if argumentos.json:
        print(json.dumps({**asdict(ambiente), "problemas": erros},
                         ensure_ascii=False, indent=2))
        raise SystemExit(0 if not erros else 2)

    print(ambiente.resumo())
    print(f"TLS 1.3 disponivel: {'sim' if ambiente.tem_tls13 else 'NAO'}")
    print(f"Sistema: {ambiente.sistema} ({ambiente.maquina})")
    if erros:
        print("\nPROBLEMAS:")
        for erro in erros:
            print(f"  - {erro}")
        raise SystemExit(2)
    print("\nAmbiente aprovado para a coleta.")


if __name__ == "__main__":
    main()
