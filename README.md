# Ohda Family

Build "عُهدة | Ohda" — an Arabic-first (RTL, lang="ar") privacy-first web app by Code & Canvas for individuals in Saudi Arabia and Egypt (primary audience: Egyptians working in Saudi Arabia and their families in Egypt). Tagline: «لو غبت فجأة… أهلك يعرفوا يبدأوا منين؟». It helps a person prepare an encrypted "family file" that tells their family where to start if they are suddenly absent (accident, hospital, sudden return, death). Copy in clear, warm Arabic that Egyptians and Saudis both understand (light Egyptian tone is fine). Mobile-first. This is a PILOT: show a small "نسخة تجريبية" badge in the header.

## HARD RULES (security & honesty)
1. Users' file content NEVER leaves the browser. No accounts for users, no email collection, no analytics, no third-party scripts, no Google Fonts or CDNs (use a system Arabic font stack: "Segoe UI", Tahoma, "Noto Naskh Arabic", "Geeza Pro", Arial). No external images.
2. All crypto uses ONLY the module in section A below. Create `src/lib/ohdaCrypto.ts` with EXACTLY that content — do not modify, refactor or "improve" it.
3. Create `public/family-template.html` with EXACTLY the content in section B (do not modify). The app fetches it at runtime and replaces the literal string `/*__OHDA_DATA__*/` with `JSON.stringify(envelope).replace(/</g,"\\u003c")`.
4. No fake testimonials, user counts, stats, partner logos or reviews anywhere.
5. Never store passwords/OTPs: in bank/insurance fields show a warning if the user types a run of 10+ digits ("ما تكتبش أرقام حسابات كاملة — اسم البنك ونوع الحساب كفاية") and a warning if text contains كلمة سر / باسورد / password / OTP / رمز التحقق.
6. Add in index.html a Content-Security-Policy meta tag: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'. Also <meta name="referrer" content="no-referrer">.
7. No Lovable branding anywhere: custom favicon.svg, favicon.ico, apple-touch-icon.png (180x180), site.webmanifest (name "عُهدة", theme #0f5c4d), og-image.jpg 1200x630 (deep green #0f5c4d background, cream #f6f4ef text «عُهدة — لو غبت فجأة، أهلك يعرفوا يبدأوا منين؟»). Title: «عُهدة | ملف أهلك لو غبت فجأة». Meta description in Arabic. Canonical and og:url = https://ohda.codeandcanvas.net. Remove any lovable meta tags/og images. Logo: a simple mark — rounded square in deep green #0f5c4d with a gold (#c8913a) stylized sealed envelope and the letter «ع»; wordmark «عُهدة» + small "by Code & Canvas".
8. Palette: deep green #0f5c4d (primary), gold #c8913a (accent), ink #14213d, cream background #f6f4ef, white cards, red #a4262c for errors. Calm, trustworthy, not flashy.

## DATA MODEL (the plan object, stored only encrypted)
{ v:1, updated:ISO, owner:{name,phone,city,notes}, firstSteps:string, contacts:[{name,relation,phone,note}], work:{employer,employerPhone,hrContact,jobTitle,startDate,iqamaLast4,gosi,contractLocation,notes}, banks:[{name,country,type,note}], insurance:[{company,type,policyRef,note}], owedToMe:[{who,amount,currency,proof}], iOwe:[{to,amount,currency,how}], assets:[{item,location,holder}], wishes:string }
Field labels must match the Arabic labels used in the family template render() (section B) so the family sees the same wording.

## LOCAL VAULT
- Store the owner envelope (kind "owner") in IndexedDB (db "ohda", store "vault", key "main"). Also store a small non-sensitive flag in localStorage "ohda-has-vault".
- Create: user chooses a passphrase (min 12 chars, use passphraseProblem()), confirms it, checkbox «فاهم إن لو نسيت كلمة السر محدش يقدر يرجّع الملف، ولا حتى عُهدة». dk=newDataKey(); wraps=[await makePassWrap(dk, pass)]; save sealContent(dk, emptyPlan, "owner", wraps).
- Unlock: unlockWithPassphrase(env, pass) → keep dk + content ONLY in React memory (context), never in storage. Auto-lock after 5 minutes of inactivity and on «اقفل» button (zero the dk array: dk.fill(0)).
- Save: re-seal with the SAME dk and the SAME wraps array (sealContent creates a fresh IV every time). Autosave 1.5s after edits while unlocked. Show «اتحفظ مشفّر على جهازك ✓».
- Free backup: button «نزّل نسخة احتياطية مشفّرة» downloads the owner envelope JSON as `ohda-backup-YYYY-MM-DD.ohda` (opens only with the passphrase). Import backup on the start page. Show a persistent hint that browser data can be wiped and the backup file is the real safety copy.
- «امسح الملف من الجهاز» with a confirm dialog.

## PAGES
1. `/` Landing: hero with tagline; three short scenario cards (حادثة أو مستشفى / رجوع مفاجئ لمصر / وفاة); how it works in 3 steps (املا ملفك في 10 دقايق ← احفظه مشفّر على جهازك ← سلّمه لأهلك بكود مطبوع); "Your data stays with you" section explaining: التشفير بيحصل على جهازك، إحنا ما بنشوفش ولا بنخزّن ملفك، مفيش حساب ولا إيميل؛ what we do NOT store (passwords, full account numbers, it's not a legal will); pricing; FAQ (هل ده وصية؟ لا. هل تقدروا تشوفوا ملفي؟ لا. لو نسيت كلمة السر؟ مفيش استرجاع. لو الموقع قفل؟ ملف الأهل بيفتح من غير الموقع. أدفع إزاي؟). CTA buttons: «اختبر نفسك في دقيقة» → /quiz and «ابدأ ملفك مجانًا» → /start.
2. `/quiz`: 10 yes/no questions, one per screen with progress bar, e.g. هل أهلك يعرفوا اسم الشركة اللي شغال فيها ورقم تليفونها؟ / يعرفوا رقم إقامتك أو آخر أرقامه؟ / يعرفوا البنوك اللي عندك فيها حسابات في السعودية ومصر؟ / يعرفوا لو عندك تأمين على الحياة أو تأمين طبي؟ / يعرفوا مين مديون لك بفلوس؟ / يعرفوا انت مديون لمين؟ / يعرفوا عقد الإيجار أو الشقة أو العربية أوراقها فين؟ / يعرفوا مين يكلموا الأول لو حصل لك حاجة؟ / عندهم نسخة من أهم أوراقك أو يعرفوا مكانها؟ / اتكلمت معاهم قبل كده عن الموضوع ده؟. Result: score out of 10 with a kind message by band, the list of gaps, CTA «ابدأ ملفك مجانًا». Share button shares ONLY an invitation (not the score): «جرّب الاختبار ده: لو غبت فجأة، أهلك يعرفوا يبدأوا منين؟ https://ohda.codeandcanvas.net/quiz» via WhatsApp link (https://wa.me/?text=...) and navigator.share when available. Nothing stored.
3. `/start`: if vault exists → unlock form; else → create form; plus «عندي نسخة احتياطية» import (.ohda file, then unlock with passphrase and save to IndexedDB).
4. `/file` (requires unlocked): wizard with sections and a sidebar/progress: بياناتك، ابدأوا من هنا (firstSteps textarea with placeholder example), مين يكلموا الأول (repeatable rows), الشغل في السعودية، البنوك، التأمين، فلوس ليك عند ناس، فلوس عليك لناس، الأملاك والأوراق، رغبات غير ملزمة (with note: «ده مش وصية شرعية. لو عايز وصية رسمية اعملها عند الجهة المختصة واكتب هنا مكانها»). Repeatable rows add/remove. Completion meter. Buttons: preview as family will see it (render read-only), backup, lock, go to handover.
5. `/handover` «سلّم أهلك» (requires unlocked AND activated, otherwise show what's included + price + how to activate):
   - Step 1: choose who holds what: «كود واحد مع شخص واحد» or «الكود متقسّم على شخصين (لازم الاتنين مع بعض)». Inputs for holder names (only shown on the printed card; may be kept inside the encrypted owner content as handover.holders, never sent anywhere).
   - Step 2: generate: if the owner envelope has no code wrap yet → const {wrap, codes} = await makeCodeWrap(dk, split); show codes ONCE big and clear with copy buttons and a warning «الكود ده مش هيظهر تاني. اطبعه دلوقتي»; then add `wrap` to the owner envelope wraps (so later re-exports keep the same codes valid) and save. If a code wrap already exists → reuse it (option «اعمل كود جديد» regenerates, replaces the code wrap, and warns that old cards won't open NEW family files).
   - Step 3: download the family file: env = await sealContent(dk, plan, "family", [codeWrap]); fetch /family-template.html, inject, download as `ملف-عهدة-للأهل.html` (type text/html). Explain: ابعت الملف ده لأهلك على واتساب أو احفظه عندهم في Drive. الملف لوحده مش بيفتح من غير الكود.
   - Step 4: print card(s): a print-optimized page per code holder: title «كارت عُهدة — احتفظ بيه في مكان آمن», holder name, the code in big monospace, short instructions: ١) هاتوا ملف «ملف-عهدة-للأهل.html» ٢) افتحوه أو ادخلوا ohda.codeandcanvas.net/open وارفعوه ٣) اكتبوا الكود. For split mode each card says «ده نص الكود — النص التاني مع (اسم الشخص التاني)».
   - Step 5: rehearsal «جرّب الفتح»: generates a DEMO family file with dummy data and a demo code (makeCodeWrap on a fresh demo dk), lets the owner download it and open it on /open to practice, so family can try without revealing the real file.
   - Re-export anytime after edits (no payment again).
6. `/open` «افتح ملف أهلك» (public, no unlock needed): upload the family .html file (extract the JSON from <script id="ohda-data">) or a .ohda family JSON; validateEnvelope; if wrap mode split2 show two code inputs; unlockWithCodes(); render the plan read-only like the template's render (same sections, same disclaimer «الملف ده دليل عملي كتبه صاحبه عشان يساعدكم تبدأوا. مش وصية شرعية ولا مستند قانوني، ومش بيدّي حد صلاحية على أي حساب. تأكدوا من أي إجراء من الجهة الرسمية.» and the «جهات ممكن تساعدكم» list from the template); print button. Everything local; say so on the page.
7. `/activate` «التفعيل»: prices: فردي 19 ريال / 99 جنيه مرة واحدة؛ باقة العيلة 3 أكواد 39 ريال / 199 جنيه. Includes: تسليم الأهل، الكروت المطبوعة، تقسيم الكود، تجربة الفتح، وتحديثات بلا حدود. How to pay during the pilot: WhatsApp buttons (prefilled text «عايز أفعّل عُهدة — باقة: … — الدفع من: مصر/السعودية»): Egypt +201001850509, Saudi +966539478399. Text: «في الفترة التجريبية بنرد ونبعتلك طريقة الدفع وكود التفعيل يدويًا في خلال ساعات». Code input «OHDA-XXXX-XXXX-XXXX-XXXX» → call RPC redeem_activation(p_code) → if ok store localStorage "ohda-activation" = {plan, at}; show success. Errors: invalid / used up.
8. `/security` «إزاي بنحمي ملفك»: plain-language explanation: AES-256-GCM، مفتاح 256-bit عشوائي، PBKDF2-SHA256 بـ 600,000 تكرار لكلمة السر، كود الأهل 128-bit عشوائي، تقسيم الكود XOR بحيث نص واحد ما يكشفش أي حاجة، مفيش بيانات على سيرفراتنا، ملف الأهل بيفتح من غير الموقع. Limitations honestly: جهاز مخترق، كلمة سر ضعيفة، لو ضاع الكود وكلمة السر مفيش استرجاع. Line «الكود المصدري لوحدة التشفير هيتنشر على GitHub قريبًا».
9. `/privacy` سياسة الخصوصية: we store no file content and no user accounts; the only server data is hashed activation codes and use counts; payment conversations happen on WhatsApp/bank and are kept only as long as needed for accounting; contact admin@codeandcanvas.net.
10. `/admin`: Supabase auth (email+password) for admin only. Admin = user_roles table with app_role enum ('admin') + security definer has_role(uid, role) function; trigger: when a user with email abedeer332@gmail.com confirms email, insert admin role. Admin page: generate N activation codes for plan 'single' (max_uses 2) or 'family' (creates 3 separate codes, each max_uses 2, plan 'family') with an optional note (payment reference only — helper text «ما تكتبش اسم أو رقم العميل، رقم العملية بس»); codes generated client-side with crypto.getRandomValues as OHDA-XXXX-XXXX-XXXX-XXXX (Crockford base32 alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ, 16 chars = 80 bits), shown once with copy buttons and a ready WhatsApp message «كود تفعيل عُهدة: … — ادخل على ohda.codeandcanvas.net/activate». Only the SHA-256 hex hash of the normalized code (uppercase, no spaces) is inserted via admin RPC admin_create_code(p_hash, p_plan, p_max_uses, p_note). List: hash prefix, plan, uses/max, note, created_at; revoke (set max_uses = uses). Non-admins see "غير مصرح". No public signup link: /admin shows login only; sign-up form only when URL has ?setup=1.

## DATABASE (Lovable Cloud / Supabase)
- extension pgcrypto.
- table activation_codes(id uuid pk default gen_random_uuid(), code_hash text unique not null, plan text not null check (plan in ('single','family')), max_uses int not null default 2, uses int not null default 0, note text, created_at timestamptz default now(), created_by uuid). RLS enabled. Policies: admins (has_role) can select/insert/update. No other access.
- function redeem_activation(p_code text) returns json, SECURITY DEFINER, set search_path=public, extensions: norm = upper(regexp_replace(p_code,'\s','','g')); hash = encode(digest(norm,'sha256'),'hex'); update activation_codes set uses = uses+1 where code_hash = hash and uses < max_uses returning plan; return {ok:true, plan} or {ok:false, reason:'invalid'|'used'}. GRANT EXECUTE to anon, authenticated.
- function admin_create_code(...) SECURITY DEFINER that checks has_role(auth.uid(),'admin').
- user_roles + has_role as standard.

## FOOTER
«عُهدة — منتج من Code & Canvas · admin@codeandcanvas.net · واتساب» + links: الأمان، الخصوصية، افتح ملف أهلك. Small line: «عُهدة دليل عملي وليست خدمة قانونية أو مالية».

Make sure the build passes, all routes work on mobile (375px), and nothing in the app references "Lovable". Use React Router.

## SECTION A — src/lib/ohdaCrypto.ts (exact content)
```ts
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

export type PassWrap = { type: "pass"; salt: string; iter: number; iv: string; wk: string };
export type CodeWrap = { type: "code"; mode: "single" | "split2"; salt: string; iv: string; wk: string };
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

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function toB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- Crockford Base32 codes with checksum ----------
const ALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function bytesToB32(b: Uint8Array): string {
  let bits = 0, value = 0, out = "";
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

function b32ToBytes(s: string, nBytes: number): Uint8Array {
  let bits = 0, value = 0;
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
  let a = 1, c = 0;
  for (const x of b) { a = (a + x) % 1021; c = (c + a) % 1021; }
  const v = (a * 31 + c) % 1024;
  return ALPH[(v >> 5) & 31] + ALPH[v & 31];
}

/** 16 bytes -> "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" (26 data chars + 2 check chars) */
export function formatCode(secret: Uint8Array): string {
  const body = bytesToB32(secret) + checksum(secret);
  return body.match(/.{1,4}/g)!.join("-");
}

export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

export function parseCode(input: string): Uint8Array {
  const s = normalizeCode(input);
  if (s.length !== 28) throw new Error("الكود لازم يكون 28 حرف/رقم");
  const secret = b32ToBytes(s.slice(0, 26), 16);
  if (checksum(secret) !== s.slice(26)) throw new Error("في غلطة في كتابة الكود — راجعه حرف حرف");
  return secret;
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i];
  return o;
}

// ---------- key derivation ----------
async function passKey(passphrase: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function codeKey(secret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: HKDF_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function aesEncrypt(key: CryptoKey, data: Uint8Array) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, data));
  return { iv, ct };
}
async function aesDecrypt(key: CryptoKey, iv: Uint8Array, ct: Uint8Array) {
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, ct));
}

// ---------- public API ----------
export function newDataKey(): Uint8Array {
  return randomBytes(32);
}

export async function makePassWrap(dk: Uint8Array, passphrase: string, iter = PBKDF2_ITERATIONS): Promise<PassWrap> {
  const salt = randomBytes(16);
  const k = await passKey(passphrase, salt, iter);
  const { iv, ct } = await aesEncrypt(k, dk);
  return { type: "pass", salt: toB64(salt), iter, iv: toB64(iv), wk: toB64(ct) };
}

/** Returns the wrap plus the human codes to print. split=true -> two codes, both required. */
export async function makeCodeWrap(dk: Uint8Array, split: boolean): Promise<{ wrap: CodeWrap; codes: string[] }> {
  const salt = randomBytes(16);
  let secret: Uint8Array;
  let codes: string[];
  if (split) {
    const s1 = randomBytes(16);
    const s2 = randomBytes(16);
    secret = xor(s1, s2);
    codes = [formatCode(s1), formatCode(s2)];
  } else {
    secret = randomBytes(16);
    codes = [formatCode(secret)];
  }
  const k = await codeKey(secret, salt);
  const { iv, ct } = await aesEncrypt(k, dk);
  secret.fill(0);
  return { wrap: { type: "code", mode: split ? "split2" : "single", salt: toB64(salt), iv: toB64(iv), wk: toB64(ct) }, codes };
}

export async function sealContent(dk: Uint8Array, content: unknown, kind: "owner" | "family", wraps: Wrap[]): Promise<OhdaEnvelope> {
  const key = await subtle().importKey("raw", dk, "AES-GCM", false, ["encrypt"]);
  const { iv, ct } = await aesEncrypt(key, new TextEncoder().encode(JSON.stringify(content)));
  return { format: FORMAT, v: VERSION, kind, created: new Date().toISOString(), wraps, iv: toB64(iv), ct: toB64(ct) };
}

async function openWithDK(env: OhdaEnvelope, dk: Uint8Array): Promise<unknown> {
  const key = await subtle().importKey("raw", dk, "AES-GCM", false, ["decrypt"]);
  const pt = await aesDecrypt(key, fromB64(env.iv), fromB64(env.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

export function validateEnvelope(x: unknown): OhdaEnvelope {
  const e = x as OhdaEnvelope;
  if (!e || e.format !== FORMAT || e.v !== 1 || !Array.isArray(e.wraps) || typeof e.ct !== "string" || typeof e.iv !== "string") {
    throw new Error("الملف ده مش ملف عُهدة صالح");
  }
  return e;
}

/** Owner unlock. Returns content and the data key (kept in memory only while unlocked). */
export async function unlockWithPassphrase(env: OhdaEnvelope, passphrase: string): Promise<{ content: unknown; dk: Uint8Array }> {
  const w = env.wraps.find((x): x is PassWrap => x.type === "pass");
  if (!w) throw new Error("الملف ده مش محمي بكلمة سر");
  if (w.iter < 100_000 || w.iter > 10_000_000) throw new Error("إعدادات الملف غير مقبولة");
  try {
    const k = await passKey(passphrase, fromB64(w.salt), w.iter);
    const dk = await aesDecrypt(k, fromB64(w.iv), fromB64(w.wk));
    return { content: await openWithDK(env, dk), dk };
  } catch {
    throw new Error("كلمة السر غلط");
  }
}

/** Family unlock: one code (single) or two codes (split2). */
export async function unlockWithCodes(env: OhdaEnvelope, codeInputs: string[]): Promise<unknown> {
  const w = env.wraps.find((x): x is CodeWrap => x.type === "code");
  if (!w) throw new Error("الملف ده مش ملف أهل");
  let secret: Uint8Array;
  if (w.mode === "split2") {
    if (codeInputs.length < 2 || !codeInputs[0] || !codeInputs[1]) throw new Error("الملف ده محتاج الكودين الاتنين");
    secret = xor(parseCode(codeInputs[0]), parseCode(codeInputs[1]));
  } else {
    secret = parseCode(codeInputs[0] ?? "");
  }
  try {
    const k = await codeKey(secret, fromB64(w.salt));
    const dk = await aesDecrypt(k, fromB64(w.iv), fromB64(w.wk));
    return await openWithDK(env, dk);
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
```

## SECTION B — public/family-template.html (exact content)
```html
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>ملف عُهدة — للأهل</title>
<style>
:root{--ink:#14213d;--muted:#5b6475;--line:#d9dee7;--bg:#f6f4ef;--card:#fff;--brand:#0f5c4d;--accent:#c8913a;--bad:#a4262c}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic","Geeza Pro",Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.7}
.wrap{max-width:760px;margin:0 auto;padding:20px 16px 60px}
header{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.logo{width:40px;height:40px;border-radius:10px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:700;font-size:22px}
h1{font-size:22px;margin:0}
h2{font-size:18px;margin:0 0 8px;color:var(--brand)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:14px 0}
label{display:block;font-weight:600;margin:10px 0 6px}
input{width:100%;font-size:18px;padding:12px;border:1px solid var(--line);border-radius:10px;direction:ltr;text-align:center;letter-spacing:1px;font-family:Consolas,monospace}
button{background:var(--brand);color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:17px;font-weight:600;cursor:pointer;width:100%;margin-top:14px}
button.secondary{background:#fff;color:var(--brand);border:1px solid var(--brand);width:auto}
.err{color:var(--bad);font-weight:600;margin-top:10px;min-height:1em}
.muted{color:var(--muted);font-size:14px}
table{width:100%;border-collapse:collapse;font-size:15px}
td,th{border-bottom:1px solid var(--line);padding:8px 6px;text-align:right;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:13px}
.steps{white-space:pre-wrap;background:#fff7e8;border:1px solid #f0d9ae;border-radius:10px;padding:12px}
.kv div{display:flex;gap:8px;border-bottom:1px solid var(--line);padding:6px 0}
.kv b{min-width:150px;color:var(--muted);font-weight:600}
.notice{background:#eef5f3;border:1px solid #cfe3dd;border-radius:10px;padding:12px;font-size:14px}
@media print{.noprint{display:none!important}body{background:#fff}.card{border:1px solid #999;break-inside:avoid}}
</style>
</head>
<body>
<div class="wrap">
  <header><div class="logo">ع</div><div><h1>ملف عُهدة للأهل</h1><div class="muted">الملف ده مشفّر. محدش يقدر يقراه من غير الكود المطبوع.</div></div></header>

  <div id="unlock" class="card noprint">
    <h2>افتح الملف</h2>
    <p class="muted">اكتب الكود اللي على الكارت المطبوع. مش مهم الشرطات أو الحروف الكبيرة والصغيرة.</p>
    <label for="c1">الكود</label>
    <input id="c1" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX">
    <div id="c2box" style="display:none">
      <label for="c2">الكود التاني (مع الشخص التاني)</label>
      <input id="c2" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX">
    </div>
    <button id="go">افتح الملف</button>
    <div id="err" class="err" role="alert"></div>
    <p class="muted">الفتح بيحصل على جهازك بس، ومفيش أي حاجة بتتبعت لأي مكان. لو الصفحة دي مش شغالة على الموبايل، افتح الملف من موقع عُهدة: صفحة «افتح ملف أهلك».</p>
  </div>

  <div id="out"></div>
</div>

<script id="ohda-data" type="application/json">/*__OHDA_DATA__*/</script>
<script>
(function(){
"use strict";
var ALPH="0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var AAD=new TextEncoder().encode("ohda:v1");
var INFO=new TextEncoder().encode("ohda family v1");
function fromB64(s){var b=atob(s),o=new Uint8Array(b.length);for(var i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;}
function norm(s){return String(s||"").toUpperCase().replace(/[\s\-_.]/g,"").replace(/O/g,"0").replace(/[IL]/g,"1").replace(/U/g,"V");}
function b32(s,n){var bits=0,val=0,out=[];for(var i=0;i<s.length;i++){var v=ALPH.indexOf(s[i]);if(v<0)throw new Error("في حرف مش مسموح في الكود");val=((val<<5)|v)&0xffff;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8;}}if(out.length<n)throw new Error("الكود ناقص");return new Uint8Array(out.slice(0,n));}
function sum(b){var a=1,c=0;for(var i=0;i<b.length;i++){a=(a+b[i])%1021;c=(c+a)%1021;}var v=(a*31+c)%1024;return ALPH[(v>>5)&31]+ALPH[v&31];}
function parse(input){var s=norm(input);if(s.length!==28)throw new Error("الكود لازم يكون 28 حرف/رقم");var sec=b32(s.slice(0,26),16);if(sum(sec)!==s.slice(26))throw new Error("في غلطة في كتابة الكود — راجعه حرف حرف");return sec;}
function xor(a,b){var o=new Uint8Array(a.length);for(var i=0;i<a.length;i++)o[i]=a[i]^b[i];return o;}
function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}

var env;
try{env=JSON.parse(document.getElementById("ohda-data").textContent);}catch(e){env=null;}
var wrap=env&&env.wraps&&env.wraps.filter(function(w){return w.type==="code";})[0];
if(!env||env.format!=="ohda"||!wrap){document.getElementById("err").textContent="الملف ده ناقص أو اتعدّل.";document.getElementById("go").disabled=true;return;}
if(wrap.mode==="split2")document.getElementById("c2box").style.display="block";
if(!window.crypto||!crypto.subtle){document.getElementById("err").textContent="المتصفح ده مش بيدعم فك التشفير هنا. افتح الملف من موقع عُهدة.";}

async function open(){
  var err=document.getElementById("err");err.textContent="";
  var secret;
  try{
    if(wrap.mode==="split2"){secret=xor(parse(document.getElementById("c1").value),parse(document.getElementById("c2").value));}
    else secret=parse(document.getElementById("c1").value);
  }catch(e){err.textContent=e.message;return;}
  try{
    var base=await crypto.subtle.importKey("raw",secret,"HKDF",false,["deriveKey"]);
    var k=await crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:fromB64(wrap.salt),info:INFO},base,{name:"AES-GCM",length:256},false,["decrypt"]);
    var dk=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(wrap.iv),additionalData:AAD},k,fromB64(wrap.wk)));
    var key=await crypto.subtle.importKey("raw",dk,"AES-GCM",false,["decrypt"]);
    var pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(env.iv),additionalData:AAD},key,fromB64(env.ct));
    render(JSON.parse(new TextDecoder().decode(pt)));
  }catch(e){err.textContent="الكود مش مطابق للملف ده.";}
  finally{secret.fill(0);}
}
document.getElementById("go").addEventListener("click",open);

function table(rows,cols){
  rows=(rows||[]).filter(function(r){return cols.some(function(c){return r&&r[c[0]];});});
  if(!rows.length)return "";
  var h="<table><tr>"+cols.map(function(c){return "<th>"+c[1]+"</th>";}).join("")+"</tr>";
  rows.forEach(function(r){h+="<tr>"+cols.map(function(c){return "<td><bdi>"+esc(r[c[0]])+"</bdi></td>";}).join("")+"</tr>";});
  return h+"</table>";
}
function kv(obj,fields){
  var h="";fields.forEach(function(f){if(obj&&obj[f[0]])h+="<div><b>"+f[1]+"</b><bdi>"+esc(obj[f[0]])+"</bdi></div>";});
  return h?"<div class='kv'>"+h+"</div>":"";
}
function card(title,body){return body?"<div class='card'><h2>"+title+"</h2>"+body+"</div>":"";}

function render(p){
  document.getElementById("unlock").style.display="none";
  var o=p.owner||{},w=p.work||{};
  var h="";
  h+="<div class='card'><h2>ملف "+esc(o.name||"")+"</h2><div class='muted'>آخر تحديث: "+esc((p.updated||"").slice(0,10))+"</div>"+
     "<p class='notice'>الملف ده دليل عملي كتبه صاحبه عشان يساعدكم تبدأوا. مش وصية شرعية ولا مستند قانوني، ومش بيدّي حد صلاحية على أي حساب. تأكدوا من أي إجراء من الجهة الرسمية.</p>"+
     "<button class='secondary noprint' onclick='window.print()'>اطبع الملف</button></div>";
  if(p.firstSteps)h+=card("ابدأوا من هنا","<div class='steps'>"+esc(p.firstSteps)+"</div>");
  h+=card("مين تكلموا الأول",table(p.contacts,[["name","الاسم"],["relation","الصلة"],["phone","الرقم"],["note","ليه"]]));
  h+=card("بياناته الأساسية",kv(o,[["name","الاسم"],["phone","الموبايل"],["city","المدينة"],["notes","ملاحظات"]]));
  h+=card("الشغل في السعودية",kv(w,[["employer","جهة العمل"],["employerPhone","تليفون جهة العمل"],["hrContact","مسؤول الموارد البشرية"],["jobTitle","الوظيفة"],["startDate","بداية العمل"],["iqamaLast4","آخر 4 أرقام من الإقامة"],["gosi","التأمينات الاجتماعية (GOSI)"],["contractLocation","العقد فين"],["notes","ملاحظات"]]));
  h+=card("البنوك",table(p.banks,[["name","البنك"],["country","البلد"],["type","نوع الحساب"],["note","ملاحظة"]]));
  h+=card("التأمين",table(p.insurance,[["company","الشركة"],["type","النوع"],["policyRef","مرجع الوثيقة"],["note","ملاحظة"]]));
  h+=card("فلوس ليه عند ناس",table(p.owedToMe,[["who","مين"],["amount","المبلغ"],["currency","العملة"],["proof","الإثبات فين"]]));
  h+=card("فلوس عليه لناس",table(p.iOwe,[["to","لمين"],["amount","المبلغ"],["currency","العملة"],["how","إزاي تتدفع"]]));
  h+=card("الأملاك والأوراق",table(p.assets,[["item","الحاجة"],["location","مكانها"],["holder","مع مين"]]));
  if(p.wishes)h+=card("رغبات (غير ملزمة)","<div class='steps'>"+esc(p.wishes)+"</div>");
  h+=card("جهات ممكن تساعدكم","<ul>"+
    "<li>لو كان شغّال في السعودية: جهة العمل المكتوبة فوق، ومكتب التمثيل العمالي المصري التابع للسفارة أو القنصلية المصرية في السعودية لمتابعة المستحقات.</li>"+
    "<li>الحسابات البنكية في السعودية: البنك المركزي السعودي (ساما) عنده خدمة للورثة للاستعلام عن حسابات المتوفى.</li>"+
    "<li>الحسابات البنكية في مصر: البنك المركزي المصري بيتيح للورثة الاستعلام عن حسابات المتوفى في كل البنوك.</li>"+
    "<li>الإجراءات بتتغير، فاتأكدوا دايمًا من الموقع الرسمي للجهة.</li></ul>");
  document.getElementById("out").innerHTML=h;
}
})();
</script>
</body>
</html>
```

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ohda-family.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/19ac579d-c185-4bda-bd67-8fe04d7a3eb9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
