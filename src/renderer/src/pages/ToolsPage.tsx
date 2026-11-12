import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, RefreshCw, Wrench, X, Zap } from 'lucide-react';
import type { UserTool } from '@shared/types';
import type { ToolStatus } from '@shared/tools';
import { TOOLS } from '@shared/tools';
import { useLibraryStore } from '../store/library';
import NativeToolsPanel from '../components/NativeToolsPanel';

interface Props {
  onError: (message: string) => void;
}

function ToggleSwitch({
  value,
  onChange,
  disabled
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${value ? 'bg-steam-green' : 'bg-steam-elevated'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

/** Área de Ferramentas: detecção do sistema + ferramentas próprias com chave on/off (uso rápido nos projetos). */
export default function ToolsPage({ onError }: Props): React.JSX.Element {
  const { tools, toolsLoaded, loadTools, settings, updateSettings } = useLibraryStore();
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadTools();
  }, []);

  const userTools = useMemo(() => settings?.userTools ?? [], [settings]);

  const saveTools = async (next: UserTool[]): Promise<void> => {
    setSaving(true);
    try {
      await updateSettings({ userTools: next });
    } catch (e) {
      // silenciamos? não: settings error path already surfaces via store
      console.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const addTool = async (): Promise<void> => {
    if (name.trim() === '' || command.trim() === '') return;
    await saveTools([
      ...userTools.filter((t) => t.name.toLowerCase() !== name.trim().toLowerCase()),
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        command: command.trim(),
        ...(description.trim() !== '' ? { description: description.trim() } : {}),
        enabled: false,
        keepAlive: false
      }
    ]);
    setName('');
    setCommand('');
    setDescription('');
  };

  const removeTool = (id: string): void => {
    void saveTools(userTools.filter((t) => t.id !== id));
  };

  const toggleTool = (id: string, enabled: boolean): void => {
    void saveTools(userTools.map((t) => (t.id === id ? { ...t, enabled } : t)));
  };

  const toolStatusById = useMemo(() => new Map<string, ToolStatus>(tools.map((t) => [t.id, t])), [tools]);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-steam-elevated/50 px-6 py-3">
        <Wrench size={18} className="text-steam-accent" />
        <div className="mr-auto">
          <h1 className="text-lg font-bold">Ferramentas</h1>
          <p className="text-xs text-steam-text/50">Ferramentas ligadas viram botão de uso rápido no card do projeto.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadTools(true)}
          className="flex items-center gap-2 rounded bg-steam-elevated px-3 py-1.5 text-sm hover:bg-steam-accent/20"
        >
          <RefreshCw size={14} /> Re-verificar sistema
        </button>
      </header>

      <div className="flex-1 px-6 py-4">
        <NativeToolsPanel onError={onError} />
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Zap size={14} className="text-steam-accent" /> Minhas ferramentas ({userTools.length})
          </h2>

          <div className="mb-3 flex flex-col gap-2 rounded-lg bg-steam-panel p-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome (ex.: pnpm test)"
                className="w-40 rounded border border-steam-elevated bg-steam-bg px-2 py-1.5 text-sm outline-none focus:border-steam-accent"
              />
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Comando exato (ex.: pnpm test --run)"
                className="min-w-52 flex-1 rounded border border-steam-elevated bg-steam-bg px-2 py-1.5 font-mono text-sm outline-none focus:border-steam-accent"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição (opcional)"
                className="w-56 rounded border border-steam-elevated bg-steam-bg px-2 py-1.5 text-sm outline-none focus:border-steam-accent"
              />
              <button
                type="button"
                disabled={saving || name.trim() === '' || command.trim() === ''}
                onClick={() => void addTool()}
                className="rounded bg-steam-accent px-3 py-1.5 text-sm font-semibold text-steam-bg disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
            <p className="text-xs text-steam-text/40">
              Ligadas aparecem nos projetos; ao executar sempre revisamos o comando antes. Marque <em>longa duração</em> para dev servers.
            </p>
          </div>

          {userTools.length === 0 ? (
            <p className="mb-6 text-sm text-steam-text/50">Nenhuma ferramenta configurada ainda.</p>
          ) : (
            <ul className="mb-6 space-y-2">
              {userTools.map((tool) => (
                <li key={tool.id} className="flex items-center gap-3 rounded border border-steam-elevated bg-steam-panel px-3 py-2">
                  <ToggleSwitch value={tool.enabled} onChange={(next) => toggleTool(tool.id, next)} disabled={saving} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {tool.name}
                      <button
                        type="button"
                        onClick={() => void saveTools(userTools.map((t) => (t.id === tool.id ? { ...t, keepAlive: t.keepAlive !== true } : t)))}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${tool.keepAlive ? 'bg-steam-warn/20 text-steam-warn' : 'bg-steam-elevated text-steam-text/40'}`}
                        title="Longo duração = dev server (executa desacoplado, sem capturar saída)"
                      >
                        {tool.keepAlive ? 'longa duração' : 'captura saída'}
                      </button>
                    </div>
                    <div className="truncate font-mono text-xs text-steam-text/60">{tool.command}</div>
                    {tool.description != null && <div className="text-xs text-steam-text/40">{tool.description}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTool(tool.id)}
                    className="rounded p-1.5 text-steam-text/50 hover:bg-steam-error/15 hover:text-steam-error"
                    aria-label={`Remover ${tool.name}`}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-steam-elevated/40 pt-4">
          <h2 className="mb-3 text-sm font-semibold">Ferramentas do sistema</h2>
          {!toolsLoaded ? (
            <p className="text-sm text-steam-text/60">Verificando ferramentas…</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-steam-elevated/50 text-left text-steam-text/60">
                  <th className="py-2 pr-4 font-medium">Ferramenta</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Versão</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {TOOLS.map((tool) => {
                  const status = toolStatusById.get(tool.id);
                  const installed = status?.installed === true;
                  return (
                    <tr key={tool.id} className="border-b border-steam-elevated/20">
                      <td className="py-2 pr-4 font-semibold">{tool.name}</td>
                      <td className="py-2 pr-4">
                        {installed ? (
                          <span className="flex items-center gap-1 text-steam-green"><Check size={14} /> instalada</span>
                        ) : (
                          <span className="flex items-center gap-1 text-steam-error"><X size={14} /> não encontrada</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-steam-text/70">{status?.version ?? '—'}</td>
                      <td className="py-2">
                        {!installed && tool.downloadUrl != null && (
                          <a href={tool.downloadUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-steam-accent hover:underline">
                            baixar <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
