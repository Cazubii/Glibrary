import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { TopRepo } from '@shared/types';
import { normalizeGitUrl } from '@shared/git-utils';
import { api } from '../lib/api';
import { TopRepoCard } from '../components/AssetCards';

const LANGUAGES = ['', 'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'C++', 'PHP', 'Ruby', 'Kotlin', 'Swift'];
const GH_REPO_URL = /github\.com\/[^\s?#]+\/([^\s/?#]+?)(?:\.git)?\/?/i;

interface Props { onError: (error: unknown) => void; onSuccess?: (message: string) => void }

export default function GithubSearchPage({ onError }: Props): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('');
  const [results, setResults] = useState<TopRepo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchedFor, setSearchedFor] = useState('');
  const [urlNote, setUrlNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingRepo, setAddingRepo] = useState<Set<string>>(new Set());
  const [importBusy, setImportBusy] = useState<'skill' | 'agents' | null>(null);
  const [skillImported, setSkillImported] = useState<Set<string>>(new Set());
  const [agentsImported, setAgentsImported] = useState<Set<string>>(new Set());
  const [knownUrls, setKnownUrls] = useState<string[]>([]);

  const refreshKnown = useCallback(async () => {
    try {
      const lib = await api.libraryGet();
      setKnownUrls(
        [...lib.repos.map((repo) => repo.remoteUrl), ...lib.bases.map((base) => base.remoteUrl)].filter(
          (url): url is string => Boolean(url)
        )
      );
    } catch (e) {
      onError(e);
    }
  }, [onError]);
  useEffect(() => { void refreshKnown(); }, [refreshKnown]);

  const knownSet = useMemo(() => new Set(knownUrls.map((url) => normalizeGitUrl(url))), [knownUrls]);

  const runSearch = async (): Promise<void> => {
    if (query.trim() === '' || busy) return;
    setBusy(true);
    try {
      // URL do GitHub no campo de tema? Busca pelo nome do repo (URL bruta como texto devolve ruído).
      const urlMatch = query.trim().match(GH_REPO_URL);
      const effectiveQuery = urlMatch != null ? `${urlMatch[1] ?? ''} in:name`.trim() : query.trim();
      setUrlNote(urlMatch != null ? `Detectei uma URL e busquei pelo nome "${urlMatch[1]}" (in:name).` : '');
      const response = await api.githubSearch(effectiveQuery, language || undefined, 25);
      setResults(response.repos);
      setTotalCount(response.totalCount);
      setSearchedFor(query.trim());
      setSkillImported(new Set());
      setAgentsImported(new Set());
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const addTopRepo = async (repo: TopRepo): Promise<void> => {
    try {
      await api.repoAddByUrl(repo.remoteUrl, false, `${repo.owner}/${repo.name}`);
      setAddingRepo((prev) => new Set(prev).add(repo.remoteUrl));
      await refreshKnown();
    } catch (e) {
      onError(e);
    }
  };

  const importSkillFor = async (repo: TopRepo): Promise<void> => {
    setImportBusy('skill');
    try {
      await api.skillImport(repo.remoteUrl);
      setSkillImported((prev) => new Set(prev).add(repo.remoteUrl));
    } catch (e) {
      onError(e);
    } finally {
      setImportBusy(null);
    }
  };

  const importAgentsFor = async (repo: TopRepo): Promise<void> => {
    setImportBusy('agents');
    try {
      await api.agentImport(repo.remoteUrl);
      setAgentsImported((prev) => new Set(prev).add(repo.remoteUrl));
    } catch (e) {
      onError(e);
    } finally {
      setImportBusy(null);
    }
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-4 border-b border-steam-elevated/50 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Busca GitHub</h1>
          <p className="mt-1 text-xs text-steam-text/50">Descreva o problema ou tema e veja os repositórios mais bem avaliados (ordenados por estrelas).</p>
        </div>
      </header>
      <form
        className="flex flex-wrap items-end gap-3 border-b border-steam-elevated/30 px-6 py-4"
        onSubmit={(e) => { e.preventDefault(); void runSearch(); }}
      >
        <label className="flex min-w-72 flex-1 flex-col gap-1 text-xs text-steam-text/60">
          Tema ou problema
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ex.: parser de csv em python, auth lib node, dashboard react"
            className="rounded border border-steam-elevated bg-steam-panel px-3 py-2 text-sm outline-none focus:border-steam-accent"
          />
        </label>
        <label className="flex min-w-44 flex-col gap-1 text-xs text-steam-text/60">
          Linguagem (opcional)
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border border-steam-elevated bg-steam-panel px-3 py-2 text-sm text-steam-text"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang || 'any'} value={lang}>{lang === '' ? 'Qualquer' : lang}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || query.trim() === ''}
          className="flex items-center gap-2 rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"
        >
          <Search size={15} className={busy ? 'animate-pulse' : ''} />
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        {searchedFor !== '' && results.length === 0 && !busy && (
          <div className="flex min-h-64 flex-1 items-center justify-center rounded border border-dashed border-steam-elevated p-8 text-center text-sm text-steam-text/50">
            Nenhum repositório encontrado para "{searchedFor}".
          </div>
        )}
        {searchedFor !== '' && results.length > 0 && (
          <>
            <p className="mb-2 text-xs text-steam-accent/80">{urlNote}</p>
            <p className="mb-4 text-sm text-steam-text/60">
              {results.length} de {totalCount.toLocaleString('pt-BR')} resultados para "{searchedFor}"{language !== '' ? ` · linguagem: ${language}` : ''} · cards com "+" indisponível já estão na sua biblioteca.
            </p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {results.map((repo) => (
                <TopRepoCard
                  key={`${repo.owner}/${repo.name}`}
                  repo={repo}
                  added={addingRepo.has(repo.remoteUrl) || knownSet.has(normalizeGitUrl(repo.remoteUrl))}
                  onAdd={() => void addTopRepo(repo)}
                  onImportSkill={() => void importSkillFor(repo)}
                  onImportAgents={() => void importAgentsFor(repo)}
                  importBusy={importBusy}
                  skillImported={skillImported.has(repo.remoteUrl)}
                  agentsImported={agentsImported.has(repo.remoteUrl)}
                />
              ))}
            </div>
          </>
        )}
        {searchedFor === '' && (
          <div className="flex min-h-64 flex-1 items-center justify-center rounded border border-dashed border-steam-elevated p-8 text-center text-sm text-steam-text/50">
            Digite um tema (ex.: "csv", "rate limit retry", "css in js") e pressione Buscar. Sem token: limite de 10 buscas/min no GitHub.
          </div>
        )}
      </div>
    </main>
  );
}
