/**
 * Family cards and family files.
 * Each issue of cards creates a new random family key; family files are sealed with it.
 * The owner's data key is never wrapped by a card code.
 */
import {
  fromB64,
  makeCodeWrap,
  newDataKey,
  sealContent,
  toB64,
  type OhdaEnvelope,
} from "@/lib/ohdaCrypto";
import { familyCopy, type Handover, type Plan } from "@/lib/plan";

export async function issueFamilyCards(
  holders: string[],
  split: boolean,
): Promise<{ handover: Handover; codes: string[] }> {
  const fk = newDataKey();
  try {
    const { wrap, codes } = await makeCodeWrap(fk, split);
    return { handover: { holders, familyKey: toB64(fk), codeWrap: wrap }, codes };
  } finally {
    fk.fill(0);
  }
}

export async function sealFamilyFile(plan: Plan): Promise<OhdaEnvelope> {
  const h = plan.handover;
  if (!h?.codeWrap || !h.familyKey) throw new Error("no family cards issued");
  const fk = fromB64(h.familyKey);
  try {
    return await sealContent(fk, familyCopy(plan), "family", [h.codeWrap]);
  } finally {
    fk.fill(0);
  }
}
