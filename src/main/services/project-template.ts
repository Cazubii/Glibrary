import { cp, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Copia o modelo empacotado para uma nova pasta do usuário, sem sobrescrever destino existente. */
export async function createStarterProject(sourcePath: string, rootPath: string): Promise<string> {
  const source = resolve(sourcePath);
  if (!existsSync(source) || !(await stat(source)).isDirectory()) {
    throw new Error('O modelo inicial não está disponível nesta instalação.');
  }
  const root = resolve(rootPath);
  await mkdir(root, { recursive: true });
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const name = suffix === 1 ? 'meu-primeiro-site' : `meu-primeiro-site-${suffix}`;
    const target = resolve(root, name);
    const relativeTarget = relative(root, target);
    if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
      throw new Error('Destino do modelo inicial inválido.');
    }
    try {
      await mkdir(target, { recursive: false });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') continue;
      throw error;
    }
    await cp(source, target, { recursive: true, force: false, errorOnExist: false });
    return target;
  }
  throw new Error('Não foi possível encontrar uma pasta livre para o modelo inicial.');
}
