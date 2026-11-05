# Lab04 — Testes de Hipótese por Dentro

Compara o tempo de build do [Spring PetClinic](https://github.com/spring-projects/spring-petclinic)
com e sem o **Build Cache do Gradle**, num delineamento pareado de 30 pares, e
aplica o par de testes **P2**: teste **t pareado** e **Wilcoxon pareado**
(postos sinalizados), ambos unilaterais.

As decisões do experimento — pergunta, hipóteses, pressupostos, α, o que cada
teste deve reportar — estão em
[docs/cenario_experimental.md](docs/cenario_experimental.md) e não são
revisitadas aqui.

## Requisitos

**Python 3.10 ou superior, e nada além da biblioteca padrão.** Não há
`requirements.txt`: nem a coleta, nem os testes, nem a simulação importam
pacotes de terceiros. O SciPy é opcional e serve só para conferir os
p-valores (veja *Conferência*).

## Como rodar

```bash
cd Lab4

python src/descritiva.py     # médias, medianas, assimetria e extremos
python src/testes.py         # os dois testes nos 30 pares reais
python src/simulacao.py      # cenários simulados, erro tipo I e poder (~20 s)
python src/dashboard.py --abrir   # gera dashboard/index.html e abre no navegador
```

A coleta (`src/coleta.py`) só roda no Windows, com o projeto Java em disco; os
dados que ela produziu já estão versionados.

## O que cada módulo faz

| Arquivo | Responsável | O que é |
|---|---|---|
| [src/coleta.py](src/coleta.py) | Integrante 1 | executa os pares de build e grava os tempos |
| [src/descritiva.py](src/descritiva.py) | Integrante 1 | estatística descritiva, sem teste de hipótese |
| [src/distribuicoes.py](src/distribuicoes.py) | **Integrante 2** | t de Student, normal e a distribuição exata do Wilcoxon |
| [src/testes.py](src/testes.py) | **Integrante 2** | os dois testes, com p-valor, IC e tamanho de efeito |
| [src/simulacao.py](src/simulacao.py) | **Integrante 2** | gera os cenários e compara erro tipo I e poder |
| [src/graficos.py](src/graficos.py) | **Integrante 3** | G1 e G2 em SVG, desenhados sem dependências |
| [src/dashboard.py](src/dashboard.py) | **Integrante 3** | monta o HTML único do dashboard a partir dos CSVs |

### Por que as distribuições são implementadas aqui

O `statistics` da biblioteca padrão tem média, desvio e quantis, mas não tem
as distribuições acumuladas de que um p-valor depende. Como o laboratório se
chama "Testes de Hipótese **por Dentro**",
[src/distribuicoes.py](src/distribuicoes.py) implementa o que falta em vez de
importar de uma biblioteca:

- a **t de Student**, pela função beta incompleta regularizada (fração
  continuada de Lentz), usada no p-valor e no intervalo de confiança;
- a **distribuição exata de W+** do Wilcoxon, por contagem: sob H0, W+ é a
  soma de um subconjunto qualquer de `{1..n}`, e os `2ⁿ` subconjuntos são
  igualmente prováveis. Uma programação dinâmica conta quantos somam cada
  valor, e a cauda vira o p-valor — sem aproximação.

O p-valor exato só vale sem empates e sem zeros. Havendo qualquer um dos dois,
o módulo cai para a aproximação normal com correção de continuidade e de
empates, e **registra em `metodo` qual dos dois usou**, em vez de escolher em
silêncio.

## Resultados

**Dados reais** (`data/resultados_reais.csv`): as 30 diferenças são positivas,
com média de 27,24 s. Os dois testes rejeitam H0 com folga — `t(29) = 379,2`
(p ≈ 2·10⁻⁵⁵) e `W+ = 465`, o máximo possível, com p = 1/2³⁰ ≈ 9,3·10⁻¹⁰.

**Simulação** ([docs/simulacao.md](docs/simulacao.md)): como no dado real o
efeito é enorme, os dois testes concordam trivialmente e não dá para compará-los.
A simulação gera diferenças com a **mesma média e o mesmo desvio**, variando só
a forma da distribuição, e aí eles se separam:

| Cenário | Erro tipo I (t / W) | Quem tem mais poder |
|---|---|---|
| `normal` | 0,05 / 0,05 | teste t, por pouco |
| `lognormal_deslocada` | 0,02–0,04 / 0,004–0,02 | teste t, com folga |
| `contaminada` | 0,04–0,06 / 0,04–0,05 | **Wilcoxon**, com folga |

O ponto da simulação está no caso assimétrico: a H0 do teste t é que a **média**
é zero, e a do Wilcoxon é que a distribuição é **simétrica em torno de zero**.
Numa distribuição assimétrica essas duas hipóteses não coincidem, então a taxa
de erro do Wilcoxon despenca abaixo do nominal e ele perde poder. Com valores
extremos acontece o contrário: o desvio-padrão infla, o t perde poder e o
Wilcoxon passa na frente.

## Dashboard

```bash
python src/dashboard.py --abrir
```

Gera **[dashboard/index.html](dashboard/index.html)**: um arquivo único, que abre
com dois cliques, sem servidor e sem instalar nada. É a entrega final do
laboratório, e por isso cada gráfico vem com um texto curto dizendo o que
mostra e o que se conclui dele.

As sete seções seguem a ordem pedida no enunciado. **Na Sprint 01 estão
prontas** a 1 (cenário), a 2 (G1), a 3 (G2) e a 6 (tabela dos dados reais); a 4
e a 5 (G3 e G4) e a conclusão aparecem marcadas como pendentes, para a página
não dar a impressão de que já existem.

| Gráfico | O que responde | Como |
|---|---|---|
| **G1** | com que dados estamos lidando? | seis histogramas: os dois grupos reais, as diferenças reais e os três cenários simulados |
| **G2** | como um teste decide? | a distribuição da estatística sob H0, a região de rejeição e o p-valor desenhado como **área** |

### Por que SVG escrito à mão

O resto do Lab04 roda só com a biblioteca padrão. Trazer Matplotlib apenas para
desenhar faria o dashboard exigir instalação, e o enunciado pede que ele abra
com um único comando. SVG é texto, o navegador já sabe desenhá-lo, e o
resultado é um HTML que funciona offline.

### De onde vêm os números

O dashboard **não recalcula teste nenhum**: lê `data/dados_reais.csv`,
`data/resultados_reais.csv`, `data/simulacao/cenarios.csv` e
`data/simulacao/resultados_exemplo.csv`. As duas únicas contas feitas ali são
os valores críticos de G2 — o t de 95% e o menor W⁺ que cai na região de
rejeição —, e mesmo essas saem de `src/distribuicoes.py`, para o gráfico não
discordar do teste.

### Antes de entregar

O link do **GitHub Projects** precisa ser colado na constante `PROJECTS`, no
topo de [src/dashboard.py](src/dashboard.py). Enquanto estiver vazio, o
dashboard mostra o aviso no cabeçalho e o comando avisa no terminal.

## Testes automatizados

```bash
python -m unittest discover -s tests -v
```

100 testes, sem instalar nada. Cobrem as distribuições contra valores de tabela
(`t_cdf(2,262; 9) = 0,975`), os dois testes em casos montados à mão com o
resultado conferido no papel, e a reprodutibilidade da simulação.

Dois deles são conferências de calibração, e não de código: no cenário normal
sob H0, a taxa de erro tipo I tem de cair perto de 5% — se não cair, há um
p-valor errado em algum lugar.

### Conferência contra o SciPy (opcional)

```bash
python3 -m venv .venv && .venv/bin/pip install scipy
.venv/bin/python -m unittest discover -s tests
```

[tests/test_conferencia_scipy.py](tests/test_conferencia_scipy.py) compara a
estatística e o p-valor dos dois testes com `scipy.stats.ttest_rel` e
`scipy.stats.wilcoxon` — nos dados reais, em amostras pequenas, assimétricas e
com empates. Bate até a 10ª casa decimal. Sem o SciPy instalado, esses testes
se pulam e a suíte continua passando (é o que acontece na CI).

## Saídas geradas

| Arquivo | Conteúdo |
|---|---|
| `data/dados_reais.csv` | os 30 pares coletados (entrada de tudo) |
| `data/resultados_reais.csv` | os dois testes aplicados aos dados reais |
| `data/simulacao/cenarios.csv` | as diferenças do exemplo interpretado, uma por linha |
| `data/simulacao/resultados_exemplo.csv` | os dois testes em cada cenário do exemplo |
| `data/simulacao/poder_erro.csv` | erro tipo I e poder por cenário × n × efeito |
| `docs/simulacao.md` | relatório gerado, com parâmetros, tabelas e interpretação |
| `dashboard/index.html` | o dashboard completo, em arquivo único |

Os CSVs são a interface para o dashboard: ele lê arquivo, não importa função.

## Reprodutibilidade

A simulação é determinística — a semente padrão é 42 e fica registrada no
relatório. Rodar `python src/simulacao.py --semente 42 --repeticoes 2000`
reproduz exatamente os números de [docs/simulacao.md](docs/simulacao.md).
