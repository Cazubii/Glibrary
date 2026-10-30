import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FolderPlus, Loader2, Check, AlertTriangle } from 'lucide-react';
import type { ScanProgress, ScannedRepo, Repo } from '@shared/types';
import { api } from '../lib/api';
import { useLibraryStore } from '../store/library';

interface Props {
  onClose: () => void;
  onImported: (repos: Repo[]) => void;
  onError: (message: string) => void;
  initialFolders?: string[];
}

type Phase = 'scanning' | 'done';

export default function ScanDialog({
  onClose,
  onImported,
  onError,
  initialFolders
}: Props): React.JSX.Element {
  const settings = useLibraryStore((s) => s.settings);
  const [folders, setFolders] = useState<string[]>(
    initialFolders ?? settings?.scanFolders ?? [],
  );
  const [phase, setPhase] = useState<Phase>('scanning');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<ScannedRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const startedRef = useRef(false);

  const startScan = async (list: string[]): Promise<void> => {
    setPhase('scanning');
    setProgress({ currentPath: '', found: 0 });
    setResults([]);
    try {
      const found = await api.scanStart(list);
      setResults(found);
      setSelected(new Set(found.filter((f) => f.duplicateOf == null).map((f) => f.localPath)));
      setPhase('done');
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setPhase('done');
    }
  };

  useEffect(() => {
    const off = api.onScanProgress((payload) => setProgress(payload));
    return () => off();
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startScan(folders);
  }, []);

  const addFolder = async (): Promise<void> => {
    try {
      const folder = await api.dialogPickFolder();
      if (folder != null && !folders.includes(folder)) {
        const next = [...folders, folder];
        setFolders(next);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = (localPath: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(localPath)) next.delete(localPath);
      else next.add(localPath);
      return next;
    });
  };

  const importSelected = async (): Promise<void> => {
    const items = results.filter((r) => selected.has(r.localPath) && r.duplicateOf == null);
    if (items.length === 0) return;
    setImporting(true);
    try {
      const imported = await api.scanImport(items);
      onImported(imported);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const duplicates = useMemo(
    () => results.filter((r) => r.duplicateOf != null).length,
    [results],
  );
  const newCount = results.length - duplicates;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-steam-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Escanear pastas"
      >
        <div className="flex items-center justify-between border-b border-steam-elevated/50 p-4">
          <h2 className="text-lg font-bold">Escanear pastas</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-steam-elevated/50 px-4 py-3 text-sm">
          <div className="mb-2 text-xs uppercase text-steam-text/50">Pastas escaneadas</div>
          <div className="flex flex-wrap gap-2">
            {folders.map((folder) => (
              <span
                key={folder}
                className="rounded bg-steam-elevated px-2 py-1 font-mono text-[11px] text-steam-text/70"
              >
                {folder}
              </span>
            ))}
            <button
              type="button"
              onClick={() => void addFolder()}
              className="flex items-center gap-1 rounded border border-dashed border-steam-elevated px-2 py-1 text-xs hover:border-steam-accent"
            >
              <FolderPlus size={12} /> adicionar
            </button>
          </div>
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto p-4">
          {phase === 'scanning' ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-steam-text/70">
              <Loader2 size={24} className="animate-spin text-steam-accent" />
              <p>
                Encontrados {progress?.found ?? 0} repositórios…
              </p>
              <p className="max-w-full truncate font-mono text-xs text-steam-text/40">
                {progress?.currentPath ?? ''}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-steam-text/70">
                Encontrados <strong>{results.length}</strong> repositórios,{' '}
                <strong>{duplicates}</strong> já estão na biblioteca.
              </p>
              {results.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {results.map((r) => {
                    const isDup = r.duplicateOf != null;
                    return (
                      <li
                        key={r.localPath}
                        className={`flex items-center gap-3 rounded px-2 py-1.5 ${
                          isDup ? 'opacity-50' : 'hover:bg-steam-elevated/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDup}
                          checked={!isDup && selected.has(r.localPath)}
                          onChange={() => toggle(r.localPath)}
                          className="accent-steam-accent"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">
                            {r.localPath.split(/[/\\]/).pop()}
                          </div>
                          <div className="truncate font-mono text-[11px] text-steam-text/40">
                            {r.localPath}
                          </div>
                        </div>
                        {isDup && (
                          <span className="flex items-center gap-1 text-[11px] text-steam-warn">
                            <AlertTriangle size={12} /> já na biblioteca
                          </span>
                        )}
                        {!isDup && r.remoteUrl != null && (
                          <span className="max-w-[40%] truncate text-[11px] text-steam-text/40">
                            {r.remoteUrl}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-steam-text/50">
                  Nenhum repositório encontrado nessas pastas.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-steam-elevated/50 p-4">
          <button
            type="button"
            onClick={() => void startScan(folders)}
            disabled={phase === 'scanning' || folders.length === 0}
            className="rounded bg-steam-elevated px-4 py-2 text-sm hover:bg-steam-accent/20 disabled:opacity-50"
          >
            {phase === 'scanning' ? 'Escaneando…' : 'Escanear de novo'}
          </button>
          <div className="flex gap-2">
            {phase === 'scanning' && (
              <button
                type="button"
                onClick={() => void api.scanCancel()}
                className="rounded px-4 py-2 text-sm text-steam-text/70 hover:bg-steam-elevated"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={() => void importSelected()}
              disabled={phase === 'scanning' || importing || selected.size === 0 || newCount === 0}
              className="flex items-center gap-2 rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg hover:opacity-90 disabled:opacity-50"
            >
              <Check size={14} />
              {importing ? 'Importando…' : `Importar selecionados (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
