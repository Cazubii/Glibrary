# Plano: Glibrary para quem está começando com IA e GitHub

> **Para o agente executor (Codex):** este documento traz o diagnóstico e as diretrizes. Ele não é
> uma especificação fechada. Antes de cada frente, **pesquise o código atual** (os caminhos citados
> aqui podem ter mudado) e escreva o plano detalhado em `docs/superpowers/plans/`, como já é feito
> no repositório. Siga o `AGENTS.md` em tudo: pt-BR na interface, TypeScript estrito, Zod nas
> entradas, IPC `{ ok, data | error }`, sandbox preservado. Registre cada decisão durável em
> `docs/DECISOES.md`.

---

## 1. Objetivo

Tornar o Glibrary o **primeiro ambiente** de quem quer desenvolver com IA mas ainda não tem
intimidade com terminal, Git, GitHub ou agentes. A pessoa deve conseguir, sem ajuda externa:

1. Instalar o app e as ferramentas necessárias.
2. Entrar com a conta do GitHub.
3. Criar ou abrir o primeiro projeto.
4. Pedir uma mudança a um agente de IA e ver o que ele fez.
5. Salvar e enviar o trabalho ao GitHub sem medo de estragar nada.

**Métrica principal:** uma pessoa iniciante completa os 5 passos acima em **menos de 20 minutos**,
sem abrir documentação externa.

---

## 2. Diagnóstico (estado em novembro de 2026)

### O que já é forte
- A base técnica é boa: Electron com sandbox, IPC tipado e validado, escrita atômica, CI nos 3
  sistemas, 268 testes.
- O app já cobre a jornada inteira: catálogo (Skills, agentes, Bases), projetos com Git e terminal,
  agentes com logs e consumo de tokens, busca e análise de repositórios.
- A metáfora da Steam (biblioteca, capa, botão de ação) é ótima para iniciantes e deve ser mantida.

### O que trava um iniciante

| # | Problema | Onde está |
|---|---|---|
| D1 | **9 abas no topo** (Dashboard, Projetos, Biblioteca, Coleções, Busca, Análise, Consumo, Agentes, Ferramentas). O iniciante não sabe por onde começar. O app abre no Dashboard, que fica vazio no primeiro uso. | `src/renderer/src/App.tsx` |
| D2 | **Não há primeira experiência guiada.** `Onboarding.tsx` existe, mas não é usado em lugar nenhum. | `src/renderer/src/components/Onboarding.tsx` |
| D3 | **Login no GitHub exige um Personal Access Token com escopo `repo`.** É difícil de gerar, assusta e dá acesso amplo demais. | `src/renderer/src/components/GithubAccountMenu.tsx` |
| D4 | **Vocabulário técnico sem explicação:** branch, commit, push, pull, clone, remote, `git init`, token, CLI, Skill, Base, workspace, cache, tokens de entrada e saída. | `RepoGitPanel.tsx`, `DevWorkspacePage.tsx`, `ConsumoPage.tsx`, outras telas |
| D5 | **Erros mostram a saída crua do Git ou da CLI** e não dizem o que fazer em seguida. | serviços em `src/main/services/` e toasts no renderer |
| D6 | **Falta rede de proteção:** dá para enviar direto na branch principal, não há "desfazer" e não aparece o que mudou antes de salvar. | painel Git e área de desenvolvimento |
| D7 | **Não há instalador publicado.** Para usar, hoje é preciso clonar o repositório e rodar `pnpm`, o que exclui justamente o público-alvo. | releases vazias; `electron-builder.yml` |
| D8 | **Código morto:** `LibraryPage.tsx`, `NativeToolsPage.tsx` e `Onboarding.tsx` não são importados. | `src/renderer/src/` |

---

## 3. Princípios de produto

1. **Uma pergunta por tela.** Cada tela responde a uma dúvida do usuário ("o que eu faço agora?",
   "o que o agente fez?"), e não a uma categoria técnica.
2. **Nomes do dia a dia primeiro, termo técnico depois.** Exemplo: "Enviar para o GitHub (push)".
   O termo técnico fica entre parênteses para a pessoa aprender aos poucos.
3. **Nada irreversível sem aviso.** Toda ação que apaga, sobrescreve ou publica mostra antes o que
   vai acontecer e, quando der, oferece desfazer.
4. **Todo erro diz o próximo passo.** Mensagem curta em português e um botão de ação. A saída
   técnica fica em "Ver detalhes".
5. **Modo simples por padrão, modo avançado opcional.** Quem já sabe não pode perder nada do que
   existe hoje.
6. **Ensinar fazendo.** Explicações curtas aparecem no momento em que o conceito surge, e não num
   manual separado.

---

## 4. Frentes de trabalho (em ordem de prioridade)

Cada frente vira **um ou mais PRs pequenos**, com CI verde nos 3 sistemas. Não junte frentes num PR só.

### F0. Limpeza (pré-requisito, PR pequeno)
- Remover `LibraryPage.tsx` e `NativeToolsPage.tsx` depois de confirmar que não são usados. O
  `Onboarding.tsx` deve ser reaproveitado na F2 ou removido.
