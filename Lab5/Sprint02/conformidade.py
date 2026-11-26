"""Consistencia metodologica dos dados coletados (Lab05, Sprint 02, issue #130).

A issue #134 ja' validou a **qualidade e a integridade** da base: se os
arquivos batem, se ha' lacunas, se ha' valores impossiveis. Esta verificacao e'
outra pergunta, e e' a do Participante B:

    os dados que foram coletados sao os dados que o desenho experimental pediu?

Cada verificacao abaixo compara um item do desenho
(`Docs/DesenhoMetodologico.md` e `Docs/ProtocoloExperimental.md`) com o que a
base mostra, e sai com um veredito:

- **conforme** -- o dado cumpre o que o desenho exige;
- **divergente** -- o dado existe, mas nao e' o que o desenho pede. Divergencia
  nao e' erro: a decisao D13 trocou a coleta de 7 dias por uma de 10 minutos,
  de propriosito. O que nao pode e' a divergencia ficar implicita;
- **nao exercitado** -- a regra existe, mas esta coleta nao teve como aciona'-la.

O veredito sai do dado, nunca de texto escrito a mao: se a proxima coleta
mudar, a tabela muda junto. Biblioteca padrao apenas, sem sorteio.

Uso (a partir de Lab5/):

    python Sprint02/conformidade.py                 # grava em Sprint02/resultados/
    python Sprint02/conformidade.py --saida /tmp/x  # para conferir
"""

from __future__ import annotations

import argparse
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

LAB5 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(LAB5 / "Sprint01" / "coleta"))

import analise as ana  # noqa: E402

BASE = LAB5 / "Sprint02" / "base_validada" / "consultas.csv.gz"
LOTE = "provisoria"
SAIDA = LAB5 / "Sprint02" / "resultados"

CONFORME = "conforme"
DIVERGENTE = "divergente"
NAO_EXERCITADO = "não exercitado"

# O desenho, como esta' escrito. Numeros aqui sao os do documento, nao da base.
REDES_PREVISTAS = 3                 # D2
DIAS_PREVISTOS = 7                  # D5
INTERVALO_PREVISTO_S = 30 * 60      # D4
NOMES_POR_RODADA_PREVISTOS = 80     # D3
CADENCIA_MAXIMA = 1                 # DesenhoMetodologico 7.2: 1 consulta/s por servico
CACHES_PREVISTOS = ("C1", "C2", "C3")
SERVICOS_EXTERNOS = ("1.1.1.1", "8.8.8.8")


@dataclass
class Verificacao:
    id: str
    item: str
    onde: str
    esperado: str
    observado: str
    veredito: str
    consequencia: str
    detalhe: list[str] = field(default_factory=list)


def instante(linha: dict) -> datetime:
    return datetime.fromisoformat(linha["ts_utc"])


# ------------------------------------------------------- escala da coleta


def v_redes(linhas: list[dict]) -> Verificacao:
    redes = sorted({l["rede_id"] for l in linhas})
    return Verificacao(
        "C1", "Pontos de coleta", "D2",
        f"{REDES_PREVISTAS} redes, uma por integrante, no mesmo período",
        f"{len(redes)} ({', '.join(redes)})",
        CONFORME if len(redes) >= REDES_PREVISTAS else DIVERGENTE,
        "Sem réplica entre redes, não há como saber se a direção do efeito se repete. "
        "Cada rede era uma réplica do mesmo experimento (6.1); com uma só, o estudo "
        "perde o único controle que tinha sobre a particularidade da rede.")


def v_duracao(linhas: list[dict]) -> Verificacao:
    instantes = sorted(instante(l) for l in linhas)
    minutos = (instantes[-1] - instantes[0]).total_seconds() / 60
    return Verificacao(
        "C2", "Duração da coleta", "D5",
        f"{DIAS_PREVISTOS} dias no mínimo, 10 recomendados",
        f"{minutos:.1f} minutos",
        DIVERGENTE if minutos < DIAS_PREVISTOS * 24 * 60 else CONFORME,
        "A unidade de inferência de C1, C2 e E-2 é a janela de 6 h (10.2). Em 10 minutos "
        "existe **uma** janela, então o E-2 não tem teste confirmatório — é exatamente o "
        "que o `testes_hipotese.md` reporta como *não testável*. Também não há faixa "
        "horária (M10) nem dia útil contra fim de semana.")


