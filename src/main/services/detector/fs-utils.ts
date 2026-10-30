import { promises as fs } from 'fs';
import { join } from 'path';

export async function fileExists(root: string, rel: string): Promise<boolean> {
  try {
    const st = await fs.stat(join(root, rel));
    return st.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(root: string, rel: string): Promise<boolean> {
  try {
    const st = await fs.stat(join(root, rel));
    return st.isDirectory();
  } catch {
    return false;
  }
}

export async function readText(root: string, rel: string): Promise<string | null> {
  try {
    return await fs.readFile(join(root, rel), 'utf-8');
  } catch {
    return null;
  }
}

export async function readJson(
  root: string,
  rel: string,
): Promise<Record<string, unknown> | null> {
  const text = await readText(root, rel);
  if (text == null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed != null && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function listNames(root: string, rel = '.'): Promise<string[]> {
  try {
    return await fs.readdir(join(root, rel));
  } catch {
    return [];
  }
}
