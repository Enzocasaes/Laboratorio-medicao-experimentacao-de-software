"""Confere a RQ 05 e a RQ 06 do pipeline com o scipy e o statsmodels.

Opcional: o pipeline e' em Node e implementa os testes sem dependencias
(src/analise/estatistica.js). Este script refaz as contas, de forma
independente, com as bibliotecas de referencia, a partir dos mesmos CSVs:

    pip install scipy statsmodels
    npm run analise:rq05 && npm run analise:rq06
    python scripts/conferir_rq05_rq06.py            # dentro de Lab3/Sprint01
    python scripts/conferir_rq05_rq06.py --dados outro/data

Le processed/dataset.csv, processed/release_corretiva.csv e
processed/consenso.csv (opcional), recalcula as correlacoes de Spearman
(RQ 05), os Kruskal-Wallis e os Mann-Whitney (RQ 06), aplica Holm e compara
com analise_rq05.csv, analise_rq06_testes.csv, analise_rq06_contrastes.csv e o
Spearman parcial de analise_rq06_confusao.csv.
Sai com codigo 1 se algum valor divergir.
"""

import argparse
import csv
import math
import sys
from pathlib import Path

import numpy as np
from scipy import stats
from statsmodels.stats.multitest import multipletests

MINIMO_AVALIADAS = 10
DIAS = 7
MINIMO_POR_LINGUAGEM = 10
MINIMO_POR_TIPO = 5
LINGUAGENS_AUTOMATIZADAS = ["TypeScript", "JavaScript", "Go", "Rust"]
QUARTIS = ["Q1", "Q2", "Q3", "Q4"]


def ler(caminho):
    with open(caminho, newline="", encoding="utf-8-sig") as arquivo:
        return list(csv.DictReader(arquivo))


def num(valor):
    if valor is None or str(valor).strip() == "":
        return None
    v = float(valor)
    return v if math.isfinite(v) else None


# ---- pontuacao DORA (C1), mesmos cortes de src/analise/dora.js ---------------

def pontos_frequencia(v):
    if v is None:
        return None
    return 4 if v >= 7 else 3 if v >= 1 else 2 if v >= 12 / 52.1775 else 1


def pontos_lead_time(v):
    if v is None:
        return None
    return 4 if v < 1 else 3 if v < 7 else 2 if v < 30 else 1


def pontos_cfr(v):
    if v is None:
        return None
    return 4 if v <= 0.15 else 3 if v <= 0.3 else 2 if v <= 0.45 else 1


def pontos_recuperacao(v):
    if v is None:
        return None
    return 4 if v < 1 else 3 if v < 24 else 2 if v < 168 else 1


def dora_score(r):
    pontos = [
        pontos_frequencia(num(r["deployment_frequency_per_week"])),
        pontos_lead_time(num(r["lead_time_release_median_days"])),
        pontos_cfr(num(r["change_failure_rate_ci"])),
        pontos_recuperacao(num(r["recovery_median_hours"])),
    ]
    pontos = [p for p in pontos if p is not None]
    return math.floor(float(np.median(pontos))) if pontos else None


# ---- RQ 05 -------------------------------------------------------------------

def decomposicao(registros):
    por_repo = {}
    for r in registros:
        if r["cfr_delivery_status"] not in ("failed", "not_failed"):
            continue
        d = por_repo.setdefault(r["full_name"], {"avaliadas": 0, "prazo": 0, "falharam": 0})
        d["avaliadas"] += 1
        dias = num(r["days_to_next"])
        if r["cfr_delivery_status"] == "failed" or (dias is not None and dias <= DIAS):
            d["prazo"] += 1
        if r["cfr_delivery_status"] == "failed":
            d["falharam"] += 1
    return {
        nome: {
            "oportunidade": d["prazo"] / d["avaliadas"] if d["avaliadas"] else None,
            "condicional": d["falharam"] / d["prazo"] if d["prazo"] else None,
        }
        for nome, d in por_repo.items()
    }


