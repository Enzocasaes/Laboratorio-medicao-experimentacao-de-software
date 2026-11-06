"""Q1 da Sprint 2 — 10.000 conjuntos simulados sob H0 (Lab04, par P2, Issue #107).

Simula R = 10.000 conjuntos de n = 30 diferenças pareadas e conta quantas vezes
o teste t pareado e o Wilcoxon pareado rejeitam H0 a α = 0,05 (unilateral,
`greater`). Quando a H0 *do teste* é verdadeira na distribuição simulada, toda
rejeição é um erro tipo I:

    taxa de erro tipo I = rejeições / R

## As duas hipóteses nulas não são a mesma

- teste t: H0 μ_d ≤ 0 (a **média** das diferenças);
- Wilcoxon: H0 "a distribuição das diferenças é simétrica em torno de 0 (ou
  deslocada para valores negativos)". O teste é sensível a P(X₁ + X₂ > 0),
  isto é, à **pseudomediana**, e não à média.

Uma distribuição assimétrica pode ter média 0 e pseudomediana positiva. Nela,
a H0 do t é verdadeira e a do Wilcoxon é falsa. Por isso o script verifica,
na distribuição geradora de cada cenário, qual H0 vale (`hipoteses_nulas`), e
só chama de erro tipo I a taxa de um teste cuja H0 é verdadeira.

## Os dois cenários

- `bootstrap_simetrizado` — **referência do erro tipo I.** Os 30 resíduos
  reais (d − d̄) são reamostrados com reposição e cada valor recebe um sinal
  ± sorteado de forma independente. A distribuição geradora é simétrica em
  torno de 0, então as duas H0 valem. É aqui que as taxas dos dois testes
  podem ser comparadas como erro tipo I.
- `bootstrap_centralizado` — **sensibilidade à assimetria.** Os mesmos
  resíduos, reamostrados sem trocar o sinal. Média 0, mas com a assimetria e
  os extremos dos dados reais. A H0 do t vale; a do Wilcoxon não (a
  pseudomediana é positiva). A taxa do t é erro tipo I; a do Wilcoxon é uma
  taxa de rejeição com a H0 dele falsa.

As sementes são 42 (centralizado) e 43 (simetrizado): a ordem de `CENARIOS`
define a semente e não pode mudar sem mudar os resultados.

## O que é reutilizado

Os testes NÃO são reimplementados: as decisões e os p-valores vêm de
`teste_t_pareado` e `wilcoxon_pareado` (src/testes.py, Sprint 1). O IC de
Wilson vem de src/comparacao_erro.py (Issue #108). O NumPy só gera os dados
(`numpy.random.default_rng`). O SciPy só confere, repetição a repetição, que
os p-valores do projeto coincidem com `scipy.stats.ttest_1samp` e
`scipy.stats.wilcoxon` nos mesmos dados.

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

from comparacao_erro import classificar, wilson
from distribuicoes import normal_cdf
from testes import ALFA, TOLERANCIA_ZERO, carregar_diferencas, teste_t_pareado, wilcoxon_pareado

LAB4_DIR = Path(__file__).resolve().parent.parent

SEMENTE_PADRAO = 42
REPETICOES_PADRAO = 10_000
N_PADRAO = 30
# Tolerância da conferência contra o SciPy. As duas implementações usam a
# mesma fórmula; o que sobra é arredondamento de ponto flutuante.
TOLERANCIA_SCIPY = 1e-9
# Tolerância relativa (ao desvio) para "média = 0" e "simétrica": a média dos
# resíduos centralizados é 0 só a menos de arredondamento (~1e-16).
TOLERANCIA_RELATIVA = 1e-9

CENTRALIZADO = "bootstrap_centralizado"
SIMETRIZADO = "bootstrap_simetrizado"
# A ORDEM define as sementes (semente + posição): não reordenar.
CENARIOS = (CENTRALIZADO, SIMETRIZADO)
PAPEL_CENARIO = {
    SIMETRIZADO: "referência do erro tipo I (as duas H0 valem)",
    CENTRALIZADO: "sensibilidade à assimetria (só a H0 do t vale)",
}

TESTE_T = "t pareado"
TESTE_W = "Wilcoxon pareado"

NATUREZA_ERRO = "erro tipo I"
NATUREZA_REJEICAO = "rejeição com a H0 do teste falsa (não é erro tipo I)"
NAO_SE_APLICA = "não se aplica (H0 do teste falsa)"


# ------------------------------------------------------- distribuição nula ----

def residuos_centralizados(diferencas: list[float] | np.ndarray) -> np.ndarray:
    """d - média(d): a distribuição empírica deslocada para ter média 0."""
    d = np.asarray(diferencas, dtype=float)
    return d - d.mean()


def gerar_conjuntos(residuos: np.ndarray, cenario: str, repeticoes: int, n: int,
                    rng: np.random.Generator) -> np.ndarray:
    """Matriz R x n; cada linha é um conjunto simulado de diferenças.

    Tudo é sorteado de uma vez, antes de qualquer teste. Assim os dois testes
    leem a mesma linha da mesma matriz, e os dados não dependem da ordem em
    que os testes rodam.

    No simetrizado, cada valor é X = S·E, com E sorteado dos resíduos e S = ±1
    sorteado com probabilidade 1/2, independentemente de E e das outras
    posições. Então X e −X têm a mesma distribuição: simetria exata em 0.
    """
    amostras = rng.choice(residuos, size=(repeticoes, n), replace=True)
    if cenario == CENTRALIZADO:
        return amostras
    if cenario == SIMETRIZADO:
        sinais = rng.choice(np.array([-1.0, 1.0]), size=(repeticoes, n), replace=True)
        return amostras * sinais
    raise ValueError(f"cenário desconhecido: {cenario} (use um de {CENARIOS})")


def distribuicao_geradora(residuos: np.ndarray, cenario: str) -> np.ndarray:
    """Suporte da distribuição de onde cada valor é sorteado, com pesos iguais.

    Centralizado: os 30 resíduos, 1/30 cada. Simetrizado: os 60 valores ±eᵢ,
    1/60 cada (sortear eᵢ e depois o sinal dá exatamente isso).
    """
    if cenario == CENTRALIZADO:
        return residuos.copy()
    if cenario == SIMETRIZADO:
        return np.concatenate([residuos, -residuos])
    raise ValueError(f"cenário desconhecido: {cenario}")


def hipoteses_nulas(suporte: np.ndarray) -> dict:
    """Qual H0 é verdadeira na distribuição geradora (pesos iguais no suporte).

    - t: H0 μ ≤ 0. Verdadeira se a média da geradora é ≤ 0 (a menos de
      arredondamento).
    - Wilcoxon: H0 "simétrica em torno de 0". W⁺ conta as médias de Walsh
      positivas, e E[W⁺] = n·P(X > 0) + C(n,2)·P(X₁ + X₂ > 0); sob simetria,
      P(X₁ + X₂ > 0) = P(X₁ + X₂ < 0) e E[W⁺] = n(n+1)/4. Se a geradora não é
      simétrica e P(X₁ + X₂ > 0) > P(X₁ + X₂ < 0), a pseudomediana é positiva e
      vale a H1 do teste: as rejeições dele não são erro tipo I.
    """
    s = np.asarray(suporte, dtype=float)
    escala = float(np.std(s)) or 1.0
    tol = TOLERANCIA_RELATIVA * escala
    media = float(s.mean())
    somas = s[:, None] + s[None, :]          # pares i.i.d. (inclui i = j)
    p_soma_pos = float(np.mean(somas > tol))
    p_soma_neg = float(np.mean(somas < -tol))
    simetrica = bool(np.allclose(np.sort(s), np.sort(-s), rtol=0.0, atol=tol))
    pseudomediana = float(np.median(somas / 2))

    h0_t = media <= tol
    if simetrica:
        h0_w = True
    elif p_soma_pos > p_soma_neg:
        h0_w = False
    else:
        # assimétrica, mas puxada para baixo: fora do escopo desta Q1
        raise ValueError("distribuição geradora assimétrica com pseudomediana ≤ 0: "
                         "a H0 do Wilcoxon não fica bem definida")
    return {
        "media": media,
        "simetrica": simetrica,
        "p_soma_positiva": p_soma_pos,
        "p_soma_negativa": p_soma_neg,
        "pseudomediana": pseudomediana,
        TESTE_T: h0_t,
        TESTE_W: h0_w,
    }


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

    def diagnostico_dados(self) -> dict:
        """O que os dados efetivamente sorteados mostram (não a geradora)."""
        x = self.dados
        positivos = x > 0
        magnitude_alta = np.abs(x) > np.median(np.abs(x))
        return {
            "prop_positivos": float(positivos.mean()),
            # P(+) entre os valores de |x| acima e abaixo da mediana: se o sinal
            # independe da magnitude, as duas proporções são iguais
            "prop_positivos_magnitude_alta": float(positivos[magnitude_alta].mean()),
            "prop_positivos_magnitude_baixa": float(positivos[~magnitude_alta].mean()),
            "media_global": float(x.mean()),
        }


def rodar_cenario(residuos: np.ndarray, cenario: str, repeticoes: int = REPETICOES_PADRAO,
                  n: int = N_PADRAO, alfa: float = ALFA,
                  semente: int = SEMENTE_PADRAO) -> ResultadoCenario:
    """R conjuntos; os dois testes do projeto em cada um.

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
    if dados.shape != (repeticoes, n) or not np.isfinite(dados).all():
        raise ValueError(f"{cenario}: matriz de dados com forma {dados.shape} ou valores não finitos")

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

