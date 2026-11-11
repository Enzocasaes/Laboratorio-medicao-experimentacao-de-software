"""Erro tipo I quando os pressupostos são violados (Lab04 — Issues #111 e #112).

A Q3 do enunciado pede para repetir a Q1 e a Q2 em pelo menos uma situação que
viole os pressupostos do teste paramétrico. Este módulo cobre a **metade da
Q1**: a taxa de erro tipo I. A metade da Q2 — o poder nos mesmos cenários — sai
com a Issue #109 e entra no G4 (Issue #110): os geradores aqui já aceitam
`efeito`, então é só rodar com efeito maior que zero.

O QUE É VIOLADO, E O QUE NÃO É

O teste t pareado pressupõe diferenças aproximadamente normais; o Wilcoxon
pressupõe que elas sejam simétricas em torno de zero. Os três cenários daqui
**preservam a simetria e violam a normalidade**, em graus diferentes:

| Cenário | O que viola | Por que está aqui |
|---|---|---|
| `normal` | nada | é a referência: sem violação, os dois devem dar 5% |
| `cauda_pesada` | normalidade (t de Student com 3 gl) | valores extremos sem assimetria |
| `contaminada` | normalidade (10% das observações com 5× o desvio) | outliers, como na Sprint 01 |

Manter a simetria é uma decisão, não um descuido: **só assim as duas H0 são
verdadeiras ao mesmo tempo**, e só assim as duas taxas são erro tipo I e podem
ser comparadas lado a lado. Quebrar a simetria torna a H0 do Wilcoxon falsa, e
a taxa dele deixa de ser erro tipo I — é o que a Q1 do Integrante 1 já mostrou
no bootstrap centralizado, e por isso não se repete aqui.

A SEGUNDA VIOLAÇÃO: AMOSTRA PEQUENA

Cada cenário roda com n = 5, 10 e 30. O n = 30 é o tamanho real; os menores
estão aqui porque o enunciado cita amostras pequenas como violação, e porque
elas atingem os dois testes por motivos opostos — o t perde o amparo do teorema
central do limite, e o Wilcoxon exato fica **granulado**: com n = 5 só existem
2⁵ = 32 somas de postos possíveis, e nenhuma cauda vale exatamente 5%.

REAPROVEITAMENTO

Nada é reimplementado: os cenários `normal` e `contaminada` vêm de
`src/simulacao.py` (Integrante 2), os dois testes de `src/testes.py`
(Integrante 2) e o IC de Wilson, o McNemar e a classificação de
`src/comparacao_erro.py` (Integrante 1). Só a biblioteca padrão.

Uso (a partir de Lab4/):

    python src/violacao.py                       # 10.000 repetições por célula
    python src/violacao.py --repeticoes 500      # rodada rápida, para conferir
"""

from __future__ import annotations

import argparse
import csv
import math
import random
from dataclasses import dataclass
from pathlib import Path

LAB4_DIR = Path(__file__).resolve().parent.parent
DADOS = LAB4_DIR / "data"
DOCS = LAB4_DIR / "docs"

from comparacao_erro import (  # noqa: E402
    TESTE_T,
    TESTE_W,
    classificar,
    diferenca_pareada,
    faixa_acaso,
    formatar_p,
    mcnemar,
    wilson,
)
from simulacao import gerar  # noqa: E402
from testes import teste_t_pareado, wilcoxon_pareado  # noqa: E402

ALFA = 0.05
SEMENTE_PADRAO = 42
REPETICOES_PADRAO = 10_000  # o mesmo da Q1, para as taxas serem comparáveis
TAMANHOS = (5, 10, 30)      # 30 é o tamanho real; 5 e 10 são a amostra pequena
GRAUS_CAUDA_PESADA = 3      # t de Student com 3 gl: variância finita, cauda grossa

# Desvio das diferenças reais, o mesmo usado na simulação da Sprint 01: os
# cenários mudam de forma, não de escala.
DESVIO = 0.3934

CENARIOS = ("normal", "cauda_pesada", "contaminada")
DESCRICAO = {
    "normal": "sem violação (referência)",
    "cauda_pesada": "normalidade violada: t de Student com 3 gl",
    "contaminada": "normalidade violada: 10% das observações com 5× o desvio",
}

ARQUIVO_TAXAS = DADOS / "resultados_q3.csv"
ARQUIVO_MCNEMAR = DADOS / "mcnemar_q3.csv"
ARQUIVO_RELATORIO = DOCS / "violacao_pressupostos.md"


# ----------------------------------------------------------- geradores


