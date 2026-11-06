import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  BriefcaseBusiness,
  ExternalLink,
  FolderOpen,
  Layers3,
  Plus,
  Star,
  Tag,
  Trash2,
  WandSparkles
} from 'lucide-react';
import type { Agent, AssetCategory, BaseItem, ProjectRef, Skill, TopRepo } from '@shared/types';
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from '@shared/categories';
import { sameTag } from '@shared/tags';
import TagPopover from './TagPopover';

function TagArea({
  tags,
  allTags,
  onChange
}: {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);
  const [localTags, setLocalTags] = useState(tags);
  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);
  const emit = (next: string[]): void => {
    setLocalTags(next);
    onChange(next);
  };
  return (
    <div className="relative mt-3">
      <button
        type="button"
        onMouseDown={() => {
          wasOpen.current = open;
        }}
        onClick={() => {
          if (wasOpen.current) {
            wasOpen.current = false;
            setOpen(false);
          } else {
            setOpen(true);
          }
        }}
        className="flex flex-wrap items-center gap-1.5 text-left"
      >
        {localTags.length === 0 ? (
          <span className="flex items-center gap-1 rounded-full border border-dashed border-steam-elevated px-2 py-0.5 text-xs text-steam-text/40">
            <Tag size={11} />
            Adicionar tag
          </span>
        ) : (
          localTags.map((tag) => (
            <span key={tag} className="rounded-full bg-steam-elevated px-2 py-0.5 text-xs text-steam-text/70">
              {tag}
            </span>
          ))
        )}
      </button>
      {open && (
        <TagPopover
          currentTags={localTags}
          allTags={allTags}
          onAdd={(tag) => emit([...localTags, tag])}
          onRemove={(tag) => emit(localTags.filter((current) => !sameTag(current, tag)))}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function StarButton({
  active,
  onClick
}: {
  active: boolean;
  onClick: (next: boolean) => void;
}): React.JSX.Element {
  const [local, setLocal] = useState(active);
  useEffect(() => {
    setLocal(active);
  }, [active]);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !local;
        setLocal(next);
        onClick(next);
      }}
      aria-label={local ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={`rounded p-1 ${local ? 'text-steam-accent' : 'text-steam-text/40 hover:text-steam-accent'}`}
    >
      <Star size={15} fill={local ? 'currentColor' : 'none'} />
    </button>
  );
}

function CategorySelect({
  value,
  onChange
}: {
  value: AssetCategory;
  onChange: (category: AssetCategory) => void;
}): React.JSX.Element {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <label className="mt-3 flex items-center gap-2 text-xs text-steam-text/50">
      Categoria
      <select
        value={local}
        onChange={(e) => {
          const next = e.target.value as AssetCategory;
          setLocal(next);
          onChange(next);
        }}
        aria-label="Categoria"
        className="rounded border border-steam-elevated bg-steam-bg px-2 py-0.5 text-xs text-steam-text"
      >
        {ASSET_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {ASSET_CATEGORY_LABELS[category]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SkillCard({
  skill,
  allTags,
  onTagsChange,
  onCategoryChange,
  onFavorite,
  onOpen,
  onRemove
}: {
  skill: Skill;
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onCategoryChange: (category: AssetCategory) => void;
  onFavorite: (next: boolean) => void;
  onOpen: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <article className="rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <WandSparkles size={18} className="mt-0.5 shrink-0 text-steam-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{skill.name}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-steam-text/60">
            {skill.description ?? 'Sem descrição no cabeçalho de SKILL.md.'}
          </p>
          <p className="mt-3 truncate text-xs text-steam-text/40" title={skill.path}>
            {skill.source}
          </p>
        </div>
        <StarButton active={skill.favorite} onClick={onFavorite} />
      </div>
      <TagArea tags={skill.tags} allTags={allTags} onChange={onTagsChange} />
      <CategorySelect value={skill.category} onChange={onCategoryChange} />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent"
        >
          <FolderOpen size={13} />
          Abrir skill
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${skill.name}`}
          className="ml-auto rounded p-1 text-steam-text/40 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export function AgentCard({
  agent,
  allTags,
  onTagsChange,
  onCategoryChange,
  onFavorite,
  onOpen,
  onRemove
}: {
  agent: Agent;
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onCategoryChange: (category: AssetCategory) => void;
  onFavorite: (next: boolean) => void;
  onOpen: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <article className="rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <Bot size={18} className="mt-0.5 shrink-0 text-steam-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{agent.name}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-steam-text/60">
            {agent.description ?? 'Sem descrição no frontmatter do agente.'}
          </p>
          <p className="mt-3 truncate text-xs text-steam-text/40" title={agent.file}>
            {agent.source}
          </p>
        </div>
        <StarButton active={agent.favorite} onClick={onFavorite} />
      </div>
      <TagArea tags={agent.tags} allTags={allTags} onChange={onTagsChange} />
      <CategorySelect value={agent.category} onChange={onCategoryChange} />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent"
        >
          <FolderOpen size={13} />
          Abrir agente
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${agent.name}`}
          className="ml-auto rounded p-1 text-steam-text/40 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export function TopRepoCard({
  repo,
  added,
  onAdd,
  onImportSkill,
  onImportAgents,
  importBusy,
  skillImported,
  agentsImported
}: {
  repo: TopRepo;
  added: boolean;
  onAdd: () => void;
  onImportSkill: () => void;
  onImportAgents: () => void;
  importBusy: 'skill' | 'agents' | null;
  skillImported: boolean;
  agentsImported: boolean;
}): React.JSX.Element {
  return (
    <article className="flex h-full flex-col rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {repo.owner}/{repo.name}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-steam-text/60">
            {repo.description ?? 'Sem descrição.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={added}
          title={added ? 'Já adicionado' : 'Adicionar ao catálogo'}
          className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs ${
            added
              ? 'bg-steam-elevated text-steam-text/40'
              : 'bg-steam-elevated hover:text-steam-accent'
          }`}
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-steam-text/50">
        <span className="flex items-center gap-1">
          ⭐ {repo.stars.toLocaleString('pt-BR')}
        </span>
        {repo.language && (
          <span className="rounded-full bg-steam-elevated px-2 py-0.5">{repo.language}</span>
        )}
        {(repo.topics ?? []).slice(0, 3).map((topic) => (
          <span key={topic} className="truncate rounded-full bg-steam-elevated px-2 py-0.5">
            {topic}
          </span>
        ))}
      </div>
      <div className="mt-auto pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onImportSkill}
            disabled={importBusy !== null || skillImported}
            title="Baixar o SKILL.md deste repo para uma pasta de Skills"
            className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent disabled:opacity-40"
          >
            <WandSparkles size={12} />
            {skillImported ? 'Skill importada' : 'Importar skill'}
          </button>
          <button
            type="button"
            onClick={onImportAgents}
            disabled={importBusy !== null || agentsImported}
            title="Baixar os .md de agentes (agents/ ou .claude/agents) deste repo"
            className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent disabled:opacity-40"
          >
            <Bot size={12} />
            {agentsImported ? 'Agents importados' : 'Importar agents'}
          </button>
          <button
            type="button"
            onClick={() => void window.open(repo.remoteUrl, '_blank')}
            className="ml-auto flex items-center gap-1 text-xs text-steam-text/40 hover:text-steam-accent"
          >
            <ExternalLink size={13} />
            GitHub
          </button>
        </div>
      </div>
    </article>
  );
}

export function BaseCard({
  base,
  allTags,
  onTagsChange,
  onFavorite,
  onClone,
  onRemove,
  basesRoot,
  cloning
}: {
  base: BaseItem;
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onFavorite: (next: boolean) => void;
  onClone: () => void;
  onRemove: () => void;
  basesRoot?: string;
  cloning?: boolean;
}): React.JSX.Element {
  return (
    <article className="rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <Layers3 size={18} className="mt-0.5 shrink-0 text-steam-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{base.name}</h2>
          <p className="mt-2 break-all text-xs text-steam-text/50">
            {base.localPath ?? base.remoteUrl ?? base.description ?? 'Base local'}
          </p>
        </div>
        <StarButton active={base.favorite} onClick={onFavorite} />
      </div>
      <TagArea tags={base.tags} allTags={allTags} onChange={onTagsChange} />
      <div className="mt-4 flex items-center gap-2">
        {base.remoteUrl && !base.localPath && (
          <button
            type="button"
            onClick={onClone}
            disabled={cloning}
            className="rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent disabled:opacity-50"
          >
            {cloning ? 'Clonando…' : `Clonar para ${basesRoot ?? '~/BASES'}`}
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${base.name}`}
          className="ml-auto rounded p-1 text-steam-text/40 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export function ProjectCard({
  project,
  assets,
  allTags,
  inheritTags,
  onSave,
  onTagsChange,
  onFavorite
}: {
  project: ProjectRef;
  assets: { skills: Skill[]; agents: Agent[]; bases: BaseItem[] };
  allTags: string[];
  inheritTags: boolean;
  onSave: (patch: { skillIds: string[]; agentIds: string[]; baseIds: string[]; notes?: string; tags?: string[] }) => Promise<void>;
  onTagsChange: (tags: string[]) => void;
  onFavorite: (next: boolean) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(project.notes ?? '');
  const [saving, setSaving] = useState(false);
  const mergeTags = (addedIds: string[]): string[] | undefined => {
    if (!inheritTags || addedIds.length === 0) return undefined;
    const byId = new Map([
      ...assets.skills.map((s) => [s.id, s.tags] as const),
      ...assets.agents.map((a) => [a.id, a.tags] as const),
      ...assets.bases.map((b) => [b.id, b.tags] as const)
    ]);
    const merged = [...project.tags];
    for (const id of addedIds) {
      for (const tag of byId.get(id) ?? []) {
        if (!merged.some((existing) => sameTag(existing, tag))) merged.push(tag);
      }
    }
    return merged;
  };
  const associate = (kind: 'skill' | 'agent' | 'base', id: string, checked: boolean): void => {
    const current =
      kind === 'skill' ? project.skillIds : kind === 'agent' ? project.agentIds : project.baseIds;
    const nextIds = checked ? [...current, id] : current.filter((x) => x !== id);
    setSaving(true);
    void onSave({
      skillIds: kind === 'skill' ? nextIds : project.skillIds,
      agentIds: kind === 'agent' ? nextIds : project.agentIds,
      baseIds: kind === 'base' ? nextIds : project.baseIds,
      notes,
      ...(checked ? { tags: mergeTags([id]) } : {})
    }).finally(() => setSaving(false));
  };
  return (
    <article className="rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex items-start gap-3">
        <BriefcaseBusiness size={18} className="mt-0.5 text-steam-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{project.name}</h2>
          <p className="mt-1 truncate text-xs text-steam-text/45" title={project.localPath}>
            {project.localPath ?? project.remoteUrl ?? 'Sem caminho associado'}
          </p>
          <p className="mt-2 text-xs text-steam-text/60">
            {project.skillIds.length} skills · {project.agentIds.length} agents · {project.baseIds.length} bases
          </p>
        </div>
        <StarButton active={project.favorite} onClick={onFavorite} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded bg-steam-elevated px-3 py-1.5 text-xs"
        >
          {open ? 'Fechar' : 'Editar contexto'}
        </button>
      </div>
      <TagArea tags={project.tags} allTags={allTags} onChange={onTagsChange} />
      {open && (
        <div aria-busy={saving} className="mt-4 grid gap-4 border-t border-steam-elevated/50 pt-4 md:grid-cols-3">
          <fieldset className="space-y-2" disabled={saving}>
            <legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">
              Skills usadas
            </legend>
            {assets.skills.map((skill) => (
              <label key={skill.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={project.skillIds.includes(skill.id)}
                  onChange={(e) => associate('skill', skill.id, e.target.checked)}
                />
                {skill.name}
              </label>
            ))}
            {assets.skills.length === 0 && (
              <p className="text-xs text-steam-text/40">Ainda não há Skills na biblioteca.</p>
            )}
          </fieldset>
          <fieldset className="space-y-2" disabled={saving}>
            <legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">
              Agents usados
            </legend>
            {assets.agents.map((agent) => (
              <label key={agent.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={project.agentIds.includes(agent.id)}
                  onChange={(e) => associate('agent', agent.id, e.target.checked)}
                />
                {agent.name}
              </label>
            ))}
            {assets.agents.length === 0 && (
              <p className="text-xs text-steam-text/40">
                Sincronize a aba Agents para associar agentes aos projetos.
              </p>
            )}
          </fieldset>
          <fieldset className="space-y-2" disabled={saving}>
            <legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">
              Bases usadas
            </legend>
            {assets.bases.map((base) => (
              <label key={base.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={project.baseIds.includes(base.id)}
                  onChange={(e) => associate('base', base.id, e.target.checked)}
                />
                {base.name}
              </label>
            ))}
            {assets.bases.length === 0 && (
              <p className="text-xs text-steam-text/40">Ainda não há Bases na biblioteca.</p>
            )}
          </fieldset>
          <label className="flex flex-col gap-1 text-xs text-steam-text/50 md:col-span-3">
            Notas
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void onSave({ skillIds: project.skillIds, agentIds: project.agentIds, baseIds: project.baseIds, notes })}
              rows={2}
              className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"
            />
          </label>
        </div>
      )}
    </article>
  );
}
