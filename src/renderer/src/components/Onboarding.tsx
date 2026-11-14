import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, FolderOpen, Loader2, Sparkles, Wrench } from 'lucide-react';
import type { OnboardingStatus, ScanFolderSuggestion, Repo } from '@shared/types';
import { AGENT_CLI_PRESETS } from '@shared/agent-presets';
import type { ToolStatus } from '@shared/tools';
import { api } from '../lib/api';
import { useLibraryStore } from '../store/library';
import ScanDialog from './ScanDialog';

interface Props {
  onDone: () => void;
  onError: (error: unknown) => void;
  onOpenTools: () => void;
  onOpenLibrary: () => void;
}

const STEP_TITLES = ['Boas-vindas', 'Ferramentas', 'GitHub', 'Pasta dos projetos', 'Seu primeiro projeto'];

function toolLabel(id: string): string {
  if (id === 'git') return 'Git';
  if (id === 'node') return 'Node.js';
  return AGENT_CLI_PRESETS.find((preset) => `agent-cli-${preset.id}` === id)?.label ?? id;
}

export default function Onboarding({ onDone, onError, onOpenTools, onOpenLibrary }: Props): React.JSX.Element {
  const settings = useLibraryStore((state) => state.settings);
  const updateSettings = useLibraryStore((state) => state.updateSettings);
  const [step, setStep] = useState(settings?.onboarding.currentStep ?? 0);
  const [suggestions, setSuggestions] = useState<ScanFolderSuggestion[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [projectRoot, setProjectRoot] = useState(settings?.onboarding.projectsRoot ?? settings?.reposRoot ?? '');
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[] | null>(null);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [checkingTools, setCheckingTools] = useState(false);
  const [checkingGithub, setCheckingGithub] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.onboardingSuggest().then((list) => {
      if (cancelled) return;
      setSuggestions(list);
      setSelectedFolders(new Set(list.filter((item) => item.exists).map((item) => item.path)));
    }).catch(onError).finally(() => {
      if (!cancelled) setLoadingFolders(false);
    });
    void refreshTools();
    void refreshGithub();
    return () => { cancelled = true; };
  }, [onError]);

  const refreshTools = async (): Promise<void> => {
    setCheckingTools(true);
    try {
      setToolStatuses(await api.toolsCheck(true));
    } catch (error) {
      onError(error);
    } finally {
      setCheckingTools(false);
    }
  };

  const refreshGithub = async (): Promise<void> => {
    setCheckingGithub(true);
    try {
      setGithubConnected((await api.githubAuthMe()) != null);
    } catch (error) {
      onError(error);
      setGithubConnected(false);
    } finally {
      setCheckingGithub(false);
    }
  };

  const saveProgress = async (patch: Partial<NonNullable<typeof settings>['onboarding']>): Promise<void> => {
    const current = useLibraryStore.getState().settings?.onboarding;
    if (current == null) return;
    await updateSettings({ onboarding: { ...current, ...patch } });
  };

  const moveToStep = async (nextStep: number): Promise<void> => {
    const boundedStep = Math.max(0, Math.min(STEP_TITLES.length - 1, nextStep));
    setStep(boundedStep);
    try {
      await saveProgress({ currentStep: boundedStep });
    } catch (error) {
      onError(error);
    }
  };

  const finish = async (status: Exclude<OnboardingStatus, 'not-started'>): Promise<void> => {
    setBusy(true);
    try {
      await saveProgress({
        status,
        currentStep: status === 'completed' ? STEP_TITLES.length - 1 : step,
        checklistVisible: true
      });
      onDone();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const chooseProjectFolder = async (): Promise<void> => {
    try {
      const folder = await api.dialogPickFolder();
      if (folder == null) return;
      setProjectRoot(folder);
      setSuggestions((current) => current.some((item) => item.path === folder)
        ? current
        : [...current, { path: folder, exists: true }]);
      setSelectedFolders((current) => new Set(current).add(folder));
      await saveProgress({ projectsRoot: folder });
    } catch (error) {
      onError(error);
    }
  };

  const openProject = async (): Promise<void> => {
    setBusy(true);
    try {
      const folder = await api.dialogPickFolder();
      if (folder == null) return;
      await api.projectAdd(folder);
      await finish('completed');
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const startScan = async (): Promise<void> => {
    const folders = [...selectedFolders];
    if (folders.length === 0) return;
    setBusy(true);
    try {
      const progress = useLibraryStore.getState().settings?.onboarding;
      await updateSettings({
        reposRoot: projectRoot || settings?.reposRoot || '',
        scanFolders: folders,
        onboarding: { ...(progress ?? { status: 'not-started', currentStep: 4, completedChecklist: [], checklistVisible: false }), currentStep: 4, projectsRoot: projectRoot }
      });
      setScanning(true);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const onImported = (repos: Repo[]): void => {
    if (repos.length > 0) void finish('completed');
  };

  if (scanning) {
    return (
      <ScanDialog
        initialFolders={[...selectedFolders]}
        onClose={() => setScanning(false)}
        onImported={onImported}
        onError={onError}
      />
    );
  }

  const statuses = new Map((toolStatuses ?? []).map((status) => [status.id, status]));
  const requiredToolIds = ['git', 'node', ...AGENT_CLI_PRESETS.map((preset) => `agent-cli-${preset.id}`)];
  const readyCli = AGENT_CLI_PRESETS.some((preset) => statuses.get(`agent-cli-${preset.id}`)?.installed === true);
  const toolsReady = statuses.get('git')?.installed === true && statuses.get('node')?.installed === true && readyCli;

  return (
    <main className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8" aria-labelledby="onboarding-title">
      <section className="w-full max-w-2xl rounded-xl border border-steam-elevated/70 bg-steam-panel p-5 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-steam-accent/15 p-2 text-steam-accent"><Sparkles size={22} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-steam-text/50">Primeira configuração · passo {step + 1} de {STEP_TITLES.length}</p>
            <h1 id="onboarding-title" className="text-xl font-bold">{STEP_TITLES[step]}</h1>
          </div>
          <button type="button" disabled={busy} onClick={() => void finish('dismissed')} className="rounded px-3 py-2 text-xs text-steam-text/60 hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">
            Pular assistente
          </button>
        </div>

        <div className="mb-7 h-1.5 overflow-hidden rounded-full bg-steam-elevated" role="progressbar" aria-valuemin={1} aria-valuemax={STEP_TITLES.length} aria-valuenow={step + 1} aria-label="Progresso da configuração">
          <div className="h-full rounded-full bg-steam-accent transition-all" style={{ width: `${((step + 1) / STEP_TITLES.length) * 100}%` }} />
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-steam-text/75">O Glibrary organiza seus projetos e as ferramentas de IA que ajudam a criá-los.</p>
            <p className="text-sm leading-6 text-steam-text/75">Vamos conferir o que já está instalado, conectar sua conta se quiser e abrir seu primeiro projeto.</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-steam-text/70">Para trabalhar, você precisa de Git, Node.js e pelo menos uma ferramenta de agente.</p>
            {checkingTools && <p className="flex items-center gap-2 text-sm text-steam-text/60" role="status"><Loader2 size={15} className="animate-spin" /> Verificando este computador…</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
              {requiredToolIds.map((id) => {
                const status = statuses.get(id);
                const installed = status?.installed === true;
                return (
                  <li key={id} className="flex items-center gap-2 rounded border border-steam-elevated/60 px-3 py-2 text-sm">
                    {installed ? <CircleCheck size={16} className="text-steam-green" aria-hidden="true" /> : <CircleAlert size={16} className="text-steam-text/40" aria-hidden="true" />}
                    <span className="flex-1">{toolLabel(id)}</span>
                    <span className="text-xs text-steam-text/50">{status == null ? 'Aguardando' : installed ? status.version ?? 'Instalado' : 'Não encontrado'}</span>
                  </li>
                );
              })}
            </ul>
            <p className={`text-sm ${toolsReady ? 'text-steam-green' : 'text-steam-text/60'}`} role="status">
              {toolsReady ? 'Tudo pronto para começar.' : 'Você pode continuar e instalar o que falta depois.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onOpenTools} className="inline-flex items-center gap-2 rounded border border-steam-elevated px-3 py-2 text-sm hover:bg-steam-elevated"><Wrench size={15} /> Abrir Ferramentas</button>
              <button type="button" onClick={() => void refreshTools()} disabled={checkingTools} className="rounded px-3 py-2 text-sm text-steam-accent hover:bg-steam-accent/10 disabled:opacity-50">Verificar novamente</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-steam-text/70">Conectar o GitHub permite encontrar seus repositórios e enviar suas mudanças. Você pode fazer isso agora ou continuar sem conectar.</p>
            <div className="rounded border border-steam-elevated/60 bg-steam-bg/40 p-4">
              <p className="text-sm font-medium">{checkingGithub ? 'Verificando a conta…' : githubConnected ? 'Conta GitHub conectada.' : 'Nenhuma conta conectada.'}</p>
              <p className="mt-1 text-xs leading-5 text-steam-text/55">Use o botão GitHub no topo da janela para conectar ou sair. Depois, volte e confira o estado aqui.</p>
              <button type="button" onClick={() => void refreshGithub()} disabled={checkingGithub} className="mt-3 rounded border border-steam-elevated px-3 py-1.5 text-xs hover:bg-steam-elevated disabled:opacity-50">Atualizar estado da conta</button>
            </div>
            <p className="text-xs text-steam-text/45">A entrada pelo navegador depende da configuração do aplicativo GitHub pelo mantenedor. Quando ela estiver pronta, você não precisará criar nem copiar um token.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-steam-text/70">Escolha onde guardar projetos novos. Também podemos procurar projetos e repositórios nas pastas que você já usa.</p>
            <div className="rounded border border-steam-elevated/60 bg-steam-bg/40 p-3">
              <p className="mb-1 text-xs text-steam-text/50">Pasta padrão para projetos novos</p>
              <p className="break-all font-mono text-xs">{projectRoot || 'A pasta padrão será criada quando você adicionar um projeto.'}</p>
              <button type="button" onClick={() => void chooseProjectFolder()} className="mt-3 inline-flex items-center gap-2 rounded border border-steam-elevated px-3 py-1.5 text-xs hover:bg-steam-elevated"><FolderOpen size={14} /> Escolher pasta</button>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-steam-text/60">Pastas onde posso procurar projetos existentes</p>
              {loadingFolders ? <p className="text-xs text-steam-text/50" role="status">Procurando pastas…</p> : suggestions.length === 0 ? <p className="text-xs text-steam-text/50">Nenhuma pasta sugerida. Você poderá escolher uma na próxima etapa.</p> : (
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {suggestions.map((item) => (
                    <li key={item.path}>
                      <label className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${item.exists ? 'hover:bg-steam-elevated/50' : 'text-steam-text/35'}`}>
                        <input type="checkbox" disabled={!item.exists} checked={selectedFolders.has(item.path)} onChange={() => setSelectedFolders((current) => { const next = new Set(current); if (next.has(item.path)) next.delete(item.path); else next.add(item.path); return next; })} className="accent-steam-accent" />
                        <span className="min-w-0 flex-1 break-all font-mono">{item.path}</span>
                        {!item.exists && <span>não existe</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-steam-text/70">Escolha como começar. Você pode mudar de ideia depois.</p>
            <button type="button" disabled={busy} onClick={() => void openProject()} className="flex w-full items-start gap-3 rounded border border-steam-elevated bg-steam-bg/40 p-4 text-left hover:border-steam-accent disabled:opacity-50">
              <FolderOpen size={19} className="mt-0.5 shrink-0 text-steam-accent" />
              <span><strong className="block text-sm">Abrir um projeto que já tenho</strong><span className="mt-1 block text-xs text-steam-text/55">Escolha a pasta de um projeto neste computador.</span></span>
            </button>
            <button type="button" disabled={busy} onClick={() => void startScan()} className="flex w-full items-start gap-3 rounded border border-steam-elevated bg-steam-bg/40 p-4 text-left hover:border-steam-accent disabled:opacity-50">
              <Check size={19} className="mt-0.5 shrink-0 text-steam-accent" />
              <span><strong className="block text-sm">Procurar nas pastas escolhidas</strong><span className="mt-1 block text-xs text-steam-text/55">O Glibrary mostra o que encontrou antes de adicionar qualquer item.</span></span>
            </button>
            <button type="button" disabled={busy} onClick={async () => { await finish('completed'); onOpenLibrary(); }} className="flex w-full items-start gap-3 rounded border border-steam-elevated bg-steam-bg/40 p-4 text-left hover:border-steam-accent disabled:opacity-50">
              <Sparkles size={19} className="mt-0.5 shrink-0 text-steam-accent" />
              <span><strong className="block text-sm">Começar de um modelo</strong><span className="mt-1 block text-xs text-steam-text/55">Abra a Biblioteca e escolha uma Base para iniciar um projeto.</span></span>
            </button>
            {busy && <p className="flex items-center gap-2 text-xs text-steam-text/55" role="status"><Loader2 size={14} className="animate-spin" /> Preparando…</p>}
          </div>
        )}

        {step < 4 && (
          <div className="mt-8 flex items-center justify-between border-t border-steam-elevated/50 pt-4">
            <button type="button" disabled={step === 0} onClick={() => void moveToStep(step - 1)} className="inline-flex items-center gap-1 rounded px-3 py-2 text-sm text-steam-text/60 hover:bg-steam-elevated disabled:invisible"><ArrowLeft size={15} /> Voltar</button>
            <button type="button" onClick={() => void moveToStep(step + 1)} className="inline-flex items-center gap-2 rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg hover:brightness-110">Continuar <ArrowRight size={15} /></button>
          </div>
        )}
        {step === 4 && (
          <div className="mt-8 flex items-center justify-start border-t border-steam-elevated/50 pt-4">
            <button type="button" onClick={() => void moveToStep(step - 1)} className="inline-flex items-center gap-1 rounded px-3 py-2 text-sm text-steam-text/60 hover:bg-steam-elevated"><ArrowLeft size={15} /> Voltar</button>
          </div>
        )}
      </section>
    </main>
  );
}
