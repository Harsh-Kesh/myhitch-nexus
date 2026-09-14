// Server-only. Thin foundation for talking to Auth0's Authentication API and Management API
// (see docs/AUTH0_INTEGRATION_STANDARD.md). No signup/login/MFA business logic lives here —
// just the low-level fetch helpers and Management API token caching that later routes build
// on. Structurally identical to MYHitch Pass's auth0Client.ts (the reference implementation)
// — this file should not diverge from that one without a reason that applies platform-wide.
import "server-only";

export class Auth0ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "Auth0ApiError";
  }
}

function getDomain(): string {
  const domain = process.env.AUTH0_DOMAIN;
  if (!domain) throw new Error("Missing required environment variable: AUTH0_DOMAIN");
  return domain;
}

async function parseErrorBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/**
 * Calls Auth0's Authentication API (e.g. `/oauth/token`, `/mfa/challenge`) at the
 * tenant's own domain. Throws Auth0ApiError on any non-2xx response instead of
 * returning it, so callers can't accidentally treat a 401/403 as success.
 */
export async function auth0Fetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `https://${getDomain()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new Auth0ApiError(`Auth0 Authentication API request to ${path} failed (${res.status})`, res.status, body);
  }

  return res;
}

interface CachedManagementToken {
  accessToken: string;
  expiresAt: number;
}

let cachedManagementToken: CachedManagementToken | null = null;

// Refresh this many seconds before actual expiry, so an in-flight request never gets handed
// a token that Auth0 rejects for having expired mid-air.
const MANAGEMENT_TOKEN_EXPIRY_LEEWAY_SECONDS = 60;

/**
 * Obtains (and caches in server memory) a Management API access token for the M2M
 * application. Never logs or otherwise exposes the token; callers should only pass it
 * through auth0ManagementFetch().
 */
export async function getManagementToken(): Promise<string> {
  const now = Date.now();
  if (cachedManagementToken && cachedManagementToken.expiresAt > now) {
    return cachedManagementToken.accessToken;
  }

  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const audience = process.env.AUTH0_API_AUDIENCE;
  if (!clientId || !clientSecret || !audience) {
    throw new Error(
      "Missing required environment variable(s) for Auth0 Management API: AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET, AUTH0_API_AUDIENCE",
    );
  }

  const res = await auth0Fetch("/oauth/token", {
    method: "POST",
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    }),
  });

  const data = (await res.json()) as { access_token: string; expires_in: number };

  cachedManagementToken = {
    accessToken: data.access_token,
    expiresAt: now + Math.max(0, data.expires_in - MANAGEMENT_TOKEN_EXPIRY_LEEWAY_SECONDS) * 1000,
  };

  return cachedManagementToken.accessToken;
}

/**
 * Calls Auth0's Management API (`/api/v2/...`) with a cached M2M token attached.
 * Throws Auth0ApiError on any non-2xx response.
 */
export async function auth0ManagementFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getManagementToken();
  const url = `https://${getDomain()}/api/v2${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new Auth0ApiError(`Auth0 Management API request to ${path} failed (${res.status})`, res.status, body);
  }

  return res;
}
