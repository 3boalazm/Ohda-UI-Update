import { describe, expect, it, vi } from "vitest";
import { redeemCore, rateBucket, type RedeemDeps } from "@/lib/activation.functions";
import { b64url, verifyEntitlement } from "@/lib/entitlement";
import { generateSigningKey } from "@/lib/keyBootstrap";

async function keys() {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pkcs8 = b64url(new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)));
  const pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  return { pkcs8, pub, id: "kt" };
}
const CODE = "OHDA-AAAA-BBBB-CCCC-DDDD";
const REQ = "req-0123456789abcdef";
type K = { pkcs8: string; pub: string; id: string };
const row = (k: K, rate: string | null = "r".repeat(64)) => ({
  id: k.id,
  pkcs8_b64url: k.pkcs8,
  public_raw_b64url: k.pub,
  rate_secret: rate,
});

function deps(over: Partial<RedeemDeps>, k: K): RedeemDeps {
  return {
    rateLimitHit: vi.fn(async () => ({ data: true, error: null })),
    loadSigningKey: vi.fn(async () => ({ data: [row(k)], error: null })),
    ensureKey: vi.fn(async () => {}),
    redeem: vi.fn(async () => ({
      data: { ok: true, plan: "family", ref: "0123456789abcdef" },
      error: null,
    })),
    pinnedKeys: { [k.id]: k.pub },
    ...over,
  };
}

/** a browser running the same bundle as the server (sends the server's pins) */
const run = (c: unknown, r: unknown, ip: string, d: RedeemDeps) =>
  redeemCore(
    c,
    r,
    ip,
    d,
    Object.entries(d.pinnedKeys).map(([a, b]) => `${a}:${b}`),
  );

