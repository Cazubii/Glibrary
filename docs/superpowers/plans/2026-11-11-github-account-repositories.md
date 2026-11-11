# GitHub Account Status and Repository Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Show the Glibrary GitHub credential state on Dashboard and let the user browse every repository that credential can access from Projetos without cloning repositories automatically.

**Architecture:** GitHub authentication and REST calls stay in Electron main. Typed IPC returns only account/repository metadata; the token is encrypted with safeStorage and never returned to renderer. Dashboard and Projetos share a short-lived renderer cache, with repository pages fetched only when requested.

**Tech Stack:** Electron main/preload IPC, TypeScript, React, Zustand, Zod, GitHub REST API.

---

## Files and responsibilities

- Modify `src/shared/types.ts`: account status, profile, repository summary, and page response contracts.
- Modify `src/shared/schemas.ts`: validate token and page inputs.
- Modify `src/shared/ipc-channels.ts`: add account and repository channels.
- Modify `src/main/services/github-api.ts`: preserve HTTP status and classify auth, permission, rate-limit, and network errors.
- Create `src/main/services/github-account.ts`: map GitHub user and repository API responses to narrow app types.
- Modify `src/main/ipc/assets.ipc.ts`: connect/status/disconnect/list handlers and the active `repoAddByUrl` handler; encrypt tokens; redact tokens from library/settings responses.
- Modify `src/renderer/src/lib/api.ts`: typed wrappers for the new IPC calls.
- Modify `src/renderer/src/store/library.ts`: keep account state and one repository-page cache in memory.
- Create `src/renderer/src/components/GithubAccountCard.tsx`: Dashboard status, connect form, refresh, and disconnect.
- Modify `src/renderer/src/pages/DashboardPage.tsx`: place the account card near the page heading.
- Create `src/renderer/src/components/GithubReposPanel.tsx`: paginated account-repository list and library-state labels.
- Modify `src/renderer/src/pages/AssetLibraryPage.tsx`: switch between existing local projects and GitHub repositories.

## Task 1: Shared contracts and validation

**Files:** `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/ipc-channels.ts`

- [ ] Define these shared types without including a token in any response:

```ts
export interface GithubAccountProfile {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
}

export type GithubAccountStatus =
  | { state: 'disconnected'; checkedAt: string }
  | { state: 'connected'; account: GithubAccountProfile; checkedAt: string }
  | {
      state: 'error';
      reason: 'invalid_token' | 'forbidden' | 'rate_limit' | 'network' | 'unknown';
      message: string;
      checkedAt: string;
    };

export interface GithubAccountRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  remoteUrl: string;
  htmlUrl: string;
  private: boolean;
  description?: string;
  language?: string;
  stars: number;
  pushedAt?: string;
  updatedAt: string;
}

export interface GithubRepoPage {
  repos: GithubAccountRepo[];
  page: number;
  hasNextPage: boolean;
}
```

- [ ] Add channels `githubAccountStatus`, `githubAccountConnect`, `githubAccountDisconnect`, and `githubReposList`.
- [ ] Validate connect input as a trimmed non-empty token; validate page as an integer from 1 through 100000. Keep page size fixed in main at 50.
- [ ] Confirm all response contracts contain only profile/repository metadata.

## Task 2: GitHub REST service and main-process IPC

**Files:** `src/main/services/github-api.ts`, `src/main/services/github-account.ts`, `src/main/ipc/assets.ipc.ts`

