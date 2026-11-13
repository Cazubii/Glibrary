import { Moon, Settings2, Sun, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SettingsMenuProps {
  showAdvancedResources: boolean;
  theme: 'dark' | 'light';
  toolsOpen: boolean;
  onAdvancedResourcesChange: (show: boolean) => void;
  onThemeToggle: () => void;
  onOpenTools: () => void;
}

export default function SettingsMenu({
  showAdvancedResources,
  theme,
  toolsOpen,
  onAdvancedResourcesChange,
  onThemeToggle,
  onOpenTools
}: SettingsMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnPointerOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openTools = (): void => {
    setOpen(false);
    onOpenTools();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Configurações"
        aria-expanded={open}
        aria-controls="glibrary-settings-menu"
        title="Configurações"
        onClick={() => setOpen((current) => !current)}
        className={`rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent ${open || toolsOpen ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel hover:text-steam-accent'}`}
      >
        <Settings2 size={17} aria-hidden="true" />
      </button>
      {open && (
        <section
          id="glibrary-settings-menu"
          aria-label="Configurações"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-steam-elevated bg-steam-panel p-4 shadow-lg"
        >
          <header className="mb-3 flex items-center">
            <h2 className="text-sm font-semibold">Configurações</h2>
            <button
              type="button"
              aria-label="Fechar configurações"
              onClick={() => setOpen(false)}
              className="ml-auto rounded p-1 text-steam-text/55 hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </header>
          <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-2 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-steam-accent">
            <input
              type="checkbox"
              checked={showAdvancedResources}
              onChange={(event) => onAdvancedResourcesChange(event.target.checked)}
              className="mt-0.5 accent-steam-accent"
            />
            <span>
              <span className="block font-medium">Mostrar recursos avançados</span>
              <span className="mt-0.5 block text-xs text-steam-text/60">Coleções, análise e consumo detalhado</span>
            </span>
          </label>
          <button
            type="button"
            onClick={onThemeToggle}
            className="mt-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-steam-text/80 hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          >
            {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            {theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          </button>
          <button
            type="button"
            onClick={openTools}
            aria-current={toolsOpen ? 'page' : undefined}
            className="mt-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-steam-text/80 hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          >
            <Wrench size={15} aria-hidden="true" />
            Ferramentas
          </button>
        </section>
      )}
    </div>
  );
}
