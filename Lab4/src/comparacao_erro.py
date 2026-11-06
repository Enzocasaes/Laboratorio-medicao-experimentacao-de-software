"""Comparação das taxas de erro tipo I — t pareado × Wilcoxon (Lab04, Issue #108).

Lê os p-valores que `src/erro_tipo_i.py` (Issue #107) gravou para os 10.000
conjuntos simulados em cada cenário e compara os dois testes:

- rejeições, não rejeições e taxa de rejeição de cada teste, com IC de 95% de
  Wilson;
- se a taxa é um erro tipo I: isso depende de a H0 *do teste* ser verdadeira
  no cenário, informação que vem de `data/resultados_q1.csv`
  (`h0_do_teste_verdadeira`). Só nesse caso a taxa é comparada com α e o
  teste é classificado como liberal, conservador ou compatível com α;
- a diferença entre as duas taxas, em pontos percentuais, com IC pareado;
- o teste de McNemar sobre as decisões, porque os dois testes foram aplicados
  aos MESMOS conjuntos: cada repetição é um par de decisões, e as duas taxas
  não são proporções independentes.

Nada é simulado de novo. As decisões são refeitas a partir dos p-valores
(p < α), conferidas contra as colunas `rejeitou_*` e contra o agregado de
`data/resultados_q1.csv`; qualquer divergência interrompe a execução.

Só a biblioteca padrão: o dashboard importa este módulo para desenhar o G3, e
ele precisa continuar abrindo sem `pip install`.

Uso (a partir de Lab4/):

    python src/comparacao_erro.py
"""

from __future__ import annotations

import argparse
import csv
import math
from dataclasses import asdict, dataclass
from pathlib import Path

LAB4_DIR = Path(__file__).resolve().parent.parent
DADOS = LAB4_DIR / "data"

# z de 97,5%: IC bilateral de 95%
Z_975 = 1.959963984540054

CENTRALIZADO = "bootstrap_centralizado"
SIMETRIZADO = "bootstrap_simetrizado"
# ordem de apresentação: primeiro a referência do erro tipo I
ORDEM = (SIMETRIZADO, CENTRALIZADO)
ARQUIVOS_PVALORES = {
    CENTRALIZADO: "pvalores_q1.csv",
    SIMETRIZADO: "pvalores_q1_controle.csv",
}
NOMES_CENARIO = {
    SIMETRIZADO: "Erro tipo I · distribuição simétrica (as duas H0 valem)",
    CENTRALIZADO: "Sensibilidade à assimetria · forma dos dados reais (só a H0 do t vale)",
}

TESTE_T = "t pareado"
TESTE_W = "Wilcoxon pareado"

COMPATIVEL = "compatível com α"
NAO_SE_APLICA = "não se aplica (H0 do teste falsa)"
EMPATE_TECNICO = "empate técnico"


# ------------------------------------------------------------ estatística ----

def wilson(sucessos: int, total: int, z: float = Z_975) -> tuple[float, float]:
    """IC de Wilson (escore) para uma proporção binomial.

    Diferente do Wald (p ± z·√(p(1−p)/n)), não sai de [0, 1] e mantém a
    cobertura perto da nominal mesmo com proporções pequenas, como 5%.
    """
    if total <= 0:
        raise ValueError("total precisa ser positivo")
    if not 0 <= sucessos <= total:
        raise ValueError("sucessos fora de [0, total]")
    p = sucessos / total
    z2 = z * z
    denominador = 1 + z2 / total
    centro = (p + z2 / (2 * total)) / denominador
    meia = z / denominador * math.sqrt(p * (1 - p) / total + z2 / (4 * total * total))
    return max(0.0, centro - meia), min(1.0, centro + meia)


def classificar(ic_inf: float, ic_sup: float, alfa: float) -> str:
    """Calibração a partir do IC da taxa (só vale se a H0 do teste é verdadeira).

    A comparação é com o IC, não com a taxa pontual: com R = 10.000, uma taxa
    de 5,3% pode ser só ruído de simulação.
    """
    if ic_inf > alfa:
        return "liberal"
    if ic_sup < alfa:
        return "conservador"
    return COMPATIVEL


def log10_binomial_cauda_inferior(k: int, m: int) -> float:
    """log10 P(X ≤ k), X ~ Binomial(m, 1/2), com aritmética inteira exata.

    Com m na casa dos milhares, a probabilidade pode ficar abaixo do menor
    float; o log10 continua representável e é ele que vai para o relatório.
    """
    if m == 0:
        return 0.0
    soma = sum(math.comb(m, i) for i in range(k + 1))
    return math.log10(soma) - m * math.log10(2)


@dataclass
class McNemar:
    """Tabela 2×2 das decisões nas mesmas repetições e o teste de McNemar."""

    ambos_rejeitam: int        # a: t rejeita e Wilcoxon rejeita
    so_t_rejeita: int          # b
    so_w_rejeita: int          # c
    nenhum_rejeita: int        # d
    discordantes: int          # b + c
    qui2_cc: float             # (|b − c| − 1)² / (b + c)
    p_qui2_cc: float
    log10_p_exato: float       # bilateral, binomial exata sobre os discordantes
    p_exato: float             # 0.0 quando abaixo do menor float representável

    @property
    def concordancia(self) -> float:
        total = self.ambos_rejeitam + self.so_t_rejeita + self.so_w_rejeita + self.nenhum_rejeita
        return (self.ambos_rejeitam + self.nenhum_rejeita) / total


