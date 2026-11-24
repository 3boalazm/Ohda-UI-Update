import { PLAN_NAME, priceLabel } from "@/lib/pricing";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Page, meta, LogoMark } from "@/components/Brand";
import { NeedUnlock } from "@/components/Fields";
import { makeCodeWrap, newDataKey, normalizeCode, sealContent } from "@/lib/ohdaCrypto";
import { issueFamilyCards, sealFamilyFile } from "@/lib/family";
import type { Handover as HandoverState } from "@/lib/plan";
import {
  buildFamilyHtml,
  downloadBlob,
  emptyPlan,
  familyCopy,
  getActivation,
  type Activation,
  type Plan,
} from "@/lib/plan";
import { SECTION_LABELS, missingKeySections, sensitiveFindings } from "@/lib/review";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/handover")({
  head: () =>
    meta("سلّم أهلك | عُهدة", "جهّز ملف أهلك المشفّر والكروت المطبوعة بالكود.", "/handover"),
  component: Handover,
});

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn-outline btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? "اتنسخ ✓" : "انسخ"}
    </button>
  );
}

function Handover() {
  const v = useVault();
  const [act, setAct] = useState<Activation | null | undefined>(undefined);
  useEffect(() => {
    void getActivation().then(setAct);
  }, []);
  if (act === undefined) return null;
  if (!act)
    return (
      <Page narrow>
        <NotActivated />
      </Page>
    );
  if (!v.session)
    return (
      <Page narrow>
        <NeedUnlock />
      </Page>
    );
  return <Flow />;
}

function NotActivated() {
  return (
    <div className="panel">
      <h1 className="text-2xl font-bold">سلّم أهلك</h1>
      <p className="mt-2 text-muted-foreground">
        التسليم محتاج تفعيل مرة واحدة. بعده تقدر تعيد تصدير الملف لأهلك في أي وقت بعد أي تعديل.
      </p>
      <ul className="mt-4 list-disc space-y-1 pr-5">
        <li>ملف للأهل مشفّر، بيفتح من غير الموقع</li>
        <li>كروت مطبوعة بالكود</li>
        <li>تقسيم الكود على شخصين</li>
        <li>تجربة الفتح بملف تجريبي</li>
        <li>تحديثات بلا حدود</li>
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["single", "family"] as const).map((plan) => (
          <div
            key={plan}
            className={
              plan === "family"
                ? "rounded-2xl border border-gold bg-card p-4"
                : "rounded-2xl border border-border bg-card p-4"
            }
          >
            <h2 className="font-bold">{PLAN_NAME[plan]}</h2>
            <p className="mt-1 text-xl font-bold text-primary">{priceLabel(plan, "EG")}</p>
            <p className="text-sm font-semibold">{priceLabel(plan, "INTL")} من برّه مصر</p>
            <p className="text-sm text-muted-foreground">
              {plan === "family" ? "3 أكواد — مرة واحدة" : "مرة واحدة"}
            </p>
          </div>
        ))}
      </div>
      <Link to="/activate" className="btn-primary mt-4">
        فعّل دلوقتي
      </Link>
    </div>
  );
}

