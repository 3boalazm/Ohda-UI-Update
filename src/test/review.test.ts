import { describe, expect, it } from "vitest";

import { DIGITS_WARNING, SECRET_WARNING, emptyPlan } from "@/lib/plan";
import { missingKeySections, sectionDone, sensitiveFindings } from "@/lib/review";

const contact = { name: "أحمد", relation: "أخ", phone: "01001234567", note: "" };

describe("key sections", () => {
  it("lists firstSteps and contacts as missing on an empty plan", () => {
    const p = emptyPlan();
    expect(sectionDone(p).firstSteps).toBe(false);
    expect(missingKeySections(p)).toEqual(["firstSteps", "contacts"]);
  });

  it("is empty once both key sections are filled in", () => {
    const p = {
      ...emptyPlan(),
      firstSteps: "كلّموا أحمد الأول وبعدين الكفيل.",
      contacts: [contact],
    };
    expect(sectionDone(p)).toMatchObject({ firstSteps: true, contacts: true });
    expect(missingKeySections(p)).toEqual([]);
  });
});

describe("sensitiveFindings", () => {
  it("returns [] for a clean plan", () => {
    const p = {
      ...emptyPlan(),
      banks: [{ name: "بنك مصر", country: "مصر", type: "توفير", note: "الفرع الرئيسي" }],
    };
    expect(sensitiveFindings(p)).toEqual([]);
  });

  it("flags a bank row once per warning, even when two fields trigger the same one", () => {
    const p = {
      ...emptyPlan(),
      banks: [
        {
          name: "بنك مصر",
          country: "مصر",
          type: "حساب 1234567890",
          note: "رقم الحساب 1234567890123 والباسورد 1234",
        },
      ],
    };
    const findings = sensitiveFindings(p);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ section: "banks", label: "البنوك" });
    expect([...findings[0]!.warnings].sort()).toEqual([DIGITS_WARNING, SECRET_WARNING].sort());
  });

  it("flags an insurance row that mentions OTP", () => {
    const p = {
      ...emptyPlan(),
      insurance: [{ company: "تكافل", type: "صحي", policyRef: "", note: "ما تدّيش الـ OTP لحد" }],
    };
    expect(sensitiveFindings(p)).toEqual([
      { section: "insurance", label: "التأمين", warnings: [SECRET_WARNING] },
    ]);
  });

  it("does not flag phone numbers", () => {
    const p = {
      ...emptyPlan(),
      owner: { ...emptyPlan().owner, phone: "01001234567" },
      contacts: [{ ...contact, phone: "0551234567" }],
    };
    expect(sensitiveFindings(p)).toEqual([]);
  });
});