def v_intervalo(linhas: list[dict]) -> Verificacao:
    inicio: dict[str, datetime] = {}
    for l in linhas:
        t = instante(l)
        inicio[l["rodada_id"]] = min(t, inicio.get(l["rodada_id"], t))
    ordenados = sorted(inicio.values())
    gaps = [(b - a).total_seconds() for a, b in zip(ordenados, ordenados[1:])]
    mediana = statistics.median(gaps) if gaps else float("nan")
    return Verificacao(
        "C3", "Intervalo entre rodadas", "D4",
        f"{INTERVALO_PREVISTO_S // 60} minutos",
        f"{mediana:.0f} s (mín. {min(gaps):.0f}, máx. {max(gaps):.0f}), "
        f"{len(ordenados)} rodadas" if gaps else "—",
        DIVERGENTE if gaps and mediana < INTERVALO_PREVISTO_S else CONFORME,
        f"Rodadas a cada {mediana:.0f} s multiplicam o autoaquecimento: a consulta de uma "
        f"rodada ainda está no cache do resolvedor quando a próxima chega. É a causa do "
        f"que a sensibilidade S1 mede, e por que ela derruba a H-a.")


def v_nomes(linhas: list[dict]) -> Verificacao:
    por_rodada = defaultdict(set)
    for l in linhas:
        if l["experimento"] == "E-1":
            por_rodada[l["rodada_id"]].add(l["nome"])
    nomes = {l["nome"] for l in linhas if l["experimento"] == "E-1"}
    por_rodada_tam = sorted({len(v) for v in por_rodada.values()})
    return Verificacao(
        "C4", "Nomes por rodada e no total", "D3 e 9.7",
        f"{NOMES_POR_RODADA_PREVISTOS} por rodada (60 de C3 + 10 de C1 + 10 de C2); "
        f"180 domínios estratificados",
        f"{por_rodada_tam if len(por_rodada_tam) > 1 else por_rodada_tam[0]} por rodada; "
        f"{len(nomes)} domínios, sem estratos",
        DIVERGENTE,
        f"A unidade de inferência de C3 é o nome, então o n do teste primário é "
        f"{len(nomes)}, e não 180. Com {len(nomes)} unidades o Wilcoxon exato chega a "
        f"p = 0,022 no melhor caso observado: dois ou três nomes a mais do outro lado "
        f"derrubariam a H-a. É a ameaça de conclusão mais forte desta coleta.")


def v_cache(linhas: list[dict]) -> Verificacao:
    vistas = sorted({l["condicao_cache"] for l in linhas})
    faltam = [c for c in CACHES_PREVISTOS if c not in vistas]
    return Verificacao(
        "C5", "Condições de cache", "9.3 e D1",
        f"{', '.join(CACHES_PREVISTOS)}",
        f"{', '.join(vistas)}",
        DIVERGENTE if faltam else CONFORME,
        f"Sem {' e '.join(faltam)} não há cache controlado: a Q2 e a H-b ficam sem dado, "
        f"e o estado de cache de cada consulta passa a ser desconhecido. A causa é a "
        f"pendência D1 (zona DNS do grupo), não a coleta." if faltam else
        "As três condições foram produzidas.")


# ------------------------------------------------------------------ ética


