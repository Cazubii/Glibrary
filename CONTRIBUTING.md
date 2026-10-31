# Contribuindo

Obrigado por ajudar a melhorar a Glibrary. Issues e pull requests podem ser escritos em
português ou inglês.

## Antes de começar

- Para mudanças pequenas, abra uma issue descrevendo o problema e a solução proposta.
- Para mudanças maiores ou que alterem o formato dos dados, converse sobre o escopo antes de
  implementar. Isso evita trabalho duplicado e permite revisar a direção com a comunidade.
- Consulte `README.md`, `AGENTS.md` e as decisões relacionadas em `docs/DECISOES.md`.

## Preparar o ambiente

Requisitos: Node.js 20.19+ ou 22.12+ e pnpm 10.

```bash
pnpm install
pnpm dev
```

Antes de abrir um pull request, execute:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Inclua ou atualize testes quando mudar comportamento, persistência, migração ou IPC. Se algum
comando não puder ser executado, informe isso no pull request e explique o motivo.

## Pull requests

- Mantenha cada PR focado e descreva problema, abordagem e impactos para usuários.
- Relacione a issue quando houver uma.
- Atualize documentação e decisões técnicas afetadas.
- Não inclua dados pessoais, tokens, arquivos locais da biblioteca ou mudanças geradas em `out/`
  e `dist/`.
- Use títulos claros, por exemplo `feat: importar skills` ou `fix: validar destino de clone`.
- Aguarde CI e revisão; não faça merge do próprio PR sem seguir as regras do repositório.

## Relatos de problemas

Informe sistema operacional, versão do Node/pnpm, passos para reproduzir e resultado esperado.
Remova caminhos pessoais, tokens, URLs privadas e conteúdo sensível de logs e capturas antes de
publicar. Para vulnerabilidades, siga `SECURITY.md`.
