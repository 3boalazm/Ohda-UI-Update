import type { OhdaEnvelope, CodeWrap } from "@/lib/ohdaCrypto";
import { DEMO, readDemoActivation } from "@/lib/demo";

export type Contact = { name: string; relation: string; phone: string; note: string };
export type Bank = { name: string; country: string; type: string; note: string };
export type Insurance = { company: string; type: string; policyRef: string; note: string };
export type OwedToMe = { who: string; amount: string; currency: string; proof: string };
export type IOwe = { to: string; amount: string; currency: string; how: string };
export type Asset = { item: string; location: string; holder: string };
/** An online account the family should know about. Never a password: only where it is and what to do. */
export type OnlineAccount = { name: string; login: string; action: string; note: string };

export interface Plan {
  v: 1;
  updated: string;
  owner: { name: string; phone: string; city: string; notes: string };
  firstSteps: string;
  contacts: Contact[];
  work: {
    employer: string;
    employerPhone: string;
    hrContact: string;
    jobTitle: string;
    startDate: string;
    iqamaLast4: string;
    gosi: string;
    contractLocation: string;
    notes: string;
  };
  banks: Bank[];
  insurance: Insurance[];
  owedToMe: OwedToMe[];
  iOwe: IOwe[];
  assets: Asset[];
  /** added 2026-11; older files simply have none */
  accounts: OnlineAccount[];
  wishes: string;
  /** personal message shown first when the family opens the file (added 2026-11) */
  letter: string;
  handover?: Handover;
}

/**
 * Owner-only handover state, stored inside the encrypted owner plan and never in family files.
 * Family files are sealed with their own random family key (not the owner's data key), so a
 * family card can never open the owner's backups, and issuing new cards (new family key) cuts
 * off every old card from every future family file.
 */
export interface Handover {
  holders: string[];
  /** base64 32-byte family key */
  familyKey?: string;
  /** wraps the family key, opened by the printed card codes */
  codeWrap?: CodeWrap;
  /** set when an older file was upgraded and the cards must be re-issued */
  reissueNeeded?: boolean;
}

export function emptyPlan(): Plan {
  return {
    v: 1,
    updated: new Date().toISOString(),
    owner: { name: "", phone: "", city: "", notes: "" },
    firstSteps: "",
    contacts: [],
    work: {
      employer: "",
      employerPhone: "",
      hrContact: "",
      jobTitle: "",
      startDate: "",
      iqamaLast4: "",
      gosi: "",
      contractLocation: "",
      notes: "",
    },
    banks: [],
    insurance: [],
    owedToMe: [],
    iOwe: [],
    assets: [],
    accounts: [],
    wishes: "",
    letter: "",
  };
}

export const MAX_TEXT = 20_000;
export const MAX_ROWS = 500;
const str = (v: unknown): string => (typeof v === "string" ? v.slice(0, MAX_TEXT) : "");
function obj<T extends Record<string, string>>(template: T, v: unknown): T {
  const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = {} as Record<string, string>;
  for (const k of Object.keys(template)) out[k] = str(src[k]);
  return out as T;
}
function rows<T extends Record<string, string>>(template: T, v: unknown): T[] {
  return Array.isArray(v) ? v.slice(0, MAX_ROWS).map((r) => obj(template, r)) : [];
}
function handover(v: unknown): Handover | undefined {
  if (!v || typeof v !== "object") return undefined;
  const h = v as { [K in keyof Handover]?: unknown };
  const holders = Array.isArray(h.holders) ? h.holders.slice(0, 2).map(str) : ["", ""];
  const cw = h.codeWrap as CodeWrap | undefined;
  const okWrap =
    !!cw &&
    cw.type === "code" &&
    (cw.mode === "single" || cw.mode === "split2") &&
    [cw.salt, cw.iv, cw.wk].every((x) => typeof x === "string");
  return {
    holders,
    ...(typeof h.familyKey === "string" ? { familyKey: h.familyKey } : {}),
    ...(okWrap ? { codeWrap: cw } : {}),
    ...(h.reissueNeeded === true ? { reissueNeeded: true } : {}),
  };
}

/** True if normalising would cut any text or list (so we never silently truncate real data). */
export function exceedsLimits(x: unknown, depth = 0): boolean {
  if (depth > 8) return true; // a real plan is 3 levels deep; anything deeper is not ours
  if (typeof x === "string") return x.length > MAX_TEXT;
  if (Array.isArray(x)) return x.length > MAX_ROWS || x.some((v) => exceedsLimits(v, depth + 1));
  if (x && typeof x === "object")
    return Object.values(x as Record<string, unknown>).some((v) => exceedsLimits(v, depth + 1));
  return false;
}

