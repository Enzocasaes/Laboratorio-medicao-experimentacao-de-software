"""Q1 da Sprint 2 — taxa de erro tipo I sob H0 (Lab04, par P2).

Simula R = 10.000 conjuntos de n = 30 diferenças pareadas com H0 verdadeira
e conta quantas vezes o teste t pareado e o Wilcoxon pareado rejeitam H0 a
α = 0,05 (unilateral, `greater`). Como H0 é verdadeira, toda rejeição é um
erro tipo I:

    taxa de erro tipo I = rejeições / R

## Como H0 é representada

A distribuição nula é **empírica**: as 30 diferenças reais
`d = tempo_sem_cache - tempo_com_cache` são centralizadas, subtraindo-se a
média amostral (27,24 s), e cada conjunto simulado é uma reamostragem com
reposição de 30 desses resíduos. A média da distribuição geradora passa a
ser exatamente 0, enquanto a dispersão (desvio de 0,39 s), a assimetria
(−2,17) e os valores extremos (pares 14, 21 e 10) dos dados reais são
mantidos. Isso é o *bootstrap sob a hipótese nula*.

Além do cenário principal, roda um **controle simetrizado**: os mesmos
resíduos, cada um com sinal ± sorteado. A escala e as caudas são as mesmas,
mas a assimetria vai embora. É o único formato em que as duas H0 coincidem: a
do teste t (média = 0) e a do Wilcoxon (distribuição simétrica em torno de 0).
Comparar os dois cenários separa "o teste está mal calibrado" de "a H0 que o
teste avalia não é a que foi simulada". Veja docs/resultados_q1.md.

## O que é reutilizado

Os testes NÃO são reimplementados: as decisões e os p-valores vêm de
`teste_t_pareado` e `wilcoxon_pareado` (src/testes.py, Sprint 1). O NumPy só
gera os dados (`numpy.random.default_rng`). O SciPy só confere, repetição a
repetição, que os p-valores do projeto coincidem com
`scipy.stats.ttest_1samp` e `scipy.stats.wilcoxon` nos mesmos dados.

Uso (a partir de Lab4/):

    python src/erro_tipo_i.py
    python src/erro_tipo_i.py --repeticoes 2000 --n 30 --alfa 0.05 --semente 42
    python src/erro_tipo_i.py --sem-conferencia-scipy
"""

from __future__ import annotations

import argparse
import hashlib
import math
import statistics
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from distribuicoes import normal_cdf, t_quantil
from testes import ALFA, TOLERANCIA_ZERO, carregar_diferencas, teste_t_pareado, wilcoxon_pareado

LAB4_DIR = Path(__file__).resolve().parent.parent

SEMENTE_PADRAO = 42
REPETICOES_PADRAO = 10_000
N_PADRAO = 30
# z de 97,5% para o IC de Monte Carlo da taxa de rejeição
Z_975 = 1.959963984540054
# Tolerância da conferência contra o SciPy. As duas implementações usam a
# mesma fórmula; o que sobra é arredondamento de ponto flutuante.
TOLERANCIA_SCIPY = 1e-9

PRINCIPAL = "bootstrap_centralizado"
CONTROLE = "bootstrap_simetrizado"
CENARIOS = (PRINCIPAL, CONTROLE)

TESTE_T = "t pareado"
TESTE_W = "Wilcoxon pareado"


# ------------------------------------------------------- distribuição nula ----

def residuos_centralizados(diferencas: list[float] | np.ndarray) -> np.ndarray:
    """d - média(d): a distribuição empírica deslocada para ter média 0."""
    d = np.asarray(diferencas, dtype=float)
    return d - d.mean()


def gerar_conjuntos(residuos: np.ndarray, cenario: str, repeticoes: int, n: int,
                    rng: np.random.Generator) -> np.ndarray:
    """Matriz R x n; cada linha é um conjunto de diferenças sob H0.

    Tudo é sorteado de uma vez, antes de qualquer teste. Assim os dois testes
    leem a mesma linha da mesma matriz, e os dados não dependem da ordem em
    que os testes rodam.
    """
    amostras = rng.choice(residuos, size=(repeticoes, n), replace=True)
    if cenario == PRINCIPAL:
        return amostras
    if cenario == CONTROLE:
        sinais = rng.choice(np.array([-1.0, 1.0]), size=(repeticoes, n), replace=True)
        return amostras * sinais
    raise ValueError(f"cenário desconhecido: {cenario} (use um de {CENARIOS})")


# ------------------------------------------------------------ Monte Carlo ----

@dataclass
class ResultadoCenario:
    """P-valores e diagnósticos das R repetições de um cenário."""

    cenario: str
    semente: int
    repeticoes: int
    n: int
    alfa: float
    dados: np.ndarray                    # R x n, guardado para a conferência
    p_t: np.ndarray
    p_w: np.ndarray
    metodo_w: list[str]
    zeros_w: np.ndarray                  # zeros descartados pelo Wilcoxon, por repetição
    desvio_zero: int = 0                 # conjuntos com desvio 0 (t indefinido)
    wilcoxon_indefinido: int = 0         # conjuntos sem nenhuma diferença não nula
    conferencia_scipy: dict = field(default_factory=dict)
    segundos: float = 0.0

    @property
    def rejeitou_t(self) -> np.ndarray:
        return self.p_t < self.alfa

    @property
    def rejeitou_w(self) -> np.ndarray:
        return self.p_w < self.alfa

    def impressao_digital(self) -> str:
        """SHA-256 dos dados e dos p-valores: comparar duas rodadas é comparar isto."""
        h = hashlib.sha256()
        for vetor in (self.dados, self.p_t, self.p_w):
            h.update(np.ascontiguousarray(vetor, dtype=np.float64).tobytes())
        return h.hexdigest()


