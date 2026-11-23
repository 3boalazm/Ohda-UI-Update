/**
 * Ohda (عُهدة) crypto module — format v1
 * Everything runs in the browser with WebCrypto. No server ever sees plaintext or keys.
 *
 * - Content: random 256-bit data key (DK), AES-256-GCM, fresh 96-bit IV per save, AAD "ohda:v1".
 * - Owner wrap: PBKDF2-SHA256, 600,000 iterations (OWASP minimum), 16-byte salt -> AES-GCM key wraps DK.
 * - Family wrap: random 128-bit release secret (single code, or 2-of-2 XOR split into two codes),
 *   HKDF-SHA256(salt, info "ohda family v1") -> AES-GCM key wraps DK.
 * - Codes are shown in Crockford Base32 (no I/L/O/U) in groups of 4, plus a 2-char checksum.
 */

export const FORMAT = "ohda";
export const VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
const AAD = new TextEncoder().encode("ohda:v1");
const HKDF_INFO = new TextEncoder().encode("ohda family v1");

/** Byte arrays backed by a plain ArrayBuffer (what WebCrypto accepts). */
export type Bytes = Uint8Array<ArrayBuffer>;

export type PassWrap = { type: "pass"; salt: string; iter: number; iv: string; wk: string };
export type CodeWrap = {
  type: "code";
  mode: "single" | "split2";
  salt: string;
  iv: string;
  wk: string;
};
export type Wrap = PassWrap | CodeWrap;

export interface OhdaEnvelope {
  format: "ohda";
  v: 1;
  kind: "owner" | "family";
  created: string;
  wraps: Wrap[];
  iv: string;
  ct: string;
}

const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("WebCrypto not available (secure context required)");
  return c.subtle;
};

export function randomBytes(n: number): Bytes {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function toB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}
export function fromB64(s: string): Bytes {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- Crockford Base32 codes with checksum ----------
const ALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function bytesToB32(b: Uint8Array): string {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of b) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPH[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}

function b32ToBytes(s: string, nBytes: number): Bytes {
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const v = ALPH.indexOf(ch);
    if (v < 0) throw new Error("invalid character");
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  if (out.length < nBytes) throw new Error("code too short");
  return new Uint8Array(out.slice(0, nBytes));
}

function checksum(b: Uint8Array): string {
  // simple 10-bit checksum (Fletcher-like) to catch typos — not a security feature
  let a = 1,
    c = 0;
  for (const x of b) {
    a = (a + x) % 1021;
    c = (c + a) % 1021;
  }
  const v = (a * 31 + c) % 1024;
  return ALPH.charAt((v >> 5) & 31) + ALPH.charAt(v & 31);
}

/** 16 bytes -> "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" (26 data chars + 2 check chars) */
export function formatCode(secret: Uint8Array): string {
  const body = bytesToB32(secret) + checksum(secret);
  return body.match(/.{1,4}/g)!.join("-");
}

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits, and full-width forms, to ASCII. */
export function toAsciiDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    );
}

export function normalizeCode(input: string): string {
  return toAsciiDigits(input)
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

export function parseCode(input: string): Bytes {
  const s = normalizeCode(input);
  if (s.length !== 28) throw new Error("الكود لازم يكون 28 حرف/رقم");
  const secret = b32ToBytes(s.slice(0, 26), 16);
  // canonical form only: the last data char carries 2 unused bits; reject non-canonical spellings
  if (bytesToB32(secret) !== s.slice(0, 26) || checksum(secret) !== s.slice(26))
    throw new Error("في غلطة في كتابة الكود — راجعه حرف حرف");
  return secret;
}

function xor(a: Bytes, b: Bytes): Bytes {
  const o = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i]! ^ b[i]!;
  return o;
}

// ---------- key derivation ----------
async function passKey(passphrase: string, salt: Bytes, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function codeKey(secret: Bytes, salt: Bytes): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: HKDF_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function aesEncrypt(key: CryptoKey, data: Bytes) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, data),
  );
  return { iv, ct };
}
async function aesDecrypt(key: CryptoKey, iv: Bytes, ct: Bytes) {
  return new Uint8Array(
    await subtle().decrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, ct),
  );
}

