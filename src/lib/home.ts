/**
 * Pure helpers for the owner's home screen (src/routes/file.tsx): what to do next, how sections
 * are grouped, quick-add types, the review reminder file, backup age and quiz follow-ups.
 *
 * Nothing here touches the vault. The two localStorage notes kept by this module hold no file
 * content: the date of the last backup download, and which quiz topics were answered "no".
 */
import type { Plan } from "@/lib/plan";
import { KEY_SECTIONS, SECTION_ORDER, sectionDone, type SectionKey } from "@/lib/review";

// ---------- next step ----------
/** The section to fill next: what the family needs most first, then the editor's order. */
export function nextStep(p: Plan): SectionKey | null {
  const done = sectionDone(p);
  return [...KEY_SECTIONS, ...SECTION_ORDER].find((k) => !done[k]) ?? null;
}

// ---------- groups (the big-word filter) ----------
export type GroupKey = "all" | "people" | "work" | "money" | "papers";
export const GROUPS: [GroupKey, string][] = [
  ["all", "الكل"],
  ["people", "الناس"],
  ["work", "الشغل"],
  ["money", "الفلوس"],
  ["papers", "الأوراق"],
];
export const SECTION_GROUP: Record<SectionKey, Exclude<GroupKey, "all">> = {
  owner: "people",
  firstSteps: "people",
  contacts: "people",
  letter: "people",
  work: "work",
  banks: "money",
  insurance: "money",
  owedToMe: "money",
  iOwe: "money",
  assets: "papers",
  accounts: "papers",
  wishes: "papers",
};

/** One line per section: what goes in it (and what must not). */
export const SECTION_HINT: Record<SectionKey, string> = {
  owner: "اسمك ورقمك زي ما أهلك يعرفوهم.",
  firstSteps: "أول 3 حاجات يعملوها. دي أهم حتة في الملف.",
  contacts: "حد عارف أمورك يبدأوا بيه.",
  work: "جهة العمل، ومين يكلموه على المستحقات.",
  banks: "اسم البنك ونوع الحساب بس، من غير أرقام.",
  insurance: "الشركة والنوع، والوثيقة موجودة فين.",
  owedToMe: "مين، كام، والإثبات فين.",
  iOwe: "لمين، كام، وتتدفع إزاي.",
  assets: "شقة، عربية، دهب، عقود: ومكانها.",
  accounts: "الإيميل والتليفون والسوشيال: مسجّلة بإيه وتتقفل إزاي. من غير كلمات سر.",
  wishes: "حاجات تحب تتعمل. مش وصية.",
  letter: "كلام منك ليهم، بيظهر أول ما يفتحوا الملف.",
};

/** List sections and how many rows each has; null for the text/field sections. */
export type ListKey =
  "contacts" | "banks" | "insurance" | "owedToMe" | "iOwe" | "assets" | "accounts";
export const LIST_KEYS: ListKey[] = [
  "contacts",
  "banks",
  "insurance",
  "owedToMe",
  "iOwe",
  "assets",
  "accounts",
];
export function sectionCount(p: Plan, k: SectionKey): number | null {
  return (LIST_KEYS as SectionKey[]).includes(k) ? p[k as ListKey].length : null;
}

// ---------- quick add (the + button) ----------
export type QuickType = {
  list: ListKey;
  /** the field the single quick-add input fills */
  field: string;
  /** every field of a row of this list, so a new row is complete */
  fields: string[];
  title: string;
  placeholder: string;
};
export const QUICK_TYPES: QuickType[] = [
  {
    list: "contacts",
    field: "name",
    fields: ["name", "relation", "phone", "note"],
    title: "شخص يكلموه",
    placeholder: "مثلًا: محمد أخويا",
  },
  {
    list: "banks",
    field: "name",
    fields: ["name", "country", "type", "note"],
    title: "بنك",
    placeholder: "مثلًا: الراجحي",
  },
  {
    list: "insurance",
    field: "company",
    fields: ["company", "type", "policyRef", "note"],
    title: "تأمين",
    placeholder: "مثلًا: تأمين طبي من الشغل",
  },
  {
    list: "owedToMe",
    field: "who",
    fields: ["who", "amount", "currency", "proof"],
    title: "فلوس ليك",
    placeholder: "مثلًا: أحمد زميلي",
  },
  {
    list: "iOwe",
    field: "to",
    fields: ["to", "amount", "currency", "how"],
    title: "فلوس عليك",
    placeholder: "مثلًا: خالي",
  },
  {
    list: "assets",
    field: "item",
    fields: ["item", "location", "holder"],
    title: "حاجة أو ورقة",
    placeholder: "مثلًا: عقد الشقة",
  },
  {
    list: "accounts",
    field: "name",
    fields: ["name", "login", "action", "note"],
    title: "حساب على النت",
    placeholder: "مثلًا: جيميل",
  },
];