def rodar_cenario(residuos: np.ndarray, cenario: str, repeticoes: int = REPETICOES_PADRAO,
                  n: int = N_PADRAO, alfa: float = ALFA,
                  semente: int = SEMENTE_PADRAO) -> ResultadoCenario:
    """R conjuntos sob H0; os dois testes do projeto em cada um.

    Nenhuma repetição é descartada. Casos degenerados são contados e mantidos
    com o tratamento das funções de src/testes.py:

    - desvio 0 (as n diferenças iguais): o t não existe; `teste_t_pareado`
      devolve p = 0 se a média for positiva e p = 1 caso contrário;
    - nenhuma diferença diferente de 0: o Wilcoxon devolve p = 1
      (`metodo = "indefinido"`).

    Um p-valor fora de [0, 1] ou NaN interrompe a simulação com erro, em vez
    de ser descartado.
    """
    inicio = time.perf_counter()
    rng = np.random.default_rng(semente)
    dados = gerar_conjuntos(residuos, cenario, repeticoes, n, rng)

    p_t = np.empty(repeticoes)
    p_w = np.empty(repeticoes)
    zeros_w = np.empty(repeticoes, dtype=int)
    metodo_w: list[str] = []
    desvio_zero = indefinido = 0

    for r in range(repeticoes):
        amostra = dados[r].tolist()          # o MESMO objeto vai para os dois testes
        t = teste_t_pareado(amostra, alfa)
        w = wilcoxon_pareado(amostra, alfa, completo=False)
        p_t[r], p_w[r] = t.p_valor, w.p_valor
        zeros_w[r] = w.zeros_descartados
        metodo_w.append(w.metodo)
        desvio_zero += t.desvio == 0.0
        indefinido += w.metodo == "indefinido"

    for nome, p in ((TESTE_T, p_t), (TESTE_W, p_w)):
        invalidos = ~np.isfinite(p) | (p < 0) | (p > 1)
        if invalidos.any():
            primeiras = np.flatnonzero(invalidos)[:5] + 1
            raise ValueError(f"{cenario}: {int(invalidos.sum())} p-valores inválidos no "
                             f"{nome} (repetições {primeiras.tolist()}...)")

    return ResultadoCenario(cenario, semente, repeticoes, n, alfa, dados, p_t, p_w,
                            metodo_w, zeros_w, desvio_zero, indefinido,
                            segundos=time.perf_counter() - inicio)


def conferir_com_scipy(resultado: ResultadoCenario) -> dict:
    """Recalcula os p-valores com o SciPy, nos mesmos dados, e compara.

    `scipy.stats.wilcoxon` recebe as mesmas opções que src/testes.py usa:
    zeros descartados (`zero_method="wilcox"`), correção de continuidade e,
    quando há empates ou zeros, aproximação normal. As repetições em que o
    projeto usou o p exato são conferidas com `method="exact"`.
    """
    from scipy import stats

    x = resultado.dados
    sp_t = stats.ttest_1samp(x, 0.0, axis=1, alternative="greater").pvalue

    # O projeto trata |d| <= TOLERANCIA_ZERO como zero; o SciPy só zera 0.0
    # exato. Arredondar para zero antes deixa os dois com o mesmo critério.
    x_w = np.where(np.abs(x) > TOLERANCIA_ZERO, x, 0.0)
    metodo = np.array(resultado.metodo_w)
    sp_w = np.full(resultado.repeticoes, np.nan)
    normal = metodo == "normal"
    exato = metodo == "exato"
    if normal.any():
        sp_w[normal] = stats.wilcoxon(x_w[normal], axis=1, alternative="greater",
                                      zero_method="wilcox", correction=True,
                                      method="approx").pvalue
    if exato.any():
        sp_w[exato] = stats.wilcoxon(x_w[exato], axis=1, alternative="greater",
                                     zero_method="wilcox", method="exact").pvalue
    comparaveis = normal | exato

    dif_t = np.abs(sp_t - resultado.p_t)
    dif_w = np.abs(sp_w[comparaveis] - resultado.p_w[comparaveis])
    conferencia = {
        "max_dif_t": float(np.nanmax(dif_t)),
        "max_dif_w": float(dif_w.max()) if dif_w.size else 0.0,
        "decisoes_divergentes_t": int(((sp_t < resultado.alfa) != resultado.rejeitou_t).sum()),
        "decisoes_divergentes_w": int(((sp_w[comparaveis] < resultado.alfa)
                                       != resultado.rejeitou_w[comparaveis]).sum()),
        "repeticoes_conferidas_w": int(comparaveis.sum()),
    }
    conferencia["ok"] = (conferencia["max_dif_t"] < TOLERANCIA_SCIPY
                         and conferencia["max_dif_w"] < TOLERANCIA_SCIPY
                         and conferencia["decisoes_divergentes_t"] == 0
                         and conferencia["decisoes_divergentes_w"] == 0)
    resultado.conferencia_scipy = conferencia
    return conferencia


# ------------------------------------------------------------ agregação ----

def intervalo_monte_carlo(rejeicoes: int, repeticoes: int) -> tuple[float, float, float]:
    """Erro padrão e IC de 95% (Wald) da taxa de rejeição estimada."""
    taxa = rejeicoes / repeticoes
    ep = math.sqrt(taxa * (1 - taxa) / repeticoes)
    return ep, max(0.0, taxa - Z_975 * ep), min(1.0, taxa + Z_975 * ep)