// ---------- public API ----------
export function newDataKey(): Bytes {
  return randomBytes(32);
}

export async function makePassWrap(
  dk: Bytes,
  passphrase: string,
  iter = PBKDF2_ITERATIONS,
): Promise<PassWrap> {
  const salt = randomBytes(16);
  const k = await passKey(passphrase, salt, iter);
  const { iv, ct } = await aesEncrypt(k, dk);
  return { type: "pass", salt: toB64(salt), iter, iv: toB64(iv), wk: toB64(ct) };
}

/** Returns the wrap plus the human codes to print. split=true -> two codes, both required. */
export async function makeCodeWrap(
  dk: Bytes,
  split: boolean,
): Promise<{ wrap: CodeWrap; codes: string[] }> {
  const salt = randomBytes(16);
  let secret: Bytes;
  let codes: string[];
  if (split) {
    const s1 = randomBytes(16);
    const s2 = randomBytes(16);
    secret = xor(s1, s2);
    codes = [formatCode(s1), formatCode(s2)];
    s1.fill(0);
    s2.fill(0);
  } else {
    secret = randomBytes(16);
    codes = [formatCode(secret)];
  }
  let iv: Bytes, ct: Bytes;
  try {
    const k = await codeKey(secret, salt);
    ({ iv, ct } = await aesEncrypt(k, dk));
  } finally {
    secret.fill(0);
  }
  return {
    wrap: {
      type: "code",
      mode: split ? "split2" : "single",
      salt: toB64(salt),
      iv: toB64(iv),
      wk: toB64(ct),
    },
    codes,
  };
}

export async function sealContent(
  dk: Bytes,
  content: unknown,
  kind: "owner" | "family",
  wraps: Wrap[],
): Promise<OhdaEnvelope> {
  const key = await subtle().importKey("raw", dk, "AES-GCM", false, ["encrypt"]);
  const { iv, ct } = await aesEncrypt(key, new TextEncoder().encode(JSON.stringify(content)));
  return {
    format: FORMAT,
    v: VERSION,
    kind,
    created: new Date().toISOString(),
    wraps,
    iv: toB64(iv),
    ct: toB64(ct),
  };
}

async function openWithDK(env: OhdaEnvelope, dk: Bytes): Promise<unknown> {
  const key = await subtle().importKey("raw", dk, "AES-GCM", false, ["decrypt"]);
  const pt = await aesDecrypt(key, fromB64(env.iv), fromB64(env.ct));
  try {
    return JSON.parse(new TextDecoder().decode(pt));
  } finally {
    pt.fill(0);
  }
}

/** Limits for untrusted envelopes (imported backups, family files). Format v1 is unchanged. */
export const LIMITS = {
  maxCtB64: 4_000_000, // ~3 MB of ciphertext
  maxWraps: 4,
  minIter: 100_000,
  maxIter: 2_000_000,
};
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
function b64Len(x: unknown, bytes: number | null, max = 64): boolean {
  if (typeof x !== "string" || x.length > max || !B64_RE.test(x) || x.length % 4 !== 0)
    return false;
  if (bytes === null) return true;
  try {
    return fromB64(x).length === bytes;
  } catch {
    return false;
  }
}
function validWrap(w: unknown): w is Wrap {
  if (!w || typeof w !== "object") return false;
  const x = w as Record<string, unknown>;
  if (x["type"] === "pass")
    return (
      Number.isInteger(x["iter"]) &&
      (x["iter"] as number) >= LIMITS.minIter &&
      (x["iter"] as number) <= LIMITS.maxIter &&
      b64Len(x["salt"], 16) &&
      b64Len(x["iv"], 12) &&
      b64Len(x["wk"], 48)
    );
  if (x["type"] === "code")
    return (
      (x["mode"] === "single" || x["mode"] === "split2") &&
      b64Len(x["salt"], 16) &&
      b64Len(x["iv"], 12) &&
      b64Len(x["wk"], 48)
    );
  return false;
}

