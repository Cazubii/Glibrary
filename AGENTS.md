# Glibrary — Mapa do Projeto

Guia de contexto para agentes de código (Codex, Claude, etc.). Atualizado na v1.

## O que é

App desktop (Electron) em estilo **biblioteca da Steam** para organizar **skills de agente**
(SKILL.md) e **repositórios-base** (clones/forks usados como ponto de partida dos projetos).
Os projetos do usuário são apenas **contexto de uso** ("o projeto X usou a skill Y e a base Z").

## Estado atual / direção

- **v1 implementado** (commits `feat(fase-0)` a `feat(fase-6)` em `claude/great-ptolemy-cc2hat`):
  gerencia *projetos* — adicionar por URL/pasta, clonar com progresso, detecção de tipo,
  instalar/iniciar/parar com logs ao vivo, scanner de pastas, verificador de ferramentas,
  exportar/importar, onboarding, instalador NSIS.
- **v2 planejada** (fases 7–9): biblioteca de **Skills + Bases**; projetos viram contexto de
  uso; remoção dos controles de execução (process-manager, LogConsole, CommandEditor);
  migração `library.json` v1→v2 (6 projetos locais → `ProjectRef`; `ai-job-search` → `BaseItem`);
  bases em `~/BASES`. **Começar pela Fase 7.**

## Comandos

```bash
pnpm install        # se o Electron não abrir: node node_modules/electron/install.js
pnpm dev            # dev com HMR
pnpm typecheck      # tsc --noEmit (strict)
pnpm lint           # eslint
pnpm test           # vitest
pnpm build          # electron-vite build
pnpm dist           # instalador NSIS em dist/
```

Gate obrigatório antes de **todo** commit: `pnpm typecheck && pnpm lint && pnpm test`.
Formato de commit: `feat(fase-N): descrição` (ou `fix(fase-N): descrição`), em português.

## Stack

Electron + electron-vite + React 19 + TypeScript 6 (fixado; v7 quebra typescript-eslint)
+ Tailwind v3 + Zustand 5 + zod v4 + simple-git + tree-kill + anser + lucide-react.
Empacotamento: electron-builder (NSIS no Windows).

## Estrutura

```
src/shared/      tipos, schemas zod, ipc-channels.ts, git-utils, status.ts, tools.ts
src/main/        index.ts (bootstrap)
  services/      library-store (JSON atômico + backup), git-service, github-api,
                 cover-service, process-manager, tools-checker, scanner,
                 detector/ (node, python, docker, rust, go, dotnet, java, make, static)
  ipc/           repos.ipc, process.ipc, tools.ipc, scan.ipc, scan-parsing
src/preload/     contextBridge → window.api (invoke/on)
src/renderer/    pages/ (LibraryPage, RepoDetailPage, ToolsPage), components/,
                 store/library.ts (zustand), lib/api.ts
tests/           status, library-store, detector, apply-detection, process-manager,
                 git-utils, git-service, scanner, scan-parsing (+ fixtures/ por tipo)
docs/DECISOES.md registro de decisões técnicas (sempre registrar decisões novas aqui)
GLIBRARY_SPEC.md fonte da verdade da v1 (especificação completa, fases 0–6)
```

## Convenções

- UI e mensagens em **pt-BR**; código e variáveis em inglês; commits com descrição em português.
- Toda IPC devolve `{ ok: true, data } | { ok: false, error: string }` — a UI mostra toast,
  nunca trava a tela.
- Persistência: `%APPDATA%/Glibrary/library.json` (escrita atômica em `.tmp` + rename;
  backup automático `library.backup.json`).
- Segurança: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP restritiva;
  nenhum comando roda sem clique do usuário; token do GitHub via `safeStorage`.
- Multiplataforma: `path.join`, `os.homedir()`, nada de bash-only.
- Tipos primeiro: definir/exportar tipos e schema zod antes de cada serviço. Sem `any`
  (usar `unknown` + validação). Testes mínimos obrigatórios: detectores, normalização de URL,
  dedupe do scanner, máquina de estados do status.

## Armadilhas conhecidas

- **pnpm 10** bloqueia build scripts: `pnpm.onlyBuiltDependencies: ["electron","esbuild"]`
  no `package.json`.
- **Vite**: `resolve.dedupe: ['react','react-dom']` no renderer (senão "Invalid hook call"
  do zustand por grafos de dependência separados).
- `vitest.config.mts` (extensão `.mts` para evitar warning ESM).
- `tree-kill` traz tipos próprios (não existe `@types/tree-kill`); `anser` usa `export =`
  (funciona com `esModuleInterop`).
- PowerShell/console às vezes exibe mojibake — os arquivos **são** UTF-8 válido; não
  "corrigir" sem verificar os bytes antes.
- Smoke test do app: subir com `Start-Process cmd "/c pnpm dev > %TEMP%\dev.log 2>&1" -WindowStyle Hidden`
  e, em chamada separada, checar `Get-Process electron` com `MainWindowTitle -eq 'Glibrary'`.
- O harness mata processos long-running entre chamadas; nunca subir o dev e esperar na
  mesma chamada.

## Contexto do usuário

- Skills: `~/.claude/skills` (88), `~/.opencode/skills` (44), `~/.agents/skills` (92) —
  231 `SKILL.md`, 149 nomes únicos (cópias sincronizadas entre raízes).
- Projetos: `~/PROJETOS` (GestaoLojaSystem, managerstore, SistemaIns, Stingy,
  GlamourManteigaria, bezierclickemergent2, TVBOX, BibliotecaGit/Glibrary).
- Migração v2 acordada: 6 projetos locais → `ProjectRef` (contexto); `ai-job-search`
  (só URL) → `BaseItem`. Pasta de bases `~/BASES` (ainda não existe).
- Decisões registradas em `docs/DECISOES.md` (scaffold manual, TS6, zod v4, CSP, dedupe Vite,
  formato da IPC do scanner etc.).
