import socket, ssl, statistics as st, time, sys
import dns.message, dns.query
IP, HOST = sys.argv[1], sys.argv[2]
def ms(t0): return (time.perf_counter()-t0)*1000
def one(nodelay):
    raw = socket.create_connection((IP, 853), timeout=2)
    if nodelay: raw.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    s = ssl.create_default_context().wrap_socket(raw, server_hostname=HOST)
    s.setblocking(False)
    out = []
    for _ in range(3):
        t0 = time.perf_counter(); dns.query.tls(dns.message.make_query("google.com","A"), IP, timeout=2, sock=s); out.append(ms(t0))
    s.close(); return out
for nd in (False, True):
    rs = [one(nd) for _ in range(10)]
    print(f"{IP} NODELAY={nd}: 1a consulta med={st.median(r[0] for r in rs):6.1f} | 2a med={st.median(r[1] for r in rs):6.1f} | 3a med={st.median(r[2] for r in rs):6.1f}")
