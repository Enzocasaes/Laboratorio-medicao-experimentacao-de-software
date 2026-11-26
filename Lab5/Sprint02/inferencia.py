"""Testes de hipotese e tamanho do efeito (Lab05, Sprint 02, issue #136).

O `analise.py` da Sprint 01 ja' roda o Friedman, o Wilcoxon com Holm e o
bootstrap por conglomerado. Este script parte dele e fecha o que o plano de
analise pede e ainda nao estava calculado:

1. **Veredito de cada hipotese** (ProtocoloExperimental, 3.1), pela regra R1:
   a hipotese direcional so' e' *sustentada* com p (Holm) < 0,05 **e** o sinal
   de Δ previsto. A H-c2 segue a R2: o IC 95% de Δ inteiro dentro de ±5 ms.
2. **Tamanho do efeito completo (M4 e M5)**: r do Wilcoxon com rotulo, delta de
   Cliff com os limiares de Romano et al., W de Kendall para o Friedman, Δ
   relativo e a taxa de vitoria com IC por bootstrap por conglomerado (o M5
   pede esse IC, e a Sprint 01 so' dava a contagem).
3. **Δ por nome** (C3): mostra em quais dominios cada resolvedor ganha.
4. **E-2 exploratorio por rodada.** A unidade pre-registrada do E-2 e' a janela
   de 6 h, e a coleta da D13 cabe numa janela so': nao ha' teste
   confirmatorio. Aqui a rodada vira a unidade, **como desvio declarado**: as
   rodadas estao a 10 s uma da outra e nao sao independentes, entao o
   resultado e' indicativo, nao confirma H-c1 nem H-c2.
5. **Analises de sensibilidade** da secao 10.6, sobre a familia E-1.

Le a base validada (#134), lote `provisoria` (decisao D13). Biblioteca padrao
apenas; bootstrap semeado, entao a saida e' identica a cada execucao e a CI
confere isso com `diff`.

Uso (a partir de Lab5/):

    python Sprint02/inferencia.py                      # grava em Sprint02/resultados/
    python Sprint02/inferencia.py --replicas 200 --saida /tmp/x   # rapido, para teste
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable

LAB5 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import analise as ana  # noqa: E402
import estatistica as est  # noqa: E402

BASE = LAB5 / "Sprint02" / "base_validada" / "consultas.csv.gz"
LOTE = "provisoria"
SAIDA = LAB5 / "Sprint02" / "resultados"

ALFA = 0.05
MARGEM_HC2_MS = 5.0          # R2: "poucos ms" fixado antes da coleta
TIMEOUT_MS = 2000.0          # censura da secao 10.4
MIN_UNIDADES = 5             # abaixo disso o Wilcoxon exato nao alcanca p < 0,05

ALVO = "1.1.1.1"
FAMILIA_E1 = ("8.8.8.8", "padrao")
CONDICOES_E2 = (("DoT", "nova"), ("DoT", "reaproveitada"),
                ("DoH", "nova"), ("DoH", "reaproveitada"))


# ---------------------------------------------------------------- pares


Unidade = Callable[[dict], str]


def unidade_rodada(linha: dict) -> str:
    """Unidade do E-2 exploratorio: a rodada (desvio declarado da 10.2)."""
    return f"rodada:{linha['rodada_id']}"


def rotulo(linha: dict) -> str:
    if linha["experimento"] == "E-1":
        return linha["resolvedor"]
    return f"{linha['resolvedor']}|{linha['protocolo']}|{linha['conexao']}"


def pares(linhas: list[dict], experimento: str, alvo: str, comparador: str,
          unidade: Unidade = ana.unidade_de_inferencia,
          incluir_falhas: bool = False) -> dict[str, list[tuple[dict, dict]]]:
    """Pares (linha do alvo, linha do comparador) no mesmo bloco, por unidade.

    O bloco e' o mesmo do `analise.blocos` (rede x rodada x posicao x
    condicao). Guardar as linhas inteiras, e nao so' a latencia, e' o que
    permite as sensibilidades: ajustar pelo RTT ou filtrar por sinalizacao
    sem reescrever o pareamento.
    """
    blocos: dict[tuple, dict[str, dict]] = defaultdict(dict)
    for linha in linhas:
        if linha["experimento"] != experimento:
            continue
        if not linha["sucesso"] and not incluir_falhas:
            continue
        chave = (linha["rede_id"], linha["rodada_id"], ana._posicao(linha),
                 linha["condicao_cache"])
        blocos[chave][rotulo(linha)] = linha
    por_unidade: dict[str, list[tuple[dict, dict]]] = defaultdict(list)
    for chave in sorted(blocos):
        bloco = blocos[chave]
        if alvo in bloco and comparador in bloco:
            por_unidade[unidade(bloco[alvo])].append((bloco[alvo], bloco[comparador]))
    return dict(sorted(por_unidade.items()))


def latencia(linha: dict) -> float:
    """M1, com a censura da 10.4 para as falhas (so' entram na sensibilidade 4)."""
    return linha["latencia_ms"] if linha["sucesso"] else TIMEOUT_MS


def delta_bruto(a: dict, b: dict) -> float:
    return latencia(a) - latencia(b)


def delta_sem_rtt(a: dict, b: dict) -> float:
    """Sensibilidade 2: tira de cada lado o RTT de rede da rodada (M11).

    O que sobra aproxima o tempo do servidor, separando "fica mais perto" de
    "responde mais rapido".
    """
    return (latencia(a) - (a["rtt_ms"] or 0.0)) - (latencia(b) - (b["rtt_ms"] or 0.0))


# ------------------------------------------------------------ efeitos


def rotulo_r(r: float) -> str:
    """Limiares de Cohen para r, os mesmos do Lab02."""
    if r < 0.1:
        return "desprezivel"
    if r < 0.3:
        return "pequeno"
    if r < 0.5:
        return "medio"
    return "grande"


def kendall_w(teste: est.Friedman) -> float:
    """W de Kendall = Q / (n (k − 1)): o tamanho de efeito do Friedman."""
    return teste.estatistica / (teste.n * (teste.k - 1))


def _taxa(deltas: list[float]) -> float:
    v = ana.taxa_de_vitoria(deltas)
    return v["taxa"] if v["taxa"] is not None else float("nan")


def medir(por_unidade: dict[str, list[tuple[dict, dict]]],
          delta: Callable[[dict, dict], float] = delta_bruto,
          replicas: int = ana.REPLICAS_BOOTSTRAP) -> dict | None:
    """M3, M4 e M5 de um par de tratamentos, sobre as unidades dadas."""
    if not por_unidade:
        return None
    deltas = {u: [delta(a, b) for a, b in ps] for u, ps in por_unidade.items()}
    planos = [d for ds in deltas.values() for d in ds]
    comparador_planos = [latencia(b) for ps in por_unidade.values() for _, b in ps]
    base = est.mediana(comparador_planos)
    resultado = {
        "unidades": len(deltas),
        "pares": len(planos),
        "delta_ms": est.mediana(planos),
        "mediana_comparador_ms": base,
        "delta_relativo": est.mediana(planos) / base if base else None,
        "vitoria": ana.taxa_de_vitoria(planos),
        "ic95": None, "vitoria_ic95": None, "wilcoxon": None,
        "r": None, "r_rotulo": None, "cliff": None, "cliff_rotulo": None,
    }
    if len(deltas) < 2:
        return resultado

    unidades = list(deltas.values())
    _, inf, sup = est.bootstrap_conglomerado(
        unidades, est.mediana, replicas=replicas, semente=ana.SEMENTE_BOOTSTRAP)
    _, vinf, vsup = est.bootstrap_conglomerado(
        unidades, _taxa, replicas=replicas, semente=ana.SEMENTE_BOOTSTRAP)
    medianas = [est.mediana(d) for d in unidades]
    teste = est.wilcoxon_pareado(medianas)
    # M4(b): Cliff sobre as medianas por unidade de cada tratamento
    alvo_med = [est.mediana([latencia(a) for a, _ in ps]) for ps in por_unidade.values()]
    comp_med = [est.mediana([latencia(b) for _, b in ps]) for ps in por_unidade.values()]
    cliff, cliff_rot = est.cliff_delta(alvo_med, comp_med)
    resultado.update({
        "ic95": (inf, sup), "vitoria_ic95": (vinf, vsup),
        "mediana_das_medianas_ms": est.mediana(medianas),
        "wilcoxon": teste, "r": teste.r, "r_rotulo": rotulo_r(teste.r),
        "cliff": cliff, "cliff_rotulo": cliff_rot,
    })
    return resultado


def aplicar_holm(resultados: dict[str, dict | None]) -> None:
    testaveis = {k: r["wilcoxon"].p_valor for k, r in resultados.items()
                 if r and r["wilcoxon"]}
    ajustados = est.holm(testaveis) if testaveis else {}
    for chave, r in resultados.items():
        if r is not None:
            r["p_holm"] = ajustados.get(chave)


# ----------------------------------------------------------- familias


def familia_e1(linhas: list[dict], delta=delta_bruto, incluir_falhas=False,
               replicas=ana.REPLICAS_BOOTSTRAP) -> dict[str, dict | None]:
    """{1.1.1.1 × 8.8.8.8, 1.1.1.1 × padrao} em C3, com Holm na familia."""
    c3 = [l for l in linhas if l["condicao_cache"] == "C3"]
    resultados = {
        comp: medir(pares(c3, "E-1", ALVO, comp, incluir_falhas=incluir_falhas),
                    delta, replicas)
        for comp in FAMILIA_E1
    }
    aplicar_holm(resultados)
    return resultados


def familia_e2(linhas: list[dict], resolvedor: str, unidade: Unidade,
               replicas=ana.REPLICAS_BOOTSTRAP) -> dict[str, dict | None]:
    """{DoT, DoH} × {nova, reaproveitada} contra o Do53, Holm por resolvedor."""
    base = f"{resolvedor}|Do53|unica"
    resultados = {
        f"{p} {c}": medir(pares(linhas, "E-2", f"{resolvedor}|{p}|{c}", base, unidade),
                          replicas=replicas)
        for p, c in CONDICOES_E2
    }
    aplicar_holm(resultados)
    return resultados


def delta_por_nome(linhas: list[dict]) -> dict[str, dict[str, dict]]:
    """Δ mediano por nome em C3: a leitura "em quais dominios" da secao 2 do
    PlanoDeAnalise, que o agregado esconde."""
    saida: dict[str, dict[str, dict]] = {}
    for comp in FAMILIA_E1:
        por_nome = {}
        for unidade, ps in pares(linhas, "E-1", ALVO, comp).items():
            ds = [delta_bruto(a, b) for a, b in ps]
            v = ana.taxa_de_vitoria(ds)
            por_nome[unidade.split(":", 1)[1]] = {
                "pares": len(ds), "delta_ms": est.mediana(ds),
                "q1_ms": est.percentil(ds, 25), "q3_ms": est.percentil(ds, 75),
                "vitorias": v["vitorias"], "derrotas": v["derrotas"],
                "ttl_mediano": est.mediana([a["ttl"] for a, _ in ps if a["ttl"] is not None])
                if any(a["ttl"] is not None for a, _ in ps) else None,
            }
        saida[comp] = por_nome
    return saida


# -------------------------------------------------------- sensibilidade


def marcar_autoaquecimento(linhas: list[dict]) -> None:
    """Sensibilidade 1: a consulta anterior do grupo ainda estava no cache?

    A 10.6 compara o tempo desde a ultima consulta com o TTL **autoritativo**,
    que depende da zona do grupo (D1) e nao existe no modo B. A aproximacao
    usada: o TTL que o **mesmo resolvedor devolveu na consulta anterior** ao
    mesmo nome. Se o intervalo for menor, a resposta anterior ainda estava
    valida no cache — quem a aqueceu foi o proprio experimento.
    """
    serie: dict[tuple, list[dict]] = defaultdict(list)
    for linha in linhas:
        if linha["experimento"] == "E-1":
            serie[(linha["rede_id"], linha["resolvedor"], linha["nome"])].append(linha)
    for grupo in serie.values():
        grupo.sort(key=lambda l: l["ts_utc"])
        anterior = None
        for linha in grupo:
            linha["autoaquecida"] = bool(
                anterior is not None and anterior["ttl"] is not None
                and linha["s_desde_ultima_consulta"] is not None
                and linha["s_desde_ultima_consulta"] < anterior["ttl"])
            anterior = linha


def tem_sinal(linha: dict, codigo: str) -> bool:
    return codigo in (linha.get("sinalizacoes") or "").split(";")


def cenarios(linhas: list[dict]) -> list[dict]:
    """As cinco sensibilidades da 10.6, mais a dos discrepantes (#134, secao 5)."""
    marcar_autoaquecimento(linhas)
    pop = [l for l in linhas if tem_sinal(l, "pop_mudou")]
    falhas = [l for l in linhas if not l["sucesso"]]
    return [
        {"id": "P", "nome": "Análise principal", "linhas": linhas,
         "delta": delta_bruto, "falhas": False, "nota": ""},
        {"id": "S1", "nome": "Sem consultas autoaquecidas", "falhas": False,
         "linhas": [l for l in linhas if not l.get("autoaquecida")],
         "delta": delta_bruto,
         "nota": "TTL da consulta anterior no lugar do TTL autoritativo (D1)"},
        {"id": "S2", "nome": "Descontando o RTT de rede (M11)", "linhas": linhas,
         "delta": delta_sem_rtt, "falhas": False, "nota": ""},
        {"id": "S3", "nome": "Sem rodadas com troca de sítio do 1.1.1.1",
         "linhas": [l for l in linhas if not tem_sinal(l, "pop_mudou")],
         "delta": delta_bruto, "falhas": False,
         "nota": f"{len({l['rodada_id'] for l in pop})} rodadas com troca de sítio"},
        {"id": "S4", "nome": "Timeouts como 2.000 ms", "linhas": linhas,
         "delta": delta_bruto, "falhas": True,
         "nota": f"{len(falhas)} falhas na base"},
        {"id": "S5", "nome": "Sem o estrato sujeito ao viés da lista", "linhas": None,
         "delta": None, "falhas": False,
         "nota": "não se aplica: a lista do piloto não tem estratos (L1 pendente)"},
        {"id": "S6", "nome": "Sem latências discrepantes",
         "linhas": [l for l in linhas if not tem_sinal(l, "latencia_discrepante")],
         "delta": delta_bruto, "falhas": False,
         "nota": "discrepantes sinalizados na validação (#134)"},
    ]


# ------------------------------------------------------------- veredito


def veredito_direcional(r: dict | None, sinal_previsto: int) -> str:
    """R1: bilateral, e so' sustentada com p (Holm) < α e o sinal previsto."""
    if r is None or r["wilcoxon"] is None:
        return "não testável"
    if r["p_holm"] >= ALFA:
        return "não sustentada (sem diferença significativa)"
    sinal = 1 if r["delta_ms"] > 0 else -1
    if sinal == sinal_previsto:
        return "sustentada"
    return "refutada (diferença significativa no sentido oposto)"


def veredito_equivalencia(r: dict | None, margem: float = MARGEM_HC2_MS) -> str:
    """R2: IC 95% de Δ inteiro dentro de ±margem."""
    if r is None or r["ic95"] is None:
        return "não testável"
    inf, sup = r["ic95"]
    if -margem <= inf and sup <= margem:
        return "sustentada"
    if inf > margem or sup < -margem:
        return "refutada (IC inteiro fora da margem)"
    return "inconclusiva (IC cruza a margem)"


# -------------------------------------------------------------- execucao


def robustez(sensibilidade: list[dict]) -> str:
    """Em quais cenarios da 10.6 o veredito da H-a se mantem."""
    mantem, cai = [], []
    for c in sensibilidade:
        if c["id"] == "P" or c["resultados"] is None:
            continue
        r = c["resultados"]["8.8.8.8"]
        (mantem if veredito_direcional(r, -1) == "sustentada" else cai).append(c["id"])
    return (f"sensibilidade: mantida em {', '.join(mantem) or 'nenhum'}; "
            f"cai em {', '.join(cai) or 'nenhum'} (seção 4)")


def executar(linhas: list[dict], replicas: int = ana.REPLICAS_BOOTSTRAP) -> dict:
    e1_principal = familia_e1(linhas, replicas=replicas)
    friedman = ana.friedman_resolvedores(linhas, "C3")
    e2_confirmatorio = {r: familia_e2(linhas, r, ana.unidade_de_inferencia, replicas)
                        for r in ("1.1.1.1", "8.8.8.8")}
    e2_exploratorio = {r: familia_e2(linhas, r, unidade_rodada, replicas)
                       for r in ("1.1.1.1", "8.8.8.8")}

    sensibilidade = []
    for c in cenarios(linhas):
        if c["linhas"] is None:
            sensibilidade.append({"id": c["id"], "nome": c["nome"],
                                  "nota": c["nota"], "resultados": None})
            continue
        res = (e1_principal if c["id"] == "P" else
               familia_e1(c["linhas"], c["delta"], c["falhas"], replicas))
        sensibilidade.append({"id": c["id"], "nome": c["nome"], "nota": c["nota"],
                              "consultas_e1": sum(1 for l in c["linhas"]
                                                  if l["experimento"] == "E-1"),
                              "resultados": res})

    def exploratorios(familias: dict, conexao: str, regra) -> list[str]:
        # "sustentada" fica reservado ao confirmatorio; aqui e' so' indicio
        return [f"{res} {chave}: {regra(r).replace('sustentada', 'indício a favor')}"
                for res, fam in familias.items()
                for chave, r in fam.items() if chave.endswith(conexao)]

    vereditos = [
        {"id": "H-a", "papel": "Primária", "regra": "R1 (Wilcoxon bilateral, Holm, sinal previsto Δ < 0)",
         "resultado": veredito_direcional(e1_principal["8.8.8.8"], -1),
         "exploratorio": robustez(sensibilidade)},
        {"id": "H-b", "papel": "Exploratória (R3, modo B)", "regra": "precisa de C1 e C2",
         "resultado": "não testável",
         "exploratorio": "sem a zona (D1) não há C1 nem C2, e a lista não tem estratos; "
                         "em C3 o padrão é o mais rápido (seção 2)"},
        {"id": "H-c1", "papel": "Secundária", "regra": "R1 por janela de 6 h, sinal previsto Δ > 0",
         "resultado": "não testável (1 janela de 6 h)",
         "exploratorio": "; ".join(exploratorios(e2_exploratorio, "nova",
                                        lambda r: veredito_direcional(r, +1)))},
        {"id": "H-c2", "papel": "Primária", "regra": f"R2: IC 95% dentro de ±{MARGEM_HC2_MS:.0f} ms",
         "resultado": "não testável (1 janela de 6 h)",
         "exploratorio": "; ".join(exploratorios(e2_exploratorio, "reaproveitada",
                                        veredito_equivalencia))},
    ]
    return {
        "friedman": friedman, "e1": e1_principal, "por_nome": delta_por_nome(linhas),
        "e2_confirmatorio": e2_confirmatorio, "e2_exploratorio": e2_exploratorio,
        "sensibilidade": sensibilidade, "vereditos": vereditos,
        "consultas": len(linhas), "rodadas": len({l["rodada_id"] for l in linhas}),
        "replicas": replicas,
    }


# -------------------------------------------------------------- relatorio


def _f(valor, casas=1, sinal=True) -> str:
    if valor is None or (isinstance(valor, float) and math.isnan(valor)):
        return "—"
    return f"{valor:+.{casas}f}" if sinal else f"{valor:.{casas}f}"


def _p(valor) -> str:
    if valor is None:
        return "—"
    return f"{valor:.4f}" if valor >= 1e-4 else f"{valor:.1e}"


def _ic(par, casas=1) -> str:
    return "—" if par is None else f"[{_f(par[0], casas)}; {_f(par[1], casas)}]"


def _nome(resolvedor: str) -> str:
    return "padrão" if resolvedor == "padrao" else resolvedor


def _pct(valor) -> str:
    return "—" if valor is None or math.isnan(valor) else f"{100 * valor:.0f}%"


def _vitoria(r: dict) -> str:
    v = r["vitoria"]
    decididos = v["vitorias"] + v["derrotas"]
    texto = f"{_pct(v['taxa'])} ({v['vitorias']}/{decididos})"
    if r["vitoria_ic95"]:
        texto += f" [{_pct(r['vitoria_ic95'][0])}; {_pct(r['vitoria_ic95'][1])}]"
    return texto


def linha_comparacao(nome: str, r: dict | None) -> str:
    if r is None:
        return f"| {nome} | 0 | — | — | — | — | — | — | — | — | — |"
    w = r["wilcoxon"]
    return (f"| {nome} | {r['unidades']} | {_f(r['delta_ms'])} | {_ic(r['ic95'])} "
            f"| {_f(100 * r['delta_relativo'], 0) + '%' if r['delta_relativo'] is not None else '—'} "
            f"| {_p(w.p_valor) if w else '—'} | {_p(r.get('p_holm'))} "
            f"| {_f(r['r'], 2, False)} {r['r_rotulo'] or ''} "
            f"| {_f(r['cliff'], 2)} {r['cliff_rotulo'] or ''} | {_vitoria(r)} |")


CABECALHO = [
    "| Comparação | Unid. | Δ mediano (ms) | IC 95% | Δ relativo | p (Wilcoxon) | p (Holm) | r | δ de Cliff | Vitórias [IC 95%] |",
    "|---|---|---|---|---|---|---|---|---|---|",
]


def relatorio(res: dict) -> list[str]:
    s: list[str] = [
        "# Lab05 — Testes de hipótese e tamanho do efeito (Sprint 02)",
        "",
        "> Gerado por `python Sprint02/inferencia.py` (issue #136). **Não editar à mão.**",
        f"> Base validada, lote `{LOTE}` (decisão D13): {res['consultas']} consultas, "
        f"{res['rodadas']} rodadas, rede-c. Bootstrap por conglomerado com "
        f"{res['replicas']} réplicas, semente {ana.SEMENTE_BOOTSTRAP}.",
        "",
        "Como ler as colunas: **Δ** = latência do primeiro tratamento − a do segundo, "
        "pareada no bloco (rodada × nome). **Δ relativo** = Δ ÷ mediana do segundo. "
        "**r** = |Z|/√n do Wilcoxon (Cohen: 0,1 / 0,3 / 0,5). **δ de Cliff** sobre as "
        "medianas por unidade, > 0 quando o primeiro tende a ser mais rápido "
        "(Romano: 0,147 / 0,33 / 0,474). **Vitórias** = blocos em que o primeiro foi "
        f"mais rápido por mais de {ana.EPSILON_EMPATE_MS:.0f} ms, entre os decididos, "
        "com IC por bootstrap por conglomerado (M5).",
        "",
        "## 1. Vereditos",
        "",
        "Regra R1 (ProtocoloExperimental, 3.2): teste bilateral; a hipótese só é "
        "**sustentada** com p (Holm) < 0,05 **e** o sinal previsto. Regra R2 (H-c2): "
        f"IC 95% de Δ inteiro dentro de ±{MARGEM_HC2_MS:.0f} ms.",
        "",
        "| Hipótese | Papel | Critério | Resultado confirmatório | Leitura exploratória |",
        "|---|---|---|---|---|",
    ]
    for v in res["vereditos"]:
        s.append(f"| **{v['id']}** | {v['papel']} | {v['regra']} | **{v['resultado']}** "
                 f"| {v['exploratorio'] or '—'} |")

    f = res["friedman"]
    s += ["", "## 2. E-1 — resolvedores em Do53, condição C3 (Q1)", ""]
    if f:
        postos = ", ".join(f"{_nome(r)} = {p:.2f}" for r, p in sorted(f.postos_medios.items()))
        s += [f"**Friedman** sobre {f.n} nomes: Q = {f.estatistica:.3f}, gl = {f.gl}, "
              f"p = {_p(f.p_valor)}; **W de Kendall = {kendall_w(f):.2f}** "
              f"(concordância entre os nomes na ordem dos resolvedores). "
              f"Postos médios (1 = mais rápido): {postos}.", ""]
    s += ["Família de Holm: as duas comparações abaixo (ProtocoloExperimental, 3.2).", ""]
    s += CABECALHO
    for comp in FAMILIA_E1:
        s.append(linha_comparacao(f"1.1.1.1 − {_nome(comp)}", res["e1"][comp]))
    s += ["", "Δ negativo = o 1.1.1.1 respondeu mais rápido.", ""]

    s += ["### 2.1 Δ por nome", "",
          "Mediana de Δ nas 20 rodadas de cada nome, com o intervalo interquartil. "
          "O agregado acima pode esconder nomes em que a ordem se inverte.", "",
          "| Nome | TTL mediano (s) | 1.1.1.1 − 8.8.8.8 (ms) | [Q1; Q3] | V/D | 1.1.1.1 − padrão (ms) | [Q1; Q3] | V/D |",
          "|---|---|---|---|---|---|---|---|"]
    a, b = res["por_nome"]["8.8.8.8"], res["por_nome"]["padrao"]
    for nome in sorted(a, key=lambda n: a[n]["delta_ms"]):
        x, y = a[nome], b.get(nome)
        ttl = "—" if x["ttl_mediano"] is None else f"{x['ttl_mediano']:.0f}"
        yd = (f"| {_f(y['delta_ms'])} | [{_f(y['q1_ms'])}; {_f(y['q3_ms'])}] "
              f"| {y['vitorias']}/{y['derrotas']} |") if y else "| — | — | — |"
        s.append(f"| `{nome}` | {ttl} | {_f(x['delta_ms'])} "
                 f"| [{_f(x['q1_ms'])}; {_f(x['q3_ms'])}] | {x['vitorias']}/{x['derrotas']} {yd}")
    favor = sum(1 for x in a.values() if x["delta_ms"] < 0)
    s += ["", f"O 1.1.1.1 tem Δ mediano negativo contra o 8.8.8.8 em **{favor} de {len(a)}** nomes. "
          "V/D = vitórias/derrotas do 1.1.1.1 nas rodadas do nome (empate abaixo de 1 ms).", ""]

    s += ["## 3. E-2 — custo do protocolo cifrado (Q3, H-c1 e H-c2)", "",
          "### 3.1 Confirmatório: unidade = janela de 6 h", "",
          "A coleta inteira cabe numa janela de 6 h, e com uma unidade não há o que "
          "reamostrar nem parear. **Nenhuma hipótese do E-2 pode ser confirmada.**", "",
          "| Resolvedor | Condição | Unid. | Δ vs Do53 (ms) | IC 95% | p |",
          "|---|---|---|---|---|---|"]
    for resolvedor, fam in res["e2_confirmatorio"].items():
        for chave, r in fam.items():
            s.append(f"| {resolvedor} | {chave} | {r['unidades']} | {_f(r['delta_ms'])} "
                     f"| {_ic(r['ic95'])} | {_p(r['wilcoxon'].p_valor) if r['wilcoxon'] else '—'} |")
    s += ["", "### 3.2 Exploratório: unidade = rodada (desvio declarado)", "",
          "> **Não confirma nada.** A unidade pré-registrada é a janela de 6 h "
          "(Planejamento, 10.2). Aqui cada uma das 60 rodadas vira uma unidade. As rodadas "
          "estão a 10 s uma da outra e dividem o estado da rede, então não são independentes: "
          "o IC e o p saem mais estreitos do que deveriam. Serve para mostrar o tamanho e a "
          "direção do custo, e para planejar a coleta definitiva.", ""]
    for resolvedor, fam in res["e2_exploratorio"].items():
        s += [f"**{resolvedor}** (Holm sobre as 4 comparações)", ""] + CABECALHO
        for chave, r in fam.items():
            s.append(linha_comparacao(f"{chave} − Do53", r))
        s.append("")
    s += ["Δ positivo = o protocolo cifrado custou mais que o Do53. δ de Cliff < 0 = o "
          "protocolo cifrado tende a ser mais lento. "
          f"Para a H-c2, o critério é o IC caber em ±{MARGEM_HC2_MS:.0f} ms.", ""]

    s += ["## 4. Análises de sensibilidade (Planejamento, 10.6)", "",
          "Cada cenário refaz a família E-1 (Holm dentro do cenário). Não há correção "
          "entre cenários: a pergunta é se a **conclusão** muda, não um teste novo.", "",
          "| Cenário | Consultas E-1 | Comparação | Unid. | Δ (ms) | IC 95% | p (Holm) | r | Veredito H-a | Nota |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for c in res["sensibilidade"]:
        if c["resultados"] is None:
            s.append(f"| {c['id']} — {c['nome']} | — | — | — | — | — | — | — | — | {c['nota']} |")
            continue
        for comp in FAMILIA_E1:
            r = c["resultados"][comp]
            if r is None:
                continue
            ver = veredito_direcional(r, -1) if comp == "8.8.8.8" else ""
            s.append(f"| {c['id']} — {c['nome']} | {c['consultas_e1']} | 1.1.1.1 − {_nome(comp)} "
                     f"| {r['unidades']} | {_f(r['delta_ms'])} | {_ic(r['ic95'])} "
                     f"| {_p(r.get('p_holm'))} | {_f(r['r'], 2, False)} | {ver} | {c['nota'] if comp == '8.8.8.8' else ''} |")
    s.append("")
    return s


# ----------------------------------------------------------------- JSON


def _limpar(obj):
    """Torna o resultado serializavel e estavel (4 casas, sem NaN)."""
    if isinstance(obj, est.Wilcoxon):
        return {"n": obj.n_usado, "w_mais": obj.estatistica,
                "p": round(obj.p_valor, 8), "metodo": obj.metodo, "r": round(obj.r, 4)}
    if isinstance(obj, est.Friedman):
        return {"n": obj.n, "k": obj.k, "q": round(obj.estatistica, 4), "gl": obj.gl,
                "p": round(obj.p_valor, 10), "w_kendall": round(kendall_w(obj), 4),
                "postos_medios": {k: round(v, 4) for k, v in obj.postos_medios.items()}}
    if isinstance(obj, float):
        return None if math.isnan(obj) else round(obj, 4)
    if isinstance(obj, dict):
        return {k: _limpar(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_limpar(v) for v in obj]
    return obj


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--base", type=Path, default=BASE)
    p.add_argument("--lote", default=LOTE)
    p.add_argument("--replicas", type=int, default=ana.REPLICAS_BOOTSTRAP)
    p.add_argument("--saida", type=Path, default=SAIDA)
    a = p.parse_args()

    linhas = ana.carregar(a.base, a.lote)
    res = executar(linhas, a.replicas)
    a.saida.mkdir(parents=True, exist_ok=True)
    md = a.saida / "testes_hipotese.md"
    md.write_text("\n".join(relatorio(res)) + "\n", encoding="utf-8")
    js = a.saida / "inferencia.json"
    js.write_text(json.dumps(_limpar(res), ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                  encoding="utf-8")
    print(f"gerado: {md}\ngerado: {js}")


if __name__ == "__main__":
    main()
