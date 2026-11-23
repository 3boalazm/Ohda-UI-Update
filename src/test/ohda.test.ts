import { describe, expect, it } from "vitest";
import {
  makeCodeWrap,
  makePassWrap,
  newDataKey,
  sealContent,
  unlockWithCodes,
  unlockWithPassphrase,
} from "@/lib/ohdaCrypto";
import { DIGITS_WARNING, SECRET_WARNING, sensitiveWarnings } from "@/lib/plan";

describe("ohda rules", () => {
  it("warns on 10+ digit runs", () => {
    expect(sensitiveWarnings("حساب 1234567890")).toContain(DIGITS_WARNING);
    expect(sensitiveWarnings("بنك الراجحي 123")).toEqual([]);
  });
  it("warns on password/OTP words", () => {
    expect(sensitiveWarnings("الباسورد هو")).toContain(SECRET_WARNING);
    expect(sensitiveWarnings("OTP")).toContain(SECRET_WARNING);
  });
  it("split family file needs both codes", async () => {
    const dk = newDataKey();
    const { wrap, codes } = await makeCodeWrap(dk, true);
    const env = await sealContent(dk, { a: 1 }, "family", [wrap]);
    expect(await unlockWithCodes(env, codes)).toEqual({ a: 1 });
    await expect(unlockWithCodes(env, [codes[0] ?? "", ""])).rejects.toThrow();
  });
  it("owner unlock rejects wrong passphrase", async () => {
    const dk = newDataKey();
    const env = await sealContent(dk, { x: 2 }, "owner", [
      await makePassWrap(dk, "correct horse battery", 100_000),
    ]);
    expect((await unlockWithPassphrase(env, "correct horse battery")).content).toEqual({ x: 2 });
    await expect(unlockWithPassphrase(env, "wrong passphrase!!")).rejects.toThrow("كلمة السر غلط");
  });
});
