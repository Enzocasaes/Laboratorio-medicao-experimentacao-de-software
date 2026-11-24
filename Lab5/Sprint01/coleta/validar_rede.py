"""Ficha da rede: quem resolve de verdade (Lab05, Participante C, secao 9.5).

POR QUE ISTO VEM ANTES DA COLETA. Consultar o IP configurado mede o que os
dispositivos da rede realmente usam — mas esse IP quase sempre e' o roteador,
que repassa as consultas a outro resolvedor. No piloto 1, o "resolvedor
padrao" respondia em 7 ms; o piloto 2 mostrou que ele encaminhava ao Google.
Comparar aquilo com o 8.8.8.8 seria comparar o Google com o Google mais um
cache local. Sem esta ficha, a comparacao "padrao x publico" nao tem sentido
definido.

O QUE O SCRIPT FAZ

1. Le os resolvedores configurados no sistema.
2. Descobre **quem chega ao servidor autoritativo**, consultando dois nomes
   que devolvem o endereco de quem perguntou: `whoami.akamai.net` (A) e
   `o-o.myaddr.l.google.com` (TXT). Repete varias vezes, porque um
   encaminhador pode ter mais de um upstream — foi o que o piloto encontrou.
3. Procura **interceptacao da porta 53**: se uma consulta mandada ao 1.1.1.1
   nao for atendida pela Cloudflare, o provedor esta' desviando a porta 53, e
   as medidas Do53 dos publicos naquela rede deixam de valer (DoT e DoH
   continuam valendo, porque o certificado e' verificado).
4. Classifica a rede em (a) padrao independente, (b) padrao que encaminha a um
   publico ou (c) rede com interceptacao.

PRIVACIDADE. As sondas devolvem enderecos IP da rede de quem roda o script.
Eles sao usados apenas para consultar o AS e **nao** sao gravados: a ficha
guarda so' o numero do AS e o nome da organizacao. Rode com `--mostrar-ips`
somente para depurar, e nao versione essa saida.

Uso (a partir de Lab5/):

    .venv/bin/python Sprint01/coleta/validar_rede.py --rede-id casa-leo
    .venv/bin/python Sprint01/coleta/validar_rede.py --rede-id casa-leo \\
        --padrao padrao-gateway=192.168.0.1 --saida Sprint01/dados/rede_casa-leo.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dns.message  # noqa: E402
import dns.query  # noqa: E402
import dns.rdataclass  # noqa: E402
import dns.rdatatype  # noqa: E402
import dns.resolver  # noqa: E402

import medidor as md  # noqa: E402

REPETICOES = 20           # secao 9.5: revela encaminhadores com varios upstreams
AS_GOOGLE = "15169"
AS_CLOUDFLARE = "13335"

# Mapeia IP -> AS pelo servico IP-to-ASN da Team Cymru, que responde por DNS.
# E' consulta DNS comum, sem cadastro e sem chave.
SUFIXO_CYMRU_V4 = "origin.asn.cymru.com"
SUFIXO_CYMRU_V6 = "origin6.asn.cymru.com"
SUFIXO_CYMRU_AS = "asn.cymru.com"


def mascarar(ip: str) -> str:
    """Esconde o host do endereco, mantendo o prefixo.

    A secao 9.6 manda guardar apenas o AS e a cidade nos arquivos
    versionados. O endereco do resolvedor do provedor nao e' o endereco do
    cliente, mas e' infraestrutura identificavel, e o AS — que vai na ficha
    por extenso — ja' diz tudo que a analise precisa. Entao o endereco entra
    truncado: /24 em IPv4 e /48 em IPv6.

    Enderecos privados passam inteiros: 192.168.0.1 nao identifica ninguem e
    saber que o padrao e' o roteador importa para a classificacao da rede.
    """
    import ipaddress
    try:
        endereco = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if endereco.is_private:
        return ip
    if endereco.version == 4:
        return str(ipaddress.ip_network(f"{ip}/24", strict=False))
    return str(ipaddress.ip_network(f"{ip}/48", strict=False))


def resolvedores_do_sistema() -> list[str]:
    """Os nameservers configurados, como o sistema os enxerga."""
    try:
        return [str(ip) for ip in dns.resolver.Resolver().nameservers]
    except Exception:  # noqa: BLE001
        return []


def _consultar_texto(nome: str, rdtype: str, servidor: str,
                     timeout: float = 3.0) -> list[str]:
    pergunta = dns.message.make_query(nome, rdtype)
    resposta = dns.query.udp(pergunta, servidor, timeout=timeout)
    valores = []
    for conjunto in resposta.answer:
        for item in conjunto:
            if rdtype == "TXT":
                valores.append(b"".join(item.strings).decode("ascii", "replace"))
            else:
                valores.append(str(item))
    return valores


def _rotulo_cymru(ip: str) -> tuple[str, str]:
    """O nome a consultar na Team Cymru, e o sufixo da zona.

    IPv4 vai em octetos invertidos; IPv6 vai em **nibbles** invertidos, como
    no `ip6.arpa`. A rede do piloto so' tem nameserver IPv6, entao tratar
    apenas IPv4 deixaria justamente o resolvedor padrao sem classificacao.
    """
    if ":" in ip:
        import ipaddress
        expandido = ipaddress.IPv6Address(ip).exploded.replace(":", "")
        return ".".join(reversed(expandido)), SUFIXO_CYMRU_V6
    return ".".join(reversed(ip.split("."))), SUFIXO_CYMRU_V4


def asn_do_ip(ip: str) -> dict[str, str]:
    """AS e organizacao de um IP (v4 ou v6), pelo servico da Team Cymru [R41].

    Alterna 1.1.1.1 e 8.8.8.8, ate' 3 vezes cada. Em 24/11/2026 a Team Cymru
    respondia de forma intermitente (1 em 6 pelo 1.1.1.1, 5 em 6 pelo
    8.8.8.8); com uma tentativa so', o AS saia vazio e `checar_interceptacao`
    acusava interceptacao (classificacao (c)) numa rede sem desvio nenhum.
    """
    reverso, sufixo = _rotulo_cymru(ip)
    for servidor in ("1.1.1.1", "8.8.8.8") * 3:
        try:
            partes = _consultar_texto(f"{reverso}.{sufixo}", "TXT", servidor)
            if not partes:
                continue
            asn = partes[0].split("|")[0].strip().split()[0]
            nome = _consultar_texto(f"AS{asn}.{SUFIXO_CYMRU_AS}", "TXT", servidor)
            org = nome[0].split("|")[-1].strip() if nome else ""
            return {"asn": asn, "org": org}
        except Exception:  # noqa: BLE001
            continue
    return {"asn": "", "org": ""}


def quem_resolve(servidor: str, repeticoes: int = REPETICOES) -> dict:
    """Quais enderecos chegam ao autoritativo quando se consulta por `servidor`.

    Repetir importa: um encaminhador com varios upstreams so' se revela em
    varias tentativas.
    """
    vistos: Counter[str] = Counter()
    erros: Counter[str] = Counter()
    for _ in range(repeticoes):
        for nome, rdtype, extrator in (
            ("whoami.akamai.net", "A", lambda v: v),
            ("o-o.myaddr.l.google.com", "TXT", lambda v: v),
        ):
            try:
                for valor in _consultar_texto(nome, rdtype, servidor):
                    endereco = valor.strip().strip('"')
                    if re.fullmatch(r"[0-9.]+|[0-9a-fA-F:]+", endereco):
                        vistos[endereco] += 1
            except Exception as excecao:  # noqa: BLE001
                erros[type(excecao).__name__] += 1

    upstreams = []
    for endereco, vezes in vistos.most_common():
        dados = asn_do_ip(endereco)
        upstreams.append({"asn": dados["asn"], "org": dados["org"],
                          "vezes": vezes, "_ip": endereco})
    return {"upstreams": upstreams, "erros": dict(erros)}


def classificar_upstreams(upstreams: list[dict]) -> str:
    ases = {u["asn"] for u in upstreams if u["asn"]}
    if not ases:
        return "indeterminado"
    if ases == {AS_GOOGLE}:
        return "encaminha para o Google (AS15169)"
    if ases == {AS_CLOUDFLARE}:
        return "encaminha para a Cloudflare (AS13335)"
    if ases & {AS_GOOGLE, AS_CLOUDFLARE}:
        return "encaminha para mais de um upstream, incluindo um publico"
    return "resolve por conta propria (ou por um upstream do provedor)"


def checar_interceptacao() -> dict:
    """A consulta mandada ao 1.1.1.1 esta' mesmo chegando na Cloudflare?"""
    resultado: dict[str, object] = {}
    cloudflare = md.PUBLICOS[0]
    resultado["id_server_1111"] = md.pop_id(cloudflare)
    for resolvedor, esperado in ((md.PUBLICOS[0], AS_CLOUDFLARE),
                                 (md.PUBLICOS[1], AS_GOOGLE)):
        try:
            enderecos = _consultar_texto("whoami.akamai.net", "A", resolvedor.ip)
            dados = asn_do_ip(enderecos[0]) if enderecos else {"asn": "", "org": ""}
            # AS vazio = a Team Cymru nao respondeu, e nao "AS diferente":
            # fica None (indeterminado) para nao virar falso (c)
            resultado[resolvedor.id] = {
                "asn_observado": dados["asn"], "org": dados["org"],
                "asn_esperado": esperado,
                "bate": (dados["asn"] == esperado) if dados["asn"] else None,
            }
        except Exception as excecao:  # noqa: BLE001
            resultado[resolvedor.id] = {"erro": type(excecao).__name__, "bate": False}

    resultado["interceptacao_detectada"] = interceptacao_detectada(resultado)
    return resultado