- [ ] Add an error type in `github-api.ts` that preserves HTTP status and classifies 401 as invalid credentials, 403/429 as permission or rate limit using response headers/body, and transport failures as network errors.
- [ ] Create service methods `fetchGithubAccount(token)` for `GET /user` and `fetchGithubRepos(token, page)` for `GET /user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=50&page=<page>`. Map only the fields in `GithubAccountProfile` and `GithubAccountRepo`; set `hasNextPage` when the response contains 50 items.
- [ ] Register IPC handlers in the already active `registerAssetsIpc` path. Connect validates the token with `GET /user` before encrypting it with `encodeToken` and saving it. Disconnect stores an empty credential. Status decodes the stored token and returns `disconnected` when absent.
- [ ] Register `IpcChannels.repoAddByUrl` in this active path for `clone: false`: validate the GitHub URL, deduplicate normalized URLs, create a `Repo` with `status: 'not_cloned'`, and persist it with `LibraryStore.addRepo`. Reject `clone: true` in this handler; the account catalog only adds remote references.
- [ ] Redact `githubToken` from `libraryGet`, `settingsGet`, and `settingsSet` responses. Ensure the active `settingsSet` handler encrypts a submitted token and rejects token writes when `safeStorage.isEncryptionAvailable()` is false.
- [ ] Keep credentials out of logs and return error categories without returning request headers or token text.
- [ ] The fine-grained token setup instructions must request only repository Metadata read for repository listing; the authenticated-user endpoint requires no additional fine-grained permission. Users only see private repositories granted to that token.

## Task 3: Renderer API and memory cache

**Files:** `src/renderer/src/lib/api.ts`, `src/renderer/src/store/library.ts`

- [ ] Add typed API methods `githubAccountStatus()`, `githubAccountConnect(token)`, `githubAccountDisconnect()`, and `githubReposList(page)`.
- [ ] Add Zustand fields for the last account result and repository pages; add actions to refresh account, connect/disconnect, load the next page, and clear repository pages after account changes.
- [ ] Reuse account status for five minutes; do not poll. Load repository page 1 only when the account list is opened, and request the next page only when the user selects “Carregar mais”.
- [ ] Ensure the token is cleared from the connect form state after success, failure, and modal close.

## Task 4: Dashboard account card

**Files:** create `src/renderer/src/components/GithubAccountCard.tsx`; modify `src/renderer/src/pages/DashboardPage.tsx`

- [ ] Display disconnected, connected, invalid-token, forbidden, rate-limit, and network states separately.
- [ ] Connected state shows avatar, login, link to the profile, last verification time, refresh, and disconnect.
- [ ] Disconnected state offers a masked token field, a link to GitHub token settings, and the minimum-permission guidance. Do not show or retrieve the saved token.
- [ ] Add the card to Dashboard without changing existing summary cards or charts.
- [ ] Keep all network loading/error feedback within the card and use the existing `onError`/success toast callbacks only for actions that complete.

## Task 5: GitHub repositories in Projetos

**Files:** create `src/renderer/src/components/GithubReposPanel.tsx`; modify `src/renderer/src/pages/AssetLibraryPage.tsx`

- [ ] Add a two-option selector inside the Projetos section: “Projetos locais” and “Repositórios da conta”. The local tab keeps the current project list and add-folder action unchanged.
- [ ] Require a connected account for the remote tab; otherwise show the account connection action/state.
- [ ] Show owner/name, public/private badge, description, language, stars, and last update. Search filters loaded pages; “Carregar mais” appends the next page and deduplicates by numeric repository id.
- [ ] Compare normalized remote URLs against the existing library repository and base URLs. Mark matches “Na biblioteca”; offer “Adicionar à biblioteca” for non-matches through `api.repoAddByUrl(url, false, fullName)`. Never auto-clone or bulk-import.
- [ ] Show loading, empty, and retry states. Keep the list virtual-free unless observed account sizes require virtualization; page size 50 bounds memory and rendering.

## Task 6: Verification

**Files:** none

- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` from a disposable checkout of this feature branch if no existing remote development environment is available. Do not run or add tests unless the user asks.
- [ ] Manually verify: no token; valid token; invalid token; token with Metadata read but no private-repo grant; rate limit; two repository pages; duplicate repository already in library; disconnect; local Projetos tab unchanged.
- [ ] Confirm through IPC responses that no token or encrypted token is returned to renderer.

## Self-review

- Dashboard account identity and error states map to Tasks 2–4.
- All repositories available to the app credential, pagination, deduplication, and no-clone behavior map to Tasks 2, 3, and 5.
- Existing local projects remain independent and unchanged in Task 5.
- Token encryption/redaction and remote-only repository creation are included in Task 2 because the current active IPC path is `registerAssetsIpc`; the standalone repo IPC module is not registered by `src/main/index.ts`.
- No automated test files or test commands are added per the standing instruction.
