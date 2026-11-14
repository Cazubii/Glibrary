import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, ExternalLink, FolderOpen, Loader2, Plus, RotateCw, Trash2, Wrench, X } from 'lucide-react';
import type { ToolEntry, ToolInstallRun, ToolStatus } from '@shared/types';
import { api } from '../lib/api';
import { useToolsStore } from '../store/tools';

interface Props {
  onError: (error: unknown) => void;
}

function statusLabel(status: ToolStatus): string {
  if (status === 'installed') return 'Instalada';
  if (status === 'installing') return 'Instalando';
  return 'Não instalada';
}

function latestRun(runs: ToolInstallRun[], toolId: string): ToolInstallRun | undefined {
  return runs.find((run) => run.toolId === toolId);
}

function runStatusLabel(status: ToolInstallRun['status']): string {
  if (status === 'running') return 'em andamento';
  if (status === 'done') return 'concluída';
  if (status === 'stopped') return 'interrompida';
  return 'erro';
}

export default function NativeToolsPanel({ onError }: Props): React.JSX.Element {
  const { entries, statuses, runs, logs, loaded, load, initEvents, addTool, removeTool, installTool } = useToolsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [openingToolId, setOpeningToolId] = useState<string | null>(null);
  const orderedEntries = useMemo(() => entries, [entries]);

  useEffect(() => {
    const offEvents = initEvents();
    void load();
    return offEvents;
  }, [initEvents, load]);

  const submitTool = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    try {
      await addTool(url.trim());
      setUrl('');
      setDialogOpen(false);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleInstall = async (tool: ToolEntry): Promise<void> => {
    try {
      const run = await installTool(tool.id);
      const replay = await api.toolRunsGetLogs(run.id);
      useToolsStore.setState((state) => {
        const live = state.logs[run.id] ?? [];
        const keys = new Set(replay.map((line) => `${line.ts}:${line.stream}:${line.text}`));
        const merged = [...replay, ...live.filter((line) => !keys.has(`${line.ts}:${line.stream}:${line.text}`))];
        return { logs: { ...state.logs, [run.id]: merged.slice(-2000) } };
      });
    } catch (error) {
      onError(error);
    }
  };

  const handleRemove = async (tool: ToolEntry): Promise<void> => {
    try {
      await removeTool(tool.id);
    } catch (error) {
      onError(error);
    }
  };

  const handleOpen = async (tool: ToolEntry): Promise<void> => {
    setOpeningToolId(tool.id);
    try {
      await api.toolsOpen(tool.id);
    } catch (error) {
      onError(error);
    } finally {
      setOpeningToolId(null);
    }
  };

  return (
    <section className="mb-6 rounded-lg border border-steam-elevated/50 bg-steam-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Wrench size={16} className="text-steam-accent" />
        <div className="mr-auto">
          <h2 className="text-sm font-semibold">Ferramentas nativas</h2>
          <p className="text-xs text-steam-text/50">Instale e atualize ferramentas de desenvolvimento com OpenCode.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={!loaded}
          className="flex items-center gap-1.5 rounded bg-steam-elevated px-2.5 py-1.5 text-xs text-steam-text/70 hover:text-steam-text disabled:opacity-50"
        >
          <RotateCw size={13} /> Verificar
        </button>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg hover:brightness-110"
        >
          <Plus size={14} /> Adicionar ferramenta
        </button>
      </div>

      {!loaded ? (
        <p className="text-sm text-steam-text/50">Verificando instalações…</p>
      ) : orderedEntries.length === 0 ? (
        <p className="text-sm text-steam-text/50">Nenhuma ferramenta cadastrada.</p>
      ) : (
        <div className="space-y-3">
          {orderedEntries.map((tool) => {
            const status = statuses[tool.id] ?? 'not_installed';
            const run = latestRun(runs, tool.id);
            const runLogs = run != null ? logs[run.id] ?? [] : [];
            const installing = status === 'installing';
            const installed = status === 'installed';
            const actionLabel = installing ? 'Instalando…' : installed
              ? tool.id === 'builtin-omniroute' ? 'Atualizar' : 'Reinstalar'
              : 'Instalar';

            return (
              <article key={tool.id} className="rounded border border-steam-elevated/60 bg-steam-bg/50 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{tool.name}</h3>
                      <span className={`rounded px-2 py-0.5 text-[11px] ${installed ? 'bg-steam-green/15 text-steam-green' : installing ? 'bg-steam-warn/15 text-steam-warn' : 'bg-steam-elevated text-steam-text/60'}`}>
                        {installing && <Loader2 size={11} className="mr-1 inline animate-spin" />}
                        {installed && <Check size={11} className="mr-1 inline" />}
                        {statusLabel(status)}
                      </span>
                      <span className="rounded bg-steam-elevated/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-steam-text/40">
                        {tool.source === 'builtin' ? 'Integrada' : 'Personalizada'}
                      </span>
                      <a href={tool.gitUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-steam-accent hover:underline">
                        GitHub <ExternalLink size={11} />
                      </a>
                    </div>
                    {tool.id === 'builtin-habblaud' && (
                      <p className="mt-1 text-xs text-steam-warn/80">Alguns recursos exigem macOS ou Linux; no Windows o repositório ainda pode ser clonado e instalado.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={installing}
                    onClick={() => void handleInstall(tool)}
                    className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg disabled:cursor-wait disabled:opacity-50"
                  >
                    {installing ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
                    {actionLabel}
                  </button>
                  {tool.id !== 'builtin-omniroute' && (
                    <button
                      type="button"
                      disabled={!installed || installing || openingToolId === tool.id}
                      onClick={() => void handleOpen(tool)}
                      title={!installed ? 'Disponível após a instalação' : 'Abrir pasta do repositório'}
                      className="flex items-center gap-1.5 rounded bg-steam-elevated px-3 py-1.5 text-xs font-semibold text-steam-text hover:bg-steam-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {openingToolId === tool.id ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                      {openingToolId === tool.id ? 'Abrindo…' : 'Abrir'}
                    </button>
                  )}
                  {tool.source === 'custom' && (
                    <button
                      type="button"
                      onClick={() => void handleRemove(tool)}
                      className="rounded p-1.5 text-steam-text/45 hover:bg-steam-error/15 hover:text-steam-error"
                      title="Remove do catálogo; a pasta local permanece no disco"
                      aria-label={`Remover ${tool.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {run != null && (
                  <div className="mt-3 overflow-hidden rounded border border-steam-elevated/50 bg-[#0e1116]">
                    <div className="flex items-center gap-2 border-b border-steam-elevated/50 px-3 py-1.5 text-[11px] text-steam-text/50">
                      {run.status === 'error' ? <CircleAlert size={12} className="text-steam-error" /> : <span className="h-1.5 w-1.5 rounded-full bg-steam-green" />}
                      <span>Log da instalação</span>
                      <span className="ml-auto">{runStatusLabel(run.status)}</span>
                    </div>
                    <pre className="max-h-44 overflow-auto px-3 py-2 font-mono text-[11px] leading-5 text-steam-text/75" aria-label={`Log da instalação de ${tool.name}`}>
                      {runLogs.length === 0 ? 'Aguardando saída do OpenCode…' : runLogs.slice(-80).map((line) => `${line.stream === 'err' ? '[erro] ' : ''}${line.text}`).join('\n')}
                    </pre>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
          <form onSubmit={(event) => void submitTool(event)} className="w-full max-w-lg rounded-lg border border-steam-elevated bg-steam-panel p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="tool-add-title">
            <div className="mb-4 flex items-center gap-2">
              <h2 id="tool-add-title" className="mr-auto text-base font-semibold">Adicionar ferramenta</h2>
              <button type="button" onClick={() => setDialogOpen(false)} className="rounded p-1 text-steam-text/50 hover:bg-steam-elevated" aria-label="Fechar diálogo"><X size={16} /></button>
            </div>
            <label htmlFor="tool-github-url" className="mb-1 block text-xs font-medium text-steam-text/70">Link do repositório GitHub</label>
            <input
              id="tool-github-url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/usuario/repositorio"
              className="w-full rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm outline-none focus:border-steam-accent"
            />
            <p className="mt-2 text-xs text-steam-text/45">O nome será obtido do repositório. A instalação cria a pasta em userData/tools.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDialogOpen(false)} className="rounded px-3 py-1.5 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button>
              <button type="submit" disabled={saving || url.trim() === ''} className="rounded bg-steam-accent px-3 py-1.5 text-sm font-semibold text-steam-bg disabled:opacity-50">{saving ? 'Adicionando…' : 'Adicionar'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