def mcnemar(rejeitou_t: list[bool], rejeitou_w: list[bool]) -> McNemar:
    """McNemar para duas decisões binárias tomadas sobre os mesmos conjuntos.

    Só os pares discordantes informam: a H0 de McNemar é P(só t) = P(só W), ou
    seja, que as duas taxas marginais de rejeição são iguais. O p exato é o
    bilateral da Binomial(b + c, 1/2), 2·P(X ≤ min(b, c)) limitado a 1. A
    versão qui-quadrado (com correção de continuidade, 1 gl) vai junto por ser
    a mais citada; com b + c na casa das centenas, as duas coincidem.
    """
    if len(rejeitou_t) != len(rejeitou_w):
        raise ValueError("as duas listas de decisões precisam ter o mesmo tamanho")
    a = b = c = d = 0
    for rt, rw in zip(rejeitou_t, rejeitou_w):
        if rt and rw:
            a += 1
        elif rt:
            b += 1
        elif rw:
            c += 1
        else:
            d += 1
    m = b + c
    if m == 0:
        qui2, p_qui2, log_p = 0.0, 1.0, 0.0
    else:
        qui2 = (abs(b - c) - 1) ** 2 / m if abs(b - c) >= 1 else 0.0
        # qui-quadrado com 1 gl: P(X² > x) = erfc(√(x/2))
        p_qui2 = math.erfc(math.sqrt(qui2 / 2))
        log_p = min(0.0, math.log10(2) + log10_binomial_cauda_inferior(min(b, c), m))
    p_exato = 10.0 ** log_p if log_p > -300 else 0.0
    return McNemar(a, b, c, d, m, qui2, p_qui2, log_p, p_exato)


def faixa_acaso(alfa: float, repeticoes: int, z: float = Z_975) -> tuple[float, float]:
    """Onde a taxa estimada cairia, em 95% das simulações, se a verdadeira fosse α."""
    meia = z * math.sqrt(alfa * (1 - alfa) / repeticoes)
    return alfa - meia, alfa + meia


def diferenca_pareada(so_t: int, so_w: int, total: int,
                      z: float = Z_975) -> tuple[float, float, float]:
    """taxa_W − taxa_t e IC de 95% (Wald para proporções pareadas).

    Var(p̂_W − p̂_t) = [(b + c) − (c − b)²/N] / N². Com N = 10.000 a
    aproximação normal é adequada; o IC dá a escala da diferença, e a decisão
    formal fica com o McNemar.
    """
    dif = (so_w - so_t) / total
    variancia = ((so_t + so_w) - (so_w - so_t) ** 2 / total) / total**2
    meia = z * math.sqrt(max(variancia, 0.0))
    return dif, dif - meia, dif + meia


# ------------------------------------------------------------ leitura ----

def ler_csv(caminho: Path) -> list[dict[str, str]]:
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        return list(csv.DictReader(arquivo))


def _booleano(texto: str) -> bool:
    if texto == "True":
        return True
    if texto == "False":
        return False
    raise ValueError(f"valor booleano inesperado: {texto!r}")


@dataclass
class Decisoes:
    """As decisões dos dois testes, repetição a repetição, de um cenário."""

    cenario: str
    alfa: float
    p_t: list[float]
    p_w: list[float]

    @property
    def repeticoes(self) -> int:
        return len(self.p_t)

    @property
    def rejeitou_t(self) -> list[bool]:
        return [p < self.alfa for p in self.p_t]

    @property
    def rejeitou_w(self) -> list[bool]:
        return [p < self.alfa for p in self.p_w]


def carregar_decisoes(caminho: Path, cenario: str, alfa: float) -> Decisoes:
    """Lê um `pvalores_q1*.csv` e confere a sua integridade.

    - as repetições são 1..R, sem buraco nem repetição;
    - cada linha traz os dois p-valores (o mesmo conjunto foi para os dois testes);
    - os p-valores são finitos e estão em [0, 1];
    - a decisão gravada (`rejeitou_*`) é a mesma que p < α dá agora.
    """
    if not caminho.exists():
        raise FileNotFoundError(
            f"{caminho} não existe. Rode antes `python src/erro_tipo_i.py` (Issue #107).")
    linhas = ler_csv(caminho)
    if not linhas:
        raise ValueError(f"{caminho.name} está vazio")
    p_t, p_w = [], []
    for esperado, linha in enumerate(linhas, start=1):
        if int(linha["repeticao"]) != esperado:
            raise ValueError(f"{caminho.name}: repetição {linha['repeticao']} na posição {esperado}")
        pt, pw = float(linha["p_valor_t"]), float(linha["p_valor_wilcoxon"])
        for nome, p in (("t", pt), ("Wilcoxon", pw)):
            if not (math.isfinite(p) and 0.0 <= p <= 1.0):
                raise ValueError(f"{caminho.name}: p-valor do {nome} inválido na repetição {esperado}")
        if _booleano(linha["rejeitou_t"]) != (pt < alfa) or \
                _booleano(linha["rejeitou_wilcoxon"]) != (pw < alfa):
            raise ValueError(f"{caminho.name}: decisão gravada diverge de p < α "
                             f"na repetição {esperado}")
        p_t.append(pt)
        p_w.append(pw)
    return Decisoes(cenario, alfa, p_t, p_w)


# ------------------------------------------------------------ comparação ----

@dataclass
class TaxaTeste:
    cenario: str
    teste: str
    h0_verdadeira: bool          # a H0 DESTE teste vale na distribuição simulada?
    natureza: str                # "erro tipo I" ou "rejeição com a H0 do teste falsa"
    repeticoes: int
    alfa: float
    rejeicoes: int
    nao_rejeicoes: int
    taxa: float
    ic_wilson_inf: float
    ic_wilson_sup: float
    distancia_alfa_pp: float | None   # taxa − α em p.p.; None se não é erro tipo I
    razao_alfa: float | None          # taxa / α; None se não é erro tipo I
    classificacao: str


