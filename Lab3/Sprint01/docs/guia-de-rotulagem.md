# Guia de rotulagem da amostra-ouro

Este guia é para quem vai preencher `data/processed/rotulos_<seu-nome>.csv`.
Leia antes de começar. Os três avaliadores usam o mesmo guia; fora isso, cada
um trabalha **sozinho**.

> Proposta da Pessoa A para o grupo. Se o grupo mudar algum critério, mude
> **antes** de alguém começar a rotular e registre a mudança no commit. Mudar
> o critério no meio da rotulagem invalida o kappa.

## Regras de independência

1. **Não converse** sobre casos específicos com os outros avaliadores até os
   três terminarem.
2. **Não abra** `docs/validacao-manual.md`, `processed/consenso*.csv` nem
   `processed/heuristica*.csv` antes de terminar. Eles mostram a saída da
   heurística e os rótulos dos outros.
3. Não copie a planilha de outro avaliador. Cada um parte da sua cópia em branco.
4. Commite **só o seu arquivo**, na sua Issue.

## Como preencher

- Uma linha por release. As colunas `tipo_do_projeto` e
  `releases_sao_entrega_real` são do **repositório**: basta preenchê-las em uma
  das linhas dele. Se preencher em mais de uma, use o mesmo valor; valores
  diferentes anulam o rótulo.
- Não altere as colunas de identificação (`full_name`, `release_id`,
  `tag_name`…) nem apague linhas.
- Use exatamente os valores abaixo (maiúsculas e acentos não importam).
- Dúvida ou caso estranho: decida mesmo assim e explique na coluna
  `observacao`. Ela é lida na reunião de consenso.
- Para conferir a planilha a qualquer momento: `npm run validacao` e depois
  abra só `processed/rotulos_problemas.csv`, filtrando pelo seu nome.

## (i) `tipo_do_projeto` — o que o repositório é

Escolha pelo **uso principal** declarado no README e na página do repositório.

| Valor | Quando usar | Exemplos de sinal |
|---|---|---|
| `biblioteca/framework` | É importado ou usado como dependência por código de outra pessoa | instruções de `npm install`, `pip install`, `go get`; API documentada; "library", "framework", "SDK" |
| `aplicacao/servico` | Usuário final executa ou acessa como produto: app desktop/mobile, site, servidor, serviço auto-hospedado | instaladores, imagens Docker para rodar o serviço, screenshots de interface |
| `ferramenta cli` | Programa de linha de comando usado diretamente pelo usuário | README centrado em comandos de terminal; binário único |
| `outro` | Nada acima é o uso principal: listas *awesome*, tutoriais, livros, dotfiles, modelos de IA, coleções de dados, documentação | — |

Desempate: se o projeto tem as duas coisas (ex.: uma CLI construída sobre uma
biblioteca do mesmo repositório), escolha a que o README apresenta **primeiro**.

## (ii) `releases_sao_entrega_real` — a release chega ao usuário?

Olhe a página de releases do repositório como um todo, não uma release só.

| Valor | Quando usar |
|---|---|
| `sim` | Cada release publica algo que o usuário consome: binários/instaladores anexados, pacote publicado em registro (npm, PyPI, crates.io…), imagem de contêiner, versão nova do app |
| `nao` | As releases não entregam nada consumível: marcos internos, snapshots automáticos de documentação ou de listas, releases sem artefato e sem pacote correspondente |
| `incerto` | Não dá para saber pelas fontes públicas |

## (iii) `release_corretiva` — a release corrige um defeito recente?

Para cada uma das 5 releases sorteadas, abra o link (`release_url`), leia as
*release notes* e a lista de commits desde a release anterior (link
"compare" na página da release). Use só `sim` ou `nao`.

- `sim`: o **objetivo principal** da release é corrigir um defeito que já
  estava em uma versão publicada (bug, regressão, crash, falha de segurança,
  build quebrado), ou desfazer uma mudança que deu problema (*revert*,
  *rollback*, *hotfix*).
- `nao`: a release traz principalmente funcionalidade nova, melhorias,
  atualização de dependências, documentação ou manutenção, **mesmo que inclua
  algumas correções** junto.

Cuidados:

- **Não decida pelo número da versão.** Uma versão *patch* (`1.2.3 → 1.2.4`)
  pode não ser corretiva, e uma *minor* pode ser. O número da versão é
  exatamente o que a heurística usa; o seu rótulo é a referência para medir se
  ela acerta.
- Notas vazias: decida pelos commits. Sem notas e sem commits legíveis, decida
  pelo que for mais provável e escreva o motivo em `observacao`.
- Release só de atualização de dependências por segurança (ex.: Dependabot
  corrigindo uma CVE): `sim` se a release existe por causa da vulnerabilidade;
  `nao` se é atualização de rotina.

## Depois que os três terminarem

1. `npm run validacao` calcula o kappa e gera `processed/consenso_pendentes.csv`.
2. Na reunião, discutam cada linha. Para registrar uma decisão, copie a linha
   para `processed/consenso_reuniao.csv` e preencha `rotulo_consenso`,
   `justificativa`, `participantes` e `data_reuniao`.
3. Rode `npm run validacao` de novo até não sobrar caso bloqueante.