/** Coerces untrusted decrypted content (own backup or a family file) into a well-typed Plan. */
export function normalizePlan(x: unknown): Plan {
  const e = emptyPlan();
  const p: { [K in keyof Plan]?: unknown } = x && typeof x === "object" ? x : {};
  const h = handover(p.handover);
  return {
    v: 1,
    updated: str(p.updated) || e.updated,
    owner: obj(e.owner, p.owner),
    firstSteps: str(p.firstSteps),
    contacts: rows({ name: "", relation: "", phone: "", note: "" }, p.contacts),
    work: obj(e.work, p.work),
    banks: rows({ name: "", country: "", type: "", note: "" }, p.banks),
    insurance: rows({ company: "", type: "", policyRef: "", note: "" }, p.insurance),
    owedToMe: rows({ who: "", amount: "", currency: "", proof: "" }, p.owedToMe),
    iOwe: rows({ to: "", amount: "", currency: "", how: "" }, p.iOwe),
    assets: rows({ item: "", location: "", holder: "" }, p.assets),
    accounts: rows({ name: "", login: "", action: "", note: "" }, p.accounts),
    wishes: str(p.wishes),
    letter: str(p.letter),
    ...(h ? { handover: h } : {}),
  };
}

/** Plan copy for family: strips owner-only handover info. */
/**
 * Plan copy for family files: an explicit allowlist (never a spread), so a future owner-only field
 * can't leak into family files by default. Handover data (family key, wraps, holders) is excluded.
 */
export function familyCopy(p: Plan): Plan {
  const n = normalizePlan(p);
  return {
    v: 1,
    updated: n.updated,
    owner: n.owner,
    firstSteps: n.firstSteps,
    contacts: n.contacts,
    work: n.work,
    banks: n.banks,
    insurance: n.insurance,
    owedToMe: n.owedToMe,
    iOwe: n.iOwe,
    assets: n.assets,
    accounts: n.accounts,
    wishes: n.wishes,
    letter: n.letter,
  };
}

export function completion(p: Plan): number {
  const checks = [
    !!p.owner.name,
    !!p.owner.phone,
    p.firstSteps.trim().length > 10,
    p.contacts.some((c) => c.name && c.phone),
    !!p.work.employer,
    p.banks.some((b) => b.name),
    p.insurance.some((i) => i.company),
    p.owedToMe.length + p.iOwe.length > 0,
    p.assets.some((a) => a.item),
    p.accounts.some((a) => a.name),
    p.wishes.trim().length > 0,
    p.letter.trim().length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ---------- sensitive input warnings ----------
export const DIGITS_WARNING = "ما تكتبش أرقام حسابات كاملة — اسم البنك ونوع الحساب كفاية";
export const SECRET_WARNING = "ما تكتبش كلمات سر أو رموز تحقق (OTP) هنا أبدًا.";
export function sensitiveWarnings(text: string): string[] {
  const out: string[] = [];
  // \p{Nd}: any decimal digit script (ASCII, Arabic-Indic ٠-٩, Persian ۰-۹, …)
  if (/\p{Nd}{10,}/u.test(text.replace(/[\s\-_.]/g, ""))) out.push(DIGITS_WARNING);
  if (
    /(كلمة\s*ال?سر|كلمة\s*المرور|الرقم\s*السري|رقم\s*سري|باسورد|باسوورد|\bpin\b|\bcvv\b|password|passcode|otp|رمز\s*(التحقق|التفعيل|الدخول))/iu.test(
      text,
    )
  )
    out.push(SECRET_WARNING);
  return out;
}

// ---------- IndexedDB vault ----------
const DB = "ohda",
  STORE = "vault",
  KEY = "main";
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close(); // never block a future upgrade in another tab
      res(db);
    };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("storage blocked by another tab"));
  });
}

/** Runs one transaction and always closes the connection. Rejects on error or abort. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((res, rej) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error ?? new Error("storage error"));
      tx.onabort = () => rej(tx.error ?? new Error("storage aborted (quota?)"));
    });
  } finally {
    db.close();
  }
}

/** The vault in IndexedDB is the source of truth; the localStorage marker is best-effort only. */
function marker(on: boolean) {
  try {
    if (on) localStorage.setItem("ohda-has-vault", "1");
    else localStorage.removeItem("ohda-has-vault");
  } catch {
    /* private mode / blocked storage: ignore */
  }
}
const META = "meta";
/** rev: bumped on every write/delete. epoch: id of the current owner session (bumped on claim). */
type Meta = { rev: number; epoch?: string };
/** What a writer must present: the revision it loaded and the epoch it claimed. */
export type Fence = { rev: number; epoch: string };

/**
 * Make this session the only one allowed to write: stores a fresh epoch in the same record as
 * the revision. Any earlier owner (even one whose lock was stolen and is still running) now fails
 * every write with StaleWriteError (review H4-02). Returns the fence to use for writes.
 */
