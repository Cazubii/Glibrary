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

## 2026-11-01 — Tags de Skills/Bases/Projetos

### Identidade case-insensitive com preservação da primeira grafia
`Docs` e `docs` são a mesma tag; a grafia do primeiro uso é a gravada. Renomear para a
mesma tag com grafia diferente é permitido (ajuste de caixa); renomear para OUTRA tag
existente é erro, sem merge implícito.

### Tags vivem nos itens, sem lista própria em library.json
Cada item guarda `tags: string[]`; uma tag sem itens apenas não aparece nos chips.
Evita migração de dados e estado duplicado.

### skill:update e base:update aninhados; project:update estende o contrato plano
Os canais novos usam `{ id, patch }`; o `project:update` existente permanece plano
(`{ id, ...campos }`) e ganha `tags`/`favorite`.

### Saves do LibraryStore serializados
Atualizações rápidas (edições de tags em sequência) enfileiram `save()` numa cadeia de
promises para não intercalar escrita/renomeação do `library.json.tmp`.

## 2026-11-04 — Categorias e separação Skill/Agent

### Agents como entidade própria descoberta por pastas dedicadas
Novo tipo `Agent` em `library.json` (campo `agents`), descoberto por `agents:scan` nas
`agentFolders` (padrão: `~/.claude/agents`, `~/.opencode/agent`, `~/.agents/agents`). Cada
arquivo `.md` (raiz ou subpastas, exceto `SKILL.md`) vira um agente; `name`/`description`/
`category` vêm do frontmatter ou do nome do arquivo. Skills permanecem restritas a
`SKILL.md` — os dois domínios nunca se misturam.

### Categoria é lista fixa com default, não tag
Categorias (`AssetCategory`: design, banco de dados, código, frontend, backend, testes,
devops, documentação, outros) são um enum fechado com default `outros`, aplicado a Skills e
Agents. Valor desconhecido no frontmatter cai em `outros` em vez de invalidar o item. O
arquivo continua em `version: 2`: os campos novos têm default no schema Zod, então v2
existente migra sem bump de versão. A categoria é projetável (chips de filtro por aba) e
editável no cartão; tags seguem livres para o resto.

### Agentes não entram na engrenagem de associação de projetos
`agent:remove` fica independente (sem limpeza de `skillIds` em projetos) e `tags:rename`/
`tags:delete` passam a percorrer Skills, Agents, Bases e Projetos juntos.

## 2026-11-04 — Top repos do GitHub

### "Top" via Search API com janela de 30 dias, não endpoint de trending
A API do GitHub não expõe trending. Usamos `search/repositories` com
`created:>=<hoje-30d>&sort=stars&per_page=25` como aproximação de "em alta". O limite é de 25
repositórios por busca; o token (via `safeStorage`) é usado quando configurado.

### Busca no startup em segundo plano com broadcast; lista cacheada em library.json
`refreshTopReposAndBroadcast` roda ~1,5s após `whenReady` (não bloqueia a janela), grava em
`topRepos` (campo novo com default vazio — continua `version: 2`) e envia
`topRepos:changed` para todas as janelas. Falha de rede/limite de API é silenciosa no
startup: a aba mantém a última lista persistida e o usuário pode "Atualizar agora" na aba.

### Adicionar ao catálogo não clona
O card de top repo adiciona o item via `repo:addByUrl` (`clone: false`), indo para o catálogo
como repos não clonado; clonagem fica como ação posterior padrão do Repos.

## 2026-11-04 — Dashboard de uso

### Agents associáveis a projetos (`agentIds`)
Para medir "agents que uso", `ProjectRef` ganhou `agentIds` (default `[]` — migração de `v2`
existente é automática pelo default no schema). `projects:update` aceita e valida `agentIds`
como já fazia com `skillIds`/`baseIds`; `agents:remove` limpa associações nos projetos.

### Agregação pura em `shared/dashboard.ts` (sem IPC novo)
O dashboard reusa `assets:get` (dados já carregados) e calcula tudo no renderer com
`computeDashboardData`: top-10 de skills/agents por nº de projetos, distribuição de usos por
`AssetCategory`, cobertura (`projectsWithSkills/Agents`), itens sem uso, tags de projetos e
projetos mais antigos com suas contagens. Função pura = testável sem Electron/janela.

