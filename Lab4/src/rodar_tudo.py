"""Roda o Lab04 inteiro, na ordem certa, e regenera o dashboard.

O dashboard lê CSV, não importa função: cada seção dele depende de um arquivo
que um módulo diferente gerou. Isso deixou o trabalho paralelo (cada integrante
mexia no seu módulo sem quebrar a página dos outros), mas cobra um preço na
hora de entregar — quem clona o repositório precisa saber quais são os sete
comandos e em que ordem rodá-los, e um CSV regerado fora de ordem deixa a
página discordando de si mesma.

Este módulo é essa ordem, escrita uma vez. Não calcula nada: só chama os
outros na sequência em que as saídas de um alimentam o próximo, com as
sementes padrão — as mesmas que estão registradas nos relatórios. Rodar daqui
reproduz exatamente os números publicados.

A única etapa que pode faltar é a Q1 (`erro_tipo_i.py`), a única que usa NumPy
e pandas. Sem eles, ela é pulada com aviso e o resto continua: os CSVs dela
estão versionados, então o dashboard sai completo de qualquer jeito.

    python src/rodar_tudo.py            # tudo, ~15 min
    python src/rodar_tudo.py --abrir    # idem, e abre o dashboard no fim
    python src/rodar_tudo.py --listar   # só mostra o plano, sem rodar nada
"""

from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

LAB4_DIR = Path(__file__).resolve().parent.parent
SRC = LAB4_DIR / "src"


@dataclass(frozen=True)
class Etapa:
    """Um módulo do Lab04 e o que ele precisa para rodar."""

    modulo: str
    o_que_faz: str
    duracao: str
    saidas: tuple[str, ...]
    pacotes: tuple[str, ...] = ()
    argumentos: tuple[str, ...] = ()

    @property
    def caminho(self) -> Path:
        return SRC / f"{self.modulo}.py"

    def pacotes_faltando(self) -> tuple[str, ...]:
        return tuple(p for p in self.pacotes if importlib.util.find_spec(p) is None)


# A ordem não é estética: cada etapa consome o que a anterior escreveu.
ETAPAS: tuple[Etapa, ...] = (
    Etapa(
        "descritiva",
        "estatística descritiva dos 30 pares reais",
        "instantâneo",
        (),
    ),
    Etapa(
        "testes",
        "os dois testes nos dados reais",
        "instantâneo",
        ("data/resultados_reais.csv",),
    ),
    Etapa(
        "simulacao",
        "cenários simulados do exemplo interpretado (G1 e G2)",
        "~20 s",
        ("data/simulacao/cenarios.csv", "data/simulacao/resultados_exemplo.csv",
         "docs/simulacao.md"),
    ),
    Etapa(
        "erro_tipo_i",
        "Q1: 10.000 conjuntos sob H0, nos dois cenários",
        "~2 min",
        ("data/resultados_q1.csv", "data/pvalores_q1.csv",
         "data/pvalores_q1_controle.csv", "docs/resultados_q1.md"),
        pacotes=("numpy", "pandas"),
    ),
    Etapa(
        "comparacao_erro",
        "Q1: compara as duas taxas (Wilson, diferença pareada, McNemar) — G3",
        "instantâneo",
        ("data/comparacao_taxas_erro.csv", "data/mcnemar_q1.csv",
         "docs/comparacao_taxas_erro.md"),
    ),
    Etapa(
        "violacao",
        "Q3: erro tipo I com a normalidade violada e amostra pequena — G3",
        "~2,5 min",
        ("data/resultados_q3.csv", "data/mcnemar_q3.csv",
         "docs/violacao_pressupostos.md"),
    ),
    Etapa(
        "poder",
        "Q2: poder com efeitos crescentes, nas duas famílias de cenários — G4",
        "~10 min",
        ("data/resultados_q2.csv", "data/mcnemar_q2.csv", "docs/poder.md"),
    ),
    Etapa(
        "dashboard",
        "monta dashboard/index.html a partir de tudo que foi gerado acima",
        "instantâneo",
        ("dashboard/index.html",),
    ),
)

