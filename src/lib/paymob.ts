/**
 * Paymob "transaction processed" callback verification (HMAC-SHA512).
 * The callback is only trusted when its HMAC matches; amounts and order ids are re-checked
 * against our own order record before an entitlement is issued.
 */

export const PAYMOB_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export function hmacMessage(transaction: unknown): string {
  return PAYMOB_HMAC_FIELDS.map((f) => str(pick(transaction, f))).join("");
}

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPaymobHmac(
  transaction: unknown,
  receivedHmac: string,
  secret: string,
): Promise<boolean> {
  if (!secret || typeof receivedHmac !== "string" || !/^[0-9a-fA-F]{128}$/.test(receivedHmac))
    return false;
  const expected = await hmacSha512Hex(secret, hmacMessage(transaction));
  return timingSafeEqualHex(expected, receivedHmac.toLowerCase());
}

/** A successful, final, non-refunded, non-voided capture for exactly the expected amount. */
export function isPaidFor(
  transaction: unknown,
  expectedAmountCents: number,
  expectedCurrency: string,
): boolean {
  return (
    pick(transaction, "success") === true &&
    pick(transaction, "pending") === false &&
    pick(transaction, "is_refunded") === false &&
    pick(transaction, "is_voided") === false &&
    Number(pick(transaction, "amount_cents")) === expectedAmountCents &&
    str(pick(transaction, "currency")).toUpperCase() === expectedCurrency.toUpperCase()
  );
}
