import { useEffect, useMemo, useState } from 'react';
import { Bot, FolderOpen, LayoutGrid, Pencil, PanelsTopLeft, Play, Plus, Trash2 } from 'lucide-react';
import { useLibraryStore } from '../store/library';
import { useAgentsStore } from '../store/agents';
import { api } from '../lib/api';
import LogConsole from '../components/LogConsole';
import AgentProfileDialog from '../components/AgentProfileDialog';
import AgentRunDialog from '../components/AgentRunDialog';
import AgentRunCard from '../components/AgentRunCard';
import type { AgentProfile, AgentRun } from '@shared/types';

const ERROR_WINDOW_MS = 24 * 60 * 60 * 1000;

function StatBox({ label, value, tone = '' }: { label: string; value: string; tone?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-steam-elevated/50 bg-steam-panel px-4 py-2 text-sm">
      <span className={`font-bold ${tone}`}>{value}</span>
      <span className="text-steam-text/50">{label}</span>
    </div>
  );
}

export default function AgentesPage(): React.JSX.Element {
  const repos = useLibraryStore((s) => s.repos);
  const { profiles, runs, logs, viewMode, load, initEvents, setViewMode, createProfile, updateProfile, removeProfile, startRun, stopRun } = useAgentsStore();
  const [profileDialog, setProfileDialog] = useState<{ open: boolean; editing: AgentProfile | null }>({ open: false, editing: null });
  const [runDialogFor, setRunDialogFor] = useState<AgentProfile | null>(null);
  const [logDialogFor, setLogDialogFor] = useState<AgentRun | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);

  useEffect(() => { void load(); return initEvents(); }, [load, initEvents]);

  const stats = useMemo(() => {
    const now = Date.now();
    const running = runs.filter((r) => r.status === 'running').length;
    const errors24h = runs.filter((r) => r.status === 'error' && r.startedAt != null && now - Date.parse(r.startedAt) < ERROR_WINDOW_MS).length;
    const today = new Date().toDateString();
    const runsToday = runs.filter((r) => new Date(r.startedAt).toDateString() === today).length;
    return { running, errors24h, runsToday };
  }, [runs]);

  const activeRuns = runs.filter((r) => r.status === 'running');
  const historyRuns = runs.filter((r) => r.status !== 'running');

  const launch = async (profileId: string, prompt?: string): Promise<void> => { await startRun(profileId, prompt); };

  const openProjectFolder = async (repoId: string): Promise<void> => {
    setFolderError(null);
    try {
      await api.repoOpenFolder(repoId);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : 'Não foi possível abrir a pasta do projeto.');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-steam-elevated/50 px-4 py-2">
        <Bot size={18} className="text-steam-accent"/>
        <span className="text-sm font-bold">Agentes</span>
        <div className="ml-4 flex rounded border border-steam-elevated/60 text-xs">
          <button type="button" onClick={() => void setViewMode('painel')} className={`flex items-center gap-1 rounded px-2 py-1 ${viewMode === 'painel' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60'}`}><PanelsTopLeft size={13}/>Painel</button>
          <button type="button" onClick={() => void setViewMode('grid')} className={`flex items-center gap-1 rounded px-2 py-1 ${viewMode === 'grid' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60'}`}><LayoutGrid size={13}/>Grid</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatBox label="rodando agora" value={String(stats.running)} tone="text-steam-green"/>
          <StatBox label="erros (24h)" value={String(stats.errors24h)} tone="text-steam-error"/>
          <StatBox label="execuções hoje" value={String(stats.runsToday)}/>
          <button type="button" onClick={() => setProfileDialog({ open: true, editing: null })} className="flex items-center gap-1 rounded bg-steam-accent/90 px-3 py-1.5 text-sm font-semibold text-steam-bg hover:bg-steam-accent"><Plus size={14}/>Novo agente</button>
        </div>
      </div>

      {profiles.length === 0 && runs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-steam-text/50">
          <Bot size={40}/>
          <p className="text-sm">Nenhum agente ainda. Crie um perfil e lance o primeiro sub-agente.</p>
        </div>
      ) : viewMode === 'painel' ? (
        <div className="flex min-h-0 flex-1">
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-steam-elevated/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Perfis salvos</p>
            <div className="flex flex-col gap-1.5">
              {profiles.map((profile) => (
                <div key={profile.id} className="group rounded bg-steam-panel/60 px-2 py-1.5 text-sm ring-steam-accent/40 hover:ring-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-semibold">{profile.name}</span>
                    <button type="button" title="Executar sub-agente" onClick={() => setRunDialogFor(profile)} className="ml-auto rounded p-0.5 text-steam-green hover:bg-steam-elevated" aria-label={`Executar ${profile.name}`}><Play size={12}/></button>
                    <button type="button" title="Editar" onClick={() => setProfileDialog({ open: true, editing: profile })} className="rounded p-0.5 text-steam-text/50 hover:bg-steam-elevated" aria-label={`Editar ${profile.name}`}><Pencil size={12}/></button>
                    <button type="button" title="Remover" onClick={() => { void removeProfile(profile.id); }} className="rounded p-0.5 text-steam-text/50 hover:bg-steam-elevated hover:text-steam-error" aria-label={`Remover ${profile.name}`}><Trash2 size={12}/></button>
                  </div>
                  <p className="truncate text-[11px] text-steam-text/40">{profile.command} {profile.args.join(' ')}</p>
                </div>
              ))}
            </div>
          </aside>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {activeRuns.map((run) => (
              <AgentRunCard key={run.id} run={run} lines={logs[run.id]} running onStop={(id) => { void stopRun(id); }} onOpenLog={setLogDialogFor}/>
            ))}
            {historyRuns.length > 0 && (
              <div className="rounded-lg border border-steam-elevated/50 bg-steam-panel/40 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Histórico</p>
                {folderError != null && <p role="alert" className="mb-2 text-xs text-steam-error">{folderError}</p>}
                <table className="w-full text-left text-xs">
                  <thead className="text-steam-text/40"><tr><th className="py-1">Agente</th><th>Repo</th><th>Status</th><th>Duração</th><th>Início</th><th/></tr></thead>
                  <tbody>
                    {historyRuns.slice(0, 20).map((run) => (
                      <tr key={run.id} className="border-t border-steam-elevated/40">
                        <td className="py-1.5 pr-2">{run.profileName}</td>
                        <td className="pr-2 text-steam-text/60">{run.repoName}</td>
                        <td className={`pr-2 ${run.status === 'error' ? 'text-steam-error' : 'text-steam-text/60'}`}>{run.status}</td>
                        <td className="pr-2 text-steam-text/60">{run.durationMs != null ? `${Math.round(run.durationMs / 1000)}s` : '—'}</td>
                        <td className="pr-2 text-steam-text/60">{new Date(run.startedAt).toLocaleString('pt-BR')}</td>
                        <td><div className="flex items-center gap-2"><button type="button" onClick={() => setLogDialogFor(run)} className="text-steam-accent hover:underline">Log</button><button type="button" onClick={() => void openProjectFolder(run.repoId)} className="inline-flex items-center gap-1 text-steam-text/60 hover:text-steam-accent" aria-label={`Abrir pasta de ${run.repoName}`}><FolderOpen size={13} aria-hidden="true"/>Pasta</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {profiles.length > 0 && activeRuns.length === 0 && historyRuns.length === 0 && (
              <div className="m-auto text-sm text-steam-text/40">Nenhuma execução. Use ▶ em um perfil.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Perfis</p>
          <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-lg border border-steam-elevated/50 bg-steam-panel p-3 text-sm">
                <p className="truncate font-semibold">{profile.name}</p>
                <p className="truncate text-[11px] text-steam-text/40">{profile.command}</p>
                <button type="button" onClick={() => setRunDialogFor(profile)} className="mt-2 flex w-full items-center justify-center gap-1 rounded bg-steam-green/20 py-1 text-xs text-steam-green hover:bg-steam-green/30"><Play size={12}/>Executar sub-agente</button>
              </div>
            ))}
          </div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-steam-text/40">Execuções</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
            {runs.map((run) => (
              <AgentRunCard key={run.id} run={run} running={run.status === 'running'} onStop={(id) => { void stopRun(id); }} onOpenLog={setLogDialogFor} compact/>
            ))}
          </div>
        </div>
      )}

      {profileDialog.open && (
        <AgentProfileDialog
          repos={repos}
          profile={profileDialog.editing}
          onClose={() => setProfileDialog({ open: false, editing: null })}
          onSubmit={async (input) => {
            if (profileDialog.editing != null) await updateProfile(profileDialog.editing.id, input);
            else await createProfile(input);
          }}
        />
      )}
      {runDialogFor != null && (
        <AgentRunDialog profile={runDialogFor} onClose={() => setRunDialogFor(null)} onLaunch={launch}/>
      )}
      {logDialogFor != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="flex h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-steam-elevated/60 bg-steam-panel p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="font-semibold">{logDialogFor.profileName}</span>
              <span className="text-xs text-steam-text/50">{logDialogFor.command}</span>
              <button type="button" onClick={() => setLogDialogFor(null)} className="ml-auto rounded px-2 py-1 text-xs text-steam-text/60 hover:bg-steam-elevated">Fechar</button>
            </div>
            <LogConsole lines={logs[logDialogFor.id] ?? []}/>
          </div>
        </div>
      )}
    </div>
  );
}
