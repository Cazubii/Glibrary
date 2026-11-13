# Terminais em Abas por Projeto — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir várias sessões PTY em abas por pasta de projeto, mantendo processos ativos ao trocar de aba, esconder o painel ou navegar entre projetos enquanto o app estiver aberto.

**Architecture:** O processo principal será a fonte canônica das sessões por caminho normalizado: lista, status, processo PTY, attachment token e saída recente. O renderer terá um estado Zustand por pasta para seleção/visibilidade, um painel de abas reutilizável e uma view xterm que se conecta por ID sem matar o processo ao desmontar.

**Tech Stack:** Electron IPC, Node.js `node-pty`, React 19, Zustand, xterm.js, Zod, TypeScript e Vitest.

---

## Arquivos e responsabilidades

| Arquivo | Responsabilidade nesta entrega |
|---|---|
| `src/shared/types.ts` | Tipos de resumo de sessão, lista por pasta e resultado de attach. |
| `src/shared/ipc-channels.ts` | Canais novos de listar, criar, conectar e fechar sessões; remover canais antigos após a migração. |
| `src/main/services/terminal-manager.ts` | Catálogo em memória, PTYs independentes, saída, estado finalizado, attach/detach e encerramento. |
| `src/main/ipc/terminal.ipc.ts` | Validar e encaminhar operações IPC para o manager. |
| `src/main/index.ts` | Encerrar todos os PTYs em `before-quit`. |
| `src/preload/index.ts` | Manter `send` limitado a input/resize; operações de catálogo usam `invoke`. |
| `src/renderer/src/lib/api.ts` | API tipada para list/create/attach/detach/close e eventos. |
| `src/renderer/src/store/terminals.ts` | Estado por pasta: sessões, aba ativa, visibilidade, loading e erro. |
| `src/renderer/src/components/TerminalSessionView.tsx` | Criar xterm, conectar uma sessão por ID, renderizar snapshot/eventos e desconectar sem matar. |
| `src/renderer/src/components/RepoTerminal.tsx` | Painel de abas reutilizável com `+`, seleção, fechar aba, fechar painel e estados vazios/finalizados. |
| `src/renderer/src/components/projects/ProjectWorkspace.tsx` | Usar o painel e o estado global na tela de branches. |
| `src/renderer/src/pages/DevWorkspacePage.tsx` | Usar as mesmas abas no workspace de desenvolvimento. |
| `src/renderer/src/pages/RepoDetailPage.tsx` | Usar as mesmas abas no detalhe do repositório. |
| `src/renderer/src/pages/AssetLibraryPage.tsx` | Usar as mesmas abas no drawer da Biblioteca. |
| `tests/terminal-manager.test.ts` | Regressões de catálogo, attach, saída, close e múltiplas sessões. |
| `tests/terminal-ipc.test.ts` | Validar handlers, payloads inválidos e roteamento de sessões por ID. |
| `tests/terminal-store.test.ts` | Validar seleção e transições do grupo de abas no renderer. |

Não editar a lógica de AgentRuns ou Consumo neste plano. Esses são os dois projetos seguintes e terão especificações próprias.

## Contrato de dados

Adicionar em `src/shared/types.ts`:

```ts
export type TerminalSessionStatus = 'running' | 'exited';

export interface TerminalSessionSummary {
  id: string;
  cwd: string;
  name: string;
  status: TerminalSessionStatus;
  createdAt: string;
  exitCode?: number;
}

export interface TerminalListResult {
  cwd: string;
  sessions: TerminalSessionSummary[];
}

export interface TerminalAttachResult {
  id: string;
  attachmentId: string;
  snapshot: string;
  sequence: number;
  status: TerminalSessionStatus;
  exitCode?: number;
}
```

Assinaturas planejadas do manager e da API renderer:

