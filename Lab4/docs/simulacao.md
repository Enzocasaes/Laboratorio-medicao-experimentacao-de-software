# Simulação e comparação dos dois testes

**Lab04 — Issue #98: geração dos dados simulados, testes e p-valores**

> Arquivo **gerado** por `python src/simulacao.py`. Não edite à mão:
> rode o comando de novo.

## Parâmetros

| Item | Valor |
|---|---|
| Semente | 42 |
| Repetições por célula | 2000 |
| Nível de significância | 0.05 |
| Desvio-padrão σ | 0.3934 s (o das diferenças reais) |
| Tamanhos de amostra | 10, 30, 50 |
| Efeitos (em unidades de σ) | 0.0, 0.1, 0.3, 0.5 |

Os três cenários têm a **mesma média e o mesmo desvio**; só a forma da
distribuição muda. Assim, qualquer diferença de poder entre eles vem do
formato, e não da escala.

| Cenário | Forma | Por que está aqui |
|---|---|---|
| `normal` | simétrica | é onde o teste t é o mais poderoso |
| `lognormal_deslocada` | assimétrica à direita (σ_log = 0.5) | formato típico de tempo |
| `contaminada` | 10% das observações com 5× o desvio | valores extremos |

## Exemplo interpretado

Uma amostra de cada cenário, com n = 30 (o tamanho real) e efeito
de 0.3σ. Os dados estão em `data/simulacao/cenarios.csv`.

| Cenário | Teste | Estatística | p-valor | Rejeita H0? | Centro | Efeito |
|---|---|---|---|---|---|---|
| normal | t pareado | 2.5793 | 0.0076 | sim | media = 0.2116 | d_z = 0.4709 |
| normal | Wilcoxon pareado | 348.0000 | 0.0082 | sim | Hodges-Lehmann = 0.2188 | rank-biserial = 0.4968 |
| lognormal_deslocada | t pareado | 2.0730 | 0.0236 | sim | media = 0.1729 | d_z = 0.3785 |
| lognormal_deslocada | Wilcoxon pareado | 309.0000 | 0.0595 | não | Hodges-Lehmann = 0.0936 | rank-biserial = 0.3290 |
| contaminada | t pareado | 0.8222 | 0.2088 | não | media = 0.0614 | d_z = 0.1501 |
| contaminada | Wilcoxon pareado | 328.0000 | 0.0249 | sim | Hodges-Lehmann = 0.0914 | rank-biserial = 0.4108 |

### O que este exemplo mostra

- **normal**: os dois rejeitam H0 (p = 0.0076 e 0.0082). Nada a destacar — é o caso em que a escolha do teste não muda a conclusão.
- **lognormal_deslocada**: os testes **discordam**. O t pareado rejeita H0 (p = 0.0236) e o Wilcoxon pareado não (p = 0.0595). Nos mesmos dados: a assimetria à direita puxa a média para cima, e o teste t responde a ela; o Wilcoxon trabalha com postos e não acompanha esse deslocamento.
- **contaminada**: os testes **discordam**. O Wilcoxon pareado rejeita H0 (p = 0.0249) e o t pareado não (p = 0.2088). Nos mesmos dados: os valores extremos inflam o desvio-padrão, e o t divide a média por ele; os postos quase não sentem os extremos, então o Wilcoxon preserva o poder.

É exatamente a situação que o laboratório quer expor: nos dados reais o
efeito é tão grande que os dois testes concordam, e só em dados simulados
com efeito moderado dá para ver que a escolha do teste muda a conclusão.

## Taxa de erro tipo I e poder

Cada linha é 2000 amostras. Com efeito 0 a coluna é a **taxa de erro
tipo I**, que deveria ficar perto de 0.05; com efeito maior que 0, é o **poder**.
O ± é o erro padrão de Monte Carlo: diferenças menores que ele são ruído da
própria simulação.

