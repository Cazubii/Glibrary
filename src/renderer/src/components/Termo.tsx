import { useId, useState, type KeyboardEvent } from 'react';
import { Info } from 'lucide-react';
import { GLOSSARY, type GlossaryTermId } from '../../../shared/glossary';

interface Props {
  id: GlossaryTermId;
  className?: string;
  showTechnical?: boolean;
}

/** Rótulo simples seguido pelo termo técnico e por uma explicação acessível. */
export default function Termo({ id, className = '', showTechnical = false }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const term = GLOSSARY[id];

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <span className={`group relative inline-flex items-center gap-1 align-baseline ${className}`} onKeyDown={handleKeyDown}>
      <span>{term.simpleName}{showTechnical ? ` (${term.technicalName})` : ''}</span>
      <button
        type="button"
        className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full text-steam-text/60 hover:text-steam-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
        aria-label={`Explicação sobre ${term.technicalName}`}
        aria-describedby={tooltipId}
        aria-controls={tooltipId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`absolute left-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded border border-steam-elevated bg-steam-panel px-3 py-2 text-left text-xs font-normal leading-5 text-steam-text shadow-xl ${open ? 'block' : 'hidden group-hover:block group-focus-within:block'}`}
      >
        <span className="mb-1 block font-semibold">{term.simpleName} ({term.technicalName})</span>
        {term.explanation}
      </span>
    </span>
  );
}
