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

## Sugestões

(itens fora do escopo da v1 — não implementar, conforme seção 14 da spec)