- Mover `GLIBRARY_SPEC.md` para `docs/arquivo/` e atualizar as referências no README e no `AGENTS.md`.
- **Aceite:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passam e nenhuma tela some.

### F1. Navegação por intenção (D1)
Reorganizar as 9 abas em **5 áreas**:

| Nova área | Junta | Pergunta que responde |
|---|---|---|
| **Início** | Dashboard + checklist de primeiros passos + projetos recentes | "O que eu faço agora?" |
| **Projetos** | Projetos + área de desenvolvimento + painel Git + terminal | "Onde está meu trabalho?" |
| **Biblioteca** | Skills, agentes, Bases e Coleções | "Que recursos eu tenho?" |
| **Descobrir** | Busca GitHub + Análise de repositório + Top 7 dias | "O que existe por aí?" |
| **Agentes** | Execuções + Consumo | "O que a IA está fazendo e quanto custa?" |

- Ferramentas e Configurações vão para um ícone de engrenagem.
- O app abre em **Início**.
- No modo simples, esconder Coleções, Análise e Consumo detalhado. Um botão "Mostrar recursos
  avançados" nas Configurações traz tudo de volta.
- **Aceite:** toda função que existe hoje continua acessível em no máximo 2 cliques no modo avançado.

### F2. Primeira experiência guiada (D2)
Assistente de primeira abertura, com estado salvo em `library.json` (com migração e testes):

1. **Boas-vindas:** o que é o Glibrary, em 2 frases.
2. **Verificar ferramentas:** Git, Node e pelo menos uma CLI de agente. Mostrar ✅/❌ e um botão
   "Instalar" que usa a tela Ferramentas que já existe.
3. **Entrar com o GitHub:** usa a F3. Pode ser pulado.
4. **Pasta dos projetos:** sugerir uma pasta padrão e oferecer a busca de repositórios já existentes.
5. **Primeiro projeto:** "Começar de um modelo" (Base) ou "Abrir um projeto que já tenho".

Depois do assistente, a tela **Início** mostra um **checklist de primeiros passos** (5 itens, como
no objetivo da seção 1), que some quando estiver completo.

**Aceite:** com o `library.json` apagado, o app abre no assistente. É possível pular qualquer
passo, e o assistente nunca volta a aparecer depois de concluído ou dispensado.

### F3. Entrar com o GitHub sem token manual (D3)
- **Pesquisar e propor:** login com o GitHub via **OAuth Device Flow**. O app mostra um código, a
  pessoa confirma no navegador e o app recebe o token. Comparar com GitHub App e documentar em
  `docs/DECISOES.md`: escopos mínimos, renovação e revogação.
- Guardar o token como hoje, com `safeStorage`.
- O Personal Access Token continua disponível em "Opções avançadas".
- Botão "Sair" que apaga o token local e explica como revogar o acesso no GitHub.
- **Depende do dono do projeto:** o Device Flow exige registrar um OAuth App ou um GitHub App no
  GitHub e colocar o client id no app. **Não registre nada por conta própria.** Deixe tudo pronto
  e peça o client id.
- **Aceite:** é possível entrar sem copiar nenhum token, e o PAT continua funcionando.

### F4. Linguagem simples e ajuda no contexto (D4)
- Criar `src/shared/glossary.ts` com os termos (Skill, Agente, Base, Coleção, projeto, repositório,
  branch, commit, push, pull, clone, remote, token, CLI, tokens de entrada e saída, cache). Cada
  termo tem um nome simples, o termo técnico e uma explicação de no máximo 2 frases.
- Criar um componente `<Termo id="commit"/>` que mostra o nome simples com um ícone ⓘ e a
  explicação em tooltip acessível por teclado.
- Rótulos sugeridos (validar com testes de uso):

| Hoje | Modo simples |
|---|---|
| Commit | Salvar uma versão (commit) |
| Push | Enviar para o GitHub (push) |
| Pull / "N commits atrás" | Baixar novidades (pull), com "Há N novidades no GitHub" |
| Clone | Baixar para o computador (clone) |
| Branch | Linha de trabalho (branch) |
| `git init` | Começar a controlar versões deste projeto |
| sem remote | Ainda não está no GitHub, com o botão "Publicar no GitHub" |
| Base | Modelo de projeto (Base) |

- Usar a skill local Impeccable (`.agents/skills/impeccable/`) para revisar textos, estados vazios
  e acessibilidade.
- **Aceite:** no modo simples, nenhum termo da lista aparece sem o nome simples ou o ⓘ.

### F5. Erros que ensinam (D5)
- Criar no main um tradutor de erros (`src/main/services/error-translator.ts`) para os casos
  comuns de Git, GitHub e das CLIs: autenticação, conflito, sem permissão, pasta já existe,
  comando não encontrado no PATH, rede, limite da API e token expirado.
- Cada erro traduzido tem: **título**, **o que aconteceu**, **o que fazer** (com botão de ação
  quando houver) e **detalhes técnicos** (recolhidos).