/** Strict runtime validation before any key derivation or large allocation. */
export function validateEnvelope(x: unknown): OhdaEnvelope {
  const bad = () => new Error("الملف ده مش ملف عُهدة صالح أو اتعدّل");
  if (!x || typeof x !== "object") throw bad();
  const e = x as Record<string, unknown>;
  if (e["format"] !== FORMAT || e["v"] !== 1) throw bad();
  if (e["kind"] !== "owner" && e["kind"] !== "family") throw bad();
  const wraps = e["wraps"];
  if (!Array.isArray(wraps) || wraps.length < 1 || wraps.length > LIMITS.maxWraps) throw bad();
  if (!wraps.every(validWrap)) throw bad();
  const kinds = wraps.map((w) => w.type);
  if (e["kind"] === "family" && (kinds.length !== 1 || kinds[0] !== "code")) throw bad();
  if (e["kind"] === "owner" && !kinds.includes("pass")) throw bad();
  if (!b64Len(e["iv"], 12)) throw bad();
  if (!b64Len(e["ct"], null, LIMITS.maxCtB64) || (e["ct"] as string).length < 24) throw bad();
  return x as OhdaEnvelope;
}

/** Owner unlock. Returns content and the data key (kept in memory only while unlocked). */
export async function unlockWithPassphrase(
  env: OhdaEnvelope,
  passphrase: string,
): Promise<{ content: unknown; dk: Bytes }> {
  const w = env.wraps.find((x): x is PassWrap => x.type === "pass");
  if (!w) throw new Error("الملف ده مش محمي بكلمة سر");
  if (w.iter < LIMITS.minIter || w.iter > LIMITS.maxIter)
    throw new Error("إعدادات الملف غير مقبولة");
  let dk: Bytes;
  try {
    const k = await passKey(passphrase, fromB64(w.salt), w.iter);
    dk = await aesDecrypt(k, fromB64(w.iv), fromB64(w.wk));
  } catch {
    throw new Error("كلمة السر غلط");
  }
  try {
    return { content: await openWithDK(env, dk), dk };
  } catch {
    dk.fill(0); // the passphrase was right but the content is damaged or was tampered with
    throw new Error("كلمة السر صح، بس محتوى الملف بايظ أو اتعدّل. جرّب نسخة احتياطية تانية.");
  }
}

/** Family unlock: one code (single) or two codes (split2). */
export async function unlockWithCodes(env: OhdaEnvelope, codeInputs: string[]): Promise<unknown> {
  const w = env.wraps.find((x): x is CodeWrap => x.type === "code");
  if (!w) throw new Error("الملف ده مش ملف أهل");
  let secret: Bytes;
  if (w.mode === "split2") {
    if (codeInputs.length < 2 || !codeInputs[0] || !codeInputs[1])
      throw new Error("الملف ده محتاج الكودين الاتنين");
    let a: Bytes | null = null;
    let b: Bytes | null = null;
    try {
      a = parseCode(codeInputs[0]);
      b = parseCode(codeInputs[1]);
      secret = xor(a, b);
    } finally {
      a?.fill(0);
      b?.fill(0);
    }
  } else {
    secret = parseCode(codeInputs[0] ?? "");
  }
  try {
    const k = await codeKey(secret, fromB64(w.salt));
    const dk = await aesDecrypt(k, fromB64(w.iv), fromB64(w.wk));
    try {
      return await openWithDK(env, dk);
    } finally {
      dk.fill(0);
    }
  } catch {
    throw new Error("الكود مش مطابق للملف ده");
  } finally {
    secret.fill(0);
  }
}

/** Password strength gate: length >= 12 and not trivially repetitive. Returns Arabic message or null. */
export function passphraseProblem(p: string): string | null {
  if (p.length < 12) return "كلمة السر لازم تكون 12 حرف على الأقل. جرّب جملة قصيرة تفتكرها.";
  if (/^(.)\1+$/.test(p)) return "كلمة السر دي سهلة التخمين.";
  const uniq = new Set(p).size;
  if (uniq < 6) return "كلمة السر محتاجة تنوّع أكتر في الحروف.";
  return null;
}
