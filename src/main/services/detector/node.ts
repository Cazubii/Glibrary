import type { CommandSpec, DetectionPartial } from '../../../shared/types';
import { fileExists, readJson } from './fs-utils';
import type { DetectorContext } from './types';

const PORT_BY_PACKAGE: Record<string, number> = {
  vite: 5173,
  next: 3000,
  'react-scripts': 3000,
  nuxt: 3000,
  astro: 4321
};

const START_SCRIPT_ORDER = ['dev', 'start', 'serve', 'preview'];

export async function detectNode({ root }: DetectorContext): Promise<DetectionPartial | null> {
  const pkg = await readJson(root, 'package.json');
  if (pkg == null) return null;

  let packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' = 'npm';
  if (await fileExists(root, 'pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (await fileExists(root, 'yarn.lock')) packageManager = 'yarn';
  else if ((await fileExists(root, 'bun.lockb')) || (await fileExists(root, 'bun.lock')))
    packageManager = 'bun';

  const scripts = pkg['scripts'];
  const scriptNames =
    scripts != null && typeof scripts === 'object' ? Object.keys(scripts) : [];

  const startCandidates: CommandSpec[] = [];
  for (const name of START_SCRIPT_ORDER) {
    if (scriptNames.includes(name)) {
      startCandidates.push({ command: `${packageManager} run ${name}` });
    }
  }

  const deps: Record<string, unknown> = {
    ...((pkg['dependencies'] as Record<string, unknown> | undefined) ?? {}),
    ...((pkg['devDependencies'] as Record<string, unknown> | undefined) ?? {})
  };
  let detectedPort: number | undefined;
  for (const [name, port] of Object.entries(PORT_BY_PACKAGE)) {
    if (name in deps) {
      detectedPort = port;
      break;
    }
  }

  const isMonorepo =
    pkg['workspaces'] != null || (await fileExists(root, 'pnpm-workspace.yaml'));

  return {
    kinds: ['node'],
    packageManager,
    installCandidates: [{ command: `${packageManager} install` }],
    startCandidates,
    requiredTools: ['node', packageManager],
    detectedPort,
    isMonorepo
  };
}
