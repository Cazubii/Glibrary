import type { IpcError, IpcErrorAction } from '../../shared/types';

function safeTechnicalDetails(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/x-access-token:[^@\s]+@/gi, 'x-access-token:***@')
    .replace(/:\/\/[^/@\s:]+:[^/@\s]+@/g, '://***@')
    .replace(/\bgh[opsur]_[A-Za-z0-9]{20,}\b/g, '***')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '***')
    .replace(/(authorization\s*:\s*(?:bearer|basic)\s+)[^\s]+/gi, '$1***');
}

interface Translation {
  title: string;
  whatHappened: string;
  nextStep: string;
  action?: IpcErrorAction;
}

function translateMessage(message: string): Translation {
  const text = message.toLowerCase();

  if (/rate limit exceeded|api rate limit|secondary rate limit|http 429|rate_limit.*exceeded/.test(text)) {
    return {
      title: 'O GitHub limitou novas consultas',
      whatHappened: 'A conta atingiu temporariamente o limite de consultas do GitHub.',
      nextStep: 'Aguarde alguns minutos e tente novamente.'
    };
  }

  if (/sess[aã]o do github expirou|bad_refresh_token|token_expired/.test(text)) {
    return {
      title: 'A conexão com o GitHub precisa ser renovada',
      whatHappened: 'O GitHub encerrou a autorização salva para esta conta.',
      nextStep: 'Abra Projetos e conecte sua conta novamente.',
      action: { label: 'Abrir Projetos', target: 'projects' }
    };
  }

  if (/configura[cç][aã]o oauth|device flow.*n[aã]o est[aá] habilitado|login simplificado.*n[aã]o est[aá] habilitado/.test(text)) {
    return {
      title: 'A entrada rápida do GitHub ainda não está disponível',
      whatHappened: 'O aplicativo precisa ser configurado pelo mantenedor do Glibrary.',
      nextStep: 'Use “Opções avançadas” para conectar com um token de acesso pessoal.'
    };
  }

  if (/http 401|bad credentials|token.{0,30}(expired|invalid|revoked)|(?:expired|revoked).{0,30}token|authentication failed|authentication required/.test(text)) {
    return {
      title: 'A conexão com o GitHub precisa ser renovada',
      whatHappened: 'O GitHub recusou as credenciais salvas para esta conta.',
      nextStep: 'Abra Projetos e conecte sua conta novamente.',
      action: { label: 'Abrir Projetos', target: 'projects' }
    };
  }

  if (/conflict|merge conflict|unmerged files|non-fast-forward|fetch first|cannot lock ref/.test(text)) {
    return {
      title: 'Há mudanças que não podem ser combinadas automaticamente',
      whatHappened: 'O projeto local e a versão do GitHub têm alterações que se cruzam.',
      nextStep: 'Revise as mudanças no projeto antes de tentar enviar ou baixar novamente.'
    };
  }

  if (/permission denied|permission to .* denied|access denied|resource not accessible|not authorized|http 403|publickey/.test(text)) {
    return {
      title: 'A conta não tem permissão para concluir esta ação',
      whatHappened: 'O GitHub ou o sistema bloqueou o acesso solicitado.',
      nextStep: 'Confira se a conta conectada tem acesso ao projeto e se a pasta permite esta ação.'
    };
  }

  if (/eexist|file exists|already exists|destination path .* exists|pasta.{0,40}já existe/.test(text)) {
    return {
      title: 'A pasta de destino já existe',
      whatHappened: 'Já há arquivos usando o local escolhido.',
      nextStep: 'Escolha outra pasta ou abra a cópia que já está no computador.'
    };
  }

  if (/command not found|not found in the path|is not recognized as an internal or external|spawn .+ enoent|enoent/.test(text)) {
    return {
      title: 'Falta uma ferramenta necessária',
      whatHappened: 'O Glibrary não encontrou um programa necessário para esta ação.',
      nextStep: 'Abra Ferramentas para verificar o que está instalado.',
      action: { label: 'Abrir Ferramentas', target: 'tools' }
    };
  }

  if (/enotfound|econnrefused|econnreset|enetunreach|etimedout|timeout|network error|fetch failed|could not resolve host|unable to access/.test(text)) {
    return {
      title: 'Não foi possível conectar',
      whatHappened: 'A conexão com o GitHub ou com outro serviço não foi concluída.',
      nextStep: 'Confira sua conexão com a internet e tente novamente.'
    };
  }

  return {
    title: 'Não foi possível concluir esta ação',
    whatHappened: 'O Glibrary encontrou um erro inesperado.',
    nextStep: 'Tente novamente. Se o problema continuar, consulte os detalhes técnicos.'
  };
}

/** Converte erros comuns em instruções curtas e remove credenciais dos detalhes. */
export function translateError(error: unknown): IpcError {
  const technicalDetails = safeTechnicalDetails(error);
  const translated = translateMessage(technicalDetails);
  return {
    title: translated.title,
    whatHappened: translated.whatHappened,
    nextStep: translated.nextStep,
    technicalDetails,
    ...(translated.action != null ? { action: translated.action } : {})
  };
}