- Testes unitários com amostras reais de mensagens de erro, sem dados pessoais.
- **Aceite:** os 8 casos acima mostram mensagem em português com o próximo passo.

### F6. Rede de proteção (D6)
- **Antes de salvar uma versão:** mostrar a lista de arquivos alterados e o diff, com opção de
  pedir ao agente que escreva a mensagem.
- **Branch principal protegida no modo simples:** ao começar uma alteração, criar automaticamente
  uma linha de trabalho (`glibrary/<data>-<assunto>`). Enviar direto para `main`/`master` pede uma
  confirmação explícita.
- **Desfazer:** "Desfazer a última versão salva" quando ela ainda não foi enviada. Depois de
  enviada, oferecer "Reverter", que cria uma nova versão.
- **Depois do agente:** um resumo "O agente alterou N arquivos", com os botões ver mudanças,
  manter ou descartar.
- **Limite de gasto:** nas Configurações, um teto de custo por execução de agente e por dia, com
  aviso ao chegar a 80% (usa os dados que a tela Consumo já tem).
- **Aceite:** com o modo simples ativo, não existe nenhum caminho que publique na branch principal
  ou apague trabalho sem uma confirmação clara.

### F7. Receitas guiadas
Fluxos de ponta a ponta, sempre com botão de cancelar e passo atual visível:
- "Criar meu primeiro site com IA": escolher uma Base, baixar, aplicar uma Coleção, abrir o agente
  com um pedido inicial sugerido e visualizar o resultado.
- "Entender um repositório do GitHub": colar a URL, ver a análise e perguntar ao agente.
- "Publicar meu projeto no GitHub": criar o repositório remoto e enviar a primeira versão.
- **Aceite:** cada receita funciona do começo ao fim numa máquina limpa, nos 3 sistemas.

### F8. Instalador e atualização automática (D7)
- Workflow `release.yml` que gera os instaladores (Windows NSIS, macOS dmg, Linux AppImage) quando
  uma tag `v*` é criada e publica nas Releases.
- Atualização automática com `electron-updater` (confirmar compatibilidade) e um aviso "Nova
  versão disponível".
- Documentar assinatura de código como **decisão pendente do dono**: tem custo, e sem ela o
  Windows e o macOS mostram alertas. Explicar esses alertas no README.
- README com um botão "Baixar" no topo.
- **Aceite:** criar uma tag gera os 3 instaladores nas Releases sem passo manual.

### F9. Validação com pessoas reais
- Escrever `docs/teste-de-uso.md`: roteiro para 3 a 5 pessoas iniciantes, com as 5 tarefas da
  seção 1, o que observar (onde travam, termos que não entendem) e o tempo de cada tarefa.
- Depois de cada rodada, registrar o que mudou em `docs/DECISOES.md`.

---

## 5. Ordem sugerida e tamanho

| Ordem | Frente | Esforço | Depende de |
|---|---|---|---|
| 1 | F0 Limpeza | P | — |
| 2 | F1 Navegação | M | F0 |
| 3 | F4 Linguagem simples | M | F1 |
| 4 | F5 Erros que ensinam | M | — |
| 5 | F2 Primeira experiência | M | F1, F4 |
| 6 | F6 Rede de proteção | G | F4, F5 |
| 7 | F8 Instalador | M | — (pode correr em paralelo) |
| 8 | F3 Login com GitHub | M | client id do dono |
| 9 | F7 Receitas | G | F2, F6 |
| 10 | F9 Teste de uso | P | ao fim de cada fase visível |

P = até 1 dia, M = 2 a 4 dias, G = 1 semana ou mais.

---

## 6. Regras para o executor

1. **Pesquise antes de mudar:** leia os arquivos envolvidos e os testes, e confira se o que este
   documento descreve ainda é verdade. Se não for, registre a diferença no plano da frente.
2. **Não remova funções existentes.** O que sai do modo simples continua no modo avançado.
3. **Mudanças no `library.json`** exigem migração com teste e backup preservado.
4. **Sem `any`, sem `shell: true` com entrada do usuário, sem enfraquecer CSP ou sandbox.**
5. **Um PR por frente (ou por parte dela)**, com CI verde nos 3 sistemas antes de pedir revisão.
6. **Decisões que dependem do dono ficam marcadas e não são inventadas:** client id do GitHub,
   assinatura de código, CLI de agente padrão e se o modo simples vem ligado por padrão.
7. **Textos de interface** passam pela tabela da F4. Se surgir termo novo, adicione ao glossário.
8. Ao terminar cada frente, atualize o README (seções "O que já faz" e "Para onde vai").

---

## 7. Decisões pendentes do dono

- [ ] Registrar o OAuth App ou GitHub App para o login (F3) e informar o client id.
- [ ] Definir se o **modo simples** vem ligado por padrão (recomendado: sim).
- [ ] Escolher a **CLI de agente recomendada** para iniciantes no assistente (F2).
- [ ] Decidir sobre a **assinatura de código** dos instaladores (F8).
- [ ] Recrutar 3 a 5 pessoas para o teste de uso (F9).
