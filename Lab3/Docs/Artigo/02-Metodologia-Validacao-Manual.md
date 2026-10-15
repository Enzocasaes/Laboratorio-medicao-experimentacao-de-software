# 2. Metodologia — protocolo de validação manual

> Subseção da Metodologia (Lab03S02) sobre a validação manual. Os números de
> resultado (kappa, consenso, F1) **não** estão aqui: eles vêm de
> `Lab3/Sprint01/docs/validacao-manual.md`, gerado por `npm run validacao`, e
> entram no artigo quando a rotulagem humana estiver concluída. Os trechos
> marcados como ⟨…⟩ são preenchidos a partir desse relatório.

### 2.x Validação manual (amostra-ouro)

As métricas deste estudo dependem de *proxies*: tratamos uma release publicada
como um deploy e identificamos releases corretivas com uma heurística
automática. Para estimar o quanto essas aproximações se afastam do julgamento
humano, construímos uma **amostra-ouro**, isto é, um subconjunto rotulado
manualmente e usado como referência.

**Sorteio.** Sorteamos 60 repositórios da amostra final (repositórios com status
`included` depois de todos os filtros do funil) e, em cada um, 5 releases entre
as que contam como deploy na definição principal (`draft = false`,
`prerelease = false`, publicadas dentro da janela). O sorteio é feito pelo
próprio pipeline com um gerador pseudoaleatório de semente fixa (mulberry32,
semente 42) e embaralhamento de Fisher-Yates, aplicado à população em ordem
canônica (posição no ranking de estrelas e, em caso de empate, nome). Por isso
o resultado depende só da semente e do conteúdo do dataset. O arquivo
`data/raw/amostra_ouro.json` registra o critério, o algoritmo, o tamanho da
população, o *hash* SHA-256 dos arquivos de entrada e a lista de sorteados. A
cada execução da validação, o sorteio é refeito e comparado com a planilha
gravada, o que detecta qualquer alteração dos dados depois do sorteio.

**Rotulagem independente.** Cada um dos três integrantes recebe uma planilha
própria, com links diretos para cada repositório e release, e a preenche
sozinho, sem consultar os demais e sem acesso à saída da heurística. Pela
mesma razão, as planilhas não trazem nenhuma pré-classificação automática. São
rotuladas três dimensões:

| Dimensão | Unidade | Categorias |
|---|---|---|
| (i) Tipo do projeto | repositório (60) | biblioteca/framework, aplicação/serviço, ferramenta CLI, outro |
| (ii) As releases representam entregas reais ao usuário? | repositório (60) | sim, não, incerto |
| (iii) A release é corretiva? | release (300) | sim, não |

A dimensão (iii) é decidida a partir das *release notes* e da lista de
commits de cada release.

**Validação dos rótulos.** Antes de qualquer cálculo, o pipeline confere cada
planilha separadamente, sem alterá-la. Uma célula vazia conta como avaliação
**ausente**, e um valor fora das categorias conta como **inválido**. Um
repositório com valores diferentes em linhas diferentes da mesma planilha é
considerado **inconsistente**. Nos três casos a unidade fica sem rótulo daquele
avaliador. Também são registradas linhas ausentes, duplicadas ou fora da
amostra. ⟨Quantidade de problemas encontrados por avaliador e como foram
corrigidos pelos próprios avaliadores.⟩

**Concordância.** Medimos a concordância entre os três avaliadores com o kappa
de Fleiss, separadamente para cada dimensão. O kappa corrige a concordância
esperada ao acaso: para cada unidade *i*, *P_i* é a proporção de pares de
avaliadores que concordam; *P̄* é a média dos *P_i*; *P̄ₑ* = Σ *p_j²*, em que
*p_j* é a proporção de todas as avaliações atribuídas à categoria *j*; e
κ = (*P̄* − *P̄ₑ*) / (1 − *P̄ₑ*). A fórmula exige o mesmo número de avaliações por
unidade. Por isso adotamos a análise de **casos completos**: entram apenas as
unidades com rótulo válido dos três avaliadores, e as demais são relatadas como
excluídas. Quando todas as avaliações de uma dimensão caem numa única
categoria, *P̄ₑ* = 1 e o kappa não é definido. Nesse caso relatamos a situação
em vez de um valor. A implementação reproduz `fleiss_kappa` do statsmodels
(diferença menor que 10⁻¹⁴ em 200 casos de teste). Interpretamos os valores
pela escala de Landis e Koch (1977).

⟨Tabela: dimensão, unidades válidas/total, *P̄*, *P̄ₑ*, κ, interpretação.⟩

**Consenso.** Os casos divergentes são resolvidos pelo seguinte protocolo de
desempate:

1. três rótulos iguais: consenso por unanimidade;
2. dois contra um: consenso por maioria simples. Esses casos são listados
   para revisão em reunião e podem ser alterados por ela;
3. três rótulos diferentes, ou algum rótulo ausente ou inválido: nenhum
   rótulo é atribuído automaticamente. O caso é decidido em reunião dos três
   integrantes, e a decisão é registrada com justificativa, participantes e
   data.

O arquivo de consenso preserva os rótulos originais de cada avaliador e
registra, para cada unidade, o rótulo final, o método (unanimidade, maioria ou
reunião) e se a decisão foi automática ou humana. ⟨Quantidade de unidades
resolvidas por método e de casos sem consenso, por dimensão.⟩

**Avaliação da heurística de release corretiva.** Comparamos a classificação
automática de cada release sorteada com o rótulo de consenso da dimensão (iii),
tomando "corretiva" como a classe positiva. Calculamos a precisão (das releases
que a heurística marcou como corretivas, quantas o consenso confirma), o
*recall* (das releases corretivas pelo consenso, quantas a heurística
encontrou) e o F1, a média harmônica das duas. Releases sem consenso ou sem
previsão ficam fora do cálculo e são contadas à parte. Seguindo o enunciado,
uma versão da heurística com F1 abaixo de 0,70 é refinada a partir dos falsos
positivos e falsos negativos e depois reavaliada. Cada versão testada é
relatada. ⟨Tabela: versão da heurística, VP, FP, FN, VN, precisão, recall, F1.⟩

O tipo do projeto obtido por consenso é usado como fator na RQ 06. A validação
da heurística sustenta a RQ 03 (b) e a discussão de validade de construto.
