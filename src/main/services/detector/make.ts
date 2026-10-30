import type { DetectionPartial } from '../../../shared/types';
import { readText } from './fs-utils';
import type { DetectorContext } from './types';

const START_TARGETS = ['run', 'dev', 'start'];

export function makeTargets(content: string): Set<string> {
  const targets = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_.-]+):(?!=)/.exec(line);
    if (m != null) targets.add(m[1]);
  }
  return targets;
}

export async function detectMake({ root }: DetectorContext): Promise<DetectionPartial | null> {
  const content = await readText(root, 'Makefile');
  if (content == null) return null;
  const targets = makeTargets(content);

  const installCandidates = targets.has('install') ? [{ command: 'make install' }] : [];
  const startCandidates = START_TARGETS.filter((t) => targets.has(t)).map((t) => ({
    command: `make ${t}`
  }));

  return {
    kinds: ['make'],
    installCandidates,
    startCandidates,
    requiredTools: ['make']
  };
}
