import { beforeEach, describe, expect, it } from "vitest";

import {
  QUICK_TYPES,
  QUIZ_SECTIONS,
  SECTION_GROUP,
  SECTION_HINT,
  backupAgeText,
  backupState,
  buildReviewIcs,
  nextStep,
  readiness,
  quickAdd,
  quizGaps,
  readLastBackup,
  readQuizGaps,
  sectionCount,
  writeLastBackup,
  writeQuizGaps,
} from "@/lib/home";
import { emptyPlan, familyCopy, normalizePlan, type Plan } from "@/lib/plan";
import {
  SECTION_LABELS,
  SECTION_ORDER,
  missingWhy,
  sectionDone,
  sectionStates,
  sensitiveFindings,
} from "@/lib/review";

const filled = (): Plan => ({
  ...emptyPlan(),
  owner: { name: "أحمد", phone: "0100", city: "", notes: "" },
  firstSteps: "كلموا محمد الأول وبعدين الشركة",
  contacts: [{ name: "محمد", relation: "أخ", phone: "0101", note: "" }],
});

describe("new sections: online accounts and the letter", () => {
  it("exist in every per-section table", () => {
    for (const k of ["accounts", "letter"] as const) {
      expect(SECTION_ORDER).toContain(k);
      expect(SECTION_LABELS[k]).toBeTruthy();
      expect(SECTION_HINT[k]).toBeTruthy();
      expect(SECTION_GROUP[k]).toBeTruthy();
    }
  });

  it("older files without them still open, with empty values", () => {
    const old = { ...emptyPlan() } as Record<string, unknown>;
    delete old["accounts"];
    delete old["letter"];
    const p = normalizePlan(old);
    expect(p.accounts).toEqual([]);
    expect(p.letter).toBe("");
  });

  it("are carried into the family copy and count as done when filled", () => {
    const p: Plan = {
      ...emptyPlan(),
      letter: "بحبكم",
      accounts: [{ name: "جيميل", login: "a@b.c", action: "يتقفل", note: "" }],
    };
    const f = familyCopy(p);
    expect(f.letter).toBe("بحبكم");
    expect(f.accounts).toHaveLength(1);
    expect(sectionDone(p)).toMatchObject({ accounts: true, letter: true });
  });

  it("a phone number as a login is fine, a password is flagged", () => {
    const ok: Plan = {
      ...emptyPlan(),
      accounts: [{ name: "واتساب", login: "+201001234567", action: "", note: "" }],
    };
    expect(sensitiveFindings(ok)).toEqual([]);
    const bad: Plan = {
      ...emptyPlan(),
      accounts: [{ name: "جيميل", login: "", action: "", note: "كلمة السر 1234" }],
    };
    expect(sensitiveFindings(bad).map((f) => f.section)).toEqual(["accounts"]);
  });
});

describe("nextStep", () => {
  it("asks for what the family needs most first, then the editor order", () => {
    expect(nextStep(emptyPlan())).toBe("firstSteps");
    expect(nextStep({ ...emptyPlan(), firstSteps: "كلموا محمد الأول وبعدين الشركة" })).toBe(
      "contacts",
    );
    expect(nextStep({ ...filled(), owner: { ...emptyPlan().owner } })).toBe("owner");
    expect(nextStep(filled())).toBe("work");
  });

  it("is null when every section is done", () => {
    const p: Plan = {
      ...filled(),
      work: { ...emptyPlan().work, employer: "شركة", employerPhone: "0112345678" },
      banks: [{ name: "بنك", country: "", type: "", note: "" }],
      insurance: [{ company: "شركة", type: "", policyRef: "", note: "" }],
      owedToMe: [{ who: "x", amount: "", currency: "", proof: "" }],
      iOwe: [{ to: "y", amount: "", currency: "", how: "" }],
      assets: [{ item: "شقة", location: "", holder: "" }],
      accounts: [{ name: "جيميل", login: "", action: "", note: "" }],
      wishes: "حاجة",
      letter: "رسالة",
    };
    expect(nextStep(p)).toBeNull();
  });
});