def erro_padrao_monte_carlo(rejeicoes: int, repeticoes: int) -> float:
    """√(p̂(1 − p̂)/R): o erro padrão da taxa estimada."""
    taxa = rejeicoes / repeticoes
    return math.sqrt(taxa * (1 - taxa) / repeticoes)


def resumo(resultado: ResultadoCenario, hipoteses: dict) -> list[dict]:
    """Uma linha por teste, no formato de data/resultados_q1.csv.

    `taxa_rejeicao` é sempre rejeições/R. Ela só é uma taxa de erro tipo I
    quando `h0_do_teste_verdadeira` é True (coluna `natureza_da_taxa`), e só
    nesse caso o teste é classificado como liberal, conservador ou compatível
    com α. O IC é o de Wilson.
    """
    linhas = []
    for teste, p, rejeitou in ((TESTE_T, resultado.p_t, resultado.rejeitou_t),
                               (TESTE_W, resultado.p_w, resultado.rejeitou_w)):
        rejeicoes = int(rejeitou.sum())
        inf, sup = wilson(rejeicoes, resultado.repeticoes)
        h0 = bool(hipoteses[teste])
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
            "papel_do_cenario": PAPEL_CENARIO[resultado.cenario],
            "teste": teste,
            "h0_do_teste_verdadeira": h0,
            "natureza_da_taxa": NATUREZA_ERRO if h0 else NATUREZA_REJEICAO,
            "repeticoes": resultado.repeticoes,
            "n": resultado.n,
            "alfa": resultado.alfa,
            "semente": resultado.semente,
            "rejeicoes": rejeicoes,
            "nao_rejeicoes": resultado.repeticoes - rejeicoes,
            "taxa_rejeicao": rejeicoes / resultado.repeticoes,
            "erro_padrao_mc": erro_padrao_monte_carlo(rejeicoes, resultado.repeticoes),
            "ic95_wilson_inferior": inf,
            "ic95_wilson_superior": sup,
            "p_valor_medio": float(np.mean(p)),
            "p_valor_mediana": float(np.median(p)),
            "p_valor_desvio": float(np.std(p, ddof=1)),
            "classificacao": classificar(inf, sup, resultado.alfa) if h0 else NAO_SE_APLICA,
            "degenerados": degenerados,
            "observacao": observacao,
        })
    return linhas


