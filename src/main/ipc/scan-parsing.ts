export interface ImportItem {
  localPath: string;
  remoteUrl?: string;
  branch?: string;
}

export interface ScanFoldersInput {
  folders?: unknown;
}

/**
 * Aceita tanto `{ items: [...] }` quanto um array direto.
 * O bug original: o renderer enviava um array e o handler lia `raw.items`
 * (`undefined`), importando nada.
 */
export function parseImportItems(raw: unknown): ImportItem[] {
  const list = Array.isArray(raw)
    ? raw
    : raw != null && typeof raw === 'object'
      ? (raw as { items?: unknown }).items
      : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .map((item): ImportItem | null => {
      if (item == null || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      if (typeof obj.localPath !== 'string') return null;
      return {
        localPath: obj.localPath,
        ...(typeof obj.remoteUrl === 'string' ? { remoteUrl: obj.remoteUrl } : {}),
        ...(typeof obj.branch === 'string' ? { branch: obj.branch } : {})
      };
    })
    .filter((item): item is ImportItem => item != null);
}

export function parseFolders(raw: unknown, fallback: string[]): string[] {
  if (raw == null || typeof raw !== 'object') return fallback;
  const value = (raw as ScanFoldersInput).folders;
  if (!Array.isArray(value)) return fallback;
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}
