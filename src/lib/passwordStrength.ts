import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as en from "@zxcvbn-ts/language-en";

let factory: ZxcvbnFactory | null = null;
function engine(): ZxcvbnFactory {
  factory ??= new ZxcvbnFactory({
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...en.dictionary },
  });
  return factory;
}

/** Words that people commonly use for this product's context; penalised by zxcvbn. */
const CONTEXT_WORDS = [
  "ohda",
  "عهدة",
  "عُهدة",
  "codeandcanvas",
  "family",
  "password",
  "egypt",
  "saudi",
  "masr",
  "ksa",
];

export type Strength = { score: 0 | 1 | 2 | 3 | 4; ok: boolean; message: string };

/** Minimum: 12 characters and zxcvbn score >= 3 ("safely unguessable" against offline slow-hash attacks). */
export function assessPassphrase(p: string, userInputs: string[] = []): Strength {
  if (p.length < 12)
    return {
      score: 0,
      ok: false,
      message: "كلمة السر لازم تكون 12 حرف على الأقل. جرّب جملة قصيرة تفتكرها.",
    };
  if (p.length > 256) return { score: 0, ok: false, message: "كلمة السر طويلة جدًا." };
  const r = engine().check(p, [...CONTEXT_WORDS, ...userInputs.filter(Boolean)]);
  const score = r.score as Strength["score"];
  if (score < 3) {
    return {
      score,
      ok: false,
      message: "كلمة السر دي سهل تتخمّن. زوّد كلمات مش مرتبطة ببعض، أو اخلط عربي وأرقام.",
    };
  }
  return { score, ok: true, message: score === 4 ? "كلمة سر قوية جدًا ✓" : "كلمة سر قوية ✓" };
}