```ts
// TerminalManager
create(cwd: string, cols?: number, rows?: number): TerminalSessionSummary;
list(cwd: string): TerminalListResult;
attach(id: string, events: TerminalEvents, cols?: number, rows?: number): TerminalAttachResult;
detach(id: string, attachmentId: string): void;
close(id: string): void;
killForCwd(cwd: string): void;
killAll(): void;

// API renderer
terminalList(cwd: string): Promise<TerminalListResult>;
terminalCreateSession(cwd: string): Promise<TerminalSessionSummary>;
terminalAttach(id: string): Promise<TerminalAttachResult>;
terminalDetach(id: string, attachmentId: string): Promise<void>;
terminalClose(id: string): Promise<void>;
```

`terminalList(cwd)` sempre devolve o caminho resolvido pelo processo principal, inclusive quando a lista está vazia. A chave do estado renderer será esse caminho devolvido, assim diferenças de caixa no Windows não criam grupos duplicados.

Durante a migração, manter temporariamente `create(events, cwd)`, `open(events, cwd)`, `kill(id)`, `terminalCreate`, `terminalOpen` e `terminalKill` como adaptadores para os componentes antigos. Os adaptadores chamam o novo catálogo; remover todos na Tarefa 9 depois que não houver consumidores.

## Tarefa 1: Escrever testes para várias sessões na mesma pasta

**Arquivos:**

- Modificar: `tests/terminal-manager.test.ts`

- [ ] **Passo 1: Adicionar teste de catálogo por pasta**

Importar `resolve` de `path` e adicionar este teste usando o `fakeSpawnFactory()` existente:

```ts
it('cria e lista várias sessões independentes na mesma pasta', () => {
  const fake = fakeSpawnFactory();
  const ids = ['t1', 't2', 't3'];
  const manager = new TerminalManager(fake.spawn, () => ids.shift() ?? 'unexpected');

  const first = manager.create(dir);
  const second = manager.create(dir);
  const third = manager.create(dir);

  expect(first).toMatchObject({ id: 't1', cwd: resolve(dir), name: 'Terminal 1', status: 'running' });
  expect(second).toMatchObject({ id: 't2', cwd: resolve(dir), name: 'Terminal 2', status: 'running' });
  expect(third).toMatchObject({ id: 't3', cwd: resolve(dir), name: 'Terminal 3', status: 'running' });
  expect(manager.list(dir)).toMatchObject({
    cwd: resolve(dir),
    sessions: [{ id: 't1' }, { id: 't2' }, { id: 't3' }]
  });
  expect(fake.calls).toHaveLength(3);
});
```

- [ ] **Passo 2: Rodar o teste para confirmar a falha inicial**

Rodar `npm.cmd test -- tests/terminal-manager.test.ts`. Resultado esperado: falha porque `create(cwd)` e `list(cwd)` ainda não implementam o catálogo por pasta.

- [ ] **Passo 3: Manter asserções de isolamento**

No mesmo teste, confirmar que os três IDs são diferentes, que existem três spawns e que cada entrada de `fake.calls` aponta para `dir`. Não aceitar uma implementação que apenas crie três abas sobre o mesmo PTY.

## Tarefa 2: Criar o catálogo de sessões no `TerminalManager`

**Arquivos:**

- Modificar: `src/shared/types.ts`
- Modificar: `src/main/services/terminal-manager.ts`
- Modificar: `tests/terminal-manager.test.ts`

- [ ] **Passo 1: Definir os tipos compartilhados**

Adicionar os tipos do bloco “Contrato de dados” antes de `AgentViewMode`, sem alterar os tipos de AgentRun.

- [ ] **Passo 2: Guardar estado PTY e metadados separadamente**

Atualizar a sessão privada do manager para incluir os metadados e permitir que o PTY deixe de existir sem remover a aba:

```ts
interface TerminalSession {
  pty: IPty | null;
  cwd: string;
  name: string;
  status: TerminalSessionStatus;
  createdAt: string;
  exitCode?: number;
  events: TerminalEvents | null;
  attachmentId: string | null;
  output: string;
  sequence: number;
}
```

Manter `TERMINAL_SNAPSHOT_LIMIT = 100_000`; normalizar com `resolve(cwd)` e comparar em minúsculas somente quando `process.platform === 'win32'`.

- [ ] **Passo 3: Implementar `create` e `list`**

