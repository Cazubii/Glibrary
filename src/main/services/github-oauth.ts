import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { GithubOAuthDeviceSession, GithubOAuthPollResult, GithubUser, Settings } from '../../shared/types';
import { decodeToken, encodeToken, fetchGithubUser } from './github-api';
import { getGithubOAuthClientId } from './github-config';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const CLOCK_SKEW_MS = 60_000;

const DeviceCodeResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().optional()
});

const DeviceTokenResponseSchema = z.object({
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  interval: z.number().int().positive().optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().optional()
}).passthrough();

export type OAuthFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GithubOAuthStore {
  getSettings(): Settings;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
}

export interface GithubOAuthDependencies {
  clientId: string;
  fetcher: OAuthFetch;
  now: () => number;
  encode: (token: string) => string;
  decode: (stored: string | undefined) => string | undefined;
  fetchUser: (token: string) => Promise<GithubUser>;
}

interface DeviceSessionRecord {
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
  nextPollAt: number;
}

function productionDependencies(overrides: Partial<GithubOAuthDependencies> = {}): GithubOAuthDependencies {
  return {
    clientId: overrides.clientId ?? getGithubOAuthClientId(),
    fetcher: overrides.fetcher ?? globalThis.fetch,
    now: overrides.now ?? Date.now,
    encode: overrides.encode ?? encodeToken,
    decode: overrides.decode ?? decodeToken,
    fetchUser: overrides.fetchUser ?? fetchGithubUser
  };
}

async function postJson(
  fetcher: OAuthFetch,
  url: string,
  params: URLSearchParams
): Promise<unknown> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Glibrary'
    },
    body: params.toString()
  });
  if (!response.ok) throw new Error(`GitHub OAuth respondeu HTTP ${response.status}. Tente novamente.`);
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error('O GitHub enviou uma resposta inválida. Tente novamente.');
  }
}

function parseTokenResponse(value: unknown): z.infer<typeof DeviceTokenResponseSchema> {
  const parsed = DeviceTokenResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error('O GitHub enviou uma resposta de autenticação inválida.');
  return parsed.data;
}

function sessionExpiredError(): Error {
  return new Error('Sua sessão do GitHub expirou. Entre novamente para continuar.');
}

async function clearOauthTokens(store: GithubOAuthStore): Promise<void> {
  await store.updateSettings({
    githubToken: '',
    githubRefreshToken: '',
    githubTokenExpiresAt: undefined,
    githubRefreshTokenExpiresAt: undefined
  });
}

async function resolveAccessToken(
  store: GithubOAuthStore,
  dependencies: GithubOAuthDependencies
): Promise<string | undefined> {
  const settings = store.getSettings();
  const accessToken = dependencies.decode(settings.githubToken);
  if (accessToken == null || accessToken === '') return undefined;
  if (settings.githubTokenExpiresAt == null || settings.githubTokenExpiresAt > dependencies.now() + CLOCK_SKEW_MS) {
    return accessToken;
  }

  const refreshToken = dependencies.decode(settings.githubRefreshToken);
  if (refreshToken == null || refreshToken === '' ||
      (settings.githubRefreshTokenExpiresAt != null && settings.githubRefreshTokenExpiresAt <= dependencies.now())) {
    await clearOauthTokens(store);
    throw sessionExpiredError();
  }
  if (dependencies.clientId === '') {
    throw new Error('A renovação do login do GitHub depende da configuração OAuth do aplicativo.');
  }

  const response = await postJson(dependencies.fetcher, ACCESS_TOKEN_URL, new URLSearchParams({
    client_id: dependencies.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }));
  const payload = parseTokenResponse(response);
  if (payload.error === 'bad_refresh_token' || payload.error === 'expired_token') {
    await clearOauthTokens(store);
    throw sessionExpiredError();
  }
  if (payload.error != null) {
    throw new Error('Não foi possível renovar a sessão do GitHub. Tente conectar a conta novamente.');
  }
  if (payload.access_token == null || payload.refresh_token == null ||
      payload.expires_in == null || payload.refresh_token_expires_in == null) {
    throw new Error('O GitHub não devolveu os novos prazos de acesso. Entre novamente para continuar.');
  }

  const refreshedAt = dependencies.now();
  await store.updateSettings({
    githubToken: dependencies.encode(payload.access_token),
    githubRefreshToken: dependencies.encode(payload.refresh_token),
    githubTokenExpiresAt: refreshedAt + payload.expires_in * 1_000,
    githubRefreshTokenExpiresAt: refreshedAt + payload.refresh_token_expires_in * 1_000
  });
  return payload.access_token;
}

const accessTokenRefreshes = new WeakMap<GithubOAuthStore, Promise<string | undefined>>();

/** Compartilha a rotação de refresh token entre handlers concorrentes do mesmo store. */
export function getGithubAccessToken(
  store: GithubOAuthStore,
  overrides: Partial<GithubOAuthDependencies> = {}
): Promise<string | undefined> {
  const pending = accessTokenRefreshes.get(store);
  if (pending != null) return pending;

  const next = resolveAccessToken(store, productionDependencies(overrides));
  accessTokenRefreshes.set(store, next);
  void next.finally(() => {
    if (accessTokenRefreshes.get(store) === next) accessTokenRefreshes.delete(store);
  }).catch(() => undefined);
  return next;
}

