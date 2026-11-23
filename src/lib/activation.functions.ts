/**
 * Server function: redeem an activation code and return a signed entitlement token.
 *
 * - Idempotent: the browser sends a random request id with the code and reuses it on retry.
 *   The DB returns the original result for the same (request id, code) without consuming
 *   another use, so a lost response never costs the customer a paid use (review H2-04).
 * - Rate limited per client IP. The IP is never stored: the bucket is an HMAC keyed with a
 *   server secret derived from the signing key, and changes daily (review M2-07).
 * - The active signing key is loaded first; it is generated inside the server on first need. If
 *   it is missing, does not match its published public key, or is not pinned in the shipped
 *   bundle yet (release gate), nothing is consumed.
 * - redeem_activation_v2 is callable by the service role only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toAsciiDigits } from "@/lib/ohdaCrypto";

export type RedeemResult =
  | { ok: true; token: string; plan: "single" | "family"; kid: string; publicKey: string }
  | { ok: false; reason: "invalid" | "used" | "rate_limited" | "unavailable" | "update_required" };

type RpcResult<T> = { data: T | null; error: unknown };
export interface RedeemDeps {
  rateLimitHit: (bucket: string) => Promise<RpcResult<boolean>>;
  loadSigningKey: () => Promise<
    RpcResult<
      {
        id?: string;
        pkcs8_b64url?: string;
        public_raw_b64url?: string;
        rate_secret?: string | null;
      }[]
    >
  >;
  /** generate + install a key inside the server when none is active (never replaces one) */
  ensureKey: () => Promise<void>;
  redeem: (code: string, requestId: string) => Promise<RpcResult<unknown>>;
  now?: () => Date;
  /** RATE_LIMIT_SECRET from the server environment (survives signing-key rotation) */
  rateSecret?: string | undefined;
  /** keys pinned in the shipped bundle (ENTITLEMENT_PUBLIC_KEYS); release gate, review H6-03 */
  pinnedKeys: Record<string, string>;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Daily, keyed bucket for an IP: HMAC-SHA256(secret, ip|day). Not reversible without the secret. */
