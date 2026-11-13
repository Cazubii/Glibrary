# Compatibilidade desktop Windows, Linux e macOS — desenho

**Data:** 2026-11-13
**Estado:** desenho aprovado no chat; prévia de comando esclarecida na revisão técnica
**Escopo:** distribuição e execução do aplicativo desktop Glibrary em Windows, Linux e macOS.

## Objetivo

Permitir instalar e usar a Glibrary nos três sistemas desktop mantendo os fluxos locais disponíveis: biblioteca, operações Git, terminais PTY embutidos, abertura de terminal externo e execução de Agents/Ferramentas. A adaptação deve respeitar as convenções de cada sistema, manter a ação explícita que inicia comandos e mostrar à pessoa a invocação efetiva dos Agents antes de executá-los.

## Contexto atual

A aplicação já usa Electron 45 e o `electron-builder` declara NSIS para Windows, DMG para macOS e AppImage para Linux. A CI (`.github/workflows/ci.yml`) já executa instalação de dependências, typecheck, lint, testes e build em Ubuntu, Windows e macOS; ela ainda não gera instaladores.

O processo principal já trata o ciclo de janela do macOS. A escolha do shell do PTY, o lançamento de terminais externos e alguns comandos usam diferenças de plataforma diretamente no código. No Linux, a abertura do terminal externo depende de `x-terminal-emulator`; se o launcher não existir, a falha é ignorada. O app também inclui `node-pty`, uma dependência nativa que precisa estar compilada para a plataforma e arquitetura do pacote. O formulário de Agents separa argumentos atualmente por whitespace, então não representa um argumento que contenha espaços.

O Electron suporta Windows, Linux e macOS. iOS não faz parte das plataformas de execução do Electron e está fora desta entrega. Uma versão para iPhone/iPad deve ser tratada como um cliente móvel separado, pois o app atual depende de filesystem e PTY locais.

## Decisões aprovadas

- Manter Electron, React e a divisão atual entre processo principal, preload, renderer e tipos compartilhados; não reescrever o app.
- Alvo inicial de distribuição: Windows 10+ x64 em NSIS; Linux x64 em AppImage; macOS 13+ x64 e arm64 em DMG separado por arquitetura. Para Linux, seguir a política de suporte do Electron para distribuições principais ainda mantidas pelos seus fornecedores. As dependências nativas serão reconstruídas no runner correspondente à plataforma e arquitetura.
- Manter a matriz de CI existente nos três sistemas e acrescentar geração e armazenamento dos artefatos de instalação em runners nativos.
- Centralizar seleção de shell e abertura de terminal externo em helpers de plataforma no processo principal, em vez de espalhar detecção por `process.platform`.
- Resolver shells com detecção e fallback por sistema. Se nenhum shell apropriado estiver disponível, devolver erro legível em pt-BR com orientação, sem deixar a sessão falhar silenciosamente.
- No Linux, procurar um terminal externo nesta ordem: `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`, `xterm`. Encaminhar o diretório de trabalho com os argumentos aceitos pelo launcher encontrado. Se nenhum estiver disponível, mostrar uma mensagem acionável ao usuário.
- Ferramentas configuradas pelo usuário continuam sendo comandos livres executados pelo shell nativo. Para Agents, manter executável e argumentos separados, passando o prompt como argumento; o campo de argumentos reconhece aspas e escapes com sintaxe igual nos três sistemas. Lidar com shims `.cmd`/`.bat` no Windows sem depender de quoting POSIX. A janela de lançamento deve mostrar a invocação completa (executável, argumentos fixos e prompt) e exigir a ação explícita `Lançar`.
- Continuar usando APIs de caminho do Node/Electron e diretórios conhecidos do Electron para dados da aplicação; não gravar estado de usuário dentro da pasta de instalação.
- Documentar formatos gerados, requisitos e limitações por sistema no README e no guia do repositório.

## Alternativas consideradas

1. **Ajustar a aplicação Electron existente (escolhida):** concentrar as diferenças de shell/terminal, construir cada pacote em host nativo e manter uma única aplicação desktop. É a menor mudança que preserva acesso local a arquivos e PTY.
2. **Migrar a aplicação para web:** reduz diferenças visuais entre sistemas, mas filesystem local, Git e PTY ainda exigiriam um serviço instalado na máquina. Isso aumenta o número de componentes sem remover a necessidade do cliente desktop.
3. **Criar um cliente móvel junto com o desktop:** iOS exigiria frontend e integração próprios, além de decidir como acessar arquivos e executar processos do computador. Esse trabalho não é necessário para o objetivo desktop escolhido.

## Componentes e responsabilidades

### Integração de plataforma

Criar uma unidade em `src/main/services/` para concentrar resolução de shell, preparação de comandos e abertura de terminal externo. Os chamadores atuais — especialmente `TerminalManager`, `tool-run`, execução de Agents e abertura de terminal em `repos.ipc` — passam a usar essa unidade.

- **Windows:** escolher o shell instalado configurado para a sessão; manter o comportamento compatível com os comandos atuais e com executáveis `.cmd`.
- **macOS:** usar o shell configurado pelo ambiente do usuário quando estiver disponível e abrir o Terminal do sistema com o diretório do projeto.
- **Linux:** usar `$SHELL` se válido, com fallbacks instalados no sistema; detectar um terminal gráfico instalado e encaminhar o diretório de trabalho usando a sintaxe correspondente.
- **Agents:** analisar o campo de argumentos com parser independente do SO que aceite aspas simples/duplas, espaços e escapes, mantendo o formato persistido como `string[]`. Executar `command` com esse vetor e acrescentar o prompt como um argumento separado. O comando exibido para confirmação é uma representação legível do vetor. No Windows, reconhecer shims `.cmd`/`.bat` e encaminhá-los via `ComSpec` com escaping próprio de Windows.
- **Ferramentas:** manter `command` como script livre e executá-lo pelo shell da plataforma, pois esse é o formato configurável pela pessoa usuária. Não compartilhar o mecanismo de quoting dos Agents com esse formato.
- Encaminhar erros de spawn ao handler IPC para que a interface mostre a falha de forma compreensível.

