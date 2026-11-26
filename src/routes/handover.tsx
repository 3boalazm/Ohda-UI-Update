import { PLAN_NAME, priceLabel } from "@/lib/pricing";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Page, meta, LogoMark } from "@/components/Brand";
import { CodeText, StepItem, type StepState } from "@/components/Kit";
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
  return <Flow act={act} />;
}

function NotActivated() {
  return (
    <div className="panel space-y-5">
      <div>
        <p className="eyebrow">خطوة أخيرة قبل التسليم</p>
        <h1 className="mt-1 text-2xl font-bold">سلّم أهلك</h1>
        <p className="mt-2 text-muted-foreground">
          التسليم محتاج تفعيل مرة واحدة. بعده تقدر تعيد تصدير الملف لأهلك في أي وقت بعد أي تعديل.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {[
          "ملف للأهل مشفّر، بيفتح من غير الموقع",
          "كروت مطبوعة بالكود",
          "تقسيم الكود على شخصين",
          "تجربة الفتح بملف تجريبي",
          "تحديثات بلا حدود",
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 font-bold text-primary">
              ✓
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["single", "family"] as const).map((plan) => (
          <div
            key={plan}
            className={`rounded-[22px] p-4 ${plan === "family" ? "bg-gold-soft" : "bg-muted"}`}
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
      <Link to="/activate" className="btn-primary w-full sm:w-auto">
        فعّل دلوقتي
      </Link>
    </div>
  );
}

function Flow({ act }: { act: Activation }) {
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
  // UI only: step 1 collapses once names are in; step 3 remembers a download in this visit.
  const holdersDone = !!existing || (!!holders[0]?.trim() && (!split || !!holders[1]?.trim()));
  const [editHolders, setEditHolders] = useState(!holdersDone);
  const [downloaded, setDownloaded] = useState(false);
  const [exportErr, setExportErr] = useState("");

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
    setExportErr("");
    try {
      const env = await sealFamilyFile(plan);
      downloadBlob(await buildFamilyHtml(env), "ملف-عهدة-للأهل.html", "text/html");
      setDownloaded(true);
    } catch (x) {
      // never fail silently: the owner must know the family file was not produced
      const m = x instanceof Error ? x.message : "";
      setExportErr(/[\u0600-\u06FF]/.test(m) ? m : "ما قدرناش نجهّز ملف الأهل. جرّب تاني.");
    }
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
            <div className="mt-4 rounded-xl bg-muted p-4">
              <CodeText code={c} className="text-2xl" />
            </div>
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

  // what each step looks like right now (visual only; every action keeps its own guards)
  const codeDone = !!existing && (!pending || activated);
  const st1: StepState = holdersDone && !editHolders ? "done" : "current";
  const st2: StepState = codeDone ? "done" : holdersDone || pending ? "current" : "upcoming";
  const st3: StepState = downloaded ? "done" : codeDone ? "current" : "upcoming";
  const st4: StepState = demo ? "done" : codeDone ? "current" : "upcoming";
  const downloadBlocked = !existing
    ? "اعمل الكود وأكّد الكروت في خطوة 2 الأول."
    : pending && !activated
      ? "أكّد الكروت الجديدة في خطوة 2 الأول."
      : needsReview
        ? "علّم على «راجعتها» فوق عشان تقدر تنزّل."
        : null;
  const modeText = (sp: boolean) => (sp ? "الكود متقسّم على شخصين" : "كود واحد مع شخص واحد");

  return (
    <Page narrow>
      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[1.75rem] font-bold">سلّم أهلك</h1>
          <span className="chip-done">✓ متفعّل · {PLAN_NAME[act.plan]}</span>
        </div>
        <p className="text-muted-foreground">
          4 خطوات: تختار مين يمسك الكود، تطبع الكارت، تنزّل ملف الأهل وتبعته، وتجرّبوا الفتح.
        </p>
      </div>

      <ol className="panel">
        {/* 1 — who holds the code */}
        <StepItem
          n={1}
          title="مين هيمسك الكود؟"
          state={st1}
          summary={
            st1 === "done" ? (
              <>
                {holders[0] || "من غير اسم"}
                {split && ` و${holders[1] || "شخص تاني"}`} · {modeText(split)}
              </>
            ) : (
              "الأسماء بتظهر على الكارت المطبوع بس، ومحفوظة جوه ملفك المشفّر."
            )
          }
        >
          {st1 === "done" ? (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditHolders(true)}>
              عدّل
            </button>
          ) : (
            <div className="space-y-4">
              <fieldset className="grid gap-2" disabled={!!existing}>
                <legend className="sr-only">طريقة الكود</legend>
                {[false, true].map((sp) => (
                  <label
                    key={String(sp)}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5 ${split === sp ? "bg-secondary" : "bg-muted"}`}
                  >
                    <input
                      type="radio"
                      name="holder-mode"
                      checked={split === sp}
                      onChange={() => setSplit(sp)}
                    />
                    <span>
                      {modeText(sp)}
                      {sp && (
                        <span className="block text-sm text-muted-foreground">
                          لازم الاتنين مع بعض عشان الملف يتفتح
                        </span>
                      )}
                    </span>
                  </label>
                ))}
                {existing && (
                  <p className="field-hint">
                    الطريقة دي ثابتة للكود الشغّال. تقدر تغيّرها لما تعمل كود جديد في خطوة 2.
                  </p>
                )}
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="field-label">
                    {split ? "الشخص الأول" : "اسم اللي هيمسك الكود"}
                  </span>
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
              {holdersDone && (
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  onClick={() => setEditHolders(false)}
                >
                  تمام
                </button>
              )}
            </div>
          )}
        </StepItem>

        {/* 2 — the code and the printed card */}
        <StepItem
          n={2}
          title="اعمل الكود واطبع الكارت"
          state={st2}
          summary={
            codeDone && !pending
              ? `عندك كود شغّال (${existing && existing.type === "code" && existing.mode === "split2" ? "متقسّم على شخصين" : "كود واحد"})`
              : st2 === "upcoming"
                ? "بعد ما تكتب اسم اللي هيمسك الكود."
                : "بتطبع الكارت، وبعدين تأكّد إنه في إيد اللي هيمسكه."
          }
        >
          <div className="space-y-3">
            {s.plan.handover?.reissueNeeded && !existing && !codes && (
              <p className="warn" role="status">
                حدّثنا طريقة حماية ملفات الأهل. اعمل كود جديد واطبع كروت جديدة وابعت ملف أهل جديد،
                واطلب من أهلك يمسحوا الملف والكروت القديمة.
              </p>
            )}
            {err && (
              <p role="alert" className="err-text">
                {err}
              </p>
            )}
            {codes ? (
              <div className="space-y-4">
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
                  <div key={c} className="subpanel space-y-3 text-center">
                    {codes.length === 2 && (
                      <p className="text-sm font-semibold">
                        النص {i === 0 ? "الأول" : "التاني"} {holders[i] && `— ${holders[i]}`}
                      </p>
                    )}
                    <CodeText code={c} />
                    <Copy text={c} />
                  </div>
                ))}
                <button
                  className="btn-primary w-full sm:w-auto"
                  onClick={() => setPrintMode("real")}
                >
                  اطبع الكروت
                </button>
                {!activated && (
                  <div className="subpanel space-y-3">
                    <p className="font-semibold">بعد الطباعة: أكّد إن الكارت صح</p>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={printed}
                        onChange={(e) => setPrinted(e.target.checked)}
                      />
                      <span>
                        طبعت الكروت (أو كتبتها) وهي في إيد{" "}
                        {codes.length === 2 ? "الشخصين" : "الشخص"} اللي هيمسكها.
                      </span>
                    </label>
                    {codes.map((_, i) => (
                      <label key={i} className="block">
                        <span className="field-label">
                          اكتب آخر 4 حروف من{" "}
                          {codes.length === 2
                            ? i === 0
                              ? "الكارت الأول"
                              : "الكارت التاني"
                            : "الكارت"}{" "}
                          المطبوع
                        </span>
                        <input
                          className="code-input max-w-48"
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
                    <div className="flex flex-wrap items-center gap-2">
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
                    {(!printed || !checksOk) && (
                      <p className="why">
                        {!printed
                          ? "علّم على «طبعت الكروت» الأول."
                          : "آخر 4 حروف لازم يطابقوا الكارت."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : existing ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  أي ملف أهل جديد هيفتح بنفس الكروت اللي طبعتها.
                </p>
                {!confirmNew ? (
                  <button className="btn-outline btn-sm" onClick={() => setConfirmNew(true)}>
                    اعمل كود جديد
                  </button>
                ) : (
                  <div className="warn space-y-3">
                    <p>
                      الكروت القديمة مش هتفتح أي ملف أهل جديد، ولا عمرها تفتح ملفك أنت. بس ملف الأهل
                      القديم هيفضل يفتح بالكروت القديمة — اطلب من أهلك يمسحوه هو والكروت القديمة بعد
                      ما يستلموا الجديد.
                    </p>
                    <fieldset className="flex flex-wrap gap-4">
                      <legend className="sr-only">طريقة الكود الجديد</legend>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="new-code-mode"
                          checked={!split}
                          onChange={() => setSplit(false)}
                        />{" "}
                        كود واحد
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="new-code-mode"
                          checked={split}
                          onChange={() => setSplit(true)}
                        />{" "}
                        كودين
                      </label>
                    </fieldset>
                    <div className="flex flex-wrap gap-2">
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
              <button
                className={st2 === "current" ? "btn-primary" : "btn-outline"}
                disabled={busy}
                onClick={prepare}
              >
                {busy ? "بيجهّز…" : "اعمل الكود"}
              </button>
            )}
          </div>
        </StepItem>

        {/* 3 — download and send the family file */}
        <StepItem
          n={3}
          title="نزّل ملف الأهل وابعته"
          state={st3}
          summary={
            downloaded
              ? "اتنزّل ✓ ابعته لأهلك. بعد أي تعديل نزّله تاني — من غير دفع تاني."
              : "ابعته على واتساب أو احفظه عندهم في Drive. الملف لوحده مش بيفتح من غير الكود."
          }
        >
          <div className="space-y-3">
            {(findings.length > 0 || missing.length > 0) && (
              <div className="warn space-y-3" role="status">
                <p className="font-semibold">قبل ما تنزّله:</p>
                {missing.length > 0 && (
                  <div className="space-y-2">
                    <p>
                      لسه فاضي: {missing.map((k) => `«${SECTION_LABELS[k]}»`).join("، ")} — ممكن
                      تكمّلهم من صفحة الملف.
                    </p>
                    <Link to="/file" className="btn-outline btn-sm">
                      ارجع للملف
                    </Link>
                  </div>
                )}
                {findings.length > 0 && (
                  <div className="space-y-2">
                    <ul className="list-disc space-y-1 ps-5">
                      {findings.map((f) => (
                        <li key={f.section}>
                          في «{f.label}»: {f.warnings.join("، ")}
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={reviewed}
                        onChange={(e) => setReviewed(e.target.checked)}
                      />
                      <span>راجعتها، ومفيش أرقام حسابات كاملة ولا كلمات سر في الملف</span>
                    </label>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                className={st3 === "current" ? "btn-primary" : "btn-outline"}
                disabled={!existing || (!!pending && !activated) || needsReview}
                onClick={exportFamily}
              >
                نزّل ملف-عهدة-للأهل.html
              </button>
              {downloadBlocked && <p className="why">{downloadBlocked}</p>}
            </div>
            {exportErr && (
              <p role="alert" className="err-text">
                {exportErr}
              </p>
            )}
          </div>
        </StepItem>

        {/* 4 — rehearsal (optional) */}
        <StepItem
          n={4}
          title="جرّبوا الفتح (اختياري)"
          state={st4}
          last
          summary="ملف تجريبي ببيانات وهمية وكود تجريبي، يتمرّن عليه أهلك من غير ما يشوفوا ملفك الحقيقي."
        >
          <div className="space-y-3">
            <button className="btn-outline btn-sm" onClick={makeDemo}>
              نزّل ملف تجريبي
            </button>
            {demo && (
              <div className="space-y-3">
                {demo.codes.map((c) => (
                  <div key={c} className="subpanel">
                    <CodeText code={c} className="text-base" />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-outline btn-sm" onClick={() => setPrintMode("demo")}>
                    اطبع كارت تجريبي
                  </button>
                  <Link to="/open" className="btn-ghost btn-sm">
                    افتح صفحة الفتح
                  </Link>
                </div>
              </div>
            )}
          </div>
        </StepItem>
      </ol>
    </Page>
  );
}
