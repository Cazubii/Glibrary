import { describe, expect, it } from 'vitest';
import type { StatusResult } from 'simple-git';
import {
  githubAuthHeader,
  isGithubRemote,
  sanitizeGitOutput,
  summarizeStatus
} from '../src/main/services/git-service';
import { parseGithubUser } from '../src/main/services/github-api';

function fakeStatus(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    current: 'main',
    tracking: 'origin/main',
    ahead: 0,
    behind: 0,
    isClean: () => false,
    pushing: [],
    files: [],
    created: [],
    deleted: [],
    modified: [],
    not_added: [],
    conflicting: [],
    conflicted: [],
    renamed: [],
    staged: [],
    detached: false,
    commits: [],
    ...overrides
  } as unknown as StatusResult;
}

describe('summarizeStatus', () => {
  it('classifica arquivo apenas no índice como staged', () => {
    const result = summarizeStatus(
      fakeStatus({
        files: [
          { path: 'a.txt', index: 'A', working_dir: ' ' },
          { path: 'b.txt', index: 'M', working_dir: ' ' },
          { path: 'c.txt', index: ' ', working_dir: 'M' },
          { path: 'd.txt', index: ' ', working_dir: '?' }
        ]
      } as Partial<StatusResult> as StatusResult)
    );
    expect(result.files.map((f) => f.state)).toEqual(['staged', 'staged', 'modified', 'untracked']);
    expect(result.branch).toBe('main');
    expect(result.ahead).toBe(0);
  });

  it('informações de branch ausentes viram null/0', () => {
    const result = summarizeStatus(fakeStatus({ current: undefined, ahead: undefined, behind: undefined }));
    expect(result.branch).toBeNull();
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });
});

describe('sanitizeGitOutput', () => {
  it('mascara token em URL x-access-token e ghp_', () => {
    const msg = sanitizeGitOutput(
      'fatal: unable to access https://x-access-token:ghp_SECRETO1234567890abcdef@github.com/o/r.git/'
    );
    expect(msg).not.toContain('ghp_SECRETO1234567890abcdef');
    expect(msg).toContain('://***@github.com');
  });

  it('mascara senha em URL básica user:senha', () => {
    expect(sanitizeGitOutput('https://user:minhasenha@host/repo.git')).toContain('://***@');
  });
});

describe('isGithubRemote / githubAuthHeader', () => {
  it('detecta github https e ssh', () => {
    expect(isGithubRemote('https://github.com/o/r.git')).toBe(true);
    expect(isGithubRemote('git@github.com:o/r.git')).toBe(true);
    expect(isGithubRemote('https://gitlab.com/o/r.git')).toBe(false);
  });

  it('header usa credencial basic x-access-token', () => {
    const header = githubAuthHeader('tok123');
    expect(header.startsWith('Authorization: basic ')).toBe(true);
    expect(Buffer.from(header.split(' ')[2] ?? '', 'base64').toString()).toBe('x-access-token:tok123');
  });
});

describe('parseGithubUser', () => {
  it('extrai login, name, email e avatar', () => {
    const user = parseGithubUser({
      login: 'octocat',
      name: 'Octo Cat',
      email: 'o@cat.dev',
      avatar_url: 'https://avatar',
      extra: 'ignored'
    });
    expect(user).toEqual({
      login: 'octocat',
      name: 'Octo Cat',
      email: 'o@cat.dev',
      avatarUrl: 'https://avatar'
    });
  });

  it('campos opcionais ficam ausentes', () => {
    const user = parseGithubUser({ login: 'octo', email: null });
    expect(user.name).toBeUndefined();
    expect(user.email).toBeUndefined();
    expect(user.avatarUrl).toBeUndefined();
  });

  it('lança quando resposta não é um usuário', () => {
    expect(() => parseGithubUser({ message: 'Bad credentials' })).toThrow();
    expect(() => parseGithubUser(null)).toThrow();
  });
});
