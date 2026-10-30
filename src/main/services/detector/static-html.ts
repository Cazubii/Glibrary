import type { DetectionPartial } from '../../../shared/types';
import { fileExists } from './fs-utils';
import type { DetectorContext } from './types';

export async function detectStaticHtml({
  root
}: DetectorContext): Promise<DetectionPartial | null> {
  if (!(await fileExists(root, 'index.html'))) return null;
  return {
    kinds: ['static'],
    installCandidates: [],
    startCandidates: [{ command: 'npx serve .' }],
    requiredTools: ['node']
  };
}
