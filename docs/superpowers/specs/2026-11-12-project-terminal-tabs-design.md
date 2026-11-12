# Terminais por projeto em abas — desenho

**Data:** 2026-11-12  
**Estado:** desenho aprovado no chat; aguardando revisão deste documento  
**Escopo:** primeira entrega da sequência aprovada: terminais, monitor de Agents, consumo de tokens.

## Objetivo

Permitir várias sessões de terminal independentes na mesma pasta de projeto, organizadas em abas. Trocar de aba, esconder o painel ou navegar para outro projeto não deve encerrar processos. A pessoa deve conseguir voltar ao projeto e continuar acompanhando cada sessão.

## Contexto atual

`TerminalManager` já cria processos PTY distintos e guarda saída recente por ID, mas `terminalOpen(cwd)` procura uma sessão pela pasta e devolve apenas a primeira encontrada. `RepoTerminal` representa uma única sessão e encerra terminais não persistentes quando desmontado. As telas de projetos, workspace, detalhe de repositório e biblioteca instanciam esse componente em painéis separados.

O fluxo atual não tem catálogo de sessões por pasta nem uma operação de reconexão por ID. A solução precisa tratar a lista de sessões como estado do processo principal, para que ela sobreviva a mudanças de rota e recargas do renderer enquanto o aplicativo estiver aberto.

## Decisões aprovadas

- Usar abas, com um terminal ativo visível por vez, conforme a opção visual A escolhida.
- Agrupar sessões pela pasta de trabalho normalizada. Um worktree com caminho diferente forma outro grupo.
- A primeira abertura cria `Terminal 1`; `+` cria uma sessão independente com o próximo nome automático (`Terminal 2`, `Terminal 3`…). Não incluir divisão de painéis ou renomeação nesta entrega.
- Selecionar outra aba troca a visualização sem encerrar o processo da aba anterior.
- `Fechar painel` esconde o painel e desanexa a visualização; os processos continuam rodando enquanto o aplicativo estiver aberto.
- Trocar de projeto também desanexa a visualização sem encerrar processos. Ao voltar à mesma pasta, a lista de abas e a seleção anterior são restauradas.
- `×` numa aba encerra e remove somente aquela sessão. Se a aba ativa for fechada, selecionar a aba adjacente. Se a última aba for fechada com o painel aberto, mostrar estado vazio com ação `Novo terminal`.
- Quando um processo terminar, manter sua aba marcada como encerrada e preservar a saída recente até a aba ser fechada.
- Encerrar o aplicativo termina as sessões PTY; não persistir processos nem abas entre reinicializações do aplicativo.
- Os pontos atuais que abrem terminal compartilham as mesmas abas quando usam a mesma pasta.

## Alternativas consideradas

1. **Catálogo de sessões no processo principal (escolhida):** o processo principal mantém ID, pasta, nome, estado, saída recente e PTY. A interface pode listar e reconectar sessões depois de mudar de rota ou recarregar.
2. **Estado apenas no renderer:** requer menos operações IPC, mas pode perder a lista de abas quando o renderer recarrega enquanto os processos continuam ativos. Isso deixaria sessões sem uma forma confiável de reabrir no painel.

O catálogo central foi escolhido por atender à regra aprovada de manter processos ativos ao trocar de projeto.

## Componentes e responsabilidades

### Processo principal

Evoluir `TerminalManager` para ser a fonte canônica das sessões. Cada sessão contém ID, caminho normalizado, nome automático, estado (`running` ou `exited`), código de saída quando houver, processo PTY quando ativo, ID de conexão atual, sequência de saída e buffer limitado de saída recente. Depois da saída do processo, manter o registro e o buffer até o renderer pedir para fechar aquela aba.

Adicionar operações IPC validadas para:

- listar sessões por pasta;
- criar uma sessão independente em uma pasta;
- conectar a uma sessão existente por ID e receber snapshot/sequence;
- desconectar uma visualização usando ID de conexão;
- fechar uma sessão e remover seu registro;
- enviar entrada e redimensionamento somente para sessões ativas.

