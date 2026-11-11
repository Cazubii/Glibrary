import { useState } from 'react';
import type { AgentProfile } from '@shared/types';

interface Props {
  profile: AgentProfile;
  onClose: () => void;
  onLaunch: (profileId: string, prompt?: string) => Promise<void>;
}

export default function AgentRunDialog({ profile, onClose, onLaunch }: Props): React.JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const launch = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await onLaunch(profile.id, prompt.trim() === '' ? undefined : prompt.trim());
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
        <h2 className="mb-1 text-sm font-bold">Executar sub-agente</h2>
        <p className="mb-3 text-xs text-steam-text/60">{profile.name} · {profile.command}</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Tarefa inicial (opcional)…"
          className="w-full resize-none rounded bg-steam-bg px-2 py-1.5 text-sm outline-none"
        />
        {error != null && <p className="mt-2 text-xs text-steam-error">{error}</p>}
        <div className="mt-3 flex justify-end gap-2 text-sm">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-steam-text/70 hover:bg-steam-elevated">Cancelar</button>
          <button type="button" onClick={() => void launch()} disabled={busy} className="rounded bg-steam-accent/90 px-3 py-1.5 font-semibold text-steam-bg disabled:opacity-50">Lançar</button>
        </div>
      </div>
    </div>
  );
}