`create` valida `cwd` com `existsSync`, cria sempre um ID/PTy novo, e escolhe o primeiro nome livre entre `Terminal 1`, `Terminal 2` etc. para aquela pasta. A sessão começa sem sink conectado. `list` devolve o `cwd` resolvido e os resumos em ordem de criação. Não incluir `output`, `pty` ou `events` no resumo.

- [ ] **Passo 4: Manter os consumidores antigos compilando durante a migração**

Adicionar sobrecargas temporárias para `create(events, cwd, cols, rows)` e `create(cwd, cols, rows)`. A primeira cria a sessão nova, chama `attach` e devolve apenas o ID; a segunda devolve o resumo. Preservar `open(events, cwd, cols, rows)` e `kill(id)` como wrappers que chamam `list`/`attach` e `close`, respectivamente. Marcar os wrappers com comentário `// compatibilidade temporária durante a migração de RepoTerminal`.

- [ ] **Passo 5: Atualizar o teste de criação para passar**

Rodar `npm.cmd test -- tests/terminal-manager.test.ts`. Resultado esperado: o teste da Tarefa 1 passa e os testes antigos ainda podem precisar das chamadas antigas migradas nas tarefas seguintes; não remova testes de regressão para silenciar falhas.

## Tarefa 3: Implementar attach, detach, saída finalizada e close individual

**Arquivos:**

- Modificar: `src/main/services/terminal-manager.ts`
- Modificar: `tests/terminal-manager.test.ts`

- [ ] **Passo 1: Escrever teste de snapshot, sequência e stale detach**

Criar duas conexões sucessivas para uma sessão. Gerar saída antes e durante o detach, então confirmar que a segunda conexão recebe somente eventos posteriores ao snapshot e que o token antigo não desconecta a nova conexão.

```ts
const created = manager.create(dir);
fake.spawned[0].onData?.('prompt> ');
const first = manager.attach(created.id, collectingEvents({ data: [], exitSent: 0 }));
manager.detach(created.id, first.attachmentId);
fake.spawned[0].onData?.('while detached');
const secondLog = { data: [] as string[], exitSent: 0 };
const second = manager.attach(created.id, collectingEvents(secondLog));
manager.detach(created.id, first.attachmentId);
fake.spawned[0].onData?.('next> ');

expect(second.snapshot).toBe('prompt> while detached');
expect(second.sequence).toBe(2);
expect(secondLog.data).toEqual(['next> ']);
expect(second.attachmentId).not.toBe(first.attachmentId);
```

- [ ] **Passo 2: Implementar `attach` e `detach` por ID/token**

`attach` falha com erro claro se o ID não existir, cria `randomUUID()` para cada conexão, liga o sink apenas a sessões `running` e devolve snapshot/sequence/status. Para sessão `exited`, devolve o estado e snapshot sem ligar input. `detach` só limpa `events`/`attachmentId` se o token fornecido ainda for o atual.

- [ ] **Passo 3: Reter a aba quando o processo sair**

No `pty.onExit`, manter a entrada no Map, definir `pty = null`, `status = 'exited'`, guardar `exitCode` e enviar `terminalExit` uma vez ao sink conectado. Ignorar callbacks `onData` tardios. Fazer `alive(id)` retornar verdadeiro somente para sessão `running` com PTY ativo.

- [ ] **Passo 4: Escrever testes de isolamento de I/O, saída retida e close isolado**

Ampliar o fake PTY para registrar `write` por processo. Criar duas sessões, enviar entrada para cada ID e confirmar que cada processo recebe somente a própria entrada; enviar saídas diferentes por `onData` e confirmar que cada sink recebe somente os eventos da sessão anexada. Depois de `onExit({ exitCode: 7 })`, confirmar que `list(cwd)` mantém a sessão como `exited`, com código 7. Criar uma segunda sessão, chamar `close(first.id)`, e confirmar que apenas o primeiro PTY recebe `kill`, a segunda sessão continua listada e ativa e a sessão fechada some da lista.

- [ ] **Passo 5: Implementar `close` e atualizar os testes antigos**

`close(id)` remove o registro antes de matar o PTY, para que o callback de saída tardio não recrie/atualize a sessão fechada. Atualizar testes que hoje esperam que o registro seja removido somente pelo callback `onExit`. Rodar `npm.cmd test -- tests/terminal-manager.test.ts`; esperado: todos passam.

