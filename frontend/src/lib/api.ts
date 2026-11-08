/**
 * Small fetch wrapper for the Express API. It adds the JWT, parses the API's standard error shape
 * ({ error: { code, message, details, requestId } }) into an ApiError, and turns network failures
 * into a readable message.
 */

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000';

const TOKEN_KEY = 'mesh.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode): the session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Called when the API says the session is invalid, so the app can return to the login page. */
let onUnauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the server. The free-tier API may be waking up (this can take up to a minute); please try again.',
    );
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: { field: string; message: string }[]; requestId?: string } })?.error;
    if (res.status === 401 && options.auth !== false && token) onUnauthorized?.();
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details, err?.requestId);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Turns any thrown value into a message for the UI. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details?.length) return `${err.message}: ${err.details.map((d) => `${d.field} ${d.message}`).join('; ')}`;
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
