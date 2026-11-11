import { useMemo } from 'react';
import { Check, X, ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import type { Repo } from '@shared/types';
import type { ToolStatus } from '@shared/tools';
import { TOOLS } from '@shared/tools';
import NativeToolsPanel from '../components/NativeToolsPanel';

interface Props {
  tools: ToolStatus[];
  toolsLoaded: boolean;
  repos: Repo[];
  onRecheck: () => void;
  onFilterByTool: (toolId: string) => void;
  onError?: (message: string) => void;
}

export default function ToolsPage({
  tools,
  toolsLoaded,
  repos,
  onRecheck,
  onFilterByTool,
  onError
}: Props): React.JSX.Element {
  const byId = useMemo(() => new Map(tools.map((t) => [t.id, t])), [tools]);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const repo of repos) {
      for (const tool of repo.detection?.requiredTools ?? []) {
        counts.set(tool, (counts.get(tool) ?? 0) + 1);
      }
    }
    return counts;
  }, [repos]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-steam-elevated/50 px-6 py-3">
        <Wrench size={18} className="text-steam-accent" />
        <h1 className="text-lg font-bold">Ferramentas</h1>
        <button
          type="button"
          onClick={onRecheck}
          className="ml-auto flex items-center gap-2 rounded bg-steam-elevated px-3 py-1.5 text-sm hover:bg-steam-accent/20"
        >
          <RefreshCw size={14} /> Verificar de novo
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <NativeToolsPanel onError={(message) => onError?.(message)} />
        {!toolsLoaded ? (
          <p className="text-steam-text/60">Verificando ferramentas…</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-steam-elevated/50 text-left text-steam-text/60">
                <th className="py-2 pr-4 font-medium">Ferramenta</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Versão</th>
                <th className="py-2 pr-4 font-medium">Usado por</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((tool) => {
                const status = byId.get(tool.id);
                const installed = status?.installed === true;
                const usedBy = usage.get(tool.id) ?? 0;
                return (
                  <tr key={tool.id} className="border-b border-steam-elevated/20">
                    <td className="py-2 pr-4 font-semibold">{tool.name}</td>
                    <td className="py-2 pr-4">
                      {installed ? (
                        <span className="flex items-center gap-1 text-steam-green">
                          <Check size={14} /> instalada
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-steam-error">
                          <X size={14} /> não encontrada
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-steam-text/70">
                      {status?.version ?? '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {usedBy > 0 ? (
                        <button
                          type="button"
                          onClick={() => onFilterByTool(tool.id)}
                          className="text-steam-accent hover:underline"
                        >
                          {usedBy} repositório{usedBy === 1 ? '' : 's'}
                        </button>
                      ) : (
                        <span className="text-steam-text/40">nenhum</span>
                      )}
                    </td>
                    <td className="py-2">
                      {!installed && tool.downloadUrl != null && (
                        <a
                          href={tool.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-steam-accent hover:underline"
                        >
                          baixar <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