def classificar(ic_inf: float, ic_sup: float, alfa: float) -> str:
    """Calibração do teste a partir do IC de Monte Carlo da taxa.

    A comparação é com o IC, não com a taxa pontual: com R = 10.000, uma taxa
    de 5,3% pode ser só ruído de simulação.
    """
    if ic_inf > alfa:
        return "liberal"
    if ic_sup < alfa:
        return "conservador"
    return "calibrado"


def resumo(resultado: ResultadoCenario) -> list[dict]:
    """Uma linha por teste, no formato de data/resultados_q1.csv."""
    linhas = []
    for teste, p, rejeitou in ((TESTE_T, resultado.p_t, resultado.rejeitou_t),
                               (TESTE_W, resultado.p_w, resultado.rejeitou_w)):
        rejeicoes = int(rejeitou.sum())
        ep, inf, sup = intervalo_monte_carlo(rejeicoes, resultado.repeticoes)
        if teste == TESTE_T:
            degenerados = resultado.desvio_zero
            observacao = "degenerados = conjuntos com desvio 0 (t indefinido)"
        else:
            degenerados = resultado.wilcoxon_indefinido
            metodos = pd.Series(resultado.metodo_w).value_counts().to_dict()
            observacao = ("p-valor: " + ", ".join(f"{m} = {q}" for m, q in sorted(metodos.items()))
                          + f"; zeros descartados no total: {int(resultado.zeros_w.sum())}")
        linhas.append({
            "cenario": resultado.cenario,
            "teste": teste,
            "repeticoes": resultado.repeticoes,
            "n": resultado.n,
            "alfa": resultado.alfa,
            "semente": resultado.semente,
            "rejeicoes": rejeicoes,
            "nao_rejeicoes": resultado.repeticoes - rejeicoes,
            "taxa_erro_tipo_i": rejeicoes / resultado.repeticoes,
            "erro_padrao_mc": ep,
            "ic95_inferior": inf,
            "ic95_superior": sup,
            "p_valor_medio": float(np.mean(p)),
            "p_valor_mediana": float(np.median(p)),
            "p_valor_desvio": float(np.std(p, ddof=1)),
            "classificacao": classificar(inf, sup, resultado.alfa),
            "degenerados": degenerados,
            "observacao": observacao,
        })
    return linhas


def tabela_pvalores(resultado: ResultadoCenario) -> pd.DataFrame:
    """Uma linha por repetição: o formato de data/pvalores_q1.csv."""
    return pd.DataFrame({
        "repeticao": np.arange(1, resultado.repeticoes + 1),
        "p_valor_t": resultado.p_t,
        "rejeitou_t": resultado.rejeitou_t,
        "p_valor_wilcoxon": resultado.p_w,
        "rejeitou_wilcoxon": resultado.rejeitou_w,
        "metodo_wilcoxon": resultado.metodo_w,
    })


# ------------------------------------------- diagnóstico da distribuição ----

def assimetria(valores: np.ndarray) -> float:
    """G1 ajustado, a mesma fórmula de src/descritiva.py."""
    n = len(valores)
    s = float(np.std(valores, ddof=1))
    return float(n / ((n - 1) * (n - 2)) * np.sum(((valores - valores.mean()) / s) ** 3))


def curtose_excesso(valores: np.ndarray) -> float:
    """G2 ajustado (excesso de curtose amostral)."""
    n = len(valores)
    s = float(np.std(valores, ddof=1))
    m4 = np.sum(((valores - valores.mean()) / s) ** 4)
    return float(n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * m4
                 - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)))


def diagnostico_nula(residuos: np.ndarray, n: int, alfa: float) -> dict:
    """O que a distribuição geradora implica para cada teste, antes de simular.

    - Teste t: com uma população assimétrica, a estatística t deixa de seguir
      a t de Student. A correção de Edgeworth de 1ª ordem dá
      P(T > z) ≈ 1 − Φ(z) − γ/(6√n)·(2z² + 1)·φ(z), em que γ é a assimetria da
      população. Com γ < 0, a cauda superior engorda e o teste fica liberal.
    - Wilcoxon: sob a distribuição geradora,
      E[W+] = n·P(X > 0) + C(n,2)·P(X₁ + X₂ > 0); sob a H0 do Wilcoxon
      (simetria em torno de 0) esse valor é n(n+1)/4. A diferença mostra o
      quanto a distribuição gerada viola a H0 do Wilcoxon.
    """
    # Momentos da distribuição GERADORA (a empírica, com pesos 1/30), e não a
    # estimativa amostral: é dessa população que as amostras saem.
    centro = residuos - residuos.mean()
    sigma_pop = float(np.sqrt(np.mean(centro**2)))
    gama_pop = float(np.mean(centro**3) / sigma_pop**3)

    z = t_quantil(1 - alfa, n - 1)
    phi = math.exp(-z * z / 2) / math.sqrt(2 * math.pi)
    edgeworth = (1 - normal_cdf(z)) - gama_pop / (6 * math.sqrt(n)) * (2 * z * z + 1) * phi

    p1 = float(np.mean(residuos > TOLERANCIA_ZERO))
    somas = residuos[:, None] + residuos[None, :]
    p2 = float(np.mean(somas > 0))
    e_w = n * p1 + n * (n - 1) / 2 * p2

    return {
        "n_residuos": len(residuos),
        "media": float(residuos.mean()),
        "desvio": float(np.std(residuos, ddof=1)),
        "mediana": float(np.median(residuos)),
        "assimetria_amostral": assimetria(residuos),
        "curtose_excesso": curtose_excesso(residuos),
        "assimetria_populacional": gama_pop,
        "minimo": float(residuos.min()),
        "maximo": float(residuos.max()),
        "menor_abs": float(np.abs(residuos).min()),
        "prop_positivos": p1,
        "prob_soma_par_positiva": p2,
        "edgeworth_taxa_t": edgeworth,
        "esperanca_w_mais": e_w,
        "esperanca_w_mais_h0": n * (n + 1) / 4,
        "prob_sem_extremo": (1 - 1 / len(residuos)) ** n,
    }