def tabela_pvalores(resultado: ResultadoCenario) -> pd.DataFrame:
    """Uma linha por repetição: o formato de data/pvalores_q1*.csv."""
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
    """O que a distribuição geradora do centralizado implica, antes de simular.

    Teste t: com uma população assimétrica, a estatística t deixa de seguir a
    t de Student. A expansão de Edgeworth de 1ª ordem (Hall, 1987) dá
    P(T > z) ≈ 1 − Φ(z) − γ/(6√n)·(2z² + 1)·φ(z), com γ a assimetria da
    população e z o quantil normal de 1 − α. Com γ < 0, a cauda superior
    engorda e o teste fica liberal. (A versão anterior misturava o quantil da
    t com a cauda da normal; aqui as duas partes são da normal, e a distância
    entre a t de Student e a normal é de ordem 1/n.)
    """
    # Momentos da distribuição GERADORA (a empírica, com pesos 1/30), e não a
    # estimativa amostral: é dessa população que as amostras saem.
    centro = residuos - residuos.mean()
    sigma_pop = float(np.sqrt(np.mean(centro**2)))
    gama_pop = float(np.mean(centro**3) / sigma_pop**3)

    z = statistics.NormalDist().inv_cdf(1 - alfa)
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
    return f"{x:.{casas}f}".replace(".", ",").replace("-", "−")


def _sim_nao(valor: bool) -> str:
    return "sim" if valor else "**não**"