@dataclass
class Comparacao:
    cenario: str
    t: TaxaTeste
    w: TaxaTeste
    mcnemar: McNemar
    diferenca_pp: float          # taxa_W − taxa_t
    diferenca_ic_inf_pp: float
    diferenca_ic_sup_pp: float

    @property
    def compara_erro_tipo_i(self) -> bool:
        """As duas taxas só são comparáveis como erro tipo I se as duas H0 valem."""
        return self.t.h0_verdadeira and self.w.h0_verdadeira

    @property
    def mais_proximo(self) -> str | None:
        """Qual taxa ficou mais perto de α.

        None quando a comparação não é de erro tipo I; "empate técnico" quando
        as duas são compatíveis com α (a distância está dentro do ruído).
        """
        if not self.compara_erro_tipo_i:
            return None
        if self.t.classificacao == self.w.classificacao == COMPATIVEL:
            return EMPATE_TECNICO
        dt, dw = abs(self.t.distancia_alfa_pp), abs(self.w.distancia_alfa_pp)
        if math.isclose(dt, dw, abs_tol=1e-12):
            return EMPATE_TECNICO
        return TESTE_T if dt < dw else TESTE_W


NATUREZA_ERRO = "erro tipo I"
NATUREZA_REJEICAO = "rejeição com a H0 do teste falsa (não é erro tipo I)"


def taxa_teste(cenario: str, teste: str, rejeitou: list[bool], alfa: float,
               h0_verdadeira: bool) -> TaxaTeste:
    r = len(rejeitou)
    k = sum(rejeitou)
    inf, sup = wilson(k, r)
    taxa = k / r
    if h0_verdadeira:
        return TaxaTeste(cenario, teste, True, NATUREZA_ERRO, r, alfa, k, r - k, taxa, inf, sup,
                         100 * (taxa - alfa), taxa / alfa, classificar(inf, sup, alfa))
    return TaxaTeste(cenario, teste, False, NATUREZA_REJEICAO, r, alfa, k, r - k, taxa, inf, sup,
                     None, None, NAO_SE_APLICA)


def comparar(decisoes: Decisoes, h0: dict[str, bool]) -> Comparacao:
    """`h0` = {teste: a H0 desse teste vale no cenário?}."""
    rt, rw = decisoes.rejeitou_t, decisoes.rejeitou_w
    t = taxa_teste(decisoes.cenario, TESTE_T, rt, decisoes.alfa, h0[TESTE_T])
    w = taxa_teste(decisoes.cenario, TESTE_W, rw, decisoes.alfa, h0[TESTE_W])
    mc = mcnemar(rt, rw)
    dif, inf, sup = diferenca_pareada(mc.so_t_rejeita, mc.so_w_rejeita, decisoes.repeticoes)
    return Comparacao(decisoes.cenario, t, w, mc, 100 * dif, 100 * inf, 100 * sup)


def conferir_com_resultados_q1(comparacoes: dict[str, Comparacao],
                               resultados_q1: list[dict[str, str]]) -> None:
    """Contagens, taxa e classificação daqui têm de ser as de `data/resultados_q1.csv`."""
    for linha in resultados_q1:
        comp = comparacoes.get(linha["cenario"])
        if comp is None:
            continue
        taxa = comp.t if linha["teste"] == TESTE_T else comp.w
        esperado = (int(linha["repeticoes"]), int(linha["rejeicoes"]),
                    int(linha["nao_rejeicoes"]), linha["classificacao"])
        obtido = (taxa.repeticoes, taxa.rejeicoes, taxa.nao_rejeicoes, taxa.classificacao)
        if esperado != obtido:
            raise ValueError(f"{linha['cenario']} / {linha['teste']}: resultados_q1.csv diz "
                             f"{esperado}, os p-valores dão {obtido}")
    for cenario in comparacoes:
        if not any(l["cenario"] == cenario for l in resultados_q1):
            raise ValueError(f"{cenario} ausente de resultados_q1.csv")


def carregar_comparacoes(dados: Path = DADOS) -> tuple[dict[str, Comparacao], float]:
    """Lê, confere e compara os dois cenários, na ORDEM de apresentação.

    Devolve (comparações, α).
    """
    caminho_q1 = dados / "resultados_q1.csv"
    if not caminho_q1.exists():
        raise FileNotFoundError(f"{caminho_q1} não existe. Rode `python src/erro_tipo_i.py`.")
    resultados_q1 = ler_csv(caminho_q1)
    if "h0_do_teste_verdadeira" not in resultados_q1[0]:
        raise ValueError("resultados_q1.csv sem a coluna h0_do_teste_verdadeira: "
                         "rode de novo `python src/erro_tipo_i.py`")
    alfas = {float(l["alfa"]) for l in resultados_q1}
    if len(alfas) != 1:
        raise ValueError(f"resultados_q1.csv mistura valores de α: {sorted(alfas)}")
    alfa = alfas.pop()
    h0: dict[str, dict[str, bool]] = {}
    for linha in resultados_q1:
        h0.setdefault(linha["cenario"], {})[linha["teste"]] = _booleano(
            linha["h0_do_teste_verdadeira"])
    comparacoes = {}
    for cenario in ORDEM:
        decisoes = carregar_decisoes(dados / ARQUIVOS_PVALORES[cenario], cenario, alfa)
        comparacoes[cenario] = comparar(decisoes, h0[cenario])
    conferir_com_resultados_q1(comparacoes, resultados_q1)
    return comparacoes, alfa


# ------------------------------------------------------------ saídas ----

