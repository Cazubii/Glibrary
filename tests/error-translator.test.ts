import { describe, expect, it } from 'vitest';
import { IpcErrorSchema } from '../src/shared/schemas';
import { translateError } from '../src/main/services/error-translator';
import { unwrap } from '../src/renderer/src/lib/api';

const samples = [
  {
    label: 'authentication failure',
    message: 'GitHub API: HTTP 401 Bad credentials',
    title: 'A conexão com o GitHub precisa ser renovada',
    nextStep: 'Abra Projetos e conecte sua conta novamente.'
  },
  {
    label: 'expired token',
    message: 'The GitHub token has expired',
    title: 'A conexão com o GitHub precisa ser renovada'
  },
  {
    label: 'expired GitHub App refresh token',
    message: 'Sua sessão do GitHub expirou. Entre novamente para continuar.',
    title: 'A conexão com o GitHub precisa ser renovada',
    nextStep: 'Abra Projetos e conecte sua conta novamente.'
  },
  {
    label: 'GitHub App not configured',
    message: 'A entrada rápida do GitHub depende da configuração OAuth do aplicativo.',
    title: 'A entrada rápida do GitHub ainda não está disponível'
  },
  {
    label: 'GitHub Device Flow disabled',
    message: 'O login simplificado não está habilitado na configuração do GitHub App.',
    title: 'A entrada rápida do GitHub ainda não está disponível'
  },
  {
    label: 'merge conflict',
    message: 'error: Pulling is not possible because you have unmerged files.',
    title: 'Há mudanças que não podem ser combinadas automaticamente'
  },
  {
    label: 'permission denied',
    message: 'remote: Permission to example/project.git denied to user.',
    title: 'A conta não tem permissão para concluir esta ação'
  },
  {
    label: 'destination folder exists',
    message: "fatal: destination path 'demo-app' already exists and is not an empty directory.",
    title: 'A pasta de destino já existe'
  },
  {
    label: 'missing CLI on PATH',
    message: 'Error: spawn claude ENOENT',
    title: 'Falta uma ferramenta necessária',
    action: { label: 'Abrir Ferramentas', target: 'tools' }
  },
  {
    label: 'network failure',
    message: "fatal: unable to access 'https://github.com/example/project.git/': Could not resolve host: github.com",
    title: 'Não foi possível conectar'
  },
  {
    label: 'GitHub API rate limit',
    message: 'GitHub API: API rate limit exceeded for 192.0.2.1.',
    title: 'O GitHub limitou novas consultas'
  }
] as const;

describe('translateError', () => {
  it.each(samples)('translates $label into a structured recovery message', (sample) => {
    const result = translateError(new Error(sample.message));
    expect(result.title).toBe(sample.title);
    expect(result.whatHappened).not.toBe('');
    expect(result.nextStep).not.toBe('');
    expect(result.technicalDetails).toBe(sample.message);
    expect(IpcErrorSchema.safeParse(result).success).toBe(true);
    if ('nextStep' in sample) expect(result.nextStep).toBe(sample.nextStep);
    if ('action' in sample) expect(result.action).toEqual(sample.action);
  });

  it('keeps technical fallback details and removes credentials', () => {
    const result = translateError(new Error('fatal: authentication failed for https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz123456@github.com/example/repo.git'));
    expect(result.title).toBe('A conexão com o GitHub precisa ser renovada');
    expect(result.technicalDetails).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(result.technicalDetails).toContain('https://***@github.com');

    const refresh = translateError(new Error('bad_refresh_token ghr_abcdefghijklmnopqrstuvwxyz123456'));
    expect(refresh.technicalDetails).not.toContain('ghr_abcdefghijklmnopqrstuvwxyz123456');
  });

  it('gives an honest generic recovery step for unknown errors', () => {
    const result = translateError(new Error('Unexpected parser state'));
    expect(result.title).toBe('Não foi possível concluir esta ação');
    expect(result.technicalDetails).toBe('Unexpected parser state');
    expect(result.action).toBeUndefined();
  });

  it('preserves structured errors in the renderer while accepting legacy strings', async () => {
    const structured = translateError(new Error('GitHub API: HTTP 401'));
    await expect(unwrap(Promise.resolve({ ok: false, error: structured }))).rejects.toMatchObject({
      name: 'GlibraryApiError',
      presentation: structured
    });
    await expect(unwrap(Promise.resolve({ ok: false, error: 'legacy error' }))).rejects.toThrow('legacy error');
  });
});
