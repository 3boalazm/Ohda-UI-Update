<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Project rules

- File format v1 is frozen: `src/test/vectors.v1.json` (made by the original module) must always open. `src/lib/ohdaCrypto.ts` may be refactored only if `crypto-compat.test.ts` stays green; never change algorithms, parameters, AAD or code format. `public/family-template.html` stays verbatim. Why: files already given to families must open forever.
- User file content stays in the browser: owner envelope in IndexedDB (`ohda`/`vault`/`main`, revision in `meta`, restore point in `previous`). The data key lives only in a ref inside `src/lib/vault.tsx` and is lent via `withKey`; never put it in React state or props. Why: privacy promise — no server ever sees plaintext.
- Every IndexedDB write goes through `saveVault(env, expectedRev)` while holding ownership (`src/lib/ownership.ts`, Web Locks). Never add an unfenced write path. Why: two tabs must never overwrite each other.
- Family files are sealed with the family key (`src/lib/family.ts`); a card never wraps the owner's data key. `public/family-template.html` is pinned by hash (`src/lib/familyTemplateHash.ts`); any change must update the hash and pass `family-template.test.ts`.
- Deploys, migrations and anything touching the server or database are done only by the release owner (Claude) after review. Lovable/Arena write code only; never run migrations or publish from Lovable.
- Only server data: hashed activation codes, random refs, audit log, rate-limit buckets (hashed IP, daily salt) and orders without personal data. Redeem happens only in the server function `redeemActivation` (service role → `redeem_activation_v2`), which returns an Ed25519-signed entitlement. Admin actions need an MFA (aal2) session. The private signing key lives only in `private.signing_keys`; never commit it. Why: no user accounts, minimal data.
- Security headers are set per request in `src/lib/securityHeaders.ts` (nonce CSP). Do not add inline scripts without the nonce or a meta CSP.
- Every change: `tsc`, `lint`, `vitest`, `db/test/run.sh` and build must pass (CI enforces).
- Reusable UI classes are Tailwind `@utility` blocks in `src/styles.css` (v4 can't @apply component-layer classes).
