import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signEntitlement, verifyEntitlement, b64url } from "@/lib/entitlement";
import { hmacMessage, verifyPaymobHmac, isPaidFor } from "@/lib/paymob";
import { assessPassphrase } from "@/lib/passwordStrength";

describe("entitlement", () => {
  it("signs and verifies; rejects tampering and wrong key", async () => {
    const k = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const k2 = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const p = {
      v: 1 as const,
      kid: "kt1",
      plan: "single" as const,
      ref: "0123456789abcdef",
      iat: 1_800_000_000,
    };
    const t = await signEntitlement(p, k.privateKey);
    expect(await verifyEntitlement(t, k.publicKey)).toEqual(p);
    expect(await verifyEntitlement(t, k2.publicKey)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ ...p, plan: "family" })));
    expect(await verifyEntitlement(`${forged}.${sig}`, k.publicKey)).toBeNull();
    expect(await verifyEntitlement(`${body}.${sig}x`, k.publicKey)).toBeNull();
    expect(await verifyEntitlement("garbage", k.publicKey)).toBeNull();
    expect(await verifyEntitlement("a".repeat(600), k.publicKey)).toBeNull();
    await expect(signEntitlement({ ...p, ref: "XYZ" } as never, k.privateKey)).rejects.toThrow();
  });

  it("verifies by key id against a registry (rotation-safe)", async () => {
    const gen = async () => {
      const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const raw = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
      return { kp, raw };
    };
    const a = await gen();
    const b = await gen();
    const reg = { "k-old": a.raw, "k-new": b.raw };
    const base = {
      v: 1 as const,
      plan: "family" as const,
      ref: "0123456789abcdef",
      iat: 1_800_000_000,
    };
    const tOld = await signEntitlement({ ...base, kid: "k-old" }, a.kp.privateKey);
    const tNew = await signEntitlement({ ...base, kid: "k-new" }, b.kp.privateKey);
    expect(await verifyEntitlement(tOld, reg)).toMatchObject({ kid: "k-old" });
    expect(await verifyEntitlement(tNew, reg)).toMatchObject({ kid: "k-new" });
    // a token claiming the other key id fails; unknown ids fail; prototype keys are not ids
    const lie = await signEntitlement({ ...base, kid: "k-new" }, a.kp.privateKey);
    expect(await verifyEntitlement(lie, reg)).toBeNull();
    expect(await verifyEntitlement(tOld, { "k-new": b.raw })).toBeNull();
    const proto = await signEntitlement({ ...base, kid: "constructor" }, a.kp.privateKey);
    expect(await verifyEntitlement(proto, reg)).toBeNull();
  });
});

describe("paymob hmac", () => {
  const tx = {
    amount_cents: 9900,
    created_at: "2026-10-28T10:00:00.000000",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    id: 123456,
    integration_id: 4567,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 987 },
    owner: 111,
    pending: false,
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
    success: true,
  };
  it("builds the message in Paymob's field order", () => {
    expect(hmacMessage(tx)).toBe(
      "99002026-10-28T10:00:00.000000EGPfalsefalse1234564567truefalsefalsefalsetruefalse987111false2346MasterCardcardtrue",
    );
  });
  it("accepts a correct HMAC, rejects wrong/tampered/malformed", async () => {
    const secret = "S3CRET";
    const good = createHmac("sha512", secret).update(hmacMessage(tx)).digest("hex");
    expect(await verifyPaymobHmac(tx, good, secret)).toBe(true);
    expect(await verifyPaymobHmac(tx, good.toUpperCase(), secret)).toBe(true);
    expect(await verifyPaymobHmac({ ...tx, amount_cents: 1 }, good, secret)).toBe(false);
    expect(await verifyPaymobHmac(tx, good, "other")).toBe(false);
    expect(await verifyPaymobHmac(tx, "abc", secret)).toBe(false);
    expect(await verifyPaymobHmac(tx, good, "")).toBe(false);
  });
  it("only counts a final successful capture of the exact amount", () => {
    expect(isPaidFor(tx, 9900, "egp")).toBe(true);
    expect(isPaidFor({ ...tx, pending: true }, 9900, "EGP")).toBe(false);
    expect(isPaidFor({ ...tx, success: false }, 9900, "EGP")).toBe(false);
    expect(isPaidFor({ ...tx, is_refunded: true }, 9900, "EGP")).toBe(false);
    expect(isPaidFor(tx, 19900, "EGP")).toBe(false);
    expect(isPaidFor(tx, 9900, "SAR")).toBe(false);
  });
});

describe("passphrase strength", () => {
  it("rejects weak, accepts strong", () => {
    for (const w of [
      "short",
      "123456789012",
      "password1234",
      "qwertyuiop12",
      "ohdaohdaohda",
      "aaaaaaaaaaaaaaaa",
    ]) {
      expect(assessPassphrase(w).ok, w).toBe(false);
    }
    for (const s of [
      "بيت جدي في طنطا كان أخضر 1998",
      "violet-tram-sunset-42-kitchen",
      "Nile river camel 77 orange lamp",
    ]) {
      expect(assessPassphrase(s).ok, s).toBe(true);
    }
  });
});