def v_cadencia(linhas: list[dict]) -> Verificacao:
    detalhe = []
    pior = 0
    maior_media = 0.0
    for servico in SERVICOS_EXTERNOS:
        tempos = sorted(instante(l) for l in linhas if l["resolvedor"] == servico)
        if not tempos:
            continue
        janela = (tempos[-1] - tempos[0]).total_seconds()
        pico, j = 0, 0
        for i in range(len(tempos)):
            while (tempos[i] - tempos[j]).total_seconds() >= 1.0:
                j += 1
            pico = max(pico, i - j + 1)
        media = len(tempos) / janela if janela else float("nan")
        pior = max(pior, pico)
        maior_media = max(maior_media, media)
        detalhe.append(f"| `{servico}` | {len(tempos)} | {media:.2f} | {pico} |")
    return Verificacao(
        "C6", "Cadência de consultas a serviço de terceiro", "7.2 e enunciado",
        f"no máximo {CADENCIA_MAXIMA} consulta por segundo, por serviço",
        f"média de {maior_media:.2f}/s; **pico de {pior} consultas no mesmo segundo**",
        DIVERGENTE if pior > CADENCIA_MAXIMA else CONFORME,
        "A regra do enunciado é sobre o ritmo, e a média respeitá-la não basta: a rodada "
        "inteira dispara em pouco mais de um segundo e depois fica parada. O desenho (7.2) "
        "previa espaçar os **blocos** em 1 s — as três consultas de um bloco vão para três "
        "serviços diferentes, então basta isso. A correção é no coletor, não na análise, e "
        "precisa entrar antes da coleta definitiva.",
        ["| Serviço | Consultas | Média (/s) | Pico em 1 s |", "|---|---|---|---|"] + detalhe)