def escrever_csvs(comparacoes: dict[str, Comparacao], pasta: Path) -> tuple[Path, Path]:
    taxas = pasta / "comparacao_taxas_erro.csv"
    linhas = []
    for c in comparacoes.values():
        linhas += [asdict(c.t), asdict(c.w)]
    with open(taxas, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=list(linhas[0]))
        escritor.writeheader()
        escritor.writerows(linhas)

    pareado = pasta / "mcnemar_q1.csv"
    with open(pareado, "w", newline="", encoding="utf-8") as arquivo:
        campos = ["cenario", "compara_erro_tipo_i", "repeticoes", "ambos_rejeitam",
                  "so_t_rejeita", "so_w_rejeita", "nenhum_rejeita", "concordancia",
                  "diferenca_w_menos_t_pp", "diferenca_ic95_inf_pp", "diferenca_ic95_sup_pp",
                  "qui2_cc", "p_qui2_cc", "log10_p_exato", "p_exato"]
        escritor = csv.DictWriter(arquivo, fieldnames=campos)
        escritor.writeheader()
        for c in comparacoes.values():
            m = c.mcnemar
            escritor.writerow({
                "cenario": c.cenario, "compara_erro_tipo_i": c.compara_erro_tipo_i,
                "repeticoes": c.t.repeticoes,
                "ambos_rejeitam": m.ambos_rejeitam, "so_t_rejeita": m.so_t_rejeita,
                "so_w_rejeita": m.so_w_rejeita, "nenhum_rejeita": m.nenhum_rejeita,
                "concordancia": m.concordancia, "diferenca_w_menos_t_pp": c.diferenca_pp,
                "diferenca_ic95_inf_pp": c.diferenca_ic_inf_pp,
                "diferenca_ic95_sup_pp": c.diferenca_ic_sup_pp,
                "qui2_cc": m.qui2_cc, "p_qui2_cc": m.p_qui2_cc,
                "log10_p_exato": m.log10_p_exato, "p_exato": m.p_exato,
            })
    return taxas, pareado


def _pct(x: float, casas: int = 2) -> str:
    return f"{100 * x:.{casas}f}%".replace(".", ",")


def _num(x: float, casas: int = 2) -> str:
    return f"{x:.{casas}f}".replace(".", ",").replace("-", "−")


def _pp(x: float, casas: int = 2) -> str:
    return ("+" if x >= 0 else "−") + f"{abs(x):.{casas}f}".replace(".", ",") + " p.p."


def formatar_p(m: McNemar) -> str:
    """p do McNemar legível: decimal quando dá, potência de 10 quando é minúsculo."""
    if m.log10_p_exato > -4:
        return _num(m.p_exato, 4)
    expoente = math.floor(m.log10_p_exato)
    mantissa = 10 ** (m.log10_p_exato - expoente)
    return f"{_num(mantissa, 1)} × 10^{expoente}"


