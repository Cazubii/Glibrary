import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronRight, GitBranch, LoaderCircle, Sparkles, Upload, X } from 'lucide-react';
import type { AgentProfile, BaseItem, Kit, Repo, RepoAnalysis } from '@shared/types';
import { AGENT_CLI_PRESETS } from '@shared/agent-presets';
import { normalizeGitUrl } from '@shared/git-utils';
import { api } from '../lib/api';

type RecipeId = 'first-site' | 'understand-repo' | 'publish-project';
const INCLUDED_SITE_STARTER = '__glibrary_site_starter__';

interface Props {
  onError: (error: unknown) => void;
  onSuccess: (message: string) => void;
  onOpenAgents: () => void;
}

const SUGGESTED_SITE_PROMPT = 'Crie a primeira versão funcional deste site. Examine os arquivos existentes, mantenha o estilo do projeto e explique ao final quais arquivos mudou.';
const SUGGESTED_REPO_PROMPT = 'Explique a estrutura deste projeto em linguagem simples, aponte como começar a usá-lo e sugira uma primeira melhoria segura.';

function samePath(left: string | undefined, right: string): boolean {
  return (left ?? '').replace(/[\\/]+$/, '').toLocaleLowerCase('en-US') === right.replace(/[\\/]+$/, '').toLocaleLowerCase('en-US');
}

async function ensureProjectAndRepo(localPath: string): Promise<{ projectId: string; repo: Repo }> {
  const library = await api.libraryGet();
  const project = library.projects.find((item) => samePath(item.localPath, localPath))
    ?? await api.projectAdd(localPath);
  const repo = library.repos.find((item) => samePath(item.localPath, localPath))
    ?? await api.repoAddLocal(localPath);
  return { projectId: project.id, repo };
}

async function getOrCreateProfile(repo: Repo, command: string): Promise<AgentProfile> {
  const profiles = await api.agentProfilesList();
  const existing = profiles.find((profile) => profile.repoId === repo.id && profile.command === command);
  if (existing != null) return existing;
  return api.agentProfilesCreate({
    name: `Assistente — ${repo.name}`,
    repoId: repo.id,
    command,
    args: [],
    monitorProvider: 'auto'
  });
}

interface ModalProps {
  title: string;
  step: string;
  onCancel: () => void;
  children: React.ReactNode;
}

function RecipeModal({ title, step, onCancel, children }: ModalProps): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="recipe-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-steam-elevated bg-steam-panel shadow-2xl">
        <header className="flex items-start gap-3 border-b border-steam-elevated px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id="recipe-title" className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-steam-text/55">{step}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancelar receita" className="rounded p-1 text-steam-text/60 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">{children}</div>
      </section>
    </div>
  );
}

function RecipeError({ error }: { error: string | null }): React.JSX.Element | null {
  return error == null ? null : <p role="alert" className="mt-4 rounded border border-steam-error/40 bg-steam-error/10 px-3 py-2 text-sm text-steam-error">{error}</p>;
}

function CliChooser({ value, onChange }: { value: string; onChange: (value: string) => void }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      Programa de IA instalado
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text">
        <option value="">Escolha um programa…</option>
        {AGENT_CLI_PRESETS.map((preset) => <option key={preset.id} value={preset.command}>{preset.label}</option>)}
      </select>
      <span className="text-xs text-steam-text/45">Escolha um que já esteja instalado. A decisão de recomendar um programa padrão ainda está pendente.</span>
    </label>
  );
}

