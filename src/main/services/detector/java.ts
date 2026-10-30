import { join } from 'path';
import type { CommandSpec, DetectionPartial } from '../../../shared/types';
import { dirExists, fileExists, readText } from './fs-utils';
import type { DetectorContext } from './types';

export async function detectJava({ root, platform }: DetectorContext): Promise<DetectionPartial | null> {
  const hasPom = await fileExists(root, 'pom.xml');
  const hasGradle =
    (await fileExists(root, 'build.gradle')) || (await fileExists(root, 'build.gradle.kts'));
  if (!hasPom && !hasGradle) return null;

  const installCandidates: CommandSpec[] = [];
  const startCandidates: CommandSpec[] = [];
  const requiredTools = ['java'];

  if (hasPom) {
    requiredTools.push('mvn');
    installCandidates.push({ command: 'mvn install' });
    const pom = (await readText(root, 'pom.xml')) ?? '';
    if (pom.includes('spring-boot')) {
      startCandidates.push({ command: 'mvn spring-boot:run' });
    }
  }

  if (hasGradle) {
    const hasWrapper = await dirExists(root, 'gradlew') || await fileExists(root, 'gradlew');
    if (hasWrapper) {
      const wrapper = platform === 'win32' ? join('.', 'gradlew.bat') : './gradlew';
      installCandidates.push({ command: `${wrapper} build` });
      startCandidates.push({ command: `${wrapper} run` });
    } else {
      installCandidates.push({ command: 'gradle build' });
      startCandidates.push({ command: 'gradle run' });
    }
  }

  return {
    kinds: ['java'],
    packageManager: hasPom ? 'maven' : 'gradle',
    installCandidates,
    startCandidates,
    requiredTools
  };
}
