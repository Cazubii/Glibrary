export interface GlossaryTerm {
  simpleName: string;
  technicalName: string;
  explanation: string;
}

export const GLOSSARY = {
  skill: {
    simpleName: 'Instrução reutilizável',
    technicalName: 'Skill',
    explanation: 'Um arquivo de instruções que ajuda a IA a repetir uma tarefa de um jeito consistente.'
  },
  agent: {
    simpleName: 'Assistente de IA',
    technicalName: 'Agente',
    explanation: 'Uma ferramenta de IA que recebe um pedido e pode trabalhar nos arquivos do projeto.'
  },
  base: {
    simpleName: 'Modelo de projeto',
    technicalName: 'Base',
    explanation: 'Um projeto inicial que você pode baixar e adaptar para começar mais rápido.'
  },
  collection: {
    simpleName: 'Pacote de recursos',
    technicalName: 'Coleção',
    explanation: 'Um conjunto de instruções, agentes e modelos reunidos para um tipo de trabalho.'
  },
  project: {
    simpleName: 'Seu trabalho',
    technicalName: 'Projeto',
    explanation: 'A pasta e os arquivos que você está criando ou modificando.'
  },
  repository: {
    simpleName: 'Projeto com histórico',
    technicalName: 'Repositório',
    explanation: 'Uma pasta acompanhada pelo Git, com versões que podem ser enviadas ao GitHub.'
  },
  branch: {
    simpleName: 'Linha de trabalho',
    technicalName: 'branch',
    explanation: 'Um caminho separado para experimentar mudanças sem alterar a versão principal.'
  },
  commit: {
    simpleName: 'Salvar uma versão',
    technicalName: 'commit',
    explanation: 'Guarda um retrato das mudanças no histórico do projeto para você poder consultá-lo depois.'
  },
  push: {
    simpleName: 'Enviar para o GitHub',
    technicalName: 'push',
    explanation: 'Publica no GitHub as versões que ainda estão somente neste computador.'
  },
  pull: {
    simpleName: 'Baixar novidades',
    technicalName: 'pull',
    explanation: 'Traz para este computador as versões novas que estão no GitHub.'
  },
  clone: {
    simpleName: 'Baixar para o computador',
    technicalName: 'clone',
    explanation: 'Cria uma cópia local do projeto publicado no GitHub.'
  },
  remote: {
    simpleName: 'Conexão com o GitHub',
    technicalName: 'remote',
    explanation: 'O endereço usado para trocar versões entre este computador e um serviço como o GitHub.'
  },
  token: {
    simpleName: 'Chave de acesso',
    technicalName: 'token',
    explanation: 'Um código secreto que identifica você para um serviço. Não compartilhe esse código.'
  },
  cli: {
    simpleName: 'Ferramenta de terminal',
    technicalName: 'CLI',
    explanation: 'Um programa que você controla digitando instruções, em vez de usar botões.'
  },
  inputTokens: {
    simpleName: 'Texto enviado para a IA',
    technicalName: 'tokens de entrada',
    explanation: 'Partes do pedido e do contexto que a IA recebeu para gerar uma resposta.'
  },
  outputTokens: {
    simpleName: 'Texto gerado pela IA',
    technicalName: 'tokens de saída',
    explanation: 'Partes da resposta produzida pela IA. Serviços podem usar essa medida no cálculo do custo.'
  },
  tokens: {
    simpleName: 'Partes de texto processadas',
    technicalName: 'tokens',
    explanation: 'A IA divide os textos em partes pequenas para processar pedidos e contabilizar o uso.'
  },
  cache: {
    simpleName: 'Contexto reaproveitado',
    technicalName: 'cache',
    explanation: 'Informações guardadas temporariamente para evitar processar o mesmo contexto do zero.'
  },
  workspace: {
    simpleName: 'Pasta de trabalho',
    technicalName: 'workspace',
    explanation: 'Uma cópia do projeto aberta para você e o agente trabalharem.'
  }
} as const satisfies Record<string, GlossaryTerm>;

export type GlossaryTermId = keyof typeof GLOSSARY;
