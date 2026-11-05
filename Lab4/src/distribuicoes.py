"""Distribuições de probabilidade que os testes do Lab04 precisam (Lab04, par P2).

A biblioteca padrão traz média, desvio e quantis em `statistics`, mas não traz
as distribuições acumuladas de que um p-valor depende. Como o laboratório é
"Testes de Hipótese por Dentro", elas são implementadas aqui em vez de virem
de uma biblioteca — o Lab04 segue sem dependências externas, como
`coleta.py` e `descritiva.py`.

São três peças:

    t de Student      p-valor e intervalo de confiança do teste t pareado
    normal            aproximação do Wilcoxon quando há empates ou zeros
    Wilcoxon exata    distribuição de W+ sob H0, por contagem

Os valores são conferidos contra tabela em tests/test_distribuicoes.py e,
quando o SciPy está instalado, contra ele em tests/test_conferencia_scipy.py.
"""

from __future__ import annotations

import math
from functools import lru_cache

# Precisão e teto de iterações da fração continuada. 1e-14 fica perto do
# limite do float de 64 bits; 300 termos nunca foram atingidos nos testes.
_EPS = 1e-14
_MAX_ITER = 300


# ---------------------------------------------------------------- normal ----

def normal_cdf(z: float) -> float:
    """P(Z <= z) para a normal padrão."""
    return 0.5 * math.erfc(-z / math.sqrt(2.0))


# ------------------------------------------------------ beta incompleta ----

def _beta_continuada(x: float, a: float, b: float) -> float:
    """Fração continuada de I_x(a, b), pelo método modificado de Lentz.

    É a parte que não tem forma fechada; o resto de
    beta_incompleta_regularizada() é só o fator na frente.
    """
    minusculo = 1e-300
    c = 1.0
    d = 1.0 - (a + b) * x / (a + 1.0)
    if abs(d) < minusculo:
        d = minusculo
    d = 1.0 / d
    resultado = d

    for m in range(1, _MAX_ITER + 1):
        m2 = 2 * m
        # passo par
        numerador = m * (b - m) * x / ((a + m2 - 1.0) * (a + m2))
        d = 1.0 + numerador * d
        if abs(d) < minusculo:
            d = minusculo
        c = 1.0 + numerador / c
        if abs(c) < minusculo:
            c = minusculo
        d = 1.0 / d
        resultado *= d * c
        # passo ímpar
        numerador = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1.0))
        d = 1.0 + numerador * d
        if abs(d) < minusculo:
            d = minusculo
        c = 1.0 + numerador / c
        if abs(c) < minusculo:
            c = minusculo
        d = 1.0 / d
        delta = d * c
        resultado *= delta
        if abs(delta - 1.0) < _EPS:
            return resultado
    raise RuntimeError(f"a fração continuada da beta não convergiu (x={x}, a={a}, b={b})")


def beta_incompleta_regularizada(x: float, a: float, b: float) -> float:
    """I_x(a, b), a função beta incompleta regularizada.

    Vale 0 em x=0 e 1 em x=1. A fração continuada converge rápido só na
    metade esquerda, então para x grande usa-se a simetria
    I_x(a,b) = 1 - I_{1-x}(b,a).
    """
    if not 0.0 <= x <= 1.0:
        raise ValueError(f"x fora de [0, 1]: {x}")
    if x in (0.0, 1.0):
        return x
    frente = math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + a * math.log(x) + b * math.log1p(-x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return frente * _beta_continuada(x, a, b) / a
    return 1.0 - math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + b * math.log1p(-x) + a * math.log(x)
    ) * _beta_continuada(1.0 - x, b, a) / b


# ---------------------------------------------------------- t de Student ----

def t_cdf(t: float, gl: int) -> float:
    """P(T <= t) para a t de Student com `gl` graus de liberdade."""
    if gl < 1:
        raise ValueError(f"graus de liberdade inválidos: {gl}")
    if t == 0.0:
        return 0.5
    x = gl / (gl + t * t)
    cauda = 0.5 * beta_incompleta_regularizada(x, gl / 2.0, 0.5)
    return 1.0 - cauda if t > 0 else cauda


def t_sobrevivencia(t: float, gl: int) -> float:
    """P(T > t). É o p-valor unilateral "maior que" do teste t.

    Calculada direto pela cauda, e não como 1 - t_cdf(t): para t grande, a
    subtração perderia todos os dígitos significativos justamente onde o
    p-valor interessa (a cauda minúscula).
    """
    if gl < 1:
        raise ValueError(f"graus de liberdade inválidos: {gl}")
    if t == 0.0:
        return 0.5
    x = gl / (gl + t * t)
    cauda = 0.5 * beta_incompleta_regularizada(x, gl / 2.0, 0.5)
    return cauda if t > 0 else 1.0 - cauda


def t_quantil(p: float, gl: int) -> float:
    """O t tal que P(T <= t) = p. Obtido por bisseção sobre t_cdf().

    Bisseção e não Newton: é monótona, não precisa da derivada e converge
    sempre. Com ~200 iterações o intervalo chega ao limite do float.
    """
    if not 0.0 < p < 1.0:
        raise ValueError(f"p fora de (0, 1): {p}")
    if gl < 1:
        raise ValueError(f"graus de liberdade inválidos: {gl}")
    if p == 0.5:
        return 0.0
    baixo, alto = -1.0, 1.0
    while t_cdf(baixo, gl) > p:
        baixo *= 2.0
    while t_cdf(alto, gl) < p:
        alto *= 2.0
    for _ in range(200):
        meio = (baixo + alto) / 2.0
        if t_cdf(meio, gl) < p:
            baixo = meio
        else:
            alto = meio
        if alto - baixo < _EPS * max(1.0, abs(meio)):
            break
    return (baixo + alto) / 2.0


# ------------------------------------------------------ Wilcoxon exata ----

@lru_cache(maxsize=None)
def distribuicao_wilcoxon(n: int) -> tuple[int, ...]:
    """Distribuição exata de W+ sob H0, para `n` diferenças sem empates.

    Sob H0 cada diferença tem a mesma chance de ser positiva ou negativa, e
    os postos são 1..n. Então W+ é a soma de um subconjunto qualquer de
    {1, ..., n}, e os 2^n subconjuntos são igualmente prováveis.

    Devolve `contagens`, em que contagens[s] é quantos subconjuntos somam s
    (s vai de 0 a n(n+1)/2). É a contagem, não a probabilidade: dividir por
    2^n só no fim evita acumular erro de ponto flutuante.

    Memorizada porque no Monte Carlo o mesmo n se repete milhares de vezes.
    """
    if n < 0:
        raise ValueError(f"n negativo: {n}")
    maximo = n * (n + 1) // 2
    contagens = [0] * (maximo + 1)
    contagens[0] = 1
    for posto in range(1, n + 1):
        # percorrido de trás para frente: cada posto entra no máximo uma vez
        for soma in range(maximo, posto - 1, -1):
            contagens[soma] += contagens[soma - posto]
    return tuple(contagens)


def wilcoxon_p_exato(w_mais: float, n: int) -> float:
    """P(W+ >= w_mais) sob H0: o p-valor exato, unilateral "maior que".

    Só vale sem empates e sem zeros, quando os postos são exatamente
    1..n — por isso quem chama (src/testes.py) verifica isso antes.
    """
    contagens = distribuicao_wilcoxon(n)
    limite = math.ceil(w_mais - 1e-9)  # w_mais é inteiro aqui, a folga é defensiva
    if limite <= 0:
        return 1.0
    if limite > len(contagens) - 1:
        return 0.0
    return sum(contagens[limite:]) / 2.0**n