## Tarefa 4: Preservar o comportamento de descarte e encerrar PTYs no app quit

**Arquivos:**

- Modificar: `src/main/services/terminal-manager.ts`
- Modificar: `src/main/index.ts`
- Modificar: `tests/terminal-manager.test.ts`

- [ ] **Passo 1: Testar descarte de workspace com mais de um terminal**

Criar duas sessões em `dir` e uma em `join(dir, 'sub')`. Chamar `manager.killForCwd(dir)`. Esperado: as duas sessões de `dir` são fechadas/removidas; a sessão de `sub` permanece ativa.

- [ ] **Passo 2: Fazer `killForCwd` fechar o grupo inteiro**

Manter a assinatura usada por `src/main/ipc/dev-workspace.ipc.ts`. Comparar o caminho normalizado, copiar os IDs correspondentes antes de iterar e chamar `close(id)` para remover PTY e metadados. Não fechar sessões de worktree com caminho diferente.

- [ ] **Passo 3: Testar `killAll`**

Criar sessões em duas pastas, chamar `killAll()`, e confirmar que cada PTY ativo recebe um `kill`, os resumos desaparecem e chamadas repetidas não matam o mesmo processo duas vezes.

- [ ] **Passo 4: Ligar limpeza em `before-quit`**

No handler já existente em `src/main/index.ts`, acrescentar `terminalManager.killAll()` junto a `runManager.stopAll()` e `toolManager.stopAll()`. A limpeza deve ser síncrona e não deve chamar `app.quit()` recursivamente.

- [ ] **Passo 5: Rodar testes do manager**

Rodar `npm.cmd test -- tests/terminal-manager.test.ts`. Esperado: todos os testes de criação, duas sessões, saída retida, attach token, close por ID, close por cwd e shutdown passam.

## Tarefa 5: Adicionar IPC por ID e atualizar o contrato renderer

**Arquivos:**

- Modificar: `src/shared/ipc-channels.ts`
- Modificar: `src/main/ipc/terminal.ipc.ts`
- Modificar: `src/preload/index.ts`
- Modificar: `src/renderer/src/lib/api.ts`
- Criar: `tests/terminal-ipc.test.ts`

- [ ] **Passo 1: Escrever teste de handlers IPC**

Usar `vi.mock('electron')` com `vi.hoisted` para registrar handlers `ipcMain.handle`/`ipcMain.on` em Maps. Testar que `terminalList` devolve o grupo da pasta, duas chamadas a `terminalSessionCreate` criam sessões independentes, `terminalAttach` devolve attachment token/snapshot, `terminalDetach` respeita o token e payloads sem `cwd` ou com `id` vazio retornam `{ ok: false }` sem spawn.

- [ ] **Passo 2: Adicionar os canais e schemas sem quebrar os componentes antigos**

Adicionar `terminalList`, `terminalSessionCreate`, `terminalAttach` e `terminalClose` em `IpcChannels`. Manter por enquanto `terminalCreate`, `terminalOpen`, `terminalKill`, `terminalDetach`, `terminalInput`, `terminalResize`, `terminalOutput` e `terminalExit` para os consumidores antigos. No IPC, validar `cwd`, `id`, `cols` e `rows` com Zod; limites de dimensões permanecem `cols: 2..500` e `rows: 2..200`.

- [ ] **Passo 3: Adicionar handlers novos**

`terminalList` e `terminalSessionCreate` usam `ipcMain.handle` e devolvem `IpcResult<T>`. `terminalAttach` constrói um `TerminalEvents` sink para `event.sender`, chama `manager.attach(id, sink, cols, rows)` e retorna `TerminalAttachResult`. `terminalDetach` e `terminalClose` usam `handle`; `terminalInput` e `terminalResize` continuam `on` com validação Zod. Os handlers legados chamam os wrappers temporários do manager e permanecem até a Tarefa 9.

- [ ] **Passo 4: Atualizar preload e API tipada**

