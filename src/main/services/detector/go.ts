import type { DetectionPartial } from '../../../shared/types';
import { fileExists } from './fs-utils';
import type { DetectorContext } from './types';

export async function detectGo({ root }: DetectorContext): Promise<DetectionPartial | null> {
  if (!(await fileExists(root, 'go.mod'))) return null;
  return {
    kinds: ['go'],
    packageManager: 'go',
    installCandidates: [{ command: 'go mod download' }],
    startCandidates: [{ command: 'go run .' }],
    requiredTools: ['go']
  };
}
