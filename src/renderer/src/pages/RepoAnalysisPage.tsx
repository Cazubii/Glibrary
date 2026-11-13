import { useState } from 'react';
import { CheckCircle2, CircleAlert, Search, Loader2, FolderPlus } from 'lucide-react';
import type { RepoAnalysis } from '@shared/types';
import { api } from '../lib/api';

interface Props { onError: (message: string) => void; onSuccess?: (message: string) => void }

const fmtInt = (value: number): string => value.toLocaleString('pt-BR');
const fmtData = (iso: string | undefined): string =>
  iso == null || iso === '' ? '—' : new Date(iso).toLocaleDateString('pt-BR');

export default function RepoAnalysisPage({ onError, onSuccess }: Props): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [added, setAdded] = useState(false);

  const run = async (): Promise<void> => {
    if (url.trim() === '' || busy) return;
    setBusy(true);
    setAnalysis(null);
    setAdded(false);
    try {
      setAnalysis(await api.repoAnalyze(url.trim()));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addToLibrary = async (repo: RepoAnalysis): Promise<void> => {
    try {
      await api.repoAddByUrl(repo.remoteUrl, false, `${repo.owner}/${repo.name}`);
      setAdded(true);
      onSuccess?.(`${repo.owner}/${repo.name} adicionado ao catálogo do Repos.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const stat = (label: string, value: string): React.JSX.Element => (
    <div className="rounded border border-steam-elevated bg-steam-panel px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-steam-text/50">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-steam-text">{value}</p>
    </div>
  );

  const bullet = (items: string[], kind: 'pro' | 'con'): React.JSX.Element | null =>
    items.length === 0 ? null : (
      <div className={`flex-1 rounded border p-4 ${kind === 'pro' ? 'border-steam-green/40 bg-steam-green/5' : 'border-steam-warn/40 bg-steam-warn/5'}`}>
        <p className={`mb-2 flex items-center gap-2 text-sm font-semibold ${kind === 'pro' ? 'text-steam-green' : 'text-steam-warn'}`}>
          {kind === 'pro' ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
          Pontos {kind === 'pro' ? 'positivos' : 'negativos'} ({items.length})
        </p>
        <ul className="space-y-1.5 text-sm text-steam-text/80">
          {items.map((item, i) => (
            <li key={`${kind}-${i}`} className="flex gap-2">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${kind === 'pro' ? 'bg-steam-green' : 'bg-steam-warn'}`} />
              {item}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-4 border-b border-steam-elevated/50 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Análise de Repositório</h1>
          <p className="mt-1 text-xs text-steam-text/50">Cole a URL do GitHub e receba as informações básicas do projeto com pontos positivos e negativos (análise heurística em pt-BR).</p>
        </div>
      </header>
      <form
        className="flex flex-wrap items-end gap-3 border-b border-steam-elevated/30 px-6 py-4"
        onSubmit={(e) => { e.preventDefault(); void run(); }}
      >
        <label className="flex min-w-96 flex-1 flex-col gap-1 text-xs text-steam-text/60">
          URL do repositório
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="ex.: https://github.com/anthropics/claude-code"
            inputMode="url"
            className="rounded border border-steam-elevated bg-steam-panel px-3 py-2 text-sm outline-none focus:border-steam-accent"
          />
        </label>
        <button
          type="submit"
          disabled={busy || url.trim() === ''}
          className="flex items-center gap-2 rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {busy ? 'Analisando…' : 'Analisar'}
        </button>
      </form>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        {analysis != null && <>
          <section className="rounded border border-steam-elevated bg-steam-panel p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">{analysis.fullName}</h2>
                {analysis.description != null && <p className="mt-1 text-sm text-steam-text/70">{analysis.description}</p>}
                <a href={analysis.remoteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-steam-accent hover:underline">{analysis.remoteUrl}</a>
              </div>
              <button
                type="button"
                disabled={added}
                onClick={() => void addToLibrary(analysis)}
                className="flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-sm hover:bg-steam-panel disabled:opacity-50"
              >
                <FolderPlus size={15} />
                {added ? 'Já no catálogo' : 'Adicionar ao Repos'}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              {stat('Estrelas', fmtInt(analysis.stars))}
              {stat('Forks', fmtInt(analysis.forks))}
              {stat('Issues abertas', fmtInt(analysis.openIssues))}
              {stat('Linguagem', analysis.language ?? '—')}
              {stat('Licença', analysis.license ?? '—')}
              {stat('Criado em', fmtData(analysis.createdAt))}
              {stat('Último push', fmtData(analysis.pushedAt))}
              {stat('Releases (12 meses)', fmtInt(analysis.releasesLastYear))}
              {stat('Contribuidores', analysis.contributorsCount != null ? (analysis.contributorsCount >= 100 ? '100+' : fmtInt(analysis.contributorsCount)) : '—')}
              {stat('Watchers', fmtInt(analysis.watchers))}
              {stat('Branch padrão', analysis.defaultBranch ?? '—')}
              {stat('README', analysis.readmeSize != null ? `${fmtInt(analysis.readmeSize)} bytes` : '—')}
            </div>
            {analysis.topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {analysis.topics.map((topic) => (
                  <span key={topic} className="rounded-full border border-steam-elevated px-2 py-0.5 text-[11px] text-steam-text/60">#{topic}</span>
                ))}
              </div>
            )}
          </section>
          <section className="mt-4 flex flex-col gap-4 lg:flex-row">
            {bullet(analysis.pros, 'pro')}
            {bullet(analysis.cons, 'con')}
            {analysis.pros.length === 0 && analysis.cons.length === 0 && (
              <p className="text-sm text-steam-text/50">Sem observações relevantes com base nos metadados públicos.</p>
            )}
          </section>
          <footer className="mt-4">
            <p className="text-xs text-steam-text/40">
              Análise realizada em {new Date(analysis.analysisAt).toLocaleString('pt-BR')}. Critérios heurísticos sobre metadados públicos do GitHub (estrelas, atividade, licença, README, contribuidores e releases) — não substituem uma revisão de código.
            </p>
          </footer>
        </>}
        {analysis == null && !busy && (
          <div className="flex min-h-64 flex-1 items-center justify-center rounded border border-dashed border-steam-elevated p-8 text-center text-sm text-steam-text/50">
            Cole uma URL do GitHub (ex.: https://github.com/owner/repo) e clique em Analisar. São feitas até 4 requisições públicas por análise.
          </div>
        )}
      </div>
    </main>
  );
}