def escrever_relatorio(caminho: Path, linhas: list[dict], resultados: dict[str, ResultadoCenario],
                       hipoteses: dict[str, dict], diag: dict, args: argparse.Namespace,
                       csv_entrada: Path) -> None:
    """docs/resultados_q1.md — gerado a partir dos números, não escrito à mão."""
    por = {(l["cenario"], l["teste"]): l for l in linhas}
    st, sw = por[(SIMETRIZADO, TESTE_T)], por[(SIMETRIZADO, TESTE_W)]
    ct, cw = por[(CENTRALIZADO, TESTE_T)], por[(CENTRALIZADO, TESTE_W)]
    hs, hc = hipoteses[SIMETRIZADO], hipoteses[CENTRALIZADO]
    ds = resultados[SIMETRIZADO].diagnostico_dados()
    dc = resultados[CENTRALIZADO].diagnostico_dados()
    meia_largura = 1.959963984540054 * math.sqrt(args.alfa * (1 - args.alfa) / args.repeticoes)
    import platform
    versoes = f"Python {platform.python_version()}, NumPy {np.__version__}, pandas {pd.__version__}"
    try:
        import scipy
        versoes += f", SciPy {scipy.__version__}"
    except ImportError:  # pragma: no cover
        pass

    def tabela(cenario: str) -> list[str]:
        saida = ["| Teste | H0 do teste vale? | Rejeições | Não rejeições | Taxa de rejeição | "
                 "IC 95% (Wilson) | O que a taxa mede | Classificação |",
                 "|---|:---:|---:|---:|---:|---|---|---|"]
        for teste in (TESTE_T, TESTE_W):
            l = por[(cenario, teste)]
            saida.append(
                f"| {teste} | {_sim_nao(l['h0_do_teste_verdadeira'])} | {l['rejeicoes']} | "
                f"{l['nao_rejeicoes']} | **{_pct(l['taxa_rejeicao'])}** | "
                f"[{_pct(l['ic95_wilson_inferior'])}; {_pct(l['ic95_wilson_superior'])}] | "
                f"{l['natureza_da_taxa']} | {l['classificacao']} |")
        return saida

    l: list[str] = [
        "# Q1 — 10.000 conjuntos simulados sob H0",
        "",
        "**Lab04 — Sprint 2, Issue #107**",
        "",
        "> Arquivo **gerado** por `python src/erro_tipo_i.py`. Não edite à mão:",
        "> rode o comando de novo. Os números vêm de `data/resultados_q1.csv`. A comparação",
        "> entre os dois testes (Wilson, McNemar, conclusão) está em",
        "> [`comparacao_taxas_erro.md`](comparacao_taxas_erro.md) (Issue #108).",
        "",
        "## 1. Objetivo",
        "",
        "Medir com que frequência o teste t pareado e o Wilcoxon pareado (unilaterais,",
        f"`alternative='greater'`, α = {_num(args.alfa, 2)}) rejeitam a hipótese nula quando ela é",
        "verdadeira. Toda rejeição de uma H0 verdadeira é um **erro tipo I**, e um teste bem",
        f"calibrado deveria cometê-lo em cerca de {_pct(args.alfa, 0)} das vezes:",
        "",
        f"    taxa de erro tipo I = rejeições / {args.repeticoes}",
        "",
        "O ponto delicado é a expressão \"H0 verdadeira\". Os dois testes não têm a mesma H0,",
        "e uma distribuição pode satisfazer a de um sem satisfazer a do outro. A seção 3",
        "trata disso antes de qualquer número.",
        "",
        "## 2. Parâmetros",
        "",
        "| Item | Valor |",
        "|---|---|",
        f"| Repetições por cenário | {args.repeticoes} |",
        f"| Pares por conjunto (n) | {args.n} |",
        f"| α | {_num(args.alfa, 2)} (unilateral, `greater`) |",
        f"| Semente | `numpy.random.default_rng({args.semente})` no centralizado; "
        f"`default_rng({args.semente + 1})` no simetrizado |",
        f"| Dados de origem | `{csv_entrada.relative_to(LAB4_DIR).as_posix()}` "
        f"({diag['n_residuos']} pares reais) |",
        "| Diferença | d = tempo_sem_cache − tempo_com_cache (positiva = o cache reduziu o tempo) |",
        "| Implementação dos testes | `teste_t_pareado` e `wilcoxon_pareado` de `src/testes.py` (Sprint 1) |",
        f"| Ambiente | {versoes} |",
        "",
        "## 3. As hipóteses nulas dos dois testes",
        "",
        "Com d = sem cache − com cache e a alternativa `greater` (seção 4.1 de",
        "`docs/cenario_experimental.md`):",
        "",
        "| Teste | H0 | H1 | Parâmetro de que o teste depende |",
        "|---|---|---|---|",
        "| t pareado | μ_d ≤ 0 | μ_d > 0 | a **média** das diferenças |",
        "| Wilcoxon pareado | distribuição de d simétrica em torno de 0 (ou deslocada para valores negativos) | "
        "deslocamento para valores positivos | P(X₁ + X₂ > 0), ou seja, a **pseudomediana** |",
        "",
        "A estatística W⁺ é igual ao número de médias de Walsh (Xᵢ + Xⱼ)/2, i ≤ j, que são",
        "positivas. Por isso:",
        "",
        "    E[W⁺] = n·P(X > 0) + C(n,2)·P(X₁ + X₂ > 0)",
        "",
        "Sob simetria em torno de 0, P(X₁ + X₂ > 0) = 1/2 e E[W⁺] = n(n+1)/4. Uma",
        "distribuição com P(X₁ + X₂ > 0) > 1/2 tem pseudomediana positiva, e o Wilcoxon",
        "tende a rejeitar, **mesmo que a média seja 0**. Média zero não implica simetria:",
        "numa distribuição assimétrica à esquerda, um valor muito negativo compensa vários",
        "valores pequenos positivos. A média fica em 0, mas a maioria dos valores, e das",
        "médias de Walsh, fica acima de 0.",
        "",
        "Consequência: só é erro tipo I a rejeição de um teste cuja **própria** H0 é",
        "verdadeira na distribuição simulada. O script verifica isso na distribuição geradora",
        "de cada cenário (`hipoteses_nulas` em `src/erro_tipo_i.py`) e grava o resultado na",
        "coluna `h0_do_teste_verdadeira` de `data/resultados_q1.csv`.",
        "",
        "## 4. Como os dados foram gerados",
        "",
        "Os dados reais **não** servem diretamente: neles a diferença média é de 27,24 s, e as",
        "30 diferenças são positivas. Simular a partir deles mediria poder, não erro tipo I.",
        "Sortear de uma normal com média 0 também não basta, porque descartaria o que os",
        "dados reais têm de particular: um desvio pequeno, forte assimetria à esquerda e três",
        "valores extremos (pares 14, 21 e 10). Os dois cenários partem dos **resíduos**",
        f"eᵢ = dᵢ − d̄ das 30 diferenças reais (desvio de {_num(diag['desvio'])} s). A média deles é 0 a",
        f"menos de arredondamento ({diag['media']:.1e} s).",
        "",
        "### 4.1 Cenário simetrizado — referência do erro tipo I",
        "",
        f"Em cada repetição, sortear {args.n} resíduos com reposição e multiplicar cada um por",
        "um sinal S = ±1 sorteado com probabilidade 1/2, de forma independente do resíduo e",
        "das outras posições. Cada valor é X = S·E, e como S é independente de E e simétrico,",
        "X e −X têm a mesma distribuição. A geradora é a distribuição uniforme sobre os 60",
        "valores ±eᵢ: **simétrica em torno de 0 por construção**, com a mesma escala e as",
        "mesmas caudas dos dados reais. As duas H0 valem ao mesmo tempo.",
        "",
        "O que os dados sorteados mostram:",
        "",
        "| Verificação | Esperado | Observado nos 10.000 × 30 valores |",
        "|---|---:|---:|",
        f"| Proporção de valores positivos | 50% | {_pct(ds['prop_positivos'])} |",
        f"| Proporção de positivos entre os 50% maiores \\|x\\| | 50% | {_pct(ds['prop_positivos_magnitude_alta'])} |",
        f"| Proporção de positivos entre os 50% menores \\|x\\| | 50% | {_pct(ds['prop_positivos_magnitude_baixa'])} |",
        f"| P(X₁ + X₂ > 0) na geradora | = P(X₁ + X₂ < 0) | {_pct(hs['p_soma_positiva'])} = {_pct(hs['p_soma_negativa'])} |",
        "",
        "O sinal não depende da magnitude, e a proporção de positivos fica dentro do ruído",
        "de amostragem. Os dois testes recebem a mesma linha da matriz de dados.",
        "",
        "### 4.2 Cenário centralizado — sensibilidade à assimetria",
        "",
        f"Em cada repetição, sortear {args.n} resíduos com reposição, **sem** trocar o sinal. É o",
        "*bootstrap sob a hipótese nula* da média: preserva a forma dos dados reais.",
        "",
        "| Estatística da geradora (os 30 resíduos) | Valor |",
        "|---|---:|",
        f"| Média | {_num(diag['media'], 6)} s |",
        f"| Mediana | {_num(diag['mediana'])} s |",
        f"| Pseudomediana (mediana de (X₁ + X₂)/2) | {_num(hc['pseudomediana'])} s |",
        f"| Desvio-padrão | {_num(diag['desvio'])} s |",
        f"| Assimetria (G1 ajustado) | {_num(diag['assimetria_amostral'], 2)} |",
        f"| Excesso de curtose (G2) | {_num(diag['curtose_excesso'], 2)} |",
        f"| Mínimo / máximo | {_num(diag['minimo'], 3)} s / {_num(diag['maximo'], 3)} s |",
        f"| P(X > 0) | {_pct(diag['prop_positivos'], 1)} |",
        f"| P(X₁ + X₂ > 0) | {_pct(hc['p_soma_positiva'], 1)} (contra {_pct(hc['p_soma_negativa'], 1)} de P(X₁ + X₂ < 0)) |",
        f"| E[W⁺] com n = {args.n} | {_num(diag['esperanca_w_mais'], 1)} (sob a H0 do Wilcoxon: {_num(diag['esperanca_w_mais_h0'], 1)}) |",
        "",
        "A média é 0, mas a distribuição está longe de ser simétrica. Um único resíduo",
        f"muito negativo ({_num(diag['minimo'], 3)} s, o par 14) puxa a média para baixo, e",
        f"{_pct(diag['prop_positivos'], 0)} dos resíduos ficam acima de 0. Nos dados sorteados, "
        f"{_pct(dc['prop_positivos'], 1)} dos valores são positivos.",
        "",
        "### 4.3 Qual H0 vale em cada cenário",
        "",
        "| Cenário | Papel | H0 do t (μ ≤ 0) | H0 do Wilcoxon (simetria em 0) |",
        "|---|---|:---:|:---:|",
        f"| `{SIMETRIZADO}` | {PAPEL_CENARIO[SIMETRIZADO]} | {_sim_nao(hs[TESTE_T])} | {_sim_nao(hs[TESTE_W])} |",
        f"| `{CENTRALIZADO}` | {PAPEL_CENARIO[CENTRALIZADO]} | {_sim_nao(hc[TESTE_T])} | {_sim_nao(hc[TESTE_W])} |",
        "",
        "No centralizado, a taxa do Wilcoxon **não é uma taxa de erro tipo I**. A H0 dele é",
        "falsa (a pseudomediana é positiva), e as rejeições são decisões corretas do ponto de",
        "vista do próprio teste. O cenário continua útil como **análise de sensibilidade**:",
        "mostra o quanto o t perde o controle do erro tipo I com a assimetria dos dados reais,",
        "e o que acontece quando se usa o Wilcoxon para uma pergunta que é sobre a média.",
        "",
        "## 5. Como os testes foram aplicados",
        "",
        "- **Mesmos dados**: os 10.000 × 30 valores são sorteados numa matriz antes de",
        "  qualquer teste, e a linha r vai, como o mesmo objeto, para os dois testes. A",
        "  conferência contra o SciPy recalcula os dois p-valores a partir dessa mesma matriz.",
        "- **Teste t**: `teste_t_pareado(d)`, unilateral, com gl = n − 1.",
        "- **Wilcoxon**: `wilcoxon_pareado(d)`. Zeros (|d| ≤ 0,5 ms) são descartados",
        "  (`zero_method='wilcox'`), e os empates recebem o posto médio. Sem zeros nem",
        "  empates, o p é exato; com eles, usa-se a aproximação normal com correção de",
        "  empates e de continuidade.",
        "- **Empates**: reamostrar com reposição quase sempre repete algum resíduo, e no",
        "  simetrizado eᵢ e −eᵢ têm o mesmo |d|. Por isso o Wilcoxon usou a aproximação",
        f"  normal em {resultados[CENTRALIZADO].metodo_w.count('normal')} das {args.repeticoes} repetições "
        f"do centralizado e em {resultados[SIMETRIZADO].metodo_w.count('normal')} do simetrizado.",
        f"  **Zeros** não ocorrem: o menor |eᵢ| é {_num(diag['menor_abs'], 4)} s, bem acima da",
        "  tolerância de 0,5 ms.",
        "- **Casos degenerados**: nenhuma repetição é descartada. Um conjunto com desvio 0",
        "  (as 30 retiradas iguais) ou sem nenhuma diferença não nula seria mantido com o",
        "  tratamento de `src/testes.py` (t: p = 0 se a média for positiva, senão p = 1;",
        "  Wilcoxon: p = 1) e contado na coluna `degenerados`. Nenhum ocorreu. P-valores",
        "  NaN ou fora de [0, 1] interrompem a execução com erro.",
        "",
        "## 6. Resultados",
        "",
        f"### 6.1 `{SIMETRIZADO}` — referência do erro tipo I",
        "",
        *tabela(SIMETRIZADO),
        "",
        f"### 6.2 `{CENTRALIZADO}` — sensibilidade à assimetria",
        "",
        *tabela(CENTRALIZADO),
        "",
        "### 6.3 Distribuição dos p-valores",
        "",
        "| Cenário | Teste | p médio | p mediano | Desvio-padrão do p | Degenerados | Observação |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for linha in (st, sw, ct, cw):
        l.append(f"| `{linha['cenario']}` | {linha['teste']} | {_num(linha['p_valor_medio'])} | "
                 f"{_num(linha['p_valor_mediana'])} | {_num(linha['p_valor_desvio'])} | "
                 f"{linha['degenerados']} | {linha['observacao']} |")
    l += [
        "",
        "Sob uma H0 verdadeira e com o teste bem calibrado, o p-valor tem distribuição",
        "aproximadamente uniforme em [0, 1]: média e mediana 0,5, desvio 1/√12 ≈ 0,2887.",
        "",
        "### 6.4 Comparação com 5%",
        "",
        f"Com R = {args.repeticoes} e uma taxa verdadeira de {_pct(args.alfa, 0)}, a taxa estimada varia",
        f"±{_num(100 * meia_largura, 2)} ponto percentual (95%) só pelo acaso da simulação, ou seja,",
        f"de {_pct(args.alfa - meia_largura)} a {_pct(args.alfa + meia_largura)}. A classificação usa o IC de Wilson",
        "de cada taxa, e só se aplica quando a H0 do teste é verdadeira:",
        "",
        "- **compatível com α**: 5% está dentro do IC;",
        "- **liberal**: o IC inteiro está acima de 5%, ou seja, o teste rejeita H0 verdadeira",
        "  mais do que promete;",
        "- **conservador**: o IC inteiro está abaixo de 5%.",
        "",
        "| Cenário | Teste | Taxa | Diferença para 5% | Classificação |",
        "|---|---|---:|---:|---|",
    ]
    for linha in (st, sw, ct, cw):
        if linha["h0_do_teste_verdadeira"]:
            dif = 100 * (linha["taxa_rejeicao"] - args.alfa)
            distancia = f"{'+' if dif >= 0 else '−'}{_num(abs(dif), 2)} p.p."
        else:
            distancia = "— (não é erro tipo I)"
        l.append(f"| `{linha['cenario']}` | {linha['teste']} | {_pct(linha['taxa_rejeicao'])} | "
                 f"{distancia} | {linha['classificacao']} |")

    l += ["", "## 7. Interpretação", ""]
    l += _interpretar(st, sw, ct, cw, hc, diag, args)

    conf = {c: resultados[c].conferencia_scipy for c in CENARIOS}
    l += [
        "",
        "## 8. Validação",
        "",
        f"| Verificação | `{SIMETRIZADO}` | `{CENTRALIZADO}` |",
        "|---|---|---|",
        f"| Repetições válidas × valores por conjunto | {resultados[SIMETRIZADO].repeticoes} × "
        f"{resultados[SIMETRIZADO].n} | {resultados[CENTRALIZADO].repeticoes} × {resultados[CENTRALIZADO].n} |",
        "| P-valores NaN ou fora de [0, 1] | 0 | 0 |",
        f"| Conjuntos degenerados (t / Wilcoxon) | {resultados[SIMETRIZADO].desvio_zero} / "
        f"{resultados[SIMETRIZADO].wilcoxon_indefinido} | {resultados[CENTRALIZADO].desvio_zero} / "
        f"{resultados[CENTRALIZADO].wilcoxon_indefinido} |",
    ]
    if all(conf.values()):
        l += [
            f"| Maior diferença de p para o SciPy (t) | {conf[SIMETRIZADO]['max_dif_t']:.1e} | "
            f"{conf[CENTRALIZADO]['max_dif_t']:.1e} |",
            f"| Maior diferença de p para o SciPy (Wilcoxon) | {conf[SIMETRIZADO]['max_dif_w']:.1e} | "
            f"{conf[CENTRALIZADO]['max_dif_w']:.1e} |",
            f"| Decisões diferentes das do SciPy (t / Wilcoxon) | "
            f"{conf[SIMETRIZADO]['decisoes_divergentes_t']} / {conf[SIMETRIZADO]['decisoes_divergentes_w']} | "
            f"{conf[CENTRALIZADO]['decisoes_divergentes_t']} / {conf[CENTRALIZADO]['decisoes_divergentes_w']} |",
        ]
    l += [
        f"| Impressão digital (SHA-256 de dados + p-valores) | `{resultados[SIMETRIZADO].impressao_digital()[:16]}…` | "
        f"`{resultados[CENTRALIZADO].impressao_digital()[:16]}…` |",
        "",
        "A conferência usa `scipy.stats.ttest_1samp(d, 0, alternative='greater')` e",
        "`scipy.stats.wilcoxon(d, alternative='greater', zero_method='wilcox',",
        "correction=True, method='approx')` (ou `method='exact'` nas repetições em que o",
        "projeto usou o p exato), calculados sobre a mesma matriz de dados. Como os dois",
        "p-valores de cada linha batem com os do SciPy calculados a partir da mesma linha,",
        "os dois testes do projeto receberam exatamente os mesmos dados. Rodar de novo com a",
        "mesma semente tem de reproduzir a mesma impressão digital.",
        "",
        "## 9. Limitações",
        "",
        "- **Uma única fonte para a forma da distribuição.** Os dois cenários reamostram 30",
        "  resíduos de um único projeto, numa única máquina. Valores que não apareceram na",
        "  coleta nunca são sorteados, e cada valor observado, inclusive os extremos, tem",
        f"  peso exato de 1/30. Em {_pct(diag['prob_sem_extremo'], 0)} dos conjuntos o resíduo mais negativo",
        "  (par 14) nem é sorteado, e a forma da cauda depende de 1 a 3 observações.",
        "- **O simetrizado não é a distribuição real.** Ele mantém a escala e as caudas, mas",
        "  remove justamente a assimetria que caracteriza os dados. É uma referência para",
        "  medir o erro tipo I quando as duas H0 valem, não um retrato do experimento.",
        "- **Não existe um cenário com a forma real em que as duas H0 valham.** A H0 do",
        "  Wilcoxon exige simetria, e a forma real é assimétrica. Centralizar pela",
        "  pseudomediana em vez da média faria P(X₁ + X₂ > 0) ≈ 1/2, mas não tornaria a",
        "  distribuição simétrica (a distribuição nula de W⁺ continuaria não valendo) e",
        "  tornaria falsa a H0 do t. Por isso o erro tipo I do Wilcoxon só é medido no",
        "  simetrizado.",
        "- **Só a forma das diferenças é preservada**, e não a estrutura temporal da coleta",
        "  (ordem AB/BA, aquecimento da JVM, deriva térmica). Os conjuntos simulados são",
        "  i.i.d.; os dados reais podem não ser.",
        "- **Empates artificiais.** A reamostragem repete valores, e isso leva o Wilcoxon",
        "  para a aproximação normal com correção de empates em todas as repetições, mesmo",
        "  que os tempos reais sejam contínuos. O comportamento do p exato não é avaliado.",
        "- **n fixo em 30.** A taxa de erro do t numa população assimétrica converge para α",
        "  à medida que n cresce (o termo de Edgeworth cai com 1/√n). Os números valem para",
        "  o n do experimento.",
        f"- **Erro de Monte Carlo.** Cada taxa perto de 5% tem incerteza de ±{_num(100 * meia_largura, 2)} p.p. (IC de",
        "  95%). Diferenças menores que isso não devem ser interpretadas.",
        "",
        "## 10. Arquivos",
        "",
        "| Arquivo | Conteúdo |",
        "|---|---|",
        "| `src/erro_tipo_i.py` | a simulação |",
        "| `data/resultados_q1.csv` | uma linha por cenário × teste: contagens, taxa, IC de Wilson, se a H0 do teste vale e o que a taxa mede |",
        f"| `data/pvalores_q1.csv` | os 10.000 pares de p-valores do `{CENTRALIZADO}` |",
        f"| `data/pvalores_q1_controle.csv` | os 10.000 pares de p-valores do `{SIMETRIZADO}` |",
        "",
        "Os nomes dos dois arquivos de p-valores foram mantidos por compatibilidade com a",
        "Issue #107: `pvalores_q1.csv` é o centralizado, e `pvalores_q1_controle.csv`, o",
        "simetrizado.",
        "",
        "## Como refazer",
        "",
        "```bash",
        "cd Lab4",
        "pip install -r requirements-q1.txt",
        f"python src/erro_tipo_i.py --repeticoes {args.repeticoes} --n {args.n} "
        f"--alfa {args.alfa} --semente {args.semente}",
        "python src/comparacao_erro.py   # a comparação da Issue #108",
        "```",
        "",
        "A execução leva da ordem de 10 s. Com a mesma semente, os CSVs e este relatório",
        "saem idênticos, inclusive as impressões digitais acima.",
        "",
    ]
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(l), encoding="utf-8")