/** A plan with one more row in `t.list`, its main field set to `value`. */
export function quickAdd(p: Plan, t: QuickType, value: string, maxRows: number): Plan {
  const rows = p[t.list] as unknown as Record<string, string>[];
  const v = value.trim().slice(0, 500);
  if (!v || rows.length >= maxRows) return p;
  const row = Object.fromEntries(t.fields.map((f) => [f, f === t.field ? v : ""]));
  return { ...p, [t.list]: [...rows, row] };
}

// ---------- "did something change?" ----------
export const LIFE_EVENTS: { title: string; hint: string; section: SectionKey }[] = [
  { title: "غيّرت شغلك؟", hint: "حدّث جهة العمل ومسؤول الموارد البشرية.", section: "work" },
  { title: "فتحت حساب بنك؟", hint: "ضيف اسم البنك ونوع الحساب.", section: "banks" },
  { title: "غيّرت رقمك؟", hint: "حدّث موبايلك في بياناتك.", section: "owner" },
  { title: "اشتريت أو بعت حاجة؟", hint: "شقة، عربية، دهب: حدّث الأملاك.", section: "assets" },
  { title: "سلّفت أو استلفت؟", hint: "اكتب مين وكام.", section: "owedToMe" },
  { title: "اتجوزت أو جالك مولود؟", hint: "راجع مين يكلموا الأول.", section: "contacts" },
];

// ---------- review reminder (.ics, no server, no account) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const icsDate = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** A calendar file with an all-day reminder every `months` months, starting `months` from now. */
export function buildReviewIcs(now = new Date(), months = 6, uid = `${now.getTime()}`): string {
  const first = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ohda//Review reminder//AR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:ohda-review-${uid}@ohda`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART;VALUE=DATE:${icsDate(first)}`,
    `RRULE:FREQ=MONTHLY;INTERVAL=${months}`,
    "SUMMARY:راجع ملف عُهدة",
    "DESCRIPTION:افتح ملفك\\, حدّث أي حاجة اتغيّرت\\, ونزّل نسخة احتياطية جديدة.",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

// ---------- backup age ----------
const BACKUP_KEY = "ohda-last-backup";
export function readLastBackup(): string | null {
  try {
    const v = localStorage.getItem(BACKUP_KEY);
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}
export function writeLastBackup(iso: string | null): void {
  try {
    if (iso) localStorage.setItem(BACKUP_KEY, iso);
    else localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* blocked storage: the home screen just says "no backup yet" */
  }
}
export type BackupState = "none" | "stale" | "fresh";
/** How the last backup relates to the file: never made, older than the last edit, or current. */
export function backupState(lastBackup: string | null, updated: string): BackupState {
  if (!lastBackup) return "none";
  return Date.parse(updated) > Date.parse(lastBackup) ? "stale" : "fresh";
}
export function backupAgeText(lastBackup: string | null, now = new Date()): string {
  if (!lastBackup) return "لسه ما نزّلتش نسخة احتياطية";
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(lastBackup)) / 86_400_000));
  if (days === 0) return "آخر نسخة: النهارده";
  if (days === 1) return "آخر نسخة: إمبارح";
  if (days <= 10) return `آخر نسخة: من ${days} أيام`;
  return `آخر نسخة: من ${days} يوم`;
}

// ---------- quiz follow-ups ----------
/** Which editor section each quiz question (src/routes/quiz.tsx, same order) is about. */
export const QUIZ_SECTIONS: (SectionKey | null)[] = [
  "work",
  "work",
  "banks",
  "insurance",
  "owedToMe",
  "iOwe",
  "assets",
  "contacts",
  "assets",
  null, // "did you talk to them about it" has no section
];
const QUIZ_KEY = "ohda-quiz-gaps";
/** Sections behind the questions answered "no", without duplicates, in question order. */
export function quizGaps(answers: boolean[]): SectionKey[] {
  const out: SectionKey[] = [];
  answers.forEach((yes, i) => {
    const k = QUIZ_SECTIONS[i];
    if (yes === false && k && !out.includes(k)) out.push(k);
  });
  return out;
}
export function writeQuizGaps(gaps: SectionKey[] | null): void {
  try {
    if (gaps && gaps.length) localStorage.setItem(QUIZ_KEY, JSON.stringify(gaps));
    else localStorage.removeItem(QUIZ_KEY);
  } catch {
    /* ignore */
  }
}
export function readQuizGaps(): SectionKey[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(QUIZ_KEY) ?? "[]");
    return Array.isArray(v)
      ? v.filter((k): k is SectionKey => (SECTION_ORDER as string[]).includes(k as string))
      : [];
  } catch {
    return [];
  }
}
