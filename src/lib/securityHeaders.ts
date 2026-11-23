/**
 * HTTP security headers for every response, plus a per-request CSP nonce for HTML.
 * Applied in src/server.ts around the TanStack Start handler.
 *
 * - HTML: strict CSP with a fresh per-request nonce. The nonce is handed to the TanStack router
 *   (router.options.ssr.nonce, see src/router.tsx + NONCE_HEADER) so ONLY scripts the framework
 *   itself emits carry it. Nothing is added to the HTML afterwards, so injected markup can never
 *   obtain a valid nonce (review finding M1/HIGH-1, 2026-10).
 * - frame-ancestors 'none' + X-Frame-Options DENY (clickjacking).
 * - HTML responses are never stored in shared caches (the nonce changes per request).
 */

/** Internal request header carrying the nonce from src/server.ts to the router. Overwritten on
 *  every request, so a client-sent value is never trusted. */
export const NONCE_HEADER = "x-ohda-csp-nonce";

/** Exact backend origin (no wildcard: any *.supabase.co tenant could receive exfiltrated data). */
export function backendOrigin(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "https:" && u.hostname.endsWith(".supabase.co") ? u.origin : null;
  } catch {
    return null;
  }
}

export function makeNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/=+$/, "");
}

export function buildCsp(nonce: string, connectExtra: string[] = []): string {
  const connect = ["'self'", ...connectExtra].join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export const STATIC_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), " +
    "magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
  "X-Permitted-Cross-Domain-Policies": "none",
};

/** Number of <script> tags that do NOT carry the given nonce (should be 0 for our own pages). */
export function scriptsWithoutNonce(html: string, nonce: string): number {
  const all = html.match(/<script\b[^>]*>/gi) ?? [];
  return all.filter((t) => !t.includes(`nonce="${nonce}"`)).length;
}

export async function secureResponse(
  response: Response,
  opts: { nonce?: string; connectExtra?: string[] } = {},
): Promise<Response> {
  // Upgrades (e.g. WebSocket) and opaque special responses are returned untouched.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(STATIC_HEADERS)) headers.set(k, v);
  headers.delete("x-powered-by");
  headers.delete("server");
  headers.delete(NONCE_HEADER);

  const type = headers.get("content-type") ?? "";
  if (type.includes("text/html")) {
    // The body is streamed through untouched: the router already put the nonce on its own
    // scripts, so there is nothing to rewrite (keeps SSR streaming, ETag/encoding intact).
    headers.set("Content-Security-Policy", buildCsp(opts.nonce ?? makeNonce(), opts.connectExtra));
    headers.set("Cache-Control", "no-store");
  } else {
    // Non-HTML documents (JSON from server functions, errors): nothing may load or frame them.
    // Static JS/CSS/worker files are served by the asset layer with public/_headers instead.
    headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }
  const bodyless = response.status === 204 || response.status === 304 || response.body === null;
  return new Response(bodyless ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
