import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Page, meta } from "@/components/Brand";
import { Art } from "@/components/Art";
import { FilePicker } from "@/components/Kit";
import { PlanView } from "@/components/PlanView";
import { unlockWithCodes, validateEnvelope, type OhdaEnvelope } from "@/lib/ohdaCrypto";
import {
  extractEnvelopeJson,
  getCodeWrap,
  normalizePlan,
  readLimited,
  type Plan,
} from "@/lib/plan";

export const Route = createFileRoute("/open")({
  head: () =>
    meta(
      "افتح ملف أهلك | عُهدة",
      "افتح ملف عُهدة اللي سابهولك حد من أهلك بالكود المطبوع. الفتح بيحصل على جهازك بس.",
      "/open",
    ),
  component: OpenPage,
});

const FAMILY_FILE_NAME = "ملف-عهدة-للأهل.html";
const CODE_PLACEHOLDER = "XXXX-XXXX-XXXX-…";

function OpenPage() {
  const [env, setEnv] = useState<OhdaEnvelope | null>(null);
  const [c1, setC1] = useState("");
  const [c2, setC2] = useState("");
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const split = env ? getCodeWrap(env)?.mode === "split2" : false;

  async function onFile(f: File) {
    setErr("");
    setEnv(null);
    try {
      const e = validateEnvelope(extractEnvelopeJson(await readLimited(f)));
      if (!getCodeWrap(e)) throw new Error("الملف ده مش ملف أهل");
      setEnv(e);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "الملف ده مش ملف عُهدة صالح");
    }
  }

  if (plan)
    return (
      <Page narrow>
        <PlanView plan={plan} />
        <button
          className="btn-ghost noprint mt-4"
          onClick={() => {
            setPlan(null);
            setC1("");
            setC2("");
          }}
        >
          اقفل الملف
        </button>
      </Page>
    );

  const errBox = err ? (
    <p role="alert" className="err-text">
      {err}
    </p>
  ) : null;

  return (
    <Page narrow>
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.75rem] font-bold">افتح ملف أهلك</h1>
          <p className="mt-2 text-muted-foreground">
            الفتح بيحصل على جهازك بس. الملف والكود مش بيتبعتوا لأي مكان، ولا لينا.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            هي خطوتين بس: ترفع الملف، وبعدين تكتب الكود.
          </p>
        </div>
        <Art name="open" eager className="size-24 shrink-0 rounded-[28px] sm:size-44" />
      </div>

      <div className="panel mt-5 space-y-6">
        {/* Step 1: upload */}
        <section aria-labelledby="step-1" className="space-y-3">
          <h2 id="step-1" className="text-lg font-bold">
            ١) ارفع ملف العيلة
          </h2>
          <p className="text-sm text-muted-foreground">
            اسمه غالبًا «<bdi dir="ltr">{FAMILY_FILE_NAME}</bdi>».
          </p>
          <FilePicker
            label="اختار ملف العيلة"
            accept=".html,.htm,.ohda,application/json,text/html"
            onFile={(f) => void onFile(f)}
          />
          {env && <p className="chip-done">✓ الملف تمام. كمّل للخطوة التانية تحت.</p>}
          {!env && errBox}
        </section>

        {/* Step 2: code (greyed out until a valid file is loaded) */}
        <section
          aria-labelledby="step-2"
          aria-disabled={!env}
          className={`space-y-3 border-t border-border pt-5 transition-opacity ${env ? "" : "opacity-50"}`}
        >
          <h2 id="step-2" className="text-lg font-bold">
            ٢) اكتب الكود اللي على الكارت
          </h2>
          {env ? (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr("");
                setBusy(true);
                try {
                  setPlan(normalizePlan(await unlockWithCodes(env, split ? [c1, c2] : [c1])));
                } catch (x) {
                  setErr(x instanceof Error ? x.message : "الكود مش مطابق للملف ده");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="block">
                <span className="field-label">{split ? "الكود الأول" : "الكود"}</span>
                <input
                  className="code-input"
                  value={c1}
                  onChange={(e) => setC1(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={CODE_PLACEHOLDER}
                />
              </label>
              {split && (
                <label className="block">
                  <span className="field-label">الكود التاني (مع الشخص التاني)</span>
                  <input
                    className="code-input"
                    value={c2}
                    onChange={(e) => setC2(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={CODE_PLACEHOLDER}
                  />
                </label>
              )}
              <p className="text-xs text-muted-foreground">
                مش مهم الشرطات أو الحروف الكبيرة والصغيرة.
              </p>
              <button className="btn-primary w-full" disabled={busy || !c1}>
                {busy ? "بيفتح…" : "افتح الملف"}
              </button>
              {errBox}
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                ارفع الملف الأول، وبعدها هتقدر تكتب الكود.
              </p>
              <input
                className="code-input cursor-not-allowed"
                disabled
                aria-label="الكود"
                placeholder={CODE_PLACEHOLDER}
              />
              <button type="button" className="btn-primary w-full" disabled>
                افتح الملف
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Help */}
      <aside className="notice mt-5 space-y-2" aria-labelledby="help-title">
        <h2 id="help-title" className="font-bold">
          مش لاقيين الملف؟
        </h2>
        <ul className="list-disc space-y-1 ps-5">
          <li>
            غالبًا اسمه «<bdi dir="ltr">{FAMILY_FILE_NAME}</bdi>»، واتبعتلكم على واتساب أو اتحفظ على
            Drive.
          </li>
          <li>اسألوا اللي جهّزه، أو اللي محتفظ بالكارت المطبوع.</li>
          <li>الملف لوحده مش بيتفتح من غير الكود اللي على الكارت.</li>
        </ul>
      </aside>
    </Page>
  );
}
