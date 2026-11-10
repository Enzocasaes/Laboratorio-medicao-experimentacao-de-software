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
python src/erro_tipo_i.py      # Q1: 10.000 conjuntos sob H0 (precisa de requirements-q1.txt)
python src/comparacao_erro.py   # compara o erro tipo I dos dois testes na Q1 (G3)
python src/violacao.py       # Q3: erro tipo I com os pressupostos violados (~2,5 min)
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
| [src/erro_tipo_i.py](src/erro_tipo_i.py) | Sprint 2 | Q1: simula 10.000 conjuntos em dois cenários e registra qual H0 vale em cada um |
| [src/comparacao_erro.py](src/comparacao_erro.py) | Sprint 2 | compara as taxas da Q1: Wilson, diferença pareada e McNemar; só chama de erro tipo I a taxa de um teste cuja H0 vale |
| [src/violacao.py](src/violacao.py) | **Integrante 3** | Q3: erro tipo I com normalidade violada e amostra pequena |
| [src/graficos.py](src/graficos.py) | **Integrante 3** | G1, G2 e G3 em SVG, desenhados sem dependências |
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

As sete seções seguem a ordem pedida no enunciado. **Estão prontas** a 1
(cenário), a 2 (G1), a 3 (G2), a 4 (G3, Sprint 02) e a 6 (tabela dos dados
reais); a 5 (G4) e a conclusão aparecem marcadas como pendentes, para a página
não dar a impressão de que já existem.

| Gráfico | O que responde | Como |
|---|---|---|
| **G1** | com que dados estamos lidando? | seis histogramas: os dois grupos reais, as diferenças reais e os três cenários simulados |
| **G2** | como um teste decide? | a distribuição da estatística sob H0, a região de rejeição e o p-valor desenhado como **área** |
| **G3** | com que frequência cada teste acusa efeito que não existe? | taxa de rejeição dos dois testes nos 10.000 conjuntos de cada cenário da Q1, com IC de Wilson, a linha de 5% e a faixa do acaso. O painel simétrico compara o erro tipo I; o assimétrico é análise de sensibilidade, e a barra listrada (Wilcoxon, H0 falsa) não é erro tipo I — ver [docs/comparacao_taxas_erro.md](docs/comparacao_taxas_erro.md) |

### Por que SVG escrito à mão

O resto do Lab04 roda só com a biblioteca padrão. Trazer Matplotlib apenas para
desenhar faria o dashboard exigir instalação, e o enunciado pede que ele abra
com um único comando. SVG é texto, o navegador já sabe desenhá-lo, e o
resultado é um HTML que funciona offline.

### De onde vêm os números

O dashboard **não recalcula teste nenhum**: lê `data/dados_reais.csv`,
`data/resultados_reais.csv`, `data/simulacao/cenarios.csv` e
`data/simulacao/resultados_exemplo.csv` e, para o G3, os p-valores da Q1
(`data/pvalores_q1*.csv`, conferidos contra `data/resultados_q1.csv`). As duas únicas contas feitas ali são
os valores críticos de G2 — o t de 95% e o menor W⁺ que cai na região de
rejeição —, e mesmo essas saem de `src/distribuicoes.py`, para o gráfico não
discordar do teste.

### Antes de entregar

O link do **GitHub Projects** precisa ser colado na constante `PROJECTS`, no
topo de [src/dashboard.py](src/dashboard.py). Enquanto estiver vazio, o
dashboard mostra o aviso no cabeçalho e o comando avisa no terminal.

## Violação de pressupostos (Q3)

```bash
python src/violacao.py
```

A Q3 pede para repetir a Q1 e a Q2 em pelo menos uma situação que viole os
pressupostos do teste paramétrico. Este módulo cobre **a metade que repete a
Q1** — a taxa de erro tipo I — em nove células: três cenários × n = 5, 10 e 30,
com 10.000 conjuntos cada.

| Cenário | O que viola |
|---|---|
| `normal` | nada: é a referência |
| `cauda_pesada` | normalidade — t de Student com 3 gl |
| `contaminada` | normalidade — 10% das observações com 5× o desvio |

**Os três são simétricos de propósito.** Só assim as duas H0 valem ao mesmo
tempo, e só assim as duas taxas são erro tipo I e podem ser comparadas lado a
lado. O caso assimétrico — em que a H0 do Wilcoxon é falsa e a taxa dele deixa
de ser erro tipo I — já está coberto pelo bootstrap centralizado da Q1.

### O que saiu

Com **n = 30**, nenhuma das duas violações tira os testes do nível: o t fica
entre 4,54% e 4,95%, o Wilcoxon entre 4,60% e 4,82%. Cauda pesada e outliers
custam **poder**, não calibração.

O que muda o quadro é a **amostra pequena**. Com n = 5 o Wilcoxon exato cai
para 3,07%–3,32% nos três cenários, e não por acaso: existem apenas 2⁵ = 32
somas de postos possíveis, e a cauda mais próxima de 5% por baixo vale
1/32 ≈ 3,125%. O teste não consegue gastar o resto do α — erra menos do que
poderia, e paga isso em poder.

O número é um fato da distribuição, não da simulação, e
[tests/test_violacao.py](tests/test_violacao.py) confere os dois lados: que
`wilcoxon_p_exato(15, 5)` vale exatamente 1/32 e que a taxa medida não passa
desse teto.

### O que falta, e de quem é

Esta é a metade da Q3 que repete a Q1. A outra metade repete a **Q2** — o
poder nestes mesmos cenários — e pertence às Issues #109 e #110, que são do
Integrante 2 e alimentam o G4. A função `gerar_diferencas(cenario, n, efeito,
rng)` já recebe o efeito em unidades de desvio: rodar com efeito maior que zero
dá as amostras do estudo de poder, sem reimplementar gerador nenhum.

## Testes automatizados

```bash
python -m unittest discover -s tests -v
```

157 testes, sem instalar nada (os 5 de `tests/test_erro_tipo_i.py` se pulam sem NumPy). Cobrem as distribuições contra valores de tabela
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
| `data/resultados_q1.csv`, `data/pvalores_q1*.csv` | Q1: agregado por cenário × teste e os p-valores das 10.000 repetições |
| `docs/resultados_q1.md` | relatório gerado da Q1 (Issue #107) |
| `data/comparacao_taxas_erro.csv` | taxas da Q1 por cenário × teste, com IC de Wilson e se a H0 do teste vale |
| `data/mcnemar_q1.csv` | tabela 2×2 das decisões, diferença pareada e McNemar |
| `docs/comparacao_taxas_erro.md` | relatório gerado da comparação (Issue #108) |
| `data/resultados_q3.csv` | Q3: taxa de erro tipo I por cenário × n × teste, com IC de Wilson |
| `data/mcnemar_q3.csv` | Q3: tabela 2×2 das decisões em cada célula |
| `docs/violacao_pressupostos.md` | relatório gerado da Q3 (Issues #111 e #112) |
| `dashboard/index.html` | o dashboard completo, em arquivo único |

Os CSVs são a interface para o dashboard: ele lê arquivo, não importa função.

## Reprodutibilidade

A simulação é determinística — a semente padrão é 42 e fica registrada no
relatório. Rodar `python src/simulacao.py --semente 42 --repeticoes 2000`
reproduz exatamente os números de [docs/simulacao.md](docs/simulacao.md).
