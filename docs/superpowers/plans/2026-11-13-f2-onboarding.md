# F2 — Primeira experiência guiada

## Diagnóstico confirmado

- `src/renderer/src/components/Onboarding.tsx` existe, mas o `App.tsx` da F1 nunca o importa. O componente atual só sugere pastas e abre o escaneamento; não tem boas-vindas, verificação de ferramentas, GitHub nem escolha entre Base e projeto existente.
- `Settings` é persistido em `library.json` v2. `LibraryStore.migrateLibrary` já completa os campos novos em bibliotecas v1/v2, e `save()` faz escrita temporária, troca atômica e cópia para `library.backup.json`.
- `api.toolsCheck()`, `api.githubAuthMe()`, `api.onboardingSuggest()`, `api.dialogPickFolder()`, `api.scanStart()` e `api.projectAdd()` já existem.
- Git e Node são verificados por `ToolsChecker` usando comandos fixos; os presets de CLI reconhecidos ficam em `src/shared/agent-presets.ts` (Claude Code, OpenCode, Codex CLI, Gemini CLI e Aider). A preferência de CLI padrão permanece decisão pendente.
- A engrenagem abre Ferramentas; a conta GitHub atual usa PAT em `GithubAccountMenu.tsx`. O menu fica visível no cabeçalho enquanto o onboarding ocupa o conteúdo central.
- `DashboardPage.tsx` já mostra projetos locais recentes; pode incluir o checklist sem criar outra área de navegação.

## Escopo e decisões desta frente

1. Acrescentar ao estado persistido `settings.onboarding`: estado (`not-started`, `dismissed` ou `completed`), passo atual, visibilidade do checklist e itens concluídos.
2. Em biblioteca nova, iniciar com `not-started`. Em arquivos v1/v2 existentes sem esse campo, marcar como `dismissed` quando já houver dados de projeto/biblioteca, evitando interromper usuários antigos; biblioteca vazia continua `not-started`. O checklist só aparece quando o usuário realmente termina ou dispensa o assistente.
3. Salvar a migração v2 antes de encerrar `load()`, preservando todos os campos conhecidos e deixando o backup íntegro.
4. Transformar `Onboarding.tsx` num fluxo de cinco passos: boas-vindas, ferramentas, GitHub opcional, pasta e primeiro projeto. Todos os passos podem ser pulados; pular encerra como `dismissed`, concluir o quinto passo grava `completed`.
5. Reutilizar o verificador de ferramentas existente e estendê-lo com os cinco CLIs suportados. Isso só detecta instalações; não escolhe nem recomenda um CLI padrão.
6. No quinto passo, oferecer escanear uma pasta existente ou abrir Biblioteca para escolher uma Base. A escolha de Base permanece no fluxo existente da Biblioteca.
7. Mostrar no Início o checklist persistente de ferramentas, GitHub, projeto, primeira solicitação a agente e envio ao GitHub. O usuário marca ações feitas; o card some quando os cinco itens estiverem concluídos.

## Arquivos previstos

| Arquivo | Mudança |
|---|---|
| `src/shared/types.ts`, `src/shared/schemas.ts` | Tipos e validação Zod de estado e checklist, com defaults compatíveis. |
| `src/main/services/library-store.ts` | Defaults e migração v1/v2, classificação da biblioteca existente e persistência de migração v2. |
| `src/shared/tools.ts` | Verificar os CLIs já presentes nos presets, sem fixar um CLI recomendado. |
| `src/renderer/src/components/Onboarding.tsx` | Fluxo guiado acessível, retomar passo salvo, checar ferramentas/GitHub e abrir projeto/modelo. |
| `src/renderer/src/App.tsx` | Abrir o assistente somente quando status for `not-started`; manter navegação e conta no cabeçalho. |
| `src/renderer/src/pages/DashboardPage.tsx` e novo `GettingStartedChecklist.tsx` | Checklist persistente no Início com destino para cada ação. |
| `tests/library-store.test.ts`, `tests/onboarding.test.ts`, `tests/tools-checker.test.ts` | Migração, backup, estados de primeira abertura, checklist e detecção de CLI. |
| `README.md`, `docs/DECISOES.md` | Atualizar estado entregue e decisões sem definir CLI/default do modo simples. |

## Tarefas

- [x] Pesquisar o store, o contrato IPC, o App, as ferramentas, a conta GitHub e o onboarding antigo.
- [x] Registrar este plano atualizado depois da inspeção do código.
- [x] Adicionar esquema, tipos, defaults e migração de estado com testes de preservação de dados/backup.
- [x] Construir os cinco passos com estado retomável e ações existentes.
- [x] Integrar o assistente ao App e o checklist ao Início.
- [x] Adicionar detecção dos CLIs sem escolher o padrão.
- [x] Atualizar README e `docs/DECISOES.md`.
- [x] Rodar typecheck, lint, 289 testes e build.
- [x] Abrir PR separado para F2 sobre a cadeia F1/F4/F5.

## Critérios de aceite

- Sem `library.json`, `LibraryStore.load()` gera `settings.onboarding.status === 'not-started'` e o App abre no primeiro passo.
- Uma biblioteca v2 existente recebe o estado de onboarding uma vez, continua válida, mantém todos os dados e preserva `library.backup.json`.
- Bibliotecas existentes com conteúdo não recebem o assistente automaticamente; bibliotecas v1 e v2 vazias recebem o fluxo.
- O usuário pode pular cada passo, retomar o passo salvo após navegar para Ferramentas e o assistente não volta após conclusão ou dispensa.
- A conta GitHub é opcional e usa a interface disponível; OAuth/device flow continua pendente da F3 e do client ID do mantenedor.
- Git, Node e pelo menos um CLI suportado aparecem com estado instalado/ausente; o botão Ferramentas abre a tela existente.
- O primeiro projeto pode ser escaneado ou o usuário pode seguir para Biblioteca e escolher uma Base.
- O checklist tem cinco ações, persiste as marcações e desaparece ao concluir todas.
