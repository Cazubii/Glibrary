import type { CommandSpec, DetectionPartial, DetectionResult } from '../../../shared/types';
import { dirExists, fileExists } from './fs-utils';
import { detectNode } from './node';
import { detectPython } from './python';
import { detectDocker } from './docker';
import { detectRust } from './rust';
import { detectGo } from './go';
import { detectDotnet } from './dotnet';
import { detectJava } from './java';
import { detectMake } from './make';
import { detectStaticHtml } from './static-html';
import { extractReadmeCommands } from './readme';
import type { Detector, DetectorContext } from './types';

export type { DetectorContext } from './types';

const DETECTORS: Detector[] = [
  detectNode,
  detectPython,
  detectDocker,
  detectRust,
  detectGo,
  detectDotnet,
  detectJava,
  detectMake
];

/**
 * Roda todos os detectores e junta o resultado (seção 6).
 * Detectores só leem arquivos, nunca executam nada.
 * `static` só entra se nenhum outro tipo foi detectado.
 */
export async function detectProject(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<DetectionResult> {
  const ctx: DetectorContext = { root, platform };

  const partials: DetectionPartial[] = [];
  for (const detector of DETECTORS) {
    const partial = await detector(ctx);
    if (partial != null) partials.push(partial);
  }
  if (partials.length === 0) {
    const staticResult = await detectStaticHtml(ctx);
    if (staticResult != null) partials.push(staticResult);
  }

  const kinds: DetectionResult['kinds'] = [];
  const installCandidates: CommandSpec[] = [];
  const startCandidates: CommandSpec[] = [];
  const requiredTools: string[] = [];
  let packageManager: DetectionResult['packageManager'];
  let detectedPort: number | undefined;
  let isMonorepo = false;

  for (const partial of partials) {
    for (const kind of partial.kinds) {
      if (!kinds.includes(kind)) kinds.push(kind);
    }
    installCandidates.push(...(partial.installCandidates ?? []));
    startCandidates.push(...(partial.startCandidates ?? []));
    for (const tool of partial.requiredTools ?? []) {
      if (!requiredTools.includes(tool)) requiredTools.push(tool);
    }
    if (packageManager == null && partial.packageManager != null) {
      packageManager = partial.packageManager;
    }
    if (detectedPort == null && partial.detectedPort != null) {
      detectedPort = partial.detectedPort;
    }
    if (partial.isMonorepo === true) isMonorepo = true;
  }

  const hasEnvExample =
    (await fileExists(root, '.env.example')) && !(await fileExists(root, '.env'));

  const readmeCommands = await extractReadmeCommands(root);

  return {
    kinds,
    packageManager,
    installCandidates,
    startCandidates,
    requiredTools,
    hasEnvExample,
    detectedPort,
    isMonorepo: isMonorepo || undefined,
    readmeCommands: readmeCommands.length > 0 ? readmeCommands : undefined
  };
}

export async function hasVenv(root: string): Promise<boolean> {
  return (await dirExists(root, '.venv')) || (await dirExists(root, 'venv'));
}
