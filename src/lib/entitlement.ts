/**
 * Activation entitlement: a small token signed by the server with Ed25519.
 * Format: base64url(JSON payload) + "." + base64url(signature over the first part).
 * The browser verifies it with the embedded public key before enabling the paid handover.
 */

export interface EntitlementPayload {
  v: 1;
  /** id of the signing key (lets clients verify across key rotations) */
  kid: string;
  plan: "single" | "family";
  /** first 16 hex chars of the activation record id hash — links to the order without personal data */
  ref: string;
  /** issued-at, seconds since epoch */
  iat: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64url");
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : s.length % 4 === 0 ? "" : null;
  if (pad === null) throw new Error("bad base64url length");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isPayload(x: unknown): x is EntitlementPayload {
  const p = x as EntitlementPayload;
  return (
    !!p &&
    p.v === 1 &&
    typeof p.kid === "string" &&
    /^[a-z0-9-]{1,32}$/.test(p.kid) &&
    (p.plan === "single" || p.plan === "family") &&
    typeof p.ref === "string" &&
    /^[0-9a-f]{16}$/.test(p.ref) &&
    Number.isInteger(p.iat) &&
    p.iat > 1_700_000_000
  );
}

export async function importPublicKey(rawB64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromB64url(rawB64url), { name: "Ed25519" }, false, [
    "verify",
  ]);
}

export async function importPrivateKeyPkcs8(pkcs8B64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", fromB64url(pkcs8B64url), { name: "Ed25519" }, false, [
    "sign",
  ]);
}

/** The raw public key (base64url) that belongs to a PKCS#8 Ed25519 private key. */
export async function publicKeyOfPkcs8(pkcs8B64url: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "pkcs8",
    fromB64url(pkcs8B64url),
    { name: "Ed25519" },
    true,
    ["sign"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", k);
  if (!jwk.x) throw new Error("no public part");
  return jwk.x;
}

export async function signEntitlement(
  p: EntitlementPayload,
  privateKey: CryptoKey,
): Promise<string> {
  if (!isPayload(p)) throw new Error("invalid payload");
  const body = b64url(
    enc.encode(JSON.stringify({ v: p.v, kid: p.kid, plan: p.plan, ref: p.ref, iat: p.iat })),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, privateKey, enc.encode(body)),
  );
  return `${body}.${b64url(sig)}`;
}

/** Returns the payload if the signature is valid, otherwise null. Never throws on bad input. */
function isCryptoKey(k: unknown): k is CryptoKey {
  return !!k && typeof k === "object" && "algorithm" in k && "usages" in k;
}

/**
 * Verifies a token. `keys` is either one public key or a registry {kid: raw public key}; with a
 * registry the key named in the token is used (rotation-safe). Returns null on any failure.
 */
export async function verifyEntitlement(
  token: string,
  keys: Record<string, string> | CryptoKey,
): Promise<EntitlementPayload | null> {
  try {
    if (typeof token !== "string" || token.length > 512) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const body = parts[0]!;
    const sig = parts[1]!;
    const claimed: unknown = JSON.parse(dec.decode(fromB64url(body)));
    if (!isPayload(claimed)) return null;
    let key: CryptoKey;
    if (isCryptoKey(keys)) key = keys;
    else {
      if (!Object.prototype.hasOwnProperty.call(keys, claimed.kid)) return null;
      const raw = keys[claimed.kid];
      if (!raw) return null;
      key = await importPublicKey(raw);
    }
    const ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      fromB64url(sig),
      enc.encode(body),
    );
    return ok ? claimed : null;
  } catch {
    return null;
  }
}
