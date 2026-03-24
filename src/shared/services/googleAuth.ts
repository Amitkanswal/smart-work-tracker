import { CHROME_LOCAL_GOOGLE_WEB_TOKEN_KEY } from '../constants';
import { getSettings } from '../storage/settingsStore';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

type WebTokenCache = { accessToken: string; expiresAt: number };

export function hasBuildTimeGoogleOAuthClient(): boolean {
  return Boolean(manifestOAuthClientId());
}

function manifestOAuthClientId(): string | undefined {
  try {
    return chrome.runtime.getManifest().oauth2?.client_id;
  } catch {
    return undefined;
  }
}

async function readWebTokenCache(): Promise<WebTokenCache | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHROME_LOCAL_GOOGLE_WEB_TOKEN_KEY, (r) => {
      const v = r[CHROME_LOCAL_GOOGLE_WEB_TOKEN_KEY] as WebTokenCache | undefined;
      if (v?.accessToken && typeof v.expiresAt === 'number') {
        resolve(v);
      } else {
        resolve(null);
      }
    });
  });
}

async function writeWebTokenCache(data: WebTokenCache | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (data) {
      chrome.storage.local.set({ [CHROME_LOCAL_GOOGLE_WEB_TOKEN_KEY]: data }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    } else {
      chrome.storage.local.remove(CHROME_LOCAL_GOOGLE_WEB_TOKEN_KEY, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    }
  });
}

function getAuthTokenFromManifest(interactive: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
        return;
      }
      resolve(token);
    });
  });
}

function buildInteractiveAuthUrl(clientId: string): string {
  const redirectUri = chrome.identity.getRedirectURL();
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('include_granted_scopes', 'true');
  return u.toString();
}

function launchWebAuthFlowForToken(clientId: string): Promise<{ accessToken: string; expiresIn: number } | null> {
  const url = buildInteractiveAuthUrl(clientId);
  return new Promise((resolve) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        resolve(null);
        return;
      }
      try {
        const hash = new URL(redirectUrl).hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10);
        if (!accessToken) {
          resolve(null);
          return;
        }
        resolve({ accessToken, expiresIn: Number.isFinite(expiresIn) ? expiresIn : 3600 });
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Access token: manifest `oauth2` client (build-time) if present; otherwise user-supplied Client ID + `launchWebAuthFlow`.
 * The Google account is always the one the user picks in the consent screen — the Client ID identifies the OAuth *app*, not the user.
 */
export async function getAccessToken(interactive: boolean): Promise<string | null> {
  const manifestId = manifestOAuthClientId();

  if (manifestId) {
    return getAuthTokenFromManifest(interactive);
  }

  const settings = await getSettings();
  const clientId = settings.googleOAuthClientId?.trim();
  if (!clientId) {
    return null;
  }

  const cached = await readWebTokenCache();
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  if (!interactive) {
    return null;
  }

  const result = await launchWebAuthFlowForToken(clientId);
  if (!result) {
    return null;
  }

  const expiresAt = Date.now() + Math.max(60, result.expiresIn) * 1000;
  await writeWebTokenCache({ accessToken: result.accessToken, expiresAt });
  return result.accessToken;
}

export async function revokeGoogleSession(): Promise<void> {
  await writeWebTokenCache(null);

  const manifestId = manifestOAuthClientId();
  if (!manifestId || !chrome.identity?.getAuthToken) {
    return;
  }

  const token = await new Promise<string | null>((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (t) => {
      if (chrome.runtime.lastError || !t) {
        resolve(null);
        return;
      }
      resolve(t);
    });
  });

  if (token && chrome.identity.removeCachedAuthToken) {
    await new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  }
}

export function getOAuthRedirectUriForHelp(): string {
  return chrome.identity.getRedirectURL();
}

export async function getUserEmail(): Promise<string | null> {
  const token = await getAccessToken(false);
  if (!token) {
    return null;
  }
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}