def escrever_relatorio(caminho: Path, comparacoes: dict[str, Comparacao], alfa: float) -> None:
    """docs/comparacao_taxas_erro.md — gerado a partir dos números."""
    s, c = comparacoes[SIMETRIZADO], comparacoes[CENTRALIZADO]
    r = s.t.repeticoes
    faixa = faixa_acaso(alfa, r)
    meia_mc = 100 * (faixa[1] - alfa)

    def tabela_taxas(comp: Comparacao) -> list[str]:
        saida = ["| Teste | H0 do teste vale? | Rejeições de H0 | Não rejeições | Taxa de rejeição | "
                 "IC 95% (Wilson) | Distância para 5% | Classificação |",
                 "|---|:---:|---:|---:|---:|---|---:|---|"]
        for x in (comp.t, comp.w):
            distancia = _pp(x.distancia_alfa_pp) if x.h0_verdadeira else "— (não é erro tipo I)"
            saida.append(f"| {x.teste} | {'sim' if x.h0_verdadeira else '**não**'} | "
                         f"{x.rejeicoes} | {x.nao_rejeicoes} | **{_pct(x.taxa)}** | "
                         f"[{_pct(x.ic_wilson_inf)}; {_pct(x.ic_wilson_sup)}] | "
                         f"{distancia} | {x.classificacao} |")
        return saida

    def tabela_2x2(comp: Comparacao) -> list[str]:
        m = comp.mcnemar
        return [
            "| | Wilcoxon rejeita | Wilcoxon não rejeita | Total |",
            "|---|---:|---:|---:|",
            f"| **t rejeita** | {m.ambos_rejeitam} (a) | {m.so_t_rejeita} (b) | {comp.t.rejeicoes} |",
            f"| **t não rejeita** | {m.so_w_rejeita} (c) | {m.nenhum_rejeita} (d) | {comp.t.nao_rejeicoes} |",
            f"| **Total** | {comp.w.rejeicoes} | {comp.w.nao_rejeicoes} | {r} |",
        ]

    sig_s = s.mcnemar.p_exato < alfa
    sig_c = c.mcnemar.p_exato < alfa
    simetrizado_ok = s.t.classificacao == s.w.classificacao == COMPATIVEL

    l: list[str] = [
        "# Comparação das taxas de erro tipo I — t pareado × Wilcoxon",
        "",
        "**Lab04 — Sprint 2, Issue #108**",
        "",
        "> Arquivo **gerado** por `python src/comparacao_erro.py` a partir de",
        "> `data/pvalores_q1.csv`, `data/pvalores_q1_controle.csv` e `data/resultados_q1.csv`.",
        "> Para mudar um número, refaça a simulação (`src/erro_tipo_i.py`), não edite o texto.",
        "",
        "## 1. Objetivo",
        "",
        "Comparar o controle do erro tipo I do teste t pareado e do Wilcoxon pareado a partir",
        f"dos {r} conjuntos de 30 diferenças simulados na Q1 (Issue #107, detalhes em",
        "[`resultados_q1.md`](resultados_q1.md)). Um teste bem calibrado, com α = 5%, rejeita",
        "uma H0 verdadeira em cerca de 5% das vezes. Acima disso ele é *liberal*, com mais",
        "falsos positivos do que promete. Abaixo, é *conservador*, com mais proteção do que",
        "promete, em geral paga com perda de poder.",
        "",
        "## 2. Hipóteses e cenários",
        "",
        "Os dois testes não têm a mesma hipótese nula (d = sem cache − com cache,",
        "alternativa `greater`):",
        "",
        "- **t pareado:** H0 μ_d ≤ 0. Fala da **média** das diferenças.",
        "- **Wilcoxon pareado:** H0 \"a distribuição de d é simétrica em torno de 0\". O teste",
        "  responde a P(X₁ + X₂ > 0), ou seja, à **pseudomediana**, e não à média.",
        "",
        "Média zero não garante simetria. Por isso a Q1 tem dois cenários com papéis",
        "diferentes:",
        "",
        "| Cenário | Como é gerado | H0 do t | H0 do Wilcoxon | Papel nesta comparação |",
        "|---|---|:---:|:---:|---|",
        f"| `{SIMETRIZADO}` | resíduos reais reamostrados, com sinal ± sorteado | "
        f"{'vale' if s.t.h0_verdadeira else 'não vale'} | {'vale' if s.w.h0_verdadeira else 'não vale'} | "
        "**comparação do erro tipo I** |",
        f"| `{CENTRALIZADO}` | resíduos reais reamostrados, sem trocar o sinal (média 0, assimétrico) | "
        f"{'vale' if c.t.h0_verdadeira else 'não vale'} | {'vale' if c.w.h0_verdadeira else 'não vale'} | "
        "**análise de sensibilidade à assimetria** |",
        "",
        "No centralizado, a taxa do Wilcoxon **não é erro tipo I**: a pseudomediana da",
        "distribuição geradora é positiva, então vale a H1 do próprio teste (seção 4 de",
        "`resultados_q1.md`). Essa taxa é reportada como taxa de rejeição, sem classificação",
        "de liberal ou conservador.",
        "",
        "## 3. Como as taxas foram calculadas",
        "",
        f"Em cada repetição, um teste rejeita H0 quando p < α, com α = {_num(alfa, 2)}:",
        "",
        f"    taxa de rejeição = rejeições de H0 / {r}",
        "",
        "Ela só é uma taxa de erro tipo I quando a H0 do teste é verdadeira no cenário.",
        "",
        "- **Mesmos conjuntos para os dois testes.** Cada linha dos arquivos de p-valores é",
        "  um conjunto simulado, com o p do t e o p do Wilcoxon calculados sobre os mesmos 30",
        "  valores (a Q1 confere isso contra o SciPy). A comparação é **pareada**,",
        "  repetição a repetição.",
        "- **Conferência.** As decisões são refeitas aqui a partir dos p-valores e conferidas",
        "  com as colunas `rejeitou_*` e com as contagens e classificações de",
        "  `data/resultados_q1.csv`. As três fontes concordam, e qualquer divergência",
        "  interromperia o script.",
        "- **IC de 95% de Wilson** para cada taxa. Quando a H0 do teste vale, ele é",
        "  classificado como *liberal* se o IC inteiro estiver acima de 5%, *conservador* se",
        "  estiver abaixo e *compatível com α* se contiver 5%.",
        f"- **Ruído de Monte Carlo.** Um teste com taxa real de exatamente 5% daria estimativas",
        f"  entre {_num(100 * faixa[0], 2)}% e {_num(100 * faixa[1], 2)}% (±{_num(meia_mc, 2)} p.p.) "
        f"com R = {r}. Diferenças dessa ordem não dizem nada sobre os testes.",
        "- **Diferença entre as taxas** em pontos percentuais (Wilcoxon − t), com IC de 95%",
        "  para proporções pareadas: Var = [(b + c) − (c − b)²/N] / N².",
        "- **Teste de McNemar** sobre as decisões (seção 5).",
        "",
        "## 4. Resultados",
        "",
        f"### 4.1 {NOMES_CENARIO[SIMETRIZADO]}",
        "",
        *tabela_taxas(s),
        "",
        f"### 4.2 {NOMES_CENARIO[CENTRALIZADO]}",
        "",
        *tabela_taxas(c),
        "",
        "## 5. Comparação pareada das decisões (McNemar)",
        "",
        "**Por que McNemar.** As duas taxas de um cenário vêm dos mesmos 10.000 conjuntos,",
        "então não são proporções independentes. Um teste de duas proporções comum",
        "ignoraria que as decisões estão correlacionadas: quando o t rejeita num conjunto,",
        "o Wilcoxon tende a rejeitar também. O McNemar leva isso em conta. Os conjuntos em",
        "que os dois concordam não informam nada sobre qual rejeita mais, e o teste usa só",
        "os **discordantes**: b (só o t rejeita) e c (só o Wilcoxon rejeita). A H0 do",
        "McNemar é que as duas taxas marginais de rejeição são iguais, e nesse caso os",
        "discordantes se dividem meio a meio. O p abaixo é o exato, bilateral:",
        "2·P(X ≤ min(b, c)) com X ~ Binomial(b + c, 1/2). A versão qui-quadrado com correção",
        "de continuidade vai junto e dá praticamente o mesmo valor.",
        "",
        "Duas ressalvas de leitura:",
        "",
        "- o McNemar só se aplica **dentro** de um cenário. Os dois cenários usam conjuntos",
        "  diferentes (sementes 42 e 43), e não há pareamento entre eles;",
        "- ele compara **taxas de rejeição**. No simetrizado, as duas são taxas de erro",
        "  tipo I, e o teste compara o controle do erro tipo I. No centralizado, só a do t é;",
        "  ali o McNemar só diz que os dois testes se comportam de forma diferente diante da",
        "  assimetria.",
        "",
        "| | Simetrizado (erro tipo I) | Centralizado (sensibilidade) |",
        "|---|---:|---:|",
        f"| Ambos rejeitam (a) | {s.mcnemar.ambos_rejeitam} | {c.mcnemar.ambos_rejeitam} |",
        f"| Só o t rejeita (b) | {s.mcnemar.so_t_rejeita} | {c.mcnemar.so_t_rejeita} |",
        f"| Só o Wilcoxon rejeita (c) | {s.mcnemar.so_w_rejeita} | {c.mcnemar.so_w_rejeita} |",
        f"| Nenhum rejeita (d) | {s.mcnemar.nenhum_rejeita} | {c.mcnemar.nenhum_rejeita} |",
        f"| Concordância das decisões | {_pct(s.mcnemar.concordancia, 1)} | {_pct(c.mcnemar.concordancia, 1)} |",
        f"| Diferença das taxas (Wilcoxon − t) | **{_pp(s.diferenca_pp)}** | **{_pp(c.diferenca_pp)}** |",
        f"| IC 95% da diferença | [{_pp(s.diferenca_ic_inf_pp)}; {_pp(s.diferenca_ic_sup_pp)}] | "
        f"[{_pp(c.diferenca_ic_inf_pp)}; {_pp(c.diferenca_ic_sup_pp)}] |",
        f"| χ² de McNemar (com correção, 1 gl) | {_num(s.mcnemar.qui2_cc, 2)} | {_num(c.mcnemar.qui2_cc, 2)} |",
        f"| p (qui-quadrado) | {_num(s.mcnemar.p_qui2_cc, 4)} | {'< 10^−300' if c.mcnemar.p_qui2_cc == 0 else _num(c.mcnemar.p_qui2_cc, 4)} |",
        f"| p exato de McNemar | {formatar_p(s.mcnemar)} | {formatar_p(c.mcnemar)} |",
        "",
        "Tabelas 2×2 completas:",
        "",
        f"**{NOMES_CENARIO[SIMETRIZADO]}**",
        "",
        *tabela_2x2(s),
        "",
        f"**{NOMES_CENARIO[CENTRALIZADO]}**",
        "",
        *tabela_2x2(c),
        "",
        "## 6. Comparação com o nível de significância de 5%",
        "",
        "| Cenário | Teste | Taxa | IC 95% (Wilson) | Taxa / α | Mais perto de 5% | Comportamento |",
        "|---|---|---:|---|---:|:---:|---|",
    ]
    for comp in (s, c):
        for x in (comp.t, comp.w):
            if comp.mais_proximo is None:
                marca = "não comparável"
            elif comp.mais_proximo == EMPATE_TECNICO:
                marca = EMPATE_TECNICO
            else:
                marca = "✔" if comp.mais_proximo == x.teste else ""
            razao = f"{_num(x.razao_alfa, 2)}×" if x.razao_alfa is not None else "—"
            l.append(f"| `{comp.cenario}` | {x.teste} | {_pct(x.taxa)} | "
                     f"[{_pct(x.ic_wilson_inf)}; {_pct(x.ic_wilson_sup)}] | "
                     f"{razao} | {marca} | {x.classificacao} |")

    l += [""]
    if simetrizado_ok:
        l += [
            f"No simetrizado, o t ficou {_pp(s.t.distancia_alfa_pp)} e o Wilcoxon {_pp(s.w.distancia_alfa_pp)} de",
            f"5%. As duas distâncias estão dentro do ruído de Monte Carlo (±{_num(meia_mc, 2)} p.p.), e os",
            "dois ICs contêm 5%. Apontar um deles como \"mais próximo\" seria ler ruído, por",
            "isso a tabela marca empate técnico.",
            "",
        ]
    l += [
        "No centralizado, a pergunta \"qual ficou mais perto de 5%\" não se aplica: só a taxa",
        "do t é erro tipo I. Ele foi " + c.t.classificacao + (f", com {_num(c.t.razao_alfa, 1)} vezes o nominal."
                                                         if c.t.razao_alfa is not None else "."),
        "Nenhum teste foi conservador em nenhum cenário.",
        "",
        "## 7. Interpretação",
        "",
    ]
    l += _interpretacao(s, c, simetrizado_ok, sig_s, sig_c)

    l += ["", "## 8. Conclusão", ""]
    l += _conclusao(s, c, simetrizado_ok, sig_s)

    l += [
        "",
        "## 9. Limitações",
        "",
        "- **Uma única forma de distribuição de origem.** Os dois cenários reamostram 30",
        "  diferenças de um único projeto (Spring PetClinic), numa única máquina, com n = 30.",
        "  Com outra assimetria, outra curtose ou outro n, as taxas mudam. A do t, em",
        "  particular, tende a α à medida que n cresce.",
        "- **O erro tipo I do Wilcoxon só é medido sob simetria.** É a única situação em que",
        "  a H0 dele vale. Não existe um cenário com a forma assimétrica real em que as duas",
        "  H0 valham ao mesmo tempo, então a comparação \"com a forma dos dados reais\" é,",
        "  necessariamente, uma análise de sensibilidade, e não uma comparação de erro tipo I.",
        "- **O simetrizado remove a característica mais marcante dos dados.** Ele mantém a",
        "  escala e as caudas, mas não a assimetria. A conclusão sobre o controle do erro tipo",
        "  I vale para essa versão simétrica, não para a distribuição real.",
        "- **Bootstrap com 30 pontos de apoio.** Cada valor observado, inclusive os extremos,",
        "  tem peso 1/30, e valores não observados nunca aparecem. A reamostragem também gera",
        "  empates artificiais, e o Wilcoxon usou a aproximação normal com correção de",
        "  empates em todas as repetições. O comportamento do p exato não foi avaliado.",
        f"- **Erro de Monte Carlo.** Cada taxa perto de 5% tem incerteza de ±{_num(meia_mc, 2)} p.p. (95%).",
        "  Diferenças menores que isso, entre testes ou em relação a α, não devem ser",
        "  interpretadas.",
        "- **Ausência de significância não é equivalência.** Um McNemar não significativo",
        "  não demonstra que as taxas são iguais. O que limita o tamanho de uma diferença",
        "  possível é o IC da diferença, e não o p.",
        "- **Significância do McNemar não é relevância.** Com 10.000 repetições, ele detecta",
        "  diferenças pequenas. O que importa na prática é o tamanho da diferença em pontos",
        "  percentuais e o quanto cada taxa se afasta de 5%.",
        "- **Só o erro tipo I.** Um teste mais conservador quase sempre tem menos poder.",
        "  Escolher entre os dois testes exige olhar também o poder (Q2) e o comportamento",
        "  sob violação de pressupostos (Q3), que não são tratados aqui.",
        "",
        "## Arquivos",
        "",
        "| Arquivo | Conteúdo |",
        "|---|---|",
        "| `src/comparacao_erro.py` | esta comparação (só biblioteca padrão) |",
        "| `data/comparacao_taxas_erro.csv` | uma linha por cenário × teste: contagens, taxa, IC de Wilson, se a H0 vale, distância para α, classificação |",
        "| `data/mcnemar_q1.csv` | tabela 2×2, diferença pareada e McNemar por cenário |",
        "| `src/graficos.py` (`grafico_g3`) | o G3, desenhado no dashboard |",
        "",
        "## Como refazer",
        "",
        "```bash",
        "cd Lab4",
        "python src/erro_tipo_i.py          # Q1: simulação (precisa de NumPy, pandas e SciPy)",
        "python src/comparacao_erro.py      # CSVs e este relatório",
        "python src/dashboard.py --abrir    # dashboard com o G3",
        "```",
        "",
    ]
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(l), encoding="utf-8")


