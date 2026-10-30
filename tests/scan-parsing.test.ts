import { describe, it, expect } from 'vitest';
import { parseImportItems, parseFolders } from '../src/main/ipc/scan-parsing';

describe('parseImportItems', () => {
  it('aceita array direto (formato enviado pelo renderer)', () => {
    const items = parseImportItems([
      { localPath: 'C:/dev/proj', remoteUrl: 'https://github.com/a/b', branch: 'main' }
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      localPath: 'C:/dev/proj',
      remoteUrl: 'https://github.com/a/b',
      branch: 'main'
    });
  });

  it('aceita o envelope { items: [...] }', () => {
    const items = parseImportItems({ items: [{ localPath: 'C:/dev/proj' }] });
    expect(items).toHaveLength(1);
    expect(items[0]?.localPath).toBe('C:/dev/proj');
    expect(items[0]?.remoteUrl).toBeUndefined();
  });

  it('descarta itens inválidos mas preserva os válidos', () => {
    const items = parseImportItems([
      { localPath: 'C:/ok' },
      null,
      { localPath: 123 },
      'nope',
      { localPath: 'C:/ok2', remoteUrl: 42 }
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.localPath)).toEqual(['C:/ok', 'C:/ok2']);
  });

  it('retorna vazio para entradas sem items', () => {
    expect(parseImportItems(undefined)).toEqual([]);
    expect(parseImportItems(null)).toEqual([]);
    expect(parseImportItems({ items: 'nope' })).toEqual([]);
    expect(parseImportItems({})).toEqual([]);
    expect(parseImportItems(42)).toEqual([]);
  });
});

describe('parseFolders', () => {
  it('usa o fallback quando não há folders válidos', () => {
    expect(parseFolders({}, ['a'])).toEqual(['a']);
    expect(parseFolders(undefined, ['a'])).toEqual(['a']);
    expect(parseFolders('nope', ['a'])).toEqual(['a']);
  });

  it('extrai strings não vazias', () => {
    expect(parseFolders({ folders: ['x', '  ', 'y', 7] }, ['a'])).toEqual(['x', 'y']);
    expect(parseFolders({ folders: [1, ''] }, ['a'])).toEqual([]);
  });
});
