# Decisões do projeto

## 2026-11-13 — F0 Limpeza

### Especificação v1 mantida como histórico
`docs/arquivo/GLIBRARY_SPEC.md` registra a implementação original. README, AGENTS e este arquivo são a documentação viva da versão v2.

### Onboarding legado preservado para a F2
`src/renderer/src/components/Onboarding.tsx` continua no repositório para ser revisto e reaproveitado na primeira experiência guiada. A F2 deve adaptar o componente ao novo fluxo antes de decidir qualquer remoção.

## 2026-11-13 — F1 Navegação por intenção

### Cinco áreas principais agrupam as telas existentes
O shell do app passa a abrir em **Início** e apresentar **Projetos**, **Biblioteca**, **Descobrir** e **Agentes**. Projetos locais e do GitHub ficam em subáreas; Skills, agentes e Bases ficam em Biblioteca; busca, Top GitHub e análise ficam em Descobrir; execuções e consumo ficam em Agentes. Ferramentas, tema e preferências ficam em Configurações.

### Visibilidade de recursos avançados é uma preferência persistida
`settings.showAdvancedResources` controla Coleções, Análise e Consumo detalhado. Até o mantenedor escolher se o modo simples deve ser o padrão, bibliotecas novas e existentes usam `true` para manter todas as funções visíveis; essa compatibilidade não fecha a decisão de produto. A migração v2 mescla o valor padrão e preserva os demais dados.

### Início mostra os projetos locais recentes
A lista deriva de `assets:get`, ordena pelo campo `addedAt` e limita a quatro itens. O botão abre a área Projetos. O checklist de cinco passos e o assistente persistente de primeira abertura ficam para F2.

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

### Verificação remota de repositórios: manual por padrão
A Biblioteca não executa `git fetch` ao abrir. O usuário pode verificar até 12 projetos pelo
botão e ativar a checagem automática em `settings.checkUpdatesOnStart`. A lista de commits atrás
mantém a ação explícita "Puxar todos"; nenhum pull é automático.

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

## 2026-11-08 — Top GitHub por ecossistema de agente

### Filtros de escopo na aba Top: Todos, Claude, Codex, OpenCode
A aba Top ganhou escopos por ecossistema (`TopScope`: `all`, `claude`, `codex`, `opencode`).
Cada escopo busca em `search/repositories` por topics fixos em `SCOPE_TOPICS` (ex.:
claude → `topic:claude-code`; codex → `topic:openai-codex` + `topic:codex-cli`; opencode →
`topic:opencode`). Qualifiers `topic:` repetidos são AND no GitHub (verificado na API), então
os escopos usam uma busca por topic `buildScopeUrls` e `fetchTopRepos` mescla os resultados
(dedupe por URL normalizada, ordenação por estrelas, `slice(limit)`) antes de persistir.

### Escopo por `pushed` na janela em vez de `created`
Os ecossistemas concentram repos antigos e ativos; filtrar por `created:` esconderia os
relevantes. Por isso os escopos usam `pushed:>=<hoje-Nd>` (atividade na janela) com
`sort=stars`, enquanto `all` mantém a semântica de "criado nos últimos N dias".

### Caches de escopo em `topReposScopes` (chave `scope:windowDays`)
Cada combinação escopo+janela persiste em `topReposScopes` na `library.json` v2 (campo novo
com default `{}` — migração automática sem bump de versão). `topRepos`/`topRepos7`
continuam reservados ao escopo `all`. O `getTopRepos`/`setTopRepos` passam a considerar
`scope`; IPC `topRepos:get`/`topRepos:refresh` e o broadcast `topRepos:changed` carregam o
escopo, e o renderer cacheia por `janela:escopo` (busca sob demanda ao trocar de chip).

## 2026-11-08 — Análise de repositório por URL

### Análise heurística de metadados públicos, não revisão de código
Nova página "Análise" (nav do header): o usuário cola a URL do GitHub e o sistema converte
4 chamadas públicas da API (`/repos/{o}/{r}`, `/readme`, `/contributors?per_page=100`,
`/releases?per_page=100`) em uma ficha básica em pt-BR (estrelas, forks, issues, linguagem,
licença, datas, topics, README, contribuidores, releases/12 meses) com listas de pontos
positivos/negativos. `buildRepoAnalysis` é puro e testável com payloads falsos; falhas de
readme/contributors/releases são toleradas (fallback null), falha na chamada base propaga.
Regras divulgadas ao usuário como heurísticas (rodapé da página), sem prometer análise
semântica de código.

### Auto-categorização de Agents na importação
Categorias fixas por enum ganharam inferência por palavras-chave (`inferAssetCategory`,
pt/en, match por fronteira de palavra, prioridade específico→genérico) aplicada em
`discoverAgents` quando o agente novo não declara `category:` no frontmatter; a categoria
inferida é persistida e preservada nos rescan. Frontmatter declarado (mesmo desconhecido,
caindo em `outros`) vence a inferência.
## 2026-11-10 — Login GitHub via PAT e operações de escrita (commit/push) em projetos

**Contexto:** usuário quer se autenticar com a conta GitHub e commitar/pushar direto
da interface, em vez de depender do terminal/credential manager da máquina.

**Decisão:**
- Autenticação por Personal Access Token colado (device flow OAuth exigiria um
  client_id registrado; PAT funciona hoje). Token validado contra /user — a
  identidade aparece no header — e salvo via settingsSet com safeStorage (o
  mesmo caminho já existente antes dessa feature).
