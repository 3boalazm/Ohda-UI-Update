/**
 * Runs right after the owner unlocks a file (local or imported backup) with the passphrase.
 *
 * 1. Legacy files (before 2026-10) stored a card-code wrap of the OWNER data key inside the owner
 *    envelope, so anyone holding an old card plus an old family file could decrypt every later
 *    family file and every owner backup. Such files get a brand-new data key, lose the code wrap,
 *    and are flagged so the owner re-issues cards (new family key).
 * 2. Passphrase wraps below the current PBKDF2 work factor (e.g. a crafted backup) are re-wrapped.
 */
import {
  PBKDF2_ITERATIONS,
  makePassWrap,
  newDataKey,
  sealContent,
  type Bytes,
  type OhdaEnvelope,
} from "@/lib/ohdaCrypto";
import { exceedsLimits, normalizePlan, type Plan } from "@/lib/plan";

export interface Unlocked {
  env: OhdaEnvelope;
  dk: Bytes;
  plan: Plan;
  /** true when env was re-sealed and must be saved */
  changed: boolean;
}

export async function upgradeOnUnlock(
  env: OhdaEnvelope,
  dk: Bytes,
  content: unknown,
  passphrase: string,
): Promise<Unlocked> {
  if (exceedsLimits(content))
    throw new Error(
      "الملف فيه بيانات أكبر من الحدود الجديدة. ما عدّلناش حاجة. كلّمنا قبل ما تكمل عشان ما يضيعش منه حاجة.",
    );
  let plan = normalizePlan(content);
  const legacyCodeWrap = env.wraps.some((w) => w.type === "code");
  const weakPass = env.wraps.some((w) => w.type === "pass" && w.iter < PBKDF2_ITERATIONS);
  if (!legacyCodeWrap && !weakPass) return { env, dk, plan, changed: false };

  // The caller retires the old key only after the upgraded envelope is saved.
  let key = dk;
  if (legacyCodeWrap) {
    key = newDataKey();
    plan = {
      ...plan,
      handover: { holders: plan.handover?.holders ?? ["", ""], reissueNeeded: true },
    };
  }
  try {
    const wraps = [await makePassWrap(key, passphrase)];
    const next = await sealContent(key, plan, "owner", wraps);
    return { env: next, dk: key, plan, changed: true };
  } catch (e) {
    if (key !== dk) key.fill(0);
    throw e;
  }
}
