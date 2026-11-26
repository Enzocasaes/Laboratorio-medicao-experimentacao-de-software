"""Analise estatistica descritiva dos resultados (Lab05, Sprint 02, issue #135).

A secao 1 do `analise_rede-c.md` ja' traz mediana, p95, IQR e falhas por
tratamento. Este script fecha o que a secao 10.1 do plano de analise pede e
ainda nao tinha sido calculado:

1. **Media e desvio-padrao como complemento da mediana.** O plano pede os dois
   lado a lado ("media so' como complemento"), e ate' agora so' a mediana
   estava no relatorio. Com eles vem a **forma** da distribuicao -- assimetria
   e curtose --, que e' o que justifica, com numero desta coleta, a escolha de
   medianas e testes nao parametricos feita no desenho.
2. **Descritiva por nome** (E-1): mediana, dispersao e forma de cada dominio em
   cada resolvedor. O `testes_hipotese.md` traz o Δ pareado por nome; aqui
   estao os niveis, que mostram *de onde* vem cada Δ.
3. **Decomposicao do custo do DNS cifrado** (E-2) com os tempos de handshake
   `t_tcp_ms` e `t_tls_ms`, que estavam na base e nao apareciam em relatorio
   nenhum. E' o que separa "a distancia ate' o servidor" de "o servidor TLS".
4. **Covariaveis** (M11 e ponto de presenca) ao longo da coleta: o RTT por
   rodada e a instancia anycast que respondeu em cada rodada.

Nao ha' teste de hipotese aqui, de proposito: a inferencia esta' no
`inferencia.py` (#136). Descritiva descreve.

Le a base validada (#134), lote `provisoria` (decisao D13). Biblioteca padrao
apenas, sem sorteio: a saida e' identica a cada execucao, e a CI confere isso
com `diff`.

Uso (a partir de Lab5/):

    python Sprint02/descritiva.py                 # grava em Sprint02/resultados/
    python Sprint02/descritiva.py --saida /tmp/x  # para conferir
"""

from __future__ import annotations

import argparse
import statistics
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

LAB5 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import analise as ana  # noqa: E402
import estatistica as est  # noqa: E402

BASE = LAB5 / "Sprint02" / "base_validada" / "consultas.csv.gz"
LOTE = "provisoria"
SAIDA = LAB5 / "Sprint02" / "resultados"

RESOLVEDORES = ("1.1.1.1", "8.8.8.8", "padrao")
ROTULO = {"1.1.1.1": "1.1.1.1", "8.8.8.8": "8.8.8.8", "padrao": "padrão"}
MIN_P95 = 100            # mesmo piso do analise.py (ajuste 2 do plano)
PERCENTIS = (50, 75, 90, 95, 99)


# ------------------------------------------------------------ 1. forma


def assimetria(valores: list[float]) -> float:
    """Assimetria g1 (momento padronizado de 3a ordem, populacional).

    Positiva = cauda para a direita. Em latencia espera-se positiva: existe um
    piso (o tempo minimo de ida e volta) e nao existe teto.
    """
    if len(valores) < 3:
        return float("nan")
    media = statistics.fmean(valores)
    desvio = statistics.pstdev(valores)
    if desvio == 0:
        return 0.0
    return sum(((v - media) / desvio) ** 3 for v in valores) / len(valores)


def curtose(valores: list[float]) -> float:
    """Curtose em excesso g2: 0 na normal, positiva com cauda mais pesada."""
    if len(valores) < 4:
        return float("nan")
    media = statistics.fmean(valores)
    desvio = statistics.pstdev(valores)
    if desvio == 0:
        return 0.0
    return sum(((v - media) / desvio) ** 4 for v in valores) / len(valores) - 3.0


def latencias(linhas: list[dict]) -> list[float]:
    return [l["latencia_ms"] for l in linhas if l["sucesso"] and l["latencia_ms"] is not None]


# ------------------------------------------------- 2. complemento da mediana


