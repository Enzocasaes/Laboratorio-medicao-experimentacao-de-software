"""Q2 — o poder dos dois testes com efeitos crescentes (Lab04, Issue #109).

A Q1 e a Q3 mediram o que os testes fazem quando **não há efeito**: a taxa de
erro tipo I. Este módulo mede o outro lado, que é o que decide qual teste usar:
quando o efeito **existe**, com que frequência cada um o encontra?

    poder = rejeições / repetições,  com H1 verdadeira

O efeito é dado em unidades de desvio das diferenças (δ = μ_d / σ_d, que é o
mesmo d_z reportado nos dados reais), e varre de 0 — onde o poder tem de cair
de volta em α — até 1,5, onde qualquer teste acha.

## As duas famílias de cenários

Rodam as mesmas duas famílias que já estão na página, para o G4 poder ser lido
ao lado do G3 célula a célula:

| Família | Cenários | De onde vem |
|---|---|---|
| violação de pressupostos (Q3) | `normal`, `cauda_pesada`, `contaminada` | `gerar_diferencas` de `src/violacao.py` |
| bootstrap dos dados reais (Q1) | `bootstrap_simetrizado`, `bootstrap_centralizado` | reamostragem dos 30 resíduos reais |

Nenhum gerador é escrito de novo para a primeira família: `gerar_diferencas`
já recebe `efeito`, era só rodar com efeito maior que zero.

A segunda família é reamostrada aqui, em `random.Random`, e **não** importada de
`src/erro_tipo_i.py`: aquele módulo depende de NumPy, e o resto do Lab04 roda
sem instalar nada (a CI não faz `pip install`). A regra reimplementada é a de
lá, literalmente — resíduos `d − d̄` sorteados com reposição, com um sinal ±
independente no simetrizado. A consequência é que o fluxo de números sorteados
é outro: o ponto de efeito 0 **não** sai bit a bit igual ao da Q1, e sim igual
a menos do erro de Monte Carlo. É justamente isso que a conferência cruzada do
fim da rodada verifica.

## O que NÃO é poder

Poder só existe quando a H0 **daquele teste** é falsa, e as duas H0 não são a
mesma: a do t é sobre a média, a do Wilcoxon é sobre a simetria em torno de
zero (na prática, sobre a pseudomediana). No `bootstrap_centralizado` a
distribuição é assimétrica com média 0, então a H0 do Wilcoxon **já é falsa em
efeito 0** — ali a curva dele não é uma curva de poder, e começa acima de α por
outro motivo. Cada linha do CSV diz, em `natureza`, o que aquela taxa é:

    erro tipo I   · a H0 do teste é verdadeira (só acontece em efeito 0)
    poder         · a H0 do teste é falsa por causa do efeito
    rejeição com a H0 do teste falsa (não é erro tipo I)
                  · efeito 0, mas a H0 daquele teste já não valia

É a mesma distinção que o G3 marcou com a barra listrada, e o vocabulário vem
de `src/comparacao_erro.py` para as duas páginas falarem igual.

## Reaproveitamento

Os testes vêm de `src/testes.py`; o IC de Wilson, o McNemar e a diferença
pareada, de `src/comparacao_erro.py`; os geradores, de `src/violacao.py` e
`src/simulacao.py`. Só biblioteca padrão.

Uso (a partir de Lab4/):

    python src/poder.py                      # rodada oficial: 10.000 por célula
    python src/poder.py --repeticoes 300     # rodada rápida, confere o formato
    python src/poder.py --sem-conferencia    # pula o cruzamento com Q1/Q3
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

LAB4_DIR = Path(__file__).resolve().parent.parent
DADOS = LAB4_DIR / "data"
DOCS = LAB4_DIR / "docs"

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comparacao_erro import (  # noqa: E402
    NATUREZA_ERRO,
    NATUREZA_REJEICAO,
    TESTE_T,
    TESTE_W,
    diferenca_pareada,
    faixa_acaso,
    formatar_p,
    mcnemar,
    wilson,
)
from testes import carregar_diferencas, teste_t_pareado, wilcoxon_pareado  # noqa: E402
from violacao import DESVIO, gerar_diferencas  # noqa: E402

ALFA = 0.05
SEMENTE_PADRAO = 42
# O mesmo da Q1 e da Q3: com R diferente as taxas não seriam comparáveis na
# mesma precisão, e o ponto de efeito 0 é exatamente uma taxa delas.
REPETICOES_PADRAO = 10_000

# Em unidades de desvio (δ = μ_d/σ_d). A grade é mais fina onde as curvas
# sobem: entre 0,1 e 0,5 é onde os dois testes se separam.
EFEITOS = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1.0, 1.25, 1.5)
# 30 é o tamanho real; 5 e 10 são os da Q3 (amostra pequena); 50 responde
# "e se o grupo tivesse coletado mais pares?".
TAMANHOS = (5, 10, 30, 50)

NATUREZA_PODER = "poder"
ALVO_PODER = 0.80  # convenção usual; é onde o MDE é lido

CAUDA_PESADA = "cauda_pesada"
CONTAMINADA = "contaminada"
NORMAL = "normal"
SIMETRIZADO = "bootstrap_simetrizado"
CENTRALIZADO = "bootstrap_centralizado"

FAMILIA_VIOLACAO = "violação de pressupostos"
FAMILIA_BOOTSTRAP = "bootstrap dos dados reais"

CENARIOS_VIOLACAO = (NORMAL, CAUDA_PESADA, CONTAMINADA)
CENARIOS_BOOTSTRAP = (SIMETRIZADO, CENTRALIZADO)
CENARIOS = CENARIOS_VIOLACAO + CENARIOS_BOOTSTRAP

FAMILIA = {c: FAMILIA_VIOLACAO for c in CENARIOS_VIOLACAO}
FAMILIA.update({c: FAMILIA_BOOTSTRAP for c in CENARIOS_BOOTSTRAP})

DESCRICAO = {
    NORMAL: "sem violação (referência)",
    CAUDA_PESADA: "normalidade violada: t de Student com 3 gl",
    CONTAMINADA: "normalidade violada: 10% das observações com 5× o desvio",
    SIMETRIZADO: "resíduos reais reamostrados com sinal ± sorteado (simétrico)",
    CENTRALIZADO: "resíduos reais reamostrados sem trocar o sinal (assimétrico)",
}

ARQUIVO_TAXAS = DADOS / "resultados_q2.csv"
ARQUIVO_MCNEMAR = DADOS / "mcnemar_q2.csv"
ARQUIVO_RELATORIO = DOCS / "poder.md"
ARQUIVO_REAIS = DADOS / "dados_reais.csv"


# ----------------------------------------------------------- geradores


def residuos_reais(caminho: Path = ARQUIVO_REAIS) -> list[float]:
    """Os 30 resíduos d − d̄ dos dados coletados.

    A média é removida de propósito: é o que põe a distribuição geradora sob
    H0 e deixa o deslocamento por conta de `efeito`. A forma (assimetria,
    extremos) é a dos dados reais, e é isso que o bootstrap preserva.
    """
    diferencas = carregar_diferencas(caminho)
    media = statistics.fmean(diferencas)
    return [d - media for d in diferencas]


def gerar_bootstrap(cenario: str, n: int, efeito: float, rng: random.Random,
                    residuos: list[float], desvio: float = DESVIO) -> list[float]:
    """n diferenças reamostradas dos resíduos reais, deslocadas por `efeito`.

    Mesma regra de `src/erro_tipo_i.py`: no simetrizado cada valor é X = S·E,
    com E sorteado dos resíduos e S = ±1 independente, o que torna a
    distribuição geradora simétrica em torno do deslocamento; no centralizado
    o sinal não é trocado, e a assimetria dos dados reais fica de pé.
    """
    media = efeito * desvio
    if cenario == SIMETRIZADO:
        return [media + rng.choice(residuos) * (1.0 if rng.random() < 0.5 else -1.0)
                for _ in range(n)]
    if cenario == CENTRALIZADO:
        return [media + rng.choice(residuos) for _ in range(n)]
    raise ValueError(f"cenário de bootstrap desconhecido: {cenario}")


def gerar(cenario: str, n: int, efeito: float, rng: random.Random,
          residuos: list[float], desvio: float = DESVIO) -> list[float]:
    """Despacha para o gerador da família do cenário."""
    if cenario in CENARIOS_VIOLACAO:
        return gerar_diferencas(cenario, n, efeito, rng, desvio)
    if cenario in CENARIOS_BOOTSTRAP:
        return gerar_bootstrap(cenario, n, efeito, rng, residuos, desvio)
    raise ValueError(f"cenário desconhecido: {cenario} (use um de {CENARIOS})")


# ----------------------------------------------------- qual H0 vale aqui


def h0_verdadeira(cenario: str, efeito: float) -> dict[str, bool]:
    """A H0 de cada teste é verdadeira nesta distribuição geradora?

    t: H0 é μ_d <= 0, então ela vale exatamente quando o efeito é 0.
    Wilcoxon: H0 é simetria em torno de 0 (pseudomediana <= 0). Nos cenários
    simétricos a pseudomediana é o próprio deslocamento, então também vale só
    em efeito 0; no centralizado a distribuição é assimétrica com média 0 e
    pseudomediana positiva, e a H0 dele é falsa em toda a grade.
    """
    sem_efeito = efeito <= 0.0
    return {
        TESTE_T: sem_efeito,
        TESTE_W: sem_efeito and cenario != CENTRALIZADO,
    }


def natureza(h0_vale: bool, efeito: float) -> str:
    """O que a taxa daquela célula é — e o que ela não é."""
    if h0_vale:
        return NATUREZA_ERRO
    return NATUREZA_PODER if efeito > 0.0 else NATUREZA_REJEICAO


# ----------------------------------------------------------- Monte Carlo


@dataclass
class Celula:
    """Uma combinação (cenário, n, efeito) com as duas taxas e o pareamento."""

    cenario: str
    n: int
    efeito: float
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
    def familia(self) -> str:
        return FAMILIA[self.cenario]

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

    def taxa(self, teste: str) -> float:
        return self.taxa_t if teste == TESTE_T else self.taxa_w

    def ic(self, teste: str) -> tuple[float, float]:
        return self.ic_t() if teste == TESTE_T else self.ic_w()

    def erro_padrao(self, teste: str) -> float:
        """Erro padrão de Monte Carlo da taxa estimada."""
        p = self.taxa(teste)
        return math.sqrt(p * (1 - p) / self.repeticoes)


def semente_da_celula(base: int, cenario: str, n: int, efeito: float) -> int:
    """Semente determinística por célula, derivada da base.

    Rodar uma célula isolada tem de dar o mesmo resultado que rodar o estudo
    inteiro — senão nenhum número do relatório pode ser conferido em separado.
    """
    i = CENARIOS.index(cenario)
    j = TAMANHOS.index(n)
    k = EFEITOS.index(efeito)
    return base + 1000 * i + 100 * j + k


def rodar_celula(cenario: str, n: int, efeito: float, repeticoes: int,
                 semente: int, residuos: list[float], alfa: float = ALFA,
                 desvio: float = DESVIO) -> Celula:
    """`repeticoes` conjuntos do cenário; conta as rejeições dos dois testes.

    Os dois testes veem exatamente o MESMO conjunto em cada repetição: é o que
    torna as duas taxas pareadas, e é por isso que a diferença entre elas é
    avaliada com McNemar e não como duas proporções independentes.
    """
    rng = random.Random(semente)
    rejeitou_t: list[bool] = []
    rejeitou_w: list[bool] = []
    for _ in range(repeticoes):
        diferencas = gerar(cenario, n, efeito, rng, residuos, desvio)
        rejeitou_t.append(teste_t_pareado(diferencas, alfa).p_valor < alfa)
        # completo=False pula o Hodges-Lehmann, que é O(n²) e não entra na decisão
        rejeitou_w.append(wilcoxon_pareado(diferencas, alfa, completo=False).p_valor < alfa)

    pareado = mcnemar(rejeitou_t, rejeitou_w)
    diferenca, inferior, superior = diferenca_pareada(
        pareado.so_t_rejeita, pareado.so_w_rejeita, repeticoes
    )
    return Celula(
        cenario=cenario, n=n, efeito=efeito, repeticoes=repeticoes, alfa=alfa,
        semente=semente, rejeicoes_t=sum(rejeitou_t), rejeicoes_w=sum(rejeitou_w),
        mcnemar=pareado, diferenca_pp=diferenca * 100,
        diferenca_ic_inf_pp=inferior * 100, diferenca_ic_sup_pp=superior * 100,
    )


def rodar_estudo(repeticoes: int = REPETICOES_PADRAO,
                 semente: int = SEMENTE_PADRAO,
                 alfa: float = ALFA,
                 residuos: list[float] | None = None,
                 cenarios: tuple[str, ...] = CENARIOS,
                 tamanhos: tuple[int, ...] = TAMANHOS,
                 efeitos: tuple[float, ...] = EFEITOS,
                 progresso=None) -> list[Celula]:
    """Toda a grade cenário × n × efeito, cada célula com a própria semente."""
    if residuos is None:
        residuos = residuos_reais()
    celulas = []
    total = len(cenarios) * len(tamanhos) * len(efeitos)
    for cenario in cenarios:
        for n in tamanhos:
            for efeito in efeitos:
                celula = rodar_celula(
                    cenario, n, efeito, repeticoes,
                    semente_da_celula(semente, cenario, n, efeito),
                    residuos, alfa,
                )
                celulas.append(celula)
                if progresso:
                    progresso(len(celulas), total, celula)
    return celulas


# ------------------------------------------------------------- curvas


def curva(celulas: list[Celula], cenario: str, n: int,
          teste: str) -> list[tuple[float, float]]:
    """Os pontos (efeito, taxa) de um teste numa condição, em ordem de efeito."""
    pontos = [(c.efeito, c.taxa(teste)) for c in celulas
              if c.cenario == cenario and c.n == n]
    return sorted(pontos)


def efeito_minimo_detectavel(pontos: list[tuple[float, float]],
                             alvo: float = ALVO_PODER) -> float | None:
    """O efeito em que a curva cruza `alvo`, por interpolação linear.

    Devolve None quando a curva não chega ao alvo dentro da grade — e aí o
    relatório diz "> 1,5", que é uma informação, não uma falha: significa que
    naquele n o teste não alcança 80% de poder nem com efeito grande.
    """
    anterior = None
    for efeito, taxa in pontos:
        if taxa >= alvo:
            if anterior is None:
                return efeito
            e0, t0 = anterior
            if taxa == t0:
                return efeito
            return e0 + (alvo - t0) * (efeito - e0) / (taxa - t0)
        anterior = (efeito, taxa)
    return None


# ------------------------------------------------------------- saídas


COLUNAS_TAXAS = (
    "familia", "cenario", "descricao", "n", "efeito", "teste",
    "h0_do_teste_verdadeira", "natureza", "repeticoes", "alfa", "semente",
    "rejeicoes", "taxa_rejeicao", "ic95_wilson_inferior", "ic95_wilson_superior",
    "erro_padrao_mc", "mde80",
)
COLUNAS_MCNEMAR = (
    "familia", "cenario", "n", "efeito", "ambos_rejeitam", "so_t_rejeita",
    "so_w_rejeita", "nenhum_rejeita", "diferenca_w_menos_t_pp",
    "ic95_inferior_pp", "ic95_superior_pp", "p_mcnemar",
)


def linhas_taxas(celulas: list[Celula]) -> list[dict]:
    """Uma linha por (cenário, n, efeito, teste)."""
    mde: dict[tuple[str, int, str], float | None] = {}
    for celula in celulas:
        for teste in (TESTE_T, TESTE_W):
            chave = (celula.cenario, celula.n, teste)
            if chave not in mde:
                mde[chave] = efeito_minimo_detectavel(
                    curva(celulas, celula.cenario, celula.n, teste))

    linhas = []
    for celula in celulas:
        h0 = h0_verdadeira(celula.cenario, celula.efeito)
        for teste, rejeicoes in ((TESTE_T, celula.rejeicoes_t),
                                 (TESTE_W, celula.rejeicoes_w)):
            inferior, superior = celula.ic(teste)
            valor_mde = mde[(celula.cenario, celula.n, teste)]
            linhas.append({
                "familia": celula.familia,
                "cenario": celula.cenario,
                "descricao": DESCRICAO[celula.cenario],
                "n": celula.n,
                "efeito": celula.efeito,
                "teste": teste,
                "h0_do_teste_verdadeira": h0[teste],
                "natureza": natureza(h0[teste], celula.efeito),
                "repeticoes": celula.repeticoes,
                "alfa": celula.alfa,
                "semente": celula.semente,
                "rejeicoes": rejeicoes,
                "taxa_rejeicao": celula.taxa(teste),
                "ic95_wilson_inferior": inferior,
                "ic95_wilson_superior": superior,
                "erro_padrao_mc": celula.erro_padrao(teste),
                "mde80": "" if valor_mde is None else round(valor_mde, 4),
            })
    return linhas


def linhas_mcnemar(celulas: list[Celula]) -> list[dict]:
    return [{
        "familia": c.familia,
        "cenario": c.cenario,
        "n": c.n,
        "efeito": c.efeito,
        "ambos_rejeitam": c.mcnemar.ambos_rejeitam,
        "so_t_rejeita": c.mcnemar.so_t_rejeita,
        "so_w_rejeita": c.mcnemar.so_w_rejeita,
        "nenhum_rejeita": c.mcnemar.nenhum_rejeita,
        "diferenca_w_menos_t_pp": c.diferenca_pp,
        "ic95_inferior_pp": c.diferenca_ic_inf_pp,
        "ic95_superior_pp": c.diferenca_ic_sup_pp,
        "p_mcnemar": formatar_p(c.mcnemar),
    } for c in celulas]


def carregar_celulas(dados: Path = DADOS) -> list[Celula]:
    """Reconstrói as células a partir de `resultados_q2.csv`.

    Serve para regerar o relatório sem repetir as 220 células — uma correção
    de frase não precisa de dez minutos de simulação. O campo `mcnemar` fica
    como None de propósito: ele não entra em nenhuma tabela do relatório, e um
    objeto meio preenchido seria pior que um ausente. Quem precisar do
    pareamento lê `mcnemar_q2.csv`.
    """
    linhas = _ler_csv(dados / "resultados_q2.csv")
    por_celula: dict[tuple[str, int, float], dict[str, dict[str, str]]] = {}
    ordem: list[tuple[str, int, float]] = []
    for linha in linhas:
        chave = (linha["cenario"], int(linha["n"]), float(linha["efeito"]))
        if chave not in por_celula:
            por_celula[chave] = {}
            ordem.append(chave)
        por_celula[chave][linha["teste"]] = linha

    celulas = []
    for chave in ordem:
        t, w = por_celula[chave][TESTE_T], por_celula[chave][TESTE_W]
        celulas.append(Celula(
            cenario=chave[0], n=chave[1], efeito=chave[2],
            repeticoes=int(t["repeticoes"]), alfa=float(t["alfa"]),
            semente=int(t["semente"]), rejeicoes_t=int(t["rejeicoes"]),
            rejeicoes_w=int(w["rejeicoes"]), mcnemar=None,
            diferenca_pp=(float(w["taxa_rejeicao"]) - float(t["taxa_rejeicao"])) * 100,
            diferenca_ic_inf_pp=float("nan"), diferenca_ic_sup_pp=float("nan"),
        ))
    return celulas


def escrever_csv(caminho: Path, colunas: tuple[str, ...], linhas: list[dict]) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=colunas)
        escritor.writeheader()
        escritor.writerows(linhas)


# -------------------------------------------- conferência cruzada Q1/Q3

Z_975 = 1.959963984540054


def _ler_csv(caminho: Path) -> list[dict[str, str]]:
    with open(caminho, newline="", encoding="utf-8") as arquivo:
        return list(csv.DictReader(arquivo))


def conferir_bit_a_bit(dados: Path = DADOS, residuos: list[float] | None = None
                       ) -> list[dict]:
    """Refaz as células da Q3 com as SEMENTES dela e exige contagem idêntica.

    É a conferência mais forte disponível, e vale para os três cenários de
    violação porque lá o gerador é literalmente a mesma função
    (`violacao.gerar_diferencas`), com a mesma biblioteca de sorteio. Mesma
    semente, mesmo fluxo de números, mesma decisão: as contagens de rejeição
    têm de bater **exatamente**, não a menos de erro de Monte Carlo.

    Com a Q1 isso não é possível — ela sorteia com NumPy, e nenhum fluxo de
    `random.Random` reproduz aquele. Lá a conferência só pode ser estatística,
    que é o que `conferir_efeito_zero` faz.
    """
    arquivo = dados / "resultados_q3.csv"
    if not arquivo.exists():
        return []
    if residuos is None:
        residuos = residuos_reais()

    publicadas: dict[tuple[str, int], dict[str, dict[str, str]]] = {}
    for linha in _ler_csv(arquivo):
        publicadas.setdefault((linha["cenario"], int(linha["n"])), {})[linha["teste"]] = linha

    conferencias = []
    for (cenario, n), testes in sorted(publicadas.items()):
        t, w = testes[TESTE_T], testes[TESTE_W]
        celula = rodar_celula(cenario, n, 0.0, int(t["repeticoes"]),
                              int(t["semente"]), residuos, float(t["alfa"]))
        conferencias.append({
            "cenario": cenario,
            "n": n,
            "semente": int(t["semente"]),
            "t_aqui": celula.rejeicoes_t,
            "t_publicado": int(t["rejeicoes"]),
            "w_aqui": celula.rejeicoes_w,
            "w_publicado": int(w["rejeicoes"]),
            "identico": (celula.rejeicoes_t == int(t["rejeicoes"])
                         and celula.rejeicoes_w == int(w["rejeicoes"])),
        })
    return conferencias


def conferir_efeito_zero(celulas: list[Celula], dados: Path = DADOS) -> list[dict]:
    """Cruza o ponto de efeito 0 com as taxas de erro tipo I já publicadas.

    Em efeito 0 cada célula daqui mede exatamente a mesma coisa que a Q1 (para
    o bootstrap, n = 30) ou a Q3 (para os três cenários de violação). Os dois
    estudos sorteiam números diferentes, então as taxas não coincidem bit a
    bit: o que tem de valer é que a diferença caiba no erro de Monte Carlo dos
    dois juntos. A estatística é a de duas proporções independentes,

        z = (p_aqui − p_publicada) / sqrt(ep_aqui² + ep_publicada²)

    Um aviso de leitura: as duas linhas de uma mesma célula **não são
    independentes**. Os dois testes veem os mesmos conjuntos simulados, então
    quando uma amostra de conjuntos sai propensa a rejeição, as duas taxas
    sobem juntas. Um |z| passando de 1,96 nas duas linhas da mesma célula é
    uma observação, não duas — e com uma dúzia de células é de se esperar que
    isso aconteça em alguma. O que indica erro de verdade é um |z| grande
    (acima de 3,5) ou várias células fora ao mesmo tempo; para os cenários de
    violação, a conferência que decide é a exata, em `conferir_bit_a_bit`.
    """
    publicadas: dict[tuple[str, int, str], tuple[float, int]] = {}
    for arquivo, rotulo in ((dados / "resultados_q3.csv", "Q3"),
                            (dados / "resultados_q1.csv", "Q1")):
        if not arquivo.exists():
            continue
        for linha in _ler_csv(arquivo):
            chave = (linha["cenario"], int(linha["n"]), linha["teste"])
            publicadas[chave] = (float(linha["taxa_rejeicao"]),
                                 int(linha["repeticoes"]))
            publicadas[chave + (rotulo,)] = publicadas[chave]

    comparacoes = []
    for celula in celulas:
        if celula.efeito != 0.0:
            continue
        for teste in (TESTE_T, TESTE_W):
            chave = (celula.cenario, celula.n, teste)
            if chave not in publicadas:
                continue
            taxa_publicada, repeticoes_publicadas = publicadas[chave]
            origem = "Q1" if celula.cenario in CENARIOS_BOOTSTRAP else "Q3"
            taxa = celula.taxa(teste)
            ep = math.sqrt(
                celula.erro_padrao(teste) ** 2
                + taxa_publicada * (1 - taxa_publicada) / repeticoes_publicadas
            )
            z = (taxa - taxa_publicada) / ep if ep > 0 else 0.0
            comparacoes.append({
                "origem": origem,
                "cenario": celula.cenario,
                "n": celula.n,
                "teste": teste,
                "taxa_aqui": taxa,
                "taxa_publicada": taxa_publicada,
                "z": z,
                "compativel": abs(z) <= Z_975,
            })
    return comparacoes


# ------------------------------------------------------------ relatório


def _pct(valor: float, casas: int = 2) -> str:
    return f"{valor * 100:.{casas}f}".replace(".", ",") + "%"


def _num(valor: float, casas: int = 2) -> str:
    return f"{valor:.{casas}f}".replace(".", ",")


def _mde_texto(valor: float | None) -> str:
    """Para tabela: o valor, ou a marca de que a curva não chegou ao alvo."""
    if valor is None:
        return "> 1,50"
    return _num(valor, 2)


def _mde_frase(valor: float | None) -> str:
    """Para o meio de uma frase, onde "δ = > 1,50" não se lê."""
    if valor is None:
        return f"mais de δ = {_num(max(EFEITOS), 2)}"
    return f"δ = {_num(valor, 2)}"


def _celula(celulas: list[Celula], cenario: str, n: int, efeito: float) -> Celula:
    for c in celulas:
        if c.cenario == cenario and c.n == n and c.efeito == efeito:
            return c
    raise KeyError(f"célula não encontrada: {cenario}, n={n}, efeito={efeito}")


def _maior_vantagem(celulas: list[Celula], cenario: str, n: int
                    ) -> tuple[float, float]:
    """(maior valor de taxa_W − taxa_t em p.p., efeito em que acontece).

    Só entre os efeitos maiores que zero: em efeito 0 a diferença é de erro
    tipo I, não de poder, e misturar as duas coisas é o erro que este módulo
    inteiro tenta evitar.
    """
    candidatas = [c for c in celulas
                  if c.cenario == cenario and c.n == n and c.efeito > 0]
    melhor = max(candidatas, key=lambda c: c.taxa_w - c.taxa_t)
    return (melhor.taxa_w - melhor.taxa_t) * 100, melhor.efeito


def _tabela_cenario(celulas: list[Celula], cenario: str,
                    tamanhos: tuple[int, ...], efeitos: tuple[float, ...]) -> list[str]:
    cabecalho = "| δ (efeito) | " + " | ".join(
        f"n={n} t | n={n} W" for n in tamanhos) + " |"
    separador = "|---|" + "---|" * (2 * len(tamanhos))
    linhas = [cabecalho, separador]
    for efeito in efeitos:
        valores = []
        for n in tamanhos:
            c = _celula(celulas, cenario, n, efeito)
            valores.extend([_pct(c.taxa_t, 1), _pct(c.taxa_w, 1)])
        linhas.append(f"| {_num(efeito, 2)} | " + " | ".join(valores) + " |")
    return linhas


def _interpretar(celulas: list[Celula], alfa: float,
                 tamanhos: tuple[int, ...]) -> list[str]:
    """A leitura dos números, escrita a partir deles.

    Nada de texto fixo: se uma rodada mudar de resultado, o parágrafo muda
    junto. É a mesma regra de `_interpretar_estudo` em `src/simulacao.py`.
    """
    n_real = 30 if 30 in tamanhos else tamanhos[-1]
    # lida do CSV, e não escrita à mão: um número fixo aqui envelheceria em
    # silêncio se a coleta fosse refeita
    media_real = statistics.fmean(carregar_diferencas(ARQUIVO_REAIS))
    linhas = ["## Leitura", ""]

    # 1. o ponto de efeito 0
    zeros = [c for c in celulas if c.efeito == 0.0 and c.cenario != CENTRALIZADO]
    maior_desvio = max(zeros, key=lambda c: max(abs(c.taxa_t - alfa),
                                                abs(c.taxa_w - alfa)))
    linhas += [
        f"**O eixo começa onde a Q1 e a Q3 pararam.** Em δ = 0 não existe efeito, "
        f"e a taxa de rejeição volta a ser a taxa de erro tipo I: nas "
        f"{len(zeros)} células simétricas ela fica entre "
        f"{_pct(min(min(c.taxa_t, c.taxa_w) for c in zeros))} e "
        f"{_pct(max(max(c.taxa_t, c.taxa_w) for c in zeros))}, com o maior "
        f"afastamento de α no cenário `{maior_desvio.cenario}` com "
        f"n = {maior_desvio.n}. É por isso que as curvas do G4 **partem de 5%**: "
        "se partissem de outro lugar, o problema não seria de poder.",
        "",
    ]

    # 2. o cenário normal: onde o t deveria ganhar
    piores = [c for c in celulas
              if c.cenario == NORMAL and c.n == n_real and c.efeito > 0]
    maior_perda = min(piores, key=lambda c: c.taxa_w - c.taxa_t)
    linhas += [
        f"**Com diferenças normais, o t ganha — e ganha pouco.** Em n = {n_real}, a "
        f"maior desvantagem do Wilcoxon no cenário `normal` é de "
        f"{_num(abs((maior_perda.taxa_w - maior_perda.taxa_t) * 100), 1)} p.p. "
        f"(δ = {_num(maior_perda.efeito, 2)}: {_pct(maior_perda.taxa_t, 1)} do t "
        f"contra {_pct(maior_perda.taxa_w, 1)} do Wilcoxon). O teste t é o mais "
        "poderoso quando seus pressupostos valem exatamente, mas o preço de usar o "
        "Wilcoxon nesse caso é de poucos pontos percentuais — o custo da robustez "
        "é baixo.",
        "",
    ]

    # 3. os cenários de cauda pesada e outliers: onde o Wilcoxon ganha
    partes = []
    for cenario in (CAUDA_PESADA, CONTAMINADA):
        vantagem, efeito = _maior_vantagem(celulas, cenario, n_real)
        c = _celula(celulas, cenario, n_real, efeito)
        partes.append(
            f"em `{cenario}` ele chega a {_num(vantagem, 1)} p.p. de vantagem "
            f"(δ = {_num(efeito, 2)}: {_pct(c.taxa_w, 1)} contra {_pct(c.taxa_t, 1)})"
        )
    linhas += [
        "**Com cauda pesada e com outliers, o Wilcoxon ganha — e ganha muito mais do "
        f"que perde no normal.** Em n = {n_real}, " + "; ".join(partes) + ". "
        "A razão é a mesma nos dois: a média e o desvio que o t usa são puxados "
        "pelos valores extremos, e o desvio cresce mais rápido que a média, então a "
        "estatística t encolhe. Os postos não enxergam a magnitude do extremo, só a "
        "ordem.",
        "",
    ]

    # 4. o MDE em n = 30
    mdes = []
    for cenario in CENARIOS_VIOLACAO:
        for teste in (TESTE_T, TESTE_W):
            valor = efeito_minimo_detectavel(curva(celulas, cenario, n_real, teste))
            mdes.append((cenario, teste, valor))
    com_valor = [(c, t, v) for c, t, v in mdes if v is not None]
    linhas += [
        f"**Quanto de efeito {n_real} pares conseguem detectar.** Lendo onde cada "
        f"curva cruza 80% de poder, o efeito mínimo detectável em n = {n_real} fica "
        f"entre δ = {_mde_texto(min(v for _, _, v in com_valor))} e "
        f"δ = {_mde_texto(max(v for _, _, v in com_valor))} — ou seja, entre "
        f"{_num(min(v for _, _, v in com_valor) * DESVIO, 2)} s e "
        f"{_num(max(v for _, _, v in com_valor) * DESVIO, 2)} s de diferença média. "
        "A seção 12 do cenário experimental avisava que 30 pares poderiam não bastar "
        "para efeitos pequenos; este é o número que faltava para dizer *quão* "
        f"pequenos. A diferença medida nos dados reais foi de {_num(media_real, 2)} s, "
        f"{_num(media_real / (max(v for _, _, v in com_valor) * DESVIO), 0)} vezes "
        "maior que o mais exigente desses limites — por isso os dois testes "
        "concordaram com folga.",
        "",
    ]

    # 5. amostra pequena
    if 5 in tamanhos:
        pequeno_t = efeito_minimo_detectavel(curva(celulas, NORMAL, 5, TESTE_T))
        pequeno_w = efeito_minimo_detectavel(curva(celulas, NORMAL, 5, TESTE_W))
        maior_efeito = max(c.efeito for c in celulas)
        c5 = _celula(celulas, NORMAL, 5, maior_efeito)
        linhas += [
            f"**Com n = 5 o problema deixa de ser qual teste e passa a ser o tamanho "
            f"da amostra.** No cenário `normal`, o MDE₈₀ vai para "
            f"{_mde_frase(pequeno_t)} no t e {_mde_frase(pequeno_w)} no Wilcoxon, e "
            f"mesmo com δ = {_num(maior_efeito, 2)} as taxas param em "
            f"{_pct(c5.taxa_t, 1)} e {_pct(c5.taxa_w, 1)}. O Wilcoxon exato fica preso "
            "na granularidade que a Q3 já havia mostrado no erro tipo I: com 2⁵ = 32 "
            "somas de postos possíveis, as caudas disponíveis são poucas, e ele gasta "
            "menos que α — erra menos e acha menos.",
            "",
        ]

    # 6. o centralizado, que não é poder
    c0 = _celula(celulas, CENTRALIZADO, n_real, 0.0)
    linhas += [
        f"**A curva do Wilcoxon no `{CENTRALIZADO}` não é uma curva de poder.** Ali a "
        "distribuição é assimétrica com média 0, então a H₀ dele (simetria em torno "
        f"de zero) já é falsa em δ = 0, e ele rejeita {_pct(c0.taxa_w)} dos conjuntos "
        f"sem que exista qualquer deslocamento — contra {_pct(c0.taxa_t)} do t, que é "
        "erro tipo I de verdade. É o mesmo ponto que o G3 marcou com a barra "
        "listrada, e é a razão de a coluna `natureza` existir no CSV: subir essa "
        "curva não é mérito, é a H₀ errada sendo testada.",
        "",
    ]

    # 7. recomendação, decidida pelos números
    ganhos = [_maior_vantagem(celulas, c, n_real)[0]
              for c in (CAUDA_PESADA, CONTAMINADA)]
    perda = abs(min(c.taxa_w - c.taxa_t for c in celulas
                    if c.cenario == NORMAL and c.n == n_real and c.efeito > 0) * 100)
    if max(ganhos) > perda:
        recomendacao = (
            f"**Recomendação: o Wilcoxon pareado como teste principal neste cenário.** "
            f"Ele troca até {_num(perda, 1)} p.p. de poder, no caso em que o t é "
            f"ótimo, por até {_num(max(ganhos), 1)} p.p. quando há cauda pesada ou "
            "outliers — e tempo de build tem as duas coisas. A troca é assimétrica a "
            "favor dele."
        )
    else:
        recomendacao = (
            f"**Recomendação: o teste t pareado como teste principal neste cenário.** "
            f"A vantagem do Wilcoxon onde ele ganha ({_num(max(ganhos), 1)} p.p.) não "
            f"compensa o que ele perde onde o t é ótimo ({_num(perda, 1)} p.p.)."
        )
    linhas += [
        recomendacao,
        "",
        "Com duas ressalvas que os números acima deixam explícitas. A primeira: um "
        "p < 0,05 do Wilcoxon **não** autoriza uma afirmação sobre o tempo *médio*. "
        "A H₀ dele é sobre simetria/pseudomediana, e o cenário centralizado mostra "
        "que as duas coisas se separam quando as diferenças são assimétricas — se a "
        "conclusão precisa ser sobre a média, o teste é o t. A segunda: com amostra "
        "muito pequena a escolha do teste é secundária, porque nenhum dos dois tem "
        "poder. Nos dados reais deste laboratório a discussão é acadêmica — o efeito "
        "é grande o bastante para os dois rejeitarem com folga — e é exatamente por "
        "isso que ela precisou ser feita por simulação.",
        "",
    ]
    return linhas


def escrever_relatorio(caminho: Path, celulas: list[Celula],
                       conferencias: list[dict],
                       exatas: list[dict] | None = None,
                       tamanhos: tuple[int, ...] = TAMANHOS,
                       efeitos: tuple[float, ...] = EFEITOS) -> None:
    """docs/poder.md — gerado a partir dos números, como os outros docs do Lab04."""
    exatas = exatas or []
    alfa = celulas[0].alfa
    repeticoes = celulas[0].repeticoes
    inferior, superior = faixa_acaso(alfa, repeticoes)
    cenarios = tuple(dict.fromkeys(c.cenario for c in celulas))

    linhas = [
        "# Poder dos dois testes com efeitos crescentes (Q2)",
        "",
        "**Lab04 — Issue #109: a simulação com H1 verdadeira**",
        "",
        "> Arquivo **gerado** por `python src/poder.py`. Não edite à mão:",
        "> rode o comando de novo.",
        "",
        "A Q1 e a Q3 mediram a taxa de erro tipo I, isto é, o que os testes fazem",
        "quando **não** há efeito. Aqui o efeito existe, e a pergunta é quantas vezes",
        "cada teste o encontra. O efeito é dado em desvios das diferenças",
        "(δ = μ_d/σ_d, o mesmo d_z dos dados reais).",
        "",
        "## Parâmetros",
        "",
        "| Item | Valor |",
        "|---|---|",
        "| Repetições por célula | " + f"{repeticoes:,}".replace(",", ".") + " |",
        f"| Nível de significância | {alfa} (unilateral, `greater`) |",
        f"| Efeitos (δ) | {', '.join(_num(e, 2) for e in efeitos)} |",
        f"| Tamanhos de amostra | {', '.join(str(n) for n in tamanhos)} |",
        f"| Desvio das diferenças | {DESVIO} s (o das diferenças reais) |",
        f"| Semente base | {SEMENTE_PADRAO} (cada célula deriva a sua) |",
        f"| Células | {len(celulas)} ({len(cenarios)} cenários × "
        f"{len(tamanhos)} tamanhos × {len(efeitos)} efeitos) |",
        "",
        f"Se a taxa verdadeira fosse exatamente α, a estimada cairia entre "
        f"{_pct(inferior)} e {_pct(superior)} em 95% das simulações.",
        "",
        "## Cenários",
        "",
        "| Cenário | Família | O que é |",
        "|---|---|---|",
    ]
    for cenario in cenarios:
        linhas.append(f"| `{cenario}` | {FAMILIA[cenario]} | {DESCRICAO[cenario]} |")
    linhas += [
        "",
        "Os três primeiros vêm de `gerar_diferencas` em `src/violacao.py`, que já",
        "aceitava o efeito. Os dois do bootstrap reamostram os 30 resíduos reais com",
        "`random.Random`, seguindo a mesma regra de `src/erro_tipo_i.py` — que não é",
        "importado aqui porque depende de NumPy, e o resto do Lab04 roda sem instalar",
        "nada. O fluxo de sorteios é outro, então o ponto de δ = 0 reproduz a taxa da",
        "Q1 a menos do erro de Monte Carlo, e não bit a bit; a conferência abaixo é",
        "exatamente esse teste.",
        "",
    ]

    if exatas:
        iguais = sum(1 for c in exatas if c["identico"])
        linhas += [
            "## Conferência bit a bit com a Q3",
            "",
            "Nos três cenários de violação o gerador é a mesma função que a Q3 usa",
            "(`violacao.gerar_diferencas`), com a mesma biblioteca de sorteio. Refazendo",
            "cada célula **com a semente da Q3**, as contagens de rejeição têm de bater",
            "exatamente — não a menos de erro de simulação.",
            "",
            "| Cenário | n | Semente | t aqui | t na Q3 | W aqui | W na Q3 | Idêntico |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for c in exatas:
            linhas.append(
                f"| `{c['cenario']}` | {c['n']} | {c['semente']} | {c['t_aqui']} | "
                f"{c['t_publicado']} | {c['w_aqui']} | {c['w_publicado']} | "
                f"{'sim' if c['identico'] else '**NÃO**'} |")
        linhas += [
            "",
            f"{iguais} de {len(exatas)} células idênticas"
            + ("." if iguais == len(exatas) else
               " — **há divergência: o gerador ou a decisão mudaram.**"),
            "",
            "Com a Q1 isso não é possível: ela sorteia com NumPy, e nenhum fluxo de",
            "`random.Random` reproduz aquele. Lá a conferência só pode ser estatística.",
            "",
        ]

    if conferencias:
        linhas += [
            "## Conferência estatística do ponto δ = 0",
            "",
            "Em δ = 0 cada célula mede a mesma coisa que uma taxa de erro tipo I já",
            "publicada. Como as sementes da grade daqui são outras, o que tem de valer é",
            "|z| ≤ 1,96 na comparação de duas proporções independentes.",
            "",
            "| Origem | Cenário | n | Teste | Aqui | Publicada | z | Compatível |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for c in sorted(conferencias, key=lambda x: (x["origem"], x["cenario"],
                                                     x["n"], x["teste"])):
            linhas.append(
                f"| {c['origem']} | `{c['cenario']}` | {c['n']} | {c['teste']} | "
                f"{_pct(c['taxa_aqui'])} | {_pct(c['taxa_publicada'])} | "
                f"{_num(c['z'], 2)} | {'sim' if c['compativel'] else '**NÃO**'} |"
            )
        incompativeis = [c for c in conferencias if not c["compativel"]]
        celulas_fora = {(c["cenario"], c["n"]) for c in incompativeis}
        total_celulas = len({(c["cenario"], c["n"]) for c in conferencias})
        linhas += [
            "",
            f"{len(conferencias) - len(incompativeis)} de {len(conferencias)} "
            f"linhas compatíveis, em {len(celulas_fora)} de {total_celulas} células.",
            "",
            "As duas linhas de uma mesma célula **não são independentes**: os dois testes",
            "veem os mesmos conjuntos simulados, então quando uma amostra sai propensa a",
            "rejeitar, as duas taxas sobem juntas. Uma célula fora da faixa é uma",
            "observação, não duas — e com uma dúzia de células é esperado que isso",
            "aconteça em alguma. O que indicaria erro é |z| acima de 3,5 ou várias",
            "células fora ao mesmo tempo; para os cenários de violação, quem decide é a",
            "conferência exata da seção anterior.",
            "",
        ]

    linhas += [
        "## Efeito mínimo detectável com 80% de poder (MDE₈₀)",
        "",
        "O δ em que a curva cruza 80%, por interpolação linear entre os pontos da",
        "grade. `> 1,50` significa que o teste não chega a 80% dentro da grade.",
        "",
        "| Cenário | " + " | ".join(f"n={n} t | n={n} W" for n in tamanhos) + " |",
        "|---|" + "---|" * (2 * len(tamanhos)),
    ]
    for cenario in cenarios:
        valores = []
        for n in tamanhos:
            for teste in (TESTE_T, TESTE_W):
                valores.append(_mde_texto(efeito_minimo_detectavel(
                    curva(celulas, cenario, n, teste))))
        linhas.append(f"| `{cenario}` | " + " | ".join(valores) + " |")
    linhas += [
        "",
        f"Em segundos, basta multiplicar por σ_d = {DESVIO} s.",
        "",
        "## Poder por cenário",
        "",
        "Proporção de conjuntos em que cada teste rejeitou H₀. A linha δ = 0 é a taxa",
        "de erro tipo I, não poder.",
        "",
    ]
    for cenario in cenarios:
        linhas += [
            f"### `{cenario}` — {DESCRICAO[cenario]}",
            "",
        ]
        linhas += _tabela_cenario(celulas, cenario, tamanhos, efeitos)
        if cenario == CENTRALIZADO:
            linhas += [
                "",
                "> Atenção: aqui a H₀ do Wilcoxon é **falsa em toda a tabela**, inclusive",
                "> em δ = 0 (a distribuição é assimétrica, com média 0 e pseudomediana",
                "> positiva). A coluna W não é poder, e sim taxa de rejeição com a H₀ do",
                "> teste falsa — a mesma distinção que o G3 marcou com a barra listrada.",
            ]
        linhas.append("")

    linhas += _interpretar(celulas, alfa, tamanhos)
    linhas += [
        "## Limitações",
        "",
        "As taxas valem para estes cinco cenários, estes tamanhos de amostra e este",
        "α, e carregam o erro de Monte Carlo de "
        + f"{repeticoes:,}".replace(",", ".") + " repetições — diferenças de menos de",
        "cerca de 1 p.p. entre duas células não devem ser lidas como reais sem olhar",
        "o IC no CSV. O MDE₈₀ é interpolado entre pontos da grade, então tem a",
        "resolução dela. E o bootstrap herda a forma de 30 observações: ele preserva a",
        "assimetria e os extremos **daquela** coleta, não de builds em geral.",
        "",
        "## Arquivos gerados",
        "",
        "| Arquivo | Conteúdo |",
        "|---|---|",
        "| `data/resultados_q2.csv` | uma linha por (cenário, n, δ, teste), com IC de "
        "Wilson, erro padrão de Monte Carlo e MDE₈₀ |",
        "| `data/mcnemar_q2.csv` | o pareamento entre os dois testes em cada célula |",
        "| `docs/poder.md` | este relatório |",
        "",
    ]
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8")


# ----------------------------------------------------------------- CLI


def main() -> None:
    analisador = argparse.ArgumentParser(
        description="Q2 do Lab04: poder dos dois testes com efeitos crescentes.")
    analisador.add_argument("--repeticoes", type=int, default=REPETICOES_PADRAO,
                            help="conjuntos simulados por célula")
    analisador.add_argument("--semente", type=int, default=SEMENTE_PADRAO,
                            help="semente base; cada célula deriva a sua")
    analisador.add_argument("--alfa", type=float, default=ALFA,
                            help="nível de significância")
    analisador.add_argument("--sem-conferencia", action="store_true",
                            help="pula o cruzamento do δ = 0 com a Q1 e a Q3")
    analisador.add_argument("--so-relatorio", action="store_true",
                            help="regera docs/poder.md a partir dos CSVs, "
                                 "sem repetir a simulação")
    argumentos = analisador.parse_args()

    if argumentos.so_relatorio:
        celulas = carregar_celulas()
        escrever_relatorio(ARQUIVO_RELATORIO, celulas,
                           conferir_efeito_zero(celulas), conferir_bit_a_bit())
        print(f"gerado a partir dos CSVs: "
              f"{ARQUIVO_RELATORIO.relative_to(LAB4_DIR)}")
        return

    residuos = residuos_reais()
    inicio = time.perf_counter()

    def progresso(feitas: int, total: int, celula: Celula) -> None:
        decorrido = time.perf_counter() - inicio
        restante = decorrido / feitas * (total - feitas)
        print(f"  [{feitas:3d}/{total}] {celula.cenario:>22s}  n={celula.n:<3d} "
              f"δ={celula.efeito:<4} t={celula.taxa_t:6.1%}  W={celula.taxa_w:6.1%}"
              f"   faltam ~{restante / 60:.1f} min",
              file=sys.stderr, flush=True)

    print(f"Q2: {len(CENARIOS)} cenários × {len(TAMANHOS)} tamanhos × "
          f"{len(EFEITOS)} efeitos × {argumentos.repeticoes} repetições",
          file=sys.stderr)
    celulas = rodar_estudo(repeticoes=argumentos.repeticoes,
                           semente=argumentos.semente, alfa=argumentos.alfa,
                           residuos=residuos, progresso=progresso)

    conferencias: list[dict] = []
    exatas: list[dict] = []
    if not argumentos.sem_conferencia:
        conferencias = conferir_efeito_zero(celulas)
        print("\nrefazendo as células da Q3 com as sementes dela...", file=sys.stderr)
        exatas = conferir_bit_a_bit(residuos=residuos)

    escrever_csv(ARQUIVO_TAXAS, COLUNAS_TAXAS, linhas_taxas(celulas))
    escrever_csv(ARQUIVO_MCNEMAR, COLUNAS_MCNEMAR, linhas_mcnemar(celulas))
    escrever_relatorio(ARQUIVO_RELATORIO, celulas, conferencias, exatas)

    print(f"\n{len(celulas)} células em {(time.perf_counter() - inicio) / 60:.1f} min")
    for caminho in (ARQUIVO_TAXAS, ARQUIVO_MCNEMAR, ARQUIVO_RELATORIO):
        print(f"gerado: {caminho.relative_to(LAB4_DIR)}")

    falhou = False

    if exatas:
        diferentes = [c for c in exatas if not c["identico"]]
        print(f"\nconferência bit a bit com a Q3: "
              f"{len(exatas) - len(diferentes)}/{len(exatas)} células idênticas")
        for c in diferentes:
            print(f"  DIVERGE: {c['cenario']} n={c['n']} (semente {c['semente']}): "
                  f"t {c['t_aqui']} × {c['t_publicado']}, "
                  f"W {c['w_aqui']} × {c['w_publicado']}")
        falhou = falhou or bool(diferentes)

    if conferencias:
        ruins = [c for c in conferencias if not c["compativel"]]
        celulas_fora = {(c["cenario"], c["n"]) for c in ruins}
        total = len({(c["cenario"], c["n"]) for c in conferencias})
        print(f"conferência estatística em δ = 0: "
              f"{len(conferencias) - len(ruins)}/{len(conferencias)} linhas "
              f"compatíveis ({len(celulas_fora)}/{total} células fora da faixa)")
        for c in ruins:
            print(f"  fora da faixa: {c['cenario']} n={c['n']} {c['teste']}: "
                  f"aqui {c['taxa_aqui']:.4f} × publicada {c['taxa_publicada']:.4f} "
                  f"(z = {c['z']:.2f})")
        # As duas linhas de uma célula são a MESMA observação (mesmos conjuntos),
        # e com ~11 células é esperado que uma caia fora por acaso. O que indica
        # erro é um z grande ou muitas células fora de uma vez.
        grave = [c for c in ruins if abs(c["z"]) > 3.5]
        if grave or len(celulas_fora) > total / 3:
            print("  -> padrão sistemático: isto não é acaso de simulação")
            falhou = True

    if falhou:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
