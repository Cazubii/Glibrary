import { promises as fs } from 'fs';
import { join } from 'path';
import { net } from 'electron';
import { opengraphCoverUrl } from './github-api';

function downloadToFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    request.setHeader('User-Agent', 'Glibrary');
    const chunks: Buffer[] = [];
    request.on('response', (response) => {
      if (response.statusCode == null || response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        fs.writeFile(dest, Buffer.concat(chunks))
          .then(() => resolve())
          .catch(reject);
      });
    });
    request.on('error', reject);
    request.end();
  });
}

/**
 * Seção 10: baixa a capa OpenGraph do GitHub. Se falhar ou não for GitHub,
 * o renderer gera uma capa (gradiente + iniciais) — sem arquivo salvo.
 * Retorna o caminho da capa baixada ou null.
 */
export async function downloadCover(
  coversDir: string,
  repoId: string,
  owner: string | undefined,
  repoName: string | undefined,
): Promise<string | null> {
  if (owner == null || repoName == null) return null;
  try {
    await fs.mkdir(coversDir, { recursive: true });
    const dest = join(coversDir, `${repoId}.png`);
    await downloadToFile(opengraphCoverUrl(owner, repoName), dest);
    return dest;
  } catch {
    return null;
  }
}
