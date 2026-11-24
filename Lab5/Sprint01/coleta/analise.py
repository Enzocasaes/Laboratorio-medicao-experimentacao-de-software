"""Plano de analise aplicado ao CSV da coleta (Lab05, Participante C, secao 10).

Nao e' um relatorio: e' o plano de analise em forma executavel. Rodar isto
sobre os dados do piloto prova que o plano **fecha** — que cada metrica tem um
caminho do dado bruto ate' o numero final, sem passo faltando.

A ESTRUTURA SEGUE A SECAO 10

1. Descritiva por tratamento: n, mediana, p95, IQR, IQR/mediana, falhas (10.1).
2. Agregacao pela unidade de inferencia (10.2). E' o passo que nao pode ser
   pulado: as consultas nao sao independentes, e tratar cada uma como
   observacao estreitaria os IC e inflaria a significancia. A unidade e' o
   **nome** em C3 e a **janela de 6 h** em C1, C2 e E-2.
3. Diferenca pareada com IC por bootstrap de conglomerado (M3, 10.5).
4. Testes: Friedman entre os tres resolvedores e Wilcoxon par a par com
   correcao de Holm (10.3).
5. Taxa de falhas (M8) e custo do protocolo cifrado (M7).

O QUE AINDA NAO ESTA AQUI, E POR QUE. As analises de sensibilidade da secao
10.6 (excluir observacoes autoaquecidas, ajustar pelo RTT, excluir rodadas com
troca de PoP, incluir timeouts como 2.000 ms) dependem de uma coleta longa
para terem o que excluir. O piloto tem poucas horas; elas entram na Sprint 02.
O campo `s_desde_ultima_consulta`, que a primeira delas usa, **ja' e' gravado**
pelo coletor.

Uso (a partir de Lab5/):

    .venv/bin/python Sprint01/coleta/analise.py Sprint01/dados/piloto_c.csv
    python3 Sprint01/coleta/analise.py Sprint01/dados/piloto_c.csv --md saida.md
    python3 Sprint01/coleta/analise.py Sprint02/base_validada/consultas.csv.gz --lote provisoria

A base validada (Sprint02/base_validada/, issue #134) e' a que a analise le:
a base consolidada (Sprint02/base/, #133) sem os registros excluidos, com as
sinalizacoes. As duas juntam todos os lotes; nelas `--lote` e' obrigatorio,
para piloto, provisoria e definitiva nao se misturarem.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import estatistica as est  # noqa: E402

REPLICAS_BOOTSTRAP = 10_000
SEMENTE_BOOTSTRAP = 42
EPSILON_EMPATE_MS = 1.0      # M5: diferencas menores que isso contam empate
ALFA = 0.05


# ------------------------------------------------------------ leitura


def carregar(caminho: Path, lote: str | None = None) -> list[dict]:
    """Le o CSV (ou .csv.gz) e converte os campos numericos.

    Na base consolidada, que tem a coluna `lote`, so' as linhas do lote pedido
    ficam; sem `lote`, a leitura recusa uma base com mais de um lote.
    """
    abrir = gzip.open if caminho.suffix == ".gz" else open
    with abrir(caminho, "rt", newline="", encoding="utf-8") as arquivo:
        linhas = list(csv.DictReader(arquivo))
    if linhas and "lote" in linhas[0]:
        lotes = sorted({linha["lote"] for linha in linhas})
        if lote is None and len(lotes) > 1:
            raise ValueError(f"{caminho} tem os lotes {lotes}: escolha um com --lote")
        if lote is not None:
            linhas = [linha for linha in linhas if linha["lote"] == lote]
            if not linhas:
                raise ValueError(f"{caminho} nao tem o lote {lote!r} (tem {lotes})")
    elif lote is not None:
        raise ValueError(f"{caminho} nao tem a coluna `lote`; tire o --lote")
    for linha in linhas:
        for campo in ("latencia_ms", "t_tcp_ms", "t_tls_ms", "rtt_ms",
                      "s_desde_ultima_consulta"):
            linha[campo] = float(linha[campo]) if linha.get(campo) else None
        linha["ttl"] = int(linha["ttl"]) if linha.get("ttl") else None
        linha["sucesso"] = (not linha["erro"]) and linha["rcode"] == "NOERROR"
    return linhas


def _posicao(linha: dict) -> str:
    """A posicao do bloco (secao 7.4), com compatibilidade para CSV antigo.

    Em C1 cada resolvedor consulta um nome unico diferente, de proposito: se
    todos usassem o mesmo nome, um resolvedor aqueceria o cache do outro.
    Parear por `nome` ali nunca encontraria par, e C1 — que e' justamente o
    caso mais caro, a resolucao recursiva completa — ficaria sem analise.
    """
    return linha.get("posicao") or linha["nome"]


def tratamento(linha: dict) -> tuple[str, ...]:
    return (linha["resolvedor"], linha["protocolo"], linha["conexao"],
            linha["condicao_cache"])


def janela_6h(linha: dict) -> str:
    """A unidade de inferencia de C1, C2 e E-2 (secao 10.2).

    As quatro faixas de M10 em cada dia. Usa UTC: o carimbo ja' esta' em UTC,
    e converter para Brasilia so' na apresentacao evita erro de fuso aqui.
    """
    momento = datetime.fromisoformat(linha["ts_utc"])
    return f"{momento.date().isoformat()}#{momento.hour // 6}"


def unidade_de_inferencia(linha: dict) -> str:
    """Nome em C3; janela de 6 h nas demais condicoes (secao 10.2).

    Em C1 e C2 os nomes sao replicas sinteticas da mesma zona: trata-los como
    unidades seria pseudorreplicacao, porque a variabilidade que interessa
    ali e' a do tempo, nao a do nome.
    """
    if linha["condicao_cache"] == "C3" and linha["experimento"] == "E-1":
        return f"nome:{linha['nome']}"
    return f"janela:{janela_6h(linha)}"


# --------------------------------------------------------- descritiva


def descritiva(linhas: list[dict]) -> list[dict]:
    """Uma linha por tratamento, com o que a secao 10.1 pede."""
    por_tratamento: dict[tuple, list[dict]] = defaultdict(list)
    for linha in linhas:
        por_tratamento[tratamento(linha)].append(linha)

    saida = []
    for chave, grupo in sorted(por_tratamento.items()):
        latencias = [l["latencia_ms"] for l in grupo if l["sucesso"]]
        falhas = sum(1 for l in grupo if not l["sucesso"])
        registro = {
            "resolvedor": chave[0], "protocolo": chave[1],
            "conexao": chave[2], "condicao_cache": chave[3],
            "n": len(grupo), "n_sucesso": len(latencias), "falhas": falhas,
            "taxa_falhas": falhas / len(grupo) if grupo else 0.0,
        }
        if latencias:
            m = est.mediana(latencias)
            registro.update({
                "mediana_ms": m,
                # o p95 so' entra com amostra suficiente (M2): com poucas
                # observacoes ele e' instavel e enganaria o leitor
                "p95_ms": est.percentil(latencias, 95) if len(latencias) >= 100 else None,
                "iqr_ms": est.iqr(latencias),
                "iqr_sobre_mediana": est.iqr(latencias) / m if m else None,
                "min_ms": min(latencias), "max_ms": max(latencias),
            })
        saida.append(registro)
    return saida


# ----------------------------------------------- pareamento e agregacao


def blocos(linhas: list[dict], experimento: str) -> dict[tuple, dict[str, float]]:
    """Agrupa por bloco (secao 7.4): rede x rodada x posicao consultada.

    Dentro de um bloco, todos os tratamentos viram chaves de um dicionario.
    E' o que permite a diferenca pareada: os valores do bloco foram medidos
    com segundos de diferenca, sob o mesmo estado de rede.
    """
    agrupado: dict[tuple, dict[str, float]] = defaultdict(dict)
    for linha in linhas:
        if linha["experimento"] != experimento or not linha["sucesso"]:
            continue
        chave = (linha["rede_id"], linha["rodada_id"], _posicao(linha),
                 linha["condicao_cache"])
        rotulo = (linha["resolvedor"] if experimento == "E-1"
                  else f"{linha['resolvedor']}|{linha['protocolo']}|{linha['conexao']}")
        agrupado[chave][rotulo] = linha["latencia_ms"]
    return agrupado


def diferencas_por_unidade(linhas: list[dict], experimento: str,
                           alvo: str, comparador: str
                           ) -> dict[str, list[float]]:
    """Δ = alvo − comparador, agrupado pela unidade de inferencia.

    Devolve {unidade: [deltas]}, pronto tanto para a mediana por unidade
    (o que entra no Wilcoxon) quanto para o bootstrap de conglomerado.
    """
    indice = {(l["rede_id"], l["rodada_id"], _posicao(l), l["condicao_cache"]): l
              for l in linhas if l["experimento"] == experimento}
    por_unidade: dict[str, list[float]] = defaultdict(list)
    for chave, valores in blocos(linhas, experimento).items():
        if alvo in valores and comparador in valores:
            linha = indice.get(chave)
            if linha is None:
                continue
            por_unidade[unidade_de_inferencia(linha)].append(
                valores[alvo] - valores[comparador])
    return dict(por_unidade)


def taxa_de_vitoria(deltas: list[float], epsilon: float = EPSILON_EMPATE_MS) -> dict:
    """M5: em que fracao dos blocos o alvo foi mais rapido.

    Diferencas menores que epsilon contam como empate, para nao transformar
    ruido de um milissegundo em "vitoria".
    """
    vitorias = sum(1 for d in deltas if d < -epsilon)
    derrotas = sum(1 for d in deltas if d > epsilon)
    empates = len(deltas) - vitorias - derrotas
    decididos = vitorias + derrotas
    return {"vitorias": vitorias, "derrotas": derrotas, "empates": empates,
            "taxa": vitorias / decididos if decididos else None}


def comparar(linhas: list[dict], experimento: str, alvo: str,
             comparador: str, replicas: int = REPLICAS_BOOTSTRAP) -> dict | None:
    """M3 + M4 + M5 + o Wilcoxon da secao 10.3 para um par de tratamentos."""
    por_unidade = diferencas_por_unidade(linhas, experimento, alvo, comparador)
    if not por_unidade:
        return None

    unidades = list(por_unidade.values())
    if len(unidades) < 2:
        # Uma unidade so': nao ha' do que reamostrar nem o que parear entre
        # unidades. Acontece quando a coleta e' curta demais para gerar mais de
        # uma janela de 6 h. Devolve-se a descritiva com a limitacao marcada,
        # em vez de sumir com a comparacao e deixar o leitor sem saber por que.
        planos = [d for u in unidades for d in u]
        return {
            "alvo": alvo, "comparador": comparador,
            "unidades": 1, "observacoes": len(planos),
            "mediana_delta_ms": est.mediana(planos),
            "ic95": None, "mediana_das_medianas_ms": est.mediana(planos),
            "wilcoxon": None, "vitoria": taxa_de_vitoria(planos),
            "insuficiente": ("uma unica unidade de inferencia: sem IC e sem "
                             "teste (secao 10.2)"),
        }
    medianas = [est.mediana(d) for d in unidades]
    observado, inferior, superior = est.bootstrap_conglomerado(
        unidades, est.mediana, replicas=replicas, semente=SEMENTE_BOOTSTRAP)
    teste = est.wilcoxon_pareado(medianas)
    planos = [d for u in unidades for d in u]

    return {
        "alvo": alvo, "comparador": comparador,
        "unidades": len(unidades), "observacoes": len(planos),
        "mediana_delta_ms": observado,
        "ic95": (inferior, superior),
        "mediana_das_medianas_ms": est.mediana(medianas),
        "wilcoxon": teste,
        "vitoria": taxa_de_vitoria(planos),
        "insuficiente": "",
    }


def friedman_resolvedores(linhas: list[dict], condicao: str) -> est.Friedman | None:
    """Friedman entre os resolvedores em Do53, numa condicao de cache (10.3).

    Os blocos do teste sao as **unidades de inferencia**, nao as consultas:
    para cada unidade, a mediana de cada resolvedor.
    """
    indice = {(l["rede_id"], l["rodada_id"], _posicao(l), l["condicao_cache"]): l
              for l in linhas if l["experimento"] == "E-1"}
    por_unidade: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for chave, valores in blocos(linhas, "E-1").items():
        if chave[3] != condicao:
            continue
        linha = indice.get(chave)
        if linha is None:
            continue
        unidade = unidade_de_inferencia(linha)
        for resolvedor, latencia in valores.items():
            por_unidade[unidade][resolvedor].append(latencia)

    resolvedores = sorted({r for u in por_unidade.values() for r in u})
    if len(resolvedores) < 3:
        return None
    blocos_do_teste = [
        {r: est.mediana(valores[r]) for r in resolvedores}
        for valores in por_unidade.values() if all(r in valores for r in resolvedores)
    ]
    if len(blocos_do_teste) < 2:
        return None
    return est.friedman(blocos_do_teste)


# ------------------------------------------------------------ relatorio


def _ms(valor) -> str:
    return "—" if valor is None else f"{valor:.1f}"


def _p(valor: float) -> str:
    return f"{valor:.4f}" if valor >= 1e-4 else f"{valor:.1e}"


def relatorio(linhas: list[dict], replicas: int = REPLICAS_BOOTSTRAP) -> list[str]:
    saida: list[str] = []
    redes = sorted({l["rede_id"] for l in linhas})
    rodadas = sorted({l["rodada_id"] for l in linhas})
    inicio, fim = min(l["ts_utc"] for l in linhas), max(l["ts_utc"] for l in linhas)

    saida += [
        "# Analise da coleta (Lab05)",
        "",
        "> Gerado por `python3 Sprint01/coleta/analise.py`. Nao edite a mao.",
        "",
        "| Item | Valor |", "|---|---|",
        f"| Consultas | {len(linhas)} |",
        f"| Rodadas | {len(rodadas)} |",
        f"| Redes | {', '.join(redes)} |",
        f"| Periodo (UTC) | {inicio} a {fim} |",
        f"| Falhas | {sum(1 for l in linhas if not l['sucesso'])} |",
        "",
        "## 1. Descritiva por tratamento (secao 10.1)",
        "",
        "O p95 so' aparece com 100 ou mais observacoes bem-sucedidas na celula;",
        "abaixo disso ele e' instavel demais para ser reportado.",
        "",
        "| Exp. | Resolvedor | Protocolo | Conexao | Cache | n | Mediana | p95 | IQR | IQR/med | Falhas |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    experimentos = sorted({l["experimento"] for l in linhas})
    for experimento in experimentos:
        for registro in descritiva([l for l in linhas if l["experimento"] == experimento]):
            dispersao = registro.get("iqr_sobre_mediana")
            dispersao_txt = "—" if dispersao is None else f"{dispersao:.2f}"
            saida.append(
                f"| {experimento} | {registro['resolvedor']} | {registro['protocolo']} "
                f"| {registro['conexao']} | {registro['condicao_cache']} "
                f"| {registro['n']} | {_ms(registro.get('mediana_ms'))} "
                f"| {_ms(registro.get('p95_ms'))} | {_ms(registro.get('iqr_ms'))} "
                f"| {dispersao_txt} | {registro['falhas']} |")

    # --- E-1: resolvedores em Do53
    saida += ["", "## 2. E-1 — resolvedores em Do53 (Q1, secao 10.3)", ""]
    for condicao in sorted({l["condicao_cache"] for l in linhas if l["experimento"] == "E-1"}):
        teste = friedman_resolvedores(linhas, condicao)
        saida += [f"### Condicao {condicao}", ""]
        if teste is None:
            saida += ["Menos de tres resolvedores com blocos completos: Friedman nao se aplica.", ""]
        else:
            postos = ", ".join(f"{r} = {p:.2f}" for r, p in sorted(teste.postos_medios.items()))
            saida += [
                f"**Friedman** sobre {teste.n} unidades de inferencia: "
                f"Q = {teste.estatistica:.3f}, gl = {teste.gl}, p = {_p(teste.p_valor)}. "
                f"Postos medios: {postos}.",
                "",
            ]
        alvo = "1.1.1.1"
        comparadores = sorted({l["resolvedor"] for l in linhas
                               if l["experimento"] == "E-1" and l["resolvedor"] != alvo})
        resultados = {}
        for comparador in comparadores:
            r = comparar([l for l in linhas if l["condicao_cache"] == condicao],
                         "E-1", alvo, comparador, replicas)
            if r:
                resultados[comparador] = r
        if resultados:
            comparaveis = {c: r for c, r in resultados.items() if r["wilcoxon"]}
            ajustados = est.holm({c: r["wilcoxon"].p_valor
                                  for c, r in comparaveis.items()})
            saida += [
                "| Comparacao | Unid. | Δ mediana (ms) | IC 95% | p (Wilcoxon) | p (Holm) | r | Vitorias |",
                "|---|---|---|---|---|---|---|---|",
            ]
            for comparador, r in sorted(resultados.items()):
                v = r["vitoria"]
                taxa = "—" if v["taxa"] is None else f"{100*v['taxa']:.0f}%"
                if r["wilcoxon"] is None:
                    saida.append(
                        f"| {alvo} − {comparador} | {r['unidades']} "
                        f"| {r['mediana_delta_ms']:+.1f} | — | — | — | — "
                        f"| {taxa} ({v['vitorias']}/{v['vitorias']+v['derrotas']}) |")
                    continue
                saida.append(
                    f"| {alvo} − {comparador} | {r['unidades']} "
                    f"| {r['mediana_delta_ms']:+.1f} "
                    f"| [{r['ic95'][0]:+.1f}; {r['ic95'][1]:+.1f}] "
                    f"| {_p(r['wilcoxon'].p_valor)} | {_p(ajustados[comparador])} "
                    f"| {r['wilcoxon'].r:.2f} | {taxa} ({v['vitorias']}/{v['vitorias']+v['derrotas']}) |")
            saida += ["", "Δ negativo = o 1.1.1.1 respondeu mais rapido.", ""]

    # --- E-2: custo do protocolo cifrado
    saida += ["## 3. E-2 — custo do protocolo cifrado (Q3, M7)", ""]
    e2 = [l for l in linhas if l["experimento"] == "E-2"]
    if not e2:
        saida += ["Sem dados de E-2.", ""]
    else:
        resolvedores = sorted({l["resolvedor"] for l in e2})
        saida += [
            "| Resolvedor | Condicao | Unid. | Δ vs Do53 (ms) | IC 95% | p (Wilcoxon) | p (Holm) |",
            "|---|---|---|---|---|---|---|",
        ]
        for resolvedor in resolvedores:
            base = f"{resolvedor}|Do53|unica"
            alvos = [f"{resolvedor}|{p}|{c}" for p, c in
                     (("DoT", "nova"), ("DoT", "reaproveitada"),
                      ("DoH", "nova"), ("DoH", "reaproveitada"))]
            resultados = {}
            for alvo in alvos:
                r = comparar(e2, "E-2", alvo, base, replicas)
                if r:
                    resultados[alvo] = r
            if not resultados:
                continue
            comparaveis = {a: r for a, r in resultados.items() if r["wilcoxon"]}
            ajustados = est.holm({a: r["wilcoxon"].p_valor
                                  for a, r in comparaveis.items()})
            for alvo, r in resultados.items():
                _, protocolo, conexao = alvo.split("|")
                if r["wilcoxon"] is None:
                    saida.append(
                        f"| {resolvedor} | {protocolo} {conexao} | {r['unidades']} "
                        f"| {r['mediana_delta_ms']:+.1f} | — | — | — |")
                    continue
                saida.append(
                    f"| {resolvedor} | {protocolo} {conexao} | {r['unidades']} "
                    f"| {r['mediana_delta_ms']:+.1f} "
                    f"| [{r['ic95'][0]:+.1f}; {r['ic95'][1]:+.1f}] "
                    f"| {_p(r['wilcoxon'].p_valor)} | {_p(ajustados[alvo])} |")
        saida += ["", "Δ positivo = o protocolo cifrado custou mais que o Do53.",
                  "",
                  "Traco (—) no IC e no p significa **uma unica unidade de "
                  "inferencia**: a coleta nao durou o bastante para gerar duas "
                  "janelas de 6 h, entao ha' descritiva mas nao ha' o que "
                  "reamostrar nem o que parear entre unidades (secao 10.2).",
                  ""]

    # --- falhas
    saida += ["## 4. Falhas (M8, secao 10.4)", ""]
    por_resolvedor: dict[str, list[dict]] = defaultdict(list)
    for linha in linhas:
        por_resolvedor[linha["resolvedor"]].append(linha)
    saida += ["| Resolvedor | Consultas | Falhas | Taxa | IC 95% (Wilson) | Tipos |",
              "|---|---|---|---|---|---|"]
    for resolvedor, grupo in sorted(por_resolvedor.items()):
        falhas = [l for l in grupo if not l["sucesso"]]
        inferior, superior = est.wilson(len(falhas), len(grupo))
        tipos: dict[str, int] = defaultdict(int)
        for linha in falhas:
            tipos[linha["erro"] or linha["rcode"]] += 1
        descricao = ", ".join(f"{k}={v}" for k, v in sorted(tipos.items())) or "—"
        saida.append(
            f"| {resolvedor} | {len(grupo)} | {len(falhas)} "
            f"| {100*len(falhas)/len(grupo):.2f}% "
            f"| [{100*inferior:.2f}%; {100*superior:.2f}%] | {descricao} |")

    # --- covariaveis
    saida += ["", "## 5. Covariaveis (M11 e ponto de presenca)", "",
              "| Resolvedor | RTT mediano (ms) | Pontos de presenca vistos |",
              "|---|---|---|"]
    for resolvedor, grupo in sorted(por_resolvedor.items()):
        rtts = [l["rtt_ms"] for l in grupo if l["rtt_ms"] is not None]
        pops = sorted({l["pop_id"] for l in grupo if l["pop_id"]})
        saida.append(f"| {resolvedor} | {_ms(est.mediana(rtts)) if rtts else '—'} "
                     f"| {', '.join(pops) or '—'} |")

    # --- M12: a suposicao em que o tratamento "reaproveitada" se apoia
    saida += ["", "## 6. Reconexoes na conexao reaproveitada (M12)", ""]
    reaproveitadas = [l for l in linhas if l["conexao"] == "reaproveitada"]
    if not reaproveitadas:
        saida += ["Sem medidas com conexao reaproveitada.", ""]
    else:
        reconexoes = sum(1 for l in reaproveitadas
                         if str(l.get("reconectou", "")).lower() == "true")
        saida += [
            f"{reconexoes} reconexoes em {len(reaproveitadas)} medidas com "
            f"conexao reaproveitada.",
            "",
            "O tratamento *conexao reaproveitada* **supoe** que a conexao "
            "sobrevive a rodada inteira. Se um resolvedor derrubasse conexoes "
            "ociosas mais que o outro, parte do custo dele reapareceria sem "
            "aviso e a comparacao do E-2 ficaria errada em silencio. Zero "
            "reconexoes sustenta a suposicao; qualquer numero diferente de "
            "zero precisa entrar na leitura do E-2.",
            "",
        ]
    return saida


def main() -> None:
    analisador = argparse.ArgumentParser(description="Analise da coleta do Lab05.")
    analisador.add_argument("csv", type=Path)
    analisador.add_argument("--md", type=Path, default=None,
                            help="grava o relatorio em Markdown")
    analisador.add_argument("--replicas", type=int, default=REPLICAS_BOOTSTRAP)
    analisador.add_argument("--lote", default=None,
                            help="na base consolidada: piloto, provisoria ou definitiva")
    argumentos = analisador.parse_args()

    try:
        linhas = carregar(argumentos.csv, argumentos.lote)
    except ValueError as erro:
        analisador.error(str(erro))
    texto = "\n".join(relatorio(linhas, argumentos.replicas)) + "\n"
    if argumentos.md:
        argumentos.md.parent.mkdir(parents=True, exist_ok=True)
        argumentos.md.write_text(texto, encoding="utf-8")
        print(f"gerado: {argumentos.md}")
    else:
        print(texto)


if __name__ == "__main__":
    main()
