"""Geração de dados simulados e comparação dos dois testes (Lab04, par P2).

Nos dados reais o efeito do Build Cache é enorme (27 s de diferença média
contra um desvio de 0,4 s), então o teste t e o Wilcoxon concordam
trivialmente: os dois rejeitam H0 com folga. A simulação existe para mostrar
o que os dados reais não mostram — **em que situações os dois testes
divergem** —, como pede a seção 13 do cenário experimental.

## Os três cenários

As diferenças `d` são geradas com a **mesma média e o mesmo desvio-padrão**
nos três cenários. Só a FORMA da distribuição muda, e é isso que isola o
efeito do formato sobre cada teste:

    normal               simétrica. É onde o teste t é o mais poderoso.
    lognormal_deslocada  assimétrica à direita, o formato típico de tempo.
    contaminada          mistura 90/10: 10% das observações vêm de uma normal
                         com 5x o desvio. Mesma média, caudas pesadas.

## Os parâmetros saem dos dados reais

O desvio σ é o desvio das diferenças observadas em data/dados_reais.csv. O
efeito é dado em unidades de σ (ou seja, em d_z, o mesmo tamanho de efeito
que o teste t reporta): 0 corresponde a H0, e 0,1 / 0,3 / 0,5 varrem de um
efeito pequeno a um médio.

## Um cuidado: H0 não é a mesma para os dois testes

O teste t tem como H0 que a **média** das diferenças é 0. O Wilcoxon tem como
H0 que a distribuição é **simétrica em torno de 0**. Numa lognormal deslocada
para ter média 0 a simetria não vale, então a taxa de erro tipo I do Wilcoxon
não deve ficar em 5% — e isso não é defeito da implementação, é a diferença
entre as duas hipóteses. O relatório gerado marca os casos em que a hipótese
do Wilcoxon está violada.

Uso (a partir de Lab4/):

    python src/simulacao.py                      # rodada oficial
    python src/simulacao.py --repeticoes 200     # rodada rápida
    python src/simulacao.py --semente 7
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import statistics
from dataclasses import dataclass
from pathlib import Path

from testes import (
    ALFA,
    carregar_diferencas,
    hodges_lehmann,
    teste_t_pareado,
    wilcoxon_pareado,
)

LAB4_DIR = Path(__file__).resolve().parent.parent

SEMENTE_PADRAO = 42
REPETICOES_PADRAO = 2000
TAMANHOS = (10, 30, 50)          # 30 é o tamanho real da amostra
EFEITOS = (0.0, 0.1, 0.3, 0.5)   # em unidades de σ (= d_z)
N_EXEMPLO = 30                   # o exemplo interpretado usa o n real
EFEITO_EXEMPLO = 0.3

# Forma da lognormal antes de ser reescalada. 0,5 dá assimetria ~1,75:
# visivelmente torta, mas ainda plausível para tempo de build.
SIGMA_LOG = 0.5
# Contaminação: 10% das observações com 5x o desvio.
PROPORCAO_CONTAMINADA = 0.10
FATOR_CONTAMINACAO = 5.0

CENARIOS = ("normal", "lognormal_deslocada", "contaminada")


@dataclass
class Celula:
    """Uma combinação cenário x n x efeito, com o resultado das R repetições."""

    cenario: str
    n: int
    efeito: float
    repeticoes: int
    rejeicoes_t: int
    rejeicoes_w: int

    @property
    def taxa_t(self) -> float:
        return self.rejeicoes_t / self.repeticoes

    @property
    def taxa_w(self) -> float:
        return self.rejeicoes_w / self.repeticoes

    def erro_padrao(self, taxa: float) -> float:
        """Erro padrão de Monte Carlo da proporção estimada.

        Sem ele não dá para saber se uma diferença entre os dois testes é
        real ou só ruído de simulação.
        """
        return math.sqrt(taxa * (1 - taxa) / self.repeticoes)

    @property
    def sob_h0(self) -> bool:
        return self.efeito == 0.0


# ------------------------------------------------------------ geração ----

def gerar(cenario: str, n: int, media: float, desvio: float, rng: random.Random) -> list[float]:
    """n diferenças do cenário pedido, com a média e o desvio dados.

    Os três cenários têm a mesma média e o mesmo desvio de propósito: o que
    muda entre eles é só a forma, então qualquer diferença de poder vem do
    formato da distribuição, e não da escala.
    """
    if cenario == "normal":
        return [rng.gauss(media, desvio) for _ in range(n)]

    if cenario == "lognormal_deslocada":
        # X ~ LogNormal(0, SIGMA_LOG); depois X é reescalado e deslocado para
        # ter exatamente a média e o desvio pedidos, preservando a assimetria.
        var = math.exp(SIGMA_LOG**2)
        media_x = math.exp(SIGMA_LOG**2 / 2.0)
        desvio_x = math.sqrt((var - 1.0) * var)
        escala = desvio / desvio_x
        deslocamento = media - escala * media_x
        return [escala * rng.lognormvariate(0.0, SIGMA_LOG) + deslocamento for _ in range(n)]

    if cenario == "contaminada":
        # Mistura de duas normais de mesma média. O desvio da componente
        # limpa sai da variância total: (1-p)s² + p(ks)² = desvio².
        p, k = PROPORCAO_CONTAMINADA, FATOR_CONTAMINACAO
        s = desvio / math.sqrt((1 - p) + p * k * k)
        return [rng.gauss(media, s * (k if rng.random() < p else 1.0)) for _ in range(n)]

    raise ValueError(f"cenário desconhecido: {cenario} (use um de {CENARIOS})")


def simetrico_sob_h0(cenario: str) -> bool:
    """A H0 do Wilcoxon (simetria em torno de 0) vale neste cenário?"""
    return cenario in ("normal", "contaminada")


# -------------------------------------------------------- Monte Carlo ----

def rodar_celula(cenario: str, n: int, efeito: float, desvio: float,
                 repeticoes: int, semente: int, alfa: float = ALFA) -> Celula:
    """R amostras do cenário; conta quantas vezes cada teste rejeita H0."""
    rng = random.Random(semente)
    media = efeito * desvio
    rejeicoes_t = rejeicoes_w = 0
    for _ in range(repeticoes):
        d = gerar(cenario, n, media, desvio, rng)
        if teste_t_pareado(d, alfa).significativo:
            rejeicoes_t += 1
        # completo=False: o Hodges-Lehmann é O(n²) e não entra na decisão
        if wilcoxon_pareado(d, alfa, completo=False).significativo:
            rejeicoes_w += 1
    return Celula(cenario, n, efeito, repeticoes, rejeicoes_t, rejeicoes_w)


def rodar_estudo(desvio: float, repeticoes: int, semente: int,
                 alfa: float = ALFA, progresso=None) -> list[Celula]:
    """Todas as combinações cenário x n x efeito.

    Cada célula recebe uma semente própria, derivada da semente base: assim
    rodar só uma célula dá o mesmo resultado que rodá-la dentro do estudo
    completo.
    """
    celulas = []
    for i, cenario in enumerate(CENARIOS):
        for j, n in enumerate(TAMANHOS):
            for k, efeito in enumerate(EFEITOS):
                semente_celula = semente + 1000 * i + 100 * j + k
                celula = rodar_celula(cenario, n, efeito, desvio, repeticoes, semente_celula, alfa)
                celulas.append(celula)
                if progresso:
                    progresso(celula)
    return celulas


# ------------------------------------------------------------ saídas ----

COLUNAS_CENARIOS = ("cenario", "n", "efeito", "semente", "i", "diferenca")
COLUNAS_PODER = ("cenario", "n", "efeito", "repeticoes", "hipotese",
                 "wilcoxon_simetrico", "rejeicoes_t", "taxa_t", "erro_padrao_t",
                 "rejeicoes_w", "taxa_w", "erro_padrao_w")
COLUNAS_EXEMPLO = ("cenario", "n", "efeito", "semente", "teste", "estatistica",
                   "p_valor", "significativo", "centro_nome", "centro_valor",
                   "efeito_nome", "efeito_valor", "observacao")


def escrever(caminho: Path, colunas, linhas: list[dict]) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=colunas)
        escritor.writeheader()
        escritor.writerows(linhas)


def gerar_exemplos(desvio: float, semente: int, alfa: float = ALFA) -> tuple[list[dict], list[dict]]:
    """Uma amostra de cada cenário (n = 30, efeito 0,3σ), com os dois testes.

    É o "exemplo simulado interpretado" da entrega: amostras pequenas o
    bastante para caberem num CSV e serem olhadas uma a uma.
    """
    linhas_dados, linhas_resultado = [], []
    for indice, cenario in enumerate(CENARIOS):
        semente_cenario = semente + 500 + indice
        rng = random.Random(semente_cenario)
        d = gerar(cenario, N_EXEMPLO, EFEITO_EXEMPLO * desvio, desvio, rng)
        for i, valor in enumerate(d, start=1):
            linhas_dados.append({"cenario": cenario, "n": N_EXEMPLO, "efeito": EFEITO_EXEMPLO,
                                 "semente": semente_cenario, "i": i, "diferenca": round(valor, 6)})
        t = teste_t_pareado(d, alfa)
        w = wilcoxon_pareado(d, alfa)
        comum = {"cenario": cenario, "n": N_EXEMPLO, "efeito": EFEITO_EXEMPLO,
                 "semente": semente_cenario}
        linhas_resultado.append({**comum, "teste": "t pareado",
                                 "estatistica": round(t.estatistica, 6), "p_valor": t.p_valor,
                                 "significativo": t.significativo,
                                 "centro_nome": "media", "centro_valor": round(t.media, 6),
                                 "efeito_nome": "d_z", "efeito_valor": round(t.d_z, 6),
                                 "observacao": f"IC 95% unilateral: [{t.ic95_inferior:.4f}; +inf)"})
        linhas_resultado.append({**comum, "teste": "Wilcoxon pareado",
                                 "estatistica": w.estatistica, "p_valor": w.p_valor,
                                 "significativo": w.significativo,
                                 "centro_nome": "Hodges-Lehmann",
                                 "centro_valor": round(w.hodges_lehmann, 6),
                                 "efeito_nome": "rank-biserial",
                                 "efeito_valor": round(w.correlacao_rank_biserial, 6),
                                 "observacao": f"p {w.metodo}; assimetria da amostra: "
                                               f"{_assimetria(d):.3f}"})
    return linhas_dados, linhas_resultado


def _assimetria(valores: list[float]) -> float:
    """Mesma fórmula de src/descritiva.py (G1 ajustado)."""
    n = len(valores)
    media = statistics.fmean(valores)
    s = statistics.stdev(valores)
    return n / ((n - 1) * (n - 2)) * sum(((v - media) / s) ** 3 for v in valores)


def linhas_poder(celulas: list[Celula]) -> list[dict]:
    return [{
        "cenario": c.cenario, "n": c.n, "efeito": c.efeito, "repeticoes": c.repeticoes,
        "hipotese": "H0" if c.sob_h0 else "H1",
        "wilcoxon_simetrico": simetrico_sob_h0(c.cenario),
        "rejeicoes_t": c.rejeicoes_t, "taxa_t": round(c.taxa_t, 4),
        "erro_padrao_t": round(c.erro_padrao(c.taxa_t), 4),
        "rejeicoes_w": c.rejeicoes_w, "taxa_w": round(c.taxa_w, 4),
        "erro_padrao_w": round(c.erro_padrao(c.taxa_w), 4),
    } for c in celulas]


# ----------------------------------------------------------- relatório ----

def escrever_relatorio(caminho: Path, celulas: list[Celula], exemplos: list[dict],
                       desvio: float, semente: int, repeticoes: int, alfa: float) -> None:
    """docs/simulacao.md, com os parâmetros, as tabelas e a interpretação."""
    linhas = [
        "# Simulação e comparação dos dois testes",
        "",
        "**Lab04 — Issue #98: geração dos dados simulados, testes e p-valores**",
        "",
        "> Arquivo **gerado** por `python src/simulacao.py`. Não edite à mão:",
        "> rode o comando de novo.",
        "",
        "## Parâmetros",
        "",
        "| Item | Valor |",
        "|---|---|",
        f"| Semente | {semente} |",
        f"| Repetições por célula | {repeticoes} |",
        f"| Nível de significância | {alfa} |",
        f"| Desvio-padrão σ | {desvio:.4f} s (o das diferenças reais) |",
        f"| Tamanhos de amostra | {', '.join(str(t) for t in TAMANHOS)} |",
        f"| Efeitos (em unidades de σ) | {', '.join(str(e) for e in EFEITOS)} |",
        "",
        "Os três cenários têm a **mesma média e o mesmo desvio**; só a forma da",
        "distribuição muda. Assim, qualquer diferença de poder entre eles vem do",
        "formato, e não da escala.",
        "",
        "| Cenário | Forma | Por que está aqui |",
        "|---|---|---|",
        "| `normal` | simétrica | é onde o teste t é o mais poderoso |",
        f"| `lognormal_deslocada` | assimétrica à direita (σ_log = {SIGMA_LOG}) | formato típico de tempo |",
        f"| `contaminada` | {int(PROPORCAO_CONTAMINADA * 100)}% das observações com {FATOR_CONTAMINACAO:.0f}× o desvio | valores extremos |",
        "",
        "## Exemplo interpretado",
        "",
        f"Uma amostra de cada cenário, com n = {N_EXEMPLO} (o tamanho real) e efeito",
        f"de {EFEITO_EXEMPLO}σ. Os dados estão em `data/simulacao/cenarios.csv`.",
        "",
        "| Cenário | Teste | Estatística | p-valor | Rejeita H0? | Centro | Efeito |",
        "|---|---|---|---|---|---|---|",
    ]
    for linha in exemplos:
        p = f"{linha['p_valor']:.2e}" if linha["p_valor"] < 1e-4 else f"{linha['p_valor']:.4f}"
        linhas.append(
            f"| {linha['cenario']} | {linha['teste']} | {linha['estatistica']:.4f} | {p} | "
            f"{'sim' if linha['significativo'] else 'não'} | "
            f"{linha['centro_nome']} = {linha['centro_valor']:.4f} | "
            f"{linha['efeito_nome']} = {linha['efeito_valor']:.4f} |"
        )

    linhas += ["", "### O que este exemplo mostra", ""]
    linhas += _interpretar_exemplo(exemplos)
    linhas += [
        "",
        "## Taxa de erro tipo I e poder",
        "",
        f"Cada linha é {repeticoes} amostras. Com efeito 0 a coluna é a **taxa de erro",
        f"tipo I**, que deveria ficar perto de {alfa}; com efeito maior que 0, é o **poder**.",
        "O ± é o erro padrão de Monte Carlo: diferenças menores que ele são ruído da",
        "própria simulação.",
        "",
        "| Cenário | n | Efeito | Hipótese | t pareado | Wilcoxon |",
        "|---|---|---|---|---|---|",
    ]
    for c in celulas:
        marca = "" if (c.sob_h0 is False or simetrico_sob_h0(c.cenario)) else " ⚠"
        linhas.append(
            f"| {c.cenario} | {c.n} | {c.efeito:.1f}σ | {'H0' if c.sob_h0 else 'H1'}{marca} | "
            f"{c.taxa_t:.3f} ± {c.erro_padrao(c.taxa_t):.3f} | "
            f"{c.taxa_w:.3f} ± {c.erro_padrao(c.taxa_w):.3f} |"
        )

    linhas += ["", "### O que a tabela mostra", ""]
    linhas += _interpretar_estudo(celulas, alfa)
    linhas += [
        "",
        "⚠ = sob H0 neste cenário a distribuição **não é simétrica**, então a hipótese",
        "nula do Wilcoxon (simetria em torno de 0) está violada. A taxa de erro dele",
        "sair diferente de " + str(alfa) + " aí é esperado, não é defeito: o teste t tem como H0",
        "que a *média* é 0, e o Wilcoxon, que a *distribuição é simétrica*. São",
        "hipóteses diferentes, e numa distribuição assimétrica elas não coincidem.",
        "",
        "## Como refazer",
        "",
        "```bash",
        "cd Lab4",
        f"python src/simulacao.py --semente {semente} --repeticoes {repeticoes}",
        "```",
        "",
        "Os números acima são determinísticos: a mesma semente dá exatamente os",
        "mesmos dados. A conferência da implementação dos testes está em",
        "`tests/` (`python -m unittest discover -s tests`).",
        "",
    ]
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(linhas), encoding="utf-8")


def _interpretar_exemplo(exemplos: list[dict]) -> list[str]:
    """Lê a tabela do exemplo e descreve, em texto, onde os testes divergem.

    Gerado a partir dos números, e não escrito à mão: se a semente mudar, a
    interpretação acompanha em vez de ficar desatualizada.
    """
    por_cenario: dict[str, dict[str, dict]] = {}
    for linha in exemplos:
        por_cenario.setdefault(linha["cenario"], {})[linha["teste"]] = linha

    texto = []
    for cenario, testes in por_cenario.items():
        t_, w_ = testes["t pareado"], testes["Wilcoxon pareado"]
        if t_["significativo"] == w_["significativo"]:
            veredito = "rejeitam" if t_["significativo"] else "não rejeitam"
            texto.append(f"- **{cenario}**: os dois {veredito} H0 "
                         f"(p = {t_['p_valor']:.4f} e {w_['p_valor']:.4f}). "
                         "Nada a destacar — é o caso em que a escolha do teste não muda a conclusão.")
        else:
            ganhador = "t pareado" if t_["significativo"] else "Wilcoxon pareado"
            perdedor = "Wilcoxon pareado" if t_["significativo"] else "t pareado"
            motivo = {
                "lognormal_deslocada":
                    "a assimetria à direita puxa a média para cima, e o teste t responde a ela; "
                    "o Wilcoxon trabalha com postos e não acompanha esse deslocamento",
                "contaminada":
                    "os valores extremos inflam o desvio-padrão, e o t divide a média por ele; "
                    "os postos quase não sentem os extremos, então o Wilcoxon preserva o poder",
            }.get(cenario, "as duas estatísticas respondem a aspectos diferentes dos dados")
            texto.append(
                f"- **{cenario}**: os testes **discordam**. O {ganhador} rejeita H0 "
                f"(p = {testes[ganhador]['p_valor']:.4f}) e o {perdedor} não "
                f"(p = {testes[perdedor]['p_valor']:.4f}). "
                f"Nos mesmos dados: {motivo}."
            )
    texto.append("")
    texto.append("É exatamente a situação que o laboratório quer expor: nos dados reais o")
    texto.append("efeito é tão grande que os dois testes concordam, e só em dados simulados")
    texto.append("com efeito moderado dá para ver que a escolha do teste muda a conclusão.")
    return texto


def _interpretar_estudo(celulas: list[Celula], alfa: float) -> list[str]:
    """Resume, por cenário, o erro tipo I e quem tem mais poder."""
    texto = []
    for cenario in CENARIOS:
        do_cenario = [c for c in celulas if c.cenario == cenario]
        sob_h0 = [c for c in do_cenario if c.sob_h0]
        sob_h1 = [c for c in do_cenario if not c.sob_h0]

        faixa_t = f"{min(c.taxa_t for c in sob_h0):.3f}–{max(c.taxa_t for c in sob_h0):.3f}"
        faixa_w = f"{min(c.taxa_w for c in sob_h0):.3f}–{max(c.taxa_w for c in sob_h0):.3f}"

        # "ganha" = vantagem maior que 2 erros padrão de Monte Carlo
        vantagem_w = sum(1 for c in sob_h1
                         if c.taxa_w - c.taxa_t > 2 * c.erro_padrao(max(c.taxa_t, c.taxa_w)))
        vantagem_t = sum(1 for c in sob_h1
                         if c.taxa_t - c.taxa_w > 2 * c.erro_padrao(max(c.taxa_t, c.taxa_w)))

        if vantagem_t > vantagem_w:
            poder = f"o **teste t tem mais poder** em {vantagem_t} das {len(sob_h1)} células com efeito"
        elif vantagem_w > vantagem_t:
            poder = f"o **Wilcoxon tem mais poder** em {vantagem_w} das {len(sob_h1)} células com efeito"
        else:
            poder = f"nenhum dos dois leva vantagem clara nas {len(sob_h1)} células com efeito"

        texto.append(f"- **{cenario}** — erro tipo I: t em {faixa_t}, Wilcoxon em {faixa_w} "
                     f"(nominal {alfa}). Sob H1, {poder}.")

    texto += [
        "",
        "Os três padrões, juntos, são o resultado principal da simulação:",
        "",
        "1. Com diferenças **normais**, os dois controlam o erro e o teste t é",
        "   ligeiramente mais poderoso — é o terreno dele.",
        "2. Com diferenças **assimétricas**, os dois ficam conservadores, mas em graus",
        "   muito diferentes. A hipótese de simetria do Wilcoxon cai por terra e o erro",
        "   dele despenca bem abaixo do nominal; o do t também cai, porque com",
        "   assimetria a própria estatística t deixa de seguir a distribuição t na",
        "   cauda, mas bem menos. Quem é conservador demais paga em poder, e é o",
        "   Wilcoxon que paga aqui.",
        "3. Com **valores extremos**, a situação se inverte: o desvio-padrão infla, o",
        "   t perde poder, e o Wilcoxon passa na frente com folga.",
        "",
        "Ou seja, não existe \"o melhor teste\": existe o teste adequado ao formato das",
        "diferenças. É por isso que a análise dos dados reais verifica a normalidade e a",
        "simetria antes de interpretar, como está na seção 11 do cenário experimental.",
    ]
    return texto


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", type=Path, default=LAB4_DIR / "data" / "dados_reais.csv",
                        help="dados reais, de onde sai o desvio-padrão usado como escala")
    parser.add_argument("--saida", type=Path, default=LAB4_DIR / "data" / "simulacao")
    parser.add_argument("--relatorio", type=Path, default=LAB4_DIR / "docs" / "simulacao.md")
    parser.add_argument("--semente", type=int, default=SEMENTE_PADRAO)
    parser.add_argument("--repeticoes", type=int, default=REPETICOES_PADRAO)
    parser.add_argument("--alfa", type=float, default=ALFA)
    args = parser.parse_args()

    diferencas = carregar_diferencas(args.csv)
    desvio = statistics.stdev(diferencas)
    print(f"Escala calibrada em {args.csv.name}: σ = {desvio:.4f} s "
          f"({len(diferencas)} pares)")
    print(f"Semente {args.semente}, {args.repeticoes} repetições por célula, α = {args.alfa}\n")

    dados_exemplo, resultados_exemplo = gerar_exemplos(desvio, args.semente, args.alfa)
    escrever(args.saida / "cenarios.csv", COLUNAS_CENARIOS, dados_exemplo)
    escrever(args.saida / "resultados_exemplo.csv", COLUNAS_EXEMPLO, resultados_exemplo)

    total = len(CENARIOS) * len(TAMANHOS) * len(EFEITOS)
    feitas = 0

    def mostrar(c: Celula) -> None:
        nonlocal feitas
        feitas += 1
        print(f"  [{feitas:2}/{total}] {c.cenario:20} n={c.n:3} efeito={c.efeito:.1f}σ  "
              f"t={c.taxa_t:.3f}  W={c.taxa_w:.3f}")

    celulas = rodar_estudo(desvio, args.repeticoes, args.semente, args.alfa, mostrar)
    escrever(args.saida / "poder_erro.csv", COLUNAS_PODER, linhas_poder(celulas))
    escrever_relatorio(args.relatorio, celulas, resultados_exemplo, desvio,
                       args.semente, args.repeticoes, args.alfa)

    print(f"\nSaídas: {args.saida}/ (3 CSVs) e {args.relatorio}")


if __name__ == "__main__":
    main()
