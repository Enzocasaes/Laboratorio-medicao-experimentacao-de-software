# Lab05 · Sprint 01 — Pilotos de viabilidade

Scripts e saídas dos pilotos descritos na seção 7.2 de
[`../../Docs/PlanejamentoEPesquisa.md`](../../Docs/PlanejamentoEPesquisa.md).
Servem para validar a instrumentação; **não** são resultados do experimento.

| Arquivo | Conteúdo |
| --- | --- |
| `saida_piloto1.txt` | Piloto 1: latências Do53 medidas com `dig` (valores brutos) |
| `piloto2_protocolos.py` | Piloto 2: Do53, DoT e DoH (conexão nova e reaproveitada), RTT de rede e sondas de identificação |
| `piloto2_nodelay.py` | Piloto 2: efeito de `TCP_NODELAY` na primeira consulta DoT |
| `saida_piloto2_ambienteA.txt` | Saída no Python 3.9.6 do macOS (LibreSSL 2.8.3, TLS 1.2, dnspython 2.7.0) |
| `saida_piloto2_ambienteB.txt` | Saída no Python 3.11.18 (OpenSSL 3.6.4, TLS 1.3, dnspython 2.9.2) |
| `saida_piloto2_nodelay.txt` | Saída do teste de `TCP_NODELAY` |

## Como reproduzir

```bash
python3.11 -m venv .venv
.venv/bin/pip install "dnspython[doh]"
.venv/bin/python -c "import ssl; assert ssl.HAS_TLSv1_3, 'sem TLS 1.3'"
.venv/bin/python piloto2_protocolos.py <ip-do-resolvedor-padrao>
.venv/bin/python piloto2_nodelay.py 1.1.1.1 cloudflare-dns.com
.venv/bin/python piloto2_nodelay.py 8.8.8.8 dns.google
```

> **Privacidade.** As sondas de identificação (`whoami.akamai.net`,
> `o-o.myaddr.l.google.com`) imprimem endereços IP da rede de quem roda o
> script, inclusive a sub-rede do cliente enviada via ECS. Essas linhas foram
> removidas das saídas versionadas e não devem ser commitadas.

> **Atenção.** Estes scripts ainda **não** ligam `TCP_NODELAY` no teste
> principal de DoT (`piloto2_protocolos.py`), justamente porque o piloto
> serviu para descobrir esse problema. O coletor da Sprint 02 deve seguir a
> seção 9.4 do documento.
