"""Teste t pareado e Wilcoxon pareado sobre as diferenças (Lab04, par P2).

Os dois testes trabalham sobre a mesma quantidade, definida na seção 3 do
cenário experimental:

    dᵢ = tempo_sem_cacheᵢ − tempo_com_cacheᵢ

e usam a alternativa unilateral **"maior que"** (`greater`): H1 é que o cache
reduz o tempo, ou seja, que as diferenças são positivas. Inverter a ordem dos
argumentos sem inverter a alternativa testaria exatamente o contrário, por
isso ela está fixada aqui e não é parâmetro.

O que cada teste devolve é o que a seção 9 do cenário manda reportar: além do
p-valor, o tamanho e a direção do efeito.

Uso (a partir de Lab4/):

    python src/testes.py
    python src/testes.py --csv data/piloto/<sessao>/pares.csv
    python src/testes.py --saida data/resultados_reais.csv
"""

from __future__ import annotations

import argparse
import csv
import statistics
from dataclasses import asdict, dataclass
from pathlib import Path

from distribuicoes import normal_cdf, t_quantil, t_sobrevivencia, wilcoxon_p_exato

LAB4_DIR = Path(__file__).resolve().parent.parent

ALFA = 0.05

# Diferenças abaixo disso contam como zero. A coleta grava o tempo com
# milissegundos (3 casas), então nada menor que meio milissegundo é medição
# de verdade - é ruído de ponto flutuante.
TOLERANCIA_ZERO = 5e-4


@dataclass
class ResultadoT:
    """Teste t pareado, unilateral 'maior que'."""

    n: int
    media: float
    desvio: float
    erro_padrao: float
    estatistica: float
    graus_liberdade: int
    p_valor: float
    ic95_inferior: float  # limite inferior do IC unilateral de 95% para μ_d
    d_z: float            # d de Cohen pareado: média / desvio das DIFERENÇAS
    significativo: bool


@dataclass
class ResultadoWilcoxon:
    """Wilcoxon dos postos sinalizados, pareado, unilateral 'maior que'."""

    n_total: int
    n_usado: int            # depois de descartar os zeros
    zeros_descartados: int
    tem_empates: bool
    estatistica: float      # W+, soma dos postos das diferenças positivas
    w_menos: float
    p_valor: float
    metodo: str             # "exato" ou "normal"
    mediana: float
    hodges_lehmann: float   # pseudomediana: mediana das médias de Walsh
    correlacao_rank_biserial: float
    significativo: bool


def carregar_diferencas(caminho: Path) -> list[float]:
    """Lê o CSV de pares e devolve d = sem_cache − com_cache."""
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        linhas = list(csv.DictReader(arquivo))
    if not linhas:
        raise ValueError(f"{caminho} não tem nenhuma linha de dados")
    return [float(l["tempo_sem_cache"]) - float(l["tempo_com_cache"]) for l in linhas]


# ------------------------------------------------------------ teste t ----

def teste_t_pareado(diferencas: list[float], alfa: float = ALFA) -> ResultadoT:
    """Teste t pareado unilateral: H0 μ_d <= 0 contra H1 μ_d > 0.

    O intervalo de confiança devolvido é **unilateral**, coerente com o teste:
    é o limite inferior de [d̄ − t_{1−α,gl}·EP, +∞). Um IC bilateral ao lado de
    um teste unilateral daria a impressão errada de cobertura.
    """
    n = len(diferencas)
    if n < 2:
        raise ValueError(f"o teste t precisa de ao menos 2 pares (recebeu {n})")
    media = statistics.fmean(diferencas)
    desvio = statistics.stdev(diferencas)
    gl = n - 1

    if desvio == 0.0:
        # Todas as diferenças iguais: o t não existe (divisão por zero). Se
        # forem positivas a evidência é total; se nulas ou negativas, nenhuma.
        p = 0.0 if media > 0 else 1.0
        return ResultadoT(n, media, 0.0, 0.0, float("inf") if media > 0 else float("-inf"),
                          gl, p, media, float("inf") if media > 0 else float("-inf"), p < alfa)

    erro_padrao = desvio / (n ** 0.5)
    t = media / erro_padrao
    p = t_sobrevivencia(t, gl)
    return ResultadoT(
        n=n, media=media, desvio=desvio, erro_padrao=erro_padrao,
        estatistica=t, graus_liberdade=gl, p_valor=p,
        ic95_inferior=media - t_quantil(1 - alfa, gl) * erro_padrao,
        d_z=media / desvio, significativo=p < alfa,
    )


