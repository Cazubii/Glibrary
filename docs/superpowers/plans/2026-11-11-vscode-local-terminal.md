# VS Code-Style Local Terminal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Add an on-demand, docked terminal to repository details with multiple local PTY sessions and familiar keyboard/resize behavior.

**Architecture:** The main process owns PTY sessions and emits output over validated IPC. The renderer loads xterm.js only when the dock opens. Hiding the panel preserves session state; quitting the app closes all local PTYs.

**Tech Stack:** Electron, TypeScript, node-pty, @xterm/xterm, xterm-addon-fit, xterm-addon-search, React.

---

## Files and responsibilities

- Modify `package.json` and `pnpm-lock.yaml`: install terminal dependencies and permit the native build script.
- Modify `electron-builder.yml`: package node-pty's native binary outside asar.
- Modify `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/ipc-channels.ts`: session/provider contracts and validated inputs.
- Create `src/main/services/terminal-manager.ts`: own PTY instances, output buffers, resize and cleanup.
- Create `src/main/ipc/terminal.ipc.ts`: register session lifecycle/input handlers.
- Modify `src/main/index.ts`: instantiate and register terminal manager; close sessions on quit.
- Modify `src/renderer/src/lib/api.ts`: typed terminal wrappers and output subscription.
- Create `src/renderer/src/components/RepoTerminal.tsx`: lazy xterm viewport, tabs, split panes, toolbar and keyboard behavior.
- Modify `src/renderer/src/pages/RepoDetailPage.tsx`: dock the terminal beneath repository content and preserve the existing process Console.

## Task 1: Dependencies and terminal contracts

**Files:** `package.json`, `pnpm-lock.yaml`, `electron-builder.yml`, shared types/schemas/channels.

- [ ] Add `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, and `@xterm/addon-search`. Add `node-pty` to pnpm `onlyBuiltDependencies` and the electron-builder asar-unpack rule for its `.node` binary.
- [ ] Regenerate `pnpm-lock.yaml` with `pnpm install --lockfile-only` in the disposable feature-branch checkout; do not hand-edit transitive lock entries.
- [ ] Define local session contracts:

```ts
export type TerminalProvider = 'local';
export interface TerminalSessionSummary {
  id: string;
  repoId: string;
  title: string;
  provider: TerminalProvider;
  state: 'running' | 'exited' | 'error';
  createdAt: string;
  exitCode?: number;
}
export interface TerminalStartInput {
  repoId: string;
  provider: TerminalProvider;
  cols: number;
  rows: number;
}
```

- [ ] Add channels `terminal:list`, `terminal:start`, `terminal:write`, `terminal:resize`, `terminal:close`, `terminal:output`, and `terminal:exit`; validate session/repo ids, dimensions (20–500 columns, 5–200 rows), and input string length (maximum 16 KiB per IPC message).

## Task 2: Main-process PTY service and lifecycle

**Files:** create `src/main/services/terminal-manager.ts`, create `src/main/ipc/terminal.ipc.ts`, modify `src/main/index.ts`

- [ ] Implement `TerminalManager` with a `Map<string, Session>`, a maximum of 8 live PTYs, and a 2000-line output buffer per session. Do not spawn before the user opens a terminal.
- [ ] Start the platform's configured interactive shell (PowerShell on Windows, user shell on macOS/Linux) with cwd set to `repo.localPath`. If the repo has no local path, return a typed error directing the UI to an available remote provider or explicit temporary checkout.
- [ ] Forward raw PTY data to the owning window and retain bounded scrollback for re-open; forward input and resize to the matching PTY.
- [ ] Close kills exactly one PTY; app `before-quit` closes all PTYs and waits up to five seconds before forced termination.
- [ ] Register the IPC handlers using the existing `IpcResult<T>` success/error convention. Never allow renderer-supplied executable paths or cwd values; resolve shell and cwd in main from app configuration and stored repo data.

## Task 3: Lazy xterm renderer

**Files:** create `src/renderer/src/components/RepoTerminal.tsx`, modify `src/renderer/src/lib/api.ts`

- [ ] Dynamically import xterm and addons only when the user opens the dock. Dispose the terminal, observers, listeners, and addons on component teardown.
- [ ] Use one xterm instance per pane/session; attach FitAddon and SearchAddon; call fit on initial mount, tab focus, split, and ResizeObserver updates.
- [ ] Implement session tabs, new, split, clear, close, hide, and maximize controls. Hiding does not close sessions. Show explicit “Encerrar sessão” for process termination.
- [ ] Copy uses selected text; Ctrl+C with a selection copies, Ctrl+C without a selection writes the interrupt byte. Paste uses the clipboard API and xterm paste API. Keep search scoped to xterm scrollback and use xterm link provider for URLs.
- [ ] Apply the existing Glibrary Steam theme through xterm's theme options and load the xterm CSS from the component.

## Task 4: Dock integration and verification

**Files:** modify `src/renderer/src/pages/RepoDetailPage.tsx`

- [ ] Add a terminal toggle to the repository page and render a resizable bottom panel while preserving the repository details above it.
- [ ] Preserve the existing Console tab for process logs; do not re-label process logs as a shell.
- [ ] Reload active session summaries from main when the page reopens; keep renderer state keyed by repo/session id so navigation does not orphan PTYs.
- [ ] Verify local shell startup, two concurrent sessions, split/focus, resize, copy/paste, clear/search, hide/re-open, explicit close, app quit cleanup, missing local path, and repeated open/close.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` from a disposable checkout. Do not run or add tests unless the user asks.

## Self-review

- Docked panel and repository context are in Task 4.
- Lazy loading, session controls, xterm behavior, and resource bounds are in Task 3.
- PTY process ownership, no orphan processes, local shell selection, and app cleanup are in Task 2.
- Native dependency and package requirements are in Task 1.
- Codespace and temporary checkout are intentionally separated into the dependent remote-provider plan.
