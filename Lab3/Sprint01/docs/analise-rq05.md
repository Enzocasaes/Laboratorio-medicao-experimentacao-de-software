# RQ 05 — frequência de deploy × taxa de falha

> Arquivo **gerado** por `npm run analise:rq05`. Não edite à mão.

- Amostra: **300 repositórios** (amostra final da S02).
- Janela: **2025-10-01 a 2026-09-30**.
- Gerado em: 2026-10-19T13:00:15.613Z.

Correlação de **Spearman** (por postos): as duas métricas são muito
assimétricas e a relação esperada é monótona, não linear. IC de 95% pela
transformação de Fisher (erro-padrão de Bonett e Wright, 2000). Os seis
pares formam uma família, corrigida por **Holm** (α = 0,05).
Magnitude de |ρ|: < 0,1 nula, < 0,3 fraca, < 0,5 moderada, ≥ 0,5 forte.

## Correlações

| Papel | Frequência × … | n | ρ | IC 95% | p | p (Holm) | Leitura |
|---|---|---|---|---|---|---|---|
| principal | CFR (a), proxy de CI | 300 | **0,162** | 0,049 a 0,271 | 0,004813 | 0,009625 | fraca positiva, significativa após Holm |
| principal | CFR (b), proxy de entrega | 298 | **0,515** | 0,420 a 0,599 | < 0,0001 | < 0,0001 | forte positiva, significativa após Holm |
| robustez | CFR (b), so' com >= 10 releases avaliadas | 248 | **0,469** | 0,360 a 0,565 | < 0,0001 | < 0,0001 | moderada positiva, significativa após Holm |
| mecanismo | Oportunidade: releases com a seguinte em <= 7 dias | 298 | **0,744** | 0,681 a 0,796 | < 0,0001 | < 0,0001 | forte positiva, significativa após Holm |
| mecanismo | Condicional: seguinte corretiva, dado que saiu em <= 7 dias | 266 | **-0,043** | -0,163 a 0,078 | 0,4848 | 0,4848 | nula, não significativa após Holm |
| complementar | Tempo de recuperacao (horas) | 283 | **-0,204** | -0,314 a -0,088 | 0,0005644 | 0,001693 | fraca negativa, significativa após Holm |

**Decomposição do CFR (b).** Por repositório, CFR (b) = *oportunidade* ×
*condicional*: a oportunidade é a proporção de releases avaliadas cuja
seguinte saiu em até 7 dias; a condicional é, dessas, a proporção em que a
seguinte foi corretiva. Quem publica mais tem, por construção, mais releases
com a seguinte em até 7 dias. Se a correlação com o CFR (b) vier da
oportunidade e não aparecer na condicional, ela é um efeito da definição da
métrica, e não evidência de que publicar mais causa mais falhas.

## CFR por quartil de frequência

| Quartil | Frequência (releases/semana) | n | CFR (a) mediana | CFR (a) IQR | CFR (b) mediana | CFR (b) IQR |
|---|---|---|---|---|---|---|
| Q1 | 0,096 a 0,249 | 77 | 4,3% | 1,6% – 10,8% | 0,0% | 0,0% – 20,0% |
| Q2 | 0,249 a 0,537 | 76 | 4,0% | 2,2% – 11,2% | 13,8% | 5,4% – 21,9% |
| Q3 | 0,537 a 1,227 | 73 | 4,6% | 2,6% – 10,2% | 30,3% | 12,0% – 50,3% |
| Q4 | 1,227 a 28,173 | 74 | 7,2% | 3,1% – 13,6% | 40,0% | 15,4% – 67,4% |

## Como refazer

```bash
cd Lab3/Sprint01
npm run analise:rq05
python scripts/conferir_rq05_rq06.py   # opcional: confere com o scipy
```
