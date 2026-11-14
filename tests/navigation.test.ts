import { describe, expect, it } from 'vitest';
import { getAreaSections, PRIMARY_AREAS } from '../src/renderer/src/navigation';

describe('navegação principal', () => {
  it('apresenta as cinco áreas por intenção na ordem definida', () => {
    expect(PRIMARY_AREAS.map((area) => area.label)).toEqual([
      'Início',
      'Projetos',
      'Biblioteca',
      'Descobrir',
      'Agentes'
    ]);
  });

  it('mantém ferramentas básicas acessíveis no modo simples', () => {
    expect(getAreaSections('projects', false).map((section) => section.id)).toEqual([
      'local-projects',
      'github-projects'
    ]);
    expect(getAreaSections('library', false).map((section) => section.id)).toEqual(['resources']);
    expect(getAreaSections('discover', false).map((section) => section.id)).toEqual([
      'github-search',
      'top-repos'
    ]);
    expect(getAreaSections('agents', false).map((section) => section.id)).toEqual(['agent-runs']);
  });

  it('recupera as funções avançadas no modo avançado', () => {
    expect(getAreaSections('library', true).map((section) => section.id)).toContain('collections');
    expect(getAreaSections('discover', true).map((section) => section.id)).toContain('repo-analysis');
    expect(getAreaSections('agents', true).map((section) => section.id)).toContain('consumption');
  });
});