def gerar_cauda_pesada(n: int, media: float, desvio: float,
                       rng: random.Random) -> list[float]:
    """n valores de uma t de Student com 3 gl, reescalada ao desvio pedido.

    T = Z / sqrt(V / gl), com Z normal padrão e V ~ qui-quadrado(gl); o
    qui-quadrado sai de uma gama, que a biblioteca padrão tem. A t com 3 gl
    tem desvio sqrt(3), então dividir por ele deixa o desvio em 1 antes de
    reescalar — assim este cenário tem a MESMA escala dos outros dois, e a
    única coisa que muda é a grossura da cauda.
    """
    if GRAUS_CAUDA_PESADA <= 2:  # variância infinita: a comparação perderia sentido
        raise ValueError("a t precisa de mais de 2 gl para ter desvio finito")
    desvio_t = math.sqrt(GRAUS_CAUDA_PESADA / (GRAUS_CAUDA_PESADA - 2))
    valores = []
    for _ in range(n):
        z = rng.gauss(0.0, 1.0)
        qui = rng.gammavariate(GRAUS_CAUDA_PESADA / 2.0, 2.0)
        t = z / math.sqrt(qui / GRAUS_CAUDA_PESADA)
        valores.append(media + desvio * t / desvio_t)
    return valores


def gerar_diferencas(cenario: str, n: int, efeito: float, rng: random.Random,
                     desvio: float = DESVIO) -> list[float]:
    """n diferenças do cenário pedido, com média `efeito * desvio`.

    `efeito` está em unidades de desvio, como na Sprint 01: 0 é H0 verdadeira
    (o que este módulo usa) e valores maiores servem ao estudo de poder da
    Issue #109, que reaproveita esta função.
    """
    media = efeito * desvio
    if cenario == "cauda_pesada":
        return gerar_cauda_pesada(n, media, desvio, rng)
    if cenario in ("normal", "contaminada"):
        return gerar(cenario, n, media, desvio, rng)  # gerador do Integrante 2
    raise ValueError(f"cenário desconhecido: {cenario} (use um de {CENARIOS})")


def simetrico(cenario: str) -> bool:
    """Todos os cenários daqui são simétricos em torno da média.

    É o que mantém a H0 do Wilcoxon verdadeira junto com a do t, e portanto o
    que permite ler as duas taxas como erro tipo I.
    """
    return cenario in CENARIOS


# ----------------------------------------------------------- Monte Carlo


@dataclass
class Celula:
    """Uma combinação (cenário, n) com as duas taxas e o pareamento entre elas."""

    cenario: str
    n: int
    repeticoes: int
    alfa: float
    semente: int
    rejeicoes_t: int
    rejeicoes_w: int
    mcnemar: object               # comparacao_erro.McNemar
    diferenca_pp: float           # taxa_W − taxa_t, em pontos percentuais
    diferenca_ic_inf_pp: float
    diferenca_ic_sup_pp: float

    @property
    def taxa_t(self) -> float:
        return self.rejeicoes_t / self.repeticoes

    @property
    def taxa_w(self) -> float:
        return self.rejeicoes_w / self.repeticoes

    def ic_t(self) -> tuple[float, float]:
        return wilson(self.rejeicoes_t, self.repeticoes)

    def ic_w(self) -> tuple[float, float]:
        return wilson(self.rejeicoes_w, self.repeticoes)


def rodar_celula(cenario: str, n: int, repeticoes: int, semente: int,
                 alfa: float = ALFA) -> Celula:
    """Roda `repeticoes` conjuntos sob H0 e conta as rejeições dos dois testes.

    Os dois testes veem exatamente o MESMO conjunto em cada repetição. É o que
    torna as duas taxas pareadas — e é por isso que a diferença entre elas é
    avaliada com McNemar, e não como se fossem duas proporções independentes.
    """
    rng = random.Random(semente)
    rejeitou_t: list[bool] = []
    rejeitou_w: list[bool] = []
    for _ in range(repeticoes):
        diferencas = gerar_diferencas(cenario, n, 0.0, rng)
        rejeitou_t.append(teste_t_pareado(diferencas, alfa).p_valor < alfa)
        # completo=False pula o Hodges-Lehmann, que é O(n²) e não entra na decisão
        rejeitou_w.append(wilcoxon_pareado(diferencas, alfa, completo=False).p_valor < alfa)

    pareado = mcnemar(rejeitou_t, rejeitou_w)
    diferenca, inferior, superior = diferenca_pareada(
        pareado.so_t_rejeita, pareado.so_w_rejeita, repeticoes
    )
    return Celula(
        cenario=cenario, n=n, repeticoes=repeticoes, alfa=alfa, semente=semente,
        rejeicoes_t=sum(rejeitou_t), rejeicoes_w=sum(rejeitou_w), mcnemar=pareado,
        diferenca_pp=diferenca * 100,
        diferenca_ic_inf_pp=inferior * 100, diferenca_ic_sup_pp=superior * 100,
    )


