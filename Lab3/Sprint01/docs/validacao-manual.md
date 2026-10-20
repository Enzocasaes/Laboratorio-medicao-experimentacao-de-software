# Validação manual — concordância, consenso e heurística corretiva

> Arquivo **gerado** por `npm run validacao` (src/validacao/index.js). Não edite à mão:
> rode o comando de novo.

Gerado em: 2026-10-20T20:27:40.075Z

**Situação: pendente.**

Parâmetros: semente 42, 60 repositórios, 5 releases por repositório, avaliadores enzo, caue, leo, limiar de F1 0,70.

## Amostra-ouro

- 60 repositórios e 300 releases.
- Reprodutibilidade do sorteio: **reproduzida** — o sorteio refeito com a semente 42 gera as mesmas 300 releases.

## Rotulagem por avaliador

| Avaliador | Situação | Tipo (válidos/esperados) | Entrega real | Corretiva | Problemas |
|---|---|---|---|---|---|
| enzo | completo | 60/60 | 60/60 | 300/300 | 0 |
| caue | completo | 60/60 | 60/60 | 300/300 | 0 |
| leo | completo | 60/60 | 60/60 | 300/300 | 0 |

## Concordância entre avaliadores (kappa de Fleiss)

| Dimensão | Unidades válidas | Excluídas | P observada | P esperada | κ de Fleiss | Interpretação (Landis & Koch) |
|---|---|---|---|---|---|---|
| tipo_do_projeto | 60/60 | 0 | 0,967 | 0,312 | 0,952 | quase perfeita |
| releases_sao_entrega_real | 60/60 | 0 | 0,967 | 0,914 | 0,611 | substancial |
| release_corretiva | 300/300 | 0 | 0,889 | 0,516 | 0,770 | substancial |

Procedimento: casos completos — só entram unidades com rótulo válido de **todos** os avaliadores;
rótulo vazio, fora das categorias ou inconsistente entre linhas do mesmo repositório conta como ausente.
A concordância observada é a média dos P_i de Fleiss, não a porcentagem simples de acordo.

## Consenso

| Dimensão | Unidades | Unanimidade | Maioria simples | Reunião | Sem consenso | Divergentes |
|---|---|---|---|---|---|---|
| tipo_do_projeto | 60 | 57 | 3 | 0 | 0 | 3 |
| releases_sao_entrega_real | 60 | 57 | 3 | 0 | 0 | 3 |
| release_corretiva | 300 | 250 | 50 | 0 | 0 | 50 |

Decisões de reunião: 0 registradas, 0 aplicadas, 0 rejeitadas.
Unanimidade e maioria simples são regras **automáticas**; só "reunião" é decisão do grupo (coluna `decisao_automatica` em `processed/consenso.csv`).

## Heurística de release corretiva (Pessoa B)

| Versão | Avaliadas | VP | FP | FN | VN | Precisão | Recall | F1 | Situação |
|---|---|---|---|---|---|---|---|---|---|
| v1-semver-patch | 270 | 77 | 61 | 37 | 95 | 0,558 | 0,675 | 0,611 | refinar |
| v2-commits-fix | 300 | 114 | 158 | 6 | 22 | 0,419 | 0,950 | 0,582 | refinar |
| v3-patch-e-commits | 270 | 73 | 53 | 41 | 103 | 0,579 | 0,640 | 0,608 | refinar |
| v4-maioria-corretiva | 300 | 52 | 33 | 68 | 147 | 0,612 | 0,433 | 0,507 | refinar |

Previsões para releases fora da amostra (ignoradas): 68855. Problemas nas previsões: 0.

## Pendências

- heuristica v1-semver-patch: F1 = 0.611 < 0.7, refinar e reavaliar (evidencias em processed/heuristica_erros.csv)
- heuristica v2-commits-fix: F1 = 0.582 < 0.7, refinar e reavaliar (evidencias em processed/heuristica_erros.csv)
- heuristica v3-patch-e-commits: F1 = 0.608 < 0.7, refinar e reavaliar (evidencias em processed/heuristica_erros.csv)
- heuristica v4-maioria-corretiva: F1 = 0.507 < 0.7, refinar e reavaliar (evidencias em processed/heuristica_erros.csv)
