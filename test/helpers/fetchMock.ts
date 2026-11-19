import { vi } from 'vitest';

/** Route key for the Google auth endpoints (host + path, API key ignored). */
export const LOGIN_ROUTE = 'www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword';
export const REFRESH_ROUTE = 'securetoken.googleapis.com/v1/token';

export interface RecordedRequest {
  method: string;
  url: string;
  /** Path + query for api.ohme.io, host + path for anything else. */
  route: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal | null;
}

export interface Reply {
  status?: number;
  json?: unknown;
  text?: string;
}

type ReplySpec = Reply | ((req: RecordedRequest) => Reply | Promise<Reply>);

interface Route {
  method: string;
  route: string;
  reply: ReplySpec;
  once: boolean;
}

function routeOf(url: string): string {
  const u = new URL(url);
  return u.host === 'api.ohme.io' ? `${u.pathname}${u.search}` : `${u.host}${u.pathname}`;
}

function parseBody(body: unknown): unknown {
  if (body == null) return undefined;
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Replaces global fetch with a router. Unmocked requests throw, so a test can
 * never reach the network or silently depend on an endpoint it didn't declare.
 * `once` routes are consumed in order before falling back to persistent ones.
 */
export function installFetchMock() {
  const routes: Route[] = [];
  const calls: RecordedRequest[] = [];

  const fetchFn = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const req: RecordedRequest = {
      method: (init.method ?? 'GET').toUpperCase(),
      url,
      route: routeOf(url),
      headers: { ...(init.headers as Record<string, string>) },
      body: parseBody(init.body),
      signal: init.signal,
    };
    calls.push(req);

    const idx = routes.findIndex((r) => r.method === req.method && r.route === req.route);
    if (idx === -1) {
      throw new Error(`Unmocked request: ${req.method} ${req.route}`);
    }
    const match = routes[idx];
    if (match.once) routes.splice(idx, 1);

    const reply = typeof match.reply === 'function' ? await match.reply(req) : match.reply;
    const text = reply.text ?? (reply.json === undefined ? '' : JSON.stringify(reply.json));
    return new Response(text, { status: reply.status ?? 200 });
  });

  vi.stubGlobal('fetch', fetchFn);

  function register(once: boolean, method: string, route: string, reply: ReplySpec): void {
    const entry = {
      method, route, reply, once,
    };
    if (once) {
      // once-routes take priority over persistent ones, in registration order
      const firstPersistent = routes.findIndex((r) => !r.once);
      routes.splice(firstPersistent === -1 ? routes.length : firstPersistent, 0, entry);
    } else {
      routes.push(entry);
    }
  }

  const mock = {
    fetch: fetchFn,
    calls,
    on(method: string, route: string, reply: ReplySpec = { json: {} }) {
      register(false, method, route, reply);
      return mock;
    },
    once(method: string, route: string, reply: ReplySpec = { json: {} }) {
      register(true, method, route, reply);
      return mock;
    },
    callsTo: (method: string, route: string) => calls.filter((c) => c.method === method && c.route === route),
  };
  return mock;
}

export type FetchMock = ReturnType<typeof installFetchMock>;
