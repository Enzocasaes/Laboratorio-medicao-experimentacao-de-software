"""Piloto 2: valida o procedimento de medição Do53/DoT/DoH com dnspython.

Mede, por resolvedor:
  - RTT de rede (TCP connect na porta 853 e 443), como covariável;
  - Do53 (udp_with_fallback);
  - DoT frio (conexão nova por consulta: handshake TCP+TLS medido à parte);
  - DoT quente (mesma conexão TLS reaproveitada);
  - DoH frio (cliente HTTP/2 novo por consulta);
  - DoH quente (mesmo cliente reaproveitado).
Também roda sondas de identificação (PoP / resolvedor efetivo).
"""
import socket
import ssl
import statistics as st
import sys
import time

import dns.message
import dns.query
import dns.rdatatype
import dns.rdataclass
try:  # dnspython >= 2.9 usa o pacote httpx2; versões anteriores usam httpx
    import httpx2 as httpx
except ImportError:
    import httpx

N = 10
NAME = "google.com"  # domínio aquecido (warm-up antes das medições)
RESOLVERS = {
    "1.1.1.1": {"tls_host": "cloudflare-dns.com", "doh": "https://1.1.1.1/dns-query"},
    "8.8.8.8": {"tls_host": "dns.google", "doh": "https://8.8.8.8/dns-query"},
}
DEFAULT = sys.argv[1] if len(sys.argv) > 1 else None


def q(name=NAME, rdtype="A"):
    return dns.message.make_query(name, rdtype)


def ms(t0):
    return (time.perf_counter() - t0) * 1000


def summ(label, xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        print(f"  {label:<28} sem dados")
        return
    print(f"  {label:<28} n={len(xs):2d} med={st.median(xs):7.1f} min={min(xs):7.1f} max={max(xs):7.1f}")


def tcp_rtt(ip, port):
    out = []
    for _ in range(N):
        t0 = time.perf_counter()
        s = socket.create_connection((ip, port), timeout=2)
        out.append(ms(t0))
        s.close()
    return out


def tls_connect(ip, host):
    t0 = time.perf_counter()
    raw = socket.create_connection((ip, 853), timeout=2)
    t_tcp = ms(t0)
    ctx = ssl.create_default_context()
    t1 = time.perf_counter()
    s = ctx.wrap_socket(raw, server_hostname=host)  # handshake bloqueante
    t_tls = ms(t1)
    s.setblocking(False)
    return s, t_tcp, t_tls, s.version()


def run(ip, cfg):
    print(f"\n== {ip} ==")
    summ("RTT TCP :853", tcp_rtt(ip, 853))
    summ("RTT TCP :443", tcp_rtt(ip, 443))
    dns.query.udp(q(), ip, timeout=2)  # warm-up

    do53 = []
    for _ in range(N):
        t0 = time.perf_counter()
        dns.query.udp_with_fallback(q(), ip, timeout=2)
        do53.append(ms(t0))
    summ("Do53 (UDP)", do53)

    cold_total, cold_tcp, cold_tls, cold_query, tlsver = [], [], [], [], None
    for _ in range(N):
        t0 = time.perf_counter()
        s, t_tcp, t_tls, tlsver = tls_connect(ip, cfg["tls_host"])
        t1 = time.perf_counter()
        dns.query.tls(q(), ip, timeout=2, sock=s)
        cold_query.append(ms(t1))
        cold_total.append(ms(t0))
        cold_tcp.append(t_tcp)
        cold_tls.append(t_tls)
        s.close()
    summ("DoT frio: total", cold_total)
    summ("DoT frio: handshake TCP", cold_tcp)
    summ(f"DoT frio: handshake {tlsver}", cold_tls)
    summ("DoT frio: só a consulta", cold_query)

    s, *_ = tls_connect(ip, cfg["tls_host"])
    dns.query.tls(q(), ip, timeout=2, sock=s)  # descarta a 1a
    warm = []
    for _ in range(N):
        t0 = time.perf_counter()
        dns.query.tls(q(), ip, timeout=2, sock=s)
        warm.append(ms(t0))
    s.close()
    summ("DoT quente (reuso)", warm)

    doh_cold = []
    for _ in range(N):
        with httpx.Client(http2=True) as c:
            t0 = time.perf_counter()
            dns.query.https(q(), cfg["doh"], timeout=2, session=c)
            doh_cold.append(ms(t0))
    summ("DoH frio (cliente novo)", doh_cold)

    with httpx.Client(http2=True) as c:
        dns.query.https(q(), cfg["doh"], timeout=2, session=c)
        r = c.post(cfg["doh"], content=q().to_wire(),
                   headers={"content-type": "application/dns-message"})
        print(f"  DoH versão HTTP negociada: {r.http_version}")
        doh_warm = []
        for _ in range(N):
            t0 = time.perf_counter()
            dns.query.https(q(), cfg["doh"], timeout=2, session=c)
            doh_warm.append(ms(t0))
    summ("DoH quente (reuso)", doh_warm)


def probes():
    print("\n== Sondas de identificação ==")
    chaos = dns.message.make_query("id.server", "TXT", rdclass="CH")
    try:
        r = dns.query.udp(chaos, "1.1.1.1", timeout=2)
        print("  1.1.1.1 id.server CH TXT:", [str(a) for a in r.answer])
    except Exception as e:  # noqa: BLE001
        print("  1.1.1.1 id.server falhou:", e)
    targets = [("1.1.1.1", "1.1.1.1"), ("8.8.8.8", "8.8.8.8")]
    if DEFAULT:
        targets.append(("padrão", DEFAULT))
    for label, ip in targets:
        try:
            r = dns.query.udp(q("o-o.myaddr.l.google.com", "TXT"), ip, timeout=2)
            print(f"  via {label}: o-o.myaddr TXT ->", [str(a).split(" ", 4)[-1] for a in r.answer])
        except Exception as e:  # noqa: BLE001
            print(f"  via {label}: o-o.myaddr falhou:", e)
        try:
            r = dns.query.udp(q("whoami.akamai.net", "A"), ip, timeout=2)
            print(f"  via {label}: whoami.akamai.net ->", [str(a).split(" ", 4)[-1] for a in r.answer])
        except Exception as e:  # noqa: BLE001
            print(f"  via {label}: whoami falhou:", e)


if __name__ == "__main__":
    print("dnspython", dns.version.version, "| httpx", httpx.__version__, "| python", sys.version.split()[0])
    for ip, cfg in RESOLVERS.items():
        try:
            run(ip, cfg)
        except Exception as e:  # noqa: BLE001
            print(f"  ERRO em {ip}: {type(e).__name__}: {e}")
    probes()
