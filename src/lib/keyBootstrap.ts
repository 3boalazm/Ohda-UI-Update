/**
 * Entitlement signing keys are generated inside the server on first need, so no person, chat,
 * repository or tool ever handles a private key. Only the public half leaves the server.
 */
import { b64url } from "@/lib/entitlement";

export async function generateSigningKey(now = new Date()): Promise<{
  kid: string;
  pkcs8: string;
  pub: string;
}> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pkcs8 = b64url(new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)));
  const pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { kid: `k${now.toISOString().slice(0, 7)}-${rnd}`, pkcs8, pub };
}
