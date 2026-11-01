import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  tagKey,
  sameTag,
  normalizeTagList,
  matchesTags,
  countTags
} from '../src/shared/tags';

describe('normalizeTag', () => {
  it('remove espaços das bordas e colapsa espaços internos', () => {
    expect(normalizeTag('  docs   de  produto ')).toBe('docs de produto');
  });

  it('devolve null para vazio ou só espaços', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
  });

  it('colapsa tabulações em espaço único', () => {
    expect(normalizeTag('a\tb')).toBe('a b');
  });
});

describe('tagKey e sameTag', () => {
  it('compara sem diferenciar maiúsculas e ignora espaços externos', () => {
    expect(sameTag('Docs', 'docs')).toBe(true);
    expect(sameTag(' docs ', 'DOCS')).toBe(true);
    expect(sameTag('docs', 'deploy')).toBe(false);
    expect(tagKey(' Docs ')).toBe('docs');
  });

  it('considera espaços internos múltiplos equivalentes', () => {
    expect(sameTag('docs  de', 'docs de')).toBe(true);
    expect(tagKey('  a \t b ')).toBe('a b');
  });
});

describe('normalizeTagList', () => {
  it('normaliza, remove vazios e deduplica preservando a primeira grafia', () => {
    expect(normalizeTagList([' Docs ', 'docs', 'Deploy', '  ', 'deploy'])).toEqual(['Docs', 'Deploy']);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(normalizeTagList([])).toEqual([]);
  });
});

describe('matchesTags', () => {
  it('exige todas as tags selecionadas (E), sem diferenciar maiúsculas', () => {
    expect(matchesTags(['Docs', 'deploy'], ['docs', 'deploy'])).toBe(true);
    expect(matchesTags(['Docs'], ['docs', 'deploy'])).toBe(false);
    expect(matchesTags(['Docs'], [])).toBe(true);
  });
});

describe('countTags', () => {
  it('conta itens por tag, deduplica por item e ordena por contagem e chave', () => {
    const counts = countTags([
      { tags: ['Docs', 'deploy'] },
      { tags: ['docs'] },
      { tags: ['deploy', 'Deploy'] }
    ]);
    expect(counts).toEqual([
      { name: 'deploy', count: 2 },
      { name: 'Docs', count: 2 }
    ]);
  });

  it('ignora tags vazias', () => {
    expect(countTags([{ tags: ['  ', 'docs'] }])).toEqual([{ name: 'docs', count: 1 }]);
  });

  it('devolve lista vazia para lista sem itens', () => {
    expect(countTags([])).toEqual([]);
  });
});
