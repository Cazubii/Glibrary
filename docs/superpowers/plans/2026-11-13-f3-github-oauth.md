# F3 — Login GitHub sem token manual

> **For agentic workers:** execute inline in this session, one task at a time. Preserve the existing PAT path as an advanced option and keep the GitHub client ID configurable without embedding a client secret.

**Goal:** Permitir conectar a conta GitHub pelo Device Flow e renovar tokens com segurança, mantendo o PAT como alternativa avançada.

**Architecture:** Um serviço exclusivo no processo principal inicia e consulta o Device Flow, valida respostas externas com Zod e grava access/refresh tokens cifrados por `safeStorage`. O client ID é uma configuração de build pública; quando ausente, o fluxo aparece como indisponível e o PAT continua utilizável. As operações já existentes obtêm o token por um resolvedor compartilhado que renova e persiste a rotação antes de expor o valor ao Git/GitHub.

**Tech Stack:** Electron `net`/Node `fetch`, Electron IPC tipado, Zod, `safeStorage`, React, Vitest.

---

## Diagnóstico confirmado

- `GithubAccountMenu.tsx` hoje exige colar PAT com escopo `repo`; `githubAuthCheck` valida `/user`, e `settingsSet` cifra o PAT por `encodeToken` antes de salvar.
- `githubAuthMe`, dashboard, repositórios, catálogo, projetos e workspace de desenvolvimento leem o valor com `decodeToken`; operações de longa duração precisam passar pelo mesmo resolvedor de renovação.
- `Settings` já é persistido em `library.json` v2 e validado em `SettingsSchema`; campos opcionais preservam compatibilidade sem aumentar a versão.
- `electron.vite.config.ts` hoje não injeta configuração pública no processo principal. `electron-builder.yml` não precisa guardar segredo OAuth.
- O app já usa `{ ok, data } | { ok, error }` no IPC e `translateError` em `repos.ipc.ts`.
- A documentação oficial do GitHub indica Device Flow para apps desktop, exige habilitá-lo na configuração do app e usa `client_id` sem `client_secret`. Os códigos duram 15 minutos e o intervalo inicial de polling é 5 segundos.
- A documentação do GitHub permite solicitar `offline_access` no GitHub App para receber access token de 8 horas e refresh token de 6 meses; cada renovação rotaciona ambos.
- GitHub Apps permitem permissões granulares de repositório; OAuth Apps usam escopos mais amplos como `repo`. O dono precisa fornecer o client ID e habilitar Device Flow; nenhum app será registrado por esta implementação.

## Decisões desta frente

1. Recomendar GitHub App com Device Flow, permissões mínimas `Metadata: read` e `Contents: read/write`; repositórios privados exigem que a pessoa instale o app e conceda acesso aos repositórios. Avaliar `Administration: write` separadamente se a publicação da F7 precisar criar repositórios remotos.
2. Solicitar `offline_access`; guardar access token, refresh token e expirações cifrados, renovar antes do vencimento e persistir a rotação atômica via `LibraryStore`.
3. Fazer logout local apagar tokens e datas locais. Informar que isso não revoga a autorização no GitHub, e dar acesso às instruções de revogação em Configurações > Integrações > Aplicações > Aplicativos GitHub autorizados.
4. Manter PAT em “Opções avançadas”; ao salvar PAT, limpar metadados de refresh anteriores.
5. Ler o client ID público de `GLIBRARY_GITHUB_OAUTH_CLIENT_ID` no build/dev. Ausente ou vazio, desabilitar apenas o Device Flow e explicar que a configuração do mantenedor está pendente.

## Arquivos previstos

| Arquivo | Responsabilidade |
|---|---|
| `electron.vite.config.ts`, novo `src/main/env.d.ts`, `.env.example` | Injetar client ID público sem segredo e documentar variável. |
| novo `src/main/services/github-oauth.ts` | Device Flow, parsing Zod, polling, cancelamento, refresh token rotativo, serialização de renovação por store. |
| `src/main/services/library-store.ts`, `src/shared/types.ts`, `src/shared/schemas.ts` | Persistir token cifrado, refresh cifrado e expirações opcionais sem quebrar `library.json` v1/v2. |
| `src/main/ipc/repos.ipc.ts`, `src/shared/ipc-channels.ts`, `src/renderer/src/lib/api.ts` | Expor status/início/poll/cancel via IPC validado e contrato tipado. |
| `src/main/ipc/assets.ipc.ts`, `dashboard.ipc.ts`, `projects.ipc.ts`, `src/main/services/dev-workspace.ts` | Obter token por API assíncrona central para todas as operações GitHub existentes. |
| `src/renderer/src/components/GithubAccountMenu.tsx` | Device Flow principal, código copiável, estado/expiração, cancelamento, PAT avançado, logout e caminho de revogação. |
| `tests/github-oauth.test.ts`, `tests/library-store.test.ts` | Fluxos pending/slow_down/expiração/negação, validação, renovação/rotação, persistência cifrada e compatibilidade do store. |
| `README.md`, `docs/DECISOES.md` | Estado entregue, recomendação e dependência do client ID do mantenedor. |

## Tarefas

### 1. Configurar o client ID público