ULTIMA = ETAPAS[-1]


def listar() -> None:
    print(f"{len(ETAPAS)} etapas, na ordem em que uma alimenta a outra:\n")
    for i, etapa in enumerate(ETAPAS, 1):
        faltando = etapa.pacotes_faltando()
        marca = f"  (seria pulada: falta {', '.join(faltando)})" if faltando else ""
        print(f"  {i}. src/{etapa.modulo}.py — {etapa.o_que_faz} [{etapa.duracao}]{marca}")


def rodar(etapa: Etapa, argumentos: tuple[str, ...] = ()) -> float:
    """Roda uma etapa como processo próprio e devolve quanto tempo levou.

    Processo separado, e não `import`, de propósito: as etapas são programas de
    linha de comando com `main()` e argparse, e um módulo que trava ou estoura
    memória não leva o restante da rodada junto.
    """
    comando = [sys.executable, str(etapa.caminho), *etapa.argumentos, *argumentos]
    inicio = time.monotonic()
    resultado = subprocess.run(comando, cwd=LAB4_DIR)
    decorrido = time.monotonic() - inicio
    if resultado.returncode != 0:
        print(f"\n[!] src/{etapa.modulo}.py falhou (código {resultado.returncode}). "
              "Nada depois dele foi rodado, para a página não misturar números "
              "de rodadas diferentes.", file=sys.stderr)
        raise SystemExit(resultado.returncode)
    return decorrido


def conferir_saidas(etapa: Etapa) -> tuple[str, ...]:
    return tuple(s for s in etapa.saidas if not (LAB4_DIR / s).exists())


def main() -> None:
    analisador = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    analisador.add_argument("--abrir", action="store_true",
                            help="abre o dashboard no navegador ao terminar")
    analisador.add_argument("--listar", action="store_true",
                            help="mostra o plano e sai, sem rodar nada")
    opcoes = analisador.parse_args()

    if opcoes.listar:
        listar()
        return

    print(f"Lab04 — rodando {len(ETAPAS)} etapas com as sementes padrão.")
    print("Leva uns 15 minutos; o tempo está quase todo na Q2.\n")

    tempos: list[tuple[str, float]] = []
    pulados: list[Etapa] = []
    inicio = time.monotonic()

    for i, etapa in enumerate(ETAPAS, 1):
        faltando = etapa.pacotes_faltando()
        if faltando:
            print(f"[{i}/{len(ETAPAS)}] src/{etapa.modulo}.py — PULADO: "
                  f"falta {', '.join(faltando)} (veja requirements-q1.txt). "
                  "Os CSVs dessa etapa já estão versionados, então o dashboard "
                  "sai completo mesmo assim.\n")
            pulados.append(etapa)
            continue

        print(f"[{i}/{len(ETAPAS)}] src/{etapa.modulo}.py — {etapa.o_que_faz} "
              f"[{etapa.duracao}]")
        argumentos = ("--abrir",) if etapa is ULTIMA and opcoes.abrir else ()
        tempos.append((etapa.modulo, rodar(etapa, argumentos)))

        ausentes = conferir_saidas(etapa)
        if ausentes:
            print(f"\n[!] src/{etapa.modulo}.py terminou sem erro, mas não "
                  f"escreveu: {', '.join(ausentes)}.", file=sys.stderr)
            raise SystemExit(1)
        print()

    total = time.monotonic() - inicio
    print(f"Pronto em {total / 60:.1f} min.")
    for modulo, decorrido in sorted(tempos, key=lambda par: -par[1])[:3]:
        print(f"  mais demorado: src/{modulo}.py ({decorrido / 60:.1f} min)")
    if pulados:
        print(f"  pulado(s): {', '.join(e.modulo for e in pulados)}")
    print(f"\nDashboard: {LAB4_DIR / 'dashboard' / 'index.html'}")


if __name__ == "__main__":
    main()
