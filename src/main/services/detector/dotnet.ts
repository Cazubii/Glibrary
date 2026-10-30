import type { DetectionPartial } from '../../../shared/types';
import { listNames } from './fs-utils';
import type { DetectorContext } from './types';

export async function detectDotnet({ root }: DetectorContext): Promise<DetectionPartial | null> {
  const names = await listNames(root);
  const hasProject =
    names.some((n) => n.endsWith('.sln')) || names.some((n) => n.endsWith('.csproj'));
  if (!hasProject) return null;
  return {
    kinds: ['dotnet'],
    packageManager: 'dotnet',
    installCandidates: [{ command: 'dotnet restore' }],
    startCandidates: [{ command: 'dotnet run' }],
    requiredTools: ['dotnet']
  };
}