def _interpretacao(s: Comparacao, c: Comparacao, simetrizado_ok: bool,
                   sig_s: bool, sig_c: bool) -> list[str]:
    texto: list[str] = []
    if simetrizado_ok:
        texto += [
            "**Com as duas H0 verdadeiras, os dois testes controlam o erro tipo I no nível",
            f"nominal.** O t erra em {_pct(s.t.taxa)} e o Wilcoxon em {_pct(s.w.taxa)}, e os dois ICs de",
            f"Wilson contêm 5%. A diferença entre eles, de {_pp(s.diferenca_pp)} (IC",
            f"[{_pp(s.diferenca_ic_inf_pp)}; {_pp(s.diferenca_ic_sup_pp)}]), ",
        ]
        if not sig_s:
            texto[-1] += f"não é significativa pelo McNemar (p = {formatar_p(s.mcnemar)})."
            texto += [
                "Isso não prova que as taxas são iguais. Mostra que não há evidência de diferença,",
                f"e o IC indica que, se ela existe, não passa de cerca de "
                f"{_num(max(abs(s.diferenca_ic_inf_pp), abs(s.diferenca_ic_sup_pp)), 1)} ponto percentual.",
            ]
        else:
            texto[-1] += f"é significativa pelo McNemar (p = {formatar_p(s.mcnemar)}), mas pequena."
        texto += [
            f"Os dois testes tomam a mesma decisão em {_pct(s.mcnemar.concordancia, 1)} dos conjuntos.",
            "Esse resultado é coerente com implementações corretas (os p-valores também batem",
            "com os do SciPy) e com o que a teoria leva a esperar: sob simetria, a distribuição",
            "nula do Wilcoxon vale por construção, e o t é pouco afetado com n = 30. Ele vale",
            "para essa distribuição simétrica, não para qualquer uma.",
            "",
        ]
    else:
        texto += [
            "**Atenção: no simetrizado, ao menos um teste ficou fora da faixa compatível com",
            f"5%** (t = {_pct(s.t.taxa)}, {s.t.classificacao}; Wilcoxon = {_pct(s.w.taxa)},",
            f"{s.w.classificacao}). Isso pede investigação antes de qualquer conclusão.",
            "",
        ]

    texto += [
        "**Com a forma assimétrica dos dados reais (sensibilidade), os testes se separam,",
        "mas por motivos diferentes.**",
        "",
        f"- **t pareado: {_pct(c.t.taxa)}, erro tipo I {c.t.classificacao}.** A H0 do t continua",
        "  verdadeira (média 0), mas com n = 30 e forte assimetria à esquerda a estatística t",
        "  não segue a t de Student. A cauda superior, que é a usada pelo teste `greater`,",
        f"  engorda, e o teste rejeita {_num(c.t.razao_alfa, 1)} vezes o que promete. Quando a",
        f"  assimetria é removida (simetrizado), a taxa volta a {_pct(s.t.taxa)}.",
        f"- **Wilcoxon: {_pct(c.w.taxa)} de rejeição, que não é erro tipo I.** A distribuição tem",
        "  média 0, mas a maioria dos valores e das médias de Walsh é positiva (pseudomediana",
        "  positiva). A H1 do Wilcoxon é verdadeira, e ele a detecta. O problema aparece",
        "  quando o Wilcoxon é usado para responder a uma pergunta sobre a **média**: nesse",
        f"  cenário a média não muda, e ainda assim ele rejeita em {_pct(c.w.taxa, 1)} dos conjuntos.",
        "",
        f"O McNemar do centralizado (p = {formatar_p(c.mcnemar)}; {c.mcnemar.so_w_rejeita} conjuntos em que só o",
        f"Wilcoxon rejeita contra {c.mcnemar.so_t_rejeita} em que só o t rejeita) confirma que, diante da",
        "assimetria, os dois testes tomam decisões bem diferentes. Ele **não** diz que o",
        "Wilcoxon tem um erro tipo I maior, porque a taxa dele ali não é erro tipo I.",
    ]
    if not sig_s and sig_c:
        texto += [
            "",
            "Os dois McNemar mostram a diferença entre significância e relevância. Com 10.000",
            "repetições, o teste detectaria diferenças pequenas, e o IC da diferença no",
            f"simetrizado tem meia-largura de só {_num((s.diferenca_ic_sup_pp - s.diferenca_ic_inf_pp) / 2, 2)} p.p. "
            "Mesmo assim, não acusa nada ali.",
            f"No centralizado, o que importa não é o p minúsculo, e sim os {_num(abs(c.diferenca_pp), 1)} p.p.",
            "de diferença entre as taxas de rejeição.",
        ]
    return texto


