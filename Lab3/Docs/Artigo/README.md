# Artigo — Lab03, Mineração de Métricas DORA

**PDF compilado:** [Artigo-Lab03-DORA.pdf](Artigo-Lab03-DORA.pdf) (20 páginas, template SBC).

**Fonte LaTeX (Overleaf):** https://www.overleaf.com/project/6ad969741c55ba536f1e662c

O `.tex` é editado no Overleaf, e não neste repositório. Depois de cada
alteração relevante, recompile e substitua o PDF aqui, para que o grupo
replicador e o professor leiam sempre a mesma versão que está no board.

## Arquivos desta pasta

| Arquivo | O que é |
|---|---|
| [Artigo-Lab03-DORA.pdf](Artigo-Lab03-DORA.pdf) | o artigo compilado — **a entrega** |
| [01-Introducao.md](01-Introducao.md) | rascunho da Introdução e das hipóteses informais (Lab03S01) |
| [02-Metodologia-Validacao-Manual.md](02-Metodologia-Validacao-Manual.md) | rascunho da subseção de validação manual (Lab03S02) |
| [03-Metodologia-CFR-Entrega.md](03-Metodologia-CFR-Entrega.md) | rascunho da subseção da heurística corretiva e do CFR (b) (Lab03S02) |
| [04-Resultados-Discussao-RQ05-RQ06.md](04-Resultados-Discussao-RQ05-RQ06.md) | rascunho de Resultados e Discussão da RQ 05 e da RQ 06 (Lab03S03) |

Os `.md` são **rascunhos** que alimentaram o texto do Overleaf; o PDF é a
versão vigente. Quando os dois divergirem, vale o PDF.

Os números do artigo vêm dos arquivos gerados pelo próprio pipeline, em
[`Lab3/Sprint01/docs/`](../../Sprint01/docs/) e
[`Lab3/Sprint01/data/processed/`](../../Sprint01/data/processed/) — fonte única,
para que qualquer número do texto possa ser rastreado até o CSV que o produziu.

## Pendências conhecidas no PDF atual

- **As citações aparecem como `[?]`** em todo o texto, e a seção Referências
  ainda lista os exemplos do template (Boulic & Renault, Knuth, Smith & Jones)
  em vez das referências reais (Forsgren et al. 2018; relatórios DORA; Wohlin
  et al. 2012; Landis & Koch 1977; Romano et al. 2006; Holm 1979;
  Bonett & Wright 2000; Cliff 1993; documentação da API do GitHub). Falta
  popular o `.bib` e rodar BibTeX no Overleaf.
- O segundo autor está como **"Cauê"**, sem sobrenome.
- A seção de **Replicação cruzada** ainda não existe — é da entrega final,
  depois que o professor sortear o pipeline a ser replicado.
