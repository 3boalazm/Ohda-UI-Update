/**
 * Regression tests for the 2026-10 review findings (Claude subagent, Gemini, ChatGPT).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PBKDF2_ITERATIONS,
  makeCodeWrap,
  formatCode,
  makePassWrap,
  newDataKey,
  parseCode,
  randomBytes,
  validateEnvelope,
  sealContent,
  unlockWithCodes,
  unlockWithPassphrase,
  type CodeWrap,
  type OhdaEnvelope,
} from "@/lib/ohdaCrypto";
import { issueFamilyCards, sealFamilyFile } from "@/lib/family";
import {
  buildFamilyHtml,
  emptyPlan,
  exceedsLimits,
  familyCopy,
  normalizePlan,
  sensitiveWarnings,
  today,
  type Plan,
} from "@/lib/plan";
import { upgradeOnUnlock } from "@/lib/upgrade";

const PASS = "a long family passphrase 2026";
const planWith = (name: string): Plan => ({
  ...emptyPlan(),
  owner: { ...emptyPlan().owner, name },
});

describe("H1: family cards are isolated from the owner key and rotate", () => {
  it("cards open only their own family file; new cards cut off old ones; owner file has no code wrap", async () => {
    const holders = ["A", ""];
    const first = await issueFamilyCards(holders, false);
    const p1 = { ...planWith("v1"), handover: first.handover };
    const file1 = await sealFamilyFile(p1);
    expect(await unlockWithCodes(file1, first.codes)).toMatchObject({ owner: { name: "v1" } });

    const second = await issueFamilyCards(holders, true);
    const p2 = { ...planWith("v2"), handover: second.handover };
    const file2 = await sealFamilyFile(p2);
    expect(await unlockWithCodes(file2, second.codes)).toMatchObject({ owner: { name: "v2" } });

    // old cards cannot open the new family file — not even by swapping in the old wrap,
    // because the content key itself changed
    await expect(unlockWithCodes(file2, first.codes)).rejects.toThrow();
    const forged: OhdaEnvelope = { ...file2, wraps: [first.handover.codeWrap as CodeWrap] };
    await expect(unlockWithCodes(forged, first.codes)).rejects.toThrow();

    // family content never contains the family key or the wrap
    const fam = (await unlockWithCodes(file2, second.codes)) as Record<string, unknown>;
    expect(fam["handover"]).toBeUndefined();
    expect(JSON.stringify(fam)).not.toContain(second.handover.familyKey!);

    // the owner envelope is sealed with a different key: cards cannot open it
    const dk = newDataKey();
    const owner = await sealContent(dk, p2, "owner", [await makePassWrap(dk, PASS)]);
    const forgedOwner: OhdaEnvelope = { ...owner, wraps: [second.handover.codeWrap!] };
    await expect(unlockWithCodes(forgedOwner, second.codes)).rejects.toThrow();
  });
});

describe("upgradeOnUnlock", () => {
  it("rotates the data key of legacy files that wrapped it with a card code", async () => {
    const dk = newDataKey();
    const { wrap, codes } = await makeCodeWrap(dk, false);
    const legacy = await sealContent(dk, planWith("old"), "owner", [
      await makePassWrap(dk, PASS),
      wrap,
    ]);
    const r = await unlockWithPassphrase(legacy, PASS);
    const u = await upgradeOnUnlock(legacy, r.dk, r.content, PASS);
    expect(u.changed).toBe(true);
    expect(u.env.wraps.map((w) => w.type)).toEqual(["pass"]);
    expect(u.plan.handover?.reissueNeeded).toBe(true);
    // old card cannot open the upgraded file even with the old wrap re-attached
    await expect(unlockWithCodes({ ...u.env, wraps: [wrap] }, codes)).rejects.toThrow();
    // passphrase still opens it
    const again = await unlockWithPassphrase(u.env, PASS);
    expect(again.content).toMatchObject({ owner: { name: "old" } });
  });

  it("re-wraps passphrase wraps below the current work factor", async () => {
    const dk = newDataKey();
    const weak = await sealContent(dk, planWith("w"), "owner", [
      await makePassWrap(dk, PASS, 100_000),
    ]);
    const r = await unlockWithPassphrase(weak, PASS);
    const u = await upgradeOnUnlock(weak, r.dk, r.content, PASS);
    expect(u.changed).toBe(true);
    expect(u.env.wraps[0]).toMatchObject({ type: "pass", iter: PBKDF2_ITERATIONS });
  });

  it("leaves current files untouched", async () => {
    const dk = newDataKey();
    const env = await sealContent(dk, planWith("ok"), "owner", [await makePassWrap(dk, PASS)]);
    const r = await unlockWithPassphrase(env, PASS);
    const u = await upgradeOnUnlock(env, r.dk, r.content, PASS);
    expect(u.changed).toBe(false);
    expect(u.env).toBe(env);
  });
});

describe("normalizePlan on untrusted content", () => {
  it("coerces wrong types instead of crashing the viewer", () => {
    const p = normalizePlan({
      owner: { name: 42, phone: { x: 1 } },
      contacts: "nope",
      banks: [null, 7, { name: "B", country: ["x"] }],
      wishes: ["<img>"],
      handover: { holders: "x", codeWrap: { type: "pass" } },
      evil: "ignored",
    });
    expect(p.owner.name).toBe("");
    expect(p.owner.phone).toBe("");
    expect(p.contacts).toEqual([]);
    expect(p.banks).toHaveLength(3);
    expect(p.banks[2]).toEqual({ name: "B", country: "", type: "", note: "" });
    expect(p.wishes).toBe("");
    expect(p.handover?.codeWrap).toBeUndefined();
    expect((p as unknown as Record<string, unknown>)["evil"]).toBeUndefined();
  });
  it("caps very long text and row counts", () => {
    const p = normalizePlan({ wishes: "x".repeat(30_000), assets: Array(900).fill({}) });
    expect(p.wishes.length).toBe(20_000);
    expect(p.assets.length).toBe(500);
    expect(exceedsLimits({ wishes: "x".repeat(30_000) })).toBe(true);
    expect(exceedsLimits({ contacts: [{ name: "ok" }] })).toBe(false);
  });
});

describe("buildFamilyHtml escaping", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("cannot break out of the JSON script block (real template)", async () => {
    const real = readFileSync("public/family-template.html", "utf8");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => real })),
    );
    const env = { x: "</script><script>alert(1)</script>& \u2028" } as unknown as OhdaEnvelope;
    const html = await buildFamilyHtml(env);
    expect(html.match(/<\/script>/g)).toHaveLength(real.match(/<\/script>/g)!.length);
    expect(html).not.toContain("<script>alert");
    const json = /<script id="ohda-data" type="application\/json">([\s\S]*?)<\/script>/.exec(
      html,
    )![1]!;
    expect(JSON.parse(json)).toEqual(env);
  });
});

describe("buildFamilyHtml fails closed", () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = {} as OhdaEnvelope;
  it("on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, text: async () => "" })),
    );
    await expect(buildFamilyHtml(env)).rejects.toThrow();
  });
  it("on a template without exactly one slot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "<html>login page</html>" })),
    );
    await expect(buildFamilyHtml(env)).rejects.toThrow();
  });
});

describe("familyCopy is an allowlist", () => {
  it("drops handover and any unknown or future owner-only field", () => {
    const p = {
      ...planWith("x"),
      handover: { holders: ["a"], familyKey: "SECRET" },
      ownerOnly: "nope",
    } as unknown as Plan;
    const f = familyCopy(p) as unknown as Record<string, unknown>;
    expect(f["handover"]).toBeUndefined();
    expect(f["ownerOnly"]).toBeUndefined();
    expect(JSON.stringify(f)).not.toContain("SECRET");
    expect(Object.keys(f).sort()).toEqual(
      [
        "assets",
        "banks",
        "contacts",
        "firstSteps",
        "iOwe",
        "insurance",
        "owedToMe",
        "owner",
        "updated",
        "v",
        "wishes",
        "work",
      ].sort(),
    );
  });
});

describe("sensitive-input warnings", () => {
  it("catch long numbers in Arabic-Indic and Persian digits and Arabic secret words", () => {
    expect(sensitiveWarnings("حساب ٠١٢٣٤٥٦٧٨٩١٢")).toHaveLength(1);
    expect(sensitiveWarnings("۰۱۲۳۴۵۶۷۸۹۱۲")).toHaveLength(1);
    expect(sensitiveWarnings("الرقم السري 1234")).toHaveLength(1);
    expect(sensitiveWarnings("shopping list")).toHaveLength(0);
  });
});

describe("codes and envelopes", () => {
  it("rejects non-canonical spellings of a code", () => {
    const zero = new Uint8Array(16);
    const c = formatCode(zero).replace(/-/g, "");
    expect(() => parseCode(c)).not.toThrow();
    const tweaked = c.slice(0, 25) + "1" + c.slice(26); // same bytes, unused low bits set
    expect(() => parseCode(tweaked)).toThrow();
    for (let i = 0; i < 200; i++)
      expect(() => parseCode(formatCode(randomBytes(16)))).not.toThrow();
  });

  it("validates envelopes strictly before any key derivation", async () => {
    const dk = newDataKey();
    const good = await sealContent(dk, { a: 1 }, "owner", [await makePassWrap(dk, PASS)]);
    expect(validateEnvelope(JSON.parse(JSON.stringify(good)))).toBeTruthy();
    const bad = (patch: Record<string, unknown>) => ({ ...good, ...patch });
    for (const x of [
      null,
      bad({ wraps: [null] }),
      bad({ wraps: [] }),
      bad({ kind: "x" }),
      bad({ iv: "AAAA" }),
      bad({ ct: "!!!" }),
      bad({ ct: "A".repeat(4_000_004) }),
      bad({ wraps: [{ ...good.wraps[0], iter: 50_000_000 }] }),
      bad({ wraps: [{ ...good.wraps[0], salt: "AAAA" }] }),
      bad({ kind: "family" }), // family file must have exactly one code wrap
      bad({ wraps: Array(5).fill(good.wraps[0]) }),
    ])
      expect(() => validateEnvelope(x)).toThrow();
  });
});

describe("today()", () => {
  it("uses the local calendar date", () => {
    const d = new Date(2026, 0, 2, 0, 30); // 00:30 local on Jan 2
    expect(today(d)).toBe("2026-01-02");
  });
});

describe("upgradeOnUnlock never truncates silently", () => {
  it("refuses to upgrade a legacy file whose content exceeds the limits", async () => {
    const dk = newDataKey();
    const { wrap } = await makeCodeWrap(dk, false);
    const big = { ...planWith("big"), wishes: "x".repeat(30_000) };
    const legacy = await sealContent(dk, big, "owner", [await makePassWrap(dk, PASS), wrap]);
    const r = await unlockWithPassphrase(legacy, PASS);
    await expect(upgradeOnUnlock(legacy, r.dk, r.content, PASS)).rejects.toThrow();
    expect(r.dk.some((b) => b !== 0)).toBe(true); // old key untouched on failure
  });
});
