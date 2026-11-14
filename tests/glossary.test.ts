import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '../src/shared/glossary';
import Termo from '../src/renderer/src/components/Termo';

const requiredTerms = [
  'skill', 'agent', 'base', 'collection', 'project', 'repository', 'branch', 'commit', 'push', 'pull', 'clone',
  'remote', 'token', 'cli', 'inputTokens', 'outputTokens', 'tokens', 'cache', 'workspace'
] as const;

describe('glossário de linguagem simples', () => {
  it('cobre os termos que aparecem nas jornadas do app', () => {
    expect(Object.keys(GLOSSARY)).toEqual(expect.arrayContaining([...requiredTerms]));
  });

  it('oferece nome simples, termo técnico e até duas frases para cada conceito', () => {
    for (const term of Object.values(GLOSSARY)) {
      expect(term.simpleName.trim()).not.toBe('');
      expect(term.technicalName.trim()).not.toBe('');
      expect(term.explanation.trim()).not.toBe('');
      const sentences = term.explanation.split(/[.!?]+/).filter(Boolean);
      expect(sentences.length).toBeGreaterThan(0);
      expect(sentences.length).toBeLessThanOrEqual(2);
    }
  });

  it('liga o rótulo do termo à dica acessível por teclado', () => {
    const markup = renderToStaticMarkup(createElement(Termo, { id: 'commit', showTechnical: true }));
    expect(markup).toContain('Salvar uma versão (commit)');
    expect(markup).toContain('aria-label="Explicação sobre commit"');
    expect(markup).toContain('aria-describedby=');
    expect(markup).toContain('role="tooltip"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
