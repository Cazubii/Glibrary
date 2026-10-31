# Decisões do projeto

Registro de decisões tomadas durante a execução (diretriz 12 da spec).

## 2026-10-30 — Fase 0

### Scaffold manual em vez de `pnpm create @quick-start/electron`
O scaffolder oficial é interativo e trava em shells não-TTY. Estrutura equivalente ao template
`react-ts` (main/preload/renderer com electron-vite) foi criada manualmente, já alinhada à
estrutura de pastas da seção 4 da spec.

### Zod v4
O `pnpm add zod` instalou a v4 (`z.record` exige schema de chave explícito). Adaptado nos schemas.

### TypeScript 6 em vez de 7
O `pnpm add typescript` instalou a v7.0, ainda não suportada pelo typescript-eslint.
Fixado em `typescript@6` (mais recente suportado).

### CSP
`style-src 'unsafe-inline'` é necessário para o Tailwind/React aplicarem estilos inline em
dev; todo o resto é restrito a `'self'`.

### Commit da Fase 0 em um único commit
Os itens do checklist da Fase 0 são interdependentes (o gate `typecheck && lint && test`
exige todos os arquivos juntos). Um único `feat(fase-0)` cobre a fase.

## 2026-10-30 — Fase 1

### Window.api declarado em `env.d.ts` do renderer
`src/preload/index.d.ts` conflitava com `src/preload/index.ts` (mesmo basename). A
declaração global de `Window.api` foi movida para `src/renderer/src/env.d.ts`, com o tipo
`GlibraryApi` em `src/shared/types.ts`.

### Zod: `RepoPatchSchema` sem `id`
`repo:update` recebe `{ id, patch }`. `RepoUpdateInputSchema` (patch + id obrigatório)
substitui o merge frágil que deixava `id` opcional.

### React/Vite: `dedupe` + `optimizeDeps`
O zustand e o React entravam em grafos de dependência separados do Vite ("Invalid hook
call"). Fix: `resolve.dedupe: ['react','react-dom']` e `optimizeDeps.include` no renderer.

## 2026-10-30 — Fase 4

### `ahead`/`behind` vindos direto do `status()` do simple-git
`FetchStatus` não usa `rev-list` (não existe como método tipado no `SimpleGit`). O
`StatusResult` do simple-git já expõe `ahead`, `behind` e `isClean()`, então após
`fetch(['--all','--prune','--quiet'])` lemos esses campos diretamente.

### Progresso do clone com `SimpleGitProgressEvent`
O tipo é `SimpleGitProgressEvent` (não `ProgressResult`, que não é exportado). O clone
informa `method`, `stage`, `progress`; só repassamos eventos de `method === 'clone'`.

### `remote(['get-url','origin'])` pode retornar `void | string`
`getRemoteUrl` faz `typeof result === 'string' ? result.trim() : null` e captura erros,
pois o repositório pode não ter `origin`.

### Normalização de URL no renderer
`AddRepoDialog` prefixa `https://` quando o usuário cola `github.com/owner/repo` sem
esquema (seção 12.3). A validação/normalização definitiva continua no main via
`normalizeGitUrl`.

## 2026-10-30 — Fase 5

### `tools-checker` com `shell: true` só porque a lista é fixa
No Windows, `npm`, `pnpm`, `code` etc. são `.cmd` e exigem shell. Como os comandos vêm de
uma whitelist fixa (seção 8), não há entrada do usuário no shell. O Node 24 emite um
`DeprecationWarning` (DEP0190) sobre args com shell — benigno; se incomodar, trocar por
`where` + `execFile` sem shell.

### Versão extraída por regex genérica
Em vez de regex por ferramenta, usamos `/\d+\.\d+(?:\.\d+)?/` no stdout+stderr combinados
(`java -version`, por exemplo, escreve no stderr). Python tenta `python`, `python3`, `py`.

### Scanner separa descoberta de metadados git
`scanFolders` só varre o disco (testável sem git); a leitura de `origin`/branch é injetada
via `readGit` no IPC. A detecção completa roda na importação, não no scan, para manter o
aceite de <10s.

### Duplicata por URL com pasta diferente não pergunta — apenas marca
A spec sugere perguntar quando a URL é igual mas a pasta difere. Para simplificar a v1, o
`ScanDialog` mostra esses itens como "já na biblioteca" (desmarcados). Registrado como
simplificação; pode virar diálogo depois.

### Onboarding marcado em `localStorage`
Não há campo de settings para "onboarding concluído". Usamos `glibrary.onboardingDone` no
`localStorage` do renderer para não repetir a tela após "Pular".

### Novos canais IPC
`scan:import` e `onboarding:suggest` foram adicionados além da lista da seção 10 para
importar em lote e sugerir pastas sem duplicar chamadas.

## 2026-10-30 — Fase 6

### "Desinstalar dependências" apaga pastas conhecidas
Não há um comando universal de desinstalação. Removemos `node_modules`, `.venv` e `venv`
quando existem e voltamos o status para `cloned`. Nunca mexe em `target/dist` (saída de
build, não dependência).

### Remoção com confirmação digitada
O `RepoDetailPage` exige digitar o nome exato do repositório. Há duas opções: remover só da
biblioteca (mantém a pasta) ou remover e apagar a pasta do disco (via `shell.trashItem`, que
manda para a lixeira em vez de deletar de vez).

### Exportar/importar mantém as configurações atuais
A importação traz apenas os repositórios, deduplicando por URL local/remota normalizada e
por `id`. As `settings` do arquivo importado são ignoradas para não sobrescrever as do
usuário.

### Ícone a partir de um PNG 512×512
`resources/icon.png` é gerado localmente; o electron-builder converte para `.ico` no
Windows. `win/mac/linux.icon` apontam para ele.

### `dist/` fora do git
O instalador é artefato de build; `.gitignore` já cobre `dist/`. O `resources/icon.png` é
versionado.

## Sugestões

(itens fora do escopo da v1 — não implementar, conforme seção 14 da spec)

## 2026-10-30 — Fases 7–9 (biblioteca v2)

### `library.json` v2 separa Skills, Bases e projetos de contexto
Os repositórios v1 com pasta local migram para `ProjectRef`, preservando id, nome, descrição,
caminho, URL, tags, favoritos e notas; as associações começam vazias. Itens sem pasta local e
com URL remota migram para `BaseItem`, preservando seus metadados. A migração é gravada no
primeiro carregamento bem-sucedido para não depender de uma edição posterior.

### Pastas de Skills padrão e descoberta por `SKILL.md`
As origens padrão são `~/.claude/skills`, `~/.opencode/skills` e `~/.agents/skills`, com opção
de adicionar outras pastas. A descoberta considera `SKILL.md` na raiz ou em pastas filhas
diretas; lê `name` e `description` do frontmatter e nunca modifica o arquivo original.

### Projetos não executam comandos na v2
Os handlers de processos, scanner de repositórios e checagem de ferramentas deixaram de ser
registrados no bootstrap. As implementações permanecem no código legado para referência e
podem ser removidas após a compatibilidade de backups v1 deixar de precisar de `RepoSchema`.

### Clone de Base usa a pasta configurada
O clone vai para `settings.basesRoot`, inicializada como `~/BASES`. Remover uma Base da
biblioteca não apaga a pasta local.
