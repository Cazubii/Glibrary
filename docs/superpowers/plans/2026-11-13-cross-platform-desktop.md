# Compatibilidade desktop Windows, Linux e macOS — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar e executar a Glibrary desktop em Windows x64, Linux x64 e macOS x64/arm64, mantendo os fluxos locais e os diretórios de dados atuais.

**Architecture:** Manter Electron e centralizar shell/terminal em um serviço do processo principal. Separar a descrição do comando Agent (executável e argumentos) do mecanismo específico de execução, acrescentar revisão visível da invocação e empacotar cada plataforma/arquitetura em runner nativo.

**Tech Stack:** Electron 45, electron-builder 26, Node.js child_process, node-pty, TypeScript, React, pnpm e GitHub Actions.

---

## Arquivos e responsabilidades

| Arquivo | Responsabilidade nesta entrega |
|---|---|
| `src/main/services/platform-support.ts` | Resolver shell interativo, montar invocações shell e lançar terminal externo com erros visíveis. |
| `src/main/services/terminal-manager.ts` | Usar o shell resolvido ao criar PTY e devolver erro acionável quando o shell não iniciar. |
| `src/main/services/tool-run.ts` | Reutilizar o contrato multiplataforma para comandos livres, preservando `buildShellRun` como export compatível. |
| `src/main/ipc/repos.ipc.ts` | Aguardar abertura do terminal externo e traduzir falhas para `IpcResult`. |
| `src/shared/agent-command.ts` | Tokenizar comando/argumentos com gramática portátil e gerar invocação/display comuns ao main e renderer. |
| `src/main/services/agent-run-manager.ts` | Iniciar Agents com argumentos separados, adaptar shims Windows e manter o registro legível da invocação. |
| `src/renderer/src/components/AgentProfileDialog.tsx` | Validar e formatar os campos de comando e argumentos sem perder perfis salvos. |
| `src/renderer/src/components/AgentRunDialog.tsx` | Mostrar a invocação completa, incluindo prompt e argumentos do provider, antes de `Lançar`. |
| `.github/workflows/ci.yml` | Gerar NSIS, DMG x64/arm64 e AppImage em runners nativos; publicar cada arquivo como artefato distinto. |
| `README.md` | Documentar plataformas, formatos, arquiteturas, mínimos do Electron e condição de assinatura macOS. |
| `AGENTS.md` | Atualizar instruções de desenvolvimento/distribuição para os três sistemas. |
| `docs/DECISOES.md` | Registrar decisões duráveis sobre shell, Agents e empacotamento. |

`electron-builder.yml` já declara NSIS, DMG e AppImage; não alterar esse arquivo a menos que o build revele uma opção ausente. Não modificar arquivos `tests/` nem adicionar novas suites neste plano. A CI atual continua executando seu job `validate` sem mudanças na suite existente.

## Tarefa 1: Centralizar resolução de shell

**Arquivos:**

- Criar: `src/main/services/platform-support.ts`
- Modificar: `src/main/services/terminal-manager.ts`
- Modificar: `src/main/services/tool-run.ts`

- [ ] **Passo 1: Definir o contrato do serviço de plataforma**

Exportar funções puras que recebem plataforma, ambiente e verificador de existência explicitamente; os chamadores passam `process.platform`, `process.env` e `existsSync`. Isso permite validar a resolução sem depender do SO atual:

```ts
export type DesktopPlatform = 'win32' | 'darwin' | 'linux';

export interface ProcessInvocation {
  file: string;
  args: string[];
}

export function resolveInteractiveShell(
  platform: DesktopPlatform,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean
): string;

export function buildShellInvocation(
  command: string,
  platform: DesktopPlatform
): ProcessInvocation;
```

- [ ] **Passo 2: Resolver fallbacks por sistema**

`resolveInteractiveShell` deve aplicar esta ordem:

1. Windows: `env.SHELL` se for um caminho existente; depois `powershell.exe`; depois `env.ComSpec`; por fim `cmd.exe`.
2. macOS: `env.SHELL` se existir; depois `/bin/zsh`, `/bin/bash`, `/bin/sh`.
3. Linux: `env.SHELL` se existir; depois `/bin/bash`, `/bin/sh`.

Para nomes sem separador de diretório (`powershell.exe`, `cmd.exe`), não os rejeitar com `existsSync`; o spawn resolve nomes presentes no `PATH`. Se nenhum caminho absoluto de fallback existir, lançar `Error` em pt-BR indicando que não foi encontrado um shell compatível.

- [ ] **Passo 3: Usar o resolver no terminal embutido**

Em `terminal-manager.ts`, remover a implementação local de `resolveShell`, importá-la de `platform-support.ts` e chamá-la antes de `spawnPty`. Manter um export de compatibilidade que delegue à nova função se outros módulos ainda importarem `resolveShell`.

