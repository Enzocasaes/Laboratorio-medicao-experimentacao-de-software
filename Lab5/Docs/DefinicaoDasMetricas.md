# Lab05 — Sprint 01 · Participante C: Definição das Métricas

**Escopo:** valida as métricas M1–M11 da seção 7.4 de
[`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md) e acrescenta o que
faltava para elas serem **executáveis**: de qual coluna do CSV cada uma sai e
qual função a calcula.
**Data:** 19/11/2026.

## Por que este documento existe

A seção 7.4 define as métricas corretamente, mas no nível do conceito. Entre
"p95 da latência" e um número há decisões que mudam o resultado: qual
interpolação do percentil, o que fazer com os timeouts, a partir de quantas
observações o p95 pode ser reportado. Se essas decisões ficarem implícitas,
dois integrantes calculam o mesmo nome e chegam a números diferentes.

Aqui cada métrica tem **um caminho único** do dado bruto ao número.

## 1. Rastreabilidade: métrica → coluna → função

Todas as métricas saem do mesmo CSV, com uma linha por consulta. As funções
estão em [`../Sprint01/coleta/analise.py`](../Sprint01/coleta/analise.py) e
[`estatistica.py`](../Sprint01/coleta/estatistica.py).

| Métrica | Colunas do CSV que usa | Função | Situação |
| --- | --- | --- | --- |
| **M1** latência | `latencia_ms`, `erro`, `rcode` | `medidor.medir_*` grava; a análise só filtra sucessos | **[Validado]** |
| **M2** mediana e p95 | `latencia_ms` | `estatistica.mediana`, `estatistica.percentil` | **[Ajustado]**, ver 2.1 |
| **M3** diferença pareada | `rede_id`, `rodada_id`, `nome`, `condicao_cache`, `resolvedor`, `latencia_ms` | `analise.diferencas_por_unidade` + `estatistica.bootstrap_conglomerado` | **[Validado]** |
| **M4** tamanho de efeito | as mesmas de M3 | `estatistica.wilcoxon_pareado` (r) e `estatistica.cliff_delta` | **[Validado]** |
| **M5** taxa de vitória | as mesmas de M3 | `analise.taxa_de_vitoria` | **[Validado]** |
| **M6** checagem de cache | `ttl`, `ttl_autoritativo`, `condicao_cache` | — | **[Pendente]**: depende da zona do grupo (D1) |
| **M7** custo do cifrado | `experimento`, `protocolo`, `conexao`, `latencia_ms` | `analise.comparar` sobre E-2 | **[Validado]** |
| **M8** taxa de falhas | `erro`, `rcode` | `analise.relatorio` + `estatistica.wilson` | **[Validado]** |
| **M9** dispersão | `latencia_ms` | `estatistica.iqr` | **[Validado]** |
| **M10** faixa horária | `ts_utc` | `analise.janela_6h` | **[Parcial]**, ver 2.4 |
| **M11** RTT de rede | `rtt_ms` | `medidor.rtt_tcp` | **[Ajustado]**, ver 2.3 |

## 2. As decisões que faltavam

### 2.1 M2 — quando o p95 pode ser reportado **[Ajustado]**

A seção 7.4 já propunha um mínimo de 100 observações por célula. Implementei
exatamente isso: abaixo de 100 sucessos, a coluna sai como `—`, e não como um
número.

O piloto mostra por que. Com n = 45 por célula, o p95 cairia sobre as duas ou
três observações mais altas — e no piloto essas observações são justamente as
resoluções sem cache da cauda longa, que variaram de 15 ms a mais de 400 ms.
O p95 calculado ali descreveria o sorteio, não o resolvedor.

**Interpolação:** linear entre os dois valores vizinhos, o mesmo critério do
`statistics.quantiles` do Python. Fica registrado porque R e NumPy oferecem
nove definições diferentes de percentil, e elas não coincidem.

### 2.2 M1 — o que entra na média, o que é censurado

| Situação | Vai para `latencia_ms` | Entra na mediana |
| --- | --- | --- |
| Resposta NOERROR | tempo medido | **sim** |
| Timeout | 2.000 ms (censura) | **não** |
| SERVFAIL, REFUSED | tempo medido | **não** |
| Erro de transporte | tempo até o erro | **não** |

As medianas usam só os sucessos; os timeouts entram censurados para a análise
de sensibilidade 4 da seção 10.6, que mostra o efeito das falhas sobre a cauda.
Guardar o número **e** marcar o erro deixa as duas leituras possíveis sem
coletar duas vezes.

### 2.3 M11 — a porta muda conforme o alvo **[Ajustado]**

A seção 7.4 define o RTT pela porta 443. Isso funciona nos públicos, mas o
resolvedor padrão de uma rede normalmente não atende em 443. A implementação
usa **443 nos resolvedores com DoT/DoH e 53 nos demais**, e devolve vazio
quando o alvo não aceita TCP naquela porta — ausência é informação, não erro.

**Consequência para a análise:** o RTT do padrão e o dos públicos são medidos
em portas diferentes e não devem ser comparados entre si como se fossem a
mesma coisa. Servem como covariável **dentro** de cada resolvedor, ao longo do
tempo, que é para o que a seção 10.6 os usa.

### 2.4 Ponto de presença: só existe para a Cloudflare **[Novo]**

A seção 9.4 manda registrar `id.server` (classe CHAOS) em toda rodada. Isso
funciona no **1.1.1.1**, que devolveu `cnf01` em todas as rodadas do piloto.
O **8.8.8.8 não responde** a essa consulta — o Google usa outro mecanismo
(`o-o.myaddr.l.google.com`), que devolve o endereço do resolvedor, não um
código de instalação.

**Consequência.** A covariável "ponto de presença" existe só de um lado. A
análise de sensibilidade 3 da seção 10.6 — "excluir as rodadas em que o ponto
de presença do 1.1.1.1 mudou" — continua possível, porque é sobre o 1.1.1.1.
O que **não** é possível é uma análise simétrica, que detecte troca de
instância no Google. Isso entra como ameaça à validade interna: uma variação
do 8.8.8.8 causada por mudança de instância seria atribuída ao resolvedor sem
que ninguém percebesse.

**[Pendente]** Uma alternativa para a Sprint 02 é usar o próprio
`o-o.myaddr.l.google.com` como identificador aproximado de instância do Google.
O campo `pop_id` já existe no esquema e aceitaria esse valor sem mudança.

### 2.5 M10 — faixa horária **[Parcial]**

Implementada como janela de 6 h sobre o `ts_utc`, que é também a unidade de
inferência de C1, C2 e E-2 (seção 10.2). A conversão para o horário de
Brasília fica na apresentação, não no cálculo: converter cedo é fonte comum de
erro de fuso, e o carimbo já está em UTC.

No piloto a métrica não diz nada, porque a coleta inteira cabe numa única
janela. É limitação da duração, não da implementação.

### 2.6 M6 — por que continua sem implementação **[Pendente]**

A M6 confere se a condição de cache pretendida foi mesmo produzida. Ela
compara o TTL devolvido com o TTL **configurado** numa zona que o grupo
controla. Sem a zona (pendência D1) não há TTL conhecido com que comparar, e
qualquer implementação seria a inferência que a própria seção 7.4 descartou,
com razão: resolvedores alteram TTL, aplicam prefetch e respondem de caches
diferentes a cada consulta.

O coletor **já grava** `ttl` e reserva `ttl_autoritativo`. Quando a zona
existir, a M6 é uma comparação entre duas colunas que já estão lá.

## 3. Uma métrica nova **[Novo]**

| Métrica | Definição | Por que |
| --- | --- | --- |
| **M12** reconexões na conexão reaproveitada | Coluna `reconectou` do CSV: marca a consulta que foi refeita porque o servidor derrubou a conexão ociosa | O tratamento "conexão reaproveitada" **supõe** que a conexão sobrevive à rodada. Se um resolvedor derrubar conexões ociosas mais que o outro, parte do custo dele reaparece sem aviso, e a comparação do E-2 fica errada sem ninguém perceber |

**Esta métrica quase ficou impossível de obter.** Na primeira versão do
coletor, a reconexão acontecia em silêncio: a medida que falhava era
descartada e a refeita entrava no CSV como qualquer outra. A métrica estava
definida no papel e não existia no dado. Escrever esta tabela foi o que expôs
o problema — por isso a coluna `reconectou` foi acrescentada ao esquema.

No piloto a coluna ficou `False` em todas as linhas: nenhum dos dois
resolvedores derrubou a conexão dentro de uma rodada. Isso é um resultado, não
um não-resultado — sustenta a suposição em que o tratamento se apoia.

## 4. Limites

- **M6 não foi exercitada.** Depende de D1.
- **M4 (delta de Cliff) está implementada mas não entra no relatório
  automático**, porque com os dados do piloto ela compararia distribuições de
  nomes diferentes e enganaria. Entra na Sprint 02, sobre as medianas por
  unidade de inferência.
- **M10 precisa de pelo menos um dia de coleta** para ter mais de uma faixa.
