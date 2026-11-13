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
| **Início** | Painel com próximos passos e projetos locais recentes. |
| **Projetos** | Pastas deste computador, repositórios do GitHub, área de desenvolvimento, Git e terminal. |
| **Biblioteca** | Skills, agentes, modelos de projeto (Bases) e Coleções. |
| **Descobrir** | Busca de repositórios, Top GitHub dos últimos 7 dias e análise de projetos. |
| **Agentes** | Execuções e consumo; detalhes avançados podem ser ocultados em Configurações. |
| **Ferramentas** | Instalação e verificação de ferramentas no menu Configurações. |

O app abre em **Início**, mantém o tema escuro e claro e organiza as tarefas em cinco áreas principais. Coleções, Análise de repositório e Consumo detalhado ficam disponíveis em Configurações por **Mostrar recursos avançados**.

Os termos de Git, agentes e consumo agora aparecem com nomes simples e explicações acessíveis por teclado. Falhas frequentes agora explicam o que ocorreu e como seguir, com detalhes técnicos recolhidos. A primeira abertura agora orienta a configuração e a escolha do primeiro projeto. O login pelo navegador usa o Device Flow do GitHub App quando o client ID público estiver configurado; o token pessoal continua nas opções avançadas.

Antes de salvar uma versão, a pessoa pode revisar os arquivos e o diff. No modo simples, o Glibrary cria uma linha de trabalho para agentes, pede confirmação antes de enviar direto para `main`/`master` e oferece desfazer versões locais ou reverter versões já enviadas. Depois de cada execução, é possível revisar, manter ou descartar as mudanças do agente; arquivos editados depois são preservados. Limites opcionais por execução e por dia interrompem agentes monitorados ao atingir o valor e avisam aos 80%.

## Para onde vai

- Receitas completas para criar, entender e publicar projetos.
- Instaladores para Windows, macOS e Linux, com atualização automática.

O login pelo navegador depende do client ID público do GitHub App do mantenedor e de habilitar Device Flow; até lá, o PAT avançado continua disponível. A preferência inicial pelo modo simples, a CLI recomendada e a assinatura dos instaladores também aguardam decisão.
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

Para habilitar o login do GitHub sem token, copie `.env.example` para `.env.local` e preencha `GLIBRARY_GITHUB_OAUTH_CLIENT_ID` com o client ID público informado pelo mantenedor. Não configure client secret em um app desktop.

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
