# Glibrary

[![CI](https://github.com/Cazubii/Glibrary/actions/workflows/ci.yml/badge.svg)](https://github.com/Cazubii/Glibrary/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
![Plataformas](https://img.shields.io/badge/plataformas-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Electron](https://img.shields.io/badge/Electron-React%20%2B%20TypeScript-47848F?logo=electron&logoColor=white)

**A biblioteca dos seus agentes de IA.** Um app desktop, no estilo da biblioteca da Steam, que reúne num lugar só os **agentes**, as **Skills** e os **repositórios** que você usa, e os **projetos** que dependem deles.

O objetivo é juntar a versatilidade de um ambiente de desenvolvimento com a gestão de agentes: abrir o terminal, editar o projeto, trabalhar com subagentes e com os repositórios direto no GitHub, de um jeito fácil o suficiente para quem está começando a desenvolver com IA.

Glibrary é um projeto próprio de [BezierClick](https://bezierclick.com), aberto para a comunidade contribuir. Está no começo do desenvolvimento e nasceu para uso próprio do autor.

## Por que existe

Quem trabalha com agentes acaba com Skills espalhadas em várias pastas, dezenas de repositórios clonados e nenhuma visão de qual projeto usa o quê. O Glibrary cataloga tudo isso, mostra o que está sendo usado e deixa cada recurso a um clique de distância.

## O que já faz

| Área | O que você encontra |
|---|---|
| **Biblioteca** | Skills (`SKILL.md`), agentes, Bases e projetos num só catálogo, com busca (`Ctrl+K`), tags, favoritos e filtros. Os arquivos de Skill nunca são alterados. |
| **Bases** | Repositórios e templates usados como ponto de partida, registrados por URL Git ou pasta local e clonados para `~/BASES`. |
| **Projetos** | Cada projeto ligado às Skills, agentes e Bases que usa, com notas próprias. Abre a pasta, o editor, o terminal ou a página no GitHub. |
| **Coleções** | Conjuntos reutilizáveis de recursos (ex.: "Stack React + Tailwind") para aplicar a um projeto de uma vez. |
| **Dashboard** | Uso por categoria, recursos mais usados nos projetos, tags mais usadas, aberturas por mês e projetos antigos. |
| **Busca GitHub** | Busca de repositórios em linguagem natural e destaques dos últimos 7 dias. |
| **Agentes** | Perfis salvos para rodar sub-agentes de linha de comando (Claude Code, Codex CLI, Gemini CLI, Aider) com histórico, duração e logs de cada execução. |
| **Ferramentas** | Instalação de ferramentas de desenvolvimento no ambiente local. |

Tema escuro e claro, interface em português.

## Para onde vai

- Área de desenvolvimento com terminais por projeto dentro do app.
- Editar o projeto direto na branch principal a partir do app.
- Integração mais funda com o GitHub para gerenciar os repositórios sem sair do app.
- Instaladores prontos para Windows, macOS e Linux nas releases.

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

[`docs/arquivo/GLIBRARY_SPEC.md`](docs/arquivo/GLIBRARY_SPEC.md) documenta a implementação original v1. A direção v2 e suas decisões atuais estão registradas em `AGENTS.md` e `docs/DECISOES.md`.

## Contribuir

Contribuições são bem-vindas. Leia [`CONTRIBUTING.md`](CONTRIBUTING.md), confira as [issues abertas](https://github.com/Cazubii/Glibrary/issues) e abra uma issue antes de mudanças grandes. Instaladores e notas de versão, quando publicados, ficam nas [releases](https://github.com/Cazubii/Glibrary/releases). Relatos de segurança devem seguir [`SECURITY.md`](SECURITY.md), não ser publicados em issues.

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).
