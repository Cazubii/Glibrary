import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2];
const expected = `v${packageJson.version}`;

if (tag !== expected) {
  console.error(`A tag ${tag ?? '(vazia)'} não corresponde à versão do aplicativo (${expected}).`);
  process.exitCode = 1;
}
