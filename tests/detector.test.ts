import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { detectProject } from '../src/main/services/detector';
import { makeTargets } from '../src/main/services/detector/make';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

function fixture(name: string): string {
  return join(FIXTURES, name);
}

describe('detectProject', () => {
  it('node + npm: detecta package.json, sugere npm install e npm run dev', async () => {
    const r = await detectProject(fixture('node-npm'));
    expect(r.kinds).toEqual(['node']);
    expect(r.packageManager).toBe('npm');
    expect(r.installCandidates[0].command).toBe('npm install');
    expect(r.startCandidates[0].command).toBe('npm run dev');
    expect(r.requiredTools).toContain('node');
    expect(r.detectedPort).toBe(5173);
  });

  it('node + pnpm: lockfile define o gerenciador e start usa pnpm run start', async () => {
    const r = await detectProject(fixture('node-pnpm'));
    expect(r.packageManager).toBe('pnpm');
    expect(r.installCandidates[0].command).toBe('pnpm install');
    expect(r.startCandidates[0].command).toBe('pnpm run start');
  });

  it('node monorepo: workspaces marca isMonorepo', async () => {
    const r = await detectProject(fixture('node-monorepo'));
    expect(r.isMonorepo).toBe(true);
  });

  it('python + pip: cria venv e instala requirements', async () => {
    const r = await detectProject(fixture('python-pip'), 'linux');
    expect(r.kinds).toEqual(['python']);
    expect(r.packageManager).toBe('pip');
    expect(r.installCandidates[0].command).toBe(
      'python -m venv .venv && .venv/bin/pip install -r requirements.txt',
    );
    expect(r.startCandidates.map((c) => c.command)).toContain('python main.py');
    expect(r.requiredTools).toContain('python');
  });

  it('python + pip no Windows usa Scripts', async () => {
    const r = await detectProject(fixture('python-pip'), 'win32');
    expect(r.installCandidates[0].command).toContain('.venv\\Scripts\\pip');
  });

  it('python + poetry: poetry install', async () => {
    const r = await detectProject(fixture('python-poetry'));
    expect(r.packageManager).toBe('poetry');
    expect(r.installCandidates[0].command).toBe('poetry install');
  });

  it('docker: docker compose build/up', async () => {
    const r = await detectProject(fixture('docker-compose'));
    expect(r.kinds).toEqual(['docker']);
    expect(r.installCandidates[0].command).toBe('docker compose build');
    expect(r.startCandidates[0].command).toBe('docker compose up');
    expect(r.requiredTools).toEqual(['docker']);
  });

  it('rust: cargo build/run', async () => {
    const r = await detectProject(fixture('rust'));
    expect(r.kinds).toEqual(['rust']);
    expect(r.installCandidates[0].command).toBe('cargo build');
    expect(r.startCandidates[0].command).toBe('cargo run');
    expect(r.requiredTools).toEqual(['cargo']);
  });

  it('go: go mod download / go run .', async () => {
    const r = await detectProject(fixture('go'));
    expect(r.kinds).toEqual(['go']);
    expect(r.installCandidates[0].command).toBe('go mod download');
    expect(r.startCandidates[0].command).toBe('go run .');
    expect(r.requiredTools).toEqual(['go']);
  });

  it('dotnet: dotnet restore/run a partir de .csproj', async () => {
    const r = await detectProject(fixture('dotnet'));
    expect(r.kinds).toEqual(['dotnet']);
    expect(r.installCandidates[0].command).toBe('dotnet restore');
    expect(r.startCandidates[0].command).toBe('dotnet run');
    expect(r.requiredTools).toEqual(['dotnet']);
  });

  it('java + maven com spring: mvn install / mvn spring-boot:run', async () => {
    const r = await detectProject(fixture('java-maven'));
    expect(r.kinds).toEqual(['java']);
    expect(r.packageManager).toBe('maven');
    expect(r.installCandidates[0].command).toBe('mvn install');
    expect(r.startCandidates[0].command).toBe('mvn spring-boot:run');
    expect(r.requiredTools).toContain('mvn');
  });

  it('java + gradle sem wrapper: gradle build/run', async () => {
    const r = await detectProject(fixture('java-gradle'));
    expect(r.packageManager).toBe('gradle');
    expect(r.installCandidates[0].command).toBe('gradle build');
    expect(r.startCandidates[0].command).toBe('gradle run');
    expect(r.requiredTools).toEqual(['java']);
  });

  it('make: alvos install e run', async () => {
    const r = await detectProject(fixture('make'));
    expect(r.kinds).toEqual(['make']);
    expect(r.installCandidates[0].command).toBe('make install');
    expect(r.startCandidates[0].command).toBe('make run');
    expect(r.requiredTools).toEqual(['make']);
  });

  it('static-html: index.html sem outro tipo vira static com npx serve', async () => {
    const r = await detectProject(fixture('static-html'));
    expect(r.kinds).toEqual(['static']);
    expect(r.startCandidates[0].command).toBe('npx serve .');
    expect(r.installCandidates).toEqual([]);
    expect(r.requiredTools).toEqual(['node']);
  });
});

describe('makeTargets (parser de Makefile)', () => {
  it('extrai alvos e ignora atribuições', () => {
    const targets = makeTargets('CC = gcc\n\nbuild:\n\techo hi\ninstall:\n\techo x\n');
    expect([...targets].sort()).toEqual(['build', 'install']);
  });
});
