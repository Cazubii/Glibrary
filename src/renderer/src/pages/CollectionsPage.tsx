import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Pencil, Trash2, Plus, X } from 'lucide-react';
import type { Agent, BaseItem, Kit, ProjectRef, Skill } from '@shared/types';
import { api } from '../lib/api';

type Assets = { skills: Skill[]; agents: Agent[]; bases: BaseItem[]; projects: ProjectRef[]; kits: Kit[] };
const empty: Assets = { skills: [], agents: [], bases: [], projects: [], kits: [] };

interface Draft {
  id?: string;
  name: string;
  description: string;
  tags: string;
  skillIds: string[];
  agentIds: string[];
  baseIds: string[];
}

const emptyDraft: Draft = { name: '', description: '', tags: '', skillIds: [], agentIds: [], baseIds: [] };

interface Props { onError: (message: string) => void; onSuccess: (message: string) => void }

export default function CollectionsPage({ onError, onSuccess }: Props): React.JSX.Element {
  const [assets, setAssets] = useState<Assets>(empty);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applyKitId, setApplyKitId] = useState<string | null>(null);
  const [applyProjectId, setApplyProjectId] = useState<string>('');
  const [inheritTags, setInheritTags] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const data = await api.assetsGet();
      setAssets(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError]);
  useEffect(() => {
    void refresh();
    api.settingsGet().then((settings) => setInheritTags(settings.inheritTags)).catch(() => undefined);
  }, [refresh]);

  const byId = useMemo(
    () => ({
      skills: new Map(assets.skills.map((s) => [s.id, s])),
      agents: new Map(assets.agents.map((a) => [a.id, a])),
      bases: new Map(assets.bases.map((b) => [b.id, b]))
    }),
    [assets]
  );

  const startEdit = (kit: Kit): void =>
    setDraft({
      id: kit.id,
      name: kit.name,
      description: kit.description ?? '',
      tags: kit.tags.join(', '),
      skillIds: [...kit.skillIds],
      agentIds: [...kit.agentIds],
      baseIds: [...kit.baseIds]
    });

  const saveDraft = async (): Promise<void> => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      skillIds: draft.skillIds,
      agentIds: draft.agentIds,
      baseIds: draft.baseIds,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean)
    };
    if (payload.name === '') return;
    try {
      if (draft.id) {
        await api.kitUpdate(draft.id, payload);
      } else {
        await api.kitAdd(payload);
      }
      setDraft(null);
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const applyKit = async (): Promise<void> => {
    if (!applyKitId || !applyProjectId) return;
    try {
      await api.kitApply(applyKitId, applyProjectId, inheritTags);
      setApplyKitId(null);
      setApplyProjectId('');
      onSuccess('Coleção aplicada ao projeto.');
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleInDraft = (field: 'skillIds' | 'agentIds' | 'baseIds', id: string): void => {
    if (!draft) return;
    const current = draft[field];
    setDraft({
      ...draft,
      [field]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    });
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
      <header className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Coleções</h1>
          <p className="mt-1 text-xs text-steam-text/50">Agrupe skills, agents e bases em "kits" reutilizáveis e aplique-os a um projeto com um clique.</p>
        </div>
        <button type="button" onClick={() => setDraft(emptyDraft)} className="ml-auto flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg">
          <Plus size={15} />
          Nova coleção
        </button>
      </header>

      {draft && (
        <form
          className="mb-6 rounded border border-steam-elevated bg-steam-panel p-5"
          onSubmit={(e) => { e.preventDefault(); void saveDraft(); }}
        >
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-sm font-semibold">{draft.id ? 'Editar coleção' : 'Nova coleção'}</h2>
            <button type="button" onClick={() => setDraft(null)} className="ml-auto rounded p-1 text-steam-text/40 hover:text-steam-text" aria-label="Fechar formulário">
              <X size={16} />
            </button>
          </div>
          <div className="mb-4 flex flex-wrap gap-3">
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-steam-text/60">
              Nome
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Stack React + Tailwind" className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text" />
            </label>
            <label className="flex min-w-64 flex-[2] flex-col gap-1 text-xs text-steam-text/60">
              Descrição
              <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text" />
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-steam-text/60">
              Tags da coleção (separadas por vírgula)
              <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="frontend, web" className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text" />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['skillIds', 'Skills', assets.skills] as const,
                ['agentIds', 'Agents', assets.agents] as const,
                ['baseIds', 'Bases', assets.bases] as const
              ]
            ).map(([field, label, items]) => (
              <fieldset key={field} className="space-y-1.5">
                <legend className="mb-1 text-xs font-semibold uppercase text-steam-text/50">{label}</legend>
                {items.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={draft[field].includes(item.id)} onChange={() => toggleInDraft(field, item.id)} />
                    {item.name}
                  </label>
                ))}
                {items.length === 0 && <p className="text-xs text-steam-text/40">Nada disponível ainda.</p>}
              </fieldset>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg">Salvar coleção</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded border border-steam-elevated px-4 py-2 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {assets.kits.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {assets.kits.map((kit) => (
            <article key={kit.id} className="flex h-full flex-col rounded border border-steam-elevated bg-steam-panel p-4">
              <div className="flex items-start gap-3">
                <Boxes size={18} className="mt-0.5 shrink-0 text-steam-accent" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{kit.name}</h2>
                  {kit.description && <p className="mt-1 line-clamp-2 text-sm text-steam-text/60">{kit.description}</p>}
                  <p className="mt-2 text-xs text-steam-text/45">
                    {kit.skillIds.length} skills · {kit.agentIds.length} agents · {kit.baseIds.length} bases
                  </p>
                  {kit.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {kit.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-steam-elevated px-2 py-0.5 text-xs text-steam-text/70">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => startEdit(kit)} className="rounded p-1 text-steam-text/40 hover:text-steam-accent" aria-label={`Editar ${kit.name}`}>
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void api
                      .kitRemove(kit.id)
                      .then(refresh)
                      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
                  }
                  className="rounded p-1 text-steam-text/40 hover:text-red-400"
                  aria-label={`Excluir ${kit.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-auto pt-4">
                <p className="truncate text-xs text-steam-text/40" title={kit.skillIds.map((id) => byId.skills.get(id)?.name).filter(Boolean).join(', ')}>
                  {kit.skillIds.map((id) => byId.skills.get(id)?.name).filter(Boolean).join(', ') || 'Sem skills'}
                </p>
                {applyKitId === kit.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-steam-elevated bg-steam-bg p-2">
                    <select
                      value={applyProjectId}
                      onChange={(e) => setApplyProjectId(e.target.value)}
                      className="rounded border border-steam-elevated bg-steam-bg px-2 py-1 text-xs text-steam-text"
                      aria-label="Projeto de destino"
                    >
                      <option value="">Escolher projeto…</option>
                      {assets.projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-steam-text/60">
                      <input type="checkbox" checked={inheritTags} onChange={(e) => setInheritTags(e.target.checked)} />
                      Herdar tags
                    </label>
                    <button type="button" disabled={!applyProjectId} onClick={() => void applyKit()} className="rounded bg-steam-accent px-2 py-1 text-xs font-semibold text-steam-bg disabled:opacity-40">
                      Aplicar
                    </button>
                    <button type="button" onClick={() => setApplyKitId(null)} className="text-xs text-steam-text/40 hover:text-steam-text">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setApplyKitId(kit.id); setApplyProjectId(''); }}
                    disabled={assets.projects.length === 0}
                    className="mt-3 w-full rounded bg-steam-elevated px-2 py-1.5 text-xs hover:text-steam-accent disabled:opacity-40"
                  >
                    Aplicar a um projeto…
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-64 flex-1 items-center justify-center rounded border border-dashed border-steam-elevated p-8 text-center text-sm text-steam-text/50">
          Crie uma coleção para reutilizar combos de skills/agents/bases em novos projetos.
        </div>
      )}
    </main>
  );
}
