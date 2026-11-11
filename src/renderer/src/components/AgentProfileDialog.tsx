import { useState } from 'react';
import { AGENT_CLI_PRESETS } from '@shared/agent-presets';
import type { AgentProfile, Repo } from '@shared/types';

interface Props {
  repos: Repo[];
  profile: AgentProfile | null; // null = criação
  onClose: () => void;
  onSubmit: (input: { name: string; repoId: string; command: string; args: string[] }) => Promise<void>;
}

export default function AgentProfileDialog({ repos, profile, onClose, onSubmit }: Props): React.JSX.Element {
  const [name, setName] = useState(profile?.name ?? '');
  const [repoId, setRepoId] = useState(profile?.repoId ?? repos[0]?.id ?? '');
  const [command, setCommand] = useState(profile?.command ?? 'claude');
  const [argsText, setArgsText] = useState(profile?.args.join(' ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    if (name.trim() === '' || command.trim() === '' || repoId === '') {
      setError('Preencha nome, repositório e comando');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        repoId,
        command: command.trim(),
        args: argsText.trim() === '' ? [] : argsText.trim().split(/\s+/)
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-steam-elevated/60 bg-steam-panel p-4">
        <h2 className="mb-3 text-sm font-bold">{profile == null ? 'Novo agente' : 'Editar agente'}</h2>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded bg-steam-bg px-2 py-1.5 outline-none ring-steam-accent/50 focus:ring-1" placeholder="Claude — Refatoração"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">Repositório</span>
            <select value={repoId} onChange={(e) => setRepoId(e.target.value)} className="rounded bg-steam-bg px-2 py-1.5 outline-none">
              {repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">CLI / comando</span>
            <input value={command} onChange={(e) => setCommand(e.target.value)} list="agent-cli-presets" className="rounded bg-steam-bg px-2 py-1.5 outline-none" placeholder="claude"/>
            <datalist id="agent-cli-presets">
              {AGENT_CLI_PRESETS.map((preset) => <option key={preset.id} value={preset.command}>{preset.label}</option>)}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-steam-text/70">Argumentos fixos (opcional)</span>
            <input value={argsText} onChange={(e) => setArgsText(e.target.value)} className="rounded bg-steam-bg px-2 py-1.5 outline-none" placeholder="--model sonnet"/>
          </label>
          {error != null && <p className="text-xs text-steam-error">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-steam-text/70 hover:bg-steam-elevated">Cancelar</button>
            <button type="button" onClick={() => void submit()} disabled={busy} className="rounded bg-steam-accent/90 px-3 py-1.5 font-semibold text-steam-bg disabled:opacity-50">
              {profile == null ? 'Criar agente' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
