# Painel de Agentes de IA — Design

Data: 2026-11-11
Status: aprovado (brainstorming com usuário)

## Objetivo

Nova página **"Agentes"** no Glibrary para criar e monitorar agentes e sub-agentes de IA
executando em repositórios da biblioteca.

## Escopo decidido

- **Executar e monitorar:** lançar CLIs de IA (Claude Code, Codex, Gemini, Aider, comandos
  custom) dentro de um repositório da biblioteca e acompanhar execução, logs e status.
- **Criação por perfis salvos:** perfil com nome, repositório alvo, comando/CLI, args e
  prompt; fica salvo para relançar depois. Editor livre de comando com presets conhecidos.
- **Sub-agentes = instâncias paralelas:** um perfil pode ter N execuções simultâneas no
  mesmo repositório, cada uma com prompt/tarefa própria. Cada execução é um card com
  status, log ao vivo e botão Parar.
- **Monitoramento com logs ao vivo:** card por execução com status ao vivo
  (rodando/parado/erro), tempo, repo e log em tempo real (estilo terminal); log completo
  consultável.
- **Histórico persistente:** execuções encerradas ficam listadas com status final, duração
  e log salvo em disco, persistindo entre sessões do app.

## Abordagem escolhida

Opção A: novo serviço `AgentRunManager` modelado no `ProcessManager` existente, indexado
por `runId` (não por `repoId`) para permitir execuções paralelas. Reaproveita padrões
provados (spawn com shell, buffers de log, `treeKill`, logs em disco). Descartadas:
reuso da infra de terminais node-pty/xterm (complexo, monitoramento frágil) e
orquestrador externo (overkill).

## Modelo de dados

### `AgentProfile` (novo array `agentProfiles` no `library.json` v2)

```ts
{
  id: string;            // uuid
  name: string;          // "Claude — Refatoração"
  repoId: string;        // repositório alvo da biblioteca
  command: string;       // "claude" | "codex" | comando custom
  args: string[];        // flags fixas, ex.: ["--model", "sonnet"]
  createdAt: string;
  lastRunAt?: string;
}
```

### `AgentRun` (persistido em `agent-runs.json`, ao lado do `library.json`)

```ts
{
  id: string;            // uuid (runId)
  profileId: string;
  profileName: string;   // snapshot, sobrevive a renomear/apagar perfil
  repoId: string;
  repoName: string;
  command: string;       // linha completa executada
  prompt?: string;       // tarefa inicial do sub-agente
  status: 'running' | 'done' | 'stopped' | 'error';
  exitCode?: number;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  logFile: string;       // logs/agents/<runId>.log
}
```

Validação: schemas Zod novos em `src/shared/schemas.ts`; tipos em `src/shared/types.ts`.
Perfis e runs são aditivos ao modelo v2 (sem migração).

## Serviços main e IPC

### `AgentRunManager` (`src/main/services/agent-run-manager.ts`)

- `start(profileId, prompt?)` → resolve perfil + repo, monta a linha de comando
  (`command + args`; prompt inicial vira argumento final, sem stdin), `spawn` com
  `shell: true`, `cwd` = pasta local do repo. Gera `runId`, grava `AgentRun` como
  `running`, abre log em `logs/agents/<runId>.log`.
- `stop(runId)` → `treeKill` com grace de 5s; marca `stopped` com exit code.
- `stopAll()` → chamado no shutdown do app.
- stdout/stderr → buffer em memória (limite 5.000 linhas) + log em disco;
  últimas ~20 linhas de erro viram `stderrTail`.
- Saída: `done` (código 0), `stopped` (usuário pediu) ou `error` (código ≠ 0), com
  `finishedAt`/`durationMs`. Atualiza `lastRunAt` do perfil.

### IPC (padrão `{ ok, data } | { ok: false, error }`)

| Canal | Direção | Função |
|---|---|---|
| `agentProfiles:list / create / update / remove` | invoke | CRUD de perfis |
| `agentRuns:start / stop / list / getLogs` | invoke | ciclo de vida; `getLogs` devolve buffer para replay |
| `agentRuns:changed`, `agentRuns:log` | push main→renderer | eventos ao vivo |

Registros no `src/main/index.ts`; exposição pela ponte tipada do preload. Remover perfil
não apaga runs — histórico fica com snapshot do nome.

## UI

Nova página **"Agentes"** na navegação (ao lado de Consumo/Ferramentas), com
**alternador de visualização** salvo nas `settings` (como o tema):

- **Painel (modo A):** sidebar de perfis salvos sempre visível + lista de execuções
  ao vivo com log inline (estilo terminal) e histórico embaixo.
- **Grid (modo B):** dashboard de cards para perfis e execuções; log abre em diálogo
  em tela cheia (padrão de diálogo existente).

Barra de estatísticas no topo (rodando agora, erros 24h, execuções do dia).
Botão "Novo agente" abre diálogo de criação (nome, repositório, preset/custom de CLI,
args, prompt padrão) nos dois modos. Cards de execução: status ao vivo, prompt/tarefa,
tempo, botão Parar; histórico: status final, duração, início.

## Erros e casos de borda

- Repo sem pasta local → start bloqueado com mensagem clara.
- Comando inexistente → spawn falha, run vira `error` com `stderrTail` visível.
- Limite de buffer em memória (5.000 linhas) e rotação global de logs de agentes
  (mantém os 200 arquivos mais recentes).
- Shutdown do app → `stopAll` de todos os runs ativos.
- Remover perfil com run ativo → bloqueado; exige parar as execuções primeiro.
- Toda entrada externa (form do diálogo, payload IPC) validada com Zod.

## Testes (Vitest)

- Unitários: `AgentRunManager` (montagem de comando, ciclo start/stop/exit com processo
  fake, buffers, status finais), store de runs (persistência do `agent-runs.json`),
  schemas Zod.
- Store/renderer: eventos `changed`/`log` atualizam os cards do painel.
- CI existente: `pnpm typecheck && pnpm lint && pnpm test`.

## Convenções respeitadas

Interface e mensagens em pt-BR; nomes de código em inglês; TypeScript estrito sem `any`;
nunca expor APIs Node ao renderer; `contextIsolation`/sandbox/CSP preservados; sem
execução de comandos do usuário sem ação explícita (start sempre via botão).
