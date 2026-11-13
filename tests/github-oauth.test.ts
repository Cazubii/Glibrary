import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../src/main/services/library-store';
import {
  GithubOAuthService,
  getGithubAccessToken,
  type GithubOAuthDependencies,
  type GithubOAuthStore,
  type OAuthFetch
} from '../src/main/services/github-oauth';
import type { Settings } from '../src/shared/types';
import { GithubOAuthSessionInputSchema } from '../src/shared/schemas';

const nowStart = Date.UTC(2026, 10, 13, 12, 0, 0);

class MemoryStore implements GithubOAuthStore {
  private settings: Settings = defaultSettings('/projects');

  getSettings(): Settings {
    return this.settings;
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    this.settings = { ...this.settings, ...patch };
    return this.settings;
  }
}

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

function dependencies(fetcher: OAuthFetch, now: () => number): GithubOAuthDependencies {
  return {
    clientId: 'public-client-id',
    fetcher,
    now,
    encode: (token) => `cipher:${token}`,
    decode: (token) => token?.startsWith('cipher:') ? token.slice('cipher:'.length) : token,
    fetchUser: async (token) => ({ login: token === 'oauth-access' ? 'primeira-pessoa' : 'conta-renovada' })
  };
}

function deviceCodeResponse(): Response {
  return response({
    device_code: 'device-secret',
    user_code: 'ABCD-EFGH',
    verification_uri: 'https://github.com/login/device',
    expires_in: 900,
    interval: 5
  });
}