def rq05(repos, decomp):
    def col(c):
        return lambda r: num(r[c])

    pares = [
        ("freq_x_cfr_ci", col("change_failure_rate_ci"), None),
        ("freq_x_cfr_entrega", col("change_failure_rate_delivery"), None),
        ("freq_x_cfr_entrega_min10", col("change_failure_rate_delivery"),
         lambda r: (num(r["cfr_delivery_evaluated"]) or 0) >= MINIMO_AVALIADAS),
        ("freq_x_oportunidade", lambda r: decomp.get(r["full_name"], {}).get("oportunidade"), None),
        ("freq_x_condicional", lambda r: decomp.get(r["full_name"], {}).get("condicional"), None),
        ("freq_x_recuperacao", col("recovery_median_hours"), None),
    ]
    resultado = {}
    ps = []
    for ident, valor, filtro in pares:
        base = [r for r in repos if filtro is None or filtro(r)]
        xy = [(num(r["deployment_frequency_per_week"]), valor(r)) for r in base]
        xy = [(x, y) for x, y in xy if x is not None and y is not None]
        x, y = zip(*xy)
        rho, p = stats.spearmanr(x, y)
        resultado[ident] = {"n": len(xy), "rho": rho, "p": p}
        ps.append(p)
    for ident, ajustado in zip(resultado, multipletests(ps, method="holm")[1]):
        resultado[ident]["p_holm"] = ajustado
    return resultado


# ---- RQ 06 -------------------------------------------------------------------

def quartis(valores):
    numeros = [v for v in valores if v is not None]
    cortes = np.percentile(numeros, [25, 50, 75])  # interpolacao linear, como no pipeline
    def quartil(v):
        if v is None:
            return None
        for rotulo, corte in zip(QUARTIS, cortes):
            if v <= corte:
                return rotulo
        return "Q4"
    return [quartil(v) for v in valores], QUARTIS


def linguagens(repos):
    base = [None if not r["language"].strip() else ("C/C++" if r["language"].strip() in ("C", "C++") else r["language"].strip()) for r in repos]
    contagem = {}
    for b in base:
        if b is not None:
            contagem[b] = contagem.get(b, 0) + 1
    grupos = [b if b is not None and contagem[b] >= MINIMO_POR_LINGUAGEM else "Outras" for b in base]
    return grupos, sorted(set(grupos))


def tipos(repos, consenso):
    rotulos = {c["full_name"]: c["rotulo_consenso"] for c in consenso
               if c["dimensao"] == "tipo_do_projeto" and c["status"] == "consenso" and c["rotulo_consenso"]}
    brutos = [rotulos.get(r["full_name"]) for r in repos]
    contagem = {}
    for b in brutos:
        if b is not None:
            contagem[b] = contagem.get(b, 0) + 1
    grupos = [None if b is None else (b if contagem[b] >= MINIMO_POR_TIPO else "outro") for b in brutos]
    return grupos, sorted({g for g in grupos if g is not None})


METRICAS = [
    "deployment_frequency_per_week",
    "lead_time_release_median_days",
    "change_failure_rate_ci",
    "recovery_median_hours",
    "dora_score",
]


def rq06(repos, consenso):
    for r in repos:
        r["dora_score"] = dora_score(r)
    fatores = {
        "linguagem": linguagens(repos),
        "contribuidores": quartis([num(r["contributors"]) for r in repos]),
        "idade": quartis([num(r["age_years"]) for r in repos]),
        "popularidade": quartis([num(r["stars"]) for r in repos]),
    }
    tipo = tipos(repos, consenso)
    if len(tipo[1]) >= 2:
        fatores["tipo_do_projeto"] = tipo

    def valores(grupos, grupo, metrica):
        return [num(r[metrica]) for r, g in zip(repos, grupos) if g == grupo and num(r[metrica]) is not None]

    testes = {}
    for fator, (grupos, ordem) in fatores.items():
        for m in METRICAS:
            listas = [valores(grupos, g, m) for g in ordem]
            listas = [l for l in listas if l]
            h, p = stats.kruskal(*listas)
            testes[(fator, m)] = {"h": h, "p": p}
    for chave, ajustado in zip(testes, multipletests([t["p"] for t in testes.values()], method="holm")[1]):
        testes[chave]["p_holm"] = ajustado

    planejados = []
    for fator, (grupos, ordem) in fatores.items():
        if ordem == QUARTIS:
            planejados += [(fator, m, "Q4", "Q1") for m in METRICAS]
        elif fator == "linguagem" and "C/C++" in ordem:
            planejados += [(fator, "deployment_frequency_per_week", l, "C/C++") for l in LINGUAGENS_AUTOMATIZADAS if l in ordem]
    contrastes = {}
    for fator, m, a, b in planejados:
        grupos = fatores[fator][0]
        xa, xb = valores(grupos, a, m), valores(grupos, b, m)
        res = stats.mannwhitneyu(xa, xb, alternative="two-sided", method="asymptotic", use_continuity=True)
        delta = 2 * res.statistic / (len(xa) * len(xb)) - 1
        contrastes[(fator, m, a, b)] = {"u": res.statistic, "p": res.pvalue, "delta": delta}
    for chave, ajustado in zip(contrastes, multipletests([c["p"] for c in contrastes.values()], method="holm")[1]):
        contrastes[chave]["p_holm"] = ajustado
    return testes, contrastes


