/**
 * Format v1 compatibility: files produced by the original published module
 * (github.com/ahmedbdeer/ohda-crypto) must keep opening with the current module, forever.
 */
import { describe, expect, it } from "vitest";
import {
  formatCode,
  makeCodeWrap,
  newDataKey,
  normalizeCode,
  parseCode,
  randomBytes,
  sealContent,
  toB64,
  unlockWithCodes,
  unlockWithPassphrase,
  validateEnvelope,
} from "@/lib/ohdaCrypto";
import vectors from "./vectors.v1.json";

describe("ohda format v1 — frozen vectors", () => {
  it("opens the owner vector with the passphrase", async () => {
    const r = await unlockWithPassphrase(validateEnvelope(vectors.owner), vectors.passphrase);
    expect(r.content).toEqual(vectors.content);
  });

  it("rejects a wrong passphrase", async () => {
    await expect(
      unlockWithPassphrase(validateEnvelope(vectors.owner), "wrong-passphrase-123"),
    ).rejects.toThrow();
  });

  it("opens the split family vector only with both codes", async () => {
    const env = validateEnvelope(vectors.family);
    expect(await unlockWithCodes(env, vectors.codes)).toEqual(vectors.content);
    await expect(unlockWithCodes(env, [vectors.codes[0]!])).rejects.toThrow();
    await expect(unlockWithCodes(env, [vectors.codes[1]!, vectors.codes[1]!])).rejects.toThrow();
  });

  it("accepts codes typed loosely (lowercase, spaces, O/I/L/U look-alikes)", async () => {
    const env = validateEnvelope(vectors.family);
    const loose = vectors.codes.map((c) => c.toLowerCase().replace(/-/g, " "));
    expect(await unlockWithCodes(env, loose)).toEqual(vectors.content);
    expect(normalizeCode("o-i-l-u")).toBe("011V");
    // Arabic-Indic / Persian / full-width digits typed on Arabic keyboards
    expect(normalizeCode("٠١٢٣-۴۵۶۷-８９")).toBe("0123456789");
    const arabic = vectors.codes.map((c) =>
      c.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d))),
    );
    expect(await unlockWithCodes(env, arabic)).toEqual(vectors.content);
  });

  it("detects tampering with the ciphertext", async () => {
    const env = structuredClone(vectors.family);
    env.ct = (env.ct[0] === "A" ? "B" : "A") + env.ct.slice(1);
    await expect(unlockWithCodes(validateEnvelope(env), vectors.codes)).rejects.toThrow();
  });
});

describe("ohda codes", () => {
  it("round-trips 2000 random secrets through the printed code", () => {
    for (let i = 0; i < 2000; i++) {
      const b = randomBytes(16);
      expect(toB64(parseCode(formatCode(b)))).toBe(toB64(b));
    }
  });

  it("new files made now still open (round trip)", async () => {
    const dk = newDataKey();
    const { wrap, codes } = await makeCodeWrap(dk, false);
    const env = await sealContent(dk, { a: 1 }, "family", [wrap]);
    expect(await unlockWithCodes(env, codes)).toEqual({ a: 1 });
  });
});
