import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/renderer/src/lib/api';
import { useTerminalsStore } from '../src/renderer/src/store/terminals';
import type { TerminalSessionSummary } from '../src/shared/types';

vi.mock('../src/renderer/src/lib/api', () => ({
  api: {
    terminalList: vi.fn(),
    terminalCreateSession: vi.fn(),
    terminalClose: vi.fn()
  }
}));

const cwd = resolve('terminal-store-test');
const groupKey = process.platform === 'win32' ? cwd.replace(/\\/g, '/').toLocaleLowerCase('en-US') : cwd;

function session(id: string, name: string, status: 'running' | 'exited' = 'running'): TerminalSessionSummary {
  return { id, cwd, name, status, createdAt: '2026-11-12T00:00:00.000Z' };
}

describe('terminal store', () => {
  beforeEach(() => {
    useTerminalsStore.setState({ groups: {} });
    vi.clearAllMocks();
  });

  it('cria o primeiro terminal e usa o cwd canônico retornado pela main', async () => {
    vi.mocked(api.terminalList).mockResolvedValue({ cwd, sessions: [] });
    vi.mocked(api.terminalCreateSession).mockResolvedValue(session('t1', 'Terminal 1'));

    await useTerminalsStore.getState().openPanel(cwd);

    expect(useTerminalsStore.getState().groups[groupKey]).toMatchObject({
      cwd,
      sessions: [{ id: 't1', name: 'Terminal 1' }],
      activeId: 't1',
      panelOpen: true,
      loading: false,
      error: null
    });
  });

  it('restaura a aba selecionada se ainda existir e usa a primeira quando não existe', async () => {
    const sessions = [session('t1', 'Terminal 1'), session('t2', 'Terminal 2')];
    vi.mocked(api.terminalList).mockResolvedValue({ cwd, sessions });
    useTerminalsStore.setState({
      groups: {
        [groupKey]: {
          cwd,
          sessions: [],
          activeId: 't2',
          panelOpen: false,
          loading: false,
          error: null
        }
      }
    });

    await useTerminalsStore.getState().openPanel(cwd);
    expect(useTerminalsStore.getState().groups[groupKey].activeId).toBe('t2');

    useTerminalsStore.setState((state) => ({
      groups: { ...state.groups, [groupKey]: { ...state.groups[groupKey], activeId: 'gone' } }
    }));
    await useTerminalsStore.getState().openPanel(cwd);
    expect(useTerminalsStore.getState().groups[groupKey].activeId).toBe('t1');
  });

  it('fecha apenas uma aba e mantém encerrada a sessão que continua no grupo', async () => {
    const first = session('t1', 'Terminal 1');
    const second = session('t2', 'Terminal 2');
    vi.mocked(api.terminalClose).mockResolvedValue(undefined);
    useTerminalsStore.setState({
      groups: {
        [groupKey]: {
          cwd,
          sessions: [first, second],
          activeId: first.id,
          panelOpen: true,
          loading: false,
          error: null
        }
      }
    });

    await useTerminalsStore.getState().closeTerminal(cwd, first.id);
    useTerminalsStore.getState().markExited(second.id, 7);

    expect(api.terminalClose).toHaveBeenCalledWith(first.id);
    expect(api.terminalClose).toHaveBeenCalledTimes(1);
    expect(useTerminalsStore.getState().groups[groupKey]).toMatchObject({
      sessions: [{ id: second.id, status: 'exited', exitCode: 7 }],
      activeId: second.id,
      panelOpen: true
    });
  });
});