export async function claimEpoch(): Promise<Fence> {
  const epoch = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const db = await openDb();
  try {
    return await new Promise<Fence>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      let rev = 0;
      const g = st.get(META);
      g.onsuccess = () => {
        rev = (g.result as Meta | undefined)?.rev ?? 0;
        st.put({ rev, epoch } satisfies Meta, META);
      };
      tx.oncomplete = () => res({ rev, epoch });
      tx.onerror = () => rej(tx.error ?? new Error("storage error"));
      tx.onabort = () => rej(tx.error ?? new Error("storage aborted"));
    });
  } finally {
    db.close();
  }
}

/** Thrown when another tab/session saved after this one loaded (revision fencing). */
export class StaleWriteError extends Error {
  constructor() {
    super("stale write");
    this.name = "StaleWriteError";
  }
}

export async function loadVault(): Promise<OhdaEnvelope | null> {
  const r = await withStore<unknown>("readonly", (st) => st.get(KEY));
  return (r as OhdaEnvelope | undefined) ?? null;
}
export async function loadVaultRev(): Promise<number> {
  const m = (await withStore<unknown>("readonly", (st) => st.get(META))) as Meta | undefined;
  return m?.rev ?? 0;
}

/**
 * Writes the envelope and bumps the stored revision in ONE transaction.
 * With `expectedRev`, the write is refused (StaleWriteError) unless the stored revision still
 * equals it — a writer that lost ownership can never overwrite a newer save.
 */
const PREVIOUS = "previous";

export async function saveVault(
  env: OhdaEnvelope,
  fence: Fence,
  opts: { keepPrevious?: boolean } = {},
): Promise<number> {
  const db = await openDb();
  try {
    const rev = await new Promise<number>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      let next = 0;
      let stale = false;
      const g = st.get(META);
      g.onsuccess = () => {
        const m = g.result as Meta | undefined;
        const cur = m?.rev ?? 0;
        if (cur !== fence.rev || m?.epoch !== fence.epoch) {
          stale = true;
          tx.abort();
          return;
        }
        next = cur + 1;
        if (opts.keepPrevious) {
          // restore point: the file being replaced (e.g. by importing a backup)
          const old = st.get(KEY);
          old.onsuccess = () => {
            if (old.result) st.put(old.result, PREVIOUS);
            st.put(env, KEY);
            st.put({ rev: next, epoch: fence.epoch } satisfies Meta, META);
          };
          return;
        }
        st.put(env, KEY);
        st.put({ rev: next, epoch: fence.epoch } satisfies Meta, META);
      };
      tx.oncomplete = () => res(next);
      tx.onerror = () =>
        rej(stale ? new StaleWriteError() : (tx.error ?? new Error("storage error")));
      tx.onabort = () =>
        rej(stale ? new StaleWriteError() : (tx.error ?? new Error("storage aborted (quota?)")));
    });
    marker(true);
    return rev;
  } finally {
    db.close();
  }
}
/** The file that was replaced by the last import, if any (encrypted, same passphrase rules). */
export async function loadPrevious(): Promise<OhdaEnvelope | null> {
  const r = await withStore<unknown>("readonly", (st) => st.get(PREVIOUS));
  return (r as OhdaEnvelope | undefined) ?? null;
}
export async function forgetPrevious(): Promise<void> {
  await withStore("readwrite", (st) => st.delete(PREVIOUS));
}

/**
 * Deletes the file but keeps (and bumps) the revision counter, so a writer that loaded an older
 * revision can never match again after delete + re-create (no ABA).
 */
export async function deleteVault(fence: Fence): Promise<void> {
  const db = await openDb();
  try {
    let stale = false;
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const g = st.get(META);
      g.onsuccess = () => {
        const m = g.result as Meta | undefined;
        const cur = m?.rev ?? 0;
        if (cur !== fence.rev || m?.epoch !== fence.epoch) {
          stale = true;
          tx.abort();
          return;
        }
        st.delete(KEY);
        st.delete(PREVIOUS);
        st.put({ rev: cur + 1, epoch: fence.epoch } satisfies Meta, META);
      };
      tx.oncomplete = () => res();
      tx.onerror = () =>
        rej(stale ? new StaleWriteError() : (tx.error ?? new Error("storage error")));
      tx.onabort = () =>
        rej(stale ? new StaleWriteError() : (tx.error ?? new Error("storage aborted")));
    });
  } finally {
    db.close();
  }
  marker(false);
}

// ---------- files ----------
export function downloadBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // generous delay: some mobile browsers start reading the blob late
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** User's LOCAL calendar date (not UTC — near midnight in KSA/Egypt UTC is the wrong day). */
export function today(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** True if the fetched template is byte-for-byte the pinned, reviewed release. */
export async function templateScriptMatches(tpl: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tpl));
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  const { FAMILY_TEMPLATE_SHA256 } = await import("./familyTemplateHash");
  return btoa(bin) === FAMILY_TEMPLATE_SHA256;
}

