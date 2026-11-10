# Terminal integrado VS Code e fluxo remoto-first

**Data:** 2026-11-10  
**Estado:** desenho aprovado pelo usuário; pronto para revisão da especificação antes do plano de implementação.  
**Repositório/branch:** `Cazubii/Glibrary`, `codex/vscode-terminal-remote-first`.

## Contexto

O usuário quer um terminal integrado familiar ao VS Code e prefere trabalhar diretamente no repositório GitHub, sem manter uma cópia local do projeto quando ela não for necessária. O branch remoto usado como base ainda não contém um terminal PTY embutido nem as dependências `node-pty`/xterm. Há um protótipo local não publicado (`RepoTerminal.tsx`, `TerminalManager` e IPC), que serve como referência, mas não é a base remota.

## Resultado esperado

- Abrir o terminal no painel inferior da página de detalhes do projeto, mantendo o contexto do repositório visível.
- Usar sessões e perfis de terminal com comandos de criação, divisão, foco, ocultação, maximização e encerramento.
- Preferir operações GitHub remotas para ler e alterar arquivos quando não houver necessidade de shell ou filesystem.
- Executar comandos num Codespace ligado ao repositório sem clonar o projeto no computador. Usar checkout temporário somente como alternativa escolhida quando o Codespace não estiver disponível.

## Direção aprovada

### Painel integrado

O terminal fica acoplado à página do projeto, inspirado no painel inferior do VS Code. O cabeçalho mostra repositório, branch e ambiente ativo. A área do terminal tem abas nomeadas por perfil e sessão, seletor de perfil/ambiente e ações visíveis para novo terminal, dividir, limpar, encerrar, ocultar e maximizar. Não serão exibidas abas de Problemas ou Saída sem funcionalidades reais associadas.

Cada instância mantém seu próprio PTY e buffer de tela. Ocultar/reabrir o painel preserva sessões; encerrar uma sessão mata seu processo. Fechar a janela encerra os PTYs locais. Um Codespace conectado não é parado ao ocultar ou desconectar o painel; seu estado e uma ação explícita de parada ficam visíveis para evitar consumo remoto escondido.

### Experiência de terminal

- Xterm ocupa o viewport do painel e ajusta colunas/linhas ao redimensionamento.
- Suporte a seleção/copiar/colar, busca no scrollback, links clicáveis, limpeza e foco de teclado.
- `Ctrl+C` copia quando há seleção e envia interrupção quando não há; os atalhos são apresentados no menu de ações.
- Perfis detectados por ambiente: `pwsh`/PowerShell no Windows, shells configurados no macOS/Linux e Codespace remoto.
- O terminal não é iniciado até o usuário abrir o painel ou criar uma sessão; módulos pesados do terminal são carregados sob demanda.

### Execução e fluxo remoto

