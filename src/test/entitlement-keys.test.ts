import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTITLEMENT_PUBLIC_KEYS, loadEntitlementKeys } from "@/lib/entitlementKey";

const PINNED = { ...ENTITLEMENT_PUBLIC_KEYS };
function restorePinned() {
  for (const k of Object.keys(ENTITLEMENT_PUBLIC_KEYS)) delete ENTITLEMENT_PUBLIC_KEYS[k];
  Object.assign(ENTITLEMENT_PUBLIC_KEYS, PINNED);
}

async function signed(kid: string) {
  const { signEntitlement, b64url } = await import("@/lib/entitlement");
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  const token = await signEntitlement(
    { v: 1, kid, plan: "family", ref: "0123456789abcdef", iat: 1_800_000_000 },
    kp.privateKey,
  );
  return { pub, token };
}

describe("entitlement key loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  const KEY = "A".repeat(43);
  it("never trusts keys from browser storage (offline returns pinned keys only)", async () => {
    localStorage.setItem("ohda-ent-keys", JSON.stringify({ evil: KEY }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await loadEntitlementKeys()).toEqual(PINNED);
  });
  it("accepts well-formed keys served by the origin and drops malformed ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ keys: { "k2026-10-abc123": KEY, "BAD ID": KEY, k2: "short" } }),
      })),
    );
    expect(await loadEntitlementKeys()).toEqual({ ...PINNED, "k2026-10-abc123": KEY });
  });
});

describe("storeActivation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  it("verifies a fresh token with the key returned in the same response, even if key discovery fails", async () => {
    const { signEntitlement, b64url } = await import("@/lib/entitlement");
    const { storeActivation } = await import("@/lib/plan");
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    const token = await signEntitlement(
      { v: 1, kid: "k2026-10-aaaaaa", plan: "single", ref: "0123456789abcdef", iat: 1_800_000_000 },
      kp.privateKey,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await storeActivation(token)).toBeNull(); // no key known: refuse, store nothing
    expect(localStorage.getItem("ohda-entitlement")).toBeNull();
    const a = await storeActivation(token, { kid: "k2026-10-aaaaaa", publicKey: pub });
    expect(a?.plan).toBe("single");
    expect(localStorage.getItem("ohda-entitlement")).toBe(token);
  });
});

describe("activation survives the key endpoint being down (review H6-03)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    restorePinned();
  });
  it("redeem -> store without fetching -> endpoint down -> handover still recognises it", async () => {
    const { storeActivation, getActivation } = await import("@/lib/plan");
    const kid = "k2026-10-bbbbbb";
    const { pub, token } = await signed(kid);
    ENTITLEMENT_PUBLIC_KEYS[kid] = pub; // the server redeems only with pinned keys
    const fetchSpy = vi.fn(async () => {
      throw new Error("endpoint down");
    });
    vi.stubGlobal("fetch", fetchSpy);
    expect((await storeActivation(token, { kid, publicKey: pub }))?.plan).toBe("family");
    expect((await getActivation())?.plan).toBe("family"); // e.g. after navigating to /handover
    expect(fetchSpy).not.toHaveBeenCalled(); // pinned key: no network needed at all
  });
  it("a forged token claiming a pinned kid is still rejected", async () => {
    const { getActivation } = await import("@/lib/plan");
    const kid = "k2026-10-cccccc";
    const real = await signed(kid);
    const forged = await signed(kid);
    ENTITLEMENT_PUBLIC_KEYS[kid] = real.pub;
    localStorage.setItem("ohda-entitlement", forged.token);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await getActivation()).toBeNull();
  });
});