- Push nunca grava o token em config nem em URL do remote: quando o remote é
  github.com usamos um header HTTP Basic por operação (http.extraHeader,
  convenção x-access-token). Erros do git passam por sanitizeGitOutput antes de
  chegar ao renderer.
- Handlers repo:gitStatus/commit/push resolvem a pasta local por id de Repo OR
  por id de ProjectRef (projetos herdam o id na migração v1; repos novos podem
  divergir). Autoria do commit sai do git do usuário; sem user.name/email o
  erro orienta git config --global.
- Local na interface: botão Git no card de Projeto (AssetLibraryPage, via
  RepoGitPanel) e menu de conta no header (GithubAccountMenu). RepoDetailPage
  também ganhou a aba git, mantendo paridade.

**Alternativas consideradas:** OAuth device flow (exige registro de OAuth App e
client_id no build); URL com token embutida no push (risco de vazar em logs).

## 2026-11-10 — Medidor de consumo de agents/skills e área de Ferramentas com on/off

**Contexto:** usuário quer (a) medir o consumo dos agents de IA que circundam a
biblioteca e (b) uma área de ferramentas configuráveis, ativáveis por chave
on/off, expostas como uso rápido no projeto.

**Decisão:**
- Medidor = eventos de uso (não tokens): reusa `UsageEvent` (resto do app já
  grava na abertura de skill/agent), canal novo `usage:record` para marcação
  manual (+1). A agregação é pure/shared (`usage-meter.ts`, testável):
  janelas 7/30/90d, série diária com dias zerados, projeção mensal e rank
  cruzando com nome atual do asset. Página nova "Consumo" no menu. Limitar
  tokens/custos é recurso futuro — eventos são o dado que o app consegue
  medir com precisão.
- Ferramentas do usuário: `settings.userTools` (UserToolSchema: name, command,
  description?, enabled, keepAlive) com padrão `[]` por migração v2 (defaults
  já cobrem bibliotecas antigas). Chave on/off controla expor/ocultar como
  botões de uso rápido no ProjectCard. Execução passa sempre por diálogo
  ConfirmDialog com o comando e a pasta alvo (mandamento do AGENTS.md: nada
  roda sem revisão).
- Execução: `keepAlive` (dev server) roda desacoplado (spawn detached);
  padrão executa com captura de saída e timeout de 3 min, saída truncada pela
  cauda (trimOutput). Shell da plataforma centralizado em `tool-run.ts`
  (testável) — cmd /c no Windows, sh -c no resto.
- Nav: página "Ferramentas" agora é de verdade no menu (antes era órfã): mine
  (CRUD + on/off) em cima, tabela de detecção do sistema embaixo.

**Alternativas consideradas:** medir tokens manualmente (planilha embutida) —
ficou para depois; executar via PTY terminal embutido (mais interativo, mas
adiciona fluxo visual por run; a captura de saída cobre casos de teste/lint).

## 2026-11-10 — Bootstrap acopla registerRepoIpc (correção de handler sempre ausente)

**Contexto:** ao rodar `pnpm dev`, o registerer dava "No handler registered for
'github:authMe'": `registerRepoIpc` (src/main/ipc/repos.ipc.ts) existia e era
exportado, mas `src/main/index.ts` nunca o chamava. Todo o bloco de repositórios
e GitHub (repoAdd*, clone, authCheck/authMe, gitStatus/commit/push, covers,
libraryExport/Import) ficava morto em runtime. Além disso havia 4 canais
registrados em duplicidade potencial entre assets.ipc e repos.ipc
(libraryGet, settingsGet, settingsSet, dialogPickFolder), o que lançaria
"second handler" assim que o acoplamento existisse.

**Decisão:** `main/index.ts` chama `registerRepoIpc(store, git, coversDir)` no
bootstrap (coversDir = userData/covers). assets.ipc deixa de registrar os 4
canais duplicados — repos.ipc é a fonte canônica; e o `settingsSet` dele codifica
o PAT com safeStorage (o handler antigo gravava token em texto puro: melhor de
graça). AGENTS.md já documentava o estado real ("bootstrap não registra handlers
antigos de execução"), então process.ipc continua sem acoplamento.

**Alternativas consideradas:** delegar os handlers duplicados de repos.ipc para
assets.ipc (só inverteria o problema); chamar os dois sem deduplicar (lança
erro de segundo handler no startup).

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

## Dashboard GitHub (2026-11-11)

Decisão: "Dashboard" passa a ser a primeira aba e a página inicial, mostrando a conta
GitHub conectada, gráficos e os repositórios registrados, acima do uso da biblioteca.

- Um único canal `dashboard:account` agrega `/user`, `/user/repos` (100 mais recentes,
  só do dono) e `/rate_limit`; sem token devolve apenas a cota anônima. Falha na cota
  não derruba o restante.
- Parsers e agregações são puros (`main/services/github-dashboard.ts`,
  `shared/github-dashboard.ts`) com `fetchJson` injetado, testáveis sem Electron.
- Cache no store zustand com stale-while-revalidate (5 min); "Atualizar" força a busca.
- Projetos sincronizados derivam do `useLibraryStore` (mesmos dados do detalhe do
  repositório), sem canal extra, para não divergir após favoritar.
- Gráficos em SVG/CSS puro, reaproveitando `charts.tsx`; nenhuma dependência nova.
