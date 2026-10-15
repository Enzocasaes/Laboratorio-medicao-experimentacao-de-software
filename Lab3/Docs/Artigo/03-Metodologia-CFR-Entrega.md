# 3. Metodologia — heurística de release corretiva e CFR (b)

> Subseção da Metodologia (Lab03S02) sobre a variante (b) do change failure
> rate. Os números de resultado (F1 de cada versão, versão escolhida) **não**
> estão aqui: vêm de `Lab3/Sprint01/docs/validacao-manual.md` e de
> `data/raw/cfr_entrega.json`, e entram no artigo quando a rotulagem humana
> estiver concluída. Os trechos marcados como ⟨…⟩ são preenchidos a partir
> desses arquivos.

### 3.x Change failure rate, variante (b): proxy de entrega

A variante (a) do CFR mede falhas de *pipeline*. A variante (b) tenta se
aproximar de falhas em produção: uma release que precisou ser corrigida logo
depois de publicada. Uma release R é considerada **falha** quando o deploy
seguinte a R é uma **release corretiva** publicada em até 7 dias. O CFR do
repositório é a razão entre as releases que falharam e as releases avaliadas.

**Release anterior e release seguinte.** Usamos a mesma sequência de deploys
do lead time: releases com `draft = false` e `prerelease = false`, ordenadas
por `published_at`. Só a release imediatamente seguinte é examinada. Uma
release corretiva publicada depois de outra release corrige, em princípio, a
mais recente das duas, e não R.

**Censura.** Releases publicadas nos últimos 7 dias da janela não podem ser
avaliadas, porque a correção poderia sair depois do fim da observação. Essas
releases ficam fora do denominador. Também ficam fora, e são contadas à parte,
as releases cuja seguinte saiu no prazo mas não pôde ser classificada (por
exemplo, quando a comparação entre as tags falha porque uma tag foi apagada).
Repositórios sem nenhuma release avaliada ficam com o CFR (b) ausente, e não
zero.

**Heurística de release corretiva.** Uma release corretiva é aquela cujo
objetivo principal é corrigir um defeito recente. A heurística compara R com a
release anterior e usa dois sinais:

1. *Incremento de versão.* As tags são lidas como versões numéricas (aceitando
   prefixos como `v`, `release-` e `pacote@`). Registramos qual componente
   mudou: *major*, *minor*, *patch*, nenhum (só o sufixo, como em
   `1.2.3-beta → 1.2.3`) ou um retrocesso (correção numa linha de versões mais
   antiga). Tags sem versão numérica, ou de pacotes diferentes num monorepo,
   ficam sem incremento.
2. *Mensagens dos commits* entre as duas releases, obtidas pela comparação
   `compare/{anterior}...{R}` da API (a mesma do lead time). Classificamos
   cada commit pelo título (a primeira linha da mensagem ou, num *merge* de
   *pull request*, o título do PR) como *revert* (inclui *rollback*),
   *hotfix*, *fix* (inclui *bugfix*, *regression*, *crash* e identificadores
   de vulnerabilidade CVE/GHSA), atualização de dependência, preparação de
   release ou outro. Correções de documentação, de digitação, de *lint*, de
   formatação ou de testes contam como "outro", porque não corrigem defeito
   em versão publicada.

Combinamos esses sinais em versões da heurística, todas calculadas para todas
as releases e avaliadas contra o consenso da amostra-ouro:

| Versão | Regra |
|---|---|
| v1-semver-patch | corretiva se a versão muda apenas no *patch* |
| v2-commits-fix | corretiva se há ao menos um commit *revert*, *hotfix* ou *fix* |
| v3-patch-e-commits | as duas condições anteriores juntas (o exemplo do enunciado) |
| v4-maioria-corretiva | ao menos metade dos commits que alteram código (sem dependências e sem preparação de release) é *revert*, *hotfix* ou *fix*, e o *major* não muda |

A v4 operacionaliza o critério dado aos avaliadores ("objetivo principal da
release"), em que uma *minor* pode ser corretiva e um *patch* pode não ser.
Quando falta o sinal de que uma versão depende (tag sem versão numérica para
v1 e v3, comparação indisponível para v2, v3 e v4), ela não emite previsão, em
vez de prever "não corretiva".

⟨Tabela: versão, VP, FP, FN, VN, precisão, recall, F1 — de
`docs/validacao-manual.md`.⟩

⟨Versões acrescentadas no refinamento, com o padrão de erro que motivou cada
uma (de `processed/heuristica_erros.csv`).⟩

O CFR (b) do dataset usa a versão ⟨…⟩, a de maior F1 ⟨valor⟩. Como a escolha
foi feita na própria amostra-ouro, o F1 relatado tende a superestimar o acerto
da heurística no restante da amostra. Discutimos isso nas ameaças à validade.

**Rework rate.** Como métrica complementar (RQ 08), calculamos a proporção de
releases corretivas entre as releases classificadas da janela, com a mesma
versão da heurística. Diferentemente do CFR (b), ela não exige que a correção
saia em até 7 dias nem atribui a falha à release anterior.