# ------------------------------------------------------------ Wilcoxon ----

def postos_medios(valores: list[float]) -> list[float]:
    """Postos de 1 a n, com posto médio nos empates."""
    ordenado = sorted(range(len(valores)), key=lambda i: valores[i])
    postos = [0.0] * len(valores)
    i = 0
    while i < len(ordenado):
        j = i
        while j + 1 < len(ordenado) and valores[ordenado[j + 1]] == valores[ordenado[i]]:
            j += 1
        medio = (i + j) / 2.0 + 1.0  # média das posições i..j, em base 1
        for k in range(i, j + 1):
            postos[ordenado[k]] = medio
        i = j + 1
    return postos


def hodges_lehmann(valores: list[float]) -> float:
    """Pseudomediana: mediana das médias de Walsh (vᵢ+vⱼ)/2 com i <= j.

    É a estimativa de efeito que acompanha o Wilcoxon. Diferente da mediana
    amostral: quando a distribuição não é simétrica, é dela que o teste fala.
    """
    n = len(valores)
    walsh = [(valores[i] + valores[j]) / 2.0 for i in range(n) for j in range(i, n)]
    return statistics.median(walsh)


def wilcoxon_pareado(diferencas: list[float], alfa: float = ALFA,
                     completo: bool = True) -> ResultadoWilcoxon:
    """Wilcoxon dos postos sinalizados, unilateral 'maior que'.

    Zeros são descartados antes de ranquear (método `wilcox`, o mesmo padrão
    do SciPy) e os empates recebem posto médio.

    O p-valor é **exato** quando não há zeros nem empates: aí os postos são
    exatamente 1..n e a distribuição de W+ sob H0 é a contagem de
    subconjuntos. Havendo zeros ou empates isso deixa de valer, e o cálculo
    cai para a aproximação normal com correção de continuidade e de empates.
    Qual dos dois foi usado fica registrado em `metodo`, em vez de o módulo
    escolher em silêncio.

    `completo=False` pula o Hodges-Lehmann, que é O(n²) e não entra na
    decisão do teste. O Monte Carlo de src/simulacao.py roda dezenas de
    milhares de repetições e só precisa do p-valor; manter uma
    implementação só evita que as duas divirjam.
    """
    n_total = len(diferencas)
    nao_nulas = [d for d in diferencas if abs(d) > TOLERANCIA_ZERO]
    zeros = n_total - len(nao_nulas)
    n = len(nao_nulas)

    if n == 0:
        # Nenhuma diferença: nada a ordenar, nenhuma evidência contra H0.
        return ResultadoWilcoxon(n_total, 0, zeros, False, 0.0, 0.0, 1.0, "indefinido",
                                 0.0, 0.0, 0.0, False)

    absolutos = [abs(d) for d in nao_nulas]
    postos = postos_medios(absolutos)
    w_mais = sum(p for d, p in zip(nao_nulas, postos) if d > 0)
    w_menos = sum(p for d, p in zip(nao_nulas, postos) if d < 0)
    tem_empates = len(set(absolutos)) != n

    if not tem_empates and zeros == 0:
        p = wilcoxon_p_exato(w_mais, n)
        metodo = "exato"
    else:
        media_w = n * (n + 1) / 4.0
        # variância com a correção de empates: cada grupo de tamanho t
        # empatado tira (t³ − t)/48 da variância
        correcao = 0.0
        vistos: dict[float, int] = {}
        for a in absolutos:
            vistos[a] = vistos.get(a, 0) + 1
        for repeticoes in vistos.values():
            if repeticoes > 1:
                correcao += (repeticoes**3 - repeticoes) / 48.0
        variancia = n * (n + 1) * (2 * n + 1) / 24.0 - correcao
        if variancia <= 0:
            p, metodo = 1.0, "indefinido"
        else:
            z = (w_mais - media_w - 0.5) / variancia**0.5  # 0,5 = correção de continuidade
            p = 1.0 - normal_cdf(z)
            metodo = "normal"

    total_postos = w_mais + w_menos
    return ResultadoWilcoxon(
        n_total=n_total, n_usado=n, zeros_descartados=zeros, tem_empates=tem_empates,
        estatistica=w_mais, w_menos=w_menos, p_valor=p, metodo=metodo,
        mediana=statistics.median(nao_nulas),
        hodges_lehmann=hodges_lehmann(nao_nulas) if completo else float("nan"),
        correlacao_rank_biserial=(w_mais - w_menos) / total_postos if total_postos else 0.0,
        significativo=p < alfa,
    )


# ------------------------------------------------------------ saída ----