def parcial(repos, x, y, z):
    casos = [(num(r[x]), num(r[y]), num(r[z])) for r in repos]
    casos = [c for c in casos if None not in c]
    a, b, c = zip(*casos)
    rxy, rxz, ryz = (stats.spearmanr(u, v)[0] for u, v in ((a, b), (a, c), (b, c)))
    rho = (rxy - rxz * ryz) / math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2))
    gl = len(casos) - 3
    return {"n": len(casos), "rho": rho, "p": 2 * stats.t.sf(abs(rho * math.sqrt(gl / (1 - rho ** 2))), gl)}


# ---- comparacao --------------------------------------------------------------

def proximo(esperado, obtido, tolerancia):
    if esperado is None or obtido is None:
        return esperado is None and obtido is None
    # p-valores minusculos: compara em escala relativa (o CSV tem 4 significativos).
    return abs(esperado - obtido) <= tolerancia or abs(esperado - obtido) <= 1e-3 * abs(esperado)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dados", default="data", help="pasta de saida do pipeline (padrao: data)")
    parser.add_argument("--tolerancia", type=float, default=1e-3, help="diferenca aceita (o CSV tem 4 casas)")
    args = parser.parse_args(argv)
    processados = Path(args.dados) / "processed"

    repos = ler(processados / "dataset.csv")
    decomp = decomposicao(ler(processados / "release_corretiva.csv"))
    consenso_csv = processados / "consenso.csv"
    consenso = ler(consenso_csv) if consenso_csv.exists() else []

    divergencias = []
    conferidos = 0

    def conferir(onde, campo, esperado, obtido):
        nonlocal conferidos
        conferidos += 1
        if not proximo(esperado, obtido, args.tolerancia):
            divergencias.append(f"{onde} {campo}: scipy={esperado} pipeline={obtido}")

    calculado = rq05(repos, decomp)
    for linha in ler(processados / "analise_rq05.csv"):
        ref = calculado[linha["id"]]
        conferir(linha["id"], "n", ref["n"], num(linha["n"]))
        for campo in ("rho", "p", "p_holm"):
            conferir(linha["id"], campo, ref[campo], num(linha[campo]))

    testes, contrastes = rq06(repos, consenso)
    linhas_testes = ler(processados / "analise_rq06_testes.csv")
    if len(linhas_testes) != len(testes):
        divergencias.append(f"testes da RQ 06: scipy={len(testes)} pipeline={len(linhas_testes)}")
    for linha in linhas_testes:
        ref = testes.get((linha["fator"], linha["metrica"]))
        if ref is None:
            divergencias.append(f"teste sem par no scipy: {linha['fator']} x {linha['metrica']}")
            continue
        for campo in ("h", "p", "p_holm"):
            conferir(f"{linha['fator']} x {linha['metrica']}", campo, ref[campo], num(linha[campo]))

    linhas_contrastes = ler(processados / "analise_rq06_contrastes.csv")
    if len(linhas_contrastes) != len(contrastes):
        divergencias.append(f"contrastes da RQ 06: scipy={len(contrastes)} pipeline={len(linhas_contrastes)}")
    for linha in linhas_contrastes:
        chave = (linha["fator"], linha["metrica"], linha["grupo_a"], linha["grupo_b"])
        ref = contrastes.get(chave)
        if ref is None:
            divergencias.append(f"contraste sem par no scipy: {chave}")
            continue
        for campo in ("u", "p", "p_holm", "delta"):
            conferir(" ".join(chave), campo, ref[campo], num(linha[campo]))

    for linha in ler(processados / "analise_rq06_confusao.csv"):
        if linha["tipo"] != "parcial":
            continue
        ref = parcial(repos, linha["x"], linha["y"], linha["controle"])
        for campo in ("n", "rho", "p"):
            conferir(f"parcial {linha['x']} x {linha['y']} | {linha['controle']}", campo, ref[campo], num(linha[campo]))

    if divergencias:
        print(f"{len(divergencias)} divergencia(s) em {conferidos} valores conferidos:")
        for d in divergencias:
            print(f"  - {d}")
        return 1
    print(f"OK: {conferidos} valores conferidos com o scipy/statsmodels, nenhuma divergencia "
          f"(tolerancia {args.tolerancia}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
