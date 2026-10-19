# RQ 06 — características do repositório × desempenho DORA

> Arquivo **gerado** por `npm run analise:rq06`. Não edite à mão.

- Amostra: **300 repositórios** (amostra final da S02).
- Janela: **2025-10-01 a 2026-09-30**.
- Gerado em: 2026-10-19T13:00:16.064Z.

Métricas da combinação C1 e a pontuação DORA geral (1 = Low … 4 = Elite).
Testes por postos, sem suposição de normalidade, em duas famílias corrigidas
por **Holm** separadamente (α = 0,05):

- **omnibus**: Kruskal–Wallis por fator × métrica, efeito ε² (< 0,01
  desprezível, < 0,08 pequeno, < 0,26 médio, ≥ 0,26 grande);
- **contrastes planejados** a partir da H6: Mann–Whitney Q4 × Q1 nos fatores
  por quartis e cada linguagem de publicação automatizada × C/C++ na
  frequência; efeito = delta de Cliff (|δ| < 0,147 desprezível, < 0,33
  pequeno, < 0,474 médio, ≥ 0,474 grande).

### Grupos

- Linguagem: C e C++ juntas; linguagens com menos de 10 repositórios em "Outras".
- Contribuidores (quartis) (`contributors`): Q1 ≤ 220,50 < Q2 ≤ 470,50 < Q3 ≤ 1052,00 < Q4.
- Idade em anos (quartis) (`age_years`): Q1 ≤ 2,50 < Q2 ≤ 6,26 < Q3 ≤ 10,75 < Q4.
- Estrelas (quartis) (`stars`): Q1 ≤ 48912,75 < Q2 ≤ 63095,00 < Q3 ≤ 91235,50 < Q4.
- **Tipo do projeto: pendente.** Ainda não há consenso da validação manual (`processed/consenso.csv`); rode `npm run validacao` e depois esta etapa.

## Kruskal–Wallis (omnibus)

| Fator | Métrica | n | H | gl | p | p (Holm) | ε² | Melhor grupo (mediana) |
|---|---|---|---|---|---|---|---|---|
| Linguagem principal | Deployment frequency | 300 | 16,14 | 6 | 0,01303 | 0,1825 | 0,054 (pequeno) | TypeScript |
| Linguagem principal | Lead time (a) | 299 | 30,19 | 6 | < 0,0001 | **0,0005793** | 0,101 (medio) | Python |
| Linguagem principal | CFR (a) | 300 | 11,95 | 6 | 0,06311 | 0,6311 | 0,040 (pequeno) | JavaScript |
| Linguagem principal | Tempo de recuperacao | 283 | 13,04 | 6 | 0,04234 | 0,4658 | 0,046 (pequeno) | TypeScript |
| Linguagem principal | Pontuacao DORA geral | 300 | 14,62 | 6 | 0,02342 | 0,2811 | 0,049 (pequeno) | TypeScript |
| Contribuidores (quartis) | Deployment frequency | 300 | 3,78 | 3 | 0,2867 | 1 | 0,013 (pequeno) | Q2 |
| Contribuidores (quartis) | Lead time (a) | 299 | 55,28 | 3 | < 0,0001 | **< 0,0001** | 0,185 (medio) | Q1 |
| Contribuidores (quartis) | CFR (a) | 300 | 2,42 | 3 | 0,4894 | 1 | 0,008 (desprezivel) | Q1 |
| Contribuidores (quartis) | Tempo de recuperacao | 283 | 1,28 | 3 | 0,7332 | 1 | 0,004 (desprezivel) | Q1 |
| Contribuidores (quartis) | Pontuacao DORA geral | 300 | 13,17 | 3 | 0,00428 | 0,0642 | 0,044 (pequeno) | Q1 |
| Idade em anos (quartis) | Deployment frequency | 300 | 31,81 | 3 | < 0,0001 | **< 0,0001** | 0,106 (medio) | Q1 |
| Idade em anos (quartis) | Lead time (a) | 299 | 107,02 | 3 | < 0,0001 | **< 0,0001** | 0,359 (grande) | Q1 |
| Idade em anos (quartis) | CFR (a) | 300 | 4,81 | 3 | 0,1866 | 1 | 0,016 (pequeno) | Q4 |
| Idade em anos (quartis) | Tempo de recuperacao | 283 | 9,83 | 3 | 0,02006 | 0,2608 | 0,035 (pequeno) | Q1 |
| Idade em anos (quartis) | Pontuacao DORA geral | 300 | 46,32 | 3 | < 0,0001 | **< 0,0001** | 0,155 (medio) | Q1 |
| Estrelas (quartis) | Deployment frequency | 300 | 3,66 | 3 | 0,3001 | 1 | 0,012 (pequeno) | Q4 |
| Estrelas (quartis) | Lead time (a) | 299 | 5,04 | 3 | 0,1685 | 1 | 0,017 (pequeno) | Q3 |
| Estrelas (quartis) | CFR (a) | 300 | 1,02 | 3 | 0,7954 | 1 | 0,003 (desprezivel) | Q2 |
| Estrelas (quartis) | Tempo de recuperacao | 283 | 7,05 | 3 | 0,07035 | 0,6332 | 0,025 (pequeno) | Q1 |
| Estrelas (quartis) | Pontuacao DORA geral | 300 | 2,67 | 3 | 0,4462 | 1 | 0,009 (desprezivel) | Q1 |

