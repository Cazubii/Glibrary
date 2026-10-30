import type { DetectionPartial } from '../../../shared/types';
import { fileExists } from './fs-utils';
import type { DetectorContext } from './types';

export async function detectDocker({ root }: DetectorContext): Promise<DetectionPartial | null> {
  const hasCompose =
    (await fileExists(root, 'docker-compose.yml')) ||
    (await fileExists(root, 'docker-compose.yaml')) ||
    (await fileExists(root, 'compose.yaml')) ||
    (await fileExists(root, 'compose.yml'));
  const hasDockerfile = await fileExists(root, 'Dockerfile');
  if (!hasCompose && !hasDockerfile) return null;

  return {
    kinds: ['docker'],
    installCandidates: [{ command: 'docker compose build' }],
    startCandidates: [{ command: 'docker compose up' }],
    requiredTools: ['docker']
  };
}