### Empacotamento

Manter o `electron-builder` como responsável pelos pacotes:

- Windows x64: instalador NSIS.
- macOS x64 e arm64: DMG separado por arquitetura.
- Linux x64: AppImage.

A etapa de pacote deve rodar num host nativo por sistema. O build do Electron não substitui a validação do bundle final, principalmente porque `node-pty` contém código nativo. A CI deve guardar cada artefato com nome que identifique sistema e arquitetura.

Os builds de macOS serão produzidos sem assinatura quando não houver credenciais de Developer ID configuradas. Assinatura e notarização para distribuição pública ficam fora desta entrega e poderão ser ativadas depois com os segredos de release.

Os DMGs sem assinatura são artefatos de desenvolvimento. O README deve informar que downloads externos sem assinatura/notarização podem receber avisos do Gatekeeper; distribuição pública fica condicionada a Developer ID e notarização.

### CI e documentação

A CI conserva o job de validação atual em Ubuntu, Windows e macOS. O job de distribuição deve executar `pnpm dist` em runners compatíveis, publicar os artefatos como resultados do workflow e falhar se não produzir o pacote esperado.

O README deve listar os formatos e arquiteturas suportados, como executar a versão de desenvolvimento e limitações de assinatura no macOS. O guia `AGENTS.md` deve deixar de descrever `pnpm dist` como exclusivo do Windows.

## Fluxo de uso

1. A pessoa instala o pacote gerado para seu sistema.
2. Ao iniciar um terminal embutido, a aplicação resolve o shell disponível e cria o PTY com o diretório do projeto.
3. Ao escolher abrir um terminal externo, o processo principal encontra o launcher do sistema e abre o projeto na pasta correta.
4. A janela do Agent mostra a invocação completa para revisão antes de `Lançar`; Ferramentas preservam a revisão e confirmação já existentes. A execução usa o mecanismo compatível com o sistema.
5. Se um shell ou terminal gráfico não estiver disponível, a interface informa o componente ausente e a ação sugerida.

## Erros e estados

- Shell configurado inexistente: erro de criação do terminal com indicação para escolher/instalar um shell.
- Launcher externo ausente ou falha ao abrir: erro visível com sugestão de instalar um terminal compatível ou continuar usando o terminal embutido.
- Falha ao carregar o PTY nativo no pacote: o build da distribuição deve falhar ou a aplicação deve apresentar erro acionável; nunca deve reportar uma sessão ativa que não foi criada.
- Falha de execução de Agent/Ferramenta: preservar stdout/stderr e código de saída, sem remover a confirmação ou ocultar o comando revisado.
- Aspas/escapes inválidos no formulário de argumentos: indicar o erro antes da confirmação e impedir a execução do perfil até a correção.
- Os arquivos de dados existentes permanecem no diretório de usuário do Electron; nenhuma migração de `library.json` é necessária para esta mudança.

## Critérios de aceite

1. A CI gera um NSIS x64, DMGs x64 e arm64 e um AppImage x64 em runners nativos, com artefatos identificáveis por plataforma/arquitetura.
2. Cada pacote inicia a aplicação e carrega os dados no diretório de usuário correspondente ao sistema.
3. Em cada sistema, é possível selecionar uma pasta, executar operações Git já disponíveis e criar um terminal PTY embutido no diretório selecionado.
4. Abrir terminal externo funciona no Windows, macOS e em pelo menos um terminal gráfico comum no Linux; ausência de launcher produz mensagem visível e acionável.
5. Um Agent ou Ferramenta não executa até a pessoa revisar e confirmar o comando; Agents preservam argumentos e prompts com espaços/aspas nos três sistemas, perfis antigos continuam legíveis, e Ferramentas continuam interpretadas pelo shell nativo.
6. Uma instalação sobre versão anterior preserva a biblioteca e suas configurações.
7. A documentação explica formatos, arquiteturas e requisito de assinatura do macOS.

## Validação prevista

- A CI existente continua executando typecheck, lint, testes e build nos três sistemas.
- A nova etapa de distribuição verifica a presença de cada artefato esperado no runner correspondente.
- Uma verificação manual dos pacotes deve cobrir primeiro início, leitura/gravação da biblioteca, terminal embutido, terminal externo e execução confirmada de Agent/Ferramenta em cada plataforma.

## Fora desta entrega

- Aplicação iOS/iPadOS, Android ou cliente web/PWA.
- Serviço remoto, sincronização em nuvem ou agente residente para acessar o computador a partir de um dispositivo móvel.
- Assinatura/notarização de builds macOS e publicação em lojas, enquanto as credenciais de distribuição não estiverem configuradas.
- Suporte a arquiteturas Windows ARM64 e Linux ARM64 nesta primeira matriz.
- Auto-update e publicação automática em GitHub Releases.

## Referências

- [Plataformas Electron](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)
- [Política de suporte e arquiteturas do Electron](https://www.electronjs.org/docs/latest/breaking-changes)
- [Política do Electron para distribuições Linux](https://github.com/electron/electron/issues/52101)
- [Build multiplataforma do electron-builder](https://www.electron.build/v26/docs/features/multi-platform-build/)
- [Ciclo de build e dependências nativas](https://www.electron.build/v26/docs/features/build-lifecycle/)
- [Notarização de software macOS](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