describe("redeemCore", () => {
  it("returns a token the browser verifies with the published public key", async () => {
    const k = await keys();
    const d = deps({}, k);
    const r = await redeemCore(CODE, REQ, "1.2.3.4", d, [`${k.id}:${k.pub}`]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await verifyEntitlement(r.token, { [k.id]: k.pub })).toMatchObject({
      plan: "family",
      kid: "kt",
    });
    expect(d.redeem).toHaveBeenCalledWith(CODE, REQ);
    expect(d.ensureKey).not.toHaveBeenCalled();
    // the public half comes back with the token, so the browser can verify immediately
    expect(r.kid).toBe("kt");
    expect(await verifyEntitlement(r.token, { [r.kid]: r.publicKey })).not.toBeNull();
  });

  it("generates and installs a key inside the server on first need", async () => {
    const generated = await generateSigningKey(new Date("2026-10-28T00:00:00Z"));
    expect(generated.kid).toMatch(/^k2026-10-[0-9a-f]{6}$/);
    let installed = false;
    const d = deps(
      {
        loadSigningKey: vi.fn(async () => ({
          data: installed
            ? [row({ id: generated.kid, pkcs8: generated.pkcs8, pub: generated.pub })]
            : [],
          error: null,
        })),
        ensureKey: vi.fn(async () => {
          installed = true;
        }),
      },
      { id: "x", pkcs8: "", pub: "" },
    );
    // release gate (H6-03): a fresh key that is not pinned in the bundle yet consumes nothing
    const first = await run(CODE, REQ, "ip", d);
    expect(d.ensureKey).toHaveBeenCalledOnce();
    expect(first).toEqual({ ok: false, reason: "unavailable" });
    expect(d.redeem).not.toHaveBeenCalled();
    expect(d.rateLimitHit).not.toHaveBeenCalled();
    // after the release owner pins the public half and redeploys, redemption works
    const r = await run(CODE, REQ, "ip", {
      ...d,
      pinnedKeys: { [generated.kid]: generated.pub },
    });
    expect(r.ok).toBe(true);
    expect(d.ensureKey).toHaveBeenCalledOnce(); // never generates a second key
  });

  it("asks a browser on an older bundle to reload, consuming nothing (review H6-04)", async () => {
    const k = await keys();
    const other = await keys();
    // server bundle has the key pinned; the browser's older bundle has none, or a different one
    for (const browserPins of [[], [`${k.id}:${other.pub}`], [`other:${k.pub}`]]) {
      const d = deps({}, k);
      expect(await redeemCore(CODE, REQ, "ip", d, browserPins)).toEqual({
        ok: false,
        reason: "update_required",
      });
      expect(d.redeem).not.toHaveBeenCalled();
      expect(d.rateLimitHit).not.toHaveBeenCalled();
    }
  });

  it("consumes nothing when the active key is not pinned or the pin differs", async () => {
    const k = await keys();
    const other = await keys();
    for (const pinnedKeys of [{}, { [k.id]: other.pub }]) {
      const d = deps({ pinnedKeys }, k);
      expect(await run(CODE, REQ, "ip", d)).toEqual({ ok: false, reason: "unavailable" });
      expect(d.redeem).not.toHaveBeenCalled();
    }
  });

  it("consumes nothing when the key is missing or does not match its public key", async () => {
    const k = await keys();
    const none = deps(
      {
        loadSigningKey: vi.fn(async () => ({ data: [], error: null })),
        ensureKey: vi.fn(async () => {
          throw new Error("install failed");
        }),
      },
      k,
    );
    expect(await run(CODE, REQ, "ip", none)).toEqual({ ok: false, reason: "unavailable" });
    expect(none.redeem).not.toHaveBeenCalled();
    const other = await keys();
    const mismatch = deps(
      {
        loadSigningKey: vi.fn(async () => ({
          data: [{ ...row(k), public_raw_b64url: other.pub }],
          error: null,
        })),
      },
      k,
    );
    expect(await run(CODE, REQ, "ip", mismatch)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(mismatch.redeem).not.toHaveBeenCalled();
  });

  it("fails closed without a rate-limit secret", async () => {
    const k = await keys();
    const d = deps(
      { loadSigningKey: vi.fn(async () => ({ data: [row(k, null)], error: null })) },
      k,
    );
    expect(await run(CODE, REQ, "ip", d)).toEqual({ ok: false, reason: "unavailable" });
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("rate limits before touching codes and counts garbage attempts", async () => {
    const k = await keys();
    const d = deps({ rateLimitHit: vi.fn(async () => ({ data: false, error: null })) }, k);
    expect(await run(CODE, REQ, "ip", d)).toEqual({ ok: false, reason: "rate_limited" });
    expect(d.redeem).not.toHaveBeenCalled();
    const d2 = deps({}, k);
    expect(await run("short", REQ, "ip", d2)).toEqual({ ok: false, reason: "invalid" });
    expect(await run(CODE, "bad id", "ip", d2)).toEqual({ ok: false, reason: "invalid" });
    expect(await run(123, REQ, "ip", d2)).toEqual({ ok: false, reason: "invalid" });
    expect(d2.rateLimitHit).toHaveBeenCalledTimes(3);
    expect(d2.redeem).not.toHaveBeenCalled();
  });

  it("maps used/invalid and rejects malformed DB answers", async () => {
    const k = await keys();
    const used = deps(
      { redeem: vi.fn(async () => ({ data: { ok: false, reason: "used" }, error: null })) },
      k,
    );
    expect(await run(CODE, REQ, "ip", used)).toEqual({ ok: false, reason: "used" });
    const weird = deps(
      { redeem: vi.fn(async () => ({ data: { ok: true, plan: "gold", ref: 1 }, error: null })) },
      k,
    );
    expect(await run(CODE, REQ, "ip", weird)).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts Arabic-Indic digits in the code", async () => {
    const k = await keys();
    const d = deps({}, k);
    await run("OHDA-٠١٢٣-4567-89AB-CDEF", REQ, "ip", d);
    expect(d.redeem).toHaveBeenCalledWith("OHDA-0123-4567-89AB-CDEF", REQ);
  });

  it("buckets IPs with a keyed HMAC that changes daily", async () => {
    const day1 = new Date("2026-10-28T10:00:00Z");
    const a = await rateBucket("1.2.3.4", day1, "secret-1");
    expect(a).toMatch(/^redeem:[0-9a-f]{32}$/);
    expect(a).not.toBe(await rateBucket("1.2.3.4", new Date("2026-10-29T10:00:00Z"), "secret-1"));
    expect(a).not.toBe(await rateBucket("1.2.3.4", day1, "secret-2"));
  });
});
