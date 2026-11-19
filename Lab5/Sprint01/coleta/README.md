# Lab05 · Sprint 01 — Instrumentação e coleta

Scripts do **Participante C**. O que cada decisão significa está em
[`../../Docs/PlanoDeInstrumentacao.md`](../../Docs/PlanoDeInstrumentacao.md);
aqui é só como rodar.

## Montar o ambiente

```bash
cd Lab5
python3 -m venv .venv
.venv/bin/pip install -r Sprint01/coleta/requirements.txt
.venv/bin/python Sprint01/coleta/ambiente.py
```

O último comando precisa terminar com `Ambiente aprovado para a coleta`. Se
reclamar de TLS 1.3, o Python é o do sistema (macOS usa LibreSSL): instale um
com OpenSSL, por Homebrew, pyenv ou python.org. **Não contorne este aviso** —
o piloto 2 mostrou que o TLS 1.2 infla o handshake do DoT e a sua rede
deixaria de ser comparável com as outras.

## Antes de coletar: a ficha da rede

```bash
.venv/bin/python Sprint01/coleta/validar_rede.py --rede-id SUA-REDE \
    --padrao padrao-gateway=192.168.0.1 \
    --saida Sprint01/dados/rede_SUA-REDE.json
```

Descobre quem resolve de verdade por trás do resolvedor padrão, procura
interceptação da porta 53 e classifica a rede em (a), (b) ou (c), como manda a
seção 9.5. **Rode antes da coleta e uma vez por dia durante ela.**

Sem `--padrao`, ele usa os nameservers configurados no sistema. Vale conferir:
nesta máquina o sistema só tem nameserver IPv6, enquanto o gateway atende em
IPv4 — são resolvedores diferentes, e é preciso dizer qual você mediu.

> A ficha gravada **não** contém endereço IP nenhum, só o número do AS e a
> organização. O `--mostrar-ips` existe para depurar; essa saída não se
> versiona.

## Coletar

```bash
# rodada única, para conferir que tudo funciona
.venv/bin/python Sprint01/coleta/coletor.py --rede-id SUA-REDE --rodadas 1

# coleta de 7 dias, a cada 30 minutos
.venv/bin/python Sprint01/coleta/coletor.py --rede-id SUA-REDE \
    --rodadas 336 --intervalo 1800 \
    --padrao padrao-gateway=192.168.0.1 \
    --zona dns-lab.exemplo.br
```

No macOS, rode dentro de `caffeinate -i` para a máquina não hibernar.

| Opção | Para que serve |
| --- | --- |
| `--rede-id` | identificador curto da rede; vai em toda linha do CSV |
| `--padrao id=ip` | resolvedor padrão; **pode repetir** |
| `--zona` | zona do grupo; sem ela, C1 e C2 não são coletadas (pendência D1) |
| `--dominios arquivo` | lista de C3, um por linha; sem ela, usa 15 domínios de piloto |
| `--semente` | ordem dos tratamentos; sem ela, sorteia e registra |

O CSV é gravado **ao fim de cada rodada**, então uma coleta interrompida não
se perde.

## Analisar

```bash
python3 Sprint01/coleta/analise.py Sprint01/dados/piloto_c.csv \
    --md Sprint01/dados/analise_piloto_c.md
```

A análise roda **sem instalar nada** — só biblioteca padrão. O ambiente com
dnspython é necessário apenas para coletar.

## Os arquivos

| Arquivo | O que é |
| --- | --- |
| `requirements.txt` | versões fixadas da coleta (decisão D7) |
| `ambiente.py` | verifica a pilha e **aborta** se não servir |
| `medidor.py` | as primitivas de medição: é o único lugar que cronometra consulta |
| `coletor.py` | monta a rodada, embaralha, executa e grava o CSV |
| `validar_rede.py` | o procedimento da seção 9.5 |
| `estatistica.py` | mediana, percentil, Wilcoxon, Friedman, Holm e bootstrap, do zero |
| `analise.py` | o plano da seção 10 aplicado ao CSV |

## Conferência contra o SciPy (opcional)

```bash
.venv/bin/pip install scipy
.venv/bin/python Sprint01/coleta/conferir_estatistica.py
```

Compara o `estatistica.py` com `scipy.stats`. Não é necessário para rodar nada
— serve para mostrar que a implementação própria está certa.
