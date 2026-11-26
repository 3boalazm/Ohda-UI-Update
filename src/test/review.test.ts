import { describe, expect, it } from "vitest";

import { DIGITS_WARNING, SECRET_WARNING, emptyPlan } from "@/lib/plan";
import { findingPlaces, missingKeySections, sectionDone, sensitiveFindings } from "@/lib/review";

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
      { section: "insurance", label: "التأمين", warnings: [SECRET_WARNING], rows: [1] },
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

describe("sensitiveFindings covers the whole family file", () => {
  it("flags a password written in the letter, the first steps, the wishes or any notes", () => {
    const p = {
      ...emptyPlan(),
      letter: "كلمة السر بتاعة الجهاز هي ...",
      firstSteps: "ادخلوا بالباسورد اللي في الورقة",
      wishes: "OTP",
      owner: { ...emptyPlan().owner, notes: "الرقم السري للدولاب" },
      work: { ...emptyPlan().work, notes: "رمز التحقق بتاع الشركة" },
    };
    const f = sensitiveFindings(p);
    expect(f.map((x) => x.section)).toEqual(["owner", "firstSteps", "work", "wishes", "letter"]);
    for (const x of f) expect(x.warnings).toEqual([SECRET_WARNING]);
  });

  it("names the rows that caused it in list sections", () => {
    const p = {
      ...emptyPlan(),
      banks: [
        { name: "بنك أ", country: "", type: "", note: "" },
        { name: "بنك ب", country: "", type: "", note: "الباسورد 1" },
        { name: "بنك ج", country: "", type: "", note: "رمز التحقق" },
      ],
      contacts: [{ ...contact, note: "عنده الباسورد" }],
    };
    const f = sensitiveFindings(p);
    expect(f.find((x) => x.section === "banks")?.rows).toEqual([2, 3]);
    expect(f.find((x) => x.section === "contacts")?.rows).toEqual([1]);
    expect(findingPlaces(f.find((x) => x.section === "banks")!)).toBe("(بنك 2، بنك 3)");
    expect(findingPlaces({ section: "letter", label: "رسالة", warnings: [] })).toBe("");
  });

  it("long numbers only matter in the financial sections", () => {
    const num = "1234567890123456";
    const quiet = {
      ...emptyPlan(),
      letter: `اتصلوا بيا على ${num}`,
      firstSteps: `كلموا ${num} الأول`,
      contacts: [{ ...contact, phone: num, note: num }],
      owedToMe: [{ who: "x", amount: num, currency: "", proof: num }],
      assets: [{ item: num, location: num, holder: num }],
    };
    expect(sensitiveFindings(quiet)).toEqual([]);
    const loud = {
      ...emptyPlan(),
      insurance: [{ company: num, type: "", policyRef: "", note: "" }],
    };
    expect(sensitiveFindings(loud).map((x) => x.section)).toEqual(["insurance"]);
  });
});