def rodar_estudo(repeticoes: int = REPETICOES_PADRAO,
                 semente: int = SEMENTE_PADRAO,
                 alfa: float = ALFA) -> list[Celula]:
    """Todas as combinações de cenário × n, cada uma com a própria semente.

    A semente de cada célula é derivada da base de forma determinística, para
    que rodar só uma célula dê o mesmo resultado que rodar o estudo inteiro.
    """
    celulas = []
    for i, cenario in enumerate(CENARIOS):
        for j, n in enumerate(TAMANHOS):
            celulas.append(rodar_celula(cenario, n, repeticoes,
                                        semente + 100 * i + j, alfa))
    return celulas


# ----------------------------------------------------------- saídas


COLUNAS_TAXAS = (
    "cenario", "violacao", "n", "teste", "h0_do_teste_verdadeira",
    "repeticoes", "alfa", "semente", "rejeicoes", "taxa_rejeicao",
    "ic95_wilson_inferior", "ic95_wilson_superior", "distancia_alfa_pp",
    "classificacao",
)
COLUNAS_MCNEMAR = (
    "cenario", "n", "ambos_rejeitam", "so_t_rejeita", "so_w_rejeita",
    "nenhum_rejeita", "diferenca_w_menos_t_pp", "ic95_inferior_pp",
    "ic95_superior_pp", "p_mcnemar",
)


def linhas_taxas(celulas: list[Celula]) -> list[dict]:
    linhas = []
    for celula in celulas:
        for teste, rejeicoes, (inferior, superior), taxa in (
            (TESTE_T, celula.rejeicoes_t, celula.ic_t(), celula.taxa_t),
            (TESTE_W, celula.rejeicoes_w, celula.ic_w(), celula.taxa_w),
        ):
            linhas.append({
                "cenario": celula.cenario,
                "violacao": DESCRICAO[celula.cenario],
                "n": celula.n,
                "teste": teste,
                # simetria preservada: as duas H0 valem, as duas taxas são erro tipo I
                "h0_do_teste_verdadeira": True,
                "repeticoes": celula.repeticoes,
                "alfa": celula.alfa,
                "semente": celula.semente,
                "rejeicoes": rejeicoes,
                "taxa_rejeicao": taxa,
                "ic95_wilson_inferior": inferior,
                "ic95_wilson_superior": superior,
                "distancia_alfa_pp": (taxa - celula.alfa) * 100,
                "classificacao": classificar(inferior, superior, celula.alfa),
            })
    return linhas


def linhas_mcnemar(celulas: list[Celula]) -> list[dict]:
    return [{
        "cenario": c.cenario,
        "n": c.n,
        "ambos_rejeitam": c.mcnemar.ambos_rejeitam,
        "so_t_rejeita": c.mcnemar.so_t_rejeita,
        "so_w_rejeita": c.mcnemar.so_w_rejeita,
        "nenhum_rejeita": c.mcnemar.nenhum_rejeita,
        "diferenca_w_menos_t_pp": c.diferenca_pp,
        "ic95_inferior_pp": c.diferenca_ic_inf_pp,
        "ic95_superior_pp": c.diferenca_ic_sup_pp,
        "p_mcnemar": formatar_p(c.mcnemar),
    } for c in celulas]


def escrever_csv(caminho: Path, colunas: tuple[str, ...], linhas: list[dict]) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=colunas)
        escritor.writeheader()
        escritor.writerows(linhas)


def _pct(valor: float, casas: int = 2) -> str:
    return f"{valor * 100:.{casas}f}".replace(".", ",") + "%"


