# F1 — Plano de navegação por intenção

> Este plano foi escrito após revisar a implementação atual no worktree da F0 e comparar o conteúdo da branch empilhada com o `main` remoto. Preservar o visual atual do Glibrary (tema Steam) e manter todas as funções acessíveis no modo avançado.

**Objetivo:** trocar as nove abas técnicas por cinco áreas nomeadas pelo trabalho da pessoa: Início, Projetos, Biblioteca, Descobrir e Agentes. Ferramentas e preferências ficam atrás de uma engrenagem.

**Estado observado:** `App.tsx` controla nove destinos com `useState`, inicia no Dashboard e não usa roteador. `ProjectsPage` já contém `DevWorkspacePage` e `RepoDetailPage`, incluindo Git e terminal. `AssetLibraryPage` mistura Skills, Agents, Bases, projetos locais e Top GitHub; `CollectionsPage`, `RepoAnalysisPage` e `ConsumoPage` são páginas separadas. Tema está no header; Ferramentas é o nono destino. A Biblioteca v2 é normalizada por `migrateLibrary`, que mescla `defaultSettings` ao ler arquivos existentes.

**Decisão ainda pendente do mantenedor:** se recursos avançados devem ficar escondidos por padrão. Para preservar o comportamento existente até essa escolha, `settings.showAdvancedResources` inicia como `true`; Configurações permite alternar. Registrar a pendência em `docs/DECISOES.md`, sem tratar esse fallback como decisão definitiva de produto.

**Limite desta frente:** o checklist persistente e o assistente de primeira abertura pertencem à F2. Início terá Dashboard e projetos recentes; a F2 acrescentará o checklist completo ligado ao onboarding.

## Arquivos e responsabilidades

| Caminho | Responsabilidade |
|---|---|
| `src/renderer/src/App.tsx` | Cinco áreas principais, estado de subárea, Início inicial e entrada da engrenagem. |
| `src/renderer/src/navigation.ts` | Contrato puro das áreas e subáreas, com filtragem de recursos avançados. |
| `src/renderer/src/components/AreaNavigation.tsx` | Navegação principal e secundária acessíveis, com estados ativo e foco. |
| `src/renderer/src/components/SettingsMenu.tsx` | Tema, alternância de recursos avançados e acesso à página Ferramentas. |
| `src/renderer/src/pages/AssetLibraryPage.tsx` | Reutilizar o catálogo em modos de recursos, projetos locais e Top GitHub, sem duplicar lógica. |
| `src/renderer/src/pages/DashboardPage.tsx` | Nome “Início”, projetos locais recentes e ação para a área Projetos. |
| `src/shared/types.ts` e `src/shared/schemas.ts` | Novo campo Zod `showAdvancedResources`. |
| `src/main/services/library-store.ts` | Valor padrão compatível com bibliotecas v2 já existentes. |
| `tests/navigation.test.ts` | Garantir cinco áreas e acesso a cada subárea avançada no modo avançado. |
| `tests/library-store.test.ts` | Garantir que biblioteca v2 antiga recebe o padrão sem perder dados. |
| `README.md` e `docs/DECISOES.md` | Atualizar navegação disponível e registrar o fallback pendente. |

## Tarefa 1: Modelar áreas e visibilidade

- [x] Criar `navigation.ts` com cinco áreas e suas subáreas: Projetos locais/GitHub; Recursos/Coleções; Buscar/Top 7 dias/Análise; Execuções/Consumo. Ferramentas fica como destino de Configurações, não como sexta área.
- [x] Mostrar Coleções, Análise e Consumo somente quando `showAdvancedResources` estiver ligado. Nunca tornar Top 7 dias avançado-only.
- [x] Criar testes puros para a lista das cinco áreas e para a visibilidade de cada subárea nos dois modos.
- [x] Adicionar `showAdvancedResources` a `Settings`, `SettingsSchema` e `defaultSettings`. Usar `true` como fallback temporário de compatibilidade até decisão explícita do mantenedor.
- [x] Adicionar teste de leitura de `library.json` v2 sem esse campo; conferir que o valor novo é aplicado e os demais dados permanecem iguais.

## Tarefa 2: Implementar a navegação no shell

- [x] Substituir os nove botões do header por Início, Projetos, Biblioteca, Descobrir e Agentes.
- [x] Adicionar navegação secundária por área; marcar a seleção com `aria-current` ou `aria-pressed`, fornecer nome acessível a cada `nav` e preservar foco visível.
- [x] Criar engrenagem com popover “Configurações”: toggle “Mostrar recursos avançados”, controle de tema e botão Ferramentas. Fechar no Escape e após escolher Ferramentas.
- [x] Manter a conta GitHub no header e não alterar o fluxo de autenticação.
- [x] Fazer o app iniciar em Início e renomear o título interno do Dashboard para Início.
- [x] Garantir que páginas abertas que ficam indisponíveis após desligar recursos avançados retornem para a primeira subárea permitida da mesma área.

## Tarefa 3: Agrupar as páginas sem duplicar funções

- [x] Projetos: mostrar projetos locais pelo catálogo existente e repositórios da conta GitHub em subáreas. Manter `DevWorkspacePage`, Git, terminal, clone e detalhe de repositório.
- [x] Biblioteca: mostrar Skills, Agents e Bases; abrir Coleções como subárea avançada. Remover projetos locais e Top da navegação da Biblioteca, sem apagar seus dados nem sua implementação.
- [x] Descobrir: agrupar Busca GitHub, Top GitHub (abrindo em 7 dias) e Análise. A análise fica oculta no modo simples.
- [x] Reutilizar o código de Top GitHub da `AssetLibraryPage` por modo/parâmetro, preservando cache, filtros de ecossistema, ações de adicionar/importar e suporte a 7/30 dias.
- [x] Agentes: agrupar execuções e Consumo. Consumo fica oculto no modo simples.
- [x] Início: mostrar Dashboard e uma lista curta de projetos locais mais recentes, com botão para abrir Projetos. O checklist completo será entregue pela F2.
- [x] Manter busca global `Ctrl+K` funcionando e direcionando para Biblioteca.

## Tarefa 4: Atualizar documentação e validar

- [x] Atualizar README: documentar as cinco áreas em “O que já faz” e retirar navegação agrupada de “Para onde vai”.
- [x] Registrar em `docs/DECISOES.md` a estrutura das áreas e o fallback `showAdvancedResources: true` enquanto a decisão de padrão segue pendente.
- [x] Rodar `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` e `npm.cmd run build` no worktree atualizado.
- [x] Rodar o detector Impeccable uma vez sobre os componentes de navegação alterados; revisar o resultado e capturar a janela do Electron para conferir o header na largura usual.
- [x] Conferir `git diff --check`, referências e o acesso de cada tela em até dois cliques com recursos avançados ligados.
- [x] Abrir PR separado empilhado sobre F0; manter como rascunho até a matriz CI Linux, Windows e macOS terminar.

## Critérios de aceite

- Cinco áreas respondem às perguntas de produto e a área inicial é Início.
- Projetos locais, GitHub, workspace, Git, terminal, Skills, Agents, Bases, Coleções, Busca, Top 7 dias, Análise, Execuções, Consumo e Ferramentas continuam acessíveis.
- No modo avançado, nenhuma função antiga requer mais de dois cliques desde a área principal.
- Recursos avançados podem ser ocultados e recuperados pelas Configurações; o valor padrão permanece explicitamente pendente.
- Alterar `library.json` v2 antiga aplica o novo padrão sem apagar ou sobrescrever dados do usuário.
- Testes locais passam e o PR valida Linux, Windows e macOS.
