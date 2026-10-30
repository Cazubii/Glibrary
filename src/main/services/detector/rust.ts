import type { DetectionPartial } from '../../../shared/types';
import { fileExists } from './fs-utils';
import type { DetectorContext } from './types';

export async function detectRust({ root }: DetectorContext): Promise<DetectionPartial | null> {
  if (!(await fileExists(root, 'Cargo.toml'))) return null;
  return {
    kinds: ['rust'],
    packageManager: 'cargo',
    installCandidates: [{ command: 'cargo build' }],
    startCandidates: [{ command: 'cargo run' }],
    requiredTools: ['cargo']
  };
}
