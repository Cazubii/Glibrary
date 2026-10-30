import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Star, Wrench, AlertTriangle, Check } from 'lucide-react';
import type { CommandSpec, Repo } from '@shared/types';
import { useLibraryStore } from '../store/library';
import { api } from '../lib/api';
import GeneratedCover from '../components/GeneratedCover';
import StatusBadge from '../components/StatusBadge';
import CommandEditor from '../components/CommandEditor';

type Tab = 'overview' | 'console' | 'commands' | 'notes';

interface Props {
  repoId: string;
  onBack: () => void;
  onError: (message: string) => void;
}

export default function RepoDetailPage({ repoId, onBack, onError }: Props): React.JSX.Element {
  const { repos, updateRepo, toggleFavorite } = useLibraryStore();
  const repo = useMemo(() => repos.find((r) => r.id === repoId), [repos, repoId]);
  const [tab, setTab] = useState<Tab>('overview');
  const [detecting, setDetecting] = useState(false);
  const [notes, setNotes] = useState(repo?.notes ?? '');
  const [notesTimer, setNotesTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotes(repo?.notes ?? '');
  }, [repo?.notes]);

  if (repo == null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p>Repositório não encontrado</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg"
        >
          Voltar
        </button>
      </div>
    );
  }

  const patch = async (p: Partial<Repo>): Promise<void> => {
    try {
      await updateRepo(repo.id, p);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const detectAgain = async (): Promise<void> => {
    setDetecting(true);
    try {
      const detection = await api.repoDetect(repo.id);
      const install = detection.installCandidates[0];
      const start = detection.startCandidates[0];
      await updateRepo(repo.id, {
        detection,
        ...(repo.commandsEditedByUser !== true
          ? {
              ...(install != null ? { installCommand: install } : {}),
              ...(start != null ? { startCommand: start } : {})
            }
          : {})
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  };

  const setCommand = (field: 'installCommand' | 'startCommand') =>
    (spec: CommandSpec | undefined): void => {
      void patch({ [field]: spec, commandsEditedByUser: true } as Partial<Repo>);
    };

  const saveNotes = (text: string): void => {
    setNotes(text);
    if (notesTimer != null) clearTimeout(notesTimer);
    setNotesTimer(
      setTimeout(() => {
        void patch({ notes: text });
      }, 500),
    );
  };

  const tabButton = (id: Tab, label: string): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`border-b-2 px-4 py-2 text-sm transition-colors ${
        tab === id
          ? 'border-steam-accent text-steam-accent'
          : 'border-transparent text-steam-text/60 hover:text-steam-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative">
        <div className="h-40 w-full overflow-hidden">
          <GeneratedCover repo={repo} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 bg-gradient-to-t from-steam-bg to-transparent p-4">
          <button
            type="button"
            onClick={onBack}
            className="mb-1 rounded bg-steam-panel/80 p-2 hover:bg-steam-elevated"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="text-xs text-steam-text/60">{repo.owner ?? 'local'}</div>
            <h1 className="text-2xl font-bold">{repo.name}</h1>
          </div>
          <button
            type="button"
            onClick={() => void toggleFavorite(repo.id)}
            className={`mb-1 rounded p-2 ${
              repo.favorite ? 'text-steam-warn' : 'text-steam-text/50 hover:text-steam-text'
            }`}
            aria-label="Favoritar"
          >
            <Star size={20} fill={repo.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={() => void detectAgain()}
            disabled={detecting}
            className="mb-1 flex items-center gap-2 rounded bg-steam-elevated px-3 py-2 text-sm hover:bg-steam-accent/20 disabled:opacity-50"
          >
            <RefreshCw size={14} className={detecting ? 'animate-spin' : ''} />
            Detectar de novo
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-steam-elevated/50 px-4 py-2">
        <StatusBadge status={repo.status} />
        {repo.commandsEditedByUser === true && (
          <span className="text-[11px] text-steam-warn" title="Comandos editados manualmente">
            comandos editados
          </span>
        )}
      </div>

      <div className="flex border-b border-steam-elevated/50 px-4">
        {tabButton('overview', 'Visão geral')}
        {tabButton('console', 'Console')}
        {tabButton('commands', 'Comandos')}
        {tabButton('notes', 'Notas')}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="flex flex-col gap-4">
            {repo.description != null && <p className="text-steam-text/80">{repo.description}</p>}
            <div className="flex flex-wrap gap-4 text-sm">
              {repo.stars != null && <span>★ {repo.stars}</span>}
              {repo.language != null && <span>{repo.language}</span>}
              {repo.localPath != null && (
                <span className="font-mono text-xs text-steam-text/60">{repo.localPath}</span>
              )}
            </div>
            {repo.detection != null && (
              <div className="rounded-lg bg-steam-panel p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Wrench size={14} /> Tipos detectados
                </div>
                <div className="flex flex-wrap gap-1">
                  {repo.detection.kinds.map((k) => (
                    <span key={k} className="rounded bg-steam-elevated px-2 py-0.5 text-xs">
                      {k}
                    </span>
                  ))}
                </div>
                {repo.detection.detectedPort != null && (
                  <div className="mt-2 text-xs text-steam-text/60">
                    Porta: {repo.detection.detectedPort}
                  </div>
                )}
                {repo.detection.hasEnvExample && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-steam-warn">
                    <AlertTriangle size={12} /> Tem .env.example sem .env
                  </div>
                )}
                <div className="mt-3 text-xs text-steam-text/60">
                  Ferramentas exigidas: {repo.detection.requiredTools.join(', ') || '—'}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 text-sm font-semibold">Tags</div>
              <TagEditor tags={repo.tags} onChange={(tags) => void patch({ tags })} />
            </div>
          </div>
        )}

        {tab === 'console' && (
          <div className="flex h-full items-center justify-center text-steam-text/50">
            Console chega na Fase 3 (execução de processos).
          </div>
        )}

        {tab === 'commands' && (
          <div className="flex flex-col gap-4">
            {repo.commandsEditedByUser === true && (
              <div className="flex items-center gap-2 rounded bg-steam-warn/10 px-3 py-2 text-xs text-steam-warn">
                <Check size={12} /> Comandos editados por você — a re-detecção não vai sobrescrever.
              </div>
            )}
            <CommandEditor
              label="Instalar"
              value={repo.installCommand}
              candidates={repo.detection?.installCandidates ?? []}
              onChange={setCommand('installCommand')}
            />
            <CommandEditor
              label="Iniciar"
              value={repo.startCommand}
              candidates={repo.detection?.startCandidates ?? []}
              readmeCommands={repo.detection?.readmeCommands}
              onChange={setCommand('startCommand')}
            />
          </div>
        )}

        {tab === 'notes' && (
          <textarea
            value={notes}
            onChange={(e) => saveNotes(e.target.value)}
            placeholder="Anotações livres sobre este repositório…"
            className="h-64 w-full resize-none rounded-lg bg-steam-panel p-4 text-sm outline-none focus:ring-1 focus:ring-steam-accent"
          />
        )}
      </div>
    </div>
  );
}

function TagEditor({
  tags,
  onChange
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');

  const add = (): void => {
    const tag = draft.trim().replace(/^#/, '');
    if (tag === '' || tags.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...tags, tag]);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-steam-text/50 hover:text-steam-error"
            aria-label={`Remover tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
        onBlur={add}
        placeholder="+ tag"
        className="w-24 rounded border border-steam-elevated bg-steam-bg px-2 py-1 text-xs outline-none focus:border-steam-accent"
      />
    </div>
  );
}