## Contrastes planejados (Mann–Whitney)

δ > 0: o grupo A tende a ter valores **maiores** que o B. *Favorece*: o grupo
com desempenho melhor, já considerando se a métrica é melhor quando maior ou
menor. *H6*: resultado frente à expectativa da hipótese, quando havia uma.

| Fator | Métrica | A × B | n (A/B) | Mediana A | Mediana B | p (Holm) | δ de Cliff | Favorece | H6 |
|---|---|---|---|---|---|---|---|---|---|
| Linguagem principal | Deployment frequency | TypeScript × C/C++ | 80/20 | 0,844 | 0,259 | 0,2055 | 0,351 (medio) | TypeScript | não confirmada |
| Linguagem principal | Deployment frequency | JavaScript × C/C++ | 29/20 | 0,384 | 0,259 | 1 | 0,124 (desprezivel) | JavaScript | não confirmada |
| Linguagem principal | Deployment frequency | Go × C/C++ | 32/20 | 0,460 | 0,259 | 1 | 0,119 (desprezivel) | Go | não confirmada |
| Linguagem principal | Deployment frequency | Rust × C/C++ | 31/20 | 0,460 | 0,259 | 1 | 0,139 (desprezivel) | Rust | não confirmada |
| Contribuidores (quartis) | Deployment frequency | Q4 × Q1 | 75/75 | 0,518 | 0,441 | 1 | 0,124 (desprezivel) | Q4 | não confirmada |
| Contribuidores (quartis) | Lead time (a) | Q4 × Q1 | 74/75 | 40,885 | 5,304 | **< 0,0001** | 0,651 (grande) | Q1 | **contrariada** |
| Contribuidores (quartis) | CFR (a) | Q4 × Q1 | 75/75 | 0,052 | 0,043 | 1 | 0,082 (desprezivel) | Q1 | não confirmada |
| Contribuidores (quartis) | Tempo de recuperacao | Q4 × Q1 | 74/69 | 2,459 | 1,785 | 1 | 0,057 (desprezivel) | Q1 | — |
| Contribuidores (quartis) | Pontuacao DORA geral | Q4 × Q1 | 75/75 | 2,000 | 3,000 | **0,005048** | -0,308 (pequeno) | Q1 | — |
| Idade em anos (quartis) | Deployment frequency | Q4 × Q1 | 75/75 | 0,364 | 0,882 | **< 0,0001** | -0,492 (grande) | Q1 | confirmada |
| Idade em anos (quartis) | Lead time (a) | Q4 × Q1 | 75/75 | 42,686 | 2,092 | **< 0,0001** | 0,816 (grande) | Q1 | — |
| Idade em anos (quartis) | CFR (a) | Q4 × Q1 | 75/75 | 0,039 | 0,073 | 0,3822 | -0,203 (pequeno) | Q4 | — |
| Idade em anos (quartis) | Tempo de recuperacao | Q4 × Q1 | 70/70 | 3,032 | 1,376 | **0,0438** | 0,290 (pequeno) | Q1 | — |
| Idade em anos (quartis) | Pontuacao DORA geral | Q4 × Q1 | 75/75 | 2,000 | 3,000 | **< 0,0001** | -0,525 (grande) | Q1 | — |
| Estrelas (quartis) | Deployment frequency | Q4 × Q1 | 75/75 | 0,729 | 0,422 | 0,7351 | 0,173 (pequeno) | Q4 | — |
| Estrelas (quartis) | Lead time (a) | Q4 × Q1 | 75/75 | 9,170 | 10,350 | 1 | 0,027 (desprezivel) | Q1 | — |
| Estrelas (quartis) | CFR (a) | Q4 × Q1 | 75/75 | 0,057 | 0,049 | 1 | 0,087 (desprezivel) | Q1 | — |
| Estrelas (quartis) | Tempo de recuperacao | Q4 × Q1 | 71/68 | 2,429 | 2,023 | 1 | 0,153 (pequeno) | Q1 | — |
| Estrelas (quartis) | Pontuacao DORA geral | Q4 × Q1 | 75/75 | 3,000 | 3,000 | 1 | -0,028 (desprezivel) | Q1 | — |