Em `tool-run.ts`, manter a assinatura atual de `buildShellRun(command)` e delegar a `buildShellInvocation(command, process.platform)`. Windows deve continuar gerando `cmd.exe` com `/d /s /c`; macOS/Linux devem usar `/bin/sh -c`. Não mudar a semântica de comandos livres configurados pela pessoa usuária.

- [ ] **Passo 4: Confirmar contratos e compilar**

Rodar `pnpm typecheck` e `pnpm build`. Esperado: ambos terminam com código 0; não deve ser necessário alterar as chamadas IPC ou tipos de sessão.

## Tarefa 2: Abrir terminais externos sem falha silenciosa

**Arquivos:**

- Modificar: `src/main/services/platform-support.ts`
- Modificar: `src/main/ipc/repos.ipc.ts`

- [ ] **Passo 1: Definir os launchers por sistema**

Adicionar `openExternalTerminal(cwd): Promise<void>` no serviço de plataforma. Seleção:

- Windows: `cmd.exe`, com `cwd` no diretório do repositório.
- macOS: `open -a Terminal <cwd>`.
- Linux: tentar nesta ordem `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `xterm`; cada processo recebe `cwd` como diretório de trabalho.

- [ ] **Passo 2: Tentar os candidatos Linux e propagar erro real**

Para cada candidato Linux, iniciar com `spawn(file, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false })`. A promise resolve no evento `spawn`, chama `unref()` e não espera o terminal fechar. Em `error` com `ENOENT`, tentar o próximo nome; em outro erro, rejeitar. Se todos faltarem, rejeitar com mensagem pt-BR que informa que nenhum terminal externo foi encontrado e recomenda usar o terminal embutido.

- [ ] **Passo 3: Aguardar a operação no IPC**

Em `repoOpenTerminal` dentro de `repos.ipc.ts`, substituir a função local `openTerminal` por `await openExternalTerminal(repo.localPath)`. Manter o `try/catch` atual para converter a rejeição em `fail(e)`. O renderer já recebe a resposta IPC como erro e deve exibi-la no fluxo atual.

- [ ] **Passo 4: Compilar o caminho de IPC**

Rodar `pnpm typecheck` e `pnpm build`. Esperado: handlers existentes continuam com a mesma assinatura e a abertura bem-sucedida ainda retorna `ok(null)`.

## Tarefa 3: Fazer parsing portátil dos argumentos de Agent

**Arquivos:**

- Criar: `src/shared/agent-command.ts`
- Modificar: `src/renderer/src/components/AgentProfileDialog.tsx`

- [ ] **Passo 1: Implementar parser e formatter com gramática fixa**

`parseCommandLine(text)` deve tratar whitespace fora de aspas como separador, aceitar aspas simples e duplas, preservar whitespace dentro das aspas e permitir `\` como escape de aspas e de barra invertida. Aspas sem par ou escape final retornam erro legível em vez de gravar uma lista parcial.

`formatCommandLine(parts)` deve produzir uma linha que o parser consiga ler de volta: tokens sem espaços/aspas permanecem sem aspas; os demais usam aspas duplas com `\` e `"` escapados.

```ts
export interface ParsedCommandLine {
  parts: string[];
  error: string | null;
}

export function parseCommandLine(text: string): ParsedCommandLine;
export function formatCommandLine(parts: string[]): string;
```

- [ ] **Passo 2: Preservar perfis salvos no diálogo**

Em `AgentProfileDialog.tsx`, inicializar `argsText` com `formatCommandLine(profile.args)`. Ao submeter, analisar o campo `command` e o campo `argsText`; validar que o comando produz ao menos um token e que ambos não têm erro de aspas. Desabilitar o botão de criar/salvar enquanto a análise falhar e mostrar a mensagem junto do campo. Persistir `profile.args` como `string[]` usando o parser, sem alterar o schema ou o formato de `library.json`.

Atualizar o texto auxiliar do campo para indicar o uso de aspas em caminhos e argumentos com espaços. A forma existente `--model sonnet` continua produzindo dois argumentos.

- [ ] **Passo 3: Compilar a interface e o código compartilhado**

Rodar `pnpm typecheck` e `pnpm build`. Esperado: imports compartilhados compilam para main e renderer sem dependências de Electron.

## Tarefa 4: Lançar Agents por argumentos e revisar a invocação

**Arquivos:**

- Modificar: `src/shared/agent-command.ts`
- Modificar: `src/main/services/platform-support.ts`
- Modificar: `src/main/services/agent-run-manager.ts`
- Modificar: `src/renderer/src/components/AgentRunDialog.tsx`

- [ ] **Passo 1: Gerar a invocação lógica uma única vez**

