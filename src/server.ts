import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { NONCE_HEADER, backendOrigin, makeNonce, secureResponse } from "./lib/securityHeaders";

const BACKEND = backendOrigin(import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
const CONNECT = BACKEND ? [BACKEND] : [];

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
      (e: unknown) => {
        serverEntryPromise = undefined; // retry on the next request instead of failing forever
        throw e;
      },
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  // only small bodies can be the h3 marker; never buffer large error bodies
  const len = Number(response.headers.get("content-length") ?? "0");
  if (len > 4096) return response;
  const body = await readAtMost(response.clone(), 4096);
  if (body === null) return response;
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Reads at most `max` bytes of a body; returns null (and cancels) if it is longer. */
async function readAtMost(r: Response, max: number): Promise<string | null> {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel().catch(() => undefined); // never wait on the cloned branch
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = makeNonce();
    const opts = { nonce, connectExtra: CONNECT };
    try {
      const handler = await getServerEntry();
      // pass the nonce to the router via an internal header; any client-sent value is replaced
      const headers = new Headers(request.headers);
      headers.set(NONCE_HEADER, nonce);
      const response = await handler.fetch(new Request(request, { headers }), env, ctx);
      return await secureResponse(await normalizeCatastrophicSsrResponse(response), opts);
    } catch (error) {
      console.error(error);
      return secureResponse(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        opts,
      );
    }
  },
};