## Mediana (IQR) por grupo

### Linguagem principal

| Grupo | n | Deployment frequency (releases/semana) | Lead time (a) (dias) | CFR (a) (proporcao 0-1) | Tempo de recuperacao (horas) | Pontuacao DORA geral (1 (Low) a 4 (Elite)) |
|---|---|---|---|---|---|---|
| TypeScript | 80 | 0,844 (0,384–1,870) | 8,891 (2,436–19,413) | 0,065 (0,034–0,139) | 2,025 (0,906–3,996) | 3,000 (2,000–3,000) |
| Python | 71 | 0,671 (0,259–1,477) | 5,457 (1,454–18,247) | 0,040 (0,020–0,098) | 2,126 (0,861–5,620) | 3,000 (2,000–3,000) |
| Go | 32 | 0,460 (0,225–0,834) | 23,643 (8,098–41,586) | 0,040 (0,031–0,082) | 3,311 (0,550–5,983) | 2,000 (2,000–3,000) |
| Rust | 31 | 0,460 (0,211–1,506) | 7,463 (2,833–38,108) | 0,085 (0,037–0,169) | 3,946 (1,423–12,148) | 2,000 (2,000–3,000) |
| JavaScript | 29 | 0,384 (0,249–0,863) | 17,810 (4,184–102,316) | 0,040 (0,025–0,083) | 2,459 (1,527–5,207) | 2,000 (2,000–3,000) |
| C/C++ | 20 | 0,259 (0,187–0,897) | 73,937 (10,320–186,673) | 0,045 (0,011–0,110) | 5,000 (2,526–9,353) | 2,000 (2,000–2,250) |
| Outras | 37 | 0,441 (0,269–0,652) | 17,517 (6,996–76,725) | 0,041 (0,013–0,102) | 2,981 (1,096–5,237) | 3,000 (2,000–3,000) |

### Contribuidores (quartis)

| Grupo | n | Deployment frequency (releases/semana) | Lead time (a) (dias) | CFR (a) (proporcao 0-1) | Tempo de recuperacao (horas) | Pontuacao DORA geral (1 (Low) a 4 (Elite)) |
|---|---|---|---|---|---|---|
| Q1 | 75 | 0,441 (0,211–0,863) | 5,304 (0,849–13,103) | 0,043 (0,012–0,108) | 1,785 (0,647–11,148) | 3,000 (2,000–3,000) |
| Q2 | 75 | 0,710 (0,278–1,851) | 8,199 (1,555–20,198) | 0,049 (0,017–0,109) | 2,588 (0,874–5,941) | 3,000 (2,000–3,000) |
| Q3 | 75 | 0,556 (0,269–1,343) | 9,155 (4,195–39,894) | 0,050 (0,028–0,138) | 3,032 (1,085–6,683) | 3,000 (2,000–3,000) |
| Q4 | 75 | 0,518 (0,269–1,227) | 40,885 (13,137–164,974) | 0,052 (0,028–0,110) | 2,459 (1,494–4,315) | 2,000 (2,000–3,000) |