function Flow() {
  const v = useVault();
  const s = v.session!;
  const existing = s.plan.handover?.codeWrap;
  const [split, setSplit] = useState(existing ? existing.mode === "split2" : false);
  const [err, setErr] = useState("");
  const holders = s.plan.handover?.holders ?? ["", ""];
  const setHolder = (i: number, val: string) =>
    v.update((p) => {
      const h = [...(p.handover?.holders ?? ["", ""])];
      h[i] = val;
      return { ...p, handover: { ...p.handover, holders: h } };
    });
  // Staged issuance: new cards live only in memory until the owner confirms they were printed
  // and checks them; only then is the new family key saved (atomically) and the old one retired.
  const [pending, setPending] = useState<{ handover: HandoverState; codes: string[] } | null>(null);
  const [printed, setPrinted] = useState(false);
  const [checks, setChecks] = useState<string[]>(["", ""]);
  const [activated, setActivated] = useState(false);
  const codes = pending?.codes ?? null;
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printMode, setPrintMode] = useState<"real" | "demo" | null>(null);
  const [demo, setDemo] = useState<{ codes: string[] } | null>(null);
  // Review of sensitive text in the family file (step 3); the download waits for it.
  const [reviewed, setReviewed] = useState(false);
  const findings = sensitiveFindings(s.plan);
  const missing = missingKeySections(s.plan);
  const needsReview = findings.length > 0 && !reviewed;

  async function prepare() {
    setBusy(true);
    setErr("");
    try {
      // fresh family key every time: old cards never open new family files or the owner's file
      const issued = await issueFamilyCards(holders, split);
      setPending(issued);
      setPrinted(false);
      setChecks(["", ""]);
      setActivated(false);
      setConfirmNew(false);
    } catch {
      setErr("حصلت مشكلة في عمل الكود. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  const tail = (c: string) => normalizeCode(c).slice(-4);
  const checksOk =
    !!pending && pending.codes.every((c, i) => normalizeCode(checks[i] ?? "") === tail(c));

  async function activate() {
    if (!pending || !printed || !checksOk) return;
    setBusy(true);
    setErr("");
    try {
      // owner file keeps only the passphrase wrap (also drops legacy code wraps);
      // commitNow saves immediately and rolls back in memory if the save fails
      await v.commitNow((cur) => ({
        wraps: cur.wraps.filter((w) => w.type === "pass"),
        plan: {
          ...cur.plan,
          handover: { ...pending.handover, holders: cur.plan.handover?.holders ?? holders },
        },
      }));
      setActivated(true);
    } catch {
      setErr("ما قدرناش نحفظ الكروت الجديدة على الجهاز. الكروت القديمة لسه هي الشغالة. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  async function exportFamily() {
    const plan = v.session!.plan;
    if (!plan.handover?.codeWrap) return;
    const env = await sealFamilyFile(plan);
    downloadBlob(await buildFamilyHtml(env), "ملف-عهدة-للأهل.html", "text/html");
  }

  async function makeDemo() {
    const dk = newDataKey();
    const { wrap, codes } = await makeCodeWrap(dk, split);
    const p: Plan = {
      ...emptyPlan(),
      owner: {
        name: "أحمد (ملف تجريبي)",
        phone: "+966500000000",
        city: "جدة",
        notes: "ده ملف تجريبي للتمرين بس",
      },
      firstSteps: "١) ده ملف تجريبي.\n٢) لو قدرتوا تفتحوه، يبقى هتعرفوا تفتحوا الملف الحقيقي.",
      contacts: [{ name: "محمد", relation: "أخ", phone: "+201000000000", note: "عارف كل حاجة" }],
      work: { ...emptyPlan().work, employer: "شركة تجريبية", jobTitle: "مهندس" },
    };
    const env = await sealContent(dk, p, "family", [wrap]);
    dk.fill(0);
    downloadBlob(await buildFamilyHtml(env), "ملف-عهدة-تجريبي.html", "text/html");
    setDemo({ codes });
  }

  if (printMode) {
    const list = printMode === "real" ? codes! : demo!.codes;
    return (
      <Page narrow>
        <div className="noprint mb-4 flex gap-2">
          <button className="btn-primary" onClick={() => window.print()}>
            اطبع
          </button>
          <button className="btn-ghost" onClick={() => setPrintMode(null)}>
            رجوع
          </button>
        </div>
        {list.map((c, i) => (
          <div key={i} className="print-page mb-6 rounded-2xl border-2 border-primary bg-card p-6">
            <div className="flex items-center gap-2">
              <LogoMark size={36} />
              <h2 className="text-xl font-bold">كارت عُهدة — احتفظ بيه في مكان آمن</h2>
            </div>
            {printMode === "demo" && (
              <p className="mt-2 font-bold text-destructive">كارت تجريبي — للتمرين بس</p>
            )}
            {holders[i] && (
              <p className="mt-3">
                مع: <b>{holders[i]}</b>
              </p>
            )}
            <p
              className="mt-4 break-all rounded-xl bg-muted p-4 text-center font-mono text-2xl font-bold tracking-wider"
              dir="ltr"
            >
              {c}
            </p>
            {list.length === 2 && (
              <p className="mt-3 font-semibold">
                ده نص الكود — النص التاني مع ({holders[1 - i] || "الشخص التاني"})
              </p>
            )}
            <ol className="mt-4 space-y-1">
              <li>١) هاتوا ملف «ملف-عهدة-للأهل.html»</li>
              <li>٢) افتحوه أو ادخلوا ohda.codeandcanvas.net/open وارفعوه</li>
              <li>٣) اكتبوا الكود</li>
            </ol>
          </div>
        ))}
      </Page>
    );
  }

  return (
    <Page narrow>
      <h1 className="text-2xl font-bold">سلّم أهلك</h1>
      <div className="mt-5 space-y-5">
        <section className="panel">
          <h2 className="font-bold text-primary">١. مين هيمسك الكود؟</h2>
          <div className="mt-3 grid gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!split}
                disabled={!!existing}
                onChange={() => setSplit(false)}
              />{" "}
              كود واحد مع شخص واحد
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={split}
                disabled={!!existing}
                onChange={() => setSplit(true)}
              />{" "}
              الكود متقسّم على شخصين (لازم الاتنين مع بعض)
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">{split ? "الشخص الأول" : "اسم اللي هيمسك الكود"}</span>
              <input
                className="field"
                value={holders[0] ?? ""}
                disabled={busy}
                onChange={(e) => setHolder(0, e.target.value)}
              />
            </label>
            {split && (
              <label>
                <span className="field-label">الشخص التاني</span>
                <input
                  className="field"
                  value={holders[1] ?? ""}
                  disabled={busy}
                  onChange={(e) => setHolder(1, e.target.value)}
                />
              </label>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            الأسماء بتظهر على الكارت المطبوع بس، ومحفوظة جوه ملفك المشفّر.
          </p>
        </section>

        <section className="panel">
          <h2 className="font-bold text-primary">٢. الكود</h2>
          {s.plan.handover?.reissueNeeded && !existing && !codes && (
            <p className="warn mt-3" role="status">
              حدّثنا طريقة حماية ملفات الأهل. اعمل كود جديد واطبع كروت جديدة وابعت ملف أهل جديد،
              واطلب من أهلك يمسحوا الملف والكروت القديمة.
            </p>
          )}
          {err && (
            <p role="alert" className="err-text mt-3">
              {err}
            </p>
          )}
          {codes ? (
            <div className="mt-3 space-y-3">
              {activated ? (
                <p className="notice font-semibold" role="status">
                  الكروت الجديدة اتفعّلت ✓ نزّل ملف أهل جديد وابعته، واطلب من أهلك يمسحوا الملف
                  والكروت القديمة.
                </p>
              ) : (
                <p className="warn font-semibold">
                  الكروت دي لسه مش متفعّلة. اطبعها، وبعدين أكّد تحت. لو قفلت الصفحة قبل التأكيد
                  الكروت القديمة بتفضل هي الشغالة.
                </p>
              )}
              {codes.map((c, i) => (
                <div key={c} className="rounded-xl bg-muted p-3">
                  {codes.length === 2 && (
                    <p className="text-sm">
                      النص {i === 0 ? "الأول" : "التاني"} {holders[i] && `— ${holders[i]}`}
                    </p>
                  )}
                  <p className="break-all text-center font-mono text-xl font-bold" dir="ltr">
                    {c}
                  </p>
                  <div className="mt-2 text-center">
                    <Copy text={c} />
                  </div>
                </div>
              ))}
              <button className="btn-primary" onClick={() => setPrintMode("real")}>
                اطبع الكروت
              </button>
              {!activated && (
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1.5"
                      checked={printed}
                      onChange={(e) => setPrinted(e.target.checked)}
                    />
                    <span>
                      طبعت الكروت (أو كتبتها) وهي في إيد {codes.length === 2 ? "الشخصين" : "الشخص"}{" "}
                      اللي هيمسكها.
                    </span>
                  </label>
                  {codes.map((_, i) => (
                    <label key={i} className="block">
                      <span className="field-label">
                        للتأكد: اكتب آخر 4 حروف من{" "}
                        {codes.length === 2
                          ? i === 0
                            ? "الكارت الأول"
                            : "الكارت التاني"
                          : "الكارت"}{" "}
                        المطبوع
                      </span>
                      <input
                        className="code-input"
                        dir="ltr"
                        maxLength={6}
                        autoComplete="off"
                        value={checks[i] ?? ""}
                        onChange={(e) =>
                          setChecks((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))
                        }
                      />
                    </label>
                  ))}
                  <div className="flex gap-2">
                    <button
                      className="btn-primary btn-sm"
                      disabled={busy || !printed || !checksOk}
                      onClick={activate}
                    >
                      {busy ? "بيحفظ…" : "فعّل الكروت الجديدة"}
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setPending(null)}>
                      إلغاء (الكروت القديمة تفضل شغالة)
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : existing ? (
            <div className="mt-3">
              <p>
                عندك كود شغّال (
                {existing.type === "code" && existing.mode === "split2"
                  ? "متقسّم على شخصين"
                  : "كود واحد"}
                ). أي ملف أهل جديد هيفتح بنفس الكروت اللي طبعتها.
              </p>
              {!confirmNew ? (
                <button className="btn-outline btn-sm mt-3" onClick={() => setConfirmNew(true)}>
                  اعمل كود جديد
                </button>
              ) : (
                <div className="warn mt-3">
                  <p>
                    الكروت القديمة مش هتفتح أي ملف أهل جديد، ولا عمرها تفتح ملفك أنت. بس ملف الأهل
                    القديم هيفضل يفتح بالكروت القديمة — اطلب من أهلك يمسحوه هو والكروت القديمة بعد
                    ما يستلموا الجديد.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={!split} onChange={() => setSplit(false)} /> كود
                      واحد
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={split} onChange={() => setSplit(true)} /> كودين
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary btn-sm" disabled={busy} onClick={prepare}>
                      أيوه، اعمل كود جديد
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setConfirmNew(false)}>
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button className="btn-primary mt-3" disabled={busy} onClick={prepare}>
              {busy ? "بيجهّز…" : "اعمل الكود"}
            </button>
          )}
        </section>

        <section className="panel">
          <h2 className="font-bold text-primary">٣. نزّل ملف الأهل</h2>
          <p className="mt-2 text-muted-foreground">
            ابعت الملف ده لأهلك على واتساب أو احفظه عندهم في Drive. الملف لوحده مش بيفتح من غير
            الكود. بعد أي تعديل نزّله تاني وابعته — من غير دفع تاني.
          </p>
          {findings.length > 0 && (
            <div className="warn mt-3" role="status">
              <ul className="list-disc space-y-1 pr-5">
                {findings.map((f) => (
                  <li key={f.section}>
                    في «{f.label}»: {f.warnings.join("، ")}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1.5"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>راجعتها، ومفيش أرقام حسابات كاملة ولا كلمات سر في الملف</span>
              </label>
            </div>
          )}
          {missing.length > 0 && (
            <div className="notice mt-3" role="status">
              <p>
                لسه فاضي: {missing.map((k) => `«${SECTION_LABELS[k]}»`).join("، ")} — ممكن تكمّلهم من
                صفحة الملف قبل ما تنزّله.
              </p>
              <Link to="/file" className="btn-outline btn-sm mt-2">
                ارجع للملف
              </Link>
            </div>
          )}
          <button
            className="btn-primary mt-3"
            disabled={!existing || (!!pending && !activated) || needsReview}
            onClick={exportFamily}
          >
            نزّل ملف-عهدة-للأهل.html
          </button>
        </section>

        <section className="panel">
          <h2 className="font-bold text-primary">٤. جرّب الفتح</h2>
          <p className="mt-2 text-muted-foreground">
            نزّل ملف تجريبي ببيانات وهمية وكود تجريبي، وخلّي أهلك يتمرّنوا على فتحه في صفحة «افتح
            ملف أهلك» من غير ما يشوفوا ملفك الحقيقي.
          </p>
          <button className="btn-outline mt-3" onClick={makeDemo}>
            نزّل ملف تجريبي
          </button>
          {demo && (
            <div className="mt-3 space-y-2">
              {demo.codes.map((c) => (
                <p
                  key={c}
                  className="break-all rounded-lg bg-muted p-2 text-center font-mono"
                  dir="ltr"
                >
                  {c}
                </p>
              ))}
              <div className="flex gap-2">
                <button className="btn-outline btn-sm" onClick={() => setPrintMode("demo")}>
                  اطبع كارت تجريبي
                </button>
                <Link to="/open" className="btn-ghost btn-sm">
                  افتح صفحة الفتح
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}
