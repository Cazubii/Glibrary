# Guia do repositório

Orientações de desenvolvimento para contribuidores e ferramentas de código. Não inclua aqui
caminhos pessoais, nomes de projetos privados, credenciais ou dados de usuários.

## Produto e arquitetura

Glibrary é um aplicativo desktop Electron para catalogar Skills de agentes (`SKILL.md`),
repositórios-base e projetos que usam esses recursos. A biblioteca atual usa `library.json` v2;
a especificação detalhada da versão original está arquivada em `docs/arquivo/GLIBRARY_SPEC.md`.

- `src/shared/`: tipos, schemas Zod, canais IPC e utilitários sem dependência de Electron.
- `src/main/`: inicialização Electron, armazenamento, operações Git e handlers IPC.
- `src/preload/`: ponte mínima e tipada entre renderer e main.
- `src/renderer/`: interface React e estado local.
- `tests/`: testes unitários e fixtures sem dados pessoais.
- `docs/DECISOES.md`: decisões técnicas relevantes e seus motivos.

## Desenvolvimento local

Requisitos: Node.js 20.19+ ou 22.12+ e pnpm 10.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

No Windows, `pnpm dist` gera o instalador NSIS. Mudanças que afetem dados, IPC, migrações ou
comportamento devem incluir testes apropriados e documentação quando necessário.

## Convenções

- Interface e mensagens em pt-BR; nomes de código em inglês.
- TypeScript estrito; valide toda entrada externa com schemas Zod e evite `any`.
- Toda resposta IPC usa `{ ok: true, data } | { ok: false, error }`.
- Nunca exponha APIs Node diretamente ao renderer; preserve `contextIsolation`, sandbox e CSP.
- Não execute comandos do usuário sem ação explícita e revisão do comando.
- Dados de usuário e builds locais não devem ser versionados.
- Registre decisões arquiteturais duráveis em `docs/DECISOES.md`.

## Estado da biblioteca

O modelo v2 separa `skills`, `agents`, `bases` e `projects` no arquivo persistente. Skills são
descobertas por `SKILL.md` em `settings.skillFolders`; Agents são arquivos `.md` de agente em
`settings.agentFolders`; Skills e Agents carregam uma `category` fixa (default `outros`).
Na migração v1, itens com pasta local se tornam projetos de contexto; entradas com URL remota
sem pasta local se tornam Bases. O bootstrap atual não registra os handlers antigos de
execução de projetos.