function FirstSiteRecipe({ onCancel, onError, onSuccess, onOpenAgents }: Props & { onCancel: () => void }): React.JSX.Element {
  const [bases, setBases] = useState<BaseItem[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [baseId, setBaseId] = useState('');
  const [kitId, setKitId] = useState('');
  const [command, setCommand] = useState('');
  const [prompt, setPrompt] = useState(SUGGESTED_SITE_PROMPT);
  const [stage, setStage] = useState<'choose' | 'prompt'>('choose');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const cancel = (): void => {
    if (busy) onSuccess('A receita foi cancelada. Se o download já começou, a cópia ficará disponível no computador.');
    cancelled.current = true;
    onCancel();
  };

  useEffect(() => {
    void api.assetsGet().then((assets) => {
      setBases(assets.bases.filter((base) => base.remoteUrl != null || base.localPath != null));
      setKits(assets.kits);
    }).catch(onError);
  }, [onError]);

  const start = async (): Promise<void> => {
    const base = bases.find((item) => item.id === baseId);
    if ((base == null && baseId !== INCLUDED_SITE_STARTER) || command === '' || prompt.trim() === '') return;
    cancelled.current = false;
    setError(null);
    setBusy(true);
    try {
      setProgress('Baixando o modelo escolhido…');
      const localPath = baseId === INCLUDED_SITE_STARTER
        ? await api.projectCreateStarter()
        : (base?.localPath != null ? base.localPath : (await api.baseClone(base?.id ?? '')).localPath);
      if (cancelled.current) return;
      if (localPath == null) throw new Error('A pasta do modelo não foi encontrada. Confira se o modelo tem um endereço para baixar.');

      setProgress('Preparando seu projeto…');
      const { projectId, repo } = await ensureProjectAndRepo(localPath);
      if (cancelled.current) return;
      if (kitId !== '') {
        setProgress('Aplicando sua coleção…');
        await api.kitApply(kitId, projectId);
      }
      if (cancelled.current) return;

      setProgress('Iniciando o programa de IA…');
      await api.repoGitPrepare(repo.id);
      if (cancelled.current) return;
      const profile = await getOrCreateProfile(repo, command);
      await api.agentRunsStart(profile.id, prompt.trim());
      onSuccess(`O assistente começou a trabalhar em ${repo.name}. Acompanhe as mudanças e os registros na área Agentes.`);
      onOpenAgents();
      onCancel();
    } catch (cause) {
      if (cancelled.current) return;
      const message = cause instanceof Error ? cause.message : 'Não foi possível concluir esta receita.';
      setError(message);
      onError(cause);
    } finally {
      if (!cancelled.current) {
        setBusy(false);
        setProgress('');
      }
    }
  };

  return (
    <RecipeModal title="Criar meu primeiro site com IA" step={busy ? progress || '2 de 2 · Preparando o projeto' : stage === 'choose' ? '1 de 2 · Escolha um modelo e uma coleção' : '2 de 2 · Escolha o programa e revise o pedido'} onCancel={cancel}>
      <div className="space-y-4">
        {stage === 'choose' ? <>
          <label className="flex flex-col gap-1.5 text-sm">
            Modelo de projeto
            <select value={baseId} onChange={(event) => setBaseId(event.target.value)} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text">
              <option value="">Escolha um modelo…</option>
              <option value={INCLUDED_SITE_STARTER}>Modelo de site incluído</option>
              {bases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}
            </select>
          </label>
          {bases.length === 0 && <p className="rounded border border-steam-elevated/60 bg-steam-bg/50 p-3 text-sm text-steam-text/60">Você pode começar pelo modelo incluído ou adicionar uma Base sua na Biblioteca.</p>}
          <label className="flex flex-col gap-1.5 text-sm">
            Coleção para associar ao projeto
            <select value={kitId} onChange={(event) => setKitId(event.target.value)} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text">
              <option value="">Continuar sem coleção</option>
              {kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}
            </select>
          </label>
        </> : <>
          <CliChooser value={command} onChange={setCommand} />
          <label className="flex flex-col gap-1.5 text-sm">
            Pedido inicial sugerido (você pode editar)
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={4000} className="resize-y rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" />
          </label>
        </>}
        {progress !== '' && <p className="flex items-center gap-2 text-sm text-steam-accent" role="status"><LoaderCircle size={15} className="animate-spin" />{progress}</p>}
      </div>
      <RecipeError error={error} />
      <footer className="mt-5 flex justify-end gap-2 border-t border-steam-elevated/60 pt-4">
        <button type="button" onClick={cancel} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button>
        {stage === 'choose' ? (
          <button type="button" disabled={busy || baseId === ''} onClick={() => setStage('prompt')} className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">Continuar <ChevronRight size={15} /></button>
        ) : <>
          <button type="button" onClick={() => setStage('choose')} disabled={busy} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated disabled:opacity-45">Voltar</button>
          <button type="button" disabled={busy || command === '' || prompt.trim() === ''} onClick={() => void start()} className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">{busy ? 'Preparando…' : 'Criar projeto e iniciar'} {!busy && <ChevronRight size={15} />}</button>
        </>}
      </footer>
    </RecipeModal>
  );
}

function waitForClone(repoId: string, signal: AbortSignal, onProgress: (message: string) => void): Promise<Repo> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, repo?: Repo): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      offStatus();
      offProgress();
      signal.removeEventListener('abort', onAbort);
      if (error != null) reject(error);
      else if (repo != null) resolve(repo);
      else reject(new Error('O download terminou sem localizar a pasta do projeto.'));
    };
    const onAbort = (): void => finish(new Error('A receita foi cancelada. Se um download já tiver começado, ele continuará em segundo plano.'));
    const offStatus = api.onStatusChanged(({ id, status }) => {
      if (id !== repoId) return;
      if (status === 'error') {
        void api.libraryGet().then((library) => {
          const repo = library.repos.find((item) => item.id === repoId);
          finish(new Error(repo?.lastError ?? 'Não foi possível baixar este repositório.'));
        }).catch(() => finish(new Error('Não foi possível baixar este repositório.')));
      } else if (status === 'cloned' || status === 'installed' || status === 'running') {
        void api.libraryGet().then((library) => {
          const repo = library.repos.find((item) => item.id === repoId);
          if (repo?.localPath != null) finish(undefined, repo);
        }).catch(() => finish(new Error('O download terminou, mas não foi possível abrir o projeto.')));
      }
    });
    const offProgress = api.onCloneProgress(({ id, percent, stage }) => {
      if (id === repoId) onProgress(percent == null ? stage : `${stage} · ${Math.round(percent)}%`);
    });
    const timer = window.setTimeout(() => finish(new Error('O download está demorando mais que o esperado. Confira sua conexão e tente novamente.')), 240_000);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    void api.repoClone(repoId).catch((error: unknown) => finish(error instanceof Error ? error : new Error('Não foi possível iniciar o download.')));
  });
}

