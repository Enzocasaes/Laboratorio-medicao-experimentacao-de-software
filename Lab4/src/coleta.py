"""Coleta de tempos de build do Gradle com e sem Build Cache (Lab04, par P2).

Executa pares de builds de um projeto Java que usa o Gradle Wrapper:

    A (sem cache): gradlew.bat clean build --no-build-cache --no-configuration-cache
    B (com cache): gradlew.bat clean build --build-cache --no-configuration-cache

A ordem A/B de cada par é sorteada com semente fixa e balanceada (metade AB,
metade BA). Cada execução é medida com time.perf_counter() em volta do
subprocesso. Execuções que falham não viram observação: o par inteiro é
descartado, registrado e repetido.

Cada sessão grava em uma pasta própria (data/<modo>/<timestamp>/), nunca
sobrescrevendo sessões anteriores:

    execucoes.csv   uma linha por execução (bruto, inclui falhas e descartes)
    pares.csv       uma linha por par válido
    metadados.json  ambiente, comandos, semente, commit do projeto
    logs/           saída completa do Gradle de cada execução

No modo oficial, ao final, os pares válidos também são exportados para
data/dados_reais.csv (par, tempo_sem_cache, tempo_com_cache, ordem_execucao).
Se esse arquivo já existir, a exportação é recusada.

Uso (PowerShell, a partir de Lab4/):

    python src/coleta.py --projeto C:\\caminho\\projeto --modo piloto --pares 5
    python src/coleta.py --projeto C:\\caminho\\projeto --modo oficial --pares 30
"""

from __future__ import annotations

import argparse
import csv
import json
import platform
import random
import re
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

LAB4_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = LAB4_DIR / "data"
DADOS_REAIS = DATA_DIR / "dados_reais.csv"

SEMENTE_PADRAO = 20261103

CONDICOES = {
    "A": ("sem_cache", ["clean", "build", "--no-build-cache", "--no-configuration-cache"]),
    "B": ("com_cache", ["clean", "build", "--build-cache", "--no-configuration-cache"]),
}
# Opções comuns às duas condições: saída sem animação, para poder ler o
# resultado de cada tarefa (FROM-CACHE, UP-TO-DATE...) no log.
OPCOES_COMUNS = ["--console=plain"]

RE_RESUMO = re.compile(r"(\d+) actionable tasks?: (.+)")
RE_PARTE = re.compile(r"(\d+) (executed|from cache|up-to-date)")

COLUNAS_EXECUCOES = [
    "sessao", "modo", "par", "tentativa", "posicao_no_par", "ordem_execucao",
    "condicao", "nome_condicao", "inicio", "fim", "tempo_s", "codigo_saida",
    "status", "tarefas_acionaveis", "tarefas_executadas", "tarefas_from_cache",
    "tarefas_up_to_date", "log",
]
COLUNAS_PARES = [
    "par", "tempo_sem_cache", "tempo_com_cache", "diferenca", "ordem_execucao",
    "inicio_par", "tentativas", "status_sem_cache", "status_com_cache",
    "from_cache_com_cache",
]
COLUNAS_DADOS_REAIS = ["par", "tempo_sem_cache", "tempo_com_cache", "ordem_execucao"]


@dataclass
class Execucao:
    condicao: str
    inicio: str
    fim: str
    tempo_s: float
    codigo_saida: int
    log: Path
    tarefas: dict = field(default_factory=dict)
    status: str = ""


# ---------------------------------------------------------------- execução

def caminho_gradlew(projeto: Path) -> Path:
    gradlew = projeto / "gradlew.bat"
    if not gradlew.is_file():
        raise SystemExit(f"gradlew.bat não encontrado em {projeto}")
    return gradlew


def executar_gradle(projeto: Path, argumentos: list[str], log: Path) -> tuple[int, float, str, str]:
    """Roda o wrapper e devolve (código de saída, segundos, início, fim).

    O tempo cobre do início ao fim do processo gradlew.bat, como definido no
    cenário. A saída vai direto para o arquivo de log para não pesar na medição.
    """
    comando = [str(caminho_gradlew(projeto)), *argumentos]
    with open(log, "w", encoding="utf-8", errors="replace") as saida:
        saida.write(f"$ {' '.join(comando)}\n\n")
        saida.flush()
        inicio = datetime.now().isoformat(timespec="milliseconds")
        t0 = time.perf_counter()
        processo = subprocess.run(comando, cwd=projeto, stdout=saida, stderr=subprocess.STDOUT)
        segundos = time.perf_counter() - t0
        fim = datetime.now().isoformat(timespec="milliseconds")
    return processo.returncode, segundos, inicio, fim