Em `preload/index.ts`, manter temporariamente `terminalKill` em `terminalSendChannels`; `terminalInput` e `terminalResize` também continuam como `send`. Em `api.ts`, adicionar `terminalList`, `terminalCreateSession`, `terminalAttach` e `terminalClose` com `invoke`/`unwrap`; não mudar ainda a assinatura antiga de `terminalCreate`, `terminalOpen` ou `terminalKill`.

- [ ] **Passo 5: Rodar testes IPC e typecheck**

Rodar `npm.cmd test -- tests/terminal-ipc.test.ts` e `npm.cmd run typecheck`. Esperado: handlers novos e antigos compilam, payload inválido retorna falha controlada e nenhum PTY é criado em caso de erro. Commit esperado, stage somente os hunks das alterações novas: `feat: expose terminal session IPC`.

## Tarefa 6: Criar o estado global das abas por caminho

**Arquivos:**

- Criar: `src/renderer/src/store/terminals.ts`
- Criar: `tests/terminal-store.test.ts`

- [ ] **Passo 1: Definir estado e ações**

Implementar Zustand com `groups: Record<string, TerminalGroup>`. Cada grupo contém `cwd`, `sessions`, `activeId`, `panelOpen`, `loading` e `error`. Actions: `openPanel(cwd)`, `hidePanel(cwd)`, `createTerminal(cwd)`, `selectTerminal(cwd, id)`, `closeTerminal(cwd, id)` e `markExited(id, exitCode)`. Usar `api.terminalCreateSession` para obter o resumo sem attachment; a view ativa chama `terminalAttach` depois que os listeners xterm estão registrados.

- [ ] **Passo 2: Criar teste de inicialização/restauração**

Mockar `api.terminalList` para devolver `{ cwd: resolve(cwd), sessions: [] }` e `api.terminalCreateSession` para devolver a sessão `Terminal 1`. Chamar `openPanel(cwd)` e verificar que o grupo usa `result.cwd`, abre o painel e seleciona a sessão criada. Em um segundo teste, devolver duas sessões e confirmar que o `activeId` salvo é mantido se ainda existir; se não existir, usar a primeira.

- [ ] **Passo 3: Criar teste de seleção, close e saída**

Com duas sessões no grupo, selecionar a segunda e fechar a primeira; verificar que a segunda continua ativa e não é enviada a `terminalClose`. Chamar `markExited(second.id, 7)` e confirmar que a aba permanece no grupo com `status: 'exited'` e `exitCode: 7`.

- [ ] **Passo 4: Implementar transições de estado**

`openPanel` chama list antes de decidir criar; cria `Terminal 1` somente se a lista estiver vazia. `createTerminal` salva o resumo retornado e seleciona seu ID. `closeTerminal` aguarda `api.terminalClose`, remove somente esse ID e escolhe a aba na mesma posição ou a anterior. Se não restar sessão, deixa `sessions: []` e `panelOpen: true` para renderizar `Novo terminal`. `hidePanel` só altera visibilidade. `markExited` atualiza o grupo que contém o ID.

- [ ] **Passo 5: Rodar os testes do store**

Rodar `npm.cmd test -- tests/terminal-store.test.ts`. Esperado: inicialização, restauração, seleção, close isolado e status de saída passam sem React DOM.

## Tarefa 7: Separar a view xterm da gestão de sessões

**Arquivos:**

- Criar: `src/renderer/src/components/TerminalSessionView.tsx`
- Modificar: `src/renderer/src/components/RepoTerminal.tsx`
- Modificar: `src/renderer/src/lib/api.ts`

- [ ] **Passo 1: Implementar `TerminalSessionView`**

Receber `{ session, onExit, onClosePanel }`. Criar `Terminal`/`FitAddon`, registrar listeners de output/exit antes de `api.terminalAttach(session.id)`, filtrar eventos pelo ID da sessão, bufferizar eventos recebidos durante o attach, escrever `snapshot` e só depois eventos cuja `sequence > result.sequence`. Enviar `terminalInput` e `terminalResize` para aquele ID.

- [ ] **Passo 2: Garantir detach sem kill no cleanup**