function UnderstandRepoRecipe({ onCancel, onError, onSuccess, onOpenAgents }: Props & { onCancel: () => void }): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [command, setCommand] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const cancel = (): void => {
    if (controller.current != null) onSuccess('A receita foi cancelada. Se um download já tiver começado, ele continuará em segundo plano.');
    controller.current?.abort();
    onCancel();
  };
  const analyze = async (): Promise<void> => {
    if (url.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.repoAnalyze(url.trim());
      setAnalysis(result);
      setPrompt(`${SUGGESTED_REPO_PROMPT}\n\nMinha pergunta: `);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível analisar este endereço.');
      onError(cause);
    } finally {
      setBusy(false);
    }
  };

  const askAgent = async (): Promise<void> => {
    if (analysis == null || command === '' || prompt.trim() === '') return;
    controller.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      setProgress('Preparando o download…');
      const library = await api.libraryGet();
      const normalizedUrl = normalizeGitUrl(analysis.remoteUrl);
      const existing = library.repos.find((repo) => repo.remoteUrl != null && normalizeGitUrl(repo.remoteUrl) === normalizedUrl);
      const repo = existing ?? await api.repoAddByUrl(analysis.remoteUrl, false, analysis.name);
      const readyRepo = repo.localPath != null && repo.status !== 'missing'
        ? repo
        : await waitForClone(repo.id, controller.current.signal, setProgress);
      setProgress('Abrindo o programa de IA…');
      const profile = await getOrCreateProfile(readyRepo, command);
      await api.agentRunsStart(profile.id, prompt.trim());
      onSuccess(`A pergunta foi enviada ao assistente de ${analysis.fullName}. Acompanhe a explicação na área Agentes.`);
      onOpenAgents();
      onCancel();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível iniciar a pergunta.';
      setError(message);
      if (!controller.current.signal.aborted) onError(cause);
    } finally {
      setBusy(false);
      setProgress('');
      controller.current = null;
    }
  };

  const stop = (): void => {
    setBusy(false);
    setProgress('');
    cancel();
  };

  return (
    <RecipeModal title="Entender um repositório do GitHub" step={analysis == null ? '1 de 2 · Cole um endereço para ver o resumo' : '2 de 2 · Escolha o programa e faça sua pergunta'} onCancel={stop}>
      {analysis == null ? (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void analyze(); }}>
          <label className="flex flex-col gap-1.5 text-sm">
            Endereço do projeto no GitHub
            <input value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" placeholder="https://github.com/dono/projeto" className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" />
          </label>
          <p className="text-xs text-steam-text/50">O Glibrary mostra um resumo público antes de baixar os arquivos.</p>
          <div className="flex justify-end gap-2 border-t border-steam-elevated/60 pt-4">
            <button type="button" onClick={cancel} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button>
            <button type="submit" disabled={busy || url.trim() === ''} className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">{busy ? 'Analisando…' : 'Ver resumo'} <ChevronRight size={15} /></button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <section className="rounded border border-steam-elevated/60 bg-steam-bg/50 p-3">
            <h3 className="font-semibold">{analysis.fullName}</h3>
            {analysis.description != null && <p className="mt-1 text-sm text-steam-text/65">{analysis.description}</p>}
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-steam-text/50"><span>{analysis.language ?? 'Linguagem não identificada'}</span><span>·</span><span>{analysis.stars.toLocaleString('pt-BR')} estrelas</span><span>·</span><span>{analysis.archived ? 'Arquivado' : 'Ativo'}</span></div>
            {analysis.pros.length > 0 && <p className="mt-3 text-xs text-steam-green">Ponto positivo: {analysis.pros[0]}</p>}
            {analysis.cons.length > 0 && <p className="mt-1 text-xs text-steam-warn">Atenção: {analysis.cons[0]}</p>}
          </section>
          <CliChooser value={command} onChange={setCommand} />
          <label className="flex flex-col gap-1.5 text-sm">
            O que você quer perguntar?
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={4000} className="resize-y rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" />
          </label>
          {busy && <p className="flex items-center gap-2 text-sm text-steam-accent" role="status"><LoaderCircle size={15} className="animate-spin" />{progress || 'Preparando…'}</p>}
          <div className="flex justify-between gap-2 border-t border-steam-elevated/60 pt-4">
            <button type="button" onClick={() => { setAnalysis(null); setError(null); }} disabled={busy} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated disabled:opacity-40">Voltar</button>
            <button type="button" onClick={stop} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button>
            <button type="button" disabled={busy || command === '' || prompt.trim() === ''} onClick={() => void askAgent()} className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">{busy ? 'Aguarde…' : 'Baixar e perguntar'} <ChevronRight size={15} /></button>
          </div>
        </div>
      )}
      <RecipeError error={error} />
    </RecipeModal>
  );
}