Exportar `resolveAgentProvider(profile)` e `buildAgentInvocation(profile, prompt, provider)` de `agent-command.ts`. O resultado contém `executable`, `args` e `displayCommand`. Tokens parseados do campo `command` precedem `profile.args`; o prompt é anexado como um argumento separado. Para OpenCode, trocar/inserir `--format json` na lista de argumentos antes de formatar a prévia. Manter `buildAgentCommand(...)` como wrapper que retorna `displayCommand`, pois já é importado por consumidores existentes.

- [ ] **Passo 2: Montar o plano de execução nativo**

Adicionar `buildAgentProcessPlan(invocation, platform)` em `platform-support.ts`: Linux/macOS devolvem `{ file: executable, args }` para spawn direto sem shell. Windows devolve `powershell.exe` com `-NoLogo -NoProfile -NonInteractive -EncodedCommand` e um `env` contendo o payload JSON UTF-8/Base64 em uma variável exclusiva (`GLIBRARY_AGENT_PAYLOAD`). O script PowerShell é constante: lê e decodifica essa variável, valida/resolva o executável com `Get-Command`, executa `& $executable @arguments`, propaga `$LASTEXITCODE` para processos nativos e retorna erro não zero quando o comando não existe ou falha ao iniciar. Codificar o script para `-EncodedCommand` como Base64 UTF-16LE. Como o payload vai como dados Base64 e não é interpolado no código PowerShell, espaços, aspas, metacaracteres e quebras de linha dos argumentos não viram sintaxe do script.

- [ ] **Passo 3: Injetar `args` sem quebrar o contrato de spawn existente**

Em `AgentSpawnOptions`, adicionar `args?: string[]`; aproveitar o `env` existente para transportar o payload no Windows, mesclando-o ao ambiente completo já montado em `AgentRunManager.start` para preservar `PATH` e as variáveis atuais. Manter a assinatura de `SpawnFn(command, options)` usada pelo manager. Substituir o default direto `spawn` por um adaptador `spawnAgent(file, options)` que separa `args` das opções e chama `spawn(file, args ?? [], remainingOptions)`. `AgentRunManager.start` usa `buildAgentProcessPlan` e passa `file`, vetor, ambiente e opções resultantes ao adaptador. O registro `AgentRun.command` e a linha sys usam `displayCommand` para que histórico/log continuem legíveis.

- [ ] **Passo 4: Preservar a prévia legível usada por consumidores atuais**

Exportar o wrapper `buildAgentCommand` do módulo compartilhado pelo caminho atual de `agent-run-manager.ts`, mantendo-o compatível com imports existentes. Para os perfis simples atuais, a prévia mantém o formato `claude --model sonnet "prompt"`; o processo real recebe o prompt como um único argumento.

- [ ] **Passo 5: Mostrar prévia completa antes de lançar**

Em `AgentRunDialog.tsx`, calcular `displayCommand` em cada alteração do prompt com `resolveAgentProvider` e `buildAgentInvocation`. Renderizar o resultado em bloco legível entre o campo de prompt e os botões. `Lançar` segue sendo a única ação que chama `onLaunch`; argumentos inválidos mantêm o botão desabilitado e deixam o erro visível.

- [ ] **Passo 6: Compilar sem alterar os testes existentes**

Rodar `pnpm typecheck`, `pnpm lint` e `pnpm build`. Esperado: exports existentes continuam resolvendo, o fake `SpawnFn` tipado anteriormente continua aceito e nenhum novo arquivo de teste é criado. O job `validate` atual continua responsável pela suite existente.

## Tarefa 5: Gerar pacotes nativos na CI

**Arquivos:**

- Modificar: `.github/workflows/ci.yml`

- [ ] **Passo 1: Preservar o job `validate` atual**

Não mudar a matriz nem os passos existentes. Criar um job separado `package` com `needs: validate`, de modo que cada pacote só seja gerado depois que a validação já configurada terminar.

- [ ] **Passo 2: Declarar matriz de plataforma/arquitetura**

Usar estas entradas fixas no job de pacote:

```yaml
matrix:
  include:
    - os: ubuntu-24.04
      name: linux-x64
      args: --linux AppImage --x64
      files: dist/*.AppImage
    - os: windows-2025
      name: windows-x64
      args: --win nsis --x64
      files: dist/*.exe
    - os: macos-15-intel
      name: macos-x64
      args: --mac dmg --x64
      files: dist/*.dmg
    - os: macos-15
      name: macos-arm64
      args: --mac dmg --arm64
      files: dist/*.dmg
```

- [ ] **Passo 3: Instalar e construir no runner nativo**