describe("quickAdd", () => {
  it("appends a complete row with only the main field filled", () => {
    const bank = QUICK_TYPES.find((t) => t.list === "banks")!;
    const p = quickAdd(emptyPlan(), bank, "  الراجحي ", 500);
    expect(p.banks).toEqual([{ name: "الراجحي", country: "", type: "", note: "" }]);
    expect(sectionCount(p, "banks")).toBe(1);
    expect(sectionCount(p, "owner")).toBeNull();
  });

  it("covers every list with the right field names", () => {
    for (const t of QUICK_TYPES) {
      const p = quickAdd(emptyPlan(), t, "x", 500);
      // normalising must keep the row exactly as added (no unknown or missing keys)
      expect(normalizePlan(p)[t.list]).toEqual(p[t.list]);
      expect((p[t.list][0] as unknown as Record<string, string>)[t.field]).toBe("x");
    }
  });

  it("ignores empty input and respects the row limit", () => {
    const bank = QUICK_TYPES.find((t) => t.list === "banks")!;
    const base = emptyPlan();
    expect(quickAdd(base, bank, "   ", 500)).toBe(base);
    const one = quickAdd(base, bank, "a", 1);
    expect(quickAdd(one, bank, "b", 1)).toBe(one);
  });
});

describe("review reminder", () => {
  it("is a valid recurring all-day event six months out, with no file content", () => {
    const ics = buildReviewIcs(new Date(2026, 10, 26, 9, 0, 0), 6, "t");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270526");
    expect(ics).toContain("RRULE:FREQ=MONTHLY;INTERVAL=6");
    expect(ics).toContain("UID:ohda-review-t@ohda");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});

describe("backup age", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips the last backup date and rejects junk", () => {
    expect(readLastBackup()).toBeNull();
    writeLastBackup("2026-11-20T10:00:00.000Z");
    expect(readLastBackup()).toBe("2026-11-20T10:00:00.000Z");
    localStorage.setItem("ohda-last-backup", "yesterday-ish");
    expect(readLastBackup()).toBeNull();
    writeLastBackup(null);
    expect(localStorage.getItem("ohda-last-backup")).toBeNull();
  });

  it("knows whether the file changed after the last backup", () => {
    expect(backupState(null, "2026-11-20T10:00:00.000Z")).toBe("none");
    expect(backupState("2026-11-20T10:00:00.000Z", "2026-11-21T10:00:00.000Z")).toBe("stale");
    expect(backupState("2026-11-22T10:00:00.000Z", "2026-11-21T10:00:00.000Z")).toBe("fresh");
  });

  it("describes the age in plain words", () => {
    const now = new Date("2026-11-26T12:00:00.000Z");
    expect(backupAgeText(null, now)).toContain("لسه");
    expect(backupAgeText("2026-11-26T08:00:00.000Z", now)).toContain("النهارده");
    expect(backupAgeText("2026-11-25T08:00:00.000Z", now)).toContain("إمبارح");
    expect(backupAgeText("2026-11-14T08:00:00.000Z", now)).toContain("12 يوم");
  });
});

describe("quiz follow-ups", () => {
  beforeEach(() => localStorage.clear());

  it("maps every quiz question to a section (or none)", () => {
    expect(QUIZ_SECTIONS).toHaveLength(10);
    for (const k of QUIZ_SECTIONS) if (k) expect(SECTION_ORDER).toContain(k);
  });

  it("keeps only the topics answered no, once each", () => {
    const answers = [false, false, true, false, true, true, false, true, false, false];
    expect(quizGaps(answers)).toEqual(["work", "insurance", "assets"]);
  });

  it("stores section names only, and ignores anything else found in storage", () => {
    writeQuizGaps(["banks", "work"]);
    expect(readQuizGaps()).toEqual(["banks", "work"]);
    localStorage.setItem("ohda-quiz-gaps", '["banks","<script>",7]');
    expect(readQuizGaps()).toEqual(["banks"]);
    writeQuizGaps(null);
    expect(readQuizGaps()).toEqual([]);
  });
});

describe("readiness separates what the family needs from what is optional", () => {
  const essentials = (): Plan => ({
    ...filled(),
    work: { ...emptyPlan().work, employer: "شركة", employerPhone: "0112345678" },
    banks: [{ name: "بنك", country: "", type: "", note: "" }],
  });

  it("starts at zero and counts only the five essential sections", () => {
    const r = readiness(emptyPlan());
    expect(r).toMatchObject({ essentialDone: 0, essentialTotal: 5, pct: 0, ready: false });
    expect(r.optionalTotal).toBe(7);
  });

  it("is ready once the essentials are in, even with every optional section empty", () => {
    const r = readiness(essentials());
    expect(r).toMatchObject({ essentialDone: 5, pct: 100, ready: true, optionalDone: 0 });
    // the next suggestion is then an optional section, and it is not blocked by the letter
    expect(nextStep(essentials())).toBe("insurance");
  });

  it("optional sections never change the percentage", () => {
    const more: Plan = { ...essentials(), letter: "رسالة", wishes: "حاجة", accounts: [] };
    expect(readiness(more).pct).toBe(100);
    expect(readiness(more).optionalDone).toBe(2);
    const half: Plan = { ...filled(), letter: "رسالة" };
    expect(readiness(half).pct).toBe(60); // owner, firstSteps, contacts of 5
  });
});

