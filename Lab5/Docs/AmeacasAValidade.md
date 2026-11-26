# Lab05 — Ameaças à validade do experimento

**Issue #130 e #131 · Participante B · 26/11/2026**

Este documento é o registro consolidado das ameaças à validade do experimento
**como ele foi executado**, e não como foi planejado. Ele substitui, para o
relatório final, as listas parciais que existiam espalhadas:

| Onde estava | O que era | O que vale agora |
| --- | --- | --- |
| [`DesenhoMetodologico.md`](DesenhoMetodologico.md), seção 9 | ameaças **previstas**, antes de medir | continua válido como registro do que era esperado |
| [`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md), seção 10.7 | tabela original do Participante A | incorporada aqui |
| [`ProtocoloExperimental.md`](ProtocoloExperimental.md), seção 7 | divergências V1–V12 entre plano e implementação | as que viraram ameaça estão aqui |
| [`../Sprint02/resultados/README.md`](../Sprint02/resultados/README.md), seção 6 | ameaças por resultado | continua, como leitura rápida ao lado dos números |

A classificação é a de Wohlin et al. [R18]: **conclusão**, **interna**,
**construto** e **externa**.

## Como a gravidade foi atribuída

Severidade não é opinião sobre o quanto a ameaça é feia; é o quanto ela pode
mudar a conclusão desta coleta.

| Grau | Significa |
| --- | --- |
| **Alta** | pode **inverter** ou anular a conclusão. O relatório não pode afirmar o resultado sem citar a ameaça na mesma frase |
| **Média** | muda a **magnitude** ou o alcance, não o sinal |
| **Baixa** | limita a leitura, sem afetar o resultado |

As evidências apontam para números gerados, nunca para memória:
[`descritiva.md`](../Sprint02/resultados/descritiva.md),
[`conformidade_metodologica.md`](../Sprint02/resultados/conformidade_metodologica.md),
[`testes_hipotese.md`](../Sprint02/resultados/testes_hipotese.md) e
[`analise_rede-c.md`](../Sprint02/resultados/analise_rede-c.md).

---

## 1. Validade de conclusão

*A relação entre o tratamento e o resultado é real, ou é ruído?*

| # | Ameaça | Evidência | Grau | Situação |
| --- | --- | --- | --- | --- |
| **VC1** | **Poder.** A unidade de inferência de C3 é o nome, e só há 15 nomes. O teste primário passa com p = 0,022 | `conformidade`, C4 | **Alta** | Não mitigável nesta base. Dois ou três nomes a mais do lado do 8.8.8.8 derrubariam a H-a |
| **VC2** | **Dependência entre observações.** Rodadas a cada 10 s não são independentes | `conformidade`, C3 | **Alta** no E-2, **média** no E-1 | No E-1, a agregação por nome absorve a dependência. No E-2 a unidade pré-registrada (janela de 6 h) não existe, a rodada foi usada no lugar dela, e o IC sai mais estreito do que deveria — por isso o E-2 é exploratório |
| **VC3** | **Multiplicidade.** Muitas comparações possíveis | `testes_hipotese`, 1 | **Média** | Família primária declarada antes (H-a e H-c2), Holm dentro dela. As sensibilidades não levam correção e são lidas como robustez da direção, não como testes novos |
| **VC4** | **Eventos raros não observados.** 0 falhas em 1.500 consultas | `analise_rede-c`, 4 | **Baixa** | Não há teste de falhas, só descrição com IC de Wilson. Dez minutos não medem indisponibilidade |
| **VC5** | **Desvio de análise declarado.** A unidade do E-2 mudou depois de ver que só havia uma janela | `testes_hipotese`, 3 | **Média** | O desvio está escrito ao lado do resultado, e o resultado não entra em veredito nenhum |

## 2. Validade interna

*A diferença medida foi causada pelo fator que eu manipulei?*

| # | Ameaça | Evidência | Grau | Situação |
| --- | --- | --- | --- | --- |
| **VI1** | **Autoaquecimento do cache pelas próprias rodadas.** 81% das consultas do E-1 chegaram com a resposta da rodada anterior ainda em cache | S1 em `testes_hipotese`, 4 | **Alta** | Sem essas consultas, a H-a **não se sustenta** (p = 0,46). O efeito medido é, em boa parte, "quem guarda melhor o que eu acabei de pedir" |
| **VI2** | **Confusão com a distância de rede.** O Δ de −2,0 ms é da ordem da diferença de RTT entre os dois resolvedores | S2 em `testes_hipotese`, 4; `descritiva`, 5.1 | **Alta** | Descontado o RTT, a diferença desaparece (Δ = −0,7 ms, r = 0,03). A vantagem é do caminho até o ponto de presença, não do resolvedor |
| **VI3** | **Troca de instância anycast.** 12 instâncias diferentes do 1.1.1.1 atenderam, e a instância mudou em 56 das 59 passagens de rodada | `descritiva`, 5.2 | **Alta** | Entre as instâncias com 20 ou mais observações, a mediana varia 2,2 ms — **a mesma ordem do efeito**. A sensibilidade S3 não cobre isso: ela compara o *sítio* (`gru`), que nunca mudou (`conformidade`, C14) |
| **VI4** | **O "resolvedor padrão" é um encaminhador.** A rede é de classe (b): o roteador guarda cache e repassa aos públicos | `ProtocoloExperimental`, 5.1 | **Alta** | A comparação "padrão × público" é "cache local × acesso direto", e está rotulada assim em todo lugar. Não é um resolvedor competindo com outro |
| **VI5** | **Pilha do cliente.** Versão de TLS e de HTTP afetam o custo medido do protocolo | `conformidade`, C12 | **Média** | No DoT a versão é registrada (TLS 1.3) e confere. No **DoH** não há registro de versão nenhuma: não é possível afirmar que rodou em HTTP/2, como o plano exigia |
| **VI6** | **Bloco disperso no tempo.** As três consultas de um nome ficam até 1,8 s separadas, porque a ordem é sorteada sobre a rodada inteira | `conformidade`, C10 | **Baixa** | A rodada dura menos de dois segundos; a variação de rede nesse intervalo é pequena diante das diferenças medidas |
| **VI7** | **Cadência acima do previsto.** Pico de 10 consultas por segundo em cada resolvedor público | `conformidade`, C6 | **Baixa** para o resultado, **alta** para a conduta | Nenhum sinal de limitação de taxa (0 falhas, 0 SERVFAIL). Mas a regra de ética do enunciado é de ritmo, e no pico ela não foi cumprida |

## 3. Validade de construto

*O que eu medi é mesmo o conceito que eu queria medir?*

| # | Ameaça | Evidência | Grau | Situação |
| --- | --- | --- | --- | --- |
| **VK1** | **"Mais rápido" não é "melhor".** O estudo mede tempo e falha; não mede privacidade, filtragem, resistência a censura nem risco de concentração | `DesenhoMetodologico`, 8 | **Alta** | É a falácia de McNamara, e foi prevista. A recomendação final tem de ser escrita como *"mais rápido nestas redes, nesta semana, segundo estas métricas"*, com a lista do que ficou de fora |
| **VK2** | **O estado de cache de C3 é desconhecido.** Sem a zona do grupo (D1) não há C1 nem C2 | `conformidade`, C5 | **Alta** para a Q2 | A Q2 e a H-b ficam sem dado. O critério de autoaquecimento de S1 usa o TTL da consulta anterior como aproximação, porque o TTL autoritativo só existiria na zona própria |
| **VK3** | **Confiabilidade medida em 10 minutos.** A taxa de falha de consulta não captura indisponibilidade rara e grande | `analise_rede-c`, 4 | **Alta** para a Q4 | O incidente de 62 minutos de 14/07/2025 entra como contexto documental, não como dado. "0% de falha" significa "nada falhou nestes 10 minutos", e o IC de Wilson diz isso: até 0,64% |
| **VK4** | **Latência medida no cliente inclui o cliente.** O processamento em Python pesa mais no DoH (HTTP/2) que no Do53 | `DesenhoMetodologico`, 9 | **Média** | Mesma máquina e mesmas bibliotecas em todos os tratamentos; a parcela do cliente é declarada como parte do custo do protocolo |
| **VK5** | **O E-2 roda num único nome de cache natural.** Parte do Δ pode ser recursão, não transporte | `conformidade`, C11; `ProtocoloExperimental`, V12 | **Média** | A comparação é dentro da mesma rodada e do mesmo nome, o que limita o viés, mas o E-2 não mede o que o desenho dizia que mediria |
| **VK6** | **Taxa de falha de *consulta* não é *change failure rate*.** O vocabulário do Lab03 não se transfere | `DesenhoMetodologico`, 5.3 | **Baixa** | O nome completo é usado em todo o relatório |

## 4. Validade externa

*Para onde esses resultados valem?*

| # | Ameaça | Evidência | Grau | Situação |
| --- | --- | --- | --- | --- |
| **VE1** | **Uma rede, por conveniência, em Wi-Fi, numa tarde de 24/11/2026** | `conformidade`, C1 e C2 | **Alta** | Não há réplica entre redes. A direção do efeito pode não se repetir em outro provedor, e não há como saber |
| **VE2** | **15 domínios do piloto, sem estratificação.** A amostra de C3 prevista tinha 180 nomes em três estratos | `conformidade`, C4 | **Alta** | Sem estratos, a sensibilidade S5 nem se aplica. A amostra não representa "os domínios que um usuário acessa" |
| **VE3** | **Só IPv4, só registros do tipo A, uma máquina.** | `ProtocoloExperimental`, 4 | **Média** | Limite de escopo declarado desde o desenho |
| **VE4** | **DoH medido por URL com IP** (`https://1.1.1.1/dns-query`), enquanto navegadores usam nomes que apontam para outros endereços | `DesenhoMetodologico`, 9 | **Média** | Escolha deliberada, para manter o mesmo endereço anycast do Do53. O DoH medido não é exatamente o DoH que o usuário final usa |
| **VE5** | **Resultado de um instante da malha anycast.** As 12 instâncias são todas de São Paulo | `descritiva`, 5.2 | **Média** | Em outra cidade, outro provedor ou outro horário, o ponto de presença e a rota mudam |

---

## 5. O que ainda pode ser afirmado

A pergunta certa não é "o estudo tem ameaças?", e sim "o que sobra depois
delas?". Sobra isto:

| Afirmação | Sustentada? | Por quê |
| --- | --- | --- |
| Nesta rede e nestes 10 minutos, o 1.1.1.1 respondeu em mediana 2,0 ms abaixo do 8.8.8.8, com 71% de vitórias por bloco | **Sim** | É descrição do que foi medido, e o pareamento e a aleatorização (C8, C9, C10) valem |
| Essa vantagem vem do **resolvedor** | **Não** | VI2 e VI3: ela é da ordem da diferença de RTT e da variação entre instâncias anycast |
| O DNS cifrado custa caro ao **abrir** a conexão e quase nada depois | **Sim, como indício forte** | O efeito é de dezenas a centenas de ms contra ±5 ms, muito acima do ruído; mas é exploratório (VC2) |
| O custo extra do 8.8.8.8 no DoT está no **handshake TLS**, não na distância | **Sim, como descrição** | TCP de 29 contra 31 ms e TLS de 17 contra 69 ms, em 60 medidas de cada (`descritiva`, 4) |
| O resolvedor do roteador é "melhor" | **Não** | VI4: é cache local contra acesso direto, duas coisas diferentes |
| Algum resolvedor é mais confiável | **Não** | VK3: zero falha em 10 minutos não distingue ninguém |
| Isso vale para o Brasil, ou para outra rede | **Não** | VE1 e VE2 |

## 6. O que muda na coleta definitiva

Em ordem de impacto sobre as ameaças, e não de esforço:

1. **A zona DNS do grupo (D1)** mata a VK2 inteira e devolve a Q2 ao estudo.
   É a única pendência que muda o que o experimento é capaz de responder.
2. **Sete dias, três redes** atacam VE1, VC1 e VC2 de uma vez: trazem a janela
   de 6 h de volta como unidade, dão réplica entre redes e tiram o E-2 da
   condição de exploratório.
3. **Rodadas a cada 30 minutos**, como o desenho pedia, reduzem o
   autoaquecimento (VI1) — hoje a maior ameaça interna.
4. **180 domínios estratificados** elevam o n do teste primário de 15 para 180
   (VC1 e VE2).
5. **Cadência de um bloco por segundo e sorteio da ordem dentro do bloco**
   resolvem VI7 e VI6 juntos, e não dependem de tempo nem da zona: é uma
   mudança no coletor, que pode ser feita agora.
6. **Registrar a versão do HTTP e os handshakes do DoH** fecha a VI5 e permite
   decompor o custo do DoH como já se decompõe o do DoT.
7. **Registrar a instância anycast em toda consulta, e não uma vez por rodada**,
   e estender a sensibilidade S3 da troca de *sítio* para a troca de
   *instância* (VI3).

Os itens 5, 6 e 7 são de instrumentação e cabem numa sprint. Os itens 1 a 4
dependem de decisão do grupo e de calendário.

---

**Referência.** [R18] WOHLIN, Claes et al. *Experimentation in Software
Engineering*. Berlin: Springer, 2012. As demais referências citadas estão em
[`PlanejamentoEPesquisa.md`](PlanejamentoEPesquisa.md), seção 12, e em
[`DesenhoMetodologico.md`](DesenhoMetodologico.md), seção 11.
