# Design — Filtro e gestão de tags para Skills, Bases e Projetos

Data: 2026-11-01
Status: aprovado nas seções 1–3 (dados/IPC, interface, erros/testes)

## Objetivo

Permitir categorizar e organizar Skills (e também Bases e Projetos) com tags livres do
usuário: atribuir tags nos cards, filtrar a grade por tags e renomear/apagar tags em massa.

## Decisões

- **Tags livres do usuário**, sem categorias fixas nem autocategorização.
- **Chips de tags no topo** da grade em cada aba, multi-seleção com semântica **E**
  (o item precisa ter todas as tags selecionadas). A busca textual existente combina com
  o filtro também por E.
- **Popover no próprio card** para editar tags, salvando imediatamente.
- **Gestão global de tags** (renomear/apagar) valendo para os três tipos de item.
- **Filtro não persiste** entre sessões: reinicia zerado a cada abertura do app.
- Sem migração de dados: `Skill`, `BaseItem` e `ProjectRef` já têm `tags: string[]` e
  `favorite`; o `library.json` continua na versão 2.

## Tags: normalização e identidade

- Entrada passa por trim nas bordas e colapso de espaços internos repetidos.
- Identidade é case-insensitive (`Docs` e `docs` são a mesma tag); a primeira grafia
  usada é a preservada ao gravar.
- Tags vazias são rejeitadas.
- Não existe lista separada de tags em `library.json`: as tags vivem nos itens. Uma tag
  sem nenhum item simplesmente deixa de aparecer nos chips.

## Dados e IPC

Todos os handlers devolvem `{ ok: true, data } | { ok: false, error }`, validam entrada
com Zod e seguem `src/shared/schemas.ts` / `src/shared/types.ts`.

| Canal | Estado | Contrato |
|---|---|---|
| `skill:update` | novo | `{ id, patch: { tags?, favorite? } }` → `Skill` |
| `base:update` | novo | `{ id, patch: { tags?, favorite?, name?, description? } }` → `BaseItem` |
| `project:update` | estendido | patch aceita também `tags?` e `favorite?` → `ProjectRef` |
| `tags:rename` | novo | `{ from, to }` → `null`; reescreve a tag em skills, bases e projetos |
| `tags:delete` | novo | `{ name }` → `null`; remove a tag de todos os itens |

Regras:

- `skill:update` não altera nome/descrição: esses campos vêm do frontmatter do
  `SKILL.md` e o app nunca modifica o arquivo original.
- `tags:rename` falha se `from` não existir ou se `to` já existir (comparação
  case-insensitive) — sem merge implícito.
- `tags:delete` falha se a tag não existir.
- `base:update` aplica ao nome a mesma validação de `BaseInput`
  (`isSafeDirectoryName`), já que o nome vira destino de clone.
- `skillsScan` continua preservando `tags` e `favorite` já gravados na
  re-sincronização (comportamento atual, coberto por teste de regressão).

## Interface

### Barra de chips

Posicionada abaixo do cabeçalho de cada seção (Skills, Bases, Projetos), acima do
conteúdo.

- Mostra as tags existentes naquela aba com contagem total de itens (`documentação (12)`).
  A contagem é sempre sobre a aba inteira, sem considerar os filtros ativos.
- Clique alterna a seleção; tags ativas ficam visualmente destacadas.
- Ordenação: contagem decrescente, empate em ordem alfabética.
- Um chip **Limpar** aparece quando há tags selecionadas e zera a seleção.
- Ícone de engrenagem **Gerenciar tags** abre a gestão global.

### Popover de edição no card

Presente nos cards de Skill, Base e Projeto.

- Área de tags clicável abre o popover com: input de nova tag, sugestões das tags já
  existentes em qualquer um dos três tipos (universo global de tags) conforme digita,
  chips atuais com X para remover.
- `Enter` confirma a tag; clique fora ou `Esc` fecha o popover.
- Cada alteração salva imediatamente via `skill:update` / `base:update` /
  `project:update` (sem botão Salvar).
- O card também ganha um botão de favoritar (estrela) usando o mesmo `patch.favorite`.

### Gestão global (dialog)

Aberto pela engrenagem da barra de chips.

- Lista as tags existentes nos três tipos de item com quantos itens usam cada uma.
- **Renomear**: campo inline; valida unicidade e aplica via `tags:rename`.
- **Apagar**: pede confirmação antes de `tags:delete` (vale para as três abas).
- Renomear atualiza a seleção ativa do filtro para o novo nome; apagar remove a tag da
  seleção ativa.

## Erros

- Toast na UI (mecanismo existente em `App.tsx`) para toda falha de handler; a tela
  nunca trava.
- Casos cobertos: tag inexistente no rename/delete, rename para tag já existente, item
  não encontrado nos updates, falha de gravação (o `library-store` já escreve com
  escrita atômica e backup).

## Testes

- `library-store`: tags persistidas após `skill:update`, `base:update`,
  `project:update`; `tags:rename` e `tags:delete` reescrevendo nos três tipos e em
  nada além deles.
- Normalização de tags: trim, espaços internos, case-insensitive, preservação da
  primeira grafia, rejeição de vazio.
- `skillsScan` preserva `tags`/`favorite` de skills já existentes.
- Validação Zod dos novos patches e dos canais `tags:rename` / `tags:delete`.

## Aceite

Com o app aberto, o usuário consegue:

1. Atribuir e remover tags em skills, bases e projetos pelos cards.
2. Filtrar a grade por 2+ tags com semântica E, combinando com a busca textual.
3. Ver os contadores por tag e usar Limpar para zerar o filtro.
4. Renomear uma tag e ver a mudança refletida nas três abas.
5. Apagar uma tag com confirmação e vê-la sumir dos itens.
6. Fechar e reabrir o app com todas as tags gravadas.

## Fora de escopo

- Cores, ícones ou ordem manual de tags.
- Persistência do filtro/seleção entre sessões.
- Tags como entidades normalizadas em `library.json` (migração para tags por id).
- Sugestão automática de tags a partir do conteúdo do `SKILL.md`.
- Filtro de favoritos como coleção própria.