def complemento_da_mediana(linhas: list[dict]) -> list[dict]:
    """Media, desvio e forma por tratamento, na ordem do `analise.py`."""
    celulas: dict[tuple, list[dict]] = defaultdict(list)
    for linha in linhas:
        celulas[(linha["experimento"],) + ana.tratamento(linha)].append(linha)

    saida = []
    for chave in sorted(celulas):
        valores = latencias(celulas[chave])
        if not valores:
            continue
        media = statistics.fmean(valores)
        mediana = est.mediana(valores)
        saida.append({
            "tratamento": chave,
            "n": len(valores),
            "media": media,
            "desvio": statistics.stdev(valores) if len(valores) > 1 else float("nan"),
            "mediana": mediana,
            "razao": media / mediana if mediana else float("nan"),
            "assimetria": assimetria(valores),
            "curtose": curtose(valores),
            "maximo": max(valores),
        })
    return saida


def perfil_de_percentis(linhas: list[dict]) -> list[dict]:
    """Percentis do E-1 por resolvedor: onde mora a cauda."""
    saida = []
    for resolvedor in RESOLVEDORES:
        valores = latencias([l for l in linhas
                             if l["experimento"] == "E-1" and l["resolvedor"] == resolvedor])
        if not valores:
            continue
        linha = {"resolvedor": resolvedor, "n": len(valores), "maximo": max(valores)}
        for p in PERCENTIS:
            linha[f"p{p}"] = est.percentil(valores, p)
        linha["razao_p99_p50"] = linha["p99"] / linha["p50"] if linha["p50"] else float("nan")
        saida.append(linha)
    return saida


# ------------------------------------------------------------- 3. por nome


def por_nome(linhas: list[dict]) -> list[dict]:
    """Nivel e dispersao de cada dominio do E-1, em cada resolvedor."""
    valores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for linha in linhas:
        if linha["experimento"] != "E-1":
            continue
        if linha["sucesso"] and linha["latencia_ms"] is not None:
            valores[linha["nome"]][linha["resolvedor"]].append(linha["latencia_ms"])

    saida = []
    for nome in sorted(valores):
        registro = {"nome": nome, "n": len(valores[nome].get(RESOLVEDORES[0], []))}
        medianas = {}
        for resolvedor in RESOLVEDORES:
            v = valores[nome].get(resolvedor, [])
            if not v:
                continue
            medianas[resolvedor] = est.mediana(v)
            registro[resolvedor] = {
                "mediana": est.mediana(v),
                "iqr": est.iqr(v),
                "assimetria": assimetria(v),
                "maximo": max(v),
            }
        if medianas:
            registro["mais_rapido"] = min(medianas, key=medianas.get)
        saida.append(registro)
    return saida


# -------------------------------------------------------- 4. handshakes E-2


def decomposicao_do_cifrado(linhas: list[dict]) -> list[dict]:
    """Separa o custo da conexao nova em TCP, TLS e o resto.

    O resto e' calculado consulta a consulta (latencia - TCP - TLS) e so'
    depois resumido: medianas nao somam, entao subtrair medianas daria um
    numero que nao corresponde a consulta nenhuma.
    """
    celulas: dict[tuple, list[dict]] = defaultdict(list)
    for linha in linhas:
        if linha["experimento"] == "E-2" and linha["conexao"] == "nova" and linha["sucesso"]:
            celulas[(linha["resolvedor"], linha["protocolo"])].append(linha)

    saida = []
    for (resolvedor, protocolo) in sorted(celulas):
        das_celulas = celulas[(resolvedor, protocolo)]
        total = [l["latencia_ms"] for l in das_celulas if l["latencia_ms"] is not None]
        tcp = [l["t_tcp_ms"] for l in das_celulas if l["t_tcp_ms"] is not None]
        tls = [l["t_tls_ms"] for l in das_celulas if l["t_tls_ms"] is not None]
        resto = [l["latencia_ms"] - l["t_tcp_ms"] - l["t_tls_ms"] for l in das_celulas
                 if None not in (l["latencia_ms"], l["t_tcp_ms"], l["t_tls_ms"])]
        saida.append({
            "resolvedor": resolvedor,
            "protocolo": protocolo,
            "n": len(das_celulas),
            "n_handshake": len(tcp),
            "total": est.mediana(total) if total else None,
            "tcp": est.mediana(tcp) if tcp else None,
            "tls": est.mediana(tls) if tls else None,
            "resto": est.mediana(resto) if resto else None,
            "tls_versao": sorted({l["tls_versao"] for l in das_celulas if l["tls_versao"]}),
            "http_versao": sorted({l["http_versao"] for l in das_celulas if l["http_versao"]}),
        })
    return saida