Em cada entrada, usar checkout, pnpm 10, Node 22 e `pnpm install --frozen-lockfile`. Depois rodar `pnpm build` e `pnpm exec electron-builder ${{ matrix.args }}`. Não executar builds cruzados de `node-pty` em runner de outra plataforma.

- [ ] **Passo 4: Falhar quando o artefato não existir e nomear cada upload**

Adicionar `actions/upload-artifact@v7` com `name: Glibrary-${{ matrix.name }}`, `path: ${{ matrix.files }}` e `if-no-files-found: error`. Cada runner gera nome único; não fazer uploads concorrentes para um artefato compartilhado.

- [ ] **Passo 5: Conferir configuração da workflow**

Revisar o YAML para confirmar que o job `package` depende de `validate`, todas as quatro combinações estão presentes e os globs correspondem às extensões de `electron-builder.yml`. A execução futura do workflow deve listar um `.exe`, dois `.dmg` e um `.AppImage` como quatro artefatos.

## Tarefa 6: Documentar plataformas e registrar decisão

**Arquivos:**

- Modificar: `README.md`
- Modificar: `AGENTS.md`
- Modificar: `docs/DECISOES.md`

- [ ] **Passo 1: Atualizar instruções de uso e desenvolvimento**

No `README.md`, incluir uma tabela de plataformas e pacotes: Windows 10+ x64/NSIS, Linux x64/AppImage em distribuições principais ainda mantidas, macOS 13+ x64 e arm64/DMG. Informar que o pacote macOS sai sem assinatura se não houver Developer ID e que para distribuição pública devem ser configuradas assinatura e notarização.

No `AGENTS.md`, substituir a frase que diz que `pnpm dist` só gera NSIS no Windows por instruções para chamar `pnpm dist` na plataforma nativa e descrever o artefato resultante em cada SO.

- [ ] **Passo 2: Registrar as decisões de execução e compatibilidade**

Adicionar uma entrada datada em `docs/DECISOES.md` com: ordem de shell/fallbacks, candidates Linux para terminal, execução de Agents por argumentos estruturados, prévia obrigatória e matriz nativa de pacotes. Registrar que `library.json` e os caminhos de `app.getPath('userData')` não mudam.

- [ ] **Passo 3: Conferir consistência dos documentos**

Comparar nomes de pacote, arquiteturas e mínimos de SO entre README, AGENTS, decisão e workflow. Esperado: nenhum documento descreve iOS ou Windows/Linux ARM64 como suportados nesta entrega.

## Tarefa 7: Validar os artefatos instaláveis manualmente

**Arquivos:**

- Gerados: `dist/*.exe`, `dist/*.dmg`, `dist/*.AppImage` na CI

- [ ] **Passo 1: Confirmar comandos de compilação local no Windows**

Rodar `pnpm typecheck`, `pnpm lint` e `pnpm build`. Esperado: cada comando termina com código 0. Gerar localmente o NSIS com `pnpm dist`; esperado: um instalador `.exe` em `dist/`.

- [ ] **Passo 2: Conferir resultados por plataforma no workflow**

Na execução da CI, conferir que Linux envia `Glibrary-linux-x64` com `.AppImage`, Windows envia `Glibrary-windows-x64` com `.exe`, e os dois runners macOS enviam `Glibrary-macos-x64`/`Glibrary-macos-arm64` com `.dmg`.

- [ ] **Passo 3: Fazer smoke manual em cada instalador**

Instalar/abrir cada artefato e conferir: primeiro início, persistência da biblioteca anterior, seleção de pasta, operação Git, terminal PTY embutido, terminal externo (incluindo erro útil no Linux sem launcher) e prévia/execução de Agent com argumento e prompt contendo espaços e aspas. No Mac, confirmar o comportamento documentado para DMG sem assinatura.

Não executar nem adicionar testes automatizados neste plano. O job de validação já existente continua inalterado e executa a suite que o repositório possui.

## Critérios de conclusão

- Os quatro pacotes esperados aparecem como artefatos separados no workflow.
- Os fluxos de terminal não dependem de `/bin/bash` ou `x-terminal-emulator` como únicos nomes possíveis.
- Agents iniciam com o mesmo vetor de argumentos em Windows, Linux e macOS; a janela mostra a invocação antes do clique `Lançar`.
- Tools continuam executando o texto confirmado pelo shell nativo.
- A versão instalada preserva os dados da pessoa usuária.
- README, AGENTS e decisão usam o mesmo suporte de SO/arquitetura.

## Referências de runner e empacotamento

- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [actions/upload-artifact](https://github.com/actions/upload-artifact)
- [Build multiplataforma do electron-builder](https://www.electron.build/v26/docs/features/multi-platform-build/)
- [Dependências nativas do electron-builder](https://www.electron.build/v26/docs/features/build-lifecycle/)