- [x] Carregar `GLIBRARY_GITHUB_OAUTH_CLIENT_ID` no `electron.vite.config.ts` e substituir um literal tipado no processo principal. Não criar nem ler `client_secret`.
- [x] Adicionar `.env.example` com a variável vazia e instruções de cópia para `.env.local`, que permanece fora do Git.
- [x] Implementar `getGithubOAuthClientId()` que retorna string vazia quando não houve configuração.
- [x] Confirmar build e typecheck com a variável ausente e com um valor fictício não secreto.

### 2. Criar e testar o serviço Device Flow

- [x] Definir schemas Zod para resposta de device code e resposta de access/refresh token, incluindo `authorization_pending`, `slow_down`, `expired_token`, `access_denied` e campos desconhecidos opcionais.
- [x] Implementar POSTs fixos em `github.com/login/device/code` e `github.com/login/oauth/access_token` com `Accept: application/json`; nunca aceitar URL ou client ID pelo renderer.
- [x] No início, solicitar `scope=offline_access`, armazenar o `device_code` somente em memória no processo principal e devolver ao renderer somente session ID, código do usuário, URL, expiração e intervalo.
- [x] No poll, respeitar o intervalo devolvido pelo GitHub; `slow_down` soma pelo menos cinco segundos; não registrar códigos ou tokens em logs/erros.
- [x] Em sucesso, validar a identidade em `/user`, cifrar access/refresh token com `encodeToken`, guardar expirações e descartar a sessão transitória.
- [x] Implementar cancelamento/limpeza por sessão e apagar sessões expiradas.
- [x] Cobrir com testes que injectam `fetch`, relógio e armazenamento: pending, slow_down, código expirado, negado, erro de rede, resposta inválida, sucesso, refresh e rotação.

### 3. Renovar tokens nas operações existentes

- [x] Adicionar campos opcionais de refresh e expiração a `Settings` e schemas; manter o formato v2 e validar datas como timestamps positivos.
- [x] Implementar `getGithubAccessToken(store)`: PAT sem expiração retorna direto; token OAuth renova antes da expiração; tokens renovados são cifrados e persistidos; refresh vencido produz erro legível para reconectar.
- [x] Compartilhar a promessa de refresh por instância de store para evitar duas renovações simultâneas do mesmo refresh token rotativo.
- [x] Usar o resolvedor em authMe, busca/importação/análise, dashboard, lista de projetos GitHub, clone/push e workspace. Manter `githubAuthCheck(token)` como validador da alternativa PAT.
- [x] Ao receber PAT via `settingsSet`, cifrar o PAT e zerar refresh/expiração OAuth sem alterar as demais configurações.
- [x] Testar que v1/v2 antigos carregam sem migração destrutiva e que a renovação preserva o backup atômico do store.

### 4. Expor Device Flow pelo IPC e renderer

- [x] Criar canais `githubOAuthStatus`, `githubOAuthStart`, `githubOAuthPoll` e `githubOAuthCancel`.
- [x] Validar `sessionId` por Zod; respostas usam `IpcResult`; o IPC devolve ao renderer apenas o status e, após sucesso, `GithubUser`.
- [x] Adicionar métodos tipados `githubOAuthStatus()`, `githubOAuthStart()`, `githubOAuthPoll(sessionId)` e `githubOAuthCancel(sessionId)` em `GlibraryApi` e `api`.
- [x] Mostrar botão principal “Entrar com GitHub”; exibir código de uso único, botão copiar, link para `github.com/login/device`, limite de expiração e cancelar; fazer polling no intervalo solicitado.
- [x] Mover PAT para “Opções avançadas”; quando client ID ausente, mostrar configuração pendente e manter PAT acessível.
- [x] Substituir “Desconectar” por “Sair deste computador”; apagar credenciais locais e explicar/linkar a revogação remota do GitHub.
- [x] Garantir limpeza das sessões e timers ao cancelar, fechar o menu ou desmontar o componente.

### 5. Documentar e validar

- [x] Registrar em `docs/DECISOES.md` comparação GitHub App/OAuth App, permissões mínimas, `offline_access`, rotação, expiração, revogação e o client ID pendente do mantenedor.
- [x] Atualizar README e checklist F3 no plano; listar a variável pública e explicar como configurar sem inserir segredo no app.
- [x] Rodar `typecheck`, `lint`, `test` e `build` localmente. A matriz remota fica pendente de abertura do PR.
- [ ] Abrir PR separado empilhado sobre F2, aguardar CI verde no Windows, Linux e macOS e manter o rascunho até receber/configurar o client ID do mantenedor. Não registrar app, permissões nem URL da aplicação por conta própria.

## Critérios de aceite

- Com client ID configurado, a pessoa inicia Device Flow, autoriza no navegador, confirma identidade e não cola token.
- Com client ID ausente, a interface informa a dependência e o PAT avançado continua funcionando.
- O renderer nunca recebe access token, refresh token ou `device_code`; IPC usa envelopes `{ ok, data | error }` e valida entradas com Zod.
- Access/refresh tokens ficam cifrados via `safeStorage`; refresh rotativo atualiza os dois valores e datas antes da próxima operação.
- PAT antigo e bibliotecas v1/v2 continuam funcionais; atualizar para PAT apaga dados de refresh OAuth.
- Logout apaga credenciais locais e ensina como revogar autorização no GitHub.
- Typecheck, lint, testes, build e CI dos três sistemas passam.

## Referências oficiais verificadas

- [Device Flow para GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Renovação de user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [Diferenças entre GitHub Apps e OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [Habilitar Device Flow](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration)
- [Revogar autorização de GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps)