def executar_condicao(projeto: Path, condicao: str, log: Path, extras: list[str]) -> Execucao:
    _, argumentos = CONDICOES[condicao]
    codigo, segundos, inicio, fim = executar_gradle(projeto, [*argumentos, *OPCOES_COMUNS, *extras], log)
    execucao = Execucao(condicao, inicio, fim, round(segundos, 3), codigo, log)
    execucao.tarefas = ler_resumo_tarefas(log)
    execucao.status = validar_execucao(execucao)
    return execucao


# --------------------------------------------------------------- validação

def ler_resumo_tarefas(log: Path) -> dict:
    """Lê a linha 'N actionable tasks: X executed, Y from cache, Z up-to-date'."""
    texto = log.read_text(encoding="utf-8", errors="replace")
    resumo = {"acionaveis": None, "executed": 0, "from cache": 0, "up-to-date": 0}
    encontrados = RE_RESUMO.findall(texto)
    if not encontrados:
        return resumo
    total, partes = encontrados[-1]
    resumo["acionaveis"] = int(total)
    for quantidade, tipo in RE_PARTE.findall(partes):
        resumo[tipo] = int(quantidade)
    return resumo


def validar_execucao(execucao: Execucao) -> str:
    """Classifica a execução. Só 'ok' conta como observação válida.

    Além do código de saída, confere se o tratamento foi de fato aplicado:
    em A nenhuma tarefa pode vir do cache; em B ao menos uma tem de vir.
    """
    if execucao.codigo_saida != 0:
        return "falha_build"
    if execucao.tarefas["acionaveis"] is None:
        return "falha_resumo_ausente"
    from_cache = execucao.tarefas["from cache"]
    if execucao.condicao == "A" and from_cache > 0:
        return "invalida_cache_em_A"
    if execucao.condicao == "B" and from_cache == 0:
        return "invalida_sem_cache_em_B"
    return "ok"


# ------------------------------------------------------- ordem e ambiente