const TEMPLATE_SLOT = "/*__OHDA_DATA__*/";

export async function buildFamilyHtml(env: OhdaEnvelope): Promise<string> {
  const res = await fetch("/family-template", { cache: "no-store" });
  if (!res.ok) throw new Error("ما قدرناش نجهّز ملف الأهل. جرّب تاني.");
  const tpl = await res.text();
  // fail closed: never hand out a family file without exactly one data slot
  if (tpl.split(TEMPLATE_SLOT).length !== 2 || !tpl.includes('id="ohda-data"'))
    throw new Error("قالب ملف الأهل مش سليم. جرّب تاني أو كلّمنا.");
  if (!(await templateScriptMatches(tpl)))
    throw new Error("قالب ملف الأهل مش النسخة المعتمدة. حدّث الصفحة وجرّب تاني.");
  return tpl.replace(TEMPLATE_SLOT, () =>
    JSON.stringify(env)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029"),
  );
}

/** Largest file we will read (an owner backup or family file is normally well under 1 MB). */
export const MAX_IMPORT_BYTES = 6 * 1024 * 1024;

/** Reads an uploaded file only if it is within the size limit (checked before reading/parsing). */
export async function readLimited(f: Blob): Promise<string> {
  if (f.size > MAX_IMPORT_BYTES) throw new Error("الملف ده أكبر من المسموح. اتأكد إنه ملف عُهدة.");
  return f.text();
}

/** Extract envelope JSON from an uploaded family .html or .ohda file text. */
export function extractEnvelopeJson(text: string): unknown {
  const t = text.trim();
  if (t.startsWith("{")) return JSON.parse(t);
  const doc = new DOMParser().parseFromString(text, "text/html");
  const el = doc.getElementById("ohda-data");
  if (!el?.textContent) throw new Error("الملف ده مش ملف عُهدة صالح");
  return JSON.parse(el.textContent);
}

export function getCodeWrap(env: OhdaEnvelope): CodeWrap | undefined {
  return env.wraps.find((w): w is CodeWrap => w.type === "code");
}

// ---------- activation ----------
export type Activation = { plan: "single" | "family"; at: string; ref: string };
const ENT_KEY = "ohda-entitlement";

/**
 * Activation = an Ed25519-signed token issued by the server function after a code is redeemed.
 * It is verified with the shipped public key every time; a hand-written localStorage value is
 * ignored. (A local-first app can always be patched by its own user; this stops casual bypass.)
 */
/** Key id claimed by an (unverified) token, used only to pick which keys to load. */
function tokenKid(token: string): string | undefined {
  try {
    const b = token.split(".")[0] ?? "";
    const j = JSON.parse(atob(b.replace(/-/g, "+").replace(/_/g, "/"))) as { kid?: unknown };
    return typeof j.kid === "string" ? j.kid : undefined;
  } catch {
    return undefined;
  }
}

export async function getActivation(): Promise<Activation | null> {
  if (DEMO) return readDemoActivation();
  try {
    const token = localStorage.getItem(ENT_KEY);
    if (!token) return null;
    const [{ verifyEntitlement }, { loadEntitlementKeys }] = await Promise.all([
      import("./entitlement"),
      import("./entitlementKey"),
    ]);
    const p = await verifyEntitlement(token, await loadEntitlementKeys(tokenKid(token)));
    return p ? { plan: p.plan, at: new Date(p.iat * 1000).toISOString(), ref: p.ref } : null;
  } catch {
    return null;
  }
}

/**
 * Stores a freshly issued token after verifying it. `fresh` is the public key returned together
 * with the token by the server in the same response (never read from storage).
 */
export async function storeActivation(
  token: string,
  fresh?: { kid: string; publicKey: string },
): Promise<Activation | null> {
  try {
    const [{ verifyEntitlement }, { loadEntitlementKeys }] = await Promise.all([
      import("./entitlement"),
      import("./entitlementKey"),
    ]);
    // the key from the same response verifies at once, with no key-discovery request first
    // (review H6-03); a pinned key with the same id always wins
    const keys: Record<string, string> = fresh
      ? { [fresh.kid]: fresh.publicKey, ...(await loadEntitlementKeys(fresh.kid)) }
      : await loadEntitlementKeys(tokenKid(token));
    const p = await verifyEntitlement(token, keys);
    if (!p) return null;
    localStorage.setItem(ENT_KEY, token);
    localStorage.removeItem("ohda-activation"); // legacy unsigned flag
    return { plan: p.plan, at: new Date(p.iat * 1000).toISOString(), ref: p.ref };
  } catch {
    return null;
  }
}

export const SITE = "https://ohda.codeandcanvas.net";