def _conclusao(s: Comparacao, c: Comparacao, simetrizado_ok: bool, sig_s: bool) -> list[str]:
    texto = []
    if simetrizado_ok and not sig_s:
        texto += [
            "**Quando as hipóteses nulas dos dois testes são verdadeiras (distribuição",
            "simétrica em torno de 0, n = 30), o teste t pareado e o Wilcoxon pareado",
            f"controlaram o erro tipo I no nível nominal** ({_pct(s.t.taxa)} e {_pct(s.w.taxa)}), sem",
            "diferença detectável entre eles. Nessa condição, nenhum dos dois teve melhor",
            "controle do erro tipo I que o outro.",
        ]
    elif simetrizado_ok:
        texto += [
            "Na distribuição simétrica, os dois testes ficaram compatíveis com 5%, com uma",
            "diferença pequena, mas detectável, entre eles.",
        ]
    else:
        texto += ["Na distribuição simétrica, ao menos um teste não ficou compatível com 5%; "
                  "ver a seção 7."]
    texto += [
        "",
        "**Com a assimetria dos dados reais, o teste t perdeu o controle do erro tipo I**",
        f"({_pct(c.t.taxa)}, {c.t.classificacao}). Para o Wilcoxon, esse cenário não mede erro tipo I,",
        "porque a hipótese nula dele não vale numa distribuição assimétrica. O que ele mostra",
        "é que, com diferenças assimétricas, os dois testes respondem a perguntas diferentes:",
        "o t, sobre a média; o Wilcoxon, sobre a pseudomediana. Um p < 0,05 do Wilcoxon,",
        "nesse caso, não autoriza conclusões sobre o tempo médio.",
        "",
        "Nada disso permite dizer que um teste é superior ao outro em geral. As conclusões",
        "valem para estas duas distribuições, construídas a partir de 30 pares de um único",
        "projeto, com n = 30 e α = 5%. Para a análise do experimento, a consequência é",
        "limitada: nos dados reais, os dois testes rejeitam H0 com p-valores muito menores",
        "que qualquer taxa vista aqui (t ≈ 2·10⁻⁵⁵; W⁺ no máximo possível), e a conclusão de",
        "que o cache reduz o tempo de build não depende dessa diferença. Ela pesaria num",
        "estudo com efeito pequeno e diferenças igualmente assimétricas. Ali, a escolha do",
        "teste deveria partir de qual parâmetro interessa (média ou pseudomediana) e da forma",
        "observada das diferenças.",
    ]
    return texto


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dados", type=Path, default=DADOS,
                        help="pasta com resultados_q1.csv e pvalores_q1*.csv")
    parser.add_argument("--relatorio", type=Path,
                        default=LAB4_DIR / "docs" / "comparacao_taxas_erro.md")
    args = parser.parse_args()

    comparacoes, alfa = carregar_comparacoes(args.dados)
    for comp in comparacoes.values():
        print(f"{comp.cenario}  (R = {comp.t.repeticoes}, alfa = {alfa})")
        for x in (comp.t, comp.w):
            distancia = f"{x.distancia_alfa_pp:+.2f} p.p." if x.h0_verdadeira else "  (H0 falsa)"
            print(f"  {x.teste:17} rejeições {x.rejeicoes:5}  não {x.nao_rejeicoes:5}  "
                  f"taxa {100 * x.taxa:6.2f}%  Wilson [{100 * x.ic_wilson_inf:.2f}; "
                  f"{100 * x.ic_wilson_sup:.2f}]  {distancia}  -> {x.classificacao}")
        m = comp.mcnemar
        print(f"  W − t = {comp.diferenca_pp:+.2f} p.p. [{comp.diferenca_ic_inf_pp:+.2f}; "
              f"{comp.diferenca_ic_sup_pp:+.2f}]  McNemar b={m.so_t_rejeita} c={m.so_w_rejeita} "
              f"chi2={m.qui2_cc:.2f} p_exato={formatar_p(m)}  "
              f"mais perto de 5%: {comp.mais_proximo or 'não comparável'}\n")

    taxas, pareado = escrever_csvs(comparacoes, args.dados)
    escrever_relatorio(args.relatorio, comparacoes, alfa)
    print(f"Saídas: {taxas}, {pareado} e {args.relatorio}")


if __name__ == "__main__":
    main()