def escrever_relatorio(caminho: Path, celulas: list[Celula]) -> None:
    """Relatório gerado, no mesmo formato dos outros docs do Lab04."""
    alfa = celulas[0].alfa
    repeticoes = celulas[0].repeticoes
    inferior, superior = faixa_acaso(alfa, repeticoes)

    linhas = [
        "# Erro tipo I com os pressupostos violados (Q3)",
        "",
        "**Lab04 — Issues #111 e #112: violação de pressupostos, metade da Q1**",
        "",
        "> Arquivo **gerado** por `python src/violacao.py`. Não edite à mão:",
        "> rode o comando de novo.",
        "",
        "## Parâmetros",
        "",
        "| Item | Valor |",
        "|---|---|",
        f"| Repetições por célula | {repeticoes:,}".replace(",", ".") + " |",
        f"| Nível de significância | {alfa} |",
        f"| Tamanhos de amostra | {', '.join(str(n) for n in TAMANHOS)} |",
        f"| Desvio das diferenças | {DESVIO} s (o das diferenças reais) |",
        f"| Semente base | {celulas[0].semente} |",
        "",
        "Todos os cenários são **simétricos em torno de zero**: as duas H0 valem, e",
        "por isso as duas taxas são erro tipo I e podem ser comparadas. Quebrar a",
        "simetria tornaria a H0 do Wilcoxon falsa — é o caso que a Q1 já cobriu no",
        "bootstrap centralizado.",
        "",
        f"Se a taxa verdadeira fosse exatamente α, a estimada cairia entre "
        f"{_pct(inferior)} e {_pct(superior)} em 95% das simulações. Diferenças",
        "menores que isso são ruído de Monte Carlo.",
        "",
        "## Taxa de erro tipo I",
        "",
        "| Cenário | n | t pareado | Wilcoxon | Diferença (W − t) | p (McNemar) |",
        "|---|---|---|---|---|---|",
    ]
    for c in celulas:
        linhas.append(
            f"| {c.cenario} | {c.n} | {_pct(c.taxa_t)} | {_pct(c.taxa_w)} | "
            f"{c.diferenca_pp:+.2f} p.p. ".replace(".", ",")
            + f"| {formatar_p(c.mcnemar)} |"
        )

    linhas += [
        "",
        "## Leitura",
        "",
        "- **Referência (normal, n = 30).** Sem violação, os dois ficam perto de 5%.",
        "- **Amostra pequena.** Com n = 5 o Wilcoxon exato fica preso à granularidade",
        "  da distribuição: só existem 2⁵ = 32 somas de postos possíveis, e a cauda",
        "  mais próxima de 5% por baixo vale 1/32 ≈ 3,1%. O teste não erra mais do",
        "  que deveria — erra **menos**, e paga isso em poder.",
        "- **Cauda pesada e outliers.** O Wilcoxon trabalha com postos, então o nível",
        "  dele não depende da forma da distribuição, desde que ela seja simétrica.",
        "  O do teste t depende: é aí que a violação de normalidade aparece.",
        "",
        "## O que falta (Issues #109 e #110)",
        "",
        "Este relatório é a metade da Q3 que repete a **Q1** (erro tipo I). A outra",
        "metade repete a **Q2** — o poder nestes mesmos cenários — e entra no G4.",
        "`gerar_diferencas(cenario, n, efeito, rng)` já aceita o efeito: basta rodar",
        "com valores maiores que zero.",
        "",
    ]
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(linhas), encoding="utf-8")


def imprimir(celulas: list[Celula]) -> None:
    alfa = celulas[0].alfa
    print(f"{'cenario':>14} {'n':>3} {'t pareado':>11} {'Wilcoxon':>11}   diferença")
    for c in celulas:
        print(f"{c.cenario:>14} {c.n:>3} {_pct(c.taxa_t):>11} {_pct(c.taxa_w):>11}   "
              f"{c.diferenca_pp:+.2f} p.p.")
    print(f"\nalfa = {alfa}; faixa do acaso: "
          f"{_pct(faixa_acaso(alfa, celulas[0].repeticoes)[0])} a "
          f"{_pct(faixa_acaso(alfa, celulas[0].repeticoes)[1])}")


def main() -> None:
    analisador = argparse.ArgumentParser(
        description="Erro tipo I com pressupostos violados (Q3, Issues #111 e #112)."
    )
    analisador.add_argument("--repeticoes", type=int, default=REPETICOES_PADRAO)
    analisador.add_argument("--semente", type=int, default=SEMENTE_PADRAO)
    argumentos = analisador.parse_args()

    celulas = rodar_estudo(argumentos.repeticoes, argumentos.semente)
    escrever_csv(ARQUIVO_TAXAS, COLUNAS_TAXAS, linhas_taxas(celulas))
    escrever_csv(ARQUIVO_MCNEMAR, COLUNAS_MCNEMAR, linhas_mcnemar(celulas))
    escrever_relatorio(ARQUIVO_RELATORIO, celulas)

    imprimir(celulas)
    print(f"\n{ARQUIVO_TAXAS.relative_to(LAB4_DIR)}")
    print(ARQUIVO_MCNEMAR.relative_to(LAB4_DIR))
    print(ARQUIVO_RELATORIO.relative_to(LAB4_DIR))


if __name__ == "__main__":
    main()
