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

/**
 * The sections a family cannot start without. The readiness number and bar count only these;
 * everything else (money owed either way, insurance, assets, accounts, wishes, the letter) is
 * optional: a person with no debts or no letter to write is not "incomplete".
 */
export const ESSENTIAL_SECTIONS: SectionKey[] = [
  "owner",
  "firstSteps",
  "contacts",
  "work",
  "banks",
];
export const isEssential = (k: SectionKey): boolean => ESSENTIAL_SECTIONS.includes(k);

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

/**
 * Sections where a long run of digits may be a full account or card number, so both checks apply.
 * Everywhere else (phones, amounts, ids are normal) only passwords and one-time codes count.
 */
export const FINANCIAL_SECTIONS: SectionKey[] = ["banks", "insurance"];

/** What one row of a list section is called, so a warning can say "بنك 2". */
export const ITEM_LABEL: Partial<Record<SectionKey, string>> = {
  contacts: "شخص",
  banks: "بنك",
  insurance: "تأمين",
  owedToMe: "مبلغ",
  iOwe: "مبلغ",
  assets: "حاجة",
  accounts: "حساب",
};

/** One section that contains text the family file should not carry. */
export type SensitiveFinding = {
  section: SectionKey;
  label: string;
  warnings: string[];
  /** 1-based rows that triggered it, for list sections */
  rows?: number[];
};

/** "(بنك 2، بنك 3)" for a finding in a list section; "" otherwise. */
export function findingPlaces(f: SensitiveFinding): string {
  const item = ITEM_LABEL[f.section];
  if (!item || !f.rows?.length) return "";
  return `(${f.rows.map((n) => `${item} ${n}`).join("، ")})`;
}

/**
 * Checks everything the family file will contain (familyCopy), section by section: the letter, the
 * first steps, notes and every list. Financial sections are checked for full account numbers and
 * secrets; all other sections for secrets only. One entry per flagged section, in SECTION_ORDER,
 * with the rows that caused it; [] when clean.
 */
export function sensitiveFindings(p: Plan): SensitiveFinding[] {
  const fam = familyCopy(p);
  const out: SensitiveFinding[] = [];
  for (const section of SECTION_ORDER) {
    const value: unknown = fam[section];
    const financial = FINANCIAL_SECTIONS.includes(section);
    const check = (text: string): string[] =>
      sensitiveWarnings(text).filter((w) => financial || w === SECRET_WARNING);
    const found = new Set<string>();
    const rows: number[] = [];
    if (typeof value === "string") {
      for (const w of check(value)) found.add(w);
    } else if (Array.isArray(value)) {
      (value as Record<string, unknown>[]).forEach((row, i) => {
        const hit = new Set<string>();
        for (const field of Object.values(row))
          if (typeof field === "string") for (const w of check(field)) hit.add(w);
        if (hit.size > 0) {
          rows.push(i + 1);
          hit.forEach((w) => found.add(w));
        }
      });
    } else if (value && typeof value === "object") {
      for (const field of Object.values(value as Record<string, unknown>))
        if (typeof field === "string") for (const w of check(field)) found.add(w);
    }
    if (found.size > 0)
      out.push({
        section,
        label: SECTION_LABELS[section],
        warnings: [...found],
        ...(rows.length > 0 ? { rows } : {}),
      });
  }
  return out;
}
