"""Gráficos G1 e G2 do dashboard, em SVG (Lab04 — Issues #100 e #101).

POR QUE SVG ESCRITO À MÃO, E NÃO MATPLOTLIB

O resto do Lab04 roda com a biblioteca padrão e nada mais: a coleta, os dois
testes e a simulação. Trazer Matplotlib só para desenhar faria o dashboard
exigir instalação, e o enunciado pede que ele abra com um único comando.
SVG é texto, o navegador já sabe desenhá-lo, e o arquivo gerado é um HTML
único que abre com dois cliques — sem servidor e sem `pip install`.

O QUE CADA GRÁFICO RESPONDE

G1 — "com que dados estamos lidando?" Histogramas dos grupos reais e dos
     cenários simulados, lado a lado. O que importa aqui é a FORMA: é ela que
     separa os dois testes, e é dela que a simulação precisa para ser
     realista.

G2 — "como um teste decide?" A distribuição da estatística sob H0, a região
     de rejeição e o p-valor de um exemplo desenhado como ÁREA. É a figura
     que transforma "p = 0,0076" de um número solto em um pedaço de área sob
     a curva.

CORES

Duas séries, uma cor fixa para cada, em todos os gráficos:
    teste t  -> azul      #1a6aa8
    Wilcoxon -> laranja   #d97706
O par foi conferido quanto a daltonismo (separação protan ΔE 24,1) e a
contraste contra o fundo (ambos acima de 3:1). Em G1 não há duas séries
concorrentes: os histogramas usam uma única matiz, e reais e simulados se
distinguem pela posição, pelo rótulo e pelo tom.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# ---------------------------------------------------------------- aparência

AZUL = "#1a6aa8"        # teste t
LARANJA = "#d97706"     # Wilcoxon
TINTA = "#1f2328"       # texto principal
TINTA_FRACA = "#5b6472"  # texto secundário
GRADE = "#dde3ea"
EIXO = "#94a3b8"
REAL = "#17567f"        # histogramas de dados reais
SIMULADO = "#7ba7c7"    # histogramas de dados simulados
REJEICAO = "#e9eef4"    # faixa da região de rejeição

FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"


def escapar(texto: str) -> str:
    """Escapa o que não pode entrar cru em XML."""
    return (
        str(texto)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def numero(valor: float, casas: int = 2) -> str:
    """Formata no padrão brasileiro: vírgula decimal, ponto de milhar."""
    texto = f"{valor:,.{casas}f}"
    return texto.replace(",", "\u0001").replace(".", ",").replace("\u0001", ".")


# ---------------------------------------------------------------- primitivas


@dataclass(frozen=True)
class Escala:
    """Converte um valor do dado em uma coordenada de tela (linear).

    `inicio_px` pode ser maior que `fim_px`: é assim que o eixo vertical é
    invertido, já que em SVG o y cresce para baixo.
    """

    minimo: float
    maximo: float
    inicio_px: float
    fim_px: float

    def px(self, valor: float) -> float:
        if self.maximo == self.minimo:  # série constante: tudo no meio
            return (self.inicio_px + self.fim_px) / 2
        fracao = (valor - self.minimo) / (self.maximo - self.minimo)
        return self.inicio_px + fracao * (self.fim_px - self.inicio_px)


def texto(x: float, y: float, conteudo: str, *, tamanho: float = 11,
          cor: str = TINTA, ancora: str = "start", negrito: bool = False,
          angulo: float | None = None) -> str:
    peso = ' font-weight="600"' if negrito else ""
    giro = f' transform="rotate({angulo} {x:.1f} {y:.1f})"' if angulo else ""
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONTE}" '
        f'font-size="{tamanho}" fill="{cor}" text-anchor="{ancora}"{peso}{giro}>'
        f"{escapar(conteudo)}</text>"
    )


def linha(x1: float, y1: float, x2: float, y2: float, *, cor: str = EIXO,
          largura: float = 1, tracejado: str | None = None) -> str:
    traco = f' stroke-dasharray="{tracejado}"' if tracejado else ""
    return (
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="{cor}" stroke-width="{largura}"{traco}/>'
    )


def retangulo(x: float, y: float, largura: float, altura: float, *,
              cor: str, opacidade: float = 1.0, borda: str | None = None) -> str:
    traco = f' stroke="{borda}" stroke-width="0.6"' if borda else ""
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(largura, 0):.1f}" '
        f'height="{max(altura, 0):.1f}" fill="{cor}" '
        f'fill-opacity="{opacidade}"{traco}/>'
    )


def area(pontos: list[tuple[float, float]], base_y: float, *, cor: str,
         opacidade: float = 1.0) -> str:
    """Polígono fechado contra uma linha de base — usado nas áreas de p-valor."""
    if not pontos:
        return ""
    passos = " ".join(f"L{x:.1f},{y:.1f}" for x, y in pontos[1:])
    return (
        f'<path d="M{pontos[0][0]:.1f},{base_y:.1f} L{pontos[0][0]:.1f},{pontos[0][1]:.1f} '
        f'{passos} L{pontos[-1][0]:.1f},{base_y:.1f} Z" fill="{cor}" '
        f'fill-opacity="{opacidade}"/>'
    )


def curva(pontos: list[tuple[float, float]], *, cor: str, largura: float = 2) -> str:
    if not pontos:
        return ""
    passos = " ".join(f"L{x:.1f},{y:.1f}" for x, y in pontos[1:])
    return (
        f'<path d="M{pontos[0][0]:.1f},{pontos[0][1]:.1f} {passos}" fill="none" '
        f'stroke="{cor}" stroke-width="{largura}" stroke-linejoin="round"/>'
    )


def svg(largura: float, altura: float, corpo: str, *, titulo: str) -> str:
    """Embrulha os elementos num <svg> acessível (com <title> para leitores de tela)."""
    return (
        f'<svg viewBox="0 0 {largura:.0f} {altura:.0f}" width="100%" '
        f'role="img" aria-label="{escapar(titulo)}" '
        f'xmlns="http://www.w3.org/2000/svg">'
        f"<title>{escapar(titulo)}</title>{corpo}</svg>"
    )


# ---------------------------------------------------------------- eixos


def marcas_bonitas(minimo: float, maximo: float, alvo: int = 5,
                   inteiro: bool = False) -> list[float]:
    """Escolhe marcas de eixo em passos de 1, 2 ou 5 vezes uma potência de 10.

    Eixo com marcas em 0,37 / 0,74 / 1,11 é ilegível; em 0,5 / 1,0 / 1,5, não.
    """
    if maximo <= minimo:
        return [minimo]
    bruto = (maximo - minimo) / alvo
    potencia = 10 ** math.floor(math.log10(bruto))
    # num eixo de contagem, 2,5 viraria a marca "2" depois de arredondada
    fatores = (1, 2, 5, 10) if inteiro else (1, 2, 2.5, 5, 10)
    for fator in fatores:
        passo = fator * potencia
        if bruto <= passo:
            break
    inicio = math.ceil(minimo / passo) * passo
    marcas = []
    valor = inicio
    while valor <= maximo + passo * 1e-9:
        marcas.append(round(valor, 10))
        valor += passo
    return marcas


def eixo_horizontal(escala: Escala, y: float, *, casas: int = 1,
                    rotulo: str | None = None, alvo: int = 4) -> str:
    partes = [linha(escala.inicio_px, y, escala.fim_px, y, cor=EIXO)]
    for marca in marcas_bonitas(escala.minimo, escala.maximo, alvo):
        x = escala.px(marca)
        partes.append(linha(x, y, x, y + 4, cor=EIXO))
        partes.append(texto(x, y + 15, numero(marca, casas), tamanho=9.5,
                            cor=TINTA_FRACA, ancora="middle"))
    if rotulo:
        meio = (escala.inicio_px + escala.fim_px) / 2
        partes.append(texto(meio, y + 31, rotulo, tamanho=10, cor=TINTA_FRACA,
                            ancora="middle"))
    return "".join(partes)


# ---------------------------------------------------------------- histograma


def classes_histograma(valores: list[float], quantidade: int = 10
                       ) -> tuple[list[float], list[int]]:
    """Divide o intervalo em classes de mesma largura e conta quantos caem em cada.

    Devolve (bordas, contagens), com len(bordas) == len(contagens) + 1. O
    último valor entra na última classe (intervalos fechados à direita no fim),
    senão o máximo cairia fora do histograma.
    """
    if not valores:
        raise ValueError("histograma de lista vazia")
    minimo, maximo = min(valores), max(valores)
    if minimo == maximo:  # série constante: uma classe simbólica em volta do valor
        minimo, maximo = minimo - 0.5, maximo + 0.5
    largura = (maximo - minimo) / quantidade
    bordas = [minimo + i * largura for i in range(quantidade + 1)]
    contagens = [0] * quantidade
    for valor in valores:
        indice = int((valor - minimo) / largura)
        contagens[min(indice, quantidade - 1)] += 1
    return bordas, contagens


def assimetria(valores: list[float]) -> float:
    """Assimetria amostral (terceiro momento padronizado)."""
    n = len(valores)
    media = sum(valores) / n
    desvio = math.sqrt(sum((v - media) ** 2 for v in valores) / (n - 1))
    if desvio == 0:
        return 0.0
    return sum(((v - media) / desvio) ** 3 for v in valores) * n / ((n - 1) * (n - 2))


def mediana(valores: list[float]) -> float:
    ordenado = sorted(valores)
    meio = len(ordenado) // 2
    if len(ordenado) % 2:
        return ordenado[meio]
    return (ordenado[meio - 1] + ordenado[meio]) / 2


def painel_histograma(valores: list[float], *, x0: float, y0: float,
                      largura: float, altura: float, titulo: str,
                      unidade: str, cor: str, casas: int = 1,
                      classes: int = 10) -> str:
    """Um histograma com mediana marcada e um rodapé de n, mediana e assimetria."""
    margem_esq, margem_baixo, margem_topo = 30, 46, 38
    bordas, contagens = classes_histograma(valores, classes)

    escala_x = Escala(bordas[0], bordas[-1], x0 + margem_esq, x0 + largura - 8)
    escala_y = Escala(0, max(contagens), y0 + altura - margem_baixo, y0 + margem_topo)

    partes = [texto(x0, y0 + 10, titulo, tamanho=11, negrito=True)]

    # grade horizontal: referência de contagem sem competir com as barras
    for marca in marcas_bonitas(0, max(contagens), 3, inteiro=True):
        y = escala_y.px(marca)
        partes.append(linha(x0 + margem_esq, y, x0 + largura - 8, y, cor=GRADE))
        partes.append(texto(x0 + margem_esq - 6, y + 3.5, numero(marca, 0),
                            tamanho=9, cor=TINTA_FRACA, ancora="end"))

    base = escala_y.px(0)
    for i, contagem in enumerate(contagens):
        esquerda = escala_x.px(bordas[i])
        direita = escala_x.px(bordas[i + 1])
        topo = escala_y.px(contagem)
        # 1 px de respiro entre barras: o olho separa as classes sem precisar de borda
        partes.append(retangulo(esquerda + 0.5, topo, direita - esquerda - 1,
                                base - topo, cor=cor))

    med = mediana(valores)
    x_mediana = escala_x.px(med)
    partes.append(linha(x_mediana, escala_y.px(0), x_mediana, y0 + margem_topo - 4,
                        cor=TINTA, largura=1.4, tracejado="4 3"))
    partes.append(texto(x_mediana, y0 + margem_topo - 8,
                        f"mediana {numero(med, casas)}", tamanho=9, cor=TINTA,
                        ancora="middle"))

    partes.append(eixo_horizontal(escala_x, base, casas=casas, rotulo=unidade))
    partes.append(texto(
        x0 + margem_esq, y0 + altura - 2,
        f"n = {len(valores)} · assimetria {numero(assimetria(valores), 2)}",
        tamanho=9, cor=TINTA_FRACA,
    ))
    return "".join(partes)


# ---------------------------------------------------------------- G1


def grafico_g1(reais: dict[str, list[float]], simulados: dict[str, list[float]]
               ) -> str:
    """G1 — os dados reais ao lado dos simulados, um histograma por grupo.

    `reais` traz 'sem cache', 'com cache' e 'diferenças'; `simulados`, uma
    entrada por cenário. As escalas horizontais são independentes de propósito:
    o que se compara aqui é a FORMA das distribuições, não a magnitude — os
    tempos reais estão em dezenas de segundos e as diferenças simuladas, em
    décimos.
    """
    largura_total, coluna, linha_altura = 1040, 336, 196
    partes = []

    rotulos_reais = [
        ("Real · build sem cache", "segundos", 0),
        ("Real · build com cache", "segundos", 1),
        ("Real · diferenças d = sem − com", "segundos", 2),
    ]
    for titulo, unidade, i in rotulos_reais:
        chave = ["sem cache", "com cache", "diferenças"][i]
        partes.append(painel_histograma(
            reais[chave], x0=20 + i * coluna, y0=28, largura=coluna - 20,
            altura=linha_altura, titulo=titulo, unidade=unidade, cor=REAL,
        ))

    nomes = {
        "normal": "Simulado · normal",
        "lognormal_deslocada": "Simulado · lognormal deslocada",
        "contaminada": "Simulado · contaminada",
    }
    for i, (chave, titulo) in enumerate(nomes.items()):
        partes.append(painel_histograma(
            simulados[chave], x0=20 + i * coluna, y0=28 + linha_altura + 34,
            largura=coluna - 20, altura=linha_altura, titulo=titulo,
            unidade="diferença simulada (s)", cor=SIMULADO, casas=2,
        ))

    # faixas de rótulo à esquerda de cada fileira
    partes.insert(0, texto(20, 16, "DADOS REAIS (30 pares coletados)",
                           tamanho=10, cor=TINTA_FRACA, negrito=True))
    partes.insert(1, texto(20, 28 + linha_altura + 22,
                           "DADOS SIMULADOS (n = 30, efeito 0,3σ, semente fixa)",
                           tamanho=10, cor=TINTA_FRACA, negrito=True))

    altura_total = 28 + 2 * linha_altura + 34 + 10
    return svg(largura_total, altura_total, "".join(partes),
               titulo="G1 — histogramas dos dados reais e simulados")


# ---------------------------------------------------------------- G2


def densidade_t(t: float, gl: int) -> float:
    """Densidade da t de Student. Só desenha a curva: os números vêm de distribuicoes.py.

    O p-valor, o valor crítico e o IC continuam saindo de `distribuicoes.py`,
    que é o módulo do Integrante 2. Aqui a fórmula fechada serve para traçar a
    linha, e não para decidir nada.
    """
    log_constante = (
        math.lgamma((gl + 1) / 2) - math.lgamma(gl / 2) - 0.5 * math.log(gl * math.pi)
    )
    return math.exp(log_constante - (gl + 1) / 2 * math.log1p(t * t / gl))


def painel_t(*, x0: float, y0: float, largura: float, altura: float,
             gl: int, critico: float, observado: float, p_valor: float) -> str:
    """Curva da t sob H0, com a região de rejeição e o p-valor como área."""
    margem_esq, margem_baixo, margem_topo = 42, 52, 34
    limite = max(4.0, observado + 1.2)
    escala_x = Escala(-limite, limite, x0 + margem_esq, x0 + largura - 14)
    pico = densidade_t(0, gl)
    escala_y = Escala(0, pico * 1.18, y0 + altura - margem_baixo, y0 + margem_topo)

    passos = 320
    pontos = []
    for i in range(passos + 1):
        t = -limite + (2 * limite) * i / passos
        pontos.append((escala_x.px(t), escala_y.px(densidade_t(t, gl))))

    base = escala_y.px(0)
    partes = [texto(x0, y0 + 12, f"Teste t pareado · distribuição sob H₀ (t com {gl} gl)",
                    tamanho=11.5, negrito=True)]

    # região de rejeição: faixa cinza até a borda, atrás de tudo
    x_critico = escala_x.px(critico)
    partes.append(retangulo(x_critico, y0 + margem_topo - 6,
                            escala_x.fim_px - x_critico,
                            base - (y0 + margem_topo - 6), cor=REJEICAO))
    partes.append(linha(x_critico, base, x_critico, y0 + margem_topo - 6,
                        cor=TINTA_FRACA, largura=1, tracejado="4 3"))
    partes.append(texto(x_critico + 4, y0 + margem_topo + 4,
                        f"região de rejeição · t ≥ {numero(critico, 3)}",
                        tamanho=9, cor=TINTA_FRACA))

    # área do p-valor: tudo à direita do t observado
    cauda = [(x, y) for x, y in pontos if x >= escala_x.px(observado)]
    partes.append(area(cauda, base, cor=AZUL, opacidade=0.55))
    partes.append(curva(pontos, cor=AZUL, largura=2))

    x_obs = escala_x.px(observado)
    partes.append(linha(x_obs, base, x_obs, escala_y.px(densidade_t(observado, gl)),
                        cor=AZUL, largura=1.6))
    partes.append(texto(x_obs, y0 + margem_topo + 26,
                        f"t = {numero(observado, 3)}", tamanho=10, cor=AZUL,
                        negrito=True, ancora="middle"))
    rotulo_y = y0 + margem_topo + 44
    partes.append(texto(x_obs + 8, rotulo_y,
                        f"p = {numero(p_valor, 4)} (a área azul)",
                        tamanho=9.5, cor=AZUL))
    # a área do p-valor é minúscula de propósito: a guia liga o rótulo a ela
    partes.append(linha(x_obs + 6, rotulo_y + 6, x_obs + 3, base - 7,
                        cor=AZUL, largura=0.8, tracejado="2 2"))

    partes.append(eixo_horizontal(escala_x, base, casas=0,
                                  rotulo="estatística t", alvo=5))
    meio_y = (base + y0 + margem_topo) / 2
    partes.append(texto(x0 + 13, meio_y, "densidade", tamanho=9, cor=TINTA_FRACA,
                        ancora="middle", angulo=-90))
    return "".join(partes)


def painel_wilcoxon(*, x0: float, y0: float, largura: float, altura: float,
                    contagens: tuple[int, ...], n: int, critico: int,
                    observado: float, p_valor: float) -> str:
    """Distribuição exata de W+ sob H0, com a região de rejeição e o p-valor."""
    margem_esq, margem_baixo, margem_topo = 42, 52, 34
    total = 2.0**n
    probabilidades = [c / total for c in contagens]
    maximo = len(contagens) - 1

    escala_x = Escala(0, maximo, x0 + margem_esq, x0 + largura - 14)
    escala_y = Escala(0, max(probabilidades) * 1.18,
                      y0 + altura - margem_baixo, y0 + margem_topo)
    base = escala_y.px(0)

    partes = [texto(x0, y0 + 12,
                    f"Wilcoxon pareado · distribuição exata de W⁺ sob H₀ (n = {n})",
                    tamanho=11.5, negrito=True)]

    x_critico = escala_x.px(critico)
    partes.append(retangulo(x_critico, y0 + margem_topo - 6,
                            escala_x.fim_px - x_critico,
                            base - (y0 + margem_topo - 6), cor=REJEICAO))

    # uma barra por valor possível de W+; são 466 valores, então ficam finas
    passo = (escala_x.fim_px - escala_x.inicio_px) / (maximo + 1)
    for valor, probabilidade in enumerate(probabilidades):
        if probabilidade <= 0:
            continue
        x = escala_x.px(valor)
        topo = escala_y.px(probabilidade)
        destaque = valor >= observado
        partes.append(retangulo(x, topo, max(passo, 0.8), base - topo,
                                cor=LARANJA if destaque else "#aebecd",
                                opacidade=0.95 if destaque else 1.0))

    partes.append(linha(x_critico, base, x_critico, y0 + margem_topo - 6,
                        cor=TINTA_FRACA, largura=1, tracejado="4 3"))
    partes.append(texto(x_critico - 6, y0 + margem_topo + 4,
                        f"região de rejeição · W⁺ ≥ {critico}",
                        tamanho=9, cor=TINTA_FRACA, ancora="end"))

    x_obs = escala_x.px(observado)
    partes.append(linha(x_obs, base, x_obs, y0 + margem_topo + 10,
                        cor=LARANJA, largura=1.6))
    partes.append(texto(x_obs, y0 + margem_topo + 26,
                        f"W⁺ = {numero(observado, 0)}", tamanho=10, cor=LARANJA,
                        negrito=True, ancora="middle"))
    rotulo_y = y0 + margem_topo + 44
    partes.append(texto(x_obs + 8, rotulo_y,
                        f"p = {numero(p_valor, 4)} (a área laranja)",
                        tamanho=9.5, cor=LARANJA))
    partes.append(linha(x_obs + 6, rotulo_y + 6, x_obs + 3, base - 7,
                        cor=LARANJA, largura=0.8, tracejado="2 2"))

    partes.append(eixo_horizontal(escala_x, base, casas=0,
                                  rotulo="soma dos postos positivos (W⁺)", alvo=5))
    meio_y = (base + y0 + margem_topo) / 2
    partes.append(texto(x0 + 13, meio_y, "probabilidade", tamanho=9, cor=TINTA_FRACA,
                        ancora="middle", angulo=-90))
    return "".join(partes)


def grafico_g2(*, gl: int, t_critico: float, t_observado: float, t_p: float,
               contagens: tuple[int, ...], n_wilcoxon: int, w_critico: int,
               w_observado: float, w_p: float) -> str:
    """G2 — as duas distribuições sob H0, lado a lado, na mesma altura de leitura.

    Os dois painéis respondem à mesma pergunta para testes diferentes: "se H0
    fosse verdadeira, que valores a estatística costumaria assumir, e quão
    longe o nosso caiu?". A área sombreada é o p-valor — não um número ao
    lado do gráfico, mas o próprio pedaço de área.
    """
    largura, altura_painel = 1040, 272
    esquerda = painel_t(x0=16, y0=14, largura=largura / 2 - 24,
                        altura=altura_painel, gl=gl, critico=t_critico,
                        observado=t_observado, p_valor=t_p)
    direita = painel_wilcoxon(x0=largura / 2 + 8, y0=14, largura=largura / 2 - 24,
                              altura=altura_painel, contagens=contagens,
                              n=n_wilcoxon, critico=w_critico,
                              observado=w_observado, p_valor=w_p)
    return svg(largura, altura_painel + 22, esquerda + direita,
               titulo="G2 — distribuição da estatística sob H0, região de rejeição e p-valor")
