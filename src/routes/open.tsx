import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Page, meta } from "@/components/Brand";
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

  return (
    <Page narrow>
      <h1 className="text-2xl font-bold">افتح ملف أهلك</h1>
      <p className="mt-2 text-muted-foreground">
        الفتح بيحصل على جهازك بس. الملف والكود مش بيتبعتوا لأي مكان، ولا لينا.
      </p>
      <div className="panel mt-5 space-y-4">
        <label className="block">
          <span className="field-label">١) ارفع ملف «ملف-عهدة-للأهل.html»</span>
          <input
            type="file"
            accept=".html,.htm,.ohda,application/json,text/html"
            className="block w-full text-sm"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {env && (
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
              <span className="field-label">٢) {split ? "الكود الأول" : "اكتب الكود"}</span>
              <input
                className="code-input"
                value={c1}
                onChange={(e) => setC1(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
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
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                />
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              مش مهم الشرطات أو الحروف الكبيرة والصغيرة.
            </p>
            <button className="btn-primary w-full" disabled={busy || !c1}>
              {busy ? "بيفتح…" : "افتح الملف"}
            </button>
          </form>
        )}
        {err && (
          <p role="alert" className="err-text">
            {err}
          </p>
        )}
      </div>
    </Page>
  );
}