describe("section states: complete, incomplete, not applicable", () => {
  it("needs a phone for the owner and a way to reach the employer", () => {
    const base = emptyPlan();
    const nameOnly: Plan = { ...base, owner: { ...base.owner, name: "أحمد" } };
    expect(sectionDone(nameOnly).owner).toBe(false);
    expect(missingWhy(nameOnly, "owner")).toContain("موبايلك");
    expect(sectionDone({ ...nameOnly, owner: { ...nameOnly.owner, phone: "0100" } }).owner).toBe(
      true,
    );

    const employerOnly: Plan = { ...base, work: { ...base.work, employer: "شركة" } };
    expect(sectionDone(employerOnly).work).toBe(false);
    expect(missingWhy(employerOnly, "work")).toContain("الموارد البشرية");
    for (const extra of [{ employerPhone: "011" }, { hrContact: "أستاذ سامي" }])
      expect(sectionDone({ ...employerOnly, work: { ...employerOnly.work, ...extra } }).work).toBe(
        true,
      );
    // an empty section has no "why": it is just empty
    expect(missingWhy(base, "owner")).toBeNull();
    expect(missingWhy(base, "work")).toBeNull();
  });

  it("an empty debt row does not count as filled in", () => {
    const p: Plan = {
      ...emptyPlan(),
      owedToMe: [{ who: "", amount: "", currency: "", proof: "" }],
    };
    expect(sectionDone(p).owedToMe).toBe(false);
    expect(sectionDone({ ...p, owedToMe: [{ ...p.owedToMe[0]!, who: "أحمد" }] }).owedToMe).toBe(
      true,
    );
  });

  it("marks a section not applicable, and content always wins over the mark", () => {
    const p: Plan = { ...emptyPlan(), na: ["iOwe", "banks"] };
    expect(sectionStates(p).iOwe).toBe("na");
    expect(sectionStates(p).insurance).toBe("incomplete");
    const withBank: Plan = { ...p, banks: [{ name: "بنك", country: "", type: "", note: "" }] };
    expect(sectionStates(withBank).banks).toBe("complete");
    // the owner, first steps and contacts can never be marked not applicable
    const sneaky = normalizePlan({
      ...emptyPlan(),
      na: ["owner", "contacts", "firstSteps", "iOwe"],
    });
    expect(sneaky.na).toEqual(["iOwe"]);
    expect(sectionStates({ ...emptyPlan(), na: ["owner"] } as Plan).owner).toBe("incomplete");
  });

  it("settles readiness and the next step, and stays out of the family copy", () => {
    const base: Plan = {
      ...filled(),
      work: { ...emptyPlan().work, employer: "شركة", hrContact: "س" },
    };
    expect(readiness(base)).toMatchObject({ essentialDone: 4, ready: false });
    const noBank: Plan = { ...base, na: ["banks"] };
    expect(readiness(noBank)).toMatchObject({ essentialDone: 5, ready: true, pct: 100 });
    expect(nextStep(noBank)).toBe("insurance"); // not "banks"
    expect(nextStep({ ...noBank, na: ["banks", "insurance", "owedToMe"] })).toBe("iOwe");
    expect("na" in familyCopy(noBank)).toBe(false);
  });

  it("keeps working for older files that have no marks at all", () => {
    const old = { ...emptyPlan() } as Record<string, unknown>;
    delete old["na"];
    expect(normalizePlan(old).na).toEqual([]);
    expect(sectionStates(normalizePlan(old)).banks).toBe("incomplete");
    expect(normalizePlan({ ...old, na: "banks" }).na).toEqual([]);
    expect(normalizePlan({ ...old, na: ["banks", "banks", 5, "<x>"] }).na).toEqual(["banks"]);
  });
});
