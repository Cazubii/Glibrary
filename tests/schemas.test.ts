import { describe, it, expect } from 'vitest';
import {
  AppUpdateStateSchema,
  SkillUpdateInputSchema,
  BaseUpdateInputSchema,
  ProjectUpdateInputSchema,
  RepoGitPrepareInputSchema,
  RepoPublishInputSchema,
  RepoPushInputSchema,
  TagRenameInputSchema,
  TagNameInputSchema
} from '../src/shared/schemas';

describe('AppUpdateStateSchema', () => {
  it('valida o estado e o progresso da atualização antes de exibi-los', () => {
    expect(AppUpdateStateSchema.parse({ status: 'downloading', currentVersion: '0.1.0', percent: 44 })).toEqual({
      status: 'downloading',
      currentVersion: '0.1.0',
      percent: 44
    });
    expect(() => AppUpdateStateSchema.parse({ status: 'downloading', currentVersion: '0.1.0', percent: 120 })).toThrow();
  });
});

describe('SkillUpdateInputSchema', () => {
  it('aceita patch com tags e favorite', () => {
    const parsed = SkillUpdateInputSchema.parse({
      id: 's1',
      patch: { tags: ['docs'], favorite: true }
    });
    expect(parsed).toEqual({ id: 's1', patch: { tags: ['docs'], favorite: true } });
  });

  it('aceita patch vazio', () => {
    expect(SkillUpdateInputSchema.parse({ id: 's1', patch: {} })).toEqual({ id: 's1', patch: {} });
  });

  it('rejeita chave desconhecida no patch', () => {
    expect(() => SkillUpdateInputSchema.parse({ id: 's1', patch: { name: 'x' } })).toThrow();
  });
});

describe('BaseUpdateInputSchema', () => {
  it('aceita nome, descrição, tags e favorite', () => {
    const parsed = BaseUpdateInputSchema.parse({
      id: 'b1',
      patch: { name: 'starter', description: 'd', tags: ['x'], favorite: false }
    });
    expect(parsed.patch.name).toBe('starter');
    expect(parsed.patch.favorite).toBe(false);
  });

  it('rejeita nome de base inválido', () => {
    expect(() => BaseUpdateInputSchema.parse({ id: 'b1', patch: { name: '..' } })).toThrow();
    expect(() => BaseUpdateInputSchema.parse({ id: 'b1', patch: { name: 'a/b' } })).toThrow();
    expect(() => BaseUpdateInputSchema.parse({ id: 'b1', patch: { name: 'con' } })).toThrow();
  });

  it('normaliza espaços do nome', () => {
    expect(BaseUpdateInputSchema.parse({ id: 'b1', patch: { name: ' starter ' } }).patch.name).toBe('starter');
  });
});

describe('ProjectUpdateInputSchema', () => {
  it('aceita tags e favorite além dos campos existentes', () => {
    const parsed = ProjectUpdateInputSchema.parse({
      id: 'p1',
      tags: ['docs'],
      favorite: true,
      skillIds: ['s1'],
      baseIds: [],
      notes: 'ok'
    });
    expect(parsed.tags).toEqual(['docs']);
    expect(parsed.favorite).toBe(true);
    expect(parsed.skillIds).toEqual(['s1']);
  });

  it('rejeita campo desconhecido', () => {
    expect(() => ProjectUpdateInputSchema.parse({ id: 'p1', patch: {} })).toThrow();
  });
});

describe('TagRenameInputSchema e TagNameInputSchema', () => {
  it('exige from e to não vazios', () => {
    expect(TagRenameInputSchema.parse({ from: 'docs', to: 'documentação' })).toEqual({
      from: 'docs',
      to: 'documentação'
    });
    expect(() => TagRenameInputSchema.parse({ from: '', to: 'x' })).toThrow();
    expect(() => TagRenameInputSchema.parse({ from: 'x' })).toThrow();
  });

  it('exige name não vazio', () => {
    expect(TagNameInputSchema.parse({ name: 'docs' })).toEqual({ name: 'docs' });
    expect(() => TagNameInputSchema.parse({ name: '' })).toThrow();
    expect(() => TagNameInputSchema.parse({})).toThrow();
  });
});

describe('schemas de publicação do projeto', () => {
  it('aceita identidade local opcional e exige email válido quando fornecida', () => {
    expect(RepoGitPrepareInputSchema.parse({ id: 'repo-1' })).toEqual({ id: 'repo-1' });
    expect(RepoGitPrepareInputSchema.parse({ id: 'repo-1', identity: { name: ' Ada ', email: 'ada@example.test' } })).toEqual({
      id: 'repo-1', identity: { name: 'Ada', email: 'ada@example.test' }
    });
    expect(() => RepoGitPrepareInputSchema.parse({ id: 'repo-1', identity: { name: 'Ada', email: 'inválido' } })).toThrow();
  });

  it('normaliza nome e exige visibilidade e confirmação booleanas para publicar', () => {
    expect(RepoPublishInputSchema.parse({ id: 'repo-1', name: ' meu-site ', visibility: 'private' })).toEqual({
      id: 'repo-1', name: 'meu-site', visibility: 'private', confirmProtectedBranch: false
    });
    expect(RepoPublishInputSchema.parse({ id: 'repo-1', name: 'site', visibility: 'public', confirmProtectedBranch: true }).confirmProtectedBranch).toBe(true);
    expect(() => RepoPublishInputSchema.parse({ id: 'repo-1', name: '../fora', visibility: 'private' })).toThrow();
    expect(() => RepoPublishInputSchema.parse({ id: 'repo-1', name: 'site', visibility: 'private', extra: true })).toThrow();
  });

  it('mantém validação estrita para push e ramos protegidos', () => {
    expect(RepoPushInputSchema.parse({ id: 'repo-1' })).toEqual({ id: 'repo-1', confirmProtectedBranch: false });
    expect(() => RepoPushInputSchema.parse({ id: 'repo-1', confirmProtectedBranch: 'sim' })).toThrow();
  });
});
