import type { DetectionResult, Repo } from '../../../shared/types';

/**
 * Seção 6: a detecção nunca sobrescreve installCommand/startCommand que o
 * usuário editou (flag `commandsEditedByUser`).
 */
export function applyDetection(repo: Repo, detection: DetectionResult): Repo {
  const merged: Repo = { ...repo, detection };

  if (repo.commandsEditedByUser !== true) {
    const install = detection.installCandidates[0];
    const start = detection.startCandidates[0];
    if (install != null) merged.installCommand = install;
    if (start != null) merged.startCommand = start;
  }

  return merged;
}
