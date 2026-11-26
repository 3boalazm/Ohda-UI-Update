import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Page, meta } from "@/components/Brand";
import { Area, Field, NeedUnlock } from "@/components/Fields";
import { PlanView } from "@/components/PlanView";
import { MAX_ROWS, completion, downloadBlob, familyCopy, today, type Plan } from "@/lib/plan";
import {
  KEY_SECTIONS,
  SECTION_LABELS,
  SECTION_ORDER,
  missingKeySections,
  sectionDone,
  sensitiveFindings,
} from "@/lib/review";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/file")({
  head: () => ({
    ...meta("ملفي | عُهدة", "املا ملفك المشفّر لأهلك.", "/file"),
    meta: [
      ...meta("ملفي | عُهدة", "املا ملفك المشفّر لأهلك.", "/file").meta,
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FilePage,
});

const SECTIONS = [
  "بياناتك",
  "ابدأوا من هنا",
  "مين يكلموا الأول",
  "الشغل في السعودية",
  "البنوك",
  "التأمين",
  "فلوس ليك عند ناس",
  "فلوس عليك لناس",
  "الأملاك والأوراق",
  "رغبات غير ملزمة",
];

type ListKey = "contacts" | "banks" | "insurance" | "owedToMe" | "iOwe" | "assets";
type ColDef = { k: string; l: string; ph?: string; sensitive?: boolean };

function Rows({
  plan,
  list,
  cols,
  upd,
  addLabel,
  itemLabel,
  example,
}: {
  plan: Plan;
  list: ListKey;
  cols: ColDef[];
  upd: (fn: (p: Plan) => Plan) => void;
  addLabel: string;
  /** what one row is called, for its title ("بنك ١") */
  itemLabel: string;
  /** one example line for the empty state */
  example: string;
}) {
  const rows = plan[list] as unknown as Record<string, string>[];
  // last removed row, so it can be put back for a few seconds
  const [removed, setRemoved] = useState<{ row: Record<string, string>; index: number } | null>(
    null,
  );
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(t);
  }, [removed]);
  const set = (i: number, k: string, v: string) =>
    upd((p) => ({
      ...p,
      [list]: (p[list] as unknown as Record<string, string>[]).map((r, j) =>
        j === i ? { ...r, [k]: v } : r,
      ),
    }));
  const add = () =>
    upd((p) => ({
      ...p,
      [list]: [...(p[list] as unknown[]), Object.fromEntries(cols.map((c) => [c.k, ""]))],
    }));
  const firstKey = cols[0]?.k ?? "";
  return (
    <div className="space-y-4">
      {rows.length === 0 && !removed && (
        <div className="rounded-xl border-[1.5px] border-dashed border-input p-5 text-center">
          <p className="font-semibold">لسه ما ضفتش حاجة هنا</p>
          <p className="mt-1 text-sm text-muted-foreground">{example}</p>
          <button type="button" className="btn-outline btn-sm mt-3" onClick={add}>
            + {addLabel}
          </button>
        </div>
      )}
      {rows.map((r, i) => {
        const title = `${itemLabel} ${i + 1}`;
        const name = (r[firstKey] ?? "").trim();
        return (
          <fieldset key={i} className="subpanel">
            <legend className="sr-only">{title}</legend>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-semibold" aria-hidden="true">
                {title}
                {name && <span className="font-normal text-muted-foreground"> · {name}</span>}
              </p>
              <button
                type="button"
                className="btn-ghost btn-sm shrink-0 text-destructive hover:bg-destructive/5"
                aria-label={`شيل ${title}`}
                onClick={() => {
                  setRemoved({ row: r, index: i });
                  upd((p) => ({
                    ...p,
                    [list]: (p[list] as unknown[]).filter((_, j) => j !== i),
                  }));
                }}
              >
                شيل
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {cols.map((c) => (
                <Field
                  key={c.k}
                  label={c.l}
                  placeholder={c.ph}
                  value={r[c.k] ?? ""}
                  sensitive={c.sensitive}
                  onChange={(v) => set(i, c.k, v)}
                />
              ))}
            </div>
          </fieldset>
        );
      })}
      {removed && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background"
          role="status"
        >
          <span>اتشال {itemLabel}.</span>
          <button
            type="button"
            className="font-semibold text-gold-light underline underline-offset-4"
            onClick={() => {
              const { row, index } = removed;
              setRemoved(null);
              upd((p) => {
                const next = [...(p[list] as unknown[])];
                if (next.length >= MAX_ROWS) return p;
                next.splice(Math.min(index, next.length), 0, row);
                return { ...p, [list]: next };
              });
            }}
          >
            تراجع
          </button>
        </div>
      )}
      {rows.length > 0 && (
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={rows.length >= MAX_ROWS}
          onClick={add}
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}

function FilePage() {
  const v = useVault();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  // Unsaved edits that could not be written here: export first, user confirms, then discard.
  const [lockProblem, setLockProblem] = useState(false);
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [recoveryKept, setRecoveryKept] = useState(false);
  // UI only: the plan object as it was at the last backup in this session (plans are replaced on
  // every edit, so identity tells whether anything changed since), and the mobile section list.
  const [backedUp, setBackedUp] = useState<Plan | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  if (!v.session)
    return (
      <Page narrow>
        <NeedUnlock />
      </Page>
    );
  const p = v.session.plan;
  const u = v.update;
  const pct = completion(p);
  const done = sectionDone(p);
  const setOwner = (k: keyof Plan["owner"]) => (val: string) =>
    u((x) => ({ ...x, owner: { ...x.owner, [k]: val } }));
  const setWork = (k: keyof Plan["work"]) => (val: string) =>
    u((x) => ({ ...x, work: { ...x.work, [k]: val } }));

  /** Returns true only if an encrypted copy was generated and handed to the browser. */
  async function backup(): Promise<boolean> {
    // Save if possible, then export exactly what is in memory (works even if saving fails).
    await v.saveNow();
    const env = await v.exportSnapshot();
    if (!env) return false;
    downloadBlob(JSON.stringify(env), `ohda-backup-${today()}.ohda`, "application/json");
    setBackedUp(p);
    return true;
  }

  /** Go to a section and bring its heading into view if it scrolled away. */
  function goTo(i: number) {
    setStep(i);
    setNavOpen(false);
    requestAnimationFrame(() => {
      const el = sectionRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    });
  }

  const body = [
    <div key={0} className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
      <Field label="الاسم" value={p.owner.name} onChange={setOwner("name")} />
      <Field label="الموبايل" value={p.owner.phone} onChange={setOwner("phone")} dirLtr />
      <Field
        label="المدينة"
        value={p.owner.city}
        onChange={setOwner("city")}
        placeholder="مثلًا: الرياض — وأهلي في المنصورة"
      />
      <Field label="ملاحظات" value={p.owner.notes} onChange={setOwner("notes")} />
    </div>,
    <Area
      key={1}
      label="أول خطوات المفروض أهلك يعملوها"
      rows={8}
      value={p.firstSteps}
      onChange={(val) => u((x) => ({ ...x, firstSteps: val }))}
      placeholder={
        "مثال:\n١) كلموا أخويا محمد الأول، هو عارف أغلب الحاجات.\n٢) كلموا الشركة واسألوا على مستحقات نهاية الخدمة.\n٣) ورق الشقة في الدولاب الكبير، الشنطة البني."
      }
    />,
    <Rows
      key={2}
      plan={p}
      upd={u}
      list="contacts"
      addLabel="ضيف شخص"
      itemLabel="شخص"
      example="مثلًا: محمد · أخويا · عارف حاجات الشغل"
      cols={[
        { k: "name", l: "الاسم" },
        { k: "relation", l: "الصلة", ph: "أخ، زميل، صاحب…" },
        { k: "phone", l: "الرقم" },
        { k: "note", l: "ليه تكلموه", ph: "عارف حاجات الشغل" },
      ]}
    />,
    <div key={3} className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
      <Field label="جهة العمل" value={p.work.employer} onChange={setWork("employer")} />
      <Field
        label="تليفون جهة العمل"
        value={p.work.employerPhone}
        onChange={setWork("employerPhone")}
        dirLtr
      />
      <Field
        label="مسؤول الموارد البشرية"
        value={p.work.hrContact}
        onChange={setWork("hrContact")}
      />
      <Field label="الوظيفة" value={p.work.jobTitle} onChange={setWork("jobTitle")} />
      <Field
        label="بداية العمل"
        value={p.work.startDate}
        onChange={setWork("startDate")}
        placeholder="مثلًا: 2019"
      />
      <Field
        label="آخر 4 أرقام من الإقامة"
        value={p.work.iqamaLast4}
        onChange={(val) => setWork("iqamaLast4")(val.replace(/\D/g, "").slice(0, 4))}
        dirLtr
      />
      <Field
        label="التأمينات الاجتماعية (GOSI)"
        value={p.work.gosi}
        onChange={setWork("gosi")}
        placeholder="مسجّل؟ من إمتى؟"
      />
      <Field
        label="العقد فين"
        value={p.work.contractLocation}
        onChange={setWork("contractLocation")}
      />
      <div className="sm:col-span-2 md:col-span-1 lg:col-span-2">
        <Area label="ملاحظات" rows={3} value={p.work.notes} onChange={setWork("notes")} />
      </div>
    </div>,
    <Rows
      key={4}
      plan={p}
      upd={u}
      list="banks"
      addLabel="ضيف بنك"
      itemLabel="بنك"
      example="مثلًا: الراجحي · السعودية · حساب جاري. اسم البنك ونوع الحساب كفاية."
      cols={[
        { k: "name", l: "البنك", sensitive: true },
        { k: "country", l: "البلد", ph: "السعودية / مصر" },
        { k: "type", l: "نوع الحساب", ph: "جاري، توفير، وديعة…", sensitive: true },
        { k: "note", l: "ملاحظة", sensitive: true },
      ]}
    />,
    <Rows
      key={5}
      plan={p}
      upd={u}
      list="insurance"
      addLabel="ضيف تأمين"
      itemLabel="تأمين"
      example="مثلًا: تأمين طبي من الشغل · الوثيقة في درج المكتب"
      cols={[
        { k: "company", l: "الشركة", sensitive: true },
        { k: "type", l: "النوع", ph: "طبي، حياة، عربية…", sensitive: true },
        { k: "policyRef", l: "مرجع الوثيقة", ph: "الوثيقة فين أو آخر أرقامها", sensitive: true },
        { k: "note", l: "ملاحظة", sensitive: true },
      ]}
    />,
    <Rows
      key={6}
      plan={p}
      upd={u}
      list="owedToMe"
      addLabel="ضيف مبلغ"
      itemLabel="مبلغ"
      example="مثلًا: أحمد زميلي · 2000 ريال · رسايل واتساب"
      cols={[
        { k: "who", l: "مين" },
        { k: "amount", l: "المبلغ" },
        { k: "currency", l: "العملة", ph: "ريال / جنيه" },
        { k: "proof", l: "الإثبات فين", ph: "إيصال، رسايل واتساب…" },
      ]}
    />,
    <Rows
      key={7}
      plan={p}
      upd={u}
      list="iOwe"
      addLabel="ضيف مبلغ"
      itemLabel="مبلغ"
      example="مثلًا: خالي · 5000 جنيه · تحويل بنكي"
      cols={[
        { k: "to", l: "لمين" },
        { k: "amount", l: "المبلغ" },
        { k: "currency", l: "العملة" },
        { k: "how", l: "إزاي تتدفع" },
      ]}
    />,
    <Rows
      key={8}
      plan={p}
      upd={u}
      list="assets"
      addLabel="ضيف حاجة"
      itemLabel="حاجة"
      example="مثلًا: شقة · المنصورة · العقد مع أمي"
      cols={[
        { k: "item", l: "الحاجة", ph: "شقة، عربية، دهب، ورق…" },
        { k: "location", l: "مكانها" },
        { k: "holder", l: "مع مين" },
      ]}
    />,
    <div key={9}>
      <p className="notice mb-3">
        ده مش وصية شرعية. لو عايز وصية رسمية اعملها عند الجهة المختصة واكتب هنا مكانها.
      </p>
      <Area
        label="رغبات غير ملزمة"
        value={p.wishes}
        onChange={(val) => u((x) => ({ ...x, wishes: val }))}
      />
    </div>,
  ];

  if (preview) {
    const missing = missingKeySections(p);
    const findings = sensitiveFindings(p);
    return (
      <Page narrow>
        <div className="noprint mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">معاينة</p>
            <h1 className="text-2xl font-bold">كده أهلك هيشوفوا الملف</h1>
          </div>
          <button className="btn-outline btn-sm" onClick={() => setPreview(false)}>
            ارجع للتعديل
          </button>
        </div>
        {(missing.length > 0 || findings.length > 0) && (
          <div className="noprint warn mb-4 space-y-3">
            <p className="font-semibold">قبل ما تسلّم ملفك:</p>
            {missing.map((k) => (
              <div key={`missing-${k}`} className="space-y-2">
                <p>«{SECTION_LABELS[k]}» لسه فاضي — ده من أول الحاجات اللي أهلك هيدوّروا عليها.</p>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => {
                    setPreview(false);
                    goTo(SECTION_ORDER.indexOf(k));
                  }}
                >
                  كمّله
                </button>
              </div>
            ))}
            {findings.map((f) => (
              <div key={`sensitive-${f.section}`} className="space-y-2">
                <p>في «{f.label}»:</p>
                <ul className="list-disc space-y-1 ps-5">
                  {f.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => {
                    setPreview(false);
                    goTo(SECTION_ORDER.indexOf(f.section));
                  }}
                >
                  عدّله
                </button>
              </div>
            ))}
          </div>
        )}
        <PlanView plan={familyCopy(p)} nested />
      </Page>
    );
  }

  const doneCount = SECTION_ORDER.filter((k) => done[k]).length;
  const stepKey = SECTION_ORDER[step];
  const isLast = step === SECTIONS.length - 1;
  const stateChip = (i: number) => {
    const key = SECTION_ORDER[i];
    if (key === undefined) return null;
    if (done[key])
      return (
        <span className="chip-done px-2 text-xs" aria-label="مكتمل">
          ✓
        </span>
      );
    if (KEY_SECTIONS.includes(key)) return <span className="chip-todo px-2 text-xs">مهم</span>;
    return null;
  };
  const saveProblem = v.status === "error" || v.status === "conflict";

  return (
    <Page>
      {/* title row: name, save status, the two page-level actions */}
      <div className="noprint mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[1.75rem] font-bold">ملفي</h1>
          <p role="status" aria-live="polite">
            {v.status === "saving" ? (
              <span className="chip-neutral">بيتحفظ…</span>
            ) : saveProblem ? (
              <span className="chip bg-destructive/10 text-destructive">ما اتحفظش</span>
            ) : (
              <span className="chip-done">اتحفظ مشفّر على جهازك ✓</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" onClick={() => setPreview(true)}>
            شوفه زي أهلك
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              if (await v.lock()) return nav({ to: "/start" });
              setLockProblem(true); // edits could not be saved here: recovery steps below
            }}
          >
            اقفل
          </button>
        </div>
      </div>

      {saveProblem && (
        <p className="warn noprint mb-5 border-destructive bg-destructive/5" role="alert">
          {v.status === "error"
            ? "ما اتحفظش على الجهاز — نزّل نسخة احتياطية دلوقتي عشان ما يضيعش حاجة."
            : "الملف اتفتح واتعدّل في شاشة تانية. نزّل نسخة احتياطية من اللي هنا، وبعدين افتح الملف من جديد."}
        </p>
      )}

      {lockProblem && (
        <div className="warn noprint mb-5 space-y-3" role="alert">
          <p className="font-semibold">
            فيه تعديلات ما اتحفظتش على الجهاز ده، فما قفلناش الملف عشان ما تضيعش.
          </p>
          <button
            className="btn-primary btn-sm"
            onClick={async () => setRecoveryDownloaded(await backup())}
          >
            ١. نزّل نسخة احتياطية مشفّرة
          </button>
          {recoveryDownloaded && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={recoveryKept}
                onChange={(e) => setRecoveryKept(e.target.checked)}
              />
              <span>٢. لقيت ملف ‎.ohda‎ اللي اتنزّل وحفظته في مكان آمن.</span>
            </label>
          )}
          <button
            className="btn-danger btn-sm"
            disabled={!recoveryDownloaded || !recoveryKept}
            onClick={async () => {
              await v.lock({ discard: true });
              nav({ to: "/start" });
            }}
          >
            ٣. اقفل من غير ما أحفظ هنا
          </button>
        </div>
      )}

      {/* progress + the next big step */}
      <div className="noprint mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div className="min-w-[12rem] flex-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="font-semibold">اكتمال الملف</span>
            <span className="text-muted-foreground tabular-nums">
              {doneCount} من {SECTIONS.length} أقسام · {pct}%
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="اكتمال الملف"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gold transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Link to="/handover" className="btn-outline btn-sm">
          سلّم أهلك
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-[230px_1fr]">
        {/* sections: a full list on desktop; a compact picker that expands on phones */}
        <nav aria-label="أقسام الملف" className="noprint">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-start md:hidden"
            aria-expanded={navOpen}
            aria-controls="file-sections"
            onClick={() => setNavOpen((o) => !o)}
          >
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                القسم {step + 1} من {SECTIONS.length}
              </span>
              <span className="block truncate font-semibold">{SECTIONS[step]}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-primary">
              {navOpen ? "اقفل القائمة" : "كل الأقسام"}
            </span>
          </button>
          <ol
            id="file-sections"
            className={`${navOpen ? "grid" : "hidden"} mt-2 gap-1 rounded-xl border border-border bg-card p-1.5 md:mt-0 md:grid md:border-0 md:bg-transparent md:p-0`}
          >
            {SECTIONS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-[0.9375rem] ${i === step ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-secondary"}`}
                >
                  <span className="min-w-0">
                    <span className={`tabular-nums ${i === step ? "" : "text-muted-foreground"}`}>
                      {i + 1}.
                    </span>{" "}
                    {s}
                  </span>
                  {i === step ? null : stateChip(i)}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section ref={sectionRef} className="panel scroll-mt-24" aria-labelledby="section-title">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <h2 id="section-title" className="text-xl font-bold text-primary">
              {SECTIONS[step]}
            </h2>
            {stepKey !== undefined && done[stepKey] && <span className="chip-done">✓ مكتمل</span>}
            {stepKey !== undefined && !done[stepKey] && KEY_SECTIONS.includes(stepKey) && (
              <span className="chip-todo">مهم لأهلك</span>
            )}
          </div>
          {body[step]}
          {/* stays at the bottom of the screen on phones while the section is in view */}
          <div className="sticky bottom-0 -mx-5 mt-6 -mb-5 flex items-center justify-between gap-3 rounded-b-2xl border-t border-border bg-card/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 md:static md:mx-0 md:mb-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
            >
              السابق
            </button>
            {!isLast ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => goTo(step + 1)}>
                التالي<span className="hidden sm:inline">: {SECTIONS[step + 1]}</span>
              </button>
            ) : (
              <Link to="/handover" className="btn-primary btn-sm">
                سلّم أهلك
              </Link>
            )}
          </div>
        </section>
      </div>

      {/* the owner's real copy is the encrypted backup: one clear prompt, aware of new edits */}
      <section
        className="noprint mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-5 py-4"
        aria-label="النسخة الاحتياطية"
      >
        <div className="min-w-[15rem] flex-1 space-y-0.5">
          <p className="font-semibold">
            {backedUp === p
              ? "✓ نزّلت نسخة احتياطية بعد آخر تعديل"
              : backedUp
                ? "فيه تعديلات من بعد آخر نسخة نزّلتها"
                : "النسخة الاحتياطية هي نسختك الحقيقية"}
          </p>
          <p className="text-sm text-muted-foreground">
            بيانات المتصفح ممكن تتمسح. نزّل نسخة بعد كل تعديل مهم واحفظها في مكان آمن.
          </p>
        </div>
        <button className="btn-outline btn-sm" onClick={() => void backup()}>
          نزّل نسخة احتياطية مشفّرة
        </button>
      </section>

      <div className="noprint mt-10 border-t border-border pt-6">
        {!confirmDel ? (
          <button
            className="btn-ghost btn-sm text-destructive hover:bg-destructive/5"
            onClick={() => setConfirmDel(true)}
          >
            امسح الملف من الجهاز
          </button>
        ) : (
          <div className="panel border-destructive" role="alert">
            <p className="font-semibold">
              متأكد؟ الملف هيتمسح من الجهاز ده نهائيًا. لو ما عندكش نسخة احتياطية مش هتقدر ترجّعه.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-danger btn-sm"
                onClick={async () => {
                  await v.destroy();
                  nav({ to: "/" });
                }}
              >
                أيوه، امسح
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>
                لأ، سيبه
              </button>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