# ------------------------------------------------------------ relatório ----

def _pct(x: float, casas: int = 2) -> str:
    return f"{100 * x:.{casas}f}%".replace(".", ",")


def _num(x: float, casas: int = 4) -> str:
    return f"{x:.{casas}f}".replace(".", ",")


TEXTO_CLASSIFICACAO = {
    "calibrado": "calibrado (5% dentro do IC de Monte Carlo)",
    "liberal": "**liberal** (IC inteiro acima de 5%)",
    "conservador": "**conservador** (IC inteiro abaixo de 5%)",
}


def escrever_relatorio(caminho: Path, linhas: list[dict], resultados: dict[str, ResultadoCenario],
                       diag: dict, args: argparse.Namespace, csv_entrada: Path) -> None:
    """docs/resultados_q1.md — gerado a partir dos números, não escrito à mão."""
    por = {(l["cenario"], l["teste"]): l for l in linhas}
    tp, wp = por[(PRINCIPAL, TESTE_T)], por[(PRINCIPAL, TESTE_W)]
    tc, wc = por[(CONTROLE, TESTE_T)], por[(CONTROLE, TESTE_W)]
    meia_largura = Z_975 * math.sqrt(args.alfa * (1 - args.alfa) / args.repeticoes)
    import platform
    versoes = f"Python {platform.python_version()}, NumPy {np.__version__}, pandas {pd.__version__}"
    try:
        import scipy
        versoes += f", SciPy {scipy.__version__}"
    except ImportError:  # pragma: no cover
        pass

    l: list[str] = [
        "# Q1 — Taxa de erro tipo I sob H0 (10.000 simulações)",
        "",
        "**Lab04 — Sprint 2, Issue #107**",
        "",
        "> Arquivo **gerado** por `python src/erro_tipo_i.py`. Não edite à mão:",
        "> rode o comando de novo. Os números vêm de `data/resultados_q1.csv`.",
        "",
        "## Pergunta",
        "",
        f"Com H0 verdadeira, com que frequência o teste t pareado e o Wilcoxon pareado",
        f"(unilaterais, `alternative='greater'`) rejeitam H0 a α = {_num(args.alfa, 2)}?",
        "Toda rejeição aqui é um **erro tipo I**, e um teste bem calibrado deveria errar",
        f"em cerca de {_pct(args.alfa, 0)} das vezes:",
        "",
        f"    taxa de erro tipo I = rejeições / {args.repeticoes}",
        "",
        "## Parâmetros",
        "",
        "| Item | Valor |",
        "|---|---|",
        f"| Repetições por cenário | {args.repeticoes} |",
        f"| Pares por conjunto (n) | {args.n} |",
        f"| α | {_num(args.alfa, 2)} (unilateral, `greater`) |",
        f"| Semente | `numpy.random.default_rng({args.semente})` no cenário principal; "
        f"`default_rng({args.semente + 1})` no controle |",
        f"| Dados de origem | `{csv_entrada.relative_to(LAB4_DIR).as_posix()}` "
        f"({diag['n_residuos']} pares reais) |",
        f"| Diferença | d = tempo_sem_cache − tempo_com_cache |",
        f"| Implementação dos testes | `teste_t_pareado` e `wilcoxon_pareado` de `src/testes.py` (Sprint 1) |",
        f"| Ambiente | {versoes} |",
        "",
        "## Como H0 foi representada",
        "",
        "Os dados reais **não** representam H0: neles a diferença média é de 27,24 s,",
        "e as 30 diferenças são positivas. Simular a partir deles mediria o poder do",
        "teste, e não o erro tipo I. Também não basta sortear números de uma normal com",
        "média 0, porque isso descartaria justamente o que os dados reais têm de",
        "particular: um desvio pequeno, uma forte assimetria à esquerda e três valores",
        "extremos (pares 14, 21 e 10).",
        "",
        "A distribuição nula usada é a **empírica centralizada** (bootstrap sob H0):",
        "",
        "1. calcular as 30 diferenças reais dᵢ;",
        f"2. subtrair a média amostral: eᵢ = dᵢ − d̄. A média de e é exatamente 0, e o "
        f"desvio ({_num(diag['desvio'])} s), a assimetria e os extremos continuam os dos dados;",
        f"3. em cada repetição, sortear {args.n} valores de {{e₁, …, e₃₀}} **com reposição**;",
        "4. aplicar os dois testes ao **mesmo** conjunto de 30 valores.",
        "",
        "Como os resíduos já são diferenças pareadas, os testes comparam essas",
        "diferenças com 0. É exatamente o que `teste_t_pareado` e `wilcoxon_pareado` fazem",
        "(eles recebem o vetor d), e é equivalente a `ttest_rel(sem, com)` /",
        "`wilcoxon(sem, com)` com `com` = sem − d.",
        "",
        "### A distribuição geradora",
        "",
        "| Estatística dos resíduos eᵢ | Valor |",
        "|---|---:|",
        f"| Média | {_num(diag['media'], 6)} s |",
        f"| Desvio-padrão | {_num(diag['desvio'])} s |",
        f"| Mediana | {_num(diag['mediana'])} s |",
        f"| Assimetria (G1 ajustado) | {_num(diag['assimetria_amostral'], 2)} |",
        f"| Excesso de curtose (G2) | {_num(diag['curtose_excesso'], 2)} |",
        f"| Mínimo / máximo | {_num(diag['minimo'], 3)} s / {_num(diag['maximo'], 3)} s |",
        f"| Proporção de resíduos positivos | {_pct(diag['prop_positivos'], 1)} |",
        "",
        "A **média** é 0, mas a **mediana** não. Na assimetria à esquerda, um único",
        f"resíduo muito negativo ({_num(diag['minimo'], 3)} s, o par 14) puxa a média para",
        f"baixo, e {_pct(diag['prop_positivos'], 0)} dos resíduos ficam acima de zero.",
        "Isso é decisivo para entender os resultados.",
        "",
        "### Controle: bootstrap simetrizado",
        "",
        "As duas hipóteses nulas **não são a mesma** (seção 4.2 do cenário experimental):",
        "",
        "- teste t: H0 é μ_d = 0 (a **média** das diferenças é zero);",
        "- Wilcoxon: H0 é que a distribuição das diferenças é **simétrica em torno de 0**.",
        "",
        "O bootstrap centralizado satisfaz a primeira e viola a segunda. Para separar",
        "\"o teste está mal calibrado\" de \"a H0 simulada não é a do teste\", a mesma",
        "simulação roda num segundo cenário: cada resíduo sorteado recebe um sinal ±",
        "aleatório. A escala e as caudas continuam as mesmas, a assimetria desaparece, e",
        "**as duas H0 passam a valer ao mesmo tempo**. Nesse cenário os dois testes",
        "*têm* de errar perto de 5%. Se não errassem, haveria um defeito na implementação.",
        "",
        "Este controle não é um cenário de violação de pressupostos (isso é a Q3). Ele",
        "é a referência que permite interpretar o cenário principal.",
        "",
        "## Como os testes foram aplicados",
        "",
        "- **Mesmos dados**: os 10.000 × 30 valores são sorteados numa matriz antes de",
        "  qualquer teste, e a linha r vai, como o mesmo objeto, para os dois testes. A",
        "  conferência contra o SciPy recalcula os dois p-valores a partir dessa mesma",
        "  matriz.",
        "- **Teste t**: `teste_t_pareado(d)`, unilateral, com gl = n − 1.",
        "- **Wilcoxon**: `wilcoxon_pareado(d)`. Zeros (|d| ≤ 0,5 ms) são descartados",
        "  (`zero_method='wilcox'`), e os empates recebem o posto médio. Sem zeros nem",
        "  empates, o p é exato; com eles, a aproximação normal é feita com correção de",
        "  empates e de continuidade.",
        "- **Empates**: reamostrar com reposição quase sempre repete algum resíduo, o que",
        "  gera empates em |d|. Por isso o Wilcoxon usou a aproximação normal em",
        f"  {resultados[PRINCIPAL].metodo_w.count('normal')} das {args.repeticoes} repetições "
        f"do cenário principal e em {resultados[CONTROLE].metodo_w.count('normal')} do controle.",
        f"  **Zeros** não ocorrem: o menor |eᵢ| é {_num(diag['menor_abs'], 4)} s, bem acima da",
        "  tolerância de 0,5 ms.",
        "- **Casos degenerados**: nenhuma repetição é descartada. Um conjunto com desvio 0",
        "  (as 30 retiradas iguais) ou sem nenhuma diferença não nula seria mantido com o",
        "  tratamento já definido em `src/testes.py` e contado na coluna `degenerados`.",
        "  P-valores NaN ou fora de [0, 1] interrompem a execução com erro.",
        "",
        "## Resultados",
        "",
        "### Cenário principal: bootstrap centralizado",
        "",
        "| Teste | Rejeições | Não rejeições | Taxa de erro tipo I | IC 95% (Monte Carlo) | Classificação |",
        "|---|---:|---:|---:|---|---|",
    ]
    for linha in (tp, wp):
        l.append(f"| {linha['teste']} | {linha['rejeicoes']} | {linha['nao_rejeicoes']} | "
                 f"**{_pct(linha['taxa_erro_tipo_i'])}** | "
                 f"[{_pct(linha['ic95_inferior'])}; {_pct(linha['ic95_superior'])}] | "
                 f"{TEXTO_CLASSIFICACAO[linha['classificacao']]} |")
    l += [
        "",
        "| Teste | p-valor médio | Mediana | Desvio-padrão | Degenerados | Observação |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for linha in (tp, wp):
        l.append(f"| {linha['teste']} | {_num(linha['p_valor_medio'])} | "
                 f"{_num(linha['p_valor_mediana'])} | {_num(linha['p_valor_desvio'])} | "
                 f"{linha['degenerados']} | {linha['observacao']} |")
    l += [
        "",
        "### Controle: bootstrap simetrizado",
        "",
        "| Teste | Rejeições | Taxa de erro tipo I | IC 95% (Monte Carlo) | p médio | p mediana | Classificação |",
        "|---|---:|---:|---|---:|---:|---|",
    ]
    for linha in (tc, wc):
        l.append(f"| {linha['teste']} | {linha['rejeicoes']} | **{_pct(linha['taxa_erro_tipo_i'])}** | "
                 f"[{_pct(linha['ic95_inferior'])}; {_pct(linha['ic95_superior'])}] | "
                 f"{_num(linha['p_valor_medio'])} | {_num(linha['p_valor_mediana'])} | "
                 f"{TEXTO_CLASSIFICACAO[linha['classificacao']]} |")

    l += [
        "",
        "Sob H0, um p-valor bem calibrado tem distribuição uniforme em [0, 1]: média 0,5,",
        "mediana 0,5 e desvio-padrão 1/√12 ≈ 0,2887. Os valores das tabelas podem ser",
        "comparados com essa referência.",
        "",
        "## Comparação com 5%",
        "",
        f"Com R = {args.repeticoes} e uma taxa verdadeira de {_pct(args.alfa, 0)}, a taxa estimada",
        f"varia ±{_num(100 * meia_largura, 2)} ponto percentual (IC de 95%) só pelo acaso da",
        f"simulação, ou seja, de {_pct(args.alfa - meia_largura)} a {_pct(args.alfa + meia_largura)}.",
        "A classificação usa o IC de Monte Carlo de cada taxa:",
        "",
        "- **calibrado**: 5% está dentro do IC;",
        "- **liberal**: o IC inteiro está acima de 5%, ou seja, o teste rejeita H0",
        "  verdadeira mais do que promete;",
        "- **conservador**: o IC inteiro está abaixo de 5%.",
        "",
        "| Cenário | Teste | Taxa | Diferença para 5% | Classificação |",
        "|---|---|---:|---:|---|",
    ]
    for linha in (tp, wp, tc, wc):
        dif = 100 * (linha["taxa_erro_tipo_i"] - args.alfa)
        l.append(f"| {linha['cenario']} | {linha['teste']} | {_pct(linha['taxa_erro_tipo_i'])} | "
                 f"{'+' if dif >= 0 else '−'}{_num(abs(dif), 2)} p.p. | {linha['classificacao']} |")

    l += ["", "## Interpretação", ""]
    l += _interpretar(tp, wp, tc, wc, diag, args)

    conf = {c: resultados[c].conferencia_scipy for c in CENARIOS}
    l += [
        "",
        "## Validação",
        "",
        "| Verificação | Bootstrap centralizado | Bootstrap simetrizado |",
        "|---|---|---|",
        f"| Repetições válidas | {resultados[PRINCIPAL].repeticoes} | {resultados[CONTROLE].repeticoes} |",
        f"| P-valores NaN ou fora de [0, 1] | 0 | 0 |",
        f"| Conjuntos degenerados (t / Wilcoxon) | {resultados[PRINCIPAL].desvio_zero} / "
        f"{resultados[PRINCIPAL].wilcoxon_indefinido} | {resultados[CONTROLE].desvio_zero} / "
        f"{resultados[CONTROLE].wilcoxon_indefinido} |",
    ]
    if all(conf.values()):
        l += [
            f"| Maior diferença de p para o SciPy (t) | {conf[PRINCIPAL]['max_dif_t']:.1e} | "
            f"{conf[CONTROLE]['max_dif_t']:.1e} |",
            f"| Maior diferença de p para o SciPy (Wilcoxon) | {conf[PRINCIPAL]['max_dif_w']:.1e} | "
            f"{conf[CONTROLE]['max_dif_w']:.1e} |",
            f"| Decisões diferentes das do SciPy (t / Wilcoxon) | "
            f"{conf[PRINCIPAL]['decisoes_divergentes_t']} / {conf[PRINCIPAL]['decisoes_divergentes_w']} | "
            f"{conf[CONTROLE]['decisoes_divergentes_t']} / {conf[CONTROLE]['decisoes_divergentes_w']} |",
        ]
    l += [
        f"| Impressão digital (SHA-256 de dados + p-valores) | `{resultados[PRINCIPAL].impressao_digital()[:16]}…` | "
        f"`{resultados[CONTROLE].impressao_digital()[:16]}…` |",
        "",
        "A conferência usa `scipy.stats.ttest_1samp(d, 0, alternative='greater')` e",
        "`scipy.stats.wilcoxon(d, alternative='greater', zero_method='wilcox',",
        "correction=True, method='approx')` (ou `method='exact'` nas repetições em que o",
        "projeto usou o p exato), calculados sobre a mesma matriz de dados. Como os dois",
        "p-valores de cada linha batem com os do SciPy calculados a partir da mesma",
        "linha, os dois testes do projeto receberam exatamente os mesmos dados. A",
        "impressão digital permite conferir a reprodutibilidade: rodar de novo com a",
        "mesma semente tem de dar o mesmo hash.",
        "",
        "## Limitações",
        "",
        "- **A distribuição nula tem só 30 pontos de apoio.** O bootstrap trata a amostra",
        "  observada como se fosse a população. Valores que não apareceram na coleta",
        "  nunca são sorteados, e cada valor observado, inclusive os extremos, tem peso",
        f"  exato de 1/30. Em {_pct(diag['prob_sem_extremo'], 0)} dos conjuntos o",
        "  resíduo mais negativo (par 14) nem é sorteado, e a forma da cauda esquerda",
        "  depende quase toda de 1 a 3 observações.",
        "- **Centralizar pela média é uma escolha.** Ela define H0 como \"média = 0\",",
        "  que é a H0 do teste t. Centralizar pela mediana ou pelo estimador de",
        "  Hodges-Lehmann geraria a H0 do Wilcoxon e inverteria a vantagem. Não existe",
        "  uma única distribuição nula correta quando a distribuição é assimétrica, e por",
        "  isso o controle simetrizado foi incluído.",
        "- **Só a forma das diferenças é preservada**, e não a estrutura temporal da",
        "  coleta (ordem AB/BA, aquecimento da JVM, deriva térmica). Os conjuntos",
        "  simulados são i.i.d.; os dados reais podem não ser.",
        "- **Empates artificiais.** A reamostragem repete valores, e isso leva o Wilcoxon",
        "  para a aproximação normal com correção de empates, mesmo que os tempos reais",
        "  sejam contínuos. A conferência contra o SciPy mostra que a aproximação está",
        "  correta, mas o p exato não é avaliado neste cenário.",
        "- **n fixo em 30.** A taxa de erro do t numa população assimétrica converge para",
        "  α à medida que n cresce (o termo de Edgeworth cai com 1/√n). Os números acima",
        "  valem para o n do experimento, não para qualquer n.",
        "- **Erro de Monte Carlo.** Cada taxa tem incerteza de ≈ ±0,4 p.p. (IC de 95%).",
        "  Diferenças menores que isso entre os testes não devem ser interpretadas.",
        "",
        "## Arquivos",
        "",
        "| Arquivo | Conteúdo |",
        "|---|---|",
        "| `src/erro_tipo_i.py` | a simulação |",
        "| `data/resultados_q1.csv` | resultados agregados, uma linha por cenário × teste |",
        "| `data/pvalores_q1.csv` | os 10.000 p-valores do cenário principal (para o G3) |",
        "| `data/pvalores_q1_controle.csv` | os 10.000 p-valores do controle simetrizado |",
        "",
        "## Como refazer",
        "",
        "```bash",
        "cd Lab4",
        "pip install -r requirements-q1.txt",
        f"python src/erro_tipo_i.py --repeticoes {args.repeticoes} --n {args.n} "
        f"--alfa {args.alfa} --semente {args.semente}",
        "```",
        "",
        "A execução leva da ordem de 10 s. Com a mesma semente, os CSVs e este",
        "relatório saem idênticos byte a byte, inclusive as impressões digitais acima.",
        "",
    ]
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(l), encoding="utf-8")


