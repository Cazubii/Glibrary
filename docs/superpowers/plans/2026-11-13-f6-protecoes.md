# F6 — Rede de proteção Implementation Plan

> **For agentic workers:** execute inline, one task at a time. Use TDD and keep this front in a separate draft PR stacked on F3.

**Goal:** Permitir revisar alterações antes de salvá-las, proteger a linha principal, recuperar versões e limitar o gasto dos agentes.

**Architecture:** O processo principal continua sendo a autoridade para Git, descarte e orçamento. O renderer recebe previews e estados tipados pelo IPC validado com Zod. A configuração de orçamento usa campos opcionais em `library.json` v2, preservando bibliotecas existentes; o modo simples corresponde a `showAdvancedResources === false`, sem mudar o padrão ainda pendente do mantenedor.

**Tech Stack:** Electron, TypeScript estrito, simple-git, Zod, React, Vitest.

---

## Diagnóstico confirmado

- `GitService.listChanges` lista estado, branch e arquivos; não prepara um diff para revisão.
- `RepoGitPanel` salva com `commitAll`, que executa `git add -A`, e permite enviar sem confirmação da branch.
- `DevWorkspacePage` também envia sem confirmação; seu botão “Descartar” só fecha uma cópia gerenciada e não protege as alterações feitas nela.
- `GitService` não tem operação de desfazer commit local nem de criar commit de reversão.
- `AgentRunManager.start` executa na pasta local do repositório; `AgentRun` registra uso de custo quando a CLI fornece telemetria, mas não registra as mudanças feitas nem impõe limites.
- `Settings.showAdvancedResources` já distingue recursos avançados do modo simples. O valor inicial permanece `true` enquanto o mantenedor não decidir o padrão.
- `SettingsSchema` aceita campos opcionais sem troca da versão 2, e `library.json` passa pela escrita atômica existente.

## Decisões desta frente

1. Ativar proteção automática de branch quando `showAdvancedResources` for `false`; manter a preferência inicial atual e registrar que o padrão simples depende do mantenedor.
2. Ao executar um agente no modo simples em `main` ou `master`, criar `glibrary/<data>-<assunto>` antes de iniciar o processo. Se o nome existir, acrescentar um sufixo numérico.
3. Pedir confirmação explícita antes de enviar qualquer branch `main` ou `master` no modo simples; impor a regra também no processo principal.
4. Desfazer um commit local e ainda não enviado com reset misto, preservando arquivos no diretório. Para um commit já enviado, criar um novo commit de reversão e deixar o envio para a ação normal de push.
5. Só descartar arquivos alterados pelo agente quando estavam limpos antes da execução e continuarem iguais ao snapshot capturado ao terminar. Preservar alterações anteriores e edições feitas depois do resumo.
6. Armazenar limites por execução e por dia em dólares, ambos opcionais. O valor diário considera a data local e custos reportados pela CLI; o processo para ao receber uma atualização que atinge o limite. Bloquear comandos genéricos sem telemetria quando algum limite estiver configurado, pois não há como aplicar um teto sem custo mensurável.
7. Mostrar a 80% um aviso na execução e nas Configurações. Uma sugestão de mensagem de commit só será copiada como pedido pronto para o agente, sem executar outra CLI nem conceder acesso de escrita adicional.