def interceptacao_detectada(resultado: dict) -> bool:
    """Ha' desvio da porta 53 se falta o id.server da Cloudflare, se a consulta
    ao publico falhou, ou se o AS **observado** e' outro. AS indeterminado
    (bate=None) nao acusa nada."""
    if not resultado.get("id_server_1111"):
        return True
    return any(isinstance(v, dict) and v.get("bate") is False
               for k, v in resultado.items() if k != "id_server_1111")


def classificar_rede(padroes: dict, interceptacao: dict) -> str:
    if interceptacao.get("interceptacao_detectada"):
        return ("(c) rede com interceptacao da porta 53: entra apenas no E-2 "
                "(DoT e DoH)")
    for ficha in padroes.values():
        if "encaminha" in ficha.get("classificacao", ""):
            return ("(b) o resolvedor padrao encaminha a um publico: entra, mas "
                    "a comparacao 'padrao x publico' le-se como 'encaminhador "
                    "local com cache x acesso direto'")
    return "(a) resolvedor padrao independente: entra no experimento completo"


def main() -> None:
    analisador = argparse.ArgumentParser(
        description="Valida o resolvedor padrao de uma rede (secao 9.5).")
    analisador.add_argument("--rede-id", required=True)
    analisador.add_argument("--padrao", action="append", default=[],
                            metavar="ID=IP",
                            help="resolvedor padrao a investigar; pode repetir. "
                                 "Sem isso, usa os configurados no sistema")
    analisador.add_argument("--repeticoes", type=int, default=REPETICOES)
    analisador.add_argument("--mostrar-ips", action="store_true",
                            help="imprime os IPs das sondas; NAO versione a saida")
    analisador.add_argument("--saida", type=Path, default=None)
    argumentos = analisador.parse_args()

    alvos: dict[str, str] = {}
    for item in argumentos.padrao:
        identificador, endereco = item.split("=", 1)
        alvos[identificador.strip()] = endereco.strip()
    configurados = resolvedores_do_sistema()
    if not alvos:
        alvos = {f"padrao-{i}": ip for i, ip in enumerate(configurados, 1)}

    print(f"rede: {argumentos.rede_id}")
    print(f"nameservers configurados no sistema: {', '.join(configurados) or '(nenhum)'}")

    padroes = {}
    for identificador, endereco in alvos.items():
        print(f"\nsondando {identificador} ({endereco})...", flush=True)
        ficha = quem_resolve(endereco, argumentos.repeticoes)
        ficha["classificacao"] = classificar_upstreams(ficha["upstreams"])
        ficha["endereco_privado"] = endereco.startswith(("10.", "192.168.", "172."))
        padroes[identificador] = ficha
        for upstream in ficha["upstreams"]:
            etiqueta = f" ({upstream['_ip']})" if argumentos.mostrar_ips else ""
            print(f"  upstream AS{upstream['asn'] or '?'} "
                  f"{upstream['org'] or '?'}{etiqueta} — {upstream['vezes']}x")
        print(f"  classificacao: {ficha['classificacao']}")

    print("\nprocurando interceptacao da porta 53...", flush=True)
    interceptacao = checar_interceptacao()
    print(f"  id.server do 1.1.1.1: {interceptacao['id_server_1111'] or '(sem resposta)'}")
    for chave in ("1.1.1.1", "8.8.8.8"):
        ficha = interceptacao[chave]
        situacao = {True: "ok", False: "NAO BATE", None: "indeterminado (AS sem resposta)"}
        print(f"  {chave}: AS observado {ficha.get('asn_observado') or '?'} "
              f"({ficha.get('org') or '?'}) — {situacao[ficha.get('bate')]}")

    classificacao = classificar_rede(padroes, interceptacao)
    print(f"\nclassificacao da rede: {classificacao}")

    # os IPs das sondas saem da ficha versionada (secao 9.6, privacidade)
    for ficha in padroes.values():
        for upstream in ficha["upstreams"]:
            upstream.pop("_ip", None)

    relatorio = {
        "rede_id": argumentos.rede_id,
        "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repeticoes_por_sonda": argumentos.repeticoes,
        # truncados: a classificacao vive do AS, nao do endereco (secao 9.6)
        "nameservers_configurados": [mascarar(ip) for ip in configurados],
        "alvos_sondados": {k: mascarar(v) for k, v in alvos.items()},
        "padroes": padroes,
        "interceptacao": interceptacao,
        "classificacao": classificacao,
    }
    if argumentos.saida:
        argumentos.saida.parent.mkdir(parents=True, exist_ok=True)
        argumentos.saida.write_text(
            json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nficha gravada em {argumentos.saida}")


if __name__ == "__main__":
    main()
