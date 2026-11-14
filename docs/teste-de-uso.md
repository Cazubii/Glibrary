# Teste de uso: primeira jornada no Glibrary

Roteiro para validar se uma pessoa iniciante consegue instalar e usar o Glibrary sem abrir
documentação externa. Conduza sessões individuais com **3 a 5 pessoas** que nunca tenham usado Git
no terminal e que tenham pouca ou nenhuma experiência com agentes de IA.

## Antes da sessão

- Use a versão instalável candidata à publicação, em uma conta local sem dados anteriores do
  Glibrary.
- Prepare um repositório de teste descartável no GitHub e uma conexão de rede estável.
- Confirme que o Git, Node.js e ao menos uma CLI de agente podem ser instalados ou detectados.
- Para testar a jornada OAuth, configure o client ID público e a permissão de criação de
  repositório antes da sessão. Se isso não estiver pronto, registre o bloqueio e não substitua o
  fluxo por um PAT sem anotar a diferença.
- Explique que a sessão avalia o produto, não a pessoa. Peça consentimento para anotações. Não
  grave tela/áudio, não peça tokens, e-mails ou senhas e não use projetos privados.
- Identifique participantes como P1, P2, P3, P4 e P5; não anote nomes ou contatos neste documento.

## Como conduzir

1. Inicie o cronômetro quando a pessoa começar cada tarefa e pare quando concluir ou desistir.
2. Leia o pedido abaixo sem explicar como fazer. Diga: “Faça como faria se estivesse sozinho; pode
   falar o que está pensando”.
3. Anote cliques repetidos, pausas acima de 10 segundos, volta atrás, pedidos de ajuda e palavras
   que a pessoa não entendeu. Não corrija durante a primeira tentativa.
4. Se houver risco de apagar ou publicar conteúdo real, interrompa e marque a tarefa como bloqueada.
5. Ao final, pergunte o que foi mais confuso, em que momento teve receio de perder trabalho e qual
   seria o próximo passo esperado.

## Tarefas

| # | Leia para a pessoa | Conclusão observável |
|---|---|---|
| 1. Instalar e preparar | “Instale o Glibrary e deixe o computador pronto para começar um projeto com IA.” | App aberto; Git, Node e CLI verificados ou instalados. |
| 2. Entrar no GitHub | “Conecte sua conta do GitHub pelo Glibrary.” | Conta aparece conectada sem copiar token manual. |
| 3. Abrir um projeto | “Comece um projeto novo ou abra este repositório de teste.” | Projeto local visível no Glibrary, com arquivos acessíveis. |
| 4. Pedir uma mudança | “Peça ao agente para mudar o título da página para ‘Meu primeiro site’.” | Execução termina; pessoa consegue localizar resumo e arquivos alterados. |
| 5. Revisar e enviar | “Confira a mudança, salve uma versão e envie seu projeto de teste ao GitHub.” | Pessoa revisa diff, salva e confirma publicação sem enviar à branch principal por engano. |

Tempo total-alvo: **menos de 20 minutos**, sem ajuda do observador e sem documentação externa.

## Folha de observação

Preencha uma cópia desta tabela por participante. “Bloqueio” significa que a pessoa não conseguiu
prosseguir sem ajuda ou que uma dependência externa estava indisponível.

| Tarefa | Tempo | Concluiu? | Onde hesitou ou pediu ajuda? | Termo que não entendeu | Gravidade (baixa/média/alta) |
|---|---:|---|---|---|---|
| 1. Instalar e preparar | | | | | |
| 2. Entrar no GitHub | | | | | |
| 3. Abrir um projeto | | | | | |
| 4. Pedir uma mudança | | | | | |
| 5. Revisar e enviar | | | | | |

**Depois das tarefas:** momento de maior confiança: ___ · maior receio: ___ · próximo passo que
esperava: ___ · tempo total: ___ · precisou de ajuda: sim/não · bloqueio externo: ___

## Resumo por rodada

Após cada rodada, registre em `docs/DECISOES.md` sem identificar participantes:

- número de participantes e versão testada;
- mediana e faixa de duração de cada tarefa e da jornada total;
- tarefa com mais bloqueios e termos mais citados;
- mudanças feitas ou planejadas, com motivo;
- tarefas não concluídas por dependência externa, separadas de problemas de interface.

Não declare a meta validada se menos de três pessoas completarem as cinco tarefas. O recrutamento,
a configuração das credenciais de teste e a realização das sessões continuam pendentes do
mantenedor.

