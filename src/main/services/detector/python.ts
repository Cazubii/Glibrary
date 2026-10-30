import type { CommandSpec, DetectionPartial } from '../../../shared/types';
import { dirExists, fileExists, readText } from './fs-utils';
import type { DetectorContext } from './types';

type PythonPm = 'pip' | 'poetry' | 'uv' | 'pipenv';

function venvPip(platform: NodeJS.Platform): string {
  return platform === 'win32' ? '.venv\\Scripts\\pip' : '.venv/bin/pip';
}

function venvPython(platform: NodeJS.Platform): string {
  return platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python';
}

export async function detectPython({ root, platform }: DetectorContext): Promise<DetectionPartial | null> {
  const hasPyproject = await fileExists(root, 'pyproject.toml');
  const hasRequirements = await fileExists(root, 'requirements.txt');
  const hasPipfile = await fileExists(root, 'Pipfile');
  const hasSetupPy = await fileExists(root, 'setup.py');
  if (!hasPyproject && !hasRequirements && !hasPipfile && !hasSetupPy) return null;

  let packageManager: PythonPm = 'pip';
  if (await fileExists(root, 'uv.lock')) packageManager = 'uv';
  else if (await fileExists(root, 'poetry.lock')) packageManager = 'poetry';
  else if (hasPipfile) packageManager = 'pipenv';

  const installCandidates: CommandSpec[] = [];
  switch (packageManager) {
    case 'uv':
      installCandidates.push({ command: 'uv sync' });
      break;
    case 'poetry':
      installCandidates.push({ command: 'poetry install' });
      break;
    case 'pipenv':
      installCandidates.push({ command: 'pipenv install' });
      break;
    case 'pip':
      installCandidates.push({
        command: `python -m venv .venv && ${venvPip(platform)} install ${hasRequirements ? '-r requirements.txt' : '-e .'}`
      });
      break;
  }

  const hasVenv = (await dirExists(root, '.venv')) || (await dirExists(root, 'venv'));
  const py = hasVenv ? venvPython(platform) : 'python';

  const startCandidates: CommandSpec[] = [];
  if (await fileExists(root, 'manage.py')) {
    startCandidates.push({ command: `${py} manage.py runserver` });
  }
  for (const entry of ['app.py', 'main.py']) {
    if (await fileExists(root, entry)) {
      startCandidates.push({ command: `${py} ${entry}` });
    }
  }

  if (hasPyproject) {
    const pyproject = (await readText(root, 'pyproject.toml')) ?? '';
    const scripts = pyproject.match(
      /\[project\.scripts\]([\s\S]*?)(\n\[|$)/,
    )?.[1];
    if (scripts != null) {
      const names = [...scripts.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gm)].map((m) => m[1]);
      for (const name of names.slice(0, 3)) {
        const runPrefix = packageManager === 'poetry' || packageManager === 'uv'
          ? `${packageManager} run `
          : '';
        startCandidates.push({ command: `${runPrefix}${name}` });
      }
    }
  }

  const requirements = (await readText(root, 'requirements.txt')) ?? '';
  if (/(^|\n)\s*streamlit(\s|[<>=~!]|$)/.test(requirements)) {
    for (const entry of ['app.py', 'streamlit_app.py', 'main.py']) {
      if (await fileExists(root, entry)) {
        startCandidates.push({ command: `streamlit run ${entry}` });
      }
    }
  }

  const requiredTools = ['python', packageManager === 'pipenv' ? 'pip' : packageManager];

  return {
    kinds: ['python'],
    packageManager,
    installCandidates,
    startCandidates,
    requiredTools
  };
}