type PublishStep = 'select' | 'identity' | 'review' | 'remote' | 'done';

function PublishProjectRecipe({ onCancel, onError, onSuccess }: Props & { onCancel: () => void }): React.JSX.Element {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoId, setRepoId] = useState('');
  const [step, setStep] = useState<PublishStep>('select');
  const [identityName, setIdentityName] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const [identityReady, setIdentityReady] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.repoGitPreview>> | null>(null);
  const [branch, setBranch] = useState('');
  const [commitMessage, setCommitMessage] = useState('Minha primeira versão');
  const [repositoryName, setRepositoryName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [publicConfirmed, setPublicConfirmed] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.libraryGet(), api.githubAuthMe()]).then(([library, user]) => {
      const localRepos = library.repos.filter((repo) => repo.localPath != null);
      setRepos(localRepos);
      setRepoId(localRepos[0]?.id ?? '');
      setIdentityName(user?.name ?? user?.login ?? '');
      setIdentityEmail(user?.email ?? '');
    }).catch(onError);
  }, [onError]);

  const selectedRepo = repos.find((repo) => repo.id === repoId);
  const cancel = (): void => {
    if (busy) onSuccess('A janela foi fechada. Uma publicação já confirmada pode terminar em segundo plano; confira o projeto em Projetos.');
    onCancel();
  };
  const start = async (): Promise<void> => {
    if (selectedRepo == null) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await api.repoGitPrepare(selectedRepo.id);
      setIdentityReady(prepared.identityReady);
      if (!prepared.identityReady) {
        setStep('identity');
        return;
      }
      await loadReview(selectedRepo.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível preparar este projeto.';
      setError(message);
      onError(cause);
    } finally {
      setBusy(false);
    }
  };

  const configureIdentity = async (): Promise<void> => {
    if (selectedRepo == null || identityName.trim() === '' || identityEmail.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await api.repoGitPrepare(selectedRepo.id, { name: identityName.trim(), email: identityEmail.trim() });
      setIdentityReady(prepared.identityReady);
      if (!prepared.identityReady) throw new Error('Preencha um nome e um email válidos para identificar versões deste projeto.');
      await loadReview(selectedRepo.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível salvar a identificação local.';
      setError(message);
      onError(cause);
    } finally {
      setBusy(false);
    }
  };

  const loadReview = async (id: string): Promise<void> => {
    const [nextPreview, status] = await Promise.all([api.repoGitPreview(id), api.repoGitStatus(id)]);
    setPreview(nextPreview);
    setBranch(status.branch ?? '');
    setStep(nextPreview.files.length > 0 ? 'review' : 'remote');
    const repo = repos.find((item) => item.id === id);
    if (repositoryName === '' && repo != null) setRepositoryName(repo.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100));
  };

  const saveFirstVersion = async (): Promise<void> => {
    if (selectedRepo == null || preview == null || commitMessage.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await api.repoCommit(selectedRepo.id, commitMessage.trim(), preview.revision);
      onSuccess('A primeira versão foi salva neste computador.');
      await loadReview(selectedRepo.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível salvar esta versão.';
      setError(message);
      onError(cause);
    } finally {
      setBusy(false);
    }
  };

  const addFolder = async (): Promise<void> => {
    try {
      const path = await api.dialogPickFolder();
      if (path == null) return;
      const repo = await api.repoAddLocal(path);
      setRepos((current) => [...current, repo]);
      setRepoId(repo.id);
      setRepositoryName(repo.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir esta pasta.');
      onError(cause);
    }
  };

  const publish = async (): Promise<void> => {
    if (selectedRepo == null || repositoryName.trim() === '' || (visibility === 'public' && !publicConfirmed)) return;
    const confirmProtectedBranch = branch === 'main' || branch === 'master';
    const visibilityWarning = visibility === 'public'
      ? 'Qualquer pessoa poderá encontrar e baixar este projeto.'
      : 'O repositório ficará privado na sua conta.';
    if (!window.confirm(`Criar ${visibility === 'public' ? 'um repositório público' : 'um repositório privado'} chamado “${repositoryName}” e enviar a linha “${branch}”? ${visibilityWarning}`)) return;
    setBusy(true);
    setError(null);
    setProgress('Criando o repositório e enviando a primeira versão…');
    try {
      const result = await api.repoPublish({
        id: selectedRepo.id,
        name: repositoryName.trim(),
        ...(description.trim() !== '' ? { description: description.trim() } : {}),
        visibility,
        confirmProtectedBranch
      });
      setPublishedUrl(result.htmlUrl);
      setStep('done');
      onSuccess(`Seu projeto está no GitHub: ${result.owner}/${result.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível publicar este projeto.');
      onError(cause);
      await api.libraryGet().then((library) => setRepos(library.repos.filter((repo) => repo.localPath != null))).catch(() => undefined);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const stepLabel = step === 'select' ? '1 de 4 · Escolha o projeto'
    : step === 'identity' ? '2 de 4 · Identifique suas versões'
      : step === 'review' ? '3 de 4 · Revise e salve a primeira versão'
        : step === 'remote' ? '4 de 4 · Escolha como publicar'
          : 'Concluído';

  return (
    <RecipeModal title="Publicar meu projeto no GitHub" step={stepLabel} onCancel={cancel}>
      {step === 'select' && <div className="space-y-4">
        <p className="text-sm text-steam-text/65">Escolha uma pasta que já esteja aberta no Glibrary. Se ainda não a adicionou, escolha abaixo.</p>
        <label className="flex flex-col gap-1.5 text-sm">
          Projeto neste computador
          <select value={repoId} onChange={(event) => setRepoId(event.target.value)} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text">
            <option value="">Escolha um projeto…</option>
            {repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void addFolder()} className="rounded border border-steam-elevated px-3 py-2 text-sm hover:bg-steam-elevated">Escolher outra pasta…</button>
        {repos.length === 0 && <p className="text-sm text-steam-text/55">Ainda não há projetos locais na biblioteca.</p>}
        <div className="flex justify-end gap-2 border-t border-steam-elevated/60 pt-4">
          <button type="button" onClick={cancel} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button>
          <button type="button" disabled={busy || repoId === ''} onClick={() => void start()} className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">{busy ? 'Preparando…' : 'Continuar'} <ChevronRight size={15} /></button>
        </div>
      </div>}
      {step === 'identity' && <div className="space-y-4">
        <p className="text-sm text-steam-text/65">O Git precisa saber que nome e email devem aparecer nas versões deste projeto. Essa informação fica só nesta pasta; não muda os outros projetos.</p>
        <label className="flex flex-col gap-1.5 text-sm">Nome<input value={identityName} onChange={(event) => setIdentityName(event.target.value)} maxLength={100} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" /></label>
        <label className="flex flex-col gap-1.5 text-sm">Email<input type="email" value={identityEmail} onChange={(event) => setIdentityEmail(event.target.value)} maxLength={254} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" /></label>
        <div className="flex justify-end gap-2 border-t border-steam-elevated/60 pt-4"><button type="button" onClick={() => setStep('select')} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Voltar</button><button type="button" onClick={cancel} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button><button type="button" disabled={busy || identityName.trim() === '' || identityEmail.trim() === ''} onClick={() => void configureIdentity()} className="rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">Continuar</button></div>
      </div>}
      {step === 'review' && <div className="space-y-4">
        <p className="text-sm text-steam-text/65">Confira a lista e o que mudou. Nada será enviado antes da sua confirmação.</p>
        {preview != null && <>
          <ul className="max-h-36 space-y-1 overflow-y-auto rounded border border-steam-elevated/60 bg-steam-bg p-3 text-xs">
            {preview.files.map((file) => <li key={`${file.path}-${file.state}`} className="break-all"><span className="mr-2 text-steam-accent">{file.state === 'untracked' ? 'Novo' : 'Alterado'}</span>{file.path}</li>)}
          </ul>
          {preview.truncated && <p className="text-xs text-steam-warn">A prévia é parcial; a versão salvará os arquivos completos.</p>}
          {preview.diff !== '' && <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-steam-bg p-3 font-mono text-[11px] leading-5 text-steam-text/75">{preview.diff}</pre>}
          {preview.newFiles.map((file) => <details key={file.path} className="rounded border border-steam-elevated/60"><summary className="cursor-pointer px-3 py-2 text-xs">Ver arquivo novo: {file.path}</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 font-mono text-[11px]">{file.content}</pre></details>)}
        </>}
        <label className="flex flex-col gap-1.5 text-sm">Nome desta versão<input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} maxLength={500} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" /></label>
        <div className="flex justify-between gap-2 border-t border-steam-elevated/60 pt-4"><button type="button" onClick={() => setStep('select')} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Voltar</button><button type="button" onClick={cancel} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button><button type="button" disabled={busy || commitMessage.trim() === ''} onClick={() => void saveFirstVersion()} className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">{busy ? 'Salvando…' : 'Salvar versão'} <ChevronRight size={15} /></button></div>
      </div>}
      {step === 'remote' && <div className="space-y-4">
        <div className="rounded border border-steam-green/30 bg-steam-green/5 p-3 text-sm text-steam-green"><Check size={15} className="mr-2 inline" />A versão local está pronta para enviar pela linha {branch || 'atual'}.</div>
        <label className="flex flex-col gap-1.5 text-sm">Nome no GitHub<input value={repositoryName} onChange={(event) => setRepositoryName(event.target.value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100))} maxLength={100} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" /></label>
        <label className="flex flex-col gap-1.5 text-sm">Descrição (opcional)<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={350} className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-steam-text" /></label>
        <fieldset className="space-y-2"><legend className="mb-1 text-sm">Quem poderá ver?</legend><label className="flex items-center gap-2 text-sm"><input type="radio" name="visibility" checked={visibility === 'private'} onChange={() => { setVisibility('private'); setPublicConfirmed(false); }} />Só eu e as pessoas que eu convidar (privado)</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => { setVisibility('public'); setPublicConfirmed(false); }} />Qualquer pessoa (público)</label></fieldset>
        {visibility === 'public' && <label className="flex items-start gap-2 rounded border border-steam-warn/40 bg-steam-warn/5 p-3 text-xs text-steam-warn"><input type="checkbox" checked={publicConfirmed} onChange={(event) => setPublicConfirmed(event.target.checked)} className="mt-0.5" />Entendo que qualquer pessoa poderá ver e baixar os arquivos enviados.</label>}
        {progress !== '' && <p className="flex items-center gap-2 text-sm text-steam-accent" role="status"><LoaderCircle size={15} className="animate-spin" />{progress}</p>}
        <div className="flex justify-between gap-2 border-t border-steam-elevated/60 pt-4"><button type="button" onClick={() => setStep(preview?.files.length ? 'review' : 'select')} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Voltar</button><button type="button" onClick={cancel} className="rounded px-3 py-2 text-sm text-steam-text/65 hover:bg-steam-elevated">Cancelar</button><button type="button" disabled={busy || repositoryName.trim() === '' || (visibility === 'public' && !publicConfirmed)} onClick={() => void publish()} className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-45">{busy ? 'Publicando…' : 'Criar e enviar'} <Upload size={15} /></button></div>
      </div>}
      {step === 'done' && <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-steam-green/15 text-steam-green"><Check size={22} /></div>
        <h3 className="text-base font-semibold">Seu projeto chegou ao GitHub</h3>
        <p className="break-all text-sm text-steam-text/65">{publishedUrl}</p>
        <button type="button" onClick={cancel} className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg">Concluir</button>
      </div>}
      {busy && step !== 'remote' && <p className="mt-3 flex items-center gap-2 text-sm text-steam-accent" role="status"><LoaderCircle size={15} className="animate-spin" />{identityReady ? 'Preparando…' : 'Verificando…'}</p>}
      <RecipeError error={error} />
    </RecipeModal>
  );
}

export default function GuidedRecipes({ onError, onSuccess, onOpenAgents }: Props): React.JSX.Element {
  const [active, setActive] = useState<RecipeId | null>(null);
  const close = (): void => setActive(null);
  const cards: Array<{ id: RecipeId; title: string; description: string; icon: typeof Sparkles; action: string }> = [
    { id: 'first-site', title: 'Criar meu primeiro site com IA', description: 'Comece por um modelo e peça a primeira mudança.', icon: Sparkles, action: 'Começar' },
    { id: 'understand-repo', title: 'Entender um projeto do GitHub', description: 'Veja um resumo e faça uma pergunta ao assistente.', icon: BookOpen, action: 'Explorar projeto' },
    { id: 'publish-project', title: 'Publicar meu projeto no GitHub', description: 'Revise uma versão e escolha quem poderá ver.', icon: GitBranch, action: 'Preparar publicação' }
  ];

  return (
    <>
      <section aria-labelledby="guided-recipes-title" className="space-y-3">
        <header>
          <h2 id="guided-recipes-title" className="text-base font-semibold">Comece com uma receita guiada</h2>
          <p className="mt-1 text-xs text-steam-text/55">Passos curtos para criar, entender ou compartilhar um projeto.</p>
        </header>
        <div className="grid gap-3 lg:grid-cols-3">
          {cards.map(({ id, title, description, icon: Icon, action }) => (
            <article key={id} className="flex min-h-36 flex-col rounded border border-steam-elevated/60 bg-steam-panel/60 p-4">
              <Icon size={18} className="mb-3 text-steam-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1 flex-1 text-xs text-steam-text/55">{description}</p>
              <button type="button" onClick={() => setActive(id)} className="mt-3 flex min-h-9 items-center justify-center gap-1 rounded bg-steam-elevated px-3 text-xs font-semibold hover:text-steam-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">{action}<ChevronRight size={14} aria-hidden="true" /></button>
            </article>
          ))}
        </div>
      </section>
      {active === 'first-site' && <FirstSiteRecipe onCancel={close} onError={onError} onSuccess={onSuccess} onOpenAgents={onOpenAgents} />}
      {active === 'understand-repo' && <UnderstandRepoRecipe onCancel={close} onError={onError} onSuccess={onSuccess} onOpenAgents={onOpenAgents} />}
      {active === 'publish-project' && <PublishProjectRecipe onCancel={close} onError={onError} onSuccess={onSuccess} onOpenAgents={onOpenAgents} />}
    </>
  );
}