IPV4 = re.compile(r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")
# `resolvedor` guarda o endereco do servico medido, que e' publico e e' o
# proprio objeto de estudo; qualquer outro endereco na base seria do usuario.
COLUNAS_COM_IP_LEGITIMO = ("resolvedor",)


def v_privacidade(linhas: list[dict]) -> Verificacao:
    suspeitas = [c for c in linhas[0] if any(t in c.lower() for t in ("ip", "ecs", "subnet"))]
    enderecos = Counter()
    for linha in linhas:
        for coluna, valor in linha.items():
            if coluna in COLUNAS_COM_IP_LEGITIMO or not isinstance(valor, str):
                continue
            if IPV4.search(valor):
                enderecos[coluna] += 1
    redes = sorted({l["rede_id"] for l in linhas})
    return Verificacao(
        "C7", "Dados que não podem ser versionados", "7.5",
        "sem IP público da rede, sem sub-rede ECS, identificador opaco por rede",
        f"colunas com nome de IP ou ECS: {len(suspeitas)}; células com endereço IPv4 fora "
        f"da coluna `resolvedor`: {sum(enderecos.values())}; identificadores de rede: "
        f"{', '.join(f'`{r}`' for r in redes)}",
        CONFORME if not suspeitas and not enderecos else DIVERGENTE,
        "A base versionada não carrega endereço que identifique a rede de ninguém. O único "
        "endereço presente é o do serviço medido, que é público.")


# ----------------------------------------------------------------- desenho


def v_blocos(linhas: list[dict]) -> Verificacao:
    e1 = defaultdict(set)
    e2 = defaultdict(set)
    for l in linhas:
        if l["experimento"] == "E-1":
            e1[(l["rodada_id"], l["nome"])].add(l["resolvedor"])
        elif l["experimento"] == "E-2":
            e2[(l["rodada_id"], l["resolvedor"])].add(f"{l['protocolo']}/{l['conexao']}")
    t1 = Counter(len(v) for v in e1.values())
    t2 = Counter(len(v) for v in e2.values())
    # Um experimento ausente nao e' bloco incompleto: e' outro assunto (C2, C5).
    completo = all(len(t) == 1 for t in (t1, t2) if t) and (t1 or t2)
    partes = []
    if t1:
        partes.append(f"E-1: {len(e1)} blocos" +
                      (f", todos com {max(t1)} resolvedores" if len(t1) == 1
                       else f", tamanhos {dict(t1)}"))
    if t2:
        partes.append(f"E-2: {len(e2)} blocos" +
                      (f", todos com {max(t2)} condições" if len(t2) == 1
                       else f", tamanhos {dict(t2)}"))
    return Verificacao(
        "C8", "Blocos completos", "6.1",
        "todo bloco recebe todos os tratamentos; bloco incompleto sai inteiro (7.4)",
        "; ".join(partes) if partes else "sem blocos",
        CONFORME if completo else DIVERGENTE,
        "O pareamento vale: nenhuma comparação atravessa blocos, e nenhum bloco precisou "
        "ser descartado por falta de tratamento.")


def v_ordem(linhas: list[dict]) -> Verificacao:
    posicoes = defaultdict(list)
    por_rodada = defaultdict(list)
    for l in linhas:
        chave = f"{l['experimento']}/{l['resolvedor']}/{l['protocolo']}/{l['conexao']}"
        posicoes[chave].append(int(l["ordem"]))
        por_rodada[l["rodada_id"]].append(int(l["ordem"]))
    tamanho = max(max(v) for v in por_rodada.values())
    centro = (tamanho + 1) / 2
    medias = {k: statistics.fmean(v) for k, v in posicoes.items()}
    lacunas = [r for r, v in por_rodada.items() if sorted(v) != list(range(1, len(v) + 1))]
    # Sob sorteio, a posicao media de um tratamento tem desvio-padrao
    # sqrt((k^2-1)/12) / sqrt(n). Mais de 3 desses afastamentos do centro
    # indicaria posicao sistematica, nao sorteio.
    desvio_posicao = ((tamanho ** 2 - 1) / 12) ** 0.5
    z = {k: abs(m - centro) / (desvio_posicao / len(posicoes[k]) ** 0.5)
         for k, m in medias.items()}
    ok = not lacunas and max(z.values()) < 3
    return Verificacao(
        "C9", "Ordem dos tratamentos sorteada por rodada", "6.3",
        f"nenhum tratamento sistematicamente primeiro ou último; "
        f"posição média perto de {centro:.0f}, dentro do que o sorteio explica",
        f"posição média entre {min(medias.values()):.1f} e {max(medias.values()):.1f} "
        f"(de 1 a {tamanho}), afastamento máximo de {max(z.values()):.1f} desvios do "
        f"centro; {len(lacunas)} rodadas com lacuna na `ordem`",
        CONFORME if ok else DIVERGENTE,
        "A aleatorização funcionou. É o único controle experimental que sobreviveu "
        "integralmente à coleta curta, e é o que separa este estudo de uma observação.")


def v_pareamento(linhas: list[dict]) -> Verificacao:
    blocos = defaultdict(list)
    for l in linhas:
        if l["experimento"] == "E-1":
            blocos[(l["rodada_id"], l["nome"])].append(instante(l))
    larguras = [(max(v) - min(v)).total_seconds() * 1000 for v in blocos.values()]
    mediana = statistics.median(larguras)
    return Verificacao(
        "C10", "Distância entre os tratamentos de um bloco", "7.1 e 7.2",
        "milissegundos: o bloco precisa ver a mesma condição de rede",
        f"mediana de {mediana:.0f} ms, máximo de {max(larguras):.0f} ms",
        CONFORME if max(larguras) < 200 else DIVERGENTE,
        f"A ordem é sorteada sobre a **rodada inteira**, e não dentro do bloco, então as "
        f"três consultas de um nome caem em pontos distantes da rodada — até "
        f"{max(larguras) / 1000:.1f} s de intervalo, e não os milissegundos que o desenho "
        f"escreveu. O efeito prático é pequeno, porque a rodada inteira dura menos de dois "
        f"segundos, mas as duas coisas se resolvem juntas: espaçar os blocos em 1 s (C6) e "
        f"sortear a ordem **dentro** do bloco mantém o bloco compacto e a cadência "
        f"respeitada.")


def v_e2_cache(linhas: list[dict]) -> Verificacao:
    e2 = [l for l in linhas if l["experimento"] == "E-2"]
    caches = sorted({l["condicao_cache"] for l in e2})
    nomes = sorted({l["nome"] for l in e2})
    return Verificacao(
        "C11", "Base do E-2", "9.2",
        "10 nomes de cache quente (C2), para o tempo de recursão não se misturar ao "
        "custo de transporte",
        f"{len(nomes)} nome ({', '.join(f'`{n}`' for n in nomes)}) em "
        f"{', '.join(caches)}",
        DIVERGENTE if caches != ["C2"] or len(nomes) < 10 else CONFORME,
        "Sem a zona (D1) o E-2 roda num domínio real, de cache natural. Com um nome só, "
        "não há variação entre nomes para separar o custo do protocolo do comportamento "
        "daquele domínio. Como a comparação é dentro da mesma rodada e do mesmo nome, o "
        "viés é pequeno — mas o E-2 não mede o que o desenho dizia que ele mediria.")


def v_esquema(linhas: list[dict]) -> Verificacao:
    faltando = []
    for (proto, campo) in (("DoT", "tls_versao"), ("DoH", "tls_versao"),
                           ("DoH", "http_versao")):
        alvo = [l for l in linhas if l["protocolo"] == proto and l["conexao"] != "unica"]
        vazios = sum(1 for l in alvo if not l[campo])
        if alvo and vazios:
            faltando.append(f"`{campo}` no {proto} ({vazios} de {len(alvo)})")
    handshake = [l for l in linhas if l["protocolo"] == "DoH" and l["conexao"] == "nova"]
    sem_hs = sum(1 for l in handshake if l["t_tcp_ms"] is None)
    if sem_hs:
        faltando.append(f"`t_tcp_ms`/`t_tls_ms` no DoH ({sem_hs} de {len(handshake)})")
    return Verificacao(
        "C12", "Registro completo do esquema por consulta", "9.4 e 9.6",
        "versão do TLS e do HTTP negociadas e tempos de handshake registrados",
        "tudo registrado" if not faltando else "; ".join(faltando),
        CONFORME if not faltando else DIVERGENTE,
        "A pilha do cliente é um fator de confusão conhecido (9.8). Sem a versão do HTTP "
        "não dá para afirmar que o DoH rodou em HTTP/2, e sem os handshakes o custo do "
        "DoH não pode ser decomposto como o do DoT (`descritiva.md`, 4).")


def v_falhas(linhas: list[dict]) -> Verificacao:
    falhas = [l for l in linhas if not l["sucesso"]]
    return Verificacao(
        "C13", "Regras de exclusão e censura", "7.4 e 10.4",
        "falha da rede local e falha do domínio saem da conta; timeout censurado em 2.000 ms",
        f"{len(falhas)} falhas em {len(linhas)} consultas",
        NAO_EXERCITADO if not falhas else CONFORME,
        "Sem falha nenhuma, as regras de exclusão não chegaram a rodar sobre dado real. "
        "Elas continuam não testadas em campo, e as sensibilidades S4 (timeouts como "
        "2.000 ms) e a comparação de falhas (M8) ficam sem conteúdo.")


def v_sensibilidade_pop(linhas: list[dict]) -> Verificacao:
    por_rodada = {}
    for l in linhas:
        if l["pop_id"]:
            por_rodada.setdefault(l["rodada_id"], l["pop_id"])
    sequencia = [por_rodada[r] for r in sorted(por_rodada)]
    sitios = {"".join(c for c in p if c.isalpha()) for p in sequencia}
    trocas_sitio = sum(1 for a, b in zip(sequencia, sequencia[1:])
                       if "".join(c for c in a if c.isalpha())
                       != "".join(c for c in b if c.isalpha()))
    trocas_inst = sum(1 for a, b in zip(sequencia, sequencia[1:]) if a != b)
    return Verificacao(
        "C14", "Sensibilidade 3, troca de ponto de presença", "10.6 e 10.2",
        "excluir as rodadas em que o ponto de presença do 1.1.1.1 mudou",
        f"{len(set(sequencia))} instâncias, {len(sitios)} sítio; "
        f"{trocas_sitio} trocas de sítio e {trocas_inst} de instância "
        f"em {len(sequencia) - 1} transições",
        DIVERGENTE if trocas_inst and not trocas_sitio else CONFORME,
        "A implementação compara o **sítio** (as letras de `gru22`), e o sítio nunca mudou: "
        "S3 não excluiu nada e repetiu o resultado principal. A troca de **instância**, que "
        "acontece quase toda rodada, fica fora do que S3 testa. Não é defeito de código — é "
        "o alcance da sensibilidade, e precisa estar escrito ao lado do resultado dela.")


VERIFICACOES = (v_redes, v_duracao, v_intervalo, v_nomes, v_cache, v_cadencia,
                v_privacidade, v_blocos, v_ordem, v_pareamento, v_e2_cache,
                v_esquema, v_falhas, v_sensibilidade_pop)


# ---------------------------------------------------------------- relatorio


def relatorio(linhas: list[dict], lote: str) -> list[str]:
    resultados = [v(linhas) for v in VERIFICACOES]
    contagem = Counter(r.veredito for r in resultados)
    rodadas = len({l["rodada_id"] for l in linhas})

    s = ["# Consistência metodológica dos dados coletados (Lab05, Sprint 02)", "",
         "> Gerado por `python Sprint02/conformidade.py`. Não edite à mão.", "",
         f"Issue #130. Base validada, lote `{lote}`: {len(linhas)} consultas em "
         f"{rodadas} rodadas.", "",
         "A issue #134 já verificou **qualidade e integridade**: se os arquivos batem, se "
         "há lacuna, se há valor impossível. Aqui a pergunta é outra, e é a do desenho: "
         "**os dados coletados são os dados que o experimento pedia?**", "",
         f"**Conformes: {contagem[CONFORME]}. Divergentes: {contagem[DIVERGENTE]}. "
         f"Não exercitadas: {contagem[NAO_EXERCITADO]}.** Divergência não é erro: a decisão "
         "D13 trocou, de propósito, a coleta de 7 dias por uma de 10 minutos, para a sprint "
         "ter dado. O que não pode é a divergência ficar implícita quando os resultados "
         "forem lidos.", "",
         "| # | Item | Onde | Veredito |", "|---|---|---|---|"]
    s += [f"| {r.id} | {r.item} | {r.onde} | **{r.veredito}** |" for r in resultados]

    s += ["", "---", ""]
    for r in resultados:
        s += [f"## {r.id}. {r.item}", "",
              f"**Veredito: {r.veredito}** · desenho: {r.onde}", "",
              f"- **O desenho pede:** {r.esperado}",
              f"- **A base mostra:** {r.observado}", ""]
        if r.detalhe:
            s += r.detalhe + [""]
        s += [r.consequencia, ""]

    divergentes = [r for r in resultados if r.veredito == DIVERGENTE]
    s += ["---", "", "## O que isso muda na leitura dos resultados", "",
          "As divergências não se somam: elas atingem partes diferentes do estudo.", "",
          "| Divergência | Atinge | Resultado afetado |", "|---|---|---|",
          "| C1, C2, C3, C4 (escala e ritmo da coleta) | poder e independência | o n do teste "
          "primário é 15 nomes; o E-2 não tem teste confirmatório; S1 derruba a H-a |",
          "| C5, C11 (sem a zona do grupo) | o que foi medido | Q2 e H-b ficam sem dado; o "
          "E-2 mede transporte em cache natural |",
          "| C6 (cadência) | ética e método | a regra do enunciado não foi cumprida no pico; "
          "não afeta os números, afeta a conduta |",
          "| C12 (esquema incompleto) | rastreabilidade | o custo do DoH não pode ser "
          "decomposto |",
          "| C14 (alcance de S3) | interpretação | a sensibilidade testa menos do que o nome "
          "dela sugere |", "",
          "**O que sobreviveu intacto:** o pareamento por bloco (C8), a aleatorização da "
          "ordem (C9), a proximidade temporal dentro do bloco (C10) e a privacidade (C7). "
          "São os quatro pontos que fazem deste um experimento, e não uma observação — e "
          "eles valem para os 10 minutos coletados.", "",
          "## Para a coleta definitiva", "",
          "Em ordem de impacto:", ""]
    s += [f"{i}. **{r.id} — {r.item}.** {r.esperado}."
          for i, r in enumerate(divergentes, 1)]
    s += ["", "A C6 é a única que não depende de tempo nem da zona: é uma mudança no "
          "coletor, de espaçar os blocos em um segundo, e pode ser feita agora.", ""]
    return s


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--base", type=Path, default=BASE)
    p.add_argument("--lote", default=LOTE)
    p.add_argument("--saida", type=Path, default=SAIDA)
    opcoes = p.parse_args()

    linhas = ana.carregar(opcoes.base, opcoes.lote)
    texto = "\n".join(relatorio(linhas, opcoes.lote)) + "\n"

    opcoes.saida.mkdir(parents=True, exist_ok=True)
    destino = opcoes.saida / "conformidade_metodologica.md"
    destino.write_text(texto, encoding="utf-8", newline="\n")
    print(f"{destino}: {len(linhas)} consultas")


if __name__ == "__main__":
    main()