COLUNAS_RESULTADO = (
    "teste", "n", "estatistica", "p_valor", "significativo", "efeito_nome",
    "efeito_valor", "centro_nome", "centro_valor", "observacao",
)


def linhas_para_csv(t: ResultadoT, w: ResultadoWilcoxon) -> list[dict]:
    """Os dois resultados num formato comum, para o dashboard (Integrante 3)."""
    return [
        {"teste": "t pareado", "n": t.n, "estatistica": round(t.estatistica, 6),
         "p_valor": t.p_valor, "significativo": t.significativo,
         "efeito_nome": "d_z", "efeito_valor": round(t.d_z, 6),
         "centro_nome": "media", "centro_valor": round(t.media, 6),
         "observacao": f"IC 95% unilateral: [{t.ic95_inferior:.4f}; +inf)"},
        {"teste": "Wilcoxon pareado", "n": w.n_usado, "estatistica": w.estatistica,
         "p_valor": w.p_valor, "significativo": w.significativo,
         "efeito_nome": "rank-biserial", "efeito_valor": round(w.correlacao_rank_biserial, 6),
         "centro_nome": "Hodges-Lehmann", "centro_valor": round(w.hodges_lehmann, 6),
         "observacao": f"p {w.metodo}; {w.zeros_descartados} zeros; "
                       f"empates: {'sim' if w.tem_empates else 'nao'}"},
    ]


def escrever_csv(caminho: Path, linhas: list[dict]) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS_RESULTADO)
        escritor.writeheader()
        escritor.writerows(linhas)


def _p(valor: float) -> str:
    """p-valores minúsculos não devem virar '0,000'."""
    return f"{valor:.2e}" if valor < 1e-4 else f"{valor:.4f}"


def imprimir(t: ResultadoT, w: ResultadoWilcoxon, alfa: float = ALFA) -> None:
    print(f"\nTeste t pareado (H0: μ_d <= 0  |  H1: μ_d > 0, unilateral)")
    print(f"  n                  {t.n}")
    print(f"  média das dif.     {t.media:9.4f} s")
    print(f"  desvio-padrão      {t.desvio:9.4f} s")
    print(f"  erro padrão        {t.erro_padrao:9.4f} s")
    print(f"  t({t.graus_liberdade})             {t.estatistica:9.4f}")
    print(f"  p-valor            {_p(t.p_valor):>9}")
    print(f"  IC 95% unilateral  [{t.ic95_inferior:.4f}; +inf)")
    print(f"  d_z (Cohen pareado){t.d_z:9.4f}")

    print(f"\nWilcoxon pareado (postos sinalizados, unilateral)")
    print(f"  n usado            {w.n_usado} de {w.n_total}  ({w.zeros_descartados} zeros descartados)")
    print(f"  W+                 {w.estatistica:9.1f}")
    print(f"  W-                 {w.w_menos:9.1f}")
    print(f"  p-valor            {_p(w.p_valor):>9}   ({w.metodo})")
    print(f"  mediana das dif.   {w.mediana:9.4f} s")
    print(f"  Hodges-Lehmann     {w.hodges_lehmann:9.4f} s")
    print(f"  rank-biserial      {w.correlacao_rank_biserial:9.4f}")
    if w.tem_empates:
        print("  (há empates nos valores absolutos: p pela aproximação normal)")

    print(f"\nDecisão a α = {alfa}")
    for nome, resultado in (("t pareado", t), ("Wilcoxon", w)):
        veredito = "rejeita H0" if resultado.significativo else "não rejeita H0"
        print(f"  {nome:16} {veredito}")
    if t.significativo != w.significativo:
        print("  ATENÇÃO: os dois testes discordam — discutir no relatório.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=Path, default=LAB4_DIR / "data" / "dados_reais.csv")
    parser.add_argument("--saida", type=Path, default=LAB4_DIR / "data" / "resultados_reais.csv")
    parser.add_argument("--alfa", type=float, default=ALFA)
    args = parser.parse_args()

    diferencas = carregar_diferencas(args.csv)
    print(f"Arquivo: {args.csv}")
    print(f"d = tempo_sem_cache - tempo_com_cache  ({len(diferencas)} pares, "
          f"{sum(d > 0 for d in diferencas)} positivas)")

    t = teste_t_pareado(diferencas, args.alfa)
    w = wilcoxon_pareado(diferencas, args.alfa)
    imprimir(t, w, args.alfa)

    escrever_csv(args.saida, linhas_para_csv(t, w))
    print(f"\nSaída: {args.saida}")


if __name__ == "__main__":
    main()
