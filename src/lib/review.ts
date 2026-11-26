import type { Plan } from "@/lib/plan";
import { SECRET_WARNING, familyCopy, sensitiveWarnings } from "@/lib/plan";

/** Editor sections, in the order the owner sees them. */
export type SectionKey =
  | "owner"
  | "firstSteps"
  | "contacts"
  | "work"
  | "banks"
  | "insurance"
  | "owedToMe"
  | "iOwe"
  | "assets"
  | "accounts"
  | "wishes"
  | "letter";

/** Display order of the sections. */
export const SECTION_ORDER: SectionKey[] = [
  "owner",
  "firstSteps",
  "contacts",
  "work",
  "banks",
  "insurance",
  "owedToMe",
  "iOwe",
  "assets",
  "accounts",
  "wishes",
  "letter",
];

/** Arabic section titles. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  owner: "بياناتك",
  firstSteps: "ابدأوا من هنا",
  contacts: "مين يكلموا الأول",
  work: "الشغل في السعودية",
  banks: "البنوك",
  insurance: "التأمين",
  owedToMe: "فلوس ليك عند ناس",
  iOwe: "فلوس عليك لناس",
  assets: "الأملاك والأوراق",
  accounts: "حساباتك على النت",
  wishes: "رغبات غير ملزمة",
  letter: "رسالة لأهلك",
};

/** What a family needs most. */
export const KEY_SECTIONS: SectionKey[] = ["firstSteps", "contacts"];

/** Whether each section has enough content to count as filled in. */
export function sectionDone(p: Plan): Record<SectionKey, boolean> {
  return {
    owner: !!p.owner.name,
    firstSteps: p.firstSteps.trim().length > 10,
    contacts: p.contacts.some((c) => !!c.name && !!c.phone),
    work: !!p.work.employer,
    banks: p.banks.some((b) => !!b.name),
    insurance: p.insurance.some((i) => !!i.company),
    owedToMe: p.owedToMe.length > 0,
    iOwe: p.iOwe.length > 0,
    assets: p.assets.some((a) => !!a.item),
    accounts: p.accounts.some((a) => !!a.name),
    wishes: p.wishes.trim().length > 0,
    letter: p.letter.trim().length > 0,
  };
}

/** Key sections that are still empty, in KEY_SECTIONS order. */
export function missingKeySections(p: Plan): SectionKey[] {
  const done = sectionDone(p);
  return KEY_SECTIONS.filter((k) => !done[k]);
}

/** The sections whose fields the editor marks sensitive (bank and insurance rows). Phone numbers elsewhere are long digit runs on purpose, so they are not checked. */
export const SENSITIVE_SECTIONS: SectionKey[] = ["banks", "insurance", "accounts"];
/** Sections where long numbers are expected (a phone number as a login): only secrets count. */
const SECRET_ONLY_SECTIONS: SectionKey[] = ["accounts"];

/** One section that contains text the family file should not carry. */
export type SensitiveFinding = { section: SectionKey; label: string; warnings: string[] };

/**
 * Checks exactly what the family file will contain (familyCopy) for full account numbers or
 * secrets in the sensitive sections. One entry per flagged section, in SECTION_ORDER; [] when clean.
 */
export function sensitiveFindings(p: Plan): SensitiveFinding[] {
  const fam = familyCopy(p);
  const out: SensitiveFinding[] = [];
  for (const section of SECTION_ORDER) {
    if (!SENSITIVE_SECTIONS.includes(section)) continue;
    const value: unknown = fam[section];
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const found = new Set<string>();
    for (const row of rows) {
      for (const field of Object.values(row)) {
        if (typeof field !== "string") continue;
        for (const w of sensitiveWarnings(field))
          if (w === SECRET_WARNING || !SECRET_ONLY_SECTIONS.includes(section)) found.add(w);
      }
    }
    if (found.size > 0) out.push({ section, label: SECTION_LABELS[section], warnings: [...found] });
  }
  return out;
}
