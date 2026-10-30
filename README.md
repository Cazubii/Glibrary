# Glibrary

Biblioteca de repositórios **no estilo da Steam** para o Windows (com caminho aberto para
macOS/Linux). Em vez de caçar pastas e lembrar comandos no terminal, você vê todos os seus
projetos como "jogos": capa, status, botão de instalar/iniciar e console ao vivo.

## O que ele faz

- **Biblioteca visual** — grade ou lista, com capa (do GitHub ou gerada), busca, favoritos,
  tags, ordenação e coleções (instalados, não clonados, com erro, com atualização).
- **Adicionar por URL ou pasta** — cole `github.com/owner/repo` (sem `https://`) e clone com
  barra de progresso; ou importe uma pasta que já existe na máquina.
- **Detecção automática** — reconhece Node (npm/pnpm/yarn/bun), Python (pip/poetry/uv),
  Docker, Rust, Go, .NET, Java (Maven/Gradle), Make e HTML estático, sugerindo comandos de
  instalar e iniciar. Nunca sobrescreve comandos que você editou.
- **Execução com segurança** — instalar/iniciar pede confirmação na primeira vez, mostra os
  logs com cores no console, abre a URL local detectada e encerra a árvore de processos ao
  parar. Ao fechar o app, avisa se há algo rodando.
- **Git + GitHub** — clonar, atualizar (`pull`), ver quantos commits está atrás, baixar capa,
  descrição, estrelas, linguagem e tópicos.
- **Scanner de pastas** — varre as pastas escolhidas (profundidade 4, ignorando
  `node_modules`, `.venv`, `target`, `dist` etc.), lista os repositórios e importa os
  selecionados sem duplicar.
- **Ferramentas** — verifica Git, Node, pnpm, Python, Docker, etc., mostra versão, link de
  download e quais repositórios usam cada uma. Se faltar algo exigido por um projeto, avisa
  "Falta: X" e bloqueia instalar/iniciar.
- **Ações rápidas** — abrir pasta, editor, terminal e GitHub; criar `.env` a partir do
  `.env.example`; desinstalar dependências; remover da biblioteca (com confirmação digitada).
- **Exportar/importar** a biblioteca em JSON.
- **Atalhos** — `Ctrl+K` foca a busca, `Enter` abre o card focado, `Esc` volta.

## Rodando em desenvolvimento

Pré-requisitos: **Node 20+** e **pnpm**.

```bash
pnpm install
pnpm dev
```

O pnpm 10 bloqueia scripts de build por padrão; o `electron` precisa baixar o binário. Se o
app não abrir, rode:

```bash
node node_modules/electron/install.js
```

Scripts úteis:

```bash
pnpm typecheck   # TypeScript (strict)
pnpm lint        # ESLint
pnpm test        # Vitest
pnpm build       # compila main/preload/renderer para out/
pnpm dist        # gera o instalador (electron-builder)
```

## Gerando o instalador (Windows)

```bash
pnpm dist
```

O instalador NSIS sai em `dist/`. Ele instala o Glibrary como um app normal, sem precisar do
projeto de desenvolvimento.

## Onde ficam os dados

- `library.json` (com backup automático `library.backup.json`) no diretório de dados do app
  (`%APPDATA%/Glibrary` no Windows).
- Capas baixadas e logs em arquivo também ficam nesse diretório.
- O token do GitHub (opcional, para aumentar o limite da API) é guardado com
  `safeStorage` do Electron.

## Estrutura

```
src/
  shared/     tipos, schemas zod, canais IPC, utilitários puros (git/normalização/status)
  main/       processos Electron: serviços (storage, git, github, scanner, ferramentas,
              detector de projetos, gerenciador de processos) e handlers IPC
  preload/    ponte segura (contextBridge)
  renderer/   React + Tailwind (páginas, componentes, store zustand)
tests/        testes de detectores, storage, status, git e scanner
```

## Segurança

`contextIsolation` ligado, `nodeIntegration` desligado, `sandbox` no renderer e CSP
restritiva. Nenhum comando roda sem clique do usuário; os comandos de instalar/iniciar são
exatamente os que você vê e aprova. Apagar pasta só acontece após digitar o nome do
repositório.

## Licença

MIT.