Guardar `attachmentId` retornado por attach. No cleanup do efeito, desconectar listeners, observer e xterm e chamar somente `terminalDetach(session.id, attachmentId)`. Se o attach resolver depois do unmount, chamar detach com o token retornado. Nunca matar a sessão por alternar aba ou esconder painel.

- [ ] **Passo 3: Renderizar snapshot e sessão encerrada**

Se o resultado do attach ou prop `session` tiver `status === 'exited'`, mostrar o código de saída e manter o snapshot. O botão `Fechar painel` chama `onClosePanel`; não chama `terminalClose` nem encerra outras abas.

- [ ] **Passo 4: Validar tipos**

Rodar `npm.cmd run typecheck`. Esperado: a view não usa a assinatura antiga `terminalOpen(cwd)` nem `terminalKill(id)`.

## Tarefa 8: Implementar o painel de abas em `RepoTerminal`

**Arquivos:**

- Modificar: `src/renderer/src/components/RepoTerminal.tsx`
- Usar: `src/renderer/src/components/TerminalSessionView.tsx`
- Usar: `src/renderer/src/store/terminals.ts`

- [ ] **Passo 1: Renderizar abas acessíveis**

Renderizar a barra com `role="tablist"`; cada aba tem um botão `role="tab"`, `aria-selected`, nome e indicador `Encerrado` quando aplicável. O botão `×` fica como irmão da aba, não aninhado dentro dela, com `aria-label={`Fechar ${session.name}`}`. O botão `+` usa `aria-label="Novo terminal"`.

- [ ] **Passo 2: Conectar a aba selecionada**

Renderizar somente `<TerminalSessionView key={active.id} session={active} ... />`. Ao clicar noutra aba, atualizar `activeId`; a view anterior desanexa, a nova recupera snapshot por ID.

- [ ] **Passo 3: Implementar ação + e close por aba**

`+` chama `createTerminal(cwd)` e seleciona a nova sessão. `×` chama `closeTerminal(cwd, id)`. Se a aba fechada era a ativa, o store seleciona a adjacente. Se não houver sessão, renderizar botão `Novo terminal` no estado vazio.

- [ ] **Passo 4: Ligar esconder painel e estados de erro**

O botão do painel e a ação `Fechar painel` na view chamam `hidePanel(cwd)`. Erro de `openPanel` aparece dentro do painel sem limpar o grupo. A próxima abertura chama `terminalList(cwd)` e reconecta às sessões ainda existentes.

- [ ] **Passo 5: Conferir teclado e tipos**

Confirmar navegação por Tab/Enter, foco visível, rótulos em português e `npm.cmd run typecheck` sem erros.

## Tarefa 9: Integrar todos os pontos de abertura do terminal

**Arquivos:**

- Modificar: `src/renderer/src/components/projects/ProjectWorkspace.tsx`
- Modificar: `src/renderer/src/pages/DevWorkspacePage.tsx`
- Modificar: `src/renderer/src/pages/RepoDetailPage.tsx`
- Modificar: `src/renderer/src/pages/AssetLibraryPage.tsx`

- [ ] **Passo 1: Migrar a tela de branches**

Trocar estado local `terminalOpen` pelo grupo global para `localPath`; abrir/ocultar por `openPanel`/`hidePanel`; renderizar `RepoTerminal` com o mesmo `cwd`.

- [ ] **Passo 2: Migrar o DevWorkspace**

Usar `workspace.workspacePath` como chave do grupo e manter o toggle existente ligado à visibilidade global. Ao descartar workspace, o handler backend já chama `killForCwd`; validar que todas as sessões daquele workspace desaparecem.

- [ ] **Passo 3: Migrar detalhe do repositório e Biblioteca**

Usar `repo.localPath` e `terminalProject.localPath` respectivamente. Reabrir uma mesma pasta em qualquer tela deve listar os mesmos IDs/abas; caminhos de worktree diferentes devem mostrar grupos diferentes.

- [ ] **Passo 4: Remover fluxos antigos**