describe('GithubOAuthService', () => {
  it('mantém device_code no processo principal e respeita o intervalo mínimo de polling', async () => {
    let now = nowStart;
    const fetcher: OAuthFetch = vi.fn()
      .mockResolvedValueOnce(deviceCodeResponse())
      .mockResolvedValueOnce(response({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(response({ error: 'slow_down' }))
      .mockResolvedValueOnce(response({
        access_token: 'oauth-access',
        refresh_token: 'oauth-refresh',
        expires_in: 28_800,
        refresh_token_expires_in: 15_897_600
      }));
    const store = new MemoryStore();
    const service = new GithubOAuthService(store, dependencies(fetcher, () => now));

    const started = await service.startDeviceFlow();
    expect(started.userCode).toBe('ABCD-EFGH');
    expect('deviceCode' in started).toBe(false);
    expect(JSON.stringify(started)).not.toContain('device-secret');
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://github.com/login/device/code', expect.objectContaining({
      method: 'POST',
      body: 'client_id=public-client-id&scope=offline_access'
    }));

    now += 5_000;
    expect(await service.pollDeviceFlow(started.sessionId)).toEqual({ status: 'pending', intervalSeconds: 5 });
    now += 5_000;
    expect(await service.pollDeviceFlow(started.sessionId)).toEqual({ status: 'pending', intervalSeconds: 10 });
    expect(fetcher).toHaveBeenCalledTimes(3);

    now += 10_000;
    expect(await service.pollDeviceFlow(started.sessionId)).toEqual({
      status: 'complete',
      user: { login: 'primeira-pessoa' }
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenNthCalledWith(4, 'https://github.com/login/oauth/access_token', expect.objectContaining({
      method: 'POST',
      body: 'client_id=public-client-id&device_code=device-secret&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code'
    }));
    expect(store.getSettings().githubToken).toBe('cipher:oauth-access');
    expect(store.getSettings().githubRefreshToken).toBe('cipher:oauth-refresh');
    expect(store.getSettings().githubTokenExpiresAt).toBe(now + 28_800_000);
    expect(store.getSettings().githubRefreshTokenExpiresAt).toBe(now + 15_897_600_000);
  });

  it('encerra o fluxo quando o código expira ou a pessoa nega a autorização', async () => {
    let now = nowStart;
    const fetcher: OAuthFetch = vi.fn()
      .mockResolvedValueOnce(deviceCodeResponse())
      .mockResolvedValueOnce(response({ error: 'access_denied' }))
      .mockResolvedValueOnce(deviceCodeResponse());
    const service = new GithubOAuthService(new MemoryStore(), dependencies(fetcher, () => now));

    const denied = await service.startDeviceFlow();
    now += 5_000;
    expect(await service.pollDeviceFlow(denied.sessionId)).toEqual({ status: 'denied' });

    const expired = await service.startDeviceFlow();
    now += 900_000;
    expect(await service.pollDeviceFlow(expired.sessionId)).toEqual({ status: 'expired' });
  });

  it('rejeita respostas incompletas e links de autorização que não pertencem ao GitHub', async () => {
    const incompleteFetcher: OAuthFetch = vi.fn().mockResolvedValue(response({ error: 'incorrect_client_credentials' }));
    const incompleteService = new GithubOAuthService(new MemoryStore(), dependencies(incompleteFetcher, () => nowStart));
    await expect(incompleteService.startDeviceFlow()).rejects.toThrow(/configuração OAuth/i);

    const unsafeFetcher: OAuthFetch = vi.fn().mockResolvedValue(response({
      device_code: 'private-device-code',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://example.com/login/device',
      expires_in: 900,
      interval: 5
    }));
    const unsafeService = new GithubOAuthService(new MemoryStore(), dependencies(unsafeFetcher, () => nowStart));
    await expect(unsafeService.startDeviceFlow()).rejects.toThrow(/endereço de autorização inválido/i);
  });

  it('limpa a tentativa cancelada e permite tentar novamente após uma falha de rede', async () => {
    const fetcher: OAuthFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(deviceCodeResponse());
    const service = new GithubOAuthService(new MemoryStore(), dependencies(fetcher, () => nowStart));

    await expect(service.startDeviceFlow()).rejects.toThrow('fetch failed');
    const started = await service.startDeviceFlow();
    service.cancelDeviceFlow(started.sessionId);
    await expect(service.pollDeviceFlow(started.sessionId)).rejects.toThrow(/não está mais ativa/i);
  });

  it('não inicia quando o client ID não foi configurado', async () => {
    const fetcher: OAuthFetch = vi.fn();
    const service = new GithubOAuthService(new MemoryStore(), {
      ...dependencies(fetcher, () => nowStart),
      clientId: ''
    });

    await expect(service.startDeviceFlow()).rejects.toThrow(/configuração OAuth/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('mantém PAT funcional sem chamar o endpoint de renovação', async () => {
    const store = new MemoryStore();
    await store.updateSettings({ githubToken: 'cipher:personal-token' });
    const fetcher: OAuthFetch = vi.fn();

    await expect(getGithubAccessToken(store, dependencies(fetcher, () => nowStart))).resolves.toBe('personal-token');
    expect(fetcher).not.toHaveBeenCalled();
    expect(GithubOAuthSessionInputSchema.safeParse({ sessionId: 'not-a-uuid' }).success).toBe(false);
    expect(GithubOAuthSessionInputSchema.safeParse({ sessionId: '2f255852-401d-4dbd-8dbd-1b502f47e3e2' }).success).toBe(true);
  });

  it('renova e persiste access token e refresh token rotacionados antes de devolver acesso', async () => {
    const store = new MemoryStore();
    await store.updateSettings({
      githubToken: 'cipher:old-access',
      githubRefreshToken: 'cipher:old-refresh',
      githubTokenExpiresAt: nowStart + 10_000,
      githubRefreshTokenExpiresAt: nowStart + 60_000
    });
    const fetcher: OAuthFetch = vi.fn().mockResolvedValue(response({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 28_800,
      refresh_token_expires_in: 15_897_600
    }));

    await expect(getGithubAccessToken(store, dependencies(fetcher, () => nowStart))).resolves.toBe('new-access');
    expect(fetcher).toHaveBeenCalledWith('https://github.com/login/oauth/access_token', expect.objectContaining({
      body: 'client_id=public-client-id&grant_type=refresh_token&refresh_token=old-refresh'
    }));
    expect(store.getSettings()).toMatchObject({
      githubToken: 'cipher:new-access',
      githubRefreshToken: 'cipher:new-refresh',
      githubTokenExpiresAt: nowStart + 28_800_000,
      githubRefreshTokenExpiresAt: nowStart + 15_897_600_000
    });
  });

  it('compartilha uma renovação concorrente para não reutilizar o mesmo refresh token', async () => {
    const store = new MemoryStore();
    await store.updateSettings({
      githubToken: 'cipher:old-access',
      githubRefreshToken: 'cipher:old-refresh',
      githubTokenExpiresAt: nowStart + 5_000,
      githubRefreshTokenExpiresAt: nowStart + 60_000
    });
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetcher: OAuthFetch = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const deps = dependencies(fetcher, () => nowStart);

    const first = getGithubAccessToken(store, deps);
    const second = getGithubAccessToken(store, deps);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveResponse?.(response({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      expires_in: 28_800,
      refresh_token_expires_in: 15_897_600
    }));
    await expect(Promise.all([first, second])).resolves.toEqual(['rotated-access', 'rotated-access']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('limpa a autorização local quando o refresh token expirou no GitHub', async () => {
    const store = new MemoryStore();
    await store.updateSettings({
      githubToken: 'cipher:old-access',
      githubRefreshToken: 'cipher:old-refresh',
      githubTokenExpiresAt: nowStart - 1,
      githubRefreshTokenExpiresAt: nowStart + 60_000
    });
    const fetcher: OAuthFetch = vi.fn().mockResolvedValue(response({ error: 'bad_refresh_token' }));

    await expect(getGithubAccessToken(store, dependencies(fetcher, () => nowStart))).rejects.toThrow(/entre novamente/i);
    expect(store.getSettings().githubToken).toBe('');
    expect(store.getSettings().githubRefreshToken).toBe('');
  });

  it('não retorna token OAuth expirado quando não há refresh token', async () => {
    const store = new MemoryStore();
    await store.updateSettings({
      githubToken: 'cipher:expired',
      githubTokenExpiresAt: nowStart - 1
    });

    await expect(getGithubAccessToken(store, dependencies(vi.fn(), () => nowStart))).rejects.toThrow(/entre novamente/i);
  });
});