def sortear_ordens(n_pares: int, semente: int) -> list[str]:
    """Metade dos pares 'AB' e metade 'BA' (o extra, se ímpar, também sorteado)."""
    rng = random.Random(semente)
    ordens = ["AB"] * (n_pares // 2) + ["BA"] * (n_pares // 2)
    if n_pares % 2:
        ordens.append(rng.choice(["AB", "BA"]))
    rng.shuffle(ordens)
    return ordens


def rodar_texto(comando: list[str], cwd: Path | None = None) -> str:
    try:
        resultado = subprocess.run(comando, cwd=cwd, capture_output=True, text=True,
                                   encoding="utf-8", errors="replace", timeout=300)
        return (resultado.stdout + resultado.stderr).strip()
    except (OSError, subprocess.SubprocessError) as erro:
        return f"indisponível ({erro})"


def powershell(script: str) -> str:
    return rodar_texto(["powershell", "-NoProfile", "-Command", script])


def coletar_ambiente(projeto: Path) -> dict:
    return {
        "sistema": platform.platform(),
        "windows": powershell("(Get-CimInstance Win32_OperatingSystem | "
                              "Select-Object -ExpandProperty Caption) + ' ' + "
                              "(Get-CimInstance Win32_OperatingSystem).Version"),
        "processador": powershell("(Get-CimInstance Win32_Processor).Name"),
        "nucleos_logicos": powershell("(Get-CimInstance Win32_Processor).NumberOfLogicalProcessors"),
        "ram_gb": powershell("[math]::Round((Get-CimInstance Win32_ComputerSystem)"
                             ".TotalPhysicalMemory / 1GB, 1)"),
        "discos": powershell("Get-PhysicalDisk | ForEach-Object { $_.FriendlyName + ' (' + "
                             "$_.MediaType + ')' }"),
        "plano_energia": powershell("powercfg /getactivescheme"),
        "python": sys.version,
        "java": rodar_texto(["java", "-version"]),
        "gradle": rodar_texto([str(caminho_gradlew(projeto)), "--version"], cwd=projeto),
        # JDKs que o Gradle enxerga; o projeto compila com a toolchain, não com o JDK do launcher.
        "java_toolchains": rodar_texto([str(caminho_gradlew(projeto)), "-q", "javaToolchains",
                                        "--no-configuration-cache", "--console=plain"], cwd=projeto),
        "projeto_commit": rodar_texto(["git", "rev-parse", "HEAD"], cwd=projeto),
        "projeto_remoto": rodar_texto(["git", "remote", "get-url", "origin"], cwd=projeto),
        "projeto_alterado": rodar_texto(["git", "status", "--porcelain"], cwd=projeto) or "não",
    }


# ------------------------------------------------------------ armazenamento

class Armazenamento:
    """Grava cada linha assim que é produzida, para não perder dados se a coleta parar."""

    def __init__(self, modo: str):
        carimbo = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.sessao = f"{modo}_{carimbo}"
        self.pasta = DATA_DIR / modo / carimbo
        self.pasta.mkdir(parents=True, exist_ok=False)
        self.logs = self.pasta / "logs"
        self.logs.mkdir()
        self.execucoes = self._novo_csv("execucoes.csv", COLUNAS_EXECUCOES)
        self.pares = self._novo_csv("pares.csv", COLUNAS_PARES)

    def _novo_csv(self, nome: str, colunas: list[str]) -> Path:
        caminho = self.pasta / nome
        with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
            csv.writer(arquivo).writerow(colunas)
        return caminho

    def _anexar(self, caminho: Path, colunas: list[str], linha: dict) -> None:
        with open(caminho, "a", newline="", encoding="utf-8") as arquivo:
            csv.DictWriter(arquivo, fieldnames=colunas).writerow(linha)

    def salvar_metadados(self, metadados: dict) -> None:
        caminho = self.pasta / "metadados.json"
        caminho.write_text(json.dumps(metadados, ensure_ascii=False, indent=2), encoding="utf-8")

    def registrar_execucao(self, modo: str, par: int, tentativa: int, posicao: int,
                           ordem: str, execucao: Execucao) -> None:
        self._anexar(self.execucoes, COLUNAS_EXECUCOES, {
            "sessao": self.sessao, "modo": modo, "par": par, "tentativa": tentativa,
            "posicao_no_par": posicao, "ordem_execucao": ordem,
            "condicao": execucao.condicao, "nome_condicao": CONDICOES[execucao.condicao][0],
            "inicio": execucao.inicio, "fim": execucao.fim, "tempo_s": f"{execucao.tempo_s:.3f}",
            "codigo_saida": execucao.codigo_saida, "status": execucao.status,
            "tarefas_acionaveis": execucao.tarefas["acionaveis"],
            "tarefas_executadas": execucao.tarefas["executed"],
            "tarefas_from_cache": execucao.tarefas["from cache"],
            "tarefas_up_to_date": execucao.tarefas["up-to-date"],
            "log": execucao.log.relative_to(self.pasta).as_posix(),
        })

    def registrar_par(self, par: int, ordem: str, tentativas: int, a: Execucao, b: Execucao) -> None:
        self._anexar(self.pares, COLUNAS_PARES, {
            "par": par, "tempo_sem_cache": f"{a.tempo_s:.3f}", "tempo_com_cache": f"{b.tempo_s:.3f}",
            "diferenca": f"{a.tempo_s - b.tempo_s:.3f}", "ordem_execucao": ordem,
            "inicio_par": min(a.inicio, b.inicio), "tentativas": tentativas,
            "status_sem_cache": a.status, "status_com_cache": b.status,
            "from_cache_com_cache": b.tarefas["from cache"],
        })

    def exportar_dados_reais(self) -> Path:
        """Copia os pares válidos para data/dados_reais.csv sem sobrescrever nada."""
        if DADOS_REAIS.exists():
            raise FileExistsError(
                f"{DADOS_REAIS} já existe; os pares desta sessão estão em {self.pares}. "
                "Mova o arquivo antigo manualmente se quiser substituí-lo.")
        with open(self.pares, newline="", encoding="utf-8") as origem, \
                open(DADOS_REAIS, "x", newline="", encoding="utf-8") as destino:
            escritor = csv.DictWriter(destino, fieldnames=COLUNAS_DADOS_REAIS)
            escritor.writeheader()
            for linha in csv.DictReader(origem):
                escritor.writerow({c: linha[c] for c in COLUNAS_DADOS_REAIS})
        return DADOS_REAIS


# ------------------------------------------------------------------ coleta

def aquecer(projeto: Path, armazenamento: Armazenamento, rodadas: int, extras: list[str]) -> None:
    """Baixa dependências, preenche o cache local e aquece o daemon. Nada disso é medido."""
    print(f"Aquecimento: {rodadas} rodada(s) de B e A (não entram nos dados)")
    for i in range(1, rodadas + 1):
        for condicao in "BA":
            log = armazenamento.logs / f"aquecimento_{i:02d}_{condicao}.log"
            execucao = executar_condicao(projeto, condicao, log, extras)
            print(f"  aquecimento {i} {condicao}: {execucao.tempo_s:7.2f}s  {execucao.status}")
            if execucao.codigo_saida != 0:
                raise SystemExit(f"Build falhou no aquecimento; veja {log}")


def coletar(projeto: Path, modo: str, n_pares: int, semente: int, aquecimentos: int,
            max_tentativas: int, offline: bool) -> Armazenamento:
    if modo == "oficial" and DADOS_REAIS.exists():
        raise SystemExit(f"{DADOS_REAIS} já existe. Mova-o antes de uma nova coleta oficial.")

    extras = ["--offline"] if offline else []
    armazenamento = Armazenamento(modo)
    ordens = sortear_ordens(n_pares, semente)
    print(f"Sessão {armazenamento.sessao} -> {armazenamento.pasta}")
    print("Coletando informações do ambiente...")
    armazenamento.salvar_metadados({
        "sessao": armazenamento.sessao, "modo": modo, "projeto": str(projeto),
        "pares_planejados": n_pares, "semente": semente, "ordens_sorteadas": ordens,
        "aquecimentos": aquecimentos, "max_tentativas_por_par": max_tentativas,
        "comandos": {c: ["gradlew.bat", *args, *OPCOES_COMUNS, *extras]
                     for c, (_, args) in CONDICOES.items()},
        "inicio": datetime.now().isoformat(timespec="seconds"),
        "ambiente": coletar_ambiente(projeto),
    })

    aquecer(projeto, armazenamento, aquecimentos, extras)

    validos = descartados = 0
    for par, ordem in enumerate(ordens, start=1):
        for tentativa in range(1, max_tentativas + 1):
            resultado = {}
            for posicao, condicao in enumerate(ordem, start=1):
                log = armazenamento.logs / f"par{par:02d}_t{tentativa}_{posicao}{condicao}.log"
                execucao = executar_condicao(projeto, condicao, log, extras)
                armazenamento.registrar_execucao(modo, par, tentativa, posicao, ordem, execucao)
                resultado[condicao] = execucao
                if execucao.status != "ok":
                    break  # o par já está perdido; não gasta tempo com a outra condição
            if all(e.status == "ok" for e in resultado.values()) and len(resultado) == 2:
                a, b = resultado["A"], resultado["B"]
                armazenamento.registrar_par(par, ordem, tentativa, a, b)
                validos += 1
                print(f"[{par:2d}/{n_pares}] {ordem}  sem={a.tempo_s:7.2f}s  com={b.tempo_s:7.2f}s  "
                      f"d={a.tempo_s - b.tempo_s:+7.2f}s  from-cache={b.tarefas['from cache']}")
                break
            descartados += 1
            problemas = ", ".join(f"{c}={e.status}" for c, e in resultado.items() if e.status != "ok")
            print(f"[{par:2d}/{n_pares}] {ordem}  tentativa {tentativa} descartada ({problemas})")
        else:
            print(f"[{par:2d}/{n_pares}] desistindo após {max_tentativas} tentativas")

    print(f"\nPares válidos: {validos}/{n_pares}  |  tentativas descartadas: {descartados}")
    print(f"Execuções brutas: {armazenamento.execucoes}")
    print(f"Pares válidos:    {armazenamento.pares}")
    return armazenamento


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--projeto", type=Path, required=True, help="pasta do projeto com gradlew.bat")
    parser.add_argument("--modo", choices=["piloto", "oficial"], required=True)
    parser.add_argument("--pares", type=int, default=30)
    parser.add_argument("--semente", type=int, default=SEMENTE_PADRAO)
    parser.add_argument("--aquecimentos", type=int, default=2,
                        help="rodadas B+A antes da medição (default: 2)")
    parser.add_argument("--max-tentativas", type=int, default=3,
                        help="tentativas por par antes de desistir (default: 3)")
    parser.add_argument("--offline", action="store_true",
                        help="passa --offline às duas condições (dependências já baixadas)")
    args = parser.parse_args()

    projeto = args.projeto.resolve()
    caminho_gradlew(projeto)
    armazenamento = coletar(projeto, args.modo, args.pares, args.semente,
                            args.aquecimentos, args.max_tentativas, args.offline)
    if args.modo == "oficial":
        print(f"Exportado: {armazenamento.exportar_dados_reais()}")


if __name__ == "__main__":
    main()