Uma conexão nova recebe token próprio. Uma limpeza atrasada pode desconectar apenas o token correspondente, sem afetar uma conexão mais recente.

Ao encerrar o aplicativo, matar as sessões PTY ativas e liberar seus registros. O histórico do buffer permanece limitado pelo limite atual do terminal, sem gravar comandos ou saída em `library.json`.

### Renderer

Criar um painel reutilizável de terminais por pasta, conectado a um estado global da interface indexado pelo caminho normalizado. O processo principal é a fonte de verdade para sessões e estado; o renderer guarda a aba selecionada e o estado visível/oculto do painel.

O painel contém a barra de abas, `+`, o terminal da aba ativa e uma ação para esconder/reabrir o painel. A view xterm liga/desliga conforme a aba selecionada; desmontar ou ocultar a view desconecta o sink, mas não mata o processo. Todas as telas existentes que recebem `cwd` usam o mesmo painel/estado.

### Fluxo de abertura e reconexão

1. Ao abrir uma pasta, a interface chama `terminalList(cwd)`.
2. Se não houver sessões, cria a primeira; se houver, restaura a aba selecionada ou usa a primeira disponível.
3. Ao ativar uma aba, conecta por ID, escreve o snapshot e depois recebe eventos filtrados pelo ID e sequência.
4. Ao trocar de aba, esconder o painel ou mudar de projeto, desanexa a conexão anterior sem encerrar o PTY.
5. `+` cria e ativa uma nova sessão. `×` encerra apenas a sessão selecionada e atualiza o grupo.

## Erros e estados

- Pasta removida ou inacessível: exibir erro ao criar terminal sem limpar sessões já registradas para outras pastas.
- Sessão finalizada: manter a aba selecionável com estado visual `Encerrado`, código de saída e saída recente. A pessoa pode fechá-la ou abrir outra em `+`.
- Falha ao conectar: manter a lista de abas visível, mostrar erro da aba e oferecer reconexão.
- Eventos de saída e término são sempre associados ao ID da sessão. Eventos fora de sequência não sobrescrevem snapshot mais recente.
- Entrada e resize enviados para uma sessão encerrada são ignorados de forma segura.

## Critérios de aceite

1. Criar pelo menos três terminais para a mesma pasta produz IDs, processos e abas distintos.
2. Comandos executados em uma aba não aparecem nem recebem entrada de outra aba.
3. Trocar de aba mantém os demais processos ativos e recupera a saída recente ao retornar.
4. Esconder o painel ou mudar de projeto mantém as sessões ativas; voltar à mesma pasta restaura as abas.
5. Fechar uma aba encerra apenas seu processo e seleciona outra aba quando disponível.
6. Fechar a última aba mostra `Novo terminal`; criar um novo terminal inicia um processo novo.
7. Sessões encerradas continuam visíveis com estado/código e podem ser fechadas individualmente.
8. Uma conexão antiga não consegue desconectar uma conexão mais nova da mesma sessão.
9. Ao encerrar o aplicativo, todos os PTYs ativos são finalizados.

## Validação prevista

- Testes unitários do `TerminalManager`: múltiplos PTYs no mesmo diretório, listagem, attach/detach por token, snapshot, encerramento, fechar uma sessão sem afetar as outras e limpeza no encerramento do app.
- Testes de integração IPC: schemas e roteamento por ID, incluindo entradas inválidas e sessões encerradas.
- Verificação da interface: adicionar, alternar, fechar, ocultar, mudar de projeto, voltar e reabrir um terminal finalizado.
- Rodar typecheck, lint direcionado e build da aplicação.

## Fora desta entrega

- Painéis divididos e renomeação de abas.
- Restauração de sessões após sair e reiniciar o aplicativo.
- Monitoramento de agentes/subagents e medição de tokens por sessão/conta; esses são os próximos dois projetos da sequência aprovada.
