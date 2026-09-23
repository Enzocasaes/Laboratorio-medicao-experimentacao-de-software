# Kata 01 — Normalizador de mini-formato de notas

## Contexto

Um app de anotações usa um mini-formato de texto próprio: títulos começam com
`# `, itens de lista começam com `- ` (ou, por descuido de quem digitou,
`* `), e blocos são separados por uma linha em branco. Notas exportadas de
fontes diferentes chegam "sujas" — espaços duplicados, marcador de item
inconsistente, título em minúsculas, espaço sobrando no fim da linha, blocos
separados por 2+ linhas em branco. A função `normalizarNotas` limpa isso.

## Assinatura

```js
normalizarNotas(texto: string): string
```

## Regras

1. Remove espaços/tabs no **fim** de cada linha.
2. Colapsa 2 ou mais espaços seguidos (inclusive de indentação) em **um**
   espaço, ex.: `"  *   item"` → `" - item"`.
3. Qualquer linha cujo conteúdo (após a indentação) comece com `* ` vira
   `- ` (mesma indentação, resto da linha preservado).
4. Em linhas de título (começam com `# `), capitaliza a **primeira letra** do
   texto do título; o resto da linha não muda.
5. Duas ou mais linhas em branco seguidas colapsam em **exatamente uma**
   linha em branco (separador de bloco).
6. Linhas em branco no **início** ou no **fim** do texto são removidas.

## Exemplos

**Entrada:**
```
#   titulo principal
*  primeiro item
*    segundo item   


- terceiro item
```

**Saída:**
```
# Titulo principal
- primeiro item
- segundo item

- terceiro item
```

**Entrada:** `"# ola"` → **Saída:** `"# Ola"`
