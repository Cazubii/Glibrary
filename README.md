# Glibrary

Um lugar só para trabalhar com **agentes de IA**: reúne os **agentes**, as **Skills** e os **repositórios** que você usa, e os **projetos** que dependem deles, num app desktop simples.

O objetivo é juntar a versatilidade de um ambiente de desenvolvimento com a gestão de agentes: abrir o terminal, editar o projeto, trabalhar com subagentes e com os repositórios direto no GitHub, de um jeito fácil o suficiente para quem está começando a desenvolver com IA.

Glibrary é um projeto próprio de [BezierClick](https://bezierclick.com), aberto para a comunidade contribuir. Está no começo do desenvolvimento e nasceu para uso próprio do autor.

## O que já faz

- Encontra suas Skills (`SKILL.md`) e agentes nas pastas configuradas, sem alterar os arquivos.
- Registra repositórios-base por URL Git ou pasta local e clona para `~/BASES`.
- Liga cada projeto às Skills, agentes e Bases que ele usa, com notas por projeto.
- Abre a pasta, o editor, o terminal ou a página no GitHub de cada repositório.
- Tags, favoritos, filtros, busca no GitHub e destaques dos últimos 7 dias.

## Para onde vai

- Editar o projeto direto na branch principal a partir do app.
- Trabalhar com subagentes dentro do próprio Glibrary.
- Integração mais funda com o GitHub para gerenciar os repositórios sem sair do app.

Sugestões e contribuições são bem-vindas: veja [Contribuir](#contribuir).

## Detalhes técnicos

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
