# Lab05 — Sprint 01 · Participante C: Plano de Análise

**Escopo:** valida a seção 10 de
[`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md) e fecha a decisão **D8**
(estratégia estatística).
**Data:** 19/11/2026.

O plano está implementado em
[`../Sprint01/coleta/analise.py`](../Sprint01/coleta/analise.py) e
[`estatistica.py`](../Sprint01/coleta/estatistica.py), e foi **executado sobre
os dados do piloto**. Essa é a diferença entre um plano de análise e uma
intenção: rodar o plano prova que cada métrica tem caminho do dado bruto até o
número, sem passo faltando.

---

## 1. Decisão D8 — a estratégia estatística

Aprovo a estratégia da seção 10, com três ajustes. A lógica central — medianas,
testes não paramétricos, agregação antes do teste — está certa para dados de
latência, que são assimétricos e têm cauda longa.

| Item | Decisão |
| --- | --- |
| Descritiva | Mediana, p95, IQR e IQR/mediana; média só como complemento |
| Três resolvedores | **Friedman** sobre as unidades de inferência |
| Par a par | **Wilcoxon** pareado bilateral, com correção de **Holm** |
| Intervalos | **Bootstrap por conglomerado**, 10.000 réplicas, intervalo percentil |
| α | 0,05, sempre acompanhado do tamanho de efeito e do IC |
| Primárias | H-a e H-c; o resto é secundário ou exploratório |

### Ajuste 1 — sem SciPy e sem pandas **[Ajustado]**

A seção 7.4 cita pandas. Implementei tudo com a biblioteca padrão, pelo mesmo
motivo do Lab04 deste repositório: o ambiente de **coleta** precisa do
dnspython, mas o de **análise** não precisa de nada, e assim qualquer
integrante refaz os números sem montar ambiente. A CI do grupo também não faz
`pip install`.

**Isso só vale se os números estiverem certos.** Conferi contra o SciPy (usado
apenas na verificação, não na entrega):

| Função | Casos conferidos | Resultado |
| --- | --- | --- |
| Qui-quadrado (cauda) | gl = 1 a 5, nos valores de tabela a 5% | 5/5 idênticos |
| Wilcoxon pareado | n = 5 a 30, exato e aproximação normal | 5/5 idênticos |
| Friedman | k = 3, n = 6 e n = 20 | 2/2 idênticos |
| Holm | caso montado à mão, com empate forçando monotonicidade | confere |

### Ajuste 2 — o p95 tem um piso de observações **[Ajustado]**

Reportar p95 com 45 observações por célula, como no piloto, descreveria as
duas ou três consultas mais lentas do sorteio. A implementação devolve `—`
abaixo de 100 sucessos na célula, e o relatório diz isso em vez de omitir em
silêncio.

### Ajuste 3 — comparação com uma única unidade é descritiva, não some **[Ajustado]**

Quando só existe uma unidade de inferência — o que acontece numa coleta curta,
porque C1, C2 e E-2 agregam por janela de 6 h — não há o que reamostrar nem o
que parear entre unidades. A primeira versão do meu código simplesmente
devolvia `None`, e a tabela inteira do E-2 **desaparecia do relatório** sem
explicação. Corrigido: a linha aparece com a descritiva e com traço no IC e no
p, mais uma nota dizendo por quê. Resultado ausente precisa ser visível.

---

## 2. A agregação é o passo que não pode ser pulado

A seção 10.2 está correta e é a parte mais importante do plano. As consultas
**não são independentes**: as do mesmo nome se repetem em centenas de rodadas,
e as da mesma rodada compartilham o estado da rede naquele instante. Tratar
cada consulta como observação estreitaria os intervalos e inflaria a
significância.

O plano resolve em três passos, todos implementados:

1. **Pareamento dentro do bloco** (rede × rodada × posição), que remove o
   efeito comum da rodada.
2. **Agregação pela unidade de inferência**: o **nome** em C3, a **janela de
   6 h** em C1, C2 e E-2.
3. **Redes analisadas separadamente**, cada uma como réplica.

### Por que a unidade muda conforme a condição

Em C3 os domínios são uma amostra de uma população real e o interesse é
generalizar para outros domínios — a unidade é o nome. Em C1 e C2 os nomes são
réplicas sintéticas da mesma zona; tratá-los como unidades seria
pseudorreplicação, porque ali a variabilidade que interessa é a do tempo.

### O piloto mostrou que isso não é formalidade

No piloto, o par 1.1.1.1 × 8.8.8.8 em C3 deu:

- **diferença mediana** de −12,4 ms, IC 95% [−15,3; −8,0], claramente a favor
  do 1.1.1.1;
- **Wilcoxon sobre as medianas por nome**: p = 0,30, sem significância.

Não é contradição nem erro. Doze dos quinze nomes favorecem o 1.1.1.1, mas os
três que favorecem o 8.8.8.8 — `rfc-editor.org`, `gnu.org`, `postgresql.org`,
todos da cauda longa — perdem por margens enormes (+56, +146 e +217 ms). O
Wilcoxon pesa por posto, e esses três carregam os maiores postos.

As duas estatísticas respondem a perguntas diferentes: "quanto mais rápido, no
conjunto das consultas" e "em quantos nomes mais rápido". **As duas vão no
relatório, lado a lado.** Reportar só uma seria escolher a resposta que agrada.

É também um indício de que a hipótese da seção 9.7 tem base: domínios da cauda
longa são mais sujeitos a ausência de cache, e é ali que a vantagem se inverte.
Com três rodadas não dá para afirmar isso — é o que C1 e a coleta de sete dias
vão testar.

---

## 3. O que já roda e o que falta

| Seção | Item | Situação |
| --- | --- | --- |
| 10.1 | Descritiva por tratamento | **roda** |
| 10.2 | Unidades de inferência | **roda** |
| 10.3 | Friedman, Wilcoxon, Holm | **roda** |
| 10.4 | Classificação de falhas | **parcial**: a censura em 2.000 ms e a contagem por tipo rodam; as regras de exclusão (falha da rede local, falha do domínio) precisam de mais de uma rede para valer |
| 10.5 | Bootstrap por conglomerado | **roda** |
| 10.6 | Análises de sensibilidade | **não roda**: precisam de coleta longa. O campo `s_desde_ultima_consulta`, que a primeira delas usa, já é gravado |
| 10.7 | Ameaças à validade | texto do Participante A; validado |

### Gráficos (seção 10.1) **[Pendente]**

A seção pede ECDF por tratamento, boxplot por faixa horária e série temporal
da mediana por rodada. Não implementei na Sprint 01, por uma razão de ordem:
com uma única janela de 6 h, dois dos três gráficos não têm o que mostrar.
Entram na Sprint 02, junto com a coleta longa. O repositório já tem precedente
de SVG escrito à mão, sem dependências, no `Lab4/src/graficos.py`.

---

## 4. Hipóteses primárias

Mantenho a restrição da seção 10.3: **apenas H-a e H-c** são primárias. Com
três resolvedores, três condições de cache, cinco combinações de protocolo e
conexão e quatro faixas horárias, o número de comparações possíveis é grande o
bastante para produzir achados por acaso. O resto do que for calculado entra
como secundário ou exploratório, e o relatório dirá isso.

---

## 5. Limites

- **O plano foi exercitado com 3 a 16 rodadas de uma rede, numa madrugada.**
  Ele fecha; não conclui nada.
- **O bootstrap foi conferido por cobertura em dado simulado**, não por estudo
  de cobertura formal. Para intervalo percentil com algumas dezenas de
  conglomerados isso é o usual, mas é uma suposição, não uma prova.
- **A correção de Holm supõe que a família de comparações esteja declarada
  antes.** Se o grupo acrescentar comparações depois de ver os dados, a
  correção deixa de valer e o relatório precisa dizer isso.
- **Modelo linear misto (a alternativa da seção 10.3) não foi implementado.**
  Continua opcional e, como está escrito ali, só deve ser adotado se o grupo
  dominar a técnica.