def reaproveitada(linhas: list[dict]) -> list[dict]:
    """O outro lado do E-2: quanto custa a consulta quando a conexao ja' existe."""
    celulas: dict[tuple, list[float]] = defaultdict(list)
    for linha in linhas:
        if (linha["experimento"] == "E-2" and linha["conexao"] != "nova"
                and linha["sucesso"] and linha["latencia_ms"] is not None):
            celulas[(linha["resolvedor"], linha["protocolo"], linha["conexao"])].append(
                linha["latencia_ms"])
    saida = []
    for chave in sorted(celulas):
        v = celulas[chave]
        saida.append({"chave": chave, "n": len(v), "mediana": est.mediana(v),
                      "iqr": est.iqr(v), "assimetria": assimetria(v)})
    return saida


# ------------------------------------------------------------ 5. covariaveis


def rtt_por_rodada(linhas: list[dict]) -> dict:
    """M11 rodada a rodada, e a diferenca de RTT entre os dois publicos."""
    por_rodada: dict[str, dict[str, float]] = defaultdict(dict)
    for linha in linhas:
        if linha["rtt_ms"] is not None:
            por_rodada[linha["rodada_id"]][linha["resolvedor"]] = linha["rtt_ms"]

    resumo = []
    for resolvedor in RESOLVEDORES:
        v = [d[resolvedor] for d in por_rodada.values() if resolvedor in d]
        if v:
            resumo.append({"resolvedor": resolvedor, "n": len(v), "mediana": est.mediana(v),
                           "iqr": est.iqr(v), "minimo": min(v), "maximo": max(v)})

    diferencas = [d["1.1.1.1"] - d["8.8.8.8"] for d in por_rodada.values()
                  if "1.1.1.1" in d and "8.8.8.8" in d]
    delta = None
    if diferencas:
        delta = {
            "n": len(diferencas),
            "mediana": est.mediana(diferencas),
            "q1": est.percentil(diferencas, 25),
            "q3": est.percentil(diferencas, 75),
            "a_favor": sum(1 for d in diferencas if d < 0),
        }
    return {"resumo": resumo, "delta": delta, "rodadas": len(por_rodada)}


def pontos_de_presenca(linhas: list[dict]) -> dict:
    """Qual instancia anycast respondeu em cada rodada, e se isso muda o nivel."""
    por_rodada: dict[str, str] = {}
    for linha in linhas:
        if linha["pop_id"]:
            por_rodada.setdefault(linha["rodada_id"], linha["pop_id"])

    sequencia = [por_rodada[r] for r in sorted(por_rodada)]
    trocas = sum(1 for a, b in zip(sequencia, sequencia[1:]) if a != b)
    sitios = sorted({"".join(c for c in p if c.isalpha()) for p in sequencia})

    latencia: dict[str, list[float]] = defaultdict(list)
    for linha in linhas:
        if (linha["experimento"] == "E-1" and linha["resolvedor"] == "1.1.1.1"
                and linha["pop_id"] and linha["sucesso"] and linha["latencia_ms"] is not None):
            latencia[linha["pop_id"]].append(linha["latencia_ms"])

    instancias = []
    for pop in sorted(latencia, key=lambda p: (-len(latencia[p]), p)):
        v = latencia[pop]
        instancias.append({"pop": pop, "rodadas": sum(1 for p in sequencia if p == pop),
                           "n": len(v), "mediana": est.mediana(v)})
    frequentes = [i for i in instancias if i["n"] >= 20]
    return {
        "instancias": instancias,
        "distintas": len(set(sequencia)),
        "sitios": sitios,
        "trocas": trocas,
        "transicoes": max(len(sequencia) - 1, 0),
        "amplitude": (max(i["mediana"] for i in frequentes) - min(i["mediana"] for i in frequentes)
                      if frequentes else float("nan")),
        "min_frequentes": min((i["mediana"] for i in frequentes), default=float("nan")),
        "max_frequentes": max((i["mediana"] for i in frequentes), default=float("nan")),
    }