export class GithubOAuthService {
  private readonly dependencies: GithubOAuthDependencies;
  private readonly sessions = new Map<string, DeviceSessionRecord>();

  constructor(
    private readonly store: GithubOAuthStore,
    dependencies: Partial<GithubOAuthDependencies> = {}
  ) {
    this.dependencies = productionDependencies(dependencies);
  }

  isConfigured(): boolean {
    return this.dependencies.clientId !== '';
  }

  async startDeviceFlow(): Promise<GithubOAuthDeviceSession> {
    if (!this.isConfigured()) {
      throw new Error('A entrada rápida do GitHub depende da configuração OAuth do aplicativo. Use as opções avançadas enquanto isso.');
    }
    const now = this.dependencies.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }

    const payload = await postJson(this.dependencies.fetcher, DEVICE_CODE_URL, new URLSearchParams({
      client_id: this.dependencies.clientId,
      scope: 'offline_access'
    }));
    const parsed = DeviceCodeResponseSchema.safeParse(payload);
    if (!parsed.success) {
      const oauthError = DeviceTokenResponseSchema.safeParse(payload);
      if (oauthError.success && oauthError.data.error === 'device_flow_disabled') {
        throw new Error('O login simplificado não está habilitado na configuração do GitHub App.');
      }
      if (oauthError.success && oauthError.data.error === 'incorrect_client_credentials') {
        throw new Error('A configuração OAuth do aplicativo GitHub está incorreta.');
      }
      throw new Error('O GitHub enviou uma resposta de login inválida. Tente novamente.');
    }
    const verificationUrl = new URL(parsed.data.verification_uri);
    if (verificationUrl.origin !== 'https://github.com' || verificationUrl.pathname !== '/login/device') {
      throw new Error('O GitHub enviou um endereço de autorização inválido.');
    }

    const intervalSeconds = Math.max(5, parsed.data.interval ?? 5);
    const expiresAt = now + parsed.data.expires_in * 1_000;
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      deviceCode: parsed.data.device_code,
      expiresAt,
      intervalSeconds,
      nextPollAt: now + intervalSeconds * 1_000
    });
    return {
      sessionId,
      userCode: parsed.data.user_code,
      verificationUri: verificationUrl.toString(),
      expiresAt,
      intervalSeconds
    };
  }

  async pollDeviceFlow(sessionId: string): Promise<GithubOAuthPollResult> {
    const session = this.sessions.get(sessionId);
    if (session == null) throw new Error('Esta tentativa de login não está mais ativa. Inicie uma nova.');
    const now = this.dependencies.now();
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return { status: 'expired' };
    }
    if (session.nextPollAt > now) {
      return { status: 'pending', intervalSeconds: Math.ceil((session.nextPollAt - now) / 1_000) };
    }
    session.nextPollAt = now + session.intervalSeconds * 1_000;

    const response = await postJson(this.dependencies.fetcher, ACCESS_TOKEN_URL, new URLSearchParams({
      client_id: this.dependencies.clientId,
      device_code: session.deviceCode,
      grant_type: DEVICE_GRANT
    }));
    const payload = parseTokenResponse(response);
    if (payload.error === 'authorization_pending') {
      session.nextPollAt = this.dependencies.now() + session.intervalSeconds * 1_000;
      return { status: 'pending', intervalSeconds: session.intervalSeconds };
    }
    if (payload.error === 'slow_down') {
      session.intervalSeconds = Math.max(session.intervalSeconds + 5, payload.interval ?? 0);
      session.nextPollAt = this.dependencies.now() + session.intervalSeconds * 1_000;
      return { status: 'pending', intervalSeconds: session.intervalSeconds };
    }
    if (payload.error === 'expired_token' || payload.error === 'token_expired' || payload.error === 'bad_verification_code') {
      this.sessions.delete(sessionId);
      return { status: 'expired' };
    }
    if (payload.error === 'access_denied') {
      this.sessions.delete(sessionId);
      return { status: 'denied' };
    }
    if (payload.error === 'device_flow_disabled') {
      this.sessions.delete(sessionId);
      throw new Error('O login simplificado não está habilitado na configuração do GitHub App.');
    }
    if (payload.error != null) {
      this.sessions.delete(sessionId);
      throw new Error('O GitHub não concluiu o login. Inicie uma nova tentativa.');
    }
    if (payload.access_token == null || payload.refresh_token == null ||
        payload.expires_in == null || payload.refresh_token_expires_in == null) {
      this.sessions.delete(sessionId);
      throw new Error('O GitHub não devolveu os prazos de acesso esperados. Inicie uma nova tentativa.');
    }

    const user = await this.dependencies.fetchUser(payload.access_token);
    const authorizedAt = this.dependencies.now();
    await this.store.updateSettings({
      githubToken: this.dependencies.encode(payload.access_token),
      githubRefreshToken: this.dependencies.encode(payload.refresh_token),
      githubTokenExpiresAt: authorizedAt + payload.expires_in * 1_000,
      githubRefreshTokenExpiresAt: authorizedAt + payload.refresh_token_expires_in * 1_000
    });
    this.sessions.delete(sessionId);
    return { status: 'complete', user };
  }

  cancelDeviceFlow(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getAccessToken(): Promise<string | undefined> {
    return getGithubAccessToken(this.store, this.dependencies);
  }
}