| Cenário | n | Efeito | Hipótese | t pareado | Wilcoxon |
|---|---|---|---|---|---|
| normal | 10 | 0.0σ | H0 | 0.054 ± 0.005 | 0.048 ± 0.005 |
| normal | 10 | 0.1σ | H1 | 0.081 ± 0.006 | 0.065 ± 0.005 |
| normal | 10 | 0.3σ | H1 | 0.212 ± 0.009 | 0.184 ± 0.009 |
| normal | 10 | 0.5σ | H1 | 0.420 ± 0.011 | 0.367 ± 0.011 |
| normal | 30 | 0.0σ | H0 | 0.051 ± 0.005 | 0.050 ± 0.005 |
| normal | 30 | 0.1σ | H1 | 0.130 ± 0.008 | 0.119 ± 0.007 |
| normal | 30 | 0.3σ | H1 | 0.493 ± 0.011 | 0.468 ± 0.011 |
| normal | 30 | 0.5σ | H1 | 0.846 ± 0.008 | 0.830 ± 0.008 |
| normal | 50 | 0.0σ | H0 | 0.052 ± 0.005 | 0.052 ± 0.005 |
| normal | 50 | 0.1σ | H1 | 0.177 ± 0.009 | 0.181 ± 0.009 |
| normal | 50 | 0.3σ | H1 | 0.682 ± 0.010 | 0.662 ± 0.011 |
| normal | 50 | 0.5σ | H1 | 0.968 ± 0.004 | 0.966 ± 0.004 |
| lognormal_deslocada | 10 | 0.0σ | H0 ⚠ | 0.022 ± 0.003 | 0.018 ± 0.003 |
| lognormal_deslocada | 10 | 0.1σ | H1 | 0.043 ± 0.005 | 0.034 ± 0.004 |
| lognormal_deslocada | 10 | 0.3σ | H1 | 0.148 ± 0.008 | 0.116 ± 0.007 |
| lognormal_deslocada | 10 | 0.5σ | H1 | 0.400 ± 0.011 | 0.337 ± 0.011 |
| lognormal_deslocada | 30 | 0.0σ | H0 ⚠ | 0.028 ± 0.004 | 0.011 ± 0.002 |
| lognormal_deslocada | 30 | 0.1σ | H1 | 0.097 ± 0.007 | 0.036 ± 0.004 |
| lognormal_deslocada | 30 | 0.3σ | H1 | 0.462 ± 0.011 | 0.272 ± 0.010 |
| lognormal_deslocada | 30 | 0.5σ | H1 | 0.920 ± 0.006 | 0.790 ± 0.009 |
| lognormal_deslocada | 50 | 0.0σ | H0 ⚠ | 0.038 ± 0.004 | 0.004 ± 0.001 |
| lognormal_deslocada | 50 | 0.1σ | H1 | 0.124 ± 0.007 | 0.025 ± 0.004 |
| lognormal_deslocada | 50 | 0.3σ | H1 | 0.702 ± 0.010 | 0.397 ± 0.011 |
| lognormal_deslocada | 50 | 0.5σ | H1 | 0.992 ± 0.002 | 0.943 ± 0.005 |
| contaminada | 10 | 0.0σ | H0 | 0.035 ± 0.004 | 0.036 ± 0.004 |
| contaminada | 10 | 0.1σ | H1 | 0.097 ± 0.007 | 0.101 ± 0.007 |
| contaminada | 10 | 0.3σ | H1 | 0.355 ± 0.011 | 0.361 ± 0.011 |
| contaminada | 10 | 0.5σ | H1 | 0.625 ± 0.011 | 0.659 ± 0.011 |
| contaminada | 30 | 0.0σ | H0 | 0.056 ± 0.005 | 0.054 ± 0.005 |
| contaminada | 30 | 0.1σ | H1 | 0.173 ± 0.008 | 0.210 ± 0.009 |
| contaminada | 30 | 0.3σ | H1 | 0.580 ± 0.011 | 0.792 ± 0.009 |
| contaminada | 30 | 0.5σ | H1 | 0.832 ± 0.008 | 0.984 ± 0.003 |
| contaminada | 50 | 0.0σ | H0 | 0.044 ± 0.005 | 0.048 ± 0.005 |
| contaminada | 50 | 0.1σ | H1 | 0.210 ± 0.009 | 0.290 ± 0.010 |
| contaminada | 50 | 0.3σ | H1 | 0.711 ± 0.010 | 0.926 ± 0.006 |
| contaminada | 50 | 0.5σ | H1 | 0.949 ± 0.005 | 1.000 ± 0.000 |

### O que a tabela mostra

- **normal** — erro tipo I: t em 0.051–0.054, Wilcoxon em 0.048–0.052 (nominal 0.05). Sob H1, o **teste t tem mais poder** em 5 das 9 células com efeito.
- **lognormal_deslocada** — erro tipo I: t em 0.022–0.038, Wilcoxon em 0.004–0.018 (nominal 0.05). Sob H1, o **teste t tem mais poder** em 9 das 9 células com efeito.
- **contaminada** — erro tipo I: t em 0.035–0.056, Wilcoxon em 0.036–0.054 (nominal 0.05). Sob H1, o **Wilcoxon tem mais poder** em 7 das 9 células com efeito.

Os três padrões, juntos, são o resultado principal da simulação:

1. Com diferenças **normais**, os dois controlam o erro e o teste t é
   ligeiramente mais poderoso — é o terreno dele.
2. Com diferenças **assimétricas**, os dois ficam conservadores, mas em graus
   muito diferentes. A hipótese de simetria do Wilcoxon cai por terra e o erro
   dele despenca bem abaixo do nominal; o do t também cai, porque com
   assimetria a própria estatística t deixa de seguir a distribuição t na
   cauda, mas bem menos. Quem é conservador demais paga em poder, e é o
   Wilcoxon que paga aqui.
3. Com **valores extremos**, a situação se inverte: o desvio-padrão infla, o
   t perde poder, e o Wilcoxon passa na frente com folga.

Ou seja, não existe "o melhor teste": existe o teste adequado ao formato das
diferenças. É por isso que a análise dos dados reais verifica a normalidade e a
simetria antes de interpretar, como está na seção 11 do cenário experimental.

⚠ = sob H0 neste cenário a distribuição **não é simétrica**, então a hipótese
nula do Wilcoxon (simetria em torno de 0) está violada. A taxa de erro dele
sair diferente de 0.05 aí é esperado, não é defeito: o teste t tem como H0
que a *média* é 0, e o Wilcoxon, que a *distribuição é simétrica*. São
hipóteses diferentes, e numa distribuição assimétrica elas não coincidem.

## Como refazer

```bash
cd Lab4
python src/simulacao.py --semente 42 --repeticoes 2000
```

Os números acima são determinísticos: a mesma semente dá exatamente os
mesmos dados. A conferência da implementação dos testes está em
`tests/` (`python -m unittest discover -s tests`).