def _interpretar(tp: dict, wp: dict, tc: dict, wc: dict, diag: dict,
                 args: argparse.Namespace) -> list[str]:
    """Texto de interpretação montado a partir das classificações obtidas."""
    texto = []

    controle_ok = tc["classificacao"] == wc["classificacao"] == "calibrado"
    if controle_ok:
        texto += [
            f"**1. As implementações estão calibradas.** No controle simetrizado, em que as",
            f"duas H0 valem, o t erra {_pct(tc['taxa_erro_tipo_i'])} e o Wilcoxon",
            f"{_pct(wc['taxa_erro_tipo_i'])}. As duas taxas são compatíveis com 5%. Os",
            "desvios do cenário principal, portanto, não vêm de erro de código: vêm da",
            "forma da distribuição.",
            "",
        ]
    else:
        texto += [
            f"**1. Atenção: o controle simetrizado não ficou calibrado** (t = "
            f"{_pct(tc['taxa_erro_tipo_i'])}, {tc['classificacao']}; Wilcoxon = "
            f"{_pct(wc['taxa_erro_tipo_i'])}, {wc['classificacao']}). Nesse cenário as duas H0",
            "valem, então isso merece investigação antes de interpretar o cenário principal.",
            "",
        ]

    texto += [
        f"**2. Teste t no cenário principal: {_pct(tp['taxa_erro_tipo_i'])} ({tp['classificacao']}).**",
    ]
    if tp["classificacao"] == "liberal":
        texto += [
            "A H0 do t (média 0) é verdadeira aqui. Mesmo assim, com n = "
            f"{args.n} e uma população de assimetria {_num(diag['assimetria_populacional'], 2)}, a",
            "estatística t não segue a distribuição t de Student. Nas amostras que não",
            "sorteiam o resíduo extremo negativo, a média sai levemente positiva e o desvio",
            "sai pequeno, e o t resultante é grande. Nas que sorteiam, a média cai, mas o",
            "desvio infla junto, e o t fica contido. Com assimetria negativa, a cauda",
            "**superior** de T engorda, e é exatamente essa a cauda que o teste `greater` usa.",
            f"A correção de Edgeworth de 1ª ordem prevê ≈ {_pct(diag['edgeworth_taxa_t'], 1)},",
            "na mesma direção e na mesma ordem de grandeza do valor simulado. O que sobra",
            f"vem dos termos de ordem 1/n, que pesam com uma curtose de {_num(diag['curtose_excesso'], 1)}.",
            "",
        ]
    elif tp["classificacao"] == "conservador":
        texto += ["O t rejeitou menos do que o nominal: com esta forma de distribuição, ele",
                  "protege contra o erro tipo I mais do que α promete, e paga em poder.", ""]
    else:
        texto += ["O t ficou dentro da faixa de Monte Carlo de 5%: a assimetria dos dados não",
                  "compromete a sua calibração com n = 30.", ""]

    texto += [
        f"**3. Wilcoxon no cenário principal: {_pct(wp['taxa_erro_tipo_i'])} ({wp['classificacao']}).**",
        "Aqui a \"rejeição incorreta\" precisa ser lida com cuidado. A distribuição",
        "gerada tem média 0, mas **não é simétrica em torno de 0**:",
        f"{_pct(diag['prop_positivos'], 0)} dos resíduos são positivos, e a mediana é de",
        f"{_num(diag['mediana'], 3)} s. Sob essa distribuição, E[W+] = "
        f"{_num(diag['esperanca_w_mais'], 1)}, contra {_num(diag['esperanca_w_mais_h0'], 1)} sob a",
        "H0 do Wilcoxon. O teste está detectando, corretamente, que a distribuição",
        "fica \"mais à direita\" de zero no sentido dos postos. Ou seja: a H0 *do",
        "Wilcoxon* (simetria em torno de 0) é falsa nesta distribuição, então, em relação",
        "a ela, essas rejeições não são erro tipo I. Em relação à H0 *do experimento* (o",
        "cache não muda o tempo **médio**), são. A taxa alta mostra que os dois testes",
        "respondem a perguntas diferentes quando as diferenças são assimétricas, e que,",
        "com diferenças assimétricas, um p < 0,05 do Wilcoxon não autoriza concluir",
        "nada sobre a média.",
        "",
        "**4. Consequência para o experimento.** Nos dados reais, os dois testes rejeitam",
        "H0 com p-valores minúsculos (t ≈ 2·10⁻⁵⁵; W+ no máximo possível). Uma inflação",
        "do erro tipo I de 5% para os valores acima não ameaça essa conclusão, porque o",
        "efeito observado (27 s, com desvio de 0,4 s) está ordens de grandeza além de",
        "qualquer região de decisão. Em estudos com efeito pequeno e diferenças",
        "igualmente assimétricas, porém, aplicar o t ou o Wilcoxon sem olhar a forma da",
        "distribuição levaria a muito mais falsos positivos do que α sugere.",
    ]
    return texto


