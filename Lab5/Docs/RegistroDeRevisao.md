# Lab05 — Sprint 01 · Registro da revisão do Participante A

Revisões de [`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md), feitas em
18/11/2026:

- **Versão 2 (revisão metodológica):** Partes 1 a 3, mantidas como histórico.
- **Versão 3 (fechamento das pendências da Sprint 01):** Partes 4 a 8.
  - Parte 4: decisões para o grupo.
  - Parte 5: validação atualizada.
  - Parte 6: Aula 8.
  - Parte 7: divisão de responsabilidades.
  - Parte 8: revisão de consistência.

O resumo da entrega está em
[`ChecklistEntregaSprint01.md`](ChecklistEntregaSprint01.md).

> **Revisão seguinte (24/11/2026, issue #129).** A consolidação do protocolo
> para a Sprint 02 tem documento próprio,
> [`ProtocoloExperimental.md`](ProtocoloExperimental.md). As divergências
> encontradas entre plano e código estão na seção 7 dele (V1–V12); as
> decisões, na seção 8.

Gravidade: **Alta** compromete a validade do estudo ou a aprovação;
**Média** enfraquece uma conclusão ou deixa uma métrica ambígua; **Baixa** é
uma imprecisão de redação ou de fonte.

---

## Parte 1 — Diagnóstico

| # | Problema identificado | Seção (v1) | Gravidade | Justificativa | Correção |
| --- | --- | --- | --- | --- | --- |
| 1 | M6 inferia cache comparando o TTL retornado com o TTL do servidor autoritativo | 7.4 | Alta | O TTL decresce em segundos inteiros, então uma resposta recém-cacheada volta com TTL integral [R20][R21]. Resolvedores aplicam TTL mínimo e máximo e fazem prefetch. Respostas *serve-stale* voltam com TTL de 30 s [R26]. CDNs usam TTLs curtos e variáveis, e caches anycast são fragmentados. Em domínios de terceiros, a inferência é ambígua | Estado de cache controlado pelo desenho (C1 ausência forçada com rótulo único, C2 cache quente, C3 natural), como faz o APNIC [R19]. M6 virou checagem de manipulação numa zona com TTL conhecido |
| 2 | A v1 afirmava que trocar o Radar pela Tranco eliminava o viés a favor do 1.1.1.1 | 7.4 e 8 | Alta | A Tranco inclui o Cloudflare Radar entre suas cinco fontes desde 26/09/2022 [R40]. A afirmação era factualmente incorreta | Texto corrigido: a Tranco atenua o viés, mas não o elimina. A popularidade deixou de ser indicador de cache, e há análise de sensibilidade |
| 3 | A classificação "popular × cauda longa" foi usada como aproximação do estado de cache | 7.3 (Q2) e 7.4 | Alta | Popularidade global não é popularidade local, TTLs curtos de CDN expiram mesmo em domínios populares, e cada resolvedor tem caches distintos | Q2 reformulada sobre condições de cache controladas; a popularidade só estratifica C3, com um estrato `.br` como aproximação de relevância local |
| 4 | M1 não dizia o que entra no tempo de DoT e DoH; handshake e consulta não estavam separados | 7.4 (M1, M7) | Alta | Com conexão nova, o tempo inclui os handshakes TCP e TLS [R24]; com conexão reaproveitada, não inclui. Sem essa definição, a comparação entre protocolos não tem significado | M1 definida por protocolo e estado da conexão; M7 dividida em custo com conexão nova e com conexão reaproveitada; procedimento com dnspython na seção 9.4 |
| 5 | A biblioteca TLS do cliente não estava especificada | Instrumentação (ausente) | Alta | Piloto 2: o Python do macOS (LibreSSL 2.8.3) não suporta TLS 1.3 e negociou TLS 1.2, com handshake mais longo (49,1 ms contra 33,7 ms no 1.1.1.1) | TLS 1.3 obrigatório, verificado na inicialização; versões registradas em cada arquivo |
| 6 | Assimetria de `TCP_NODELAY` entre DoT e DoH | Instrumentação (ausente) | Alta | Piloto 2: sem `TCP_NODELAY`, a primeira consulta DoT atrasou cerca de 60 ms (85,9 → 23,6 ms no 1.1.1.1). O `dns.query.tls` não liga a opção e o `httpcore` (DoH) liga. A comparação DoT × DoH ficaria enviesada | `TCP_NODELAY` obrigatório em todo socket TCP do coletor |
| 7 | O bootstrap de M3 reamostrava consultas individuais | 7.4 (M3) | Alta | As consultas do mesmo nome e da mesma rodada são dependentes. Reamostrá-las como independentes estreita o IC e infla a significância | Pareamento por bloco, agregação por nome e bootstrap por conglomerado (nomes) [R34] |
| 8 | O resolvedor padrão podia ser um encaminhador, e a interceptação da porta 53 não era considerada | 7.4 e 8 | Alta | Piloto 2: o resolvedor padrão da rede do piloto encaminha consultas, ao menos em parte, ao Google (AS15169). Se o provedor intercepta a porta 53, o "Do53 do 1.1.1.1" é respondido por outro servidor | Procedimento de validação em 5 passos (seção 9.5), com classificação da rede em (a), (b) ou (c) |
| 9 | Faltavam itens exigidos na Sprint 01: caminho de pesquisa, sete categorias, plano de coleta e plano de análise | Documento | Alta | Itens 4, 5, 7 e 8 do checklist da Sprint 01 | Novas seções 6.2, 8, 9 e 10 |
| 10 | Variáveis, tratamentos e unidade experimental não estavam definidos | Documento | Alta | Sem isso não há como julgar o desenho nem escolher testes | Seções 9.1 e 9.2, com a divisão em sub-experimentos E-1 e E-2 |
| 11 | Delta de Cliff sem sinal definido e aplicado a dados pareados como se fossem independentes | 7.4 (M4) | Média | O sinal do δ depende da convenção, e o δ ignora o pareamento | Sinal explicitado (δ > 0 indica o 1.1.1.1 mais rápido); δ mantido só como descritivo; r = \|Z\|/√n do Wilcoxon como efeito do teste pareado, como no Lab02 |
| 12 | Taxa de vitória sem regra para empates e falhas | 7.4 (M5) | Média | Com resolução de ms há empates frequentes, e uma falha precisa contar de algum jeito | Tolerância de ε = 1 ms; falha conta como derrota de quem falhou; IC por bootstrap por conglomerado |
| 13 | Coeficiente de variação em distribuição assimétrica | 7.4 (M9) | Média | O CV é dominado pela cauda (picos de 188 ms no piloto 1) | Substituído por IQR ÷ mediana |
| 14 | A taxa de falhas não distinguia falha da rede local, falha do domínio e falha do resolvedor, e não tinha IC | 7.4 (M8) | Média | Uma queda do link local seria atribuída a todos os resolvedores; um domínio com DNSSEC quebrado, idem | Regra de classificação de falhas (seção 10.4), IC de Wilson e McNemar para a comparação pareada |
| 15 | Autoaquecimento do cache pelas próprias rodadas | Desenho (ausente) | Média | Domínios com TTL maior que o intervalo entre rodadas são encontrados em cache por causa da consulta anterior do grupo | Rodízio de subconjuntos, registro do tempo desde a última consulta e análise de sensibilidade |
| 16 | Não havia testes estatísticos definidos nem controle de comparações múltiplas | Documento | Média | Muitas comparações sem correção geram falsos positivos | Friedman + Wilcoxon pareado + Holm; hipóteses primárias declaradas (seção 10.3) |
| 17 | Faltava uma covariável de distância de rede e o registro do ponto de presença | Desenho | Média | Piloto 2: o Do53 do 8.8.8.8 variou de 75,9 para 24,7 ms em um minuto, com RTT estável em ~22 ms, e a instância da Cloudflare mudou (`gru22` → `gru02`) | M11 (RTT por TCP connect) e `pop_id` registrados em toda rodada |
| 18 | O texto da RQ não batia com o escopo declarado ("redes de acesso brasileiras" contra "redes usadas pelo grupo") | 6 e 7.1 | Média | A v1 dizia ter restringido o escopo, mas o texto da RQ e o "In the context of" não refletiam isso | RQ e Goal reescritos com "redes de acesso brasileiras usadas pelo grupo" |
| 19 | Afirmação sem fonte de que "quase não há medições a partir de redes brasileiras" | 6.1 | Média | Não houve busca na literatura que sustentasse a afirmação | Substituída por síntese de três estudos verificados [R29][R30][R31]; a busca específica ficou marcada como pendente |
| 20 | A metodologia do APNIC era descrita sem fonte | 5 | Média | A descrição ("anúncios on-line") não estava em nenhuma referência citada | Citado o texto do próprio APNIC sobre o método [R19], com trechos literais; ambiguidade de contagem marcada como pendente |
| 21 | E9 omitia que o DoH está sub-representado nos dados da Cloudflare | 4 (E9) | Baixa | A própria fonte avisa que o tráfego DoH da Mozilla e de outras plataformas ficou fora | Ressalva incluída em E9 |
| 22 | "DoH padrão no Firefox desde 2020" sugeria que a situação continua igual hoje | 1 e 5 | Baixa | A fonte é de 2020; a situação atual não foi verificada | Redação "a partir de 25/02/2020" e marca de pendência |
| 23 | "Radar usado por pesquisadores e pela imprensa" sem fonte; "Gateway compartilha infraestrutura" exagerava o relatório | 1 | Baixa | O relatório só diz que o Gateway sofreu degradação intermitente | Frases ajustadas ao que as fontes dizem |
| 24 | Piloto 1: faixa "72–76 ms" incorreta (o mínimo do modo alto era 69); interpretação do resolvedor padrão como independente | 7.2 | Baixa | Dados brutos do piloto | Faixa corrigida para 69–76 ms; nota sobre o encaminhador local e a instabilidade do p95 com n = 30 |
| 25 | Respostas Do53 truncadas não tinham tratamento | Instrumentação | Baixa | Respostas truncadas exigem nova consulta via TCP, com custo extra | `udp_with_fallback` com registro de `usou_tcp` |
| 26 | [R12] sem data e sem autor | 9 | Baixa | Referência incompleta | Autor e data incluídos (Celso Martinho, 30/09/2022) |

---

## Parte 3 — Registro das alterações

| Seção (v2) | Alteração | Por quê |
| --- | --- | --- |
| Cabeçalho | Versão, link para este registro e nova marca **[Pendente]** | Separar o que já está verificado do que falta verificar ou decidir |
| 1 | Citação das RFCs de DNS, DoT e DoH; Firefox com data e pendência; Gateway e Radar ajustados às fontes | Problemas 22 e 23 |
| 2 | Tabela marcada como julgamento do grupo; menção aos dois pilotos | Separar avaliação de medição |
| 3 e 4 | E3 qualificado ("na época"); E9 com a ressalva do DoH; E11 com o ponto de presença observado | Problema 21 e uso dos dados do piloto 2 |
| 5 | Parágrafo do APNIC reescrito com fonte [R19] e trechos literais; pendência sobre contagem dupla | Problema 20 |
| 6 | RQ com "redes usadas pelo grupo" e "com conexão nova e reaproveitada"; justificativa 3 apoiada na literatura; H-b e H-c reescritas | Problemas 18 e 19 e definição dos protocolos |
| 6.2 (nova) | Caminho de pesquisa em 9 etapas | Requisito da Sprint 01 (problema 9) |
| 7.2 | Piloto 1 preservado, com correções; **piloto 2 novo**, com DoT e DoH em dois ambientes e o teste de `TCP_NODELAY`; oito constatações com consequências para o plano | Problemas 5, 6, 8, 17 e 24 |
| 7.3 | Q1 e Q2 reformuladas (estado natural × estado de cache controlado); Q3 com conexão nova × reaproveitada | Problemas 3 e 4 |
| 7.4 | M1, M3, M4, M5, M6, M7, M8 e M9 redefinidas; M11 nova; explicação de por que M6 e M9 mudaram | Problemas 1, 4, 7, 11, 12, 13, 14 e 17 |
| 7.5 | Diagrama atualizado, com M6 como validação e M11 como covariável | Coerência com 7.4 |
| 8 (nova) | Classificação nas sete categorias, com justificativas e pendência sobre a nomenclatura da Aula 8 | Requisito da Sprint 01 |
| 9 (nova) | Variáveis, sub-experimentos, condições de cache, instrumentação, validação do resolvedor padrão, rodadas e registro, amostra de domínios, fatores de confusão | Problemas 2, 3, 5, 6, 8, 10, 15 e 25 |
| 10 (nova) | Plano de análise: descritiva, dependência, testes, falhas, bootstrap e sensibilidade | Problemas 7, 14 e 16 |
| 11 | Revisão crítica atualizada; fragilidade da Tranco corrigida; novas fragilidades | Problema 2 e novos riscos |
| 12 | 25 referências novas (R19–R43): RFCs, literatura de medição, estatística e metodologia; [R12] completada | Sustentar as novas seções |
| `Lab5/Sprint01/piloto/` (nova pasta) | Scripts e saídas dos pilotos, sem endereços IP, com README de reprodução | Reprodutibilidade e auditoria pelo professor |

**O que foi preservado:** a escolha do 1.1.1.1; a comparação com o 8.8.8.8 e
o resolvedor padrão; a estrutura GQM e as métricas M1–M10 (com os mesmos IDs);
as evidências E1–E17 e seus números; os resultados do piloto 1; as 18
referências originais.

**Verificação das referências.** Foram abertas ou conferidas em fonte primária
as referências R1–R14, R16, R19–R31 e R40–R41. Também foram conferidos:

- os DOIs de R29–R31;
- os metadados das RFCs, no RFC Editor;
- a inclusão do Radar na Tranco, na página de metodologia;
- a assinatura das funções do dnspython, na documentação e no código instalado.

R15 foi conferida em registros bibliográficos. R32 foi conferida em fontes
secundárias (documentação dos pacotes R `effsize` e `rstatix`). As obras
clássicas R17, R18, R33–R39, R42 e R43 foram citadas pela forma bibliográfica
corrente, sem abrir o exemplar; convém conferir a paginação.

---

## Parte 4 — Decisões para o grupo (A, B e C)

> **Nada nesta parte está aprovado.** São propostas do Participante A, com o
> motivo e o impacto de cada uma, para a reunião do grupo. A coluna "Quem
> decide" segue a divisão de papéis da Parte 7.

### 4.1 Quadro de decisões

| # | O que decidir | Proposta atual | Por que é necessário | Impacto de não decidir | Quem decide |
| --- | --- | --- | --- | --- | --- |
| D1 | **Domínio próprio** para C1 e C2 | Registrar um domínio e hospedar a zona sem DNSSEC num provedor que não seja Cloudflare nem Google (detalhes em 4.2) | É a única forma de controlar o estado do cache | C1 e C2 saem do desenho, a Q2 e a H-b ficam fracas e M6 perde a função | **Grupo** (envolve custo) |
| D2 | **Quantidade de redes** | 3, uma por integrante, pelo menos uma no cabo | Cada rede é uma réplica (seção 10.2) | Com 1 rede, não há replicação; o resultado vira estudo de uma rede só | **Grupo** (cada um fornece a sua) |
| D3 | **Nomes por rodada** | 80: 60 de C3 (um subconjunto, em rodízio, de 180 domínios, 60 por estrato) + 10 posições C1 + 10 nomes C2; o E-2 reaproveita os 10 de C2 | Equilibra poder estatístico e duração da rodada | Amostra pequena reduz o poder dos testes; amostra grande alonga a rodada e desfaz o pareamento | **B**, com **C** (viabilidade) |
| D4 | **Intervalo entre rodadas** | 30 minutos | Define a resolução temporal (M10) e o autoaquecimento do cache | Intervalo curto aquece o cache artificialmente; longo deixa poucas observações por faixa horária | **B** e **C** |
| D5 | **Duração da coleta** | 7 dias corridos, começando num dia útil, nas três redes ao mesmo tempo | Cobrir o ciclo semanal e todas as faixas horárias | Menos de 7 dias não cobre fins de semana; coletas em semanas diferentes confundem rede e data | **Grupo** |
| D6 | **Configuração dos protocolos** | IPv4; tipo A; EDNS0 de 1.232 bytes, sem o bit DO; timeout de 2 s, uma tentativa; DoT com SNI, certificado verificado e `TCP_NODELAY`; DoH por HTTP/2, POST, URL por IP; TLS 1.3 obrigatório | O piloto 2 mostrou que a pilha do cliente muda os resultados | Resultados entre redes e protocolos deixam de ser comparáveis | **C**, com **B** |
| D7 | **Ambiente de coleta** | Um `requirements.txt` com versões fixadas; Python ≥ 3.10 com OpenSSL; máquina sem hibernar; relógio por NTP | Mesma razão de D6 | Mesma consequência de D6 | **C** |
| D8 | **Estratégia estatística** | Unidade de inferência: nome em C3, janela de 6 h em C1, C2 e E-2. Testes: Friedman + Wilcoxon pareado + Holm. IC por bootstrap por conglomerado com 10.000 réplicas. α = 0,05; ε = 1 ms; hipóteses primárias H-a e H-c. Falhas: Wilcoxon sobre taxas por unidade ou apenas descrição. Modelo misto só como opcional | Fixar a análise antes da coleta evita escolher o teste depois de ver o resultado | Análise post hoc, sujeita a escolha seletiva | **C** e **B** |
| D9 | **Responsáveis** pelas etapas 5–9 do caminho de pesquisa | Proposta na Parte 7 | Planejar a Sprint 02 | Atraso e risco de um integrante sem artefato próprio | **Grupo** |
| D10 | **Nomenclatura das sete categorias** | Conferir a seção 8 com a Aula 8 | O material não está no repositório | Risco de perder pontos por terminologia | **B** |
| D11 | **Verificações de fonte** | Situação atual do DoH no Firefox; se o APNIC conta um usuário em mais de um resolvedor; se a Tranco gera lista sem o Radar; estudos com medições a partir do Brasil | Afirmações hoje marcadas como pendentes | Ficam como ressalvas no texto, sem afetar os três critérios | **A** |
| D12 | **Regra de contribuição individual** | Conferir se o Lab05 repete a regra do Lab02 (cada integrante com Issue e artefato commitado em toda sprint) | O enunciado do Lab05 não está no repositório | Um integrante sem commit próprio pode perder a nota individual da sprint | **Grupo** |

### 4.2 Decisão D1 — domínio próprio

**Por que é importante.** Em domínios de terceiros, o grupo não sabe se uma
resposta veio do cache ou de uma resolução completa (seção 7.4, "Por que M6
mudou"). Com uma zona própria, o grupo passa a controlar dois casos
extremos:

- **C1:** um nome que nunca foi consultado, porque é gerado na hora, obriga
  o resolvedor a ir ao servidor autoritativo;
- **C2:** um nome fixo com TTL conhecido, consultado logo antes, garante uma
  resposta de cache, o que o TTL decrementado confirma.

É o mesmo princípio que o APNIC Labs usa para eliminar a interferência de
caches [R19].

**O que passa a ser medido:**

- o custo de uma resolução recursiva completa em cada resolvedor (C1);
- o custo de uma resposta de cache (C2), que é o piso de latência de cada
  resolvedor;
- a diferença C1 − C2, que aproxima o custo de buscar no autoritativo;
- a checagem M6, para saber se as condições de cache foram de fato
  produzidas;
- o teste direto da H-b (o resolvedor padrão é melhor em cache e pior na
  recursão);
- o E-2 inteiro, que usa os nomes C2 para que o custo do protocolo não se
  misture com o tempo de recursão.

**O que fica limitado sem ele:**

- a Q2 só pode ser respondida pela estratificação de popularidade de C3, que
  não controla o cache (seção 9.7);
- a H-b deixa de ter teste direto;
- a M6 vira apenas uma descrição;
- o E-2 precisaria usar domínios reais "provavelmente em cache", o que
  reintroduz a incerteza que a versão 2 removeu.

O estudo continua viável, mas mais fraco.

**Requisitos técnicos:**

| Requisito | Por quê |
| --- | --- |
| Domínio registrado em qualquer TLD comum, com delegação funcionando pelo menos 2 dias antes da coleta | Garantir que a delegação esteja estável e em cache nos três resolvedores |
| Registros NS e de delegação com TTL longo (por exemplo, 1 dia) | Evitar que, de vez em quando, uma consulta C1 inclua a busca da delegação e fique mais lenta por um motivo alheio ao tratamento |
| Hospedagem DNS autoritativa **fora** da Cloudflare e do Google (nem o DNS da Cloudflare, nem o Google Cloud DNS) | Hospedar na infraestrutura de um dos resolvedores comparados encurtaria o caminho dele até o autoritativo e criaria vantagem artificial |
| Zona **sem DNSSEC** | Impede respostas sintetizadas a partir de registros NSEC em cache [R27] e evita custo de validação diferente entre resolvedores |
| Registro curinga `*.c1.<zona>` com resposta positiva (tipo A) | Nomes únicos recebem resposta NOERROR; respostas NXDOMAIN poderiam entrar em cache negativo e mudar o comportamento |
| Nomes C2 fixos com TTL conhecido (por exemplo, 3.600 s) | Permite a checagem por TTL decrementado (M6) |
| Rótulos C1 com a mesma profundidade e um rótulo único por resolvedor | Mesma quantidade de trabalho para todos os resolvedores; sem aquecimento cruzado (seção 9.3) |
| Sem EDNS Client Subnet no servidor autoritativo | Evita que o cache do 8.8.8.8 seja dividido por sub-rede só na zona de teste |
| Log de consultas no servidor autoritativo, se o provedor oferecer | Confirma diretamente quais consultas C1 chegaram ao autoritativo (M6) |
| Localização do servidor autoritativo registrada | O tempo de C1 depende da distância entre o ponto de presença de cada resolvedor e o autoritativo |

**Como evitar viés:**

1. **Não hospedar a zona na Cloudflare nem no Google.**
2. **Registrar a localização do autoritativo** e, se o provedor for anycast,
   em que regiões ele está. Um autoritativo com presença no Brasil reduz a
   parte do tempo de C1 que vem só da distância.
3. **Não interpretar C1 como "velocidade absoluta" do resolvedor.** C1 mede o
   caminho do resolvedor até **este** autoritativo. O relatório deve dizer que
   outro provedor de hospedagem poderia mudar a diferença entre os
   resolvedores. Essa limitação vale para qualquer escolha.
4. **Manter a zona igual durante toda a coleta.** Nenhuma alteração de
   registros ou de TTL depois do início.
5. **Validar antes de coletar:** consultar a zona pelos três resolvedores em
   cada rede e conferir que todos respondem e que a checagem M6 funciona.

**Observação.** O Participante A não registrou domínio, não contratou serviço
e não fez nenhuma configuração externa. A escolha do registrador, do provedor
e do custo é do grupo.

---

## Parte 5 — Validação final contra os requisitos da Sprint 01

| # | Requisito | Situação | Avaliação | O que falta |
| --- | --- | --- | --- | --- |
| 1 | Software escolhido e apresentado | Seções 1 e 2 | **Completo** | — |
| 2 | Evidências de que é real, está em operação e tem alto impacto | Seções 3 a 5, 17 evidências com fonte e data | **Completo** | Duas verificações menores (Firefox atual e contagem do APNIC), que não afetam os três critérios |
| 3 | Pergunta de pesquisa | Seção 6 | **Completo** | — |
| 4 | Caminho de pesquisa | Seção 6.2 | **Completo** | Atribuir responsáveis às etapas 5–9 |
| 5 | Primeira classificação nas sete categorias | Seção 8 | **Parcial (provisória)** | Material da Aula 8 não encontrado; conferência por B (D10) |
| 6 | Objetivo GQM | Seção 7 | **Completo** | — |
| 7 | Plano de coleta | Seção 9 | **Completo como proposta** | Decisões D1–D7 do grupo; validação de B e C |
| 8 | Plano de análise | Seção 10 | **Completo como proposta** | Decisão D8; validação de C e B |
| 9 | Coleta piloto | Seção 7.2 e `Lab5/Sprint01/piloto/` | **Completo** | — |

**Avaliação geral (v3).** A parte do Participante A está pronta: itens 1, 2,
3 e 6 e o piloto. O documento como um todo depende de três ações do grupo:

1. Conferir a seção 8 com a Aula 8 (D10).
2. Tomar as decisões D1–D8, principalmente o domínio próprio (D1), que define
   se C1 e C2 ficam no desenho.
3. Validar as seções que cabem a B e C (Parte 7).

**Limitações que continuam e devem ser declaradas no relatório:**

- validade externa restrita às redes do grupo;
- nenhuma explicação causal dos mecanismos internos dos resolvedores (ECS,
  organização dos caches);
- dependência de infraestrutura própria para controlar o estado do cache;
- dependência residual entre janelas de tempo;
- DoH medido pela URL por IP, e não pelos nomes que os navegadores usam.

O quadro completo está na seção 10.7 do planejamento.

---

## Parte 6 — Pendência 1: as sete categorias da Aula 8

**Busca realizada em 18/11/2026:**

- todos os arquivos do repositório;
- todas as branches locais e remotas;
- o histórico do Git, incluindo arquivos apagados (como o enunciado do Lab02,
  removido no commit `08a2d63`);
- o texto dos relatórios finais dos Labs 01 e 02 (PDF);
- os nomes de arquivo da pasta da disciplina, um nível acima do repositório.

**Resultado:** o material da Aula 8 **não foi encontrado**. Nenhuma fonte
local traz a lista de categorias do professor nem os níveis de cada uma. O
enunciado do Lab02 não trata de classificação de pesquisa.

**O que foi feito na seção 8 do planejamento:**

1. O aviso agora diz que a classificação é **provisória e não validada** com o
   material do professor e registra onde a busca foi feita.
2. O texto deixa claro que os **nomes** das categorias foram informados pelo
   grupo como os da Aula 8. Os **níveis** e as definições vêm de Prodanov e
   Freitas, Wohlin et al. e Kitchenham, e a classificação da disciplina tem
   prioridade quando houver divergência.
3. Foi incluída uma lista de **ajustes previstos** caso a aula use outra
   escala. Dois pontos são sensíveis:
   - **Temporalidade:** pode virar "transversal com medidas repetidas" se a
     aula reservar "longitudinal" para estudos de meses.
   - **Controle das variáveis:** pode virar "quase-experimento" se a aula
     exigir sorteio das unidades, já que as redes não são sorteadas.
4. A coerência de cada nível com o estudo foi conferida e mantida:
   - **aplicada:** apoia uma decisão prática;
   - **explicativa:** testa o efeito de fatores manipulados;
   - **quantitativa:** só variáveis numéricas;
   - **experimental, com apoio documental:** há manipulação e randomização
     da ordem;
   - **longitudinal curta:** 7 dias de medidas repetidas;
   - **experimento de campo em blocos:** todos os tratamentos em todos os
     blocos, em ordem aleatória, mas na internet real.

**Situação: pendência mantida**, transferida para o Participante B (D10), a
quem cabe a classificação pela divisão de papéis.

---

## Parte 7 — Pendência 3: divisão de responsabilidades

Divisão de referência informada pelo Participante A:

- **A:** planejamento, pesquisa, software, evidências, pergunta de pesquisa e
  GQM;
- **B:** desenho metodológico, caminho de pesquisa, classificação, hipóteses,
  variáveis e desenho experimental;
- **C:** instrumentação, scripts, coleta, métricas operacionais e análise.

Ela ainda precisa ser confirmada por B e C. Nenhum conteúdo foi removido. As
seções de B e C ficam como rascunho de A até a validação.

| Seção | Conteúdo | Responsável | Compartilhada? | Desenvolvimento | Precisa de validação de |
| --- | --- | --- | --- | --- | --- |
| 1–5 | Software, justificativa, evidências | A | Não | Completo | — |
| 6 (RQ, escopo, 6.1) | Pergunta de pesquisa e justificativa | A | Não | Completo | — |
| 6 (hipóteses H-a, H-b, H-c) | Hipóteses de trabalho | B | A redigiu | Completo; H₀/H₁ formais em 10.3 | B |
| 6.2 | Caminho de pesquisa | B | A redigiu | Completo; faltam responsáveis por etapa | B |
| 7.1, 7.3, 7.5 | Objetivo, perguntas e relação GQM | A | Não | Completo | — |
| 7.2 | Pilotos | A e C | Sim | Completo | C (herda os scripts) |
| 7.4 | Métricas M1–M11 | A (definição) e C (operacionalização) | Sim | Completo | C |
| 8 | Sete categorias | B | A redigiu | Provisório (Aula 8) | B |
| 9.1, 9.2 | Variáveis, tratamentos, sub-experimentos | B | A redigiu | Completo | B |
| 9.3 | Condições de cache | B (desenho) e C (zona DNS) | Sim | Completo; depende de D1 | B, C e grupo |
| 9.4 | Instrumentação | C | A redigiu, com base no piloto | Completo | C |
| 9.5 | Validação do resolvedor padrão | C (execução) e B (critérios) | Sim | Completo | C e B |
| 9.6 | Rodadas, volume, registro | C (esquema) e B (rodadas) | Sim | Completo; depende de D3–D5 | C e B |
| 9.7 | Amostra de domínios | B (amostragem) e C (implementação) | Sim | Completo; pendência sobre a Tranco | B |
| 9.8 | Fatores de confusão | B | A redigiu | Completo | B |
| 10.1, 10.2, 10.4–10.6 | Análise descritiva, dependência, falhas, bootstrap, sensibilidade | C | A redigiu | Completo; depende de D8 | C |
| 10.3 | Testes de hipótese | B e C | Sim | Completo; depende de D8 | B e C |
| 10.7 | Ameaças à validade | B | A redigiu | Completo | B |
| 11, 12 | Revisão crítica e referências | Grupo (manutenção por A) | Sim | Completo | — |

**Avaliação das seções 9 e 10.** As duas estão desenvolvidas o bastante para
servir de base à Sprint 02. Os rascunhos dependem de decisões do grupo (D1–D8),
mas não de trabalho novo. Pela divisão de papéis, a seção 9 é sobretudo de B (desenho)
com partes de C (instrumentação); a seção 10 é de C, com B nos testes de
hipótese. Elas foram mantidas no documento para não perder qualidade; cabe a B
e C revisá-las e assumi-las.

**Etapas 5–9 do caminho de pesquisa (proposta, D9):**

| Etapa | Responsável sugerido |
| --- | --- |
| 5 — validação das redes | C, com cada integrante na própria rede |
| 6 — amostra de domínios e zona de teste | B (amostra) e C (zona) |
| 7 — coleta | C (coletor), com os três integrantes mantendo suas máquinas |
| 8 — análise | C, com B nos testes de hipótese |
| 9 — interpretação e relatório | Grupo, com A na redação |

Se o Lab05 repetir a regra do Lab02 de um artefato commitado por integrante em
cada sprint (D12), essa divisão garante um artefato próprio para cada um na
Sprint 02:

- **C:** o coletor;
- **B:** a amostra de domínios e o script de sorteio;
- **A:** as fichas das redes e a revisão das fontes.

---

## Parte 8 — Revisão de consistência (versão 3)

| # | Problema encontrado na v2 | Seção | Gravidade | Correção na v3 |
| --- | --- | --- | --- | --- |
| 1 | Nomes C1 são únicos por rodada e os de C2 são réplicas idênticas. Usar o "nome" como unidade de inferência nessas condições não faz sentido (C1) ou é pseudorreplicação (C2) | 7.4, 10.2, 10.3, 10.5 | Alta | Unidade de inferência por condição: nome em C3, janela de 6 h em C1, C2 e E-2. M2, M3, M4, M5, 10.2, 10.3 e 10.5 atualizadas |
| 2 | O mesmo nome C1 consultado nos três resolvedores permitiria aquecimento cruzado quando o padrão encaminha ao 8.8.8.8 | 9.3 | Alta | Um nome único por resolvedor; bloco redefinido como "posição"; nova linha em 9.8 |
| 3 | M7 era descrita como "pareada", mas a fórmula subtraía medianas de grupos | 7.4 | Média | Δ calculado por bloco e resumido como em M3 |
| 4 | O IC de Wilson e o McNemar supõem observações independentes, o que contradiz a seção 10.2 | 7.4 (M8), 10.3 | Média | Wilson só como aproximação descritiva; IC de referência por bootstrap por conglomerado; teste de falhas via Wilcoxon sobre taxas por unidade; McNemar só exploratório |
| 5 | C2 não dizia quanto esperar entre o aquecimento e a consulta medida; com menos de 1 s, o TTL não cai e a checagem M6 falha | 9.3 | Média | Espera mínima de 2 s; checagem estendida ao E-2 |
| 6 | "60 nomes de C3 por rodada" conflitava com o rodízio de subconjuntos | 9.6 | Média | Conjunto de 180 domínios (60 por estrato) em 3 subconjuntos; 60 por rodada; cerca de 112 observações por domínio em 7 dias |
| 7 | M11 não dizia como medir o RTT do resolvedor padrão | 7.4 | Baixa | Conexão TCP na porta 53, quando aceita |
| 8 | Não havia um quadro único de ameaças à validade | 10 | Média | Nova seção 10.7, nos quatro tipos de Wohlin et al. |
| 9 | O DoH medido pela URL por IP difere do DoH usado pelos navegadores | 9.8 | Baixa | Declarado em 9.8 e 10.7 como limite de validade externa |
| 10 | A responsabilidade por seção não estava explícita | Cabeçalho | Média | Tabela de responsabilidade no início do documento |

**Verificações sem problema:**

- RQ → Goal → Q1–Q4 → M1–M11 coerentes;
- todas as métricas citadas no plano de análise;
- Do53, DoT e DoH com definições compatíveis;
- os números do piloto no texto conferem com as saídas em
  `Lab5/Sprint01/piloto/`; nenhum resultado de piloto foi alterado;
- as 43 referências citadas existem na lista, e toda referência listada é
  citada.
