/**
 * Public keys that verify activation entitlements, by key id.
 * Keys are generated inside the server (src/lib/keyBootstrap.ts). Their public halves are served
 * at /api/entitlement-keys by the same origin that serves this code (same trust), and the ids
 * listed here are pinned in the bundle once known. Nothing from browser storage is ever trusted
 * as a key (review R6-01): a locally edited key list could otherwise authorise a forged token.
 */
export const ENTITLEMENT_PUBLIC_KEYS: Record<string, string> = {
  // first production key, generated inside the server on 2026-10-28 (public half only)
  "k2026-10-6e9e3f": "CZeTag0MYPLqWczEDV-zWf3dfeb2oNhkNvsvp4iwzsA",
};

const valid = (k: string, v: unknown) =>
  /^[a-z0-9-]{1,32}$/.test(k) && typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

function pinned(): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  for (const [k, v] of Object.entries(ENTITLEMENT_PUBLIC_KEYS)) if (valid(k, v)) out[k] = v;
  return out;
}

/**
 * Keys to verify a token signed with `kid`. A pinned key is used without any network request,
 * so an activation keeps working offline and when the key endpoint is down (review H6-03); the
 * server only redeems with pinned keys. Unknown ids fall back to the origin's published keys.
 */
export async function loadEntitlementKeys(kid?: string): Promise<Record<string, string>> {
  if (kid && kid in pinned()) return pinned();
  const out: Record<string, string> = Object.create(null);
  try {
    const r = await fetch("/api/entitlement-keys", { cache: "no-cache", credentials: "omit" });
    if (r.ok) {
      const j = (await r.json()) as { keys?: Record<string, unknown> };
      for (const [k, v] of Object.entries(j.keys ?? {})) if (valid(k, v)) out[k] = v as string;
    }
  } catch {
    /* offline: only pinned keys below */
  }
  // pinned keys win over fetched ones with the same id
  return Object.assign(out, pinned());
}

/** "kid:publicKey" for every key pinned in this bundle; sent with a redeem (review H6-04). */
export function bundledPins(): string[] {
  return Object.entries(pinned()).map(([k, v]) => `${k}:${v}`);
}
