import { useState } from 'react';
import {
  BriefcaseBusiness,
  FolderOpen,
  Layers3,
  Star,
  Tag,
  Trash2,
  WandSparkles
} from 'lucide-react';
import type { BaseItem, ProjectRef, Skill } from '@shared/types';
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
  return (
    <div className="relative mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex flex-wrap items-center gap-1.5 text-left"
      >
        {tags.length === 0 ? (
          <span className="flex items-center gap-1 rounded-full border border-dashed border-steam-elevated px-2 py-0.5 text-xs text-steam-text/40">
            <Tag size={11} />
            Adicionar tag
          </span>
        ) : (
          tags.map((tag) => (
            <span key={tag} className="rounded-full bg-steam-elevated px-2 py-0.5 text-xs text-steam-text/70">
              {tag}
            </span>
          ))
        )}
      </button>
      {open && (
        <TagPopover
          currentTags={tags}
          allTags={allTags}
          onAdd={(tag) => onChange([...tags, tag])}
          onRemove={(tag) => onChange(tags.filter((current) => !sameTag(current, tag)))}
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
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={`rounded p-1 ${active ? 'text-steam-accent' : 'text-steam-text/40 hover:text-steam-accent'}`}
    >
      <Star size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}

export function SkillCard({
  skill,
  allTags,
  onTagsChange,
  onFavorite,
  onOpen,
  onRemove
}: {
  skill: Skill;
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onFavorite: () => void;
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

export function BaseCard({
  base,
  allTags,
  onTagsChange,
  onFavorite,
  onClone,
  onRemove
}: {
  base: BaseItem;
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onFavorite: () => void;
  onClone: () => void;
  onRemove: () => void;
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
            className="rounded bg-steam-elevated px-2 py-1 text-xs hover:text-steam-accent"
          >
            Clonar para ~/BASES
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
  onSave,
  onTagsChange,
  onFavorite
}: {
  project: ProjectRef;
  assets: { skills: Skill[]; bases: BaseItem[] };
  allTags: string[];
  onSave: (patch: { skillIds: string[]; baseIds: string[]; notes?: string }) => Promise<void>;
  onTagsChange: (tags: string[]) => void;
  onFavorite: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(project.notes ?? '');
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
            {project.skillIds.length} skills · {project.baseIds.length} bases
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
        <div className="mt-4 grid gap-4 border-t border-steam-elevated/50 pt-4 md:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">
              Skills usadas
            </legend>
            {assets.skills.map((skill) => (
              <label key={skill.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={project.skillIds.includes(skill.id)}
                  onChange={(e) =>
                    void onSave({
                      skillIds: e.target.checked
                        ? [...project.skillIds, skill.id]
                        : project.skillIds.filter((x) => x !== skill.id),
                      baseIds: project.baseIds,
                      notes
                    })
                  }
                />
                {skill.name}
              </label>
            ))}
            {assets.skills.length === 0 && (
              <p className="text-xs text-steam-text/40">Ainda não há Skills na biblioteca.</p>
            )}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-semibold uppercase text-steam-text/50">
              Bases usadas
            </legend>
            {assets.bases.map((base) => (
              <label key={base.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={project.baseIds.includes(base.id)}
                  onChange={(e) =>
                    void onSave({
                      skillIds: project.skillIds,
                      baseIds: e.target.checked
                        ? [...project.baseIds, base.id]
                        : project.baseIds.filter((x) => x !== base.id),
                      notes
                    })
                  }
                />
                {base.name}
              </label>
            ))}
            {assets.bases.length === 0 && (
              <p className="text-xs text-steam-text/40">Ainda não há Bases na biblioteca.</p>
            )}
          </fieldset>
          <label className="flex flex-col gap-1 text-xs text-steam-text/50 md:col-span-2">
            Notas
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void onSave({ skillIds: project.skillIds, baseIds: project.baseIds, notes })}
              rows={2}
              className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text"
            />
          </label>
        </div>
      )}
    </article>
  );
}
