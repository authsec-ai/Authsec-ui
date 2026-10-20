import { configureStore } from "@reduxjs/toolkit";
import { vi } from "vitest";

// Test helper: runs one RTK Query endpoint against a stubbed fetch and
// returns the request it sent, so a test can pin the method, path and body
// the backend route expects.

export interface SentRequest {
  method: string;
  path: string;
  body: unknown;
}

interface AnyApi {
  reducerPath: string;
  reducer: (...args: never[]) => unknown;
  middleware: (...args: never[]) => unknown;
  endpoints: Record<string, { initiate: (arg: never, opts?: never) => unknown }>;
}

export async function sendRequests(
  api: AnyApi,
  endpoint: string,
  arg: unknown,
  respond: (req: Request) => Response = () =>
    new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
): Promise<SentRequest[]> {
  const requests: Request[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const req = input instanceof Request ? input : new Request(String(input));
    requests.push(req);
    return respond(req);
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer } as never,
      middleware: (getDefault) => getDefault({ serializableCheck: false }).concat(api.middleware as never),
    });
    const result = store.dispatch(api.endpoints[endpoint].initiate(arg as never, undefined as never) as never) as {
      unwrap?: () => Promise<unknown>;
      unsubscribe?: () => void;
    };
    await Promise.resolve(result).then((r) => (r as { unwrap?: () => Promise<unknown> }).unwrap?.()).catch(() => undefined);
    (result as { unsubscribe?: () => void }).unsubscribe?.();
  } finally {
    vi.unstubAllGlobals();
  }
  return Promise.all(
    requests.map(async (req) => {
      const text = await req.text();
      let body: unknown = undefined;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      return { method: req.method, path: new URL(req.url).pathname, body };
    }),
  );
}

/** The single request an endpoint sent. */
export async function sendRequest(api: AnyApi, endpoint: string, arg: unknown): Promise<SentRequest> {
  const sent = await sendRequests(api, endpoint, arg);
  if (sent.length !== 1) throw new Error(`expected one request, got ${sent.length}`);
  return sent[0];
}