### Gráficos em SVG/CSS próprios em vez de biblioteca (recharts etc.)
Barras horizontais e rosca de categorias são componentes SVG puros (`components/charts.tsx`).
Evita dependência nova (React 19 + peso bundle) e usa as cores do tema.

## 2026-11-04 — Big batch: notificações, import do GitHub, coleções, validação

### Eventos de uso e gráfico mensal em vez de rastrear uso implícito
"Usar" é multívoco; optamos por registrar eventos explícitos (`usage[]` na v2, cap 500): abrir
uma Skill (`skills:open`) ou Agent (`agents:open`) grava `{ kind, assetId, at }`. `skills:scan`
e `agents:scan` agora devolvem `{ items, issues }` para alimentar o painel de validação. Exibir
"alternativas" do dashboard por categoria/favoritos é uma opção filtros (segundo argumento de
`computeDashboardData`), não um estado separado.

### Import de SKILL.md/agents direto do repo do GitHub (sem clonar o repo inteiro)
`skills:import` baixa o `SKILL.md` da raiz (raw.githubusercontent, branch default com fallback
`HEAD`) para `<skillFolders[0]>/<repo>/SKILL.md`; `agents:import` lista `contents/.claude/agents`
(ou `agents/`) pela API de conteúdo e baixa os `.md` (cap 10) para `<agentFolders[0]>/<repo>`.
Sem violar a regra de nem sempre clonar: import filtrado e barato.

### Coleções (kits) como associações derivadas, não tags disfarçadas
`Kit { skillIds, agentIds, baseIds, tags }` na v2. `kits:apply` faz união das associações no
projeto; a herança de tags segue `settings.inheritTags` (default true) e pode ser desligada por
aplicação. `tags` do projeto passam a ganhar as tags dos itens ao associar manualmente no card
de projeto (mesma setting). Projetos ganham o campo `agentIds` que o dashboard já usava.

### Verificação de desatualização no startup: fetch sob demanda, com limite
O banner da Biblioteca no startup chama `repo:fetchStatus` para no máximo 12 repos clonados
(instalação) e mostra "Puxar todos" quando há commits atrás; desativável em
`settings.checkUpdatesOnStart`. Sem fetch global no bootstrap para não travar o startup com
12 chamadas de rede executadas em série, todas com falha tolerada por repo.

### Top GitHub já na biblioteca e duplicação evitada por URL normalizada
A página compara `topRepo.remoteUrl` (e URLs de repos/bases) via `normalizeGitUrl`; cards de
itens existentes ficam desabilitados. Import skill/agents marcados por repo evita repetir.

### Export do dashboard passa pelo dialog do main (não pelo renderer)
`dashboard:export` recebe o Markdown (compartilhado, puro: `buildDashboardMarkdown`) e usa
`dialog.showSaveDialog` + `writeFile` no processo main — o renderer continua sem acesso a fs.

## 2026-11-04 — Busca GitHub por tema

### "Melhor repo para meu problema" = search/repositories com sort=stars
Página própria (navegação "Busca") com consulta livre: `GET search/repositories?q=<tema>
[+language:X]&sort=stars&order=desc&per_page≤50`. Diferente do "Top GitHub" (repos criados
nos últimos 30 dias), a busca responde à pergunta "qual é o mais bem avaliado para X".
Reutilizamos `parseTopReposResponse` (mesma resposta da busca de em alta) e o `TopRepoCard`
com as ações existentes: adicionar ao catálogo, importar skill/agents e comparação por
`normalizeGitUrl` para marcar o que já está na biblioteca. Sem token o GitHub permite
10 buscas/min; token (safeStorage) sobe para 30/min.

## Painel de Agentes (2026-11-11)

Decisão: painel dedicado à página "Agentes" para criar perfis de agentes de IA
(CLI + repositório + args) e lançar execuções paralelas (sub-agentes) monitoradas ao vivo.

- `AgentRunManager` modelado no `ProcessManager`, indexado por `runId` (não `repoId`),
  permitindo N execuções simultâneas por perfil.
- Perfis ficam no `library.json` v2 (`agentProfiles`); execuções em `agent-runs.json`
  com snapshot do nome do perfil; logs em `logs/agents/<runId>.log` com rotação (200).
- Prompt inicial vai como argumento citado do comando, sem stdin; comandos só rodam
  com ação explícita do usuário.
- Dois modos de visualização (Painel/Grid) persistidos em `settings.agentsViewMode`.
