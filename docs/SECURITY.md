# Ohda security model

Ohda is sold by Code & Canvas, a company registered in Egypt. The product is local-first:
the content of a person's file never leaves their browser.

## What the server holds

| Data                                                                | Where                     | Why                               |
| ------------------------------------------------------------------- | ------------------------- | --------------------------------- |
| SHA-256 of activation codes, plan, use count, random 16-hex `ref`   | `public.activation_codes` | Redeem codes                      |
| Redemption records (hash of request id, code hash, plan, ref)       | `private.redemptions`     | Idempotent retries                |
| Rate-limit buckets: `HMAC(secret, ip \| day)`, deleted after 2 days | `public.rate_limits`      | Abuse control without storing IPs |
| Admin action log (append-only, no customer data)                    | `public.audit_log`        | Accountability                    |
| Ed25519 signing keys (private)                                      | `private.signing_keys`    | Sign entitlements                 |
| Orders (plan, amount, currency, provider ids; no personal data)     | `public.orders`           | Online payments (not live yet)    |

Admin access needs a confirmed account plus a TOTP second factor (`aal2`). It is enforced by
RLS and by every admin function. The first admin is bootstrapped exactly once, through a
permanent marker. All other roles are granted by user id in SQL by the database owner.

## Cryptography (file format v1, frozen)

- Content: AES-256-GCM with a random 96-bit IV and AAD `ohda:v1`, under a random 256-bit data key.
- Owner: the data key is wrapped with PBKDF2-SHA256 (600k iterations). Weaker wraps are re-wrapped on unlock.
- Family: each card issue creates a new random **family key**. Family files are sealed with that key.
  - The family key is wrapped with HKDF-SHA256 from a 128-bit card secret.
  - In two-person mode the card secret is an XOR 2-of-2 split.
  - The owner's data key is never wrapped by a card.
- Card codes: Crockford Base32, canonical only, with a 10-bit checksum.
  - The checksum is for catching typos; it is not a security control.
  - Look-alike letters are mapped (O→0, I/L→1, U→V; the U→V mapping is Ohda-specific), and Arabic-Indic, Persian and full-width digits are accepted.
- Known v1 limitation: the envelope header (`kind`, `created`, wraps) is not covered by the AAD. Tampering with it cannot change or reveal the content. Fix planned for format v2 (header in AAD).

## Revocation: four different things

1. **New family cards.** Old cards can no longer open any _new_ family file, and no card can ever open the owner's file.
   - Family files already handed out keep opening with their old cards. They are copies. Ask the family to delete them.
   - New cards become active only after the owner confirms they were printed and re-types the last 4 characters of each card.
2. **Cancelling an activation code** (`admin_revoke_code`) stops further redemptions of that code.
3. **Entitlements already issued** are offline signed tokens. They cannot be revoked remotely, and they can be copied between browsers by their owner.
   - Accepted: a local-first app can always be patched by its own user.
   - The signature stops casual tampering; it is not DRM.
4. **Refunds** are handled per order. The entitlement is not remotely withdrawn (see 3).

Plans differ only in **how many activation codes** are issued: single = 1, family = 3, for different people. Features are the same.

## Entitlement signing keys: rotation runbook

1. Generate a new Ed25519 key and choose an id (e.g. `k2027-04`).
2. Add the public key to `src/lib/entitlementKey.ts`. Merge, then deploy. Clients now trust both ids.
3. Insert the private key into `private.signing_keys` with `active = false`.
4. In one transaction, deactivate the old key and activate the new one. The server refuses to redeem with a key whose id the clients don't know.
5. Keep the old public key in the registry for as long as tokens signed with it should stay valid.

## Browser

- **CSP:** the nonce comes from the router (`ssr.nonce`) and the HTML is never rewritten. `strict-dynamic`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and `connect-src` set to the exact backend origin.
  - `style-src 'unsafe-inline'` is kept for the UI library. This is an accepted risk.
- **Family file:** meta CSP with only the hash of its one script, no network (`default-src 'none'`), and no inline handlers.
  - The exporter refuses any template whose script hash is not the pinned one.
- **Vault:**
  - The data key is kept out of React state and lent out through `withKey`.
  - Saves are serialised.
  - IndexedDB writes are fenced by revision.
  - One owner tab at a time, using Web Locks, with a BroadcastChannel hand-over.
  - Lock never discards unsaved edits. If saving fails the file stays open and shows an error, and the owner can download an encrypted backup.
  - Auto-lock after 5 minutes idle.
- Zeroing of key and plaintext buffers is best-effort memory hygiene. JavaScript cannot guarantee erasure.

## Activation codes

Admin-generated activation codes carry 80 random bits (16 Base32 characters). With per-IP rate limiting (10 per hour) online guessing is infeasible. They are not 128-bit secrets and are not described as such.

## Process

- Code is written by Lovable or Arena, or here, and reviewed by Claude and ChatGPT.
- Claude runs the final tests. Only Claude deploys or touches the server or database.
- Gates: typecheck, lint, unit tests, DB permission tests (negative tests fail if the action succeeds), build, client-bundle secret scan, browser CSP smoke test, dependency audit, gitleaks, CodeQL.