### Idade em anos (quartis)

| Grupo | n | Deployment frequency (releases/semana) | Lead time (a) (dias) | CFR (a) (proporcao 0-1) | Tempo de recuperacao (horas) | Pontuacao DORA geral (1 (Low) a 4 (Elite)) |
|---|---|---|---|---|---|---|
| Q1 | 75 | 0,882 (0,489–2,234) | 2,092 (0,521–6,122) | 0,073 (0,025–0,134) | 1,376 (0,611–3,822) | 3,000 (3,000–3,000) |
| Q2 | 75 | 0,652 (0,259–1,343) | 7,079 (2,568–17,747) | 0,053 (0,032–0,106) | 2,788 (0,969–7,324) | 3,000 (2,000–3,000) |
| Q3 | 75 | 0,384 (0,192–0,911) | 19,422 (7,503–47,059) | 0,047 (0,017–0,136) | 3,233 (1,314–6,989) | 2,000 (2,000–3,000) |
| Q4 | 75 | 0,364 (0,211–0,710) | 42,686 (13,486–211,813) | 0,039 (0,018–0,092) | 3,032 (1,516–5,449) | 2,000 (2,000–3,000) |

### Estrelas (quartis)

| Grupo | n | Deployment frequency (releases/semana) | Lead time (a) (dias) | CFR (a) (proporcao 0-1) | Tempo de recuperacao (horas) | Pontuacao DORA geral (1 (Low) a 4 (Elite)) |
|---|---|---|---|---|---|---|
| Q1 | 75 | 0,422 (0,221–1,093) | 10,350 (2,816–35,711) | 0,049 (0,015–0,143) | 2,023 (0,600–4,143) | 3,000 (2,000–3,000) |
| Q2 | 75 | 0,499 (0,249–1,179) | 16,648 (5,702–40,260) | 0,048 (0,027–0,108) | 3,035 (1,330–5,727) | 2,000 (2,000–3,000) |
| Q3 | 75 | 0,556 (0,230–1,208) | 8,891 (2,156–42,852) | 0,049 (0,025–0,104) | 3,099 (1,288–9,112) | 3,000 (2,000–3,000) |
| Q4 | 75 | 0,729 (0,278–1,697) | 9,170 (3,297–39,728) | 0,057 (0,025–0,134) | 2,429 (1,038–5,651) | 3,000 (2,000–3,000) |

## Exploratória: contribuidores × idade

Fora das famílias de Holm; serve para interpretar os testes acima. Fatores
correlacionados entre si podem levar o efeito um do outro: o ρ parcial
mede a associação de um fator com a métrica **mantida a idade (ou os
contribuidores) constante**.

| Fatores | n | ρ | p |
|---|---|---|---|
| Contribuidores × Idade | 300 | 0,603 | < 0,0001 |
| Contribuidores × Estrelas | 300 | 0,173 | 0,002673 |
| Idade × Estrelas | 300 | -0,069 | 0,2347 |

| Métrica | Fator | ρ simples | ρ parcial (controlando o outro) | p (parcial) |
|---|---|---|---|---|
| Deployment frequency | Contribuidores | 0,066 | 0,337 | < 0,0001 |
| Deployment frequency | Idade | -0,314 | -0,444 | < 0,0001 |
| Lead time (a) | Contribuidores | 0,415 | 0,073 | 0,2081 |
| Lead time (a) | Idade | 0,613 | 0,500 | < 0,0001 |
| CFR (a) | Contribuidores | 0,049 | 0,152 | 0,008534 |
| CFR (a) | Idade | -0,118 | -0,185 | 0,001285 |
| Tempo de recuperacao | Contribuidores | 0,016 | -0,108 | 0,06982 |
| Tempo de recuperacao | Idade | 0,169 | 0,199 | 0,0007667 |
| Pontuacao DORA geral | Contribuidores | -0,194 | 0,065 | 0,2621 |
| Pontuacao DORA geral | Idade | -0,401 | -0,362 | < 0,0001 |

## Como refazer

```bash
cd Lab3/Sprint01
npm run analise:rq06
python scripts/conferir_rq05_rq06.py   # opcional: confere com o scipy
```