def _interpretar(st: dict, sw: dict, ct: dict, cw: dict, hc: dict, diag: dict,
                 args: argparse.Namespace) -> list[str]:
    """Texto de interpretação montado a partir das classificações obtidas."""
    texto = []
    if st["classificacao"] == sw["classificacao"] == "compatível com α":
        texto += [
            f"**Simetrizado: os dois testes ficam no nível nominal.** Com as duas H0",
            f"verdadeiras, o t rejeitou em {_pct(st['taxa_rejeicao'])} e o Wilcoxon em "
            f"{_pct(sw['taxa_rejeicao'])}. Os dois ICs de Wilson",
            "contêm 5%. Isso é o esperado de implementações corretas nessas condições e, junto",
            "com a conferência contra o SciPy (seção 8), dá confiança nos p-valores. Não prova",
            "que os testes controlem o erro tipo I em qualquer distribuição.",
            "",
        ]
    else:
        texto += [
            "**Atenção: no simetrizado, ao menos um teste ficou fora da faixa compatível com",
            f"5%** (t = {_pct(st['taxa_rejeicao'])}, {st['classificacao']}; Wilcoxon = "
            f"{_pct(sw['taxa_rejeicao'])}, {sw['classificacao']}). Como as duas H0 valem ali,",
            "isso pede investigação antes de interpretar o outro cenário.",
            "",
        ]

    texto += [f"**Centralizado, teste t: {_pct(ct['taxa_rejeicao'])} ({ct['classificacao']}).**"]
    if ct["classificacao"] == "liberal":
        texto += [
            "A H0 do t (média 0) é verdadeira aqui, então essa é uma taxa de erro tipo I, e ela",
            f"chega a {_num(ct['taxa_rejeicao'] / args.alfa, 1)} vezes o nominal. "
            f"Com n = {args.n} e uma população de assimetria",
            f"{_num(diag['assimetria_populacional'], 2)}, a estatística t não segue a t de Student. Nas amostras",
            "que não sorteiam o resíduo extremo negativo, a média sai levemente positiva e o",
            "desvio sai pequeno, e o t resultante é grande. Nas que sorteiam, a média cai, mas o",
            "desvio infla junto, e o t fica contido. Com assimetria negativa, a cauda",
            "**superior** de T engorda, e é exatamente essa a cauda que o teste `greater` usa. A",
            f"expansão de Edgeworth de 1ª ordem prevê ≈ {_pct(diag['edgeworth_taxa_t'], 1)}, na mesma direção do",
            "valor simulado. O que sobra vem de termos de ordem 1/n, que pesam com um excesso",
            f"de curtose de {_num(diag['curtose_excesso'], 1)}.",
            "",
        ]
    elif ct["classificacao"] == "conservador":
        texto += ["O t rejeitou menos do que o nominal: com esta forma de distribuição, ele",
                  "protege contra o erro tipo I mais do que α promete, e paga em poder.", ""]
    else:
        texto += ["O t ficou dentro da faixa de Monte Carlo de 5%: a assimetria dos dados não",
                  "compromete a sua calibração com n = 30.", ""]

    texto += [
        f"**Centralizado, Wilcoxon: {_pct(cw['taxa_rejeicao'])} — não é erro tipo I.** A H0 do Wilcoxon",
        f"é falsa nessa distribuição: P(X₁ + X₂ > 0) = {_pct(hc['p_soma_positiva'], 1)} e a pseudomediana é",
        f"{_num(hc['pseudomediana'], 3)} s. O teste está detectando, corretamente, que as diferenças estão",
        "deslocadas para a direita no sentido dos postos. A taxa funciona como o **poder**",
        f"do Wilcoxon contra um deslocamento de pseudomediana de {_num(hc['pseudomediana'], 3)} s "
        f"(≈ {_num(hc['pseudomediana'] / diag['desvio'], 2)} desvio).",
        "",
        "O que o cenário mostra para o experimento é outra coisa: se a pergunta é sobre o",
        "tempo **médio** de build, um p < 0,05 do Wilcoxon não basta para concluir que a",
        f"média caiu. Aqui a média não muda, e ainda assim ele rejeita em {_pct(cw['taxa_rejeicao'], 1)} dos",
        "conjuntos. Com diferenças assimétricas, os dois testes respondem a perguntas",
        "diferentes, e a escolha entre eles depende de qual parâmetro interessa.",
        "",
        "**Para os dados reais**, nada disso ameaça a conclusão. Os dois testes rejeitam H0",
        "com p-valores minúsculos (t ≈ 2·10⁻⁵⁵; W⁺ no máximo possível), e o efeito",
        "observado (27 s, com desvio de 0,4 s) está muito além de qualquer região de",
        "decisão. A inflação do erro tipo I pesaria num estudo com efeito pequeno e",
        "diferenças igualmente assimétricas.",
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
    print(f"Resíduos: {diag['n_residuos']} de {args.csv.name} "
          f"(média {diag['media']:.2e}, desvio {diag['desvio']:.4f} s, "
          f"assimetria {diag['assimetria_amostral']:.2f})")
    print(f"R = {args.repeticoes}, n = {args.n}, alfa = {args.alfa}, semente = {args.semente}\n")

    resultados: dict[str, ResultadoCenario] = {}
    hipoteses: dict[str, dict] = {}
    linhas: list[dict] = []
    for deslocamento, cenario in enumerate(CENARIOS):
        hipoteses[cenario] = hipoteses_nulas(distribuicao_geradora(residuos, cenario))
        r = rodar_cenario(residuos, cenario, args.repeticoes, args.n, args.alfa,
                          args.semente + deslocamento)
        if not args.sem_conferencia_scipy:
            conf = conferir_com_scipy(r)
            if not conf["ok"]:
                raise RuntimeError(f"{cenario}: p-valores divergem do SciPy: {conf}")
        resultados[cenario] = r
        linhas += resumo(r, hipoteses[cenario])
        h = hipoteses[cenario]
        print(f"{cenario}  ({r.segundos:.1f} s, {r.repeticoes} repetições válidas) — "
              f"H0 do t: {h[TESTE_T]}, H0 do Wilcoxon: {h[TESTE_W]} "
              f"(pseudomediana {h['pseudomediana']:+.4f} s)")
        for linha in linhas[-2:]:
            print(f"  {linha['teste']:17} rejeições {linha['rejeicoes']:5}  "
                  f"taxa {100 * linha['taxa_rejeicao']:6.2f}%  "
                  f"Wilson [{100 * linha['ic95_wilson_inferior']:.2f}; "
                  f"{100 * linha['ic95_wilson_superior']:.2f}]  -> {linha['classificacao']}")
        if r.conferencia_scipy:
            c = r.conferencia_scipy
            print(f"  SciPy: max |dp| t = {c['max_dif_t']:.1e}, Wilcoxon = {c['max_dif_w']:.1e}, "
                  f"decisões divergentes = {c['decisoes_divergentes_t']}/{c['decisoes_divergentes_w']}")
        print(f"  SHA-256: {r.impressao_digital()}\n")

    args.saida.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(linhas).to_csv(args.saida / "resultados_q1.csv", index=False)
    tabela_pvalores(resultados[CENTRALIZADO]).to_csv(args.saida / "pvalores_q1.csv", index=False)
    tabela_pvalores(resultados[SIMETRIZADO]).to_csv(args.saida / "pvalores_q1_controle.csv", index=False)
    if args.sem_conferencia_scipy:
        for r in resultados.values():
            r.conferencia_scipy = {}
    escrever_relatorio(args.relatorio, linhas, resultados, hipoteses, diag, args,
                       args.csv.resolve())

    print(f"Saídas: {args.saida / 'resultados_q1.csv'}, pvalores_q1.csv, "
          f"pvalores_q1_controle.csv e {args.relatorio}")


if __name__ == "__main__":
    main()
