import { useState } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  requireTypedName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  requireTypedName,
  onConfirm,
  onCancel
}: Props): React.JSX.Element {
  const [typed, setTyped] = useState('');
  const canConfirm = requireTypedName == null || typed === requireTypedName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg bg-steam-panel p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        <p className="text-sm text-steam-text/80">{message}</p>

        {requireTypedName != null && (
          <div className="mt-4">
            <label className="mb-1 block text-sm text-steam-text/70">
              Digite <span className="font-mono font-bold">{requireTypedName}</span> para confirmar
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm outline-none focus:border-steam-accent"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-steam-text/70 hover:bg-steam-elevated"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded bg-steam-error px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
