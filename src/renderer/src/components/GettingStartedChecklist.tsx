import { Bot, Check, ChevronRight, Cloud, FolderPlus, Upload, Wrench } from 'lucide-react';
import type { OnboardingChecklistId } from '@shared/types';
import { useLibraryStore } from '../store/library';

interface Props {
  onOpenTools: () => void;
  onOpenProjects: () => void;
  onOpenAgents: () => void;
  onError: (error: unknown) => void;
}

const ITEMS: Array<{ id: OnboardingChecklistId; label: string; description: string; icon: typeof Wrench; action?: 'tools' | 'projects' | 'agents'; actionLabel?: string }> = [
  { id: 'tools', label: 'Instalar as ferramentas', description: 'Prepare Git, Node.js e uma ferramenta de agente.', icon: Wrench, action: 'tools', actionLabel: 'Ver ferramentas' },
  { id: 'github', label: 'Conectar ao GitHub', description: 'Entre pela conta no topo da janela.', icon: Cloud },
  { id: 'project', label: 'Abrir o primeiro projeto', description: 'Escolha uma pasta ou um modelo.', icon: FolderPlus, action: 'projects', actionLabel: 'Abrir Projetos' },
  { id: 'agent', label: 'Pedir uma mudança à IA', description: 'Abra Agentes e envie seu primeiro pedido.', icon: Bot, action: 'agents', actionLabel: 'Abrir Agentes' },
  { id: 'publish', label: 'Enviar seu trabalho ao GitHub', description: 'Revise as mudanças antes de publicar.', icon: Upload, action: 'projects', actionLabel: 'Ver Projetos' }
];

export default function GettingStartedChecklist({ onOpenTools, onOpenProjects, onOpenAgents, onError }: Props): React.JSX.Element | null {
  const settings = useLibraryStore((state) => state.settings);
  const updateSettings = useLibraryStore((state) => state.updateSettings);
  const progress = settings?.onboarding;
  if (progress == null || !progress.checklistVisible) return null;

  const completed = new Set(progress.completedChecklist);
  if (ITEMS.every((item) => completed.has(item.id))) return null;

  const toggle = async (id: OnboardingChecklistId): Promise<void> => {
    const current = useLibraryStore.getState().settings?.onboarding;
    if (current == null) return;
    const next = new Set(current.completedChecklist);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      await updateSettings({ onboarding: { ...current, completedChecklist: [...next] } });
    } catch (error) {
      onError(error);
    }
  };

  const open = (action: 'tools' | 'projects' | 'agents'): void => {
    if (action === 'tools') onOpenTools();
    else if (action === 'projects') onOpenProjects();
    else onOpenAgents();
  };

  return (
    <section aria-labelledby="getting-started-title" className="rounded-lg border border-steam-accent/30 bg-steam-accent/5 p-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h2 id="getting-started-title" className="text-base font-semibold">Primeiros passos</h2>
          <p className="mt-1 text-xs text-steam-text/55">Marque cada etapa quando terminar. Este painel some ao concluir a lista.</p>
        </div>
        <span className="text-xs text-steam-text/50">{completed.size} de {ITEMS.length}</span>
      </div>
      <ul className="grid gap-2 lg:grid-cols-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isComplete = completed.has(item.id);
          return (
            <li key={item.id} className="flex min-w-0 items-center gap-3 rounded border border-steam-elevated/50 bg-steam-panel/60 p-3">
              <button type="button" role="checkbox" aria-checked={isComplete} aria-label={`${isComplete ? 'Desmarcar' : 'Marcar'}: ${item.label}`} onClick={() => void toggle(item.id)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent ${isComplete ? 'border-steam-green bg-steam-green text-steam-bg' : 'border-steam-text/40'}`}>
                {isComplete && <Check size={13} aria-hidden="true" />}
              </button>
              <Icon size={16} className="shrink-0 text-steam-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${isComplete ? 'text-steam-text/45 line-through' : ''}`}>{item.label}</p>
                <p className="mt-0.5 text-xs text-steam-text/50">{item.description}</p>
              </div>
              {item.action != null && !isComplete && (
                <button type="button" onClick={() => open(item.action!)} className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-steam-accent hover:bg-steam-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">
                  {item.actionLabel}<ChevronRight size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