Depois da migração das quatro telas, confirmar com `rg -n "terminalOpen|terminalKill|terminalCreate\(" src/renderer/src src/preload src/main` que nenhum componente usa o fluxo antigo. Remover os wrappers temporários de `TerminalManager`, handlers/canais/API `terminalCreate`/`terminalOpen`/`terminalKill` e a permissão `terminalKill` do preload. Manter `terminalSessionCreate` como canal de criação e manter `killForCwd` no fluxo de descarte do DevWorkspace.

- [ ] **Passo 5: Rodar typecheck e testes focados**

Rodar `npm.cmd run typecheck`, `npm.cmd test -- tests/terminal-manager.test.ts` e `npm.cmd test -- tests/terminal-store.test.ts`. Esperado: todos passam e as quatro telas compilam usando o catálogo único.

## Tarefa 10: Verificar integração e encerrar a entrega

**Arquivos:**

- Validar: `src/main/services/terminal-manager.ts`
- Validar: `src/main/ipc/terminal.ipc.ts`
- Validar: `src/renderer/src/components/RepoTerminal.tsx`
- Validar: `src/renderer/src/components/TerminalSessionView.tsx`
- Validar: quatro telas integradas na Tarefa 9

- [ ] **Passo 1: Rodar os testes da entrega**

Rodar `npm.cmd test -- tests/terminal-manager.test.ts`, `npm.cmd test -- tests/terminal-ipc.test.ts` e `npm.cmd test -- tests/terminal-store.test.ts`. Esperado: os três arquivos passam sem teste ignorado relacionado ao terminal.

- [ ] **Passo 2: Rodar validações estáticas e build**

Rodar `npm.cmd run typecheck`, `npx.cmd eslint src/shared/types.ts src/shared/ipc-channels.ts src/main/services/terminal-manager.ts src/main/ipc/terminal.ipc.ts src/main/index.ts src/preload/index.ts src/renderer/src/lib/api.ts src/renderer/src/store/terminals.ts src/renderer/src/components/TerminalSessionView.tsx src/renderer/src/components/RepoTerminal.tsx src/renderer/src/components/projects/ProjectWorkspace.tsx src/renderer/src/pages/DevWorkspacePage.tsx src/renderer/src/pages/RepoDetailPage.tsx src/renderer/src/pages/AssetLibraryPage.tsx tests/terminal-manager.test.ts tests/terminal-ipc.test.ts tests/terminal-store.test.ts` e `npm.cmd run build`. Esperado: zero erros de tipos/lint e build Electron concluído.

- [ ] **Passo 3: Fazer smoke test manual na aplicação**

1. Abrir o terminal de uma pasta e confirmar `Terminal 1`.
2. Executar `Write-Output 'um'; Start-Sleep -Seconds 30`; clicar `+`, executar `Write-Output 'dois'; Start-Sleep -Seconds 30` e alternar abas. Confirmar que cada saída permanece na aba correta.
3. Fechar e reabrir o painel; confirmar que as duas abas e os processos ainda estão ativos.
4. Navegar para outro projeto e voltar à mesma pasta; confirmar restauração dos IDs, abas e seleção.
5. Fechar uma aba e confirmar que somente o processo dela encerra; abrir outra e fechar a última para conferir `Novo terminal`.
6. Executar `exit 7`, confirmar estado `Encerrado`/código 7 e fechar somente essa aba.
7. Descartar um DevWorkspace com terminais e confirmar que somente os terminais do caminho daquele workspace são encerrados.

- [ ] **Passo 4: Conferir o diff e commitar somente a entrega**

Rodar `git diff --check`, revisar o diff de cada arquivo listado neste plano e confirmar que mudanças preexistentes foram preservadas. Stage somente os arquivos/hunks da entrega. Commit final esperado: `feat: add project terminal tabs`.

## Preflight para execução

O workspace atualmente contém mudanças pendentes anteriores em vários arquivos que este plano tocará, incluindo `terminal-manager.ts`, `terminal.ipc.ts`, `RepoTerminal.tsx` e as páginas. Antes de executar, comparar o estado e os diffs dessas alterações com a especificação aprovada. Não usar `git reset`, `git clean`, `git stash` ou stage de arquivos inteiros com alterações preexistentes. A execução deve manter o fix de attachment token que já está no workspace e limitar commits aos hunks desta entrega.
