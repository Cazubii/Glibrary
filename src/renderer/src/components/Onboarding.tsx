import { useEffect, useState } from 'react';
import { FolderSearch, FolderPlus, Check, Loader2 } from 'lucide-react';
import type { ScanFolderSuggestion, Repo } from '@shared/types';
import { api } from '../lib/api';
import { useLibraryStore } from '../store/library';
import ScanDialog from './ScanDialog';

interface Props {
  onDone: () => void;
  onError: (error: unknown) => void;
}

export default function Onboarding({ onDone, onError }: Props): React.JSX.Element {
  const updateSettings = useLibraryStore((s) => s.updateSettings);
  const [suggestions, setSuggestions] = useState<ScanFolderSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanFolders, setScanFolders] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.onboardingSuggest();
        setSuggestions(list);
        setSelected(new Set(list.filter((s) => s.exists).map((s) => s.path)));
      } catch (e) {
        onError(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  const toggle = (path: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const addFolder = async (): Promise<void> => {
    try {
      const folder = await api.dialogPickFolder();
      if (folder == null || selected.has(folder)) return;
      setSuggestions((prev) => [...prev, { path: folder, exists: true }]);
      setSelected((prev) => new Set(prev).add(folder));
    } catch (e) {
      onError(e);
    }
  };

  const start = async (): Promise<void> => {
    const folders = [...selected];
    try {
      await updateSettings({ scanFolders: folders });
    } catch (e) {
      onError(e);
    }
    setScanFolders(folders);
    setScanning(true);
  };

  const finish = (imported: Repo[]): void => {
    void imported;
    onDone();
  };

  if (scanning) {
    return (
      <ScanDialog
        initialFolders={scanFolders}
        onClose={onDone}
        onImported={finish}
        onError={onError}
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto bg-steam-bg p-8 text-steam-text">
      <div className="w-full max-w-xl rounded-lg bg-steam-panel p-8">
        <div className="mb-1 flex items-center gap-2 text-steam-accent">
          <FolderSearch size={22} />
          <h1 className="text-xl font-bold">Onde ficam seus projetos?</h1>
        </div>
        <p className="mb-6 text-sm text-steam-text/60">
          Vamos varrer essas pastas e trazer para a biblioteca os repositórios que você já tem na
          máquina.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-steam-text/60">
            <Loader2 size={16} className="animate-spin" /> Procurando pastas…
          </div>
        ) : (
          <ul className="mb-4 flex flex-col gap-1">
            {suggestions.map((s) => (
              <li
                key={s.path}
                className={`flex items-center gap-3 rounded px-2 py-1.5 ${
                  s.exists ? 'hover:bg-steam-elevated/40' : 'opacity-40'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!s.exists}
                  checked={selected.has(s.path)}
                  onChange={() => toggle(s.path)}
                  className="accent-steam-accent"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.path}</span>
                {!s.exists && <span className="text-[11px]">não existe</span>}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => void addFolder()}
          className="mb-6 flex items-center gap-1 rounded border border-dashed border-steam-elevated px-3 py-1.5 text-xs hover:border-steam-accent"
        >
          <FolderPlus size={14} /> Escolher outra pasta
        </button>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-steam-text/50 hover:text-steam-text"
          >
            Pular por enquanto
          </button>
          <button
            type="button"
            onClick={() => void start()}
            disabled={selected.size === 0}
            className="flex items-center gap-2 rounded bg-steam-accent px-5 py-2 text-sm font-semibold text-steam-bg hover:opacity-90 disabled:opacity-50"
          >
            <Check size={16} /> Escanear e começar
          </button>
        </div>
      </div>
    </div>
  );
}