1. **Alterações diretas no GitHub:** para leitura/edição de conteúdo que não exige execução, trabalhar em branch remota e gravar commits via API GitHub. Esse fluxo não cria checkout local.
2. **Terminal remoto:** listar/conectar Codespaces do repositório e anexar um shell com `gh codespace ssh`. A sessão usa o PTY local apenas como transporte; os comandos e arquivos do projeto permanecem no Codespace.
3. **Criação do Codespace:** nunca criar automaticamente. Se não existir um, oferecer criação explícita, informando permissões e uso/cobrança antes de prosseguir. A API requer escopo `codespace` para PAT clássico ou permissão Codespaces de escrita para token fine-grained; [documentação da API](https://docs.github.com/en/rest/codespaces/codespaces).
4. **Fallback local:** se o usuário precisar executar algo sem Codespace, oferecer um checkout temporário em diretório de sistema temporário, sem configurar pasta permanente. Avisar antes de criá-lo. Antes de apagá-lo, preservar ou publicar alterações do usuário; nunca descartar mudanças silenciosamente.

`gh codespace ssh` é a rota suportada para anexar um shell remoto ([manual do GitHub CLI](https://cli.github.com/manual/gh_codespace_ssh)). O Codespace pode continuar ativo depois que a sessão SSH termina; por isso a interface mostra o estado e oferece uma ação explícita de parada. O uso de Codespaces pode gerar cobrança conforme plano e consumo ([faturamento](https://docs.github.com/en/billing/concepts/product-billing/github-codespaces)).

### Componentes e fluxo de dados

- **Renderer:** painel dockado, tabs de sessões e viewport xterm; recebe saída e envia entrada/redimensionamento por IPC.
- **Preload/IPC:** métodos específicos tipados para listar ambientes, iniciar sessão, enviar entrada, redimensionar, encerrar sessão e receber eventos. Nenhum acesso Node é exposto ao renderer.
- **Main:** gerenciador de sessões; provider local inicia `node-pty`; provider Codespace inicia/gerencia `gh codespace ssh` e encaminha o stream. O módulo `node-pty` só é carregado para sessões locais.
- **GitHub:** serviço principal controla credenciais e operações remotas; token nunca chega ao renderer nem é gravado em logs.
- **Configuração:** provider escolhido e perfil padrão podem ser lembrados; tokens continuam no armazenamento seguro existente. Não persistir um caminho local quando o projeto só é remoto.

Fluxo: usuário abre o painel → escolhe Codespace/local temporário → main valida disponibilidade e permissões → inicia provider → renderer recebe id e stream → resize/input fluem por IPC → usuário encerra sessão ou fecha a aplicação.

## Estados e falhas

- Sem ambiente selecionado: apresentar opções de Codespace, terminal local para checkout já existente e checkout temporário.
- Codespace ausente/parado: oferecer conectar, iniciar ou criar com confirmação; mostrar erros de permissão e autenticação em linguagem direta.
- `gh` ausente ou sem autenticação: explicar como instalar/autorizar antes de abrir o shell remoto.
- Sessão encerrada ou shell indisponível: mostrar estado final e ação para abrir outra sessão.
- Desconexão de rede: preservar o buffer visível, indicar desconexão e oferecer reconexão sem duplicar processos.
- Fechar painel não mata a sessão; ação Encerrar mata a sessão local/SSH. Parar Codespace é ação separada.

## Limites

- Não construir editor de arquivos, depurador, extensões ou uma cópia completa do VS Code.
- Não criar, manter ou cobrar um Codespace sem ação explícita do usuário.
- Não criar clone local permanente para tarefas que a API GitHub ou um Codespace resolvam.
- Não apagar um checkout temporário se houver mudanças não publicadas.

## Critérios de aceite

1. O painel abre no rodapé da página do projeto e mantém a página visível.
2. O usuário consegue abrir, alternar, dividir e encerrar mais de uma sessão; ocultar/reabrir mantém as sessões.
3. Teclado, copiar/colar, busca, links e resize funcionam no terminal local e no Codespace.
4. Um Codespace pode executar comandos do repositório sem `localPath` nem clone do projeto no computador.
5. Alterações remotas que não requerem execução podem ser feitas em branch/commit pela API sem checkout local.
6. Codespace e checkout temporário nunca são criados silenciosamente; estado, custo potencial e ações de encerramento ficam claros.
7. Fallback temporário preserva alterações antes de remoção e não deixa cópia permanente.
8. Erros de shell, autorização, `gh`, PTY e rede são visíveis e não deixam processos órfãos.

## Validação planejada

Depois do plano aprovado, validar manualmente: provider local já clonado; Codespace existente; Codespace parado; Codespace sem permissão; ausência de `gh`; nenhuma pasta local; fallback temporário com e sem alterações; resize e atalhos; encerramento e reconexão. Não executar comandos remotos que criem recursos faturáveis sem confirmação explícita.

## Revisão da especificação

- A direção aprovada (painel inferior e fluxo híbrido remoto-first) é consistente ao longo do documento.
- Criação de Codespace está separada de conexão e exige confirmação, evitando provisionamento/cobrança silenciosos.
- Checkout temporário é fallback não persistente e inclui proteção contra perda de alterações.
- Perfis locais e remotos usam o mesmo fluxo xterm/IPC sem expor Node ao renderer.
- O branch remoto não tem o protótipo local; a implementação deve tratar este documento como especificação e reutilizar o protótipo somente após revisão de compatibilidade.