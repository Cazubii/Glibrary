import { describe, it, expect } from 'vitest';
import {
  normalizeGitUrl,
  isValidGitUrl,
  parseGithubRepo,
  normalizeLocalPath
} from '../src/shared/git-utils';

describe('normalizeGitUrl', () => {
  it('iguala SSH e HTTPS do mesmo repo', () => {
    expect(normalizeGitUrl('git@github.com:Excalidraw/excalidraw.git')).toBe(
      normalizeGitUrl('https://github.com/excalidraw/excalidraw'),
    );
  });

  it('remove .git e barras finais', () => {
    expect(normalizeGitUrl('https://github.com/a/b.git/')).toBe('https://github.com/a/b');
  });

  it('converte para minúsculo', () => {
    expect(normalizeGitUrl('https://GitHub.com/A/B')).toBe('https://github.com/a/b');
  });

  it('trata ssh:// e git://', () => {
    expect(normalizeGitUrl('ssh://git@github.com/a/b')).toBe('https://github.com/a/b');
    expect(normalizeGitUrl('git://github.com/a/b')).toBe('https://github.com/a/b');
  });
});

describe('isValidGitUrl', () => {
  it('aceita https e git@', () => {
    expect(isValidGitUrl('https://github.com/a/b')).toBe(true);
    expect(isValidGitUrl('git@github.com:a/b.git')).toBe(true);
    expect(isValidGitUrl('ssh://git@github.com/a/b')).toBe(true);
  });

  it('rejeita outros formatos', () => {
    expect(isValidGitUrl('ftp://github.com/a/b')).toBe(false);
    expect(isValidGitUrl('javascript:alert(1)')).toBe(false);
    expect(isValidGitUrl('')).toBe(false);
    expect(isValidGitUrl('rm -rf /')).toBe(false);
  });
});

describe('parseGithubRepo', () => {
  it('extrai owner/repo', () => {
    expect(parseGithubRepo('https://github.com/sindresorhus/is')).toEqual({
      owner: 'sindresorhus',
      repo: 'is',
    });
    expect(parseGithubRepo('git@github.com:sindresorhus/is.git')).toEqual({
      owner: 'sindresorhus',
      repo: 'is',
    });
  });

  it('retorna null para não-GitHub', () => {
    expect(parseGithubRepo('https://gitlab.com/a/b')).toBeNull();
    expect(parseGithubRepo('https://github.com/so-owner')).toBeNull();
  });
});

describe('normalizeLocalPath', () => {
  it('no Windows é case-insensitive e usa /', () => {
    expect(normalizeLocalPath('C:\\Users\\Dev\\Proj\\', 'win32')).toBe('c:/users/dev/proj');
  });

  it('no POSIX preserva caixa', () => {
    expect(normalizeLocalPath('/home/Dev/Proj/', 'linux')).toBe('/home/Dev/Proj');
  });
});