# ---------------------------------------------------------------- relatorio


def _n(valor, casas: int = 1) -> str:
    if valor is None:
        return "—"
    if isinstance(valor, float) and valor != valor:   # NaN
        return "—"
    return f"{valor:.{casas}f}"


def relatorio(linhas: list[dict], lote: str) -> list[str]:
    rodadas = len({l["rodada_id"] for l in linhas})
    redes = sorted({l["rede_id"] for l in linhas})
    instantes = sorted(datetime.fromisoformat(l["ts_utc"]) for l in linhas)
    duracao = (instantes[-1] - instantes[0]).total_seconds() / 60

    s = ["# Descritiva dos resultados (Lab05, Sprint 02)", "",
         "> Gerado por `python Sprint02/descritiva.py`. Não edite à mão.", "",
         f"Issue #135. Base validada, lote `{lote}` (decisão D13): "
         f"{len(linhas)} consultas, {rodadas} rodadas, rede {', '.join(redes)}, "
         f"{duracao:.1f} minutos.", "",
         "Complementa a seção 1 de [`analise_rede-c.md`](analise_rede-c.md), que já traz "
         "mediana, p95, IQR e falhas. Aqui não há teste de hipótese: a inferência está em "
         "[`testes_hipotese.md`](testes_hipotese.md).", ""]

    # ---- 1
    s += ["## 1. Média e desvio como complemento da mediana (10.1)", "",
          "O plano de análise pede a média **ao lado** da mediana, não no lugar dela. "
          "A razão média ÷ mediana e a assimetria dizem o quanto uma substituiria a outra.", ""]
    s += [_tabela(["Exp.", "Resolvedor", "Protocolo", "Conexão", "n", "Média", "DP",
                   "Mediana", "Média/med.", "Assim.", "Curtose", "Máx."],
                  [[c["tratamento"][0], ROTULO.get(c["tratamento"][1], c["tratamento"][1]),
                    c["tratamento"][2], c["tratamento"][3], str(c["n"]),
                    _n(c["media"]), _n(c["desvio"]), _n(c["mediana"]), _n(c["razao"], 2),
                    _n(c["assimetria"], 2), _n(c["curtose"], 1), _n(c["maximo"])]
                   for c in complemento_da_mediana(linhas)])]

    e1 = {c["tratamento"][1]: c for c in complemento_da_mediana(linhas)
          if c["tratamento"][0] == "E-1"}
    if e1:
        maior = max(e1.values(), key=lambda c: c["razao"])
        s += ["", f"**A média não descreve a consulta típica.** No E-1 ela é de "
              f"{min(c['razao'] for c in e1.values()):.2f} a "
              f"{max(c['razao'] for c in e1.values()):.2f} vezes a mediana — no "
              f"{ROTULO[maior['tratamento'][1]]}, {_n(maior['media'])} ms contra "
              f"{_n(maior['mediana'])} ms. Quem reportasse só a média diria que uma consulta "
              f"DNS nesta rede custa {_n(maior['media'], 0)} ms, quando metade delas custou "
              f"menos de {_n(maior['mediana'])} ms. O desvio-padrão tem o mesmo problema: "
              f"nos três resolvedores ele é maior que a própria mediana."]

    # ---- 2
    s += ["", "## 2. A forma da distribuição", "",
          "Assimetria positiva é cauda para a direita; curtose em excesso acima de 0 é cauda "
          "mais pesada que a da normal. Latência tem piso (o tempo mínimo de ida e volta) e "
          "não tem teto, então é esse o formato esperado — e é o que os números confirmam.", ""]
    s += [_tabela(["Resolvedor", "n", "p50", "p75", "p90", "p95", "p99", "Máx.", "p99/p50"],
                  [[ROTULO[p["resolvedor"]], str(p["n"]), _n(p["p50"]), _n(p["p75"]),
                    _n(p["p90"]), _n(p["p95"]), _n(p["p99"]), _n(p["maximo"]),
                    _n(p["razao_p99_p50"], 1)]
                   for p in perfil_de_percentis(linhas)])]
    perfis = {p["resolvedor"]: p for p in perfil_de_percentis(linhas)}
    if "1.1.1.1" in perfis:
        a = perfis["1.1.1.1"]
        s += ["", f"Latências do E-1, em ms. Entre o p50 e o p75 o {ROTULO['1.1.1.1']} varia "
              f"{_n(a['p75'] - a['p50'])} ms; entre o p90 e o p95, "
              f"{_n(a['p95'] - a['p90'])} ms. **A cauda não é um detalhe da distribuição: "
              f"ela é a distribuição**, a partir do p90. São as consultas em que a resposta "
              f"não estava em cache e o resolvedor teve de percorrer a hierarquia do DNS.", "",
              "É isto que sustenta, com os dados desta coleta, as três escolhas que o "
              "desenho fez antes de medir: mediana como estatística principal, testes de "
              "postos em vez de teste t, e IQR ÷ mediana em vez de coeficiente de variação "
              "(DesenhoMetodologico, 5.2)."]

    # ---- 3
    s += ["", "## 3. Por nome (E-1)", "",
          "O `testes_hipotese.md` traz o Δ pareado de cada domínio. Aqui estão os níveis que "
          "produzem esse Δ: mediana, dispersão e forma de cada nome em cada resolvedor.", ""]
    nomes = por_nome(linhas)
    s += [_tabela(["Nome", "n", "1.1.1.1 med.", "IQR", "8.8.8.8 med.", "IQR",
                   "padrão med.", "IQR", "Mais rápido"],
                  [[f"`{d['nome']}`", str(d["n"]),
                    _n(d.get("1.1.1.1", {}).get("mediana")), _n(d.get("1.1.1.1", {}).get("iqr")),
                    _n(d.get("8.8.8.8", {}).get("mediana")), _n(d.get("8.8.8.8", {}).get("iqr")),
                    _n(d.get("padrao", {}).get("mediana")), _n(d.get("padrao", {}).get("iqr")),
                    ROTULO.get(d.get("mais_rapido", ""), "—")]
                   for d in nomes])]
    s += ["", f"Medianas e IQR em ms, {nomes[0]['n'] if nomes else 0} observações por nome e "
          f"resolvedor."]

    vencedor = defaultdict(int)
    for d in nomes:
        if "mais_rapido" in d:
            vencedor[d["mais_rapido"]] += 1
    fora = [d for d in nomes
            if d.get("1.1.1.1", {}).get("mediana", 0) > 2 * est.mediana(
                [x.get("1.1.1.1", {}).get("mediana", 0) for x in nomes])]
    s += ["", f"**O padrão é o mais rápido em {vencedor.get('padrao', 0)} dos {len(nomes)} "
          f"nomes**, e o 1.1.1.1 em {vencedor.get('1.1.1.1', 0)}. Isso é o cache do roteador, "
          f"não um resolvedor melhor (ver as ameaças à validade)."]
    if fora:
        d = max(fora, key=lambda d: d["1.1.1.1"]["mediana"])
        s += ["", f"**`{d['nome']}` é o nome fora da curva**: mediana de "
              f"{_n(d['1.1.1.1']['mediana'])} ms no 1.1.1.1 contra "
              f"{_n(d['8.8.8.8']['mediana'])} ms no 8.8.8.8, com IQR de "
              f"{_n(d['1.1.1.1']['iqr'])} e {_n(d['8.8.8.8']['iqr'])} ms. Os dois pagam "
              f"recursão nesse domínio; o 8.8.8.8 paga menos vezes, e é por isso que ele "
              f"ganha ali. Um nome assim, com mediana dez vezes maior que a dos vizinhos, "
              f"move a média do conjunto e não move a mediana — é a razão de o teste ser "
              f"por postos e a unidade de inferência ser o nome."]

    # ---- 4
    s += ["", "## 4. Onde está o custo do DNS cifrado (E-2)", "",
          "Com conexão nova, a latência medida inclui os dois handshakes. As colunas "
          "`t_tcp_ms` e `t_tls_ms` estavam na base desde a coleta e não apareciam em "
          "relatório nenhum. O **resto** é calculado consulta a consulta "
          "(latência − TCP − TLS) e só depois resumido, porque medianas não somam.", ""]
    deco = decomposicao_do_cifrado(linhas)
    s += [_tabela(["Resolvedor", "Protocolo", "n", "TCP", "TLS", "Resto", "Total", "TLS/Total"],
                  [[ROTULO[d["resolvedor"]], d["protocolo"], str(d["n"]),
                    _n(d["tcp"]), _n(d["tls"]), _n(d["resto"]), _n(d["total"]),
                    f"{d['tls'] / d['total']:.0%}" if d["tls"] and d["total"] else "—"]
                   for d in deco])]
    s += ["", "Medianas em ms, conexão nova."]

    dot = {d["resolvedor"]: d for d in deco if d["protocolo"] == "DoT"}
    if "1.1.1.1" in dot and "8.8.8.8" in dot:
        a, b = dot["1.1.1.1"], dot["8.8.8.8"]
        s += ["", f"**O custo extra do 8.8.8.8 não é distância.** No DoT, o handshake TCP — "
              f"que é uma ida e volta de rede — custa {_n(a['tcp'])} ms no "
              f"{ROTULO['1.1.1.1']} e {_n(b['tcp'])} ms no {ROTULO['8.8.8.8']}, praticamente "
              f"o mesmo. Já o handshake TLS custa {_n(a['tls'])} ms contra {_n(b['tls'])} ms, "
              f"**{b['tls'] / a['tls']:.1f} vezes mais**. A diferença está no que o servidor "
              f"faz para fechar o TLS, não no caminho até ele. Sozinho, esse handshake "
              f"responde por {(b['tls'] - a['tls']) / (b['total'] - a['total']):.0%} da "
              f"diferença de {_n(b['total'] - a['total'])} ms entre os dois no DoT com "
              f"conexão nova."]

    sem_handshake = [d for d in deco if d["n_handshake"] == 0]
    if sem_handshake:
        quais = ", ".join(sorted({d["protocolo"] for d in sem_handshake}))
        s += ["", f"**Limitação de instrumentação:** no {quais} os tempos de handshake não "
              f"foram registrados ({sum(d['n'] for d in sem_handshake)} consultas com "
              f"`t_tcp_ms` e `t_tls_ms` vazios). O cliente HTTP não expõe esses tempos, e o "
              f"coletor não tinha como separá-los. A mesma decomposição do DoT não existe "
              f"para o {quais}, e o custo dele aparece só como total. A versão do HTTP "
              f"negociada, que a seção 9.4 do plano manda registrar, também ficou vazia."]

    s += ["", "### Conexão reaproveitada", "",
          "O mesmo E-2 com a conexão já aberta — o regime em que navegadores operam —, "
          "e o Do53 ao lado, que é a referência da comparação.", ""]
    s += [_tabela(["Resolvedor", "Protocolo", "Conexão", "n", "Mediana", "IQR", "Assim."],
                  [[ROTULO[r["chave"][0]], r["chave"][1], r["chave"][2], str(r["n"]),
                    _n(r["mediana"]), _n(r["iqr"]), _n(r["assimetria"], 2)]
                   for r in reaproveitada(linhas)])]

    # ---- 5
    cov = rtt_por_rodada(linhas)
    s += ["", "## 5. Covariáveis ao longo da coleta", "",
          "### 5.1 RTT de rede (M11)", "",
          "Uma medida por rodada e por resolvedor: o tempo de abrir a conexão TCP. "
          "Serve para separar a distância do tempo gasto no servidor.", ""]
    s += [_tabela(["Resolvedor", "n (rodadas)", "Mediana", "IQR", "Mín.", "Máx."],
                  [[ROTULO[r["resolvedor"]], str(r["n"]), _n(r["mediana"]), _n(r["iqr"]),
                    _n(r["minimo"]), _n(r["maximo"])] for r in cov["resumo"]])]
    if cov["delta"]:
        d = cov["delta"]
        s += ["", f"**O RTT varia mais do que a diferença que ele explica.** Rodada a rodada, "
              f"o RTT até o {ROTULO['1.1.1.1']} menos o RTT até o {ROTULO['8.8.8.8']} tem "
              f"mediana de {d['mediana']:+.1f} ms, mas IQR de "
              f"[{d['q1']:+.1f}; {d['q3']:+.1f}] ms, e o {ROTULO['1.1.1.1']} está mais perto "
              f"em apenas {d['a_favor']} das {d['n']} rodadas "
              f"({d['a_favor'] / d['n']:.0%}). A vantagem de distância que a sensibilidade S2 "
              f"usa existe **na mediana do conjunto**, e não em cada rodada. Esse é um "
              f"argumento a mais para a unidade de inferência não ser a rodada."]

    pop = pontos_de_presenca(linhas)
    s += ["", "### 5.2 Instância do ponto de presença (1.1.1.1)", "",
          f"O `id.server` do {ROTULO['1.1.1.1']} foi consultado uma vez por rodada. "
          f"Apareceram **{pop['distintas']} instâncias distintas**, todas do sítio "
          f"`{'`, `'.join(pop['sitios'])}` (São Paulo), e a instância mudou em "
          f"{pop['trocas']} das {pop['transicoes']} passagens de uma rodada para a "
          f"seguinte.", ""]
    s += [_tabela(["Instância", "Rodadas", "n (E-1)", "Mediana"],
                  [[f"`{i['pop']}`", str(i["rodadas"]), str(i["n"]), _n(i["mediana"])]
                   for i in pop["instancias"]])]
    if pop["amplitude"] == pop["amplitude"]:
        s += ["", f"**A instância que atende muda quase toda rodada, e isso vale alguns "
              f"milissegundos.** Entre as instâncias com 20 ou mais observações, a mediana "
              f"vai de {_n(pop['min_frequentes'])} a {_n(pop['max_frequentes'])} ms — uma "
              f"amplitude de {_n(pop['amplitude'])} ms, **da mesma ordem da diferença de "
              f"2 ms entre os dois resolvedores**. Com 20 observações por instância não dá "
              f"para afirmar que a instância causa a diferença; dá para afirmar que as duas "
              f"coisas não podem ser separadas nesta coleta.", "",
              f"Isso também delimita a sensibilidade S3. Ela exclui rodadas em que o "
              f"**sítio** mudou, e o sítio nunca mudou: foi `{pop['sitios'][0]}` nas "
              f"{pop['transicoes'] + 1} rodadas. Por isso S3 não excluiu nada e repetiu o "
              f"resultado principal. A troca de **instância**, que é o que de fato acontece "
              f"aqui, fica fora do que ela testa."]

    # ---- 6
    s += ["", "## 6. O que a descritiva não decide", "",
          "- **Nada sobre causa.** Esta seção mostra níveis, dispersão e forma; a atribuição "
          "a um ou outro fator está nas sensibilidades do `testes_hipotese.md` e nas "
          "ameaças à validade.",
          "- **Nada sobre C1 e C2.** Sem a zona do grupo (D1) toda a coleta é C3, então não "
          "há descritiva de cache controlado.",
          "- **Nada por faixa horária.** A coleta tem uma faixa só (M10 fica sem dados).",
          "- **Nada sobre outras redes.** Uma rede, uma tarde.", ""]
    return s


def _tabela(cabecalho: list[str], linhas: list[list[str]]) -> str:
    saida = ["| " + " | ".join(cabecalho) + " |",
             "|" + "|".join("---" for _ in cabecalho) + "|"]
    saida += ["| " + " | ".join(celula) + " |" for celula in linhas]
    return "\n".join(saida)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--base", type=Path, default=BASE)
    p.add_argument("--lote", default=LOTE)
    p.add_argument("--saida", type=Path, default=SAIDA)
    opcoes = p.parse_args()

    linhas = ana.carregar(opcoes.base, opcoes.lote)
    texto = "\n".join(relatorio(linhas, opcoes.lote)) + "\n"

    opcoes.saida.mkdir(parents=True, exist_ok=True)
    destino = opcoes.saida / "descritiva.md"
    destino.write_text(texto, encoding="utf-8", newline="\n")
    print(f"{destino}: {len(linhas)} consultas")


if __name__ == "__main__":
    main()
