import { describe, it, expect } from 'vitest';
import { applyDetection } from '../src/main/services/detector/apply';
import type { DetectionResult, Repo } from '../src/shared/types';

const detection: DetectionResult = {
  kinds: ['node'],
  packageManager: 'npm',
  installCandidates: [{ command: 'npm install' }],
  startCandidates: [{ command: 'npm run dev' }],
  requiredTools: ['node', 'npm'],
  hasEnvExample: false
};

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'r1',
    name: 'demo',
    status: 'cloned',
    tags: [],
    favorite: false,
    addedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('applyDetection', () => {
  it('preenche comandos sugeridos quando o usuário não editou', () => {
    const repo = applyDetection(makeRepo(), detection);
    expect(repo.installCommand).toEqual({ command: 'npm install' });
    expect(repo.startCommand).toEqual({ command: 'npm run dev' });
    expect(repo.detection).toEqual(detection);
  });

  it('NÃO sobrescreve comandos editados pelo usuário (re-detecção)', () => {
    const edited = makeRepo({
      installCommand: { command: 'npm ci' },
      startCommand: { command: 'npm run dev -- --port 3000' },
      commandsEditedByUser: true
    });
    const repo = applyDetection(edited, detection);
    expect(repo.installCommand).toEqual({ command: 'npm ci' });
    expect(repo.startCommand).toEqual({ command: 'npm run dev -- --port 3000' });
    expect(repo.detection).toEqual(detection);
  });

  it('atualiza a detecção mesmo quando comandos foram editados', () => {
    const edited = makeRepo({ commandsEditedByUser: true });
    const newDetection: DetectionResult = { ...detection, detectedPort: 5173 };
    const repo = applyDetection(edited, newDetection);
    expect(repo.detection?.detectedPort).toBe(5173);
  });
});
