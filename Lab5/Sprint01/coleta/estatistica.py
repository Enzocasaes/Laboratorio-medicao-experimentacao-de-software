"""Estatistica da secao 10, escrita do zero (Lab05, Participante C).

POR QUE SEM SCIPY E SEM PANDAS. O Lab04 deste mesmo repositorio ja' roda com
biblioteca padrao apenas, e a CI do grupo nao faz `pip install`. O ambiente de
**coleta** precisa do dnspython; o de **analise** nao precisa de mais nada, e
manter assim significa que qualquer integrante consegue refazer os numeros sem
montar ambiente.

O QUE TEM AQUI, E O QUE CADA COISA RESOLVE

- `mediana`, `percentil`, `iqr`: a descritiva da secao 10.1. Percentil por
  interpolacao linear, o mesmo criterio do `statistics.quantiles`.
- `wilcoxon_pareado`: o teste par a par da secao 10.3. Distribuicao exata ate'
  n = 25 (contagem dos 2^n subconjuntos por programacao dinamica) e
  aproximacao normal com correcao de continuidade e de empates acima disso.
- `friedman`: o teste dos tres resolvedores da secao 10.3, com p pela
  aproximacao qui-quadrado.
- `holm`: a correcao de multiplicidade da secao 10.3.
- `bootstrap_conglomerado`: o IC da secao 10.5. Reamostra **unidades de
  inferencia** inteiras, nao consultas: consultas do mesmo nome nao sao
  independentes, e reamostra-las individualmente estreitaria o IC a toa.
- `cliff_delta`: o tamanho de efeito descritivo da M4.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from functools import lru_cache

Z_975 = 1.959963984540054


# --------------------------------------------------------- descritiva


def mediana(valores: list[float]) -> float:
    if not valores:
        raise ValueError("mediana de lista vazia")
    ordenados = sorted(valores)
    meio = len(ordenados) // 2
    if len(ordenados) % 2:
        return ordenados[meio]
    return (ordenados[meio - 1] + ordenados[meio]) / 2


def percentil(valores: list[float], p: float) -> float:
    """Percentil por interpolacao linear (mesmo criterio do statistics)."""
    if not valores:
        raise ValueError("percentil de lista vazia")
    ordenados = sorted(valores)
    if len(ordenados) == 1:
        return ordenados[0]
    posicao = (len(ordenados) - 1) * (p / 100.0)
    baixo = math.floor(posicao)
    alto = math.ceil(posicao)
    if baixo == alto:
        return ordenados[int(posicao)]
    return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (posicao - baixo)


def iqr(valores: list[float]) -> float:
    return percentil(valores, 75) - percentil(valores, 25)


# ------------------------------------------------------- distribuicoes


def normal_cdf(z: float) -> float:
    return 0.5 * math.erfc(-z / math.sqrt(2))


def qui2_sobrevivencia(x: float, gl: int) -> float:
    """P(X^2 > x) com `gl` graus de liberdade.

    Com gl par ha' forma fechada (soma finita); com gl impar entra a funcao
    erro. Os casos deste laboratorio sao gl = 2 (tres resolvedores) e gl = 1.
    """
    if x <= 0:
        return 1.0
    if gl == 1:
        return math.erfc(math.sqrt(x / 2))
    if gl % 2 == 0:
        termo = math.exp(-x / 2)
        soma = termo
        for k in range(1, gl // 2):
            termo *= x / (2 * k)
            soma += termo
        return min(1.0, soma)
    # gl impar > 1: recorrencia a partir de gl = 1
    soma = math.erfc(math.sqrt(x / 2))
    termo = math.sqrt(2 * x / math.pi) * math.exp(-x / 2)
    for k in range(3, gl + 1, 2):
        soma += termo
        termo *= x / (k - 2 + 2)
    return min(1.0, soma)


@lru_cache(maxsize=64)
def _distribuicao_wilcoxon(n: int) -> tuple[int, ...]:
    """Quantos subconjuntos de {1..n} somam cada valor (W+ sob H0)."""
    maximo = n * (n + 1) // 2
    contagens = [0] * (maximo + 1)
    contagens[0] = 1
    for posto in range(1, n + 1):
        for soma in range(maximo, posto - 1, -1):
            contagens[soma] += contagens[soma - posto]
    return tuple(contagens)


def _postos_medios(valores: list[float]) -> list[float]:
    indices = sorted(range(len(valores)), key=lambda i: valores[i])
    postos = [0.0] * len(valores)
    i = 0
    while i < len(indices):
        j = i
        while j + 1 < len(indices) and valores[indices[j + 1]] == valores[indices[i]]:
            j += 1
        medio = (i + j) / 2 + 1
        for k in range(i, j + 1):
            postos[indices[k]] = medio
        i = j + 1
    return postos


@dataclass
class Wilcoxon:
    n_total: int
    n_usado: int
    estatistica: float      # W+
    p_valor: float          # bilateral
    metodo: str             # exato | normal | indefinido
    r: float                # |Z|/sqrt(n), o tamanho de efeito da M4(a)


def wilcoxon_pareado(diferencas: list[float], exato_ate: int = 25) -> Wilcoxon:
    """Wilcoxon de postos sinalizados, bilateral (secao 10.3).

    Pares com diferenca zero sao descartados, como no Lab02. Com empates em
    |d| o p exato deixa de valer e o metodo cai para a normal, registrando
    isso — escolher em silencio esconderia a aproximacao.
    """
    usados = [d for d in diferencas if d != 0]
    n = len(usados)
    if n == 0:
        return Wilcoxon(len(diferencas), 0, 0.0, 1.0, "indefinido", 0.0)

    absolutos = [abs(d) for d in usados]
    postos = _postos_medios(absolutos)
    w_mais = sum(p for p, d in zip(postos, usados) if d > 0)
    tem_empates = len(set(absolutos)) != n

    media = n * (n + 1) / 4
    # correcao de empates na variancia
    grupos: dict[float, int] = {}
    for valor in absolutos:
        grupos[valor] = grupos.get(valor, 0) + 1
    ajuste = sum(t**3 - t for t in grupos.values()) / 48.0
    variancia = n * (n + 1) * (2 * n + 1) / 24.0 - ajuste
    z = 0.0 if variancia <= 0 else (w_mais - media) / math.sqrt(variancia)

    if n <= exato_ate and not tem_empates:
        contagens = _distribuicao_wilcoxon(n)
        total = float(sum(contagens))
        alvo = int(round(w_mais))
        cauda_inf = sum(contagens[:alvo + 1]) / total
        cauda_sup = sum(contagens[alvo:]) / total
        p = min(1.0, 2 * min(cauda_inf, cauda_sup))
        metodo = "exato"
    else:
        correcao = 0.5 if variancia > 0 else 0.0
        z_cc = 0.0 if variancia <= 0 else \
            (abs(w_mais - media) - correcao) / math.sqrt(variancia)
        p = min(1.0, 2 * (1 - normal_cdf(abs(z_cc))))
        metodo = "normal"

    return Wilcoxon(len(diferencas), n, w_mais, p, metodo,
                    abs(z) / math.sqrt(n) if n else 0.0)


@dataclass
class Friedman:
    k: int                  # tratamentos
    n: int                  # blocos
    estatistica: float
    gl: int
    p_valor: float
    postos_medios: dict[str, float]


def friedman(blocos: list[dict[str, float]]) -> Friedman:
    """Friedman sobre blocos completos (secao 10.3).

    Cada bloco e' um dicionario tratamento -> valor; blocos com algum
    tratamento ausente sao descartados, porque o teste exige blocos completos.
    """
    completos = [b for b in blocos if b and len(b) == len(blocos[0])]
    if not completos:
        raise ValueError("nenhum bloco completo")
    tratamentos = sorted(completos[0])
    k, n = len(tratamentos), len(completos)

    soma_postos = {t: 0.0 for t in tratamentos}
    for bloco in completos:
        valores = [bloco[t] for t in tratamentos]
        for tratamento, posto in zip(tratamentos, _postos_medios(valores)):
            soma_postos[tratamento] += posto

    estatistica = (12.0 / (n * k * (k + 1))) * \
        sum(s * s for s in soma_postos.values()) - 3 * n * (k + 1)
    gl = k - 1
    return Friedman(k, n, estatistica, gl, qui2_sobrevivencia(estatistica, gl),
                    {t: soma_postos[t] / n for t in tratamentos})


def holm(p_valores: dict[str, float]) -> dict[str, float]:
    """Correcao de Holm (secao 10.3): controla o erro global sem o
    conservadorismo do Bonferroni."""
    itens = sorted(p_valores.items(), key=lambda kv: kv[1])
    m = len(itens)
    ajustados: dict[str, float] = {}
    maior = 0.0
    for i, (chave, p) in enumerate(itens):
        valor = min(1.0, (m - i) * p)
        maior = max(maior, valor)  # mantem a monotonicidade
        ajustados[chave] = maior
    return ajustados


# ---------------------------------------------------------- bootstrap


def bootstrap_conglomerado(unidades: list[list[float]], estatistica,
                           replicas: int = 10_000, semente: int = 42,
                           nivel: float = 95.0) -> tuple[float, float, float]:
    """IC percentil reamostrando **unidades inteiras** (secao 10.5).

    `unidades` e' uma lista de conglomerados; cada um traz todas as suas
    observacoes. Reamostrar consultas individuais trataria como independentes
    observacoes do mesmo nome, que nao sao, e estreitaria o IC artificialmente.
    """
    if not unidades:
        raise ValueError("bootstrap sem unidades")
    observado = estatistica([x for u in unidades for x in u])
    sorteio = random.Random(semente)
    quantidade = len(unidades)
    replicadas = []
    for _ in range(replicas):
        amostra = [unidades[sorteio.randrange(quantidade)] for _ in range(quantidade)]
        planas = [x for u in amostra for x in u]
        if planas:
            replicadas.append(estatistica(planas))
    if not replicadas:
        return observado, float("nan"), float("nan")
    cauda = (100.0 - nivel) / 2.0
    return observado, percentil(replicadas, cauda), percentil(replicadas, 100 - cauda)


def wilson(sucessos: int, total: int, z: float = Z_975) -> tuple[float, float]:
    """IC de Wilson para uma proporcao (M8). Descritivo: nao usa conglomerado."""
    if total <= 0:
        return 0.0, 0.0
    p = sucessos / total
    z2 = z * z
    denominador = 1 + z2 / total
    centro = (p + z2 / (2 * total)) / denominador
    meia = z / denominador * math.sqrt(p * (1 - p) / total + z2 / (4 * total * total))
    return max(0.0, centro - meia), min(1.0, centro + meia)


def cliff_delta(a: list[float], b: list[float]) -> tuple[float, str]:
    """Delta de Cliff e o rotulo de Romano et al. (M4b).

    Descritivo: ignora o pareamento de proposito, para dar uma leitura de
    "com que frequencia um e' menor que o outro" independente dos blocos.
    """
    if not a or not b:
        return 0.0, "indefinido"
    maiores = menores = 0
    for x in a:
        for y in b:
            if x > y:
                maiores += 1
            elif x < y:
                menores += 1
    delta = (menores - maiores) / (len(a) * len(b))  # >0: `a` tende a ser MENOR
    absoluto = abs(delta)
    if absoluto < 0.147:
        rotulo = "desprezivel"
    elif absoluto < 0.33:
        rotulo = "pequeno"
    elif absoluto < 0.474:
        rotulo = "medio"
    else:
        rotulo = "grande"
    return delta, rotulo