export async function rateBucket(ip: string, now: Date, secret: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode("ohda-rate-limit|" + secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const day = now.toISOString().slice(0, 10);
  return `redeem:${hex(await crypto.subtle.sign("HMAC", k, enc.encode(`${ip}|${day}`))).slice(0, 32)}`;
}

/** Pure core, unit-tested with fake deps. */
export async function redeemCore(
  rawCode: unknown,
  rawRequestId: unknown,
  ip: string,
  deps: RedeemDeps,
  /** "kid:publicKey" entries pinned in the bundle the browser is actually running */
  clientPins: readonly string[] = [],
): Promise<RedeemResult> {
  const code = typeof rawCode === "string" ? toAsciiDigits(rawCode).trim() : "";
  const requestId = typeof rawRequestId === "string" ? rawRequestId : "";
  const now = deps.now?.() ?? new Date();

  let key = await deps.loadSigningKey();
  if (!key.error && Array.isArray(key.data) && key.data.length === 0) {
    try {
      await deps.ensureKey();
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    key = await deps.loadSigningKey();
  }
  const row = Array.isArray(key.data) ? key.data[0] : undefined;
  if (key.error || !row?.pkcs8_b64url || !row.id || !row.public_raw_b64url)
    return { ok: false, reason: "unavailable" };
  // Release gate (review H6-03): sell only with a key every browser can verify offline later.
  // A key that is not pinned in the shipped bundle consumes nothing; the release owner pins its
  // public half and redeploys first. This also covers rotation: a new key works once pinned.
  if (deps.pinnedKeys[row.id] !== row.public_raw_b64url)
    return { ok: false, reason: "unavailable" };
  // Client compatibility (review H6-04): a browser still running an older bundle without this key
  // could store a token it cannot verify offline later. It is asked to reload; nothing consumed.
  // Not an authentication step (a browser can claim anything); it protects ordinary customers.
  if (!clientPins.includes(`${row.id}:${row.public_raw_b64url}`))
    return { ok: false, reason: "update_required" };

  // stable secret kept in the database, independent of signing-key rotation; fail closed
  const rateSecret = deps.rateSecret || row.rate_secret;
  if (!rateSecret || rateSecret.length < 32) return { ok: false, reason: "unavailable" };
  const rl = await deps.rateLimitHit(await rateBucket(ip, now, rateSecret));
  if (rl.error) return { ok: false, reason: "unavailable" };
  if (rl.data !== true) return { ok: false, reason: "rate_limited" };

  // cheap shape checks after counting the attempt (garbage still costs a rate-limit hit)
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (norm.length < 16 || norm.length > 40) return { ok: false, reason: "invalid" };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(requestId)) return { ok: false, reason: "invalid" };

  const { importPrivateKeyPkcs8, publicKeyOfPkcs8, signEntitlement } =
    await import("@/lib/entitlement");
  let signingKey: CryptoKey;
  try {
    // the private key must match the public key browsers get for its id, otherwise a paid use
    // would be consumed for a token no browser can verify
    if ((await publicKeyOfPkcs8(row.pkcs8_b64url)) !== row.public_raw_b64url)
      return { ok: false, reason: "unavailable" };
    signingKey = await importPrivateKeyPkcs8(row.pkcs8_b64url);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const r = await deps.redeem(code, requestId);
  if (r.error || !r.data) return { ok: false, reason: "unavailable" };
  const res = r.data as { ok?: boolean; plan?: unknown; ref?: unknown; reason?: unknown };
  if (
    res.ok !== true ||
    (res.plan !== "single" && res.plan !== "family") ||
    typeof res.ref !== "string"
  ) {
    return { ok: false, reason: res.reason === "used" ? "used" : "invalid" };
  }
  // If signing fails here the use is recorded, but a retry with the same request id is replayed
  // by the DB without consuming another use and gets a fresh token.
  const token = await signEntitlement(
    { v: 1, kid: row.id, plan: res.plan, ref: res.ref, iat: Math.floor(now.getTime() / 1000) },
    signingKey,
  );
  // the public half travels with the token so the browser can verify it immediately, without a
  // second key-discovery request that might fail after the use was recorded (review H6-02)
  return { ok: true, token, plan: res.plan, kid: row.id, publicKey: row.public_raw_b64url };
}

const Input = z.object({
  code: z.string().max(64),
  requestId: z.string().max(64),
  pins: z.array(z.string().max(80)).max(20).default([]),
});

export const redeemActivation = createServerFn({ method: "POST" })
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<RedeemResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // only a header the hosting edge sets itself (Cloudflare or Vercel); see clientIp.ts
    const { clientIp } = await import("@/lib/clientIp");
    const ip = clientIp((name) => getRequestHeader(name));
    const rateSecret =
      typeof process !== "undefined" ? process.env["RATE_LIMIT_SECRET"] : undefined;
    const { ENTITLEMENT_PUBLIC_KEYS } = await import("@/lib/entitlementKey");
    return redeemCore(
      data.code,
      data.requestId,
      ip,
      {
        rateSecret,
        pinnedKeys: ENTITLEMENT_PUBLIC_KEYS,
        rateLimitHit: async (bucket) =>
          supabaseAdmin.rpc("rate_limit_hit", {
            p_bucket: bucket,
            p_limit: 10,
            p_window_seconds: 3600,
          }),
        loadSigningKey: async () => supabaseAdmin.rpc("get_entitlement_signing_key"),
        ensureKey: async () => {
          const { generateSigningKey } = await import("@/lib/keyBootstrap");
          const k = await generateSigningKey();
          const r = await supabaseAdmin.rpc("install_signing_key", {
            p_id: k.kid,
            p_pkcs8: k.pkcs8,
            p_pub: k.pub,
          });
          // data false, or the single-active-key unique index (23505), means another request
          // installed a key first: fine, the caller reloads it. Any other error is a failure.
          const code = (r.error as { code?: string } | null)?.code;
          if (r.error && code !== "23505") throw new Error("could not install signing key");
        },
        redeem: async (code, requestId) =>
          supabaseAdmin.rpc("redeem_activation_v2", { p_code: code, p_request: requestId }),
      },
      data.pins,
    );
  });
