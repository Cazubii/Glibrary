# Remote-First Terminal Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Let a repository terminal connect to an existing GitHub Codespace without cloning locally, while making creation and any temporary local checkout explicit.

**Architecture:** Extend the local terminal manager with provider adapters. The Codespace adapter attaches through GitHub CLI and never provisions implicitly; the fallback adapter creates a temporary clone only after an explicit user action and protects dirty data from cleanup.

**Tech Stack:** Electron main process, node-pty, GitHub CLI, GitHub REST API, TypeScript, React.

**Dependency:** Complete `2026-11-11-vscode-local-terminal.md` first.

---

## Files and responsibilities

- Modify `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/ipc-channels.ts`: remote provider and Codespace state contracts.
- Create `src/main/services/codespace-service.ts`: locate gh CLI, list existing Codespaces, start/stop a selected Codespace, report auth and process state.
- Create `src/main/services/temporary-checkout.ts`: create and inspect temporary clones and guard cleanup.
- Modify `src/main/services/terminal-manager.ts`: route sessions to local, Codespace, or temporary checkout provider.
- Modify `src/main/ipc/terminal.ipc.ts`: validate provider commands and Codespace actions.
- Modify `src/renderer/src/lib/api.ts` and `src/renderer/src/components/RepoTerminal.tsx`: provider selector, Codespace list/state, explicit cleanup.
- Modify `src/main/index.ts`: dispose provider processes and temporary workspaces during app shutdown.

## Task 1: Codespace discovery and connection

**Files:** create `src/main/services/codespace-service.ts`; modify terminal types, schema, manager, IPC, and terminal component.

- [ ] Add provider values `codespace` and `temporary-local` to the terminal contract. Keep start input to `repoId`, `provider`, and optional `codespaceName`; never accept an arbitrary command from renderer.
- [ ] Use `gh auth status` to detect CLI authentication and `gh codespace list --repo <owner/name> --json name,repository,state` to list existing Codespaces for the selected repository. Resolve `gh` from the main-process PATH and return a clear install/auth error without echoing environment secrets.
- [ ] Attach with `gh codespace ssh --codespace <name>` under node-pty. Stream its PTY data through the local session manager; do not create a Codespace during list/connect.
- [ ] Add a separate explicit “Criar Codespace” action only if the user has no existing Codespace. Before the GitHub API/CLI create call, show a confirmation describing required access and that Codespaces usage can be billed; include a cancel action. Never call create on panel open or automatic reconnect.
- [ ] Show Codespace running/stopped/unknown state. Hiding or disconnecting terminal only closes SSH; stopping/deleting a Codespace is a separate explicit action.
- [ ] Handle missing gh, unauthenticated CLI, permission denied, network loss, and closed SSH with actionable states; reconnect must not duplicate a process.

## Task 2: Explicit temporary local checkout

**Files:** create `src/main/services/temporary-checkout.ts`; modify manager, IPC, main lifecycle and terminal component.

- [ ] Clone the selected remote URL into a unique folder under the OS temp directory only after the user chooses “Checkout temporário”. Do not use a permanent `reposRoot` or silently fall back to the app's current working directory.
- [ ] Record the temp path in main-process session metadata and display “temporário” with the path's parent hidden from routine UI.
- [ ] Before cleanup, run git status in main and inspect whether tracked, untracked, staged, or unpushed changes exist. If dirty, refuse automatic deletion and offer explicit publish/open-folder actions; preserve the folder across window hide or session disconnect.
- [ ] Provide a separate “Remover checkout temporário” confirmation for a clean workspace. Never delete on hide/disconnect. On app exit, keep dirty workspaces and surface their paths on next start; only remove clean ones after explicit user choice.
- [ ] When no Codespace exists, offer create, temporary checkout, or cancel. Do not auto-select a fallback.

## Task 3: Provider integration and verification

**Files:** terminal provider files listed above.

- [ ] Ensure common input/output/resize/close APIs work across local and Codespace PTYs; temporary local uses the same local PTY after the clone is ready.
- [ ] Preserve provider selection in app state, but never persist a local temp path for a remote-only repository.
- [ ] Verify existing Codespace connect, no Codespace, stopped Codespace, missing gh, unauthenticated gh, denied access, network drop/reconnect, explicit create confirmation, clean temporary checkout cleanup, and dirty checkout preservation.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` from a disposable checkout. Do not run or add tests unless the user asks.

## Self-review

- Existing Codespaces connect without local project files in Task 1.
- Cost-bearing creation is isolated behind explicit confirmation in Task 1.
- The local fallback is explicit, temporary, and protects changes in Task 2.
- Local terminal foundation is a hard dependency so every provider reuses one session/stream API.
- GitHub code edits that need no shell continue through the GitHub repository connector; this plan does not introduce a renderer file editor or clone for those tasks.
