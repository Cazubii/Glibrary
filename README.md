# Glibrary

Biblioteca desktop para organizar **Skills de agentes**, **repositórios-base** e os **projetos que usam esses recursos**.

## Recursos

- Descobre Skills em arquivos `SKILL.md` nas origens configuradas. Por padrão, procura em `~/.claude/skills`, `~/.opencode/skills` e `~/.agents/skills`.
- Registra Bases por URL Git ou pasta local e clona repositórios para `~/BASES`.
- Mantém projetos como contexto, com associações às Skills e Bases utilizadas e notas por projeto.
- Migra automaticamente `library.json` v1 para v2 no primeiro carregamento: repositórios com pasta local passam a projetos de contexto e itens apenas com URL remota passam a Bases.
- Persiste dados em JSON com escrita atômica e backup automático.

## Desenvolvimento

Requisitos: Node.js 20.19+ ou 22.12+ e pnpm 10.

```bash
pnpm install
pnpm dev
```

Comandos de verificação e distribuição:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dist
```

## Dados e segurança

`library.json` e `library.backup.json` ficam no diretório de dados do Electron. Caminhos de Skills são lidos para localizar e mostrar `SKILL.md`; o aplicativo não altera os arquivos de Skill. Clones de Bases são gravados na pasta `~/BASES`. O renderer usa `contextIsolation`, `nodeIntegration: false` e sandbox habilitado.

## Estrutura

```text
src/shared/      tipos, schemas, IPC e utilitários
src/main/        Electron, persistência, Git e IPC de Skills/Bases/Projetos
src/preload/     ponte segura para IPC
src/renderer/    interface React
tests/           testes da implementação v1 e serviços compartilhados
```

`GLIBRARY_SPEC.md` documenta a implementação original v1. A direção v2 e suas decisões atuais estão registradas em `AGENTS.md` e `docs/DECISOES.md`.

## Contribuir

Contribuições são bem-vindas. Leia [`CONTRIBUTING.md`](CONTRIBUTING.md), confira as [issues abertas](https://github.com/Cazubii/Glibrary/issues) e abra uma issue antes de mudanças grandes. Instaladores e notas de versão, quando publicados, ficam nas [releases](https://github.com/Cazubii/Glibrary/releases). Relatos de segurança devem seguir [`SECURITY.md`](SECURITY.md), não ser publicados em issues.

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).
