// FONTE UNICA das colunas do dataset final (secao 7 do enunciado: "cada coluna
// dos CSVs finais e' documentada com nome, tipo, unidade e formula ou origem na
// API"). A mesma lista gera o CSV e o dicionario de dados - assim o dicionario
// nao tem como divergir do arquivo, que e' o erro classico de documentar a mao.
//
// `de` diz de onde o valor vem:
//   repositorio -> processed/repositories.csv (etapa "repositorios", A)
//   leadtime    -> processed/lead_time.csv    (etapa "leadtime", B)
//   runs        -> processed/dora_runs.csv    (etapa "runs", C)
//   corretiva   -> processed/cfr_entrega.csv  (etapa "corretiva", B)
//   derivada    -> calculada aqui (a formula fica em `formula`)

export const COLUNAS_DATASET = Object.freeze([
  // ---- identificacao
  { nome: "full_name", tipo: "texto", unidade: "-", rq: "-", de: "repositorio", origem: "full_name da API", descricao: "Repositorio, no formato owner/name." },
  { nome: "rank", tipo: "inteiro", unidade: "-", rq: "-", de: "repositorio", origem: "posicao na busca", descricao: "Posicao do repositorio na busca por estrelas (1 = mais estrelas)." },
  { nome: "stars", tipo: "inteiro", unidade: "estrelas", rq: "RQ 06", de: "repositorio", origem: "stargazers_count", descricao: "Estrelas no momento da busca. Fator de popularidade (quartis) da RQ 06." },
  { nome: "language", tipo: "texto", unidade: "-", rq: "RQ 06", de: "repositorio", origem: "language", descricao: "Linguagem principal detectada pelo GitHub; vazio quando nao ha." },
  { nome: "contributors", tipo: "inteiro", unidade: "pessoas", rq: "RQ 06", de: "repositorio", origem: "contributors?per_page=1&anon=true (ultima pagina do Link)", descricao: "Contribuidores, incluindo anonimos. Vazio quando o GitHub nao calcula." },
  { nome: "age_years", tipo: "decimal", unidade: "anos", rq: "RQ 06", de: "repositorio", origem: "derivada de created_at", formula: "(fim da janela - created_at) / 365,25 dias", descricao: "Idade medida no fim da janela, para nao mudar conforme o dia da coleta." },
  { nome: "created_relative_to_window", tipo: "texto", unidade: "-", rq: "-", de: "repositorio", origem: "derivada de created_at", descricao: "before_window, within_window ou after_window." },
  { nome: "default_branch", tipo: "texto", unidade: "-", rq: "-", de: "repositorio", origem: "default_branch", descricao: "Unico branch considerado em todas as metricas." },
  { nome: "archived", tipo: "booleano", unidade: "-", rq: "-", de: "repositorio", origem: "archived", descricao: "Repositorio arquivado (somente leitura) no momento da busca." },
  { nome: "workflow_count", tipo: "inteiro", unidade: "workflows", rq: "-", de: "repositorio", origem: "actions/workflows total_count", descricao: "Workflows configurados no repositorio." },
  { nome: "status", tipo: "texto", unidade: "-", rq: "-", de: "repositorio", origem: "funil de selecao", descricao: "included = amostra final; eligible = cumpre o criterio mas ficou fora do corte." },

  // ---- RQ 01: deployment frequency
  { nome: "releases_in_window", tipo: "inteiro", unidade: "releases", rq: "RQ 01", de: "leadtime", origem: "processed/releases.csv", formula: "releases com draft=false e prerelease=false e published_at na janela", descricao: "Deploys do periodo. Numerador da RQ 01." },
  { nome: "window_weeks", tipo: "decimal", unidade: "semanas", rq: "RQ 01", de: "derivada", formula: "dias da janela / 7", descricao: "Tamanho da janela em semanas. Denominador da RQ 01 (igual para todos os repositorios)." },
  { nome: "deployment_frequency_per_week", tipo: "decimal", unidade: "releases/semana", rq: "RQ 01", de: "derivada", formula: "releases_in_window / window_weeks", descricao: "**RQ 01.** Frequencia de deploys. Elite >= 7/semana na tabela de referencia." },
  { nome: "prereleases_in_window", tipo: "inteiro", unidade: "releases", rq: "RQ 07", de: "leadtime", origem: "processed/releases.csv", descricao: "Pre-releases na janela. Entram na variante C2 da analise de sensibilidade." },

  // ---- RQ 02: lead time
  { nome: "lead_time_release_median_days", tipo: "decimal", unidade: "dias", rq: "RQ 02", de: "leadtime", formula: "mediana de (published_at(R) - data do commit mais antigo de R)", descricao: "**RQ 02, variante (a).** Vazio quando nenhuma release pode ser avaliada." },
  { nome: "lead_time_release_median_hours", tipo: "decimal", unidade: "horas", rq: "RQ 02", de: "leadtime", formula: "a mesma mediana, em horas", descricao: "Unidade canonica da variante (a)." },
  { nome: "lead_time_release_iqr_hours", tipo: "decimal", unidade: "horas", rq: "RQ 02", de: "leadtime", formula: "Q3 - Q1 das releases do repositorio", descricao: "Dispersao interna da variante (a)." },
  { nome: "lead_time_commit_median_days", tipo: "decimal", unidade: "dias", rq: "RQ 02", de: "leadtime", formula: "mediana de (published_at(R) - data de cada commit de R)", descricao: "**RQ 02, variante (b).** Um commit antigo esquecido pesa menos aqui que na (a)." },
  { nome: "lead_time_commit_median_hours", tipo: "decimal", unidade: "horas", rq: "RQ 02", de: "leadtime", formula: "a mesma mediana, em horas", descricao: "Unidade canonica da variante (b)." },
  { nome: "lead_time_commit_iqr_hours", tipo: "decimal", unidade: "horas", rq: "RQ 02", de: "leadtime", formula: "Q3 - Q1 dos commits do repositorio", descricao: "Dispersao interna da variante (b)." },
  { nome: "releases_evaluated", tipo: "inteiro", unidade: "releases", rq: "RQ 02", de: "leadtime", origem: "coluna releases_evaluated de lead_time.csv", descricao: "Releases que entraram no calculo do lead time." },
  { nome: "commits_used", tipo: "inteiro", unidade: "commits", rq: "RQ 02", de: "leadtime", origem: "coluna commits_used de lead_time.csv", descricao: "Commits que entraram na variante (b)." },

  // ---- RQ 03 (a): change failure rate
  { nome: "valid_workflow_runs", tipo: "inteiro", unidade: "execucoes", rq: "RQ 03", de: "runs", formula: "runs com event=push no default branch, na janela, com conclusion de sucesso ou falha", descricao: "Base do criterio minimo (>= 50) e denominador do CFR (a)." },
  { nome: "successful_runs", tipo: "inteiro", unidade: "execucoes", rq: "RQ 03", de: "runs", formula: "conclusion = success", descricao: "Execucoes bem-sucedidas na janela." },
  { nome: "failed_runs", tipo: "inteiro", unidade: "execucoes", rq: "RQ 03", de: "runs", formula: "conclusion em failure, timed_out ou startup_failure", descricao: "Execucoes com falha na janela." },
  { nome: "change_failure_rate_ci", tipo: "decimal 0-1", unidade: "proporcao", rq: "RQ 03", de: "runs", formula: "failed_runs / (failed_runs + successful_runs)", descricao: "**RQ 03, variante (a)** - proxy de CI. Vazio quando nao ha run valido (diferente de zero)." },
  { nome: "ignored_runs", tipo: "inteiro", unidade: "execucoes", rq: "RQ 03", de: "runs", formula: "conclusion em cancelled, skipped, neutral, action_required, stale ou vazia", descricao: "Execucoes fora de todos os calculos, pela tabela da secao 3 do enunciado." },

  // ---- RQ 03 (b): change failure rate, proxy de entrega
  { nome: "change_failure_rate_delivery", tipo: "decimal 0-1", unidade: "proporcao", rq: "RQ 03", de: "corretiva", formula: "cfr_delivery_failed / cfr_delivery_evaluated", descricao: "**RQ 03, variante (b)** - proxy de entrega: R falhou se o deploy seguinte for uma release corretiva publicada em ate 7 dias. Vazio quando nenhuma release pode ser avaliada." },
  { nome: "cfr_delivery_evaluated", tipo: "inteiro", unidade: "releases", rq: "RQ 03", de: "corretiva", formula: "deploys da janela - censurados - indeterminados", descricao: "Denominador do CFR (b)." },
  { nome: "cfr_delivery_failed", tipo: "inteiro", unidade: "releases", rq: "RQ 03", de: "corretiva", origem: "coluna cfr_delivery_failed de cfr_entrega.csv", descricao: "Releases seguidas, em ate 7 dias, por uma release corretiva. Numerador do CFR (b)." },
  { nome: "cfr_delivery_censored", tipo: "inteiro", unidade: "releases", rq: "RQ 03", de: "corretiva", formula: "deploys publicados nos ultimos 7 dias da janela", descricao: "Censura a direita: ainda nao se sabe se havera correcao. Fora do denominador." },
  { nome: "cfr_delivery_undetermined", tipo: "inteiro", unidade: "releases", rq: "RQ 03", de: "corretiva", origem: "coluna cfr_delivery_undetermined de cfr_entrega.csv", descricao: "Seguinte em ate 7 dias, mas sem previsao da heuristica (comparacao indisponivel). Fora do denominador." },
  { nome: "corrective_heuristic", tipo: "texto", unidade: "-", rq: "RQ 03", de: "corretiva", origem: "config.json, heuristica.versao", descricao: "Versao da heuristica de release corretiva usada no CFR (b) e no rework rate (ver src/releases/corretiva.js e docs/validacao-manual.md)." },
  { nome: "corrective_releases", tipo: "inteiro", unidade: "releases", rq: "RQ 08", de: "corretiva", origem: "coluna corrective_releases de cfr_entrega.csv", descricao: "Deploys da janela classificados como corretivos pela heuristica." },
  { nome: "releases_classified", tipo: "inteiro", unidade: "releases", rq: "RQ 08", de: "corretiva", origem: "coluna releases_classified de cfr_entrega.csv", descricao: "Deploys da janela com previsao da heuristica (denominador do rework rate)." },
  { nome: "rework_rate", tipo: "decimal 0-1", unidade: "proporcao", rq: "RQ 08", de: "corretiva", formula: "corrective_releases / releases_classified", descricao: "**RQ 08 (bonus).** Proporcao de releases corretivas; ao contrario do CFR (b), nao exige que a correcao saia em ate 7 dias." },

  // ---- RQ 04: tempo de recuperacao
  { nome: "recovery_median_hours", tipo: "decimal", unidade: "horas", rq: "RQ 04", de: "runs", formula: "mediana de (updated_at do sucesso - run_started_at da primeira falha), por workflow", descricao: "**RQ 04.** Episodios censurados ficam de fora desta mediana." },
  { nome: "recovery_median_days", tipo: "decimal", unidade: "dias", rq: "RQ 04", de: "runs", formula: "recovery_median_hours / 24", descricao: "A mesma mediana em dias (a tabela de referencia usa < 1 hora para Elite)." },
  { nome: "recovery_iqr_hours", tipo: "decimal", unidade: "horas", rq: "RQ 04", de: "runs", formula: "Q3 - Q1 dos episodios do repositorio", descricao: "Dispersao interna da RQ 04." },
  { nome: "recovery_episodes", tipo: "inteiro", unidade: "episodios", rq: "RQ 04", de: "runs", origem: "coluna recovery_episodes de dora_runs.csv", descricao: "Episodios de falha com sucesso anterior (a definicao do enunciado)." },
  { nome: "recovery_episodes_censored", tipo: "inteiro", unidade: "episodios", rq: "RQ 04", de: "runs", origem: "coluna recovery_episodes_censored de dora_runs.csv", descricao: "Episodios sem recuperacao ate o fim da janela (censura a direita)." },
  { nome: "recovery_censored_ratio", tipo: "decimal 0-1", unidade: "proporcao", rq: "RQ 04", de: "runs", formula: "recovery_episodes_censored / recovery_episodes", descricao: "Proporcao de censurados, reportada junto da mediana como pede o enunciado." },
  { nome: "episodes_without_prior_success", tipo: "inteiro", unidade: "episodios", rq: "RQ 04", de: "runs", origem: "coluna episodes_without_prior_success de dora_runs.csv", descricao: "Falhas sem nenhum sucesso antes na janela (censura a esquerda); nao formam episodio." },

  // ---- qualidade do dado (ameacas a validade)
  { nome: "negative_lead_time_commits", tipo: "inteiro", unidade: "commits", rq: "RQ 02", de: "leadtime", origem: "coluna negative_lead_time_commits de lead_time.csv", descricao: "Commits com data posterior a release (rebase/squash). Ameaca de construto da RQ 02." },
  { nome: "truncated_releases", tipo: "inteiro", unidade: "releases", rq: "RQ 02", de: "leadtime", origem: "coluna truncated_releases de lead_time.csv", descricao: "Comparacoes acima do teto de commits: saem da variante (b)." },
  { nome: "truncated_slices", tipo: "inteiro", unidade: "meses", rq: "RQ 03/04", de: "runs", origem: "coluna truncated_slices de dora_runs.csv", descricao: "Fatias mensais que passaram do teto de 1.000 resultados por consulta da API." },
  { nome: "negative_recovery_episodes", tipo: "inteiro", unidade: "episodios", rq: "RQ 04", de: "runs", origem: "coluna negative_recovery_episodes de dora_runs.csv", descricao: "Episodios com duracao negativa (updated_at anterior ao inicio da falha); fora da mediana." },
  { nome: "leadtime_errors", tipo: "texto", unidade: "-", rq: "RQ 02", de: "leadtime", origem: "coluna errors de lead_time.csv", descricao: "Motivos de falha na coleta de commits, no formato motivo:quantidade." },
  { nome: "runs_error", tipo: "texto", unidade: "-", rq: "RQ 03/04", de: "runs", origem: "coluna error de dora_runs.csv", descricao: "Motivo quando a coleta de workflow runs falhou para o repositorio." },
]);

export const NOMES_DAS_COLUNAS = Object.freeze(COLUNAS_DATASET.map((c) => c.nome));
