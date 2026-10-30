import { Play, Square, Download, RefreshCw, FolderSearch, Loader2 } from 'lucide-react';
import type { Repo } from '@shared/types';

interface Props {
  repo: Repo;
  busy: boolean;
  onInstall: () => void;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  onLocate: () => void;
}

export default function ActionButton({
  repo,
  busy,
  onInstall,
  onStart,
  onStop,
  onRetry,
  onLocate
}: Props): React.JSX.Element {
  const status = repo.status;

  const base =
    'flex items-center justify-center gap-2 rounded px-6 py-2.5 text-sm font-bold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50';

  const button = (
    label: string,
    icon: React.JSX.Element,
    colorClass: string,
    onClick: () => void,
  ): React.JSX.Element => (
    <button type="button" onClick={onClick} disabled={busy} className={`${base} ${colorClass}`}>
      {icon}
      {label}
    </button>
  );

  switch (status) {
    case 'not_cloned':
      return button('Clonar', <Download size={16} />, 'bg-steam-accent text-steam-bg', onInstall);
    case 'cloning':
      return (
        <button type="button" disabled className={`${base} bg-steam-accent text-steam-bg`}>
          <Loader2 size={16} className="animate-spin" />
          Clonando…
        </button>
      );
    case 'cloned': {
      const needsInstall = (repo.detection?.installCandidates.length ?? 0) > 0;
      return needsInstall
        ? button('Instalar', <Download size={16} />, 'bg-steam-accent text-steam-bg', onInstall)
        : button('▶ Iniciar', <Play size={16} />, 'bg-steam-green text-white', onStart);
    }
    case 'installing':
      return (
        <button type="button" disabled className={`${base} bg-steam-accent text-steam-bg`}>
          <Loader2 size={16} className="animate-spin" />
          Instalando…
        </button>
      );
    case 'installed':
      return button('▶ Iniciar', <Play size={16} />, 'bg-steam-green text-white', onStart);
    case 'running':
      return button('■ Parar', <Square size={16} />, 'bg-steam-elevated text-steam-text', onStop);
    case 'error':
      return button(
        'Tentar de novo',
        <RefreshCw size={16} />,
        'bg-steam-error text-white',
        onRetry,
      );
    case 'missing':
      return button(
        'Localizar pasta',
        <FolderSearch size={16} />,
        'bg-steam-warn text-steam-bg',
        onLocate,
      );
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Status não tratado: ${String(value)}`);
}