## Arquivos previstos

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/ipc-channels.ts` | Tipos e validação de previews, confirmação de envio, snapshots de alterações, orçamento e ações de resolução. |
| `src/main/services/git-service.ts` | Gerar diff incluindo arquivos novos, revisar estado, desfazer commit não enviado, reverter commit enviado, criar branch de segurança e descartar somente snapshots confirmados. |
| `src/main/services/git-protection.ts` | Regras puras para branch protegida, nome de branch e limiares de orçamento. |
| `src/main/services/agent-run-manager.ts`, `src/main/services/agent-run-store.ts` | Capturar estado antes/depois do agente, impor orçamento e manter metadados de mudanças resolvíveis. |
| `src/main/ipc/repos.ipc.ts`, `src/main/ipc/dev-workspace.ipc.ts`, `src/main/ipc/agent-runs.ipc.ts` | Validar e executar previews, commit, push, undo/revert e manter/descartar. |
| `src/renderer/src/lib/api.ts`, `src/renderer/src/store/agents.ts` | Tipar chamadas e atualizar o estado após resolver mudanças. |
| `src/renderer/src/components/RepoGitPanel.tsx`, novo `GitReviewDialog.tsx`, `src/renderer/src/pages/DevWorkspacePage.tsx` | Mostrar diff antes do commit, confirmação de `main`/`master`, desfazer e reverter. |
| `src/renderer/src/components/AgentRunCard.tsx`, `src/renderer/src/pages/AgentesPage.tsx`, `src/renderer/src/components/SettingsMenu.tsx`, `src/renderer/src/App.tsx` | Resumo do que o agente mudou, ações ver/manter/descartar, aviso de gasto e controles de limite. |
| `src/main/services/library-store.ts` | Defaults e persistência compatível dos campos opcionais de orçamento. |
| `tests/git-service.test.ts`, `tests/dev-workspace.test.ts`, `tests/agent-run-manager.test.ts`, `tests/library-store.test.ts`, novo `tests/git-protection.test.ts` | Cobrir diffs, branch protegida, recuperação, descarte seguro, limites e compatibilidade do store. |
| `README.md`, `docs/DECISOES.md` | Explicar as proteções entregues e registrar escolhas duráveis. |

## Tarefas

### 1. Tipos e regras puras

- [x] Escrever testes para `isProtectedBranch`, geração de slug `glibrary/<data>-<assunto>`, comportamento de confirmação e cálculo dos avisos em 80%.
- [x] Executar `npm.cmd test -- tests/git-protection.test.ts` e confirmar falha por ausência das funções.
- [x] Criar `src/main/services/git-protection.ts` com funções puras e sem acesso a disco ou Electron.
- [x] Adicionar `AgentFileChange` (`path`, `kind`, `sha256`), `AgentRun.budgetWarning` e `AgentRun.budgetStopReason`; validar cada campo com Zod.
- [x] Adicionar `Settings.agentRunBudgetUsd` e `Settings.agentDailyBudgetUsd` opcionais; aceitar valores finitos entre US$ 0,01 e US$ 10.000 e preservar `library.json` v1/v2 já normalizado.

### 2. Revisão antes de salvar

- [x] Escrever teste de GitService com arquivo rastreado alterado e arquivo novo, exigindo que ambos apareçam no preview.
- [x] Confirmar a falha do teste antes de implementar.
- [x] Implementar `previewChanges(localPath)` com caminhos de status e diff para mudanças rastreadas e conteúdo completo de arquivos novos, passando argumentos ao Git sem shell.
- [x] Criar `GitReviewDialog` com lista de arquivos, diff rolável e botões cancelar, salvar versão e copiar pedido de sugestão de mensagem para o agente.
- [x] Alterar `RepoGitPanel` para abrir o diálogo e só chamar `repoCommit` após confirmação; ao salvar, atualizar status e fechar o diálogo.
- [x] Testar preview com espaços no caminho e arquivo novo, sem incluir diretórios fora do repositório.

### 3. Branch principal, envio e recuperação

- [x] Escrever testes de GitService para criar linha de trabalho sem colisão, impedir push em `main`/`master` sem confirmação, preservar arquivos ao desfazer commit local e criar commit novo ao reverter commit enviado.
- [x] Confirmar falha inicial dos testes.
- [x] Implementar branch automática antes da execução do agente no modo simples, usando `repo.devSession.workspacePath` se houver sessão aberta e `repo.localPath` caso contrário.
- [x] Implementar confirmação obrigatória no processo principal para push em `main`/`master` no modo simples; passar o resultado explícito da confirmação pelo IPC nas duas telas.
- [x] Implementar undo somente quando existir commit local à frente do remoto; usar reset misto para manter os arquivos no diretório.
- [x] Implementar revert somente quando o commit atual estiver enviado e a árvore estiver limpa; criar commit de reversão local, sem envio automático.
- [x] Exibir confirmação com branch e efeito para envio protegido, undo, revert e descarte do workspace.

### 4. Resumo e resolução das mudanças do agente

- [x] Escrever testes para registrar alterações feitas pelo agente sem incluir arquivos já alterados antes da execução.
- [x] Confirmar falha inicial e implementar snapshot dos caminhos limpos antes de iniciar o processo e hashes após o término.
- [x] Guardar os caminhos novos/alterados no `AgentRunStore`; ignorar paths que não pertençam à raiz real do repositório.
- [x] Adicionar IPC validado para obter diff desses caminhos e resolver como manter ou descartar.
- [x] Antes do descarte, comparar hash atual com o snapshot final; restaurar arquivos rastreados somente de `HEAD` e remover apenas arquivos novos iguais ao hash salvo. Ignorar mudanças que ocorreram após o snapshot.
- [x] Mostrar “O agente alterou N arquivos”, com “Ver mudanças”, “Manter” e “Descartar” na execução concluída.
- [x] Testar preservação de alterações prévias, modificação posterior e caminho fora do repositório.

### 5. Limites de gasto por execução e por dia

- [x] Escrever testes para rejeitar nova execução quando o limite diário já foi atingido, avisar em 80%, parar no limite por execução e parar execuções ativas quando o limite diário for atingido.
- [x] Confirmar falha inicial dos testes e adicionar funções puras de cálculo em `git-protection.ts` ou módulo dedicado `agent-budget.ts`.
- [x] Validar orçamento no `SettingsSchema` e persistir por `LibraryStore.updateSettings` sem mudar a versão da biblioteca.
- [x] Exigir telemetria de custo dos provedores monitorados quando limites estiverem ativos; rejeitar modo genérico com instrução para escolher Claude Code/OpenCode monitorado ou remover o teto.
- [x] Aplicar limites no processo principal depois de cada atualização de custo e antes de iniciar novas execuções; sinalizar parada automática no registro da execução.
- [x] Adicionar campos de valor por execução e diário nas Configurações, com ação salvar, indicação de limite desligado quando vazio e aviso de que o gasto usa valores informados pela CLI.
- [x] Mostrar aviso ao chegar a 80% e mensagem clara quando a execução for encerrada por limite.

### 6. Documentar e validar

- [x] Registrar em `docs/DECISOES.md` as regras de branch, undo/revert, descarte por snapshot, telemetria e valores de orçamento.
- [x] Atualizar README em “O que já faz” e “Para onde vai”.
- [x] Executar `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build`.
- [ ] Conferir que o diff da F6 não carrega alterações de F0–F5, abrir PR separado sobre F3 e aguardar CI Windows/Linux/macOS verde.

## Critérios de aceite

- Antes de salvar um commit, a pessoa vê os arquivos e o diff, podendo copiar um pedido de sugestão para o agente.
- No modo simples, o agente sai de `main`/`master` para uma branch `glibrary/...`; push para essas branches exige confirmação explícita no renderer e validação no main.
- Undo só é oferecido para commit não enviado e preserva conteúdo; revert cria um novo commit para conteúdo já enviado.
- Após a execução, mudanças próprias do agente podem ser revisadas, mantidas ou descartadas sem apagar alterações que existiam antes ou que mudaram depois.
- Os limites por execução e por dia são persistidos e impostos no main; o aviso aparece a 80%; sem telemetria de custo não se inicia CLI genérica com teto ativo.
- Bibliotecas existentes continuam lendo sem migração destrutiva e o IPC mantém `{ ok, data | error }`.
- Typecheck, lint, testes, build e CI dos três sistemas passam.