# ------------------------------------------------------------------ main ----

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=Path, default=LAB4_DIR / "data" / "dados_reais.csv",
                        help="pares reais, de onde sai a distribuição nula empírica")
    parser.add_argument("--repeticoes", type=int, default=REPETICOES_PADRAO)
    parser.add_argument("--n", type=int, default=N_PADRAO, help="pares por conjunto simulado")
    parser.add_argument("--alfa", type=float, default=ALFA)
    parser.add_argument("--semente", type=int, default=SEMENTE_PADRAO)
    parser.add_argument("--saida", type=Path, default=LAB4_DIR / "data",
                        help="pasta dos CSVs (resultados_q1.csv e pvalores_q1*.csv)")
    parser.add_argument("--relatorio", type=Path, default=LAB4_DIR / "docs" / "resultados_q1.md")
    parser.add_argument("--sem-conferencia-scipy", action="store_true",
                        help="pula a conferência dos p-valores contra o SciPy")
    args = parser.parse_args()

    if args.repeticoes < 1 or args.n < 2 or not 0 < args.alfa < 1:
        parser.error("use --repeticoes >= 1, --n >= 2 e 0 < --alfa < 1")

    residuos = residuos_centralizados(carregar_diferencas(args.csv))
    diag = diagnostico_nula(residuos, args.n, args.alfa)
    print(f"Distribuição nula: {diag['n_residuos']} resíduos de {args.csv.name} "
          f"(média {diag['media']:.2e}, desvio {diag['desvio']:.4f} s, "
          f"assimetria {diag['assimetria_amostral']:.2f})")
    print(f"R = {args.repeticoes}, n = {args.n}, alfa = {args.alfa}, semente = {args.semente}\n")

    resultados: dict[str, ResultadoCenario] = {}
    linhas: list[dict] = []
    for deslocamento, cenario in enumerate(CENARIOS):
        r = rodar_cenario(residuos, cenario, args.repeticoes, args.n, args.alfa,
                          args.semente + deslocamento)
        if not args.sem_conferencia_scipy:
            conf = conferir_com_scipy(r)
            if not conf["ok"]:
                raise RuntimeError(f"{cenario}: p-valores divergem do SciPy: {conf}")
        resultados[cenario] = r
        linhas += resumo(r)
        print(f"{cenario}  ({r.segundos:.1f} s, {r.repeticoes} repetições válidas)")
        for linha in linhas[-2:]:
            print(f"  {linha['teste']:17} rejeições {linha['rejeicoes']:5}  "
                  f"taxa {100 * linha['taxa_erro_tipo_i']:6.2f}%  "
                  f"IC95 [{100 * linha['ic95_inferior']:.2f}; {100 * linha['ic95_superior']:.2f}]  "
                  f"-> {linha['classificacao']}")
        if r.conferencia_scipy:
            c = r.conferencia_scipy
            print(f"  SciPy: max |dp| t = {c['max_dif_t']:.1e}, Wilcoxon = {c['max_dif_w']:.1e}, "
                  f"decisões divergentes = {c['decisoes_divergentes_t']}/{c['decisoes_divergentes_w']}")
        print(f"  SHA-256: {r.impressao_digital()}\n")

    args.saida.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(linhas).to_csv(args.saida / "resultados_q1.csv", index=False)
    tabela_pvalores(resultados[PRINCIPAL]).to_csv(args.saida / "pvalores_q1.csv", index=False)
    tabela_pvalores(resultados[CONTROLE]).to_csv(args.saida / "pvalores_q1_controle.csv", index=False)
    if args.sem_conferencia_scipy:
        for r in resultados.values():
            r.conferencia_scipy = {}
    escrever_relatorio(args.relatorio, linhas, resultados, diag, args, args.csv.resolve())

    print(f"Saídas: {args.saida / 'resultados_q1.csv'}, pvalores_q1.csv, "
          f"pvalores_q1_controle.csv e {args.relatorio}")


if __name__ == "__main__":
    main()
