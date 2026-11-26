import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Page, meta } from "@/components/Brand";
import { Area, Field, NeedUnlock } from "@/components/Fields";
import { Icon } from "@/components/Icon";
import { PlanView } from "@/components/PlanView";
import { QuickAdd } from "@/components/QuickAdd";
import {
  GROUPS,
  LIFE_EVENTS,
  SECTION_GROUP,
  SECTION_HINT,
  backupAgeText,
  backupState,
  buildReviewIcs,
  nextStep,
  quickAdd,
  readLastBackup,
  readQuizGaps,
  sectionCount,
  writeLastBackup,
  writeQuizGaps,
  type GroupKey,
  type ListKey,
} from "@/lib/home";
import { MAX_ROWS, completion, downloadBlob, familyCopy, today, type Plan } from "@/lib/plan";
import {
  KEY_SECTIONS,
  SECTION_LABELS,
  SECTION_ORDER,
  missingKeySections,
  sectionDone,
  sensitiveFindings,
  type SectionKey,
} from "@/lib/review";
import { useVault } from "@/lib/vault";

type FileSearch = { s?: SectionKey; v?: "preview" };

export const Route = createFileRoute("/file")({
  head: () => ({
    ...meta("ملفي | عُهدة", "املا ملفك المشفّر لأهلك.", "/file"),
    meta: [
      ...meta("ملفي | عُهدة", "املا ملفك المشفّر لأهلك.", "/file").meta,
      { name: "robots", content: "noindex" },
    ],
  }),
  // which screen is open lives in the URL, so the phone's back button goes home, not away
  validateSearch: (q: Record<string, unknown>): FileSearch => ({
    ...(typeof q["s"] === "string" && (SECTION_ORDER as string[]).includes(q["s"])
      ? { s: q["s"] as SectionKey }
      : {}),
    ...(q["v"] === "preview" ? { v: "preview" as const } : {}),
  }),
  component: FilePage,
});

type ColDef = { k: string; l: string; ph?: string; sensitive?: boolean | "secret" };

/** Counts up to `to` when it changes (skipped when the user asked for reduced motion). */
function useCountUp(to: number): number {
  const [shown, setShown] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    const start = from.current;
    from.current = to;
    if (start === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return setShown(to);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 600);
      setShown(Math.round(start + (to - start) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return shown;
}

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
  const { s: openKey, v: view } = Route.useSearch();
  const go = (search: FileSearch) => void nav({ to: "/file", search });
  const [group, setGroup] = useState<GroupKey>("all");
  const [confirmDel, setConfirmDel] = useState(false);
  // Unsaved edits that could not be written here: export first, user confirms, then discard.
  const [lockProblem, setLockProblem] = useState(false);
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [recoveryKept, setRecoveryKept] = useState(false);
  // UI only (no file content): when the last backup was downloaded, quiz follow-ups, a toast,
  // and which tile to pulse after a quick add.
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [quizTodo, setQuizTodo] = useState<SectionKey[]>([]);
  const [toast, setToast] = useState<{ text: string; go?: SectionKey } | null>(null);
  const [bumped, setBumped] = useState<SectionKey | null>(null);
  useEffect(() => {
    setLastBackup(readLastBackup());
    setQuizTodo(readQuizGaps());
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [openKey, view]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const plan = v.session?.plan;
  const doneCount = plan ? SECTION_ORDER.filter((k) => sectionDone(plan)[k]).length : 0;
  const shownCount = useCountUp(doneCount);

  if (!v.session || !plan)
    return (
      <Page narrow>
        <NeedUnlock />
      </Page>
    );
  const p = plan;
  const u = v.update;
  const pct = completion(p);
  const done = sectionDone(p);
  const next = nextStep(p);
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
    const at = new Date().toISOString();
    writeLastBackup(at);
    setLastBackup(at);
    return true;
  }

  async function lock() {
    if (await v.lock()) return nav({ to: "/start" });
    setLockProblem(true); // edits could not be saved here: recovery steps below
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
    <Rows
      key={9}
      plan={p}
      upd={u}
      list="accounts"
      addLabel="ضيف حساب"
      itemLabel="حساب"
      example="مثلًا: جيميل · مسجّل برقم موبايلي · يتقفل"
      cols={[
        { k: "name", l: "الخدمة", ph: "جيميل، فيسبوك، خط التليفون…", sensitive: "secret" },
        {
          k: "login",
          l: "مسجّل بإيه",
          ph: "الإيميل أو الرقم، من غير كلمة السر",
          sensitive: "secret",
        },
        { k: "action", l: "المطلوب", ph: "يتقفل، يتحوّل لذكرى، يتسلّم لحد", sensitive: "secret" },
        { k: "note", l: "ملاحظة", sensitive: "secret" },
      ]}
    />,
    <div key={10}>
      <p className="notice mb-3">
        ده مش وصية شرعية. لو عايز وصية رسمية اعملها عند الجهة المختصة واكتب هنا مكانها.
      </p>
      <Area
        label="رغبات غير ملزمة"
        value={p.wishes}
        onChange={(val) => u((x) => ({ ...x, wishes: val }))}
      />
    </div>,
    <Area
      key={11}
      label="رسالة لأهلك"
      rows={8}
      value={p.letter}
      onChange={(val) => u((x) => ({ ...x, letter: val }))}
      placeholder="كلام منك ليهم. هيظهر أول حاجة لما يفتحوا الملف."
    />,
  ];

  const saveProblem = v.status === "error" || v.status === "conflict";
  const saveChip = (
    <p role="status" aria-live="polite">
      {v.status === "saving" ? (
        <span className="chip-neutral">بيتحفظ…</span>
      ) : saveProblem ? (
        <span className="chip bg-destructive/10 text-destructive">ما اتحفظش</span>
      ) : (
        <span className="chip-done">اتحفظ مشفّر على جهازك ✓</span>
      )}
    </p>
  );
  const problems = (
    <>
      {saveProblem && (
        <p className="warn noprint mb-4 bg-destructive/10" role="alert">
          {v.status === "error"
            ? "ما اتحفظش على الجهاز — نزّل نسخة احتياطية دلوقتي عشان ما يضيعش حاجة."
            : "الملف اتفتح واتعدّل في شاشة تانية. نزّل نسخة احتياطية من اللي هنا، وبعدين افتح الملف من جديد."}
        </p>
      )}
      {lockProblem && (
        <div className="warn noprint mb-4 space-y-3" role="alert">
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
    </>
  );
  /** The floating bar at the bottom of the screen; lets go at the end of the page. */
  const bar = (children: React.ReactNode) => (
    <div className="noprint pointer-events-none sticky bottom-4 z-30 mt-10">
      <div className="pointer-events-auto relative mx-auto max-w-md">{children}</div>
    </div>
  );

  // ---------- preview: exactly what the family will see ----------
  if (view === "preview") {
    const missing = missingKeySections(p);
    const findings = sensitiveFindings(p);
    return (
      <Page narrow>
        <div className="noprint mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">معاينة</p>
            <h1 className="text-2xl font-bold">كده أهلك هيشوفوا الملف</h1>
          </div>
          <button className="btn-outline btn-sm" onClick={() => go({})}>
            ارجع للتعديل
          </button>
        </div>
        {(missing.length > 0 || findings.length > 0) && (
          <div className="noprint warn mb-4 space-y-3">
            <p className="font-semibold">قبل ما تسلّم ملفك:</p>
            {missing.map((k) => (
              <div key={`missing-${k}`} className="space-y-2">
                <p>«{SECTION_LABELS[k]}» لسه فاضي — ده من أول الحاجات اللي أهلك هيدوّروا عليها.</p>
                <button className="btn-outline btn-sm" onClick={() => go({ s: k })}>
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
                <button className="btn-outline btn-sm" onClick={() => go({ s: f.section })}>
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

  // ---------- one section ----------
  if (openKey) {
    const i = SECTION_ORDER.indexOf(openKey);
    const prev = SECTION_ORDER[i - 1];
    const after = SECTION_ORDER[i + 1];
    return (
      <Page narrow>
        <div className="noprint mb-4 flex items-center justify-between gap-3">
          <button className="btn-outline btn-sm ps-2.5" data-nav="home" onClick={() => go({})}>
            <Icon name="back" className="size-4" />
            ملفي
          </button>
          {saveChip}
        </div>
        {problems}
        <section key={openKey} className="panel anim-rise" aria-labelledby="section-title">
          <p className="text-sm text-muted-foreground tabular-nums">
            القسم {i + 1} من {SECTION_ORDER.length}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 id="section-title" className="text-2xl font-bold">
              {SECTION_LABELS[openKey]}
            </h1>
            {done[openKey] ? (
              <span className="chip-done">✓ مكتمل</span>
            ) : (
              KEY_SECTIONS.includes(openKey) && <span className="chip-todo">مهم لأهلك</span>
            )}
          </div>
          <p className="mt-1 mb-5 text-muted-foreground">{SECTION_HINT[openKey]}</p>
          {body[i]}
        </section>
        {bar(
          <div className="flex items-center justify-between gap-2 rounded-full bg-card p-2 shadow-float">
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={!prev}
              onClick={() => prev && go({ s: prev })}
            >
              السابق
            </button>
            {after ? (
              <button
                type="button"
                className="btn-primary btn-sm min-w-0"
                onClick={() => go({ s: after })}
              >
                <span className="truncate">التالي: {SECTION_LABELS[after]}</span>
              </button>
            ) : (
              <button type="button" className="btn-primary btn-sm" onClick={() => go({})}>
                خلصت، ارجع لملفي
              </button>
            )}
          </div>,
        )}
      </Page>
    );
  }

  // ---------- home ----------
  const shown = SECTION_ORDER.filter((k) => group === "all" || SECTION_GROUP[k] === group);
  const groupName = (k: SectionKey) => GROUPS.find(([g]) => g === SECTION_GROUP[k])?.[1] ?? "";
  const quizLeft = quizTodo.filter((k) => !done[k]);
  const bState = backupState(lastBackup, p.updated);

  return (
    <Page>
      <div className="noprint mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[2rem] leading-tight font-bold">ملفي</h1>
          {saveChip}
        </div>
        <button className="btn-outline btn-sm" onClick={() => void lock()}>
          <Icon name="lock" className="size-4" />
          اقفل
        </button>
      </div>
      {problems}

      {/* the one colour screen: how ready the file is, and the single next step */}
      <section className="color-screen noprint" aria-label="جاهزية الملف">
        <span
          aria-hidden="true"
          className="absolute -end-14 -top-16 size-52 rounded-full border-[34px] border-white/[0.07]"
        />
        <div className="relative grid gap-5 md:grid-cols-2 md:items-end">
          <div>
            <p className="text-sm opacity-85">اكتمال الملف · {pct}%</p>
            <p className="mt-3 flex items-end gap-3">
              <span className="num text-[5.75rem] md:text-[7.5rem]">{shownCount}</span>
              <span className="pb-1.5 text-sm leading-5 opacity-90">
                قسم جاهز
                <br />
                من {SECTION_ORDER.length}
              </span>
            </p>
            <div
              className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-label="اكتمال الملف"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[24px] bg-white/10 p-3 ps-4">
            {next ? (
              <>
                <div className="min-w-0">
                  <p className="text-xs opacity-80">الخطوة الجاية</p>
                  <p className="truncate font-bold">{SECTION_LABELS[next]}</p>
                  <p className="text-[0.8125rem] leading-5 opacity-80">{SECTION_HINT[next]}</p>
                </div>
                <button className="btn-gold btn-sm shrink-0" onClick={() => go({ s: next })}>
                  كمّل
                </button>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="font-bold">الملف كامل ✓</p>
                  <p className="text-[0.8125rem] leading-5 opacity-80">
                    سلّمه لأهلك، وراجعه كل كام شهر.
                  </p>
                </div>
                <Link to="/handover" className="btn-gold btn-sm shrink-0">
                  سلّم أهلك
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {quizLeft.length > 0 && (
        <section className="noprint mt-4 rounded-[28px] bg-gold-soft p-5" aria-label="من الاختبار">
          <p className="font-bold">من الاختبار: حاجات أهلك لسه مش عارفينها</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quizLeft.map((k) => (
              <button key={k} className="btn-outline btn-sm" onClick={() => go({ s: k })}>
                {SECTION_LABELS[k]}
              </button>
            ))}
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                writeQuizGaps(null);
                setQuizTodo([]);
              }}
            >
              شيل القايمة دي
            </button>
          </div>
        </section>
      )}

      {/* big-word filter + the sections as tiles */}
      <div
        className="no-scrollbar noprint -mx-4 mt-7 flex gap-5 overflow-x-auto px-4"
        role="group"
        aria-label="نوع الأقسام"
      >
        {GROUPS.map(([g, label]) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
            className={`shrink-0 text-[1.75rem] leading-snug font-bold transition-opacity duration-200 ${group === g ? "" : "opacity-25 hover:opacity-50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        key={group}
        className="noprint mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      >
        {shown.map((k, i) => {
          const isNext = k === next;
          const important = !done[k] && KEY_SECTIONS.includes(k);
          const count = sectionCount(p, k);
          const tone = isNext
            ? "bg-ink text-ink-foreground"
            : important
              ? "bg-gold-soft"
              : "bg-card";
          return (
            <button
              key={k}
              type="button"
              data-section={k}
              onClick={() => go({ s: k })}
              style={{ animationDelay: bumped === k ? "0ms" : `${i * 40}ms` }}
              className={`flex min-h-[8.25rem] flex-col justify-between rounded-[26px] p-4 text-start transition-transform duration-150 active:scale-[0.97] ${tone} ${bumped === k ? "anim-bump" : "anim-rise"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs opacity-70">
                  {isNext ? "الخطوة الجاية" : important ? "مهم لأهلك" : groupName(k)}
                </span>
                {done[k] ? (
                  <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Icon name="check" className="size-3.5" />
                  </span>
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-current/10">
                    <Icon name="back" className="size-3.5 rotate-180" />
                  </span>
                )}
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="text-lg leading-snug font-bold">{SECTION_LABELS[k]}</span>
                {count !== null && <span className="num text-4xl">{count}</span>}
              </span>
              <span className="sr-only">{done[k] ? "مكتمل" : "لسه ناقص"}</span>
            </button>
          );
        })}
      </div>

      {/* keeping the file safe and current */}
      <div className="noprint mt-7 grid gap-3 md:grid-cols-2">
        <section
          className={`flex flex-col gap-3 rounded-[28px] p-5 ${bState === "fresh" ? "bg-card" : "bg-gold-soft"}`}
          aria-label="النسخة الاحتياطية"
        >
          <div>
            <p className="font-bold">
              {bState === "fresh"
                ? "✓ النسخة الاحتياطية محدّثة"
                : bState === "stale"
                  ? "فيه تعديلات من بعد آخر نسخة"
                  : "النسخة الاحتياطية هي نسختك الحقيقية"}
            </p>
            <p className="text-sm text-muted-foreground">
              {backupAgeText(lastBackup)}. بيانات المتصفح ممكن تتمسح، فاحفظ النسخة في مكان آمن.
            </p>
          </div>
          <button
            className={`${bState === "fresh" ? "btn-outline" : "btn-primary"} btn-sm mt-auto self-start`}
            onClick={() => void backup()}
          >
            <Icon name="download" className="size-4" />
            نزّل نسخة احتياطية مشفّرة
          </button>
        </section>
        <section className="flex flex-col gap-3 rounded-[28px] bg-card p-5" aria-label="تذكير">
          <div>
            <p className="font-bold">فكّرني أراجع الملف</p>
            <p className="text-sm text-muted-foreground">
              موعد على تقويم موبايلك كل 6 شهور. من غير حساب ولا إيميل.
            </p>
          </div>
          <button
            className="btn-outline btn-sm mt-auto self-start"
            onClick={() => downloadBlob(buildReviewIcs(), "ohda-review.ics", "text/calendar")}
          >
            <Icon name="bell" className="size-4" />
            ضيفه للتقويم
          </button>
        </section>
      </div>

      <section className="noprint mt-7" aria-labelledby="events-title">
        <h2 id="events-title" className="text-xl font-bold">
          حصل تغيير؟
        </h2>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
          {LIFE_EVENTS.map((e) => (
            <button
              key={e.title}
              type="button"
              onClick={() => go({ s: e.section })}
              className="w-52 shrink-0 rounded-[22px] bg-card p-4 text-start transition-transform active:scale-[0.97]"
            >
              <span className="block font-semibold">{e.title}</span>
              <span className="mt-0.5 block text-[0.8125rem] leading-5 text-muted-foreground">
                {e.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="noprint mt-10">
        {!confirmDel ? (
          <button
            className="btn-ghost btn-sm text-destructive hover:bg-destructive/5"
            onClick={() => setConfirmDel(true)}
          >
            امسح الملف من الجهاز
          </button>
        ) : (
          <div className="panel" role="alert">
            <p className="font-semibold">
              متأكد؟ الملف هيتمسح من الجهاز ده نهائيًا. لو ما عندكش نسخة احتياطية مش هتقدر ترجّعه.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-danger btn-sm"
                onClick={async () => {
                  await v.destroy();
                  writeLastBackup(null);
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

      {toast && (
        <div
          role="status"
          className="anim-rise fixed inset-x-0 top-20 z-40 mx-auto flex w-max max-w-[92vw] items-center gap-3 rounded-full bg-ink py-2 ps-5 pe-2 text-sm font-semibold text-ink-foreground shadow-float"
        >
          <span className="truncate">{toast.text}</span>
          {toast.go && (
            <button
              className="shrink-0 rounded-full bg-gold px-3 py-1.5 text-accent-foreground"
              onClick={() => {
                const k = toast.go;
                setToast(null);
                if (k) go({ s: k });
              }}
            >
              كمّل التفاصيل
            </button>
          )}
        </div>
      )}

      {bar(
        <>
          <nav
            aria-label="ملفي"
            className="flex h-16 items-center justify-around rounded-full bg-card ps-2 pe-[4.75rem] shadow-float"
          >
            <span
              aria-current="page"
              className="grid min-w-14 justify-items-center text-[0.6875rem] leading-4 font-semibold text-primary"
            >
              <Icon name="home" />
              ملفي
            </span>
            <button
              type="button"
              onClick={() => go({ v: "preview" })}
              className="grid min-h-12 min-w-14 justify-items-center text-[0.6875rem] leading-4 text-muted-foreground hover:text-foreground"
            >
              <Icon name="eye" />
              زي أهلك
            </button>
            <button
              type="button"
              onClick={() => void backup()}
              className="grid min-h-12 min-w-14 justify-items-center text-[0.6875rem] leading-4 text-muted-foreground hover:text-foreground"
            >
              <Icon name="download" />
              نسخة
            </button>
            <Link
              to="/handover"
              className="grid min-h-12 min-w-14 content-center justify-items-center text-[0.6875rem] leading-4 text-muted-foreground hover:text-foreground"
            >
              <Icon name="send" />
              سلّم أهلك
            </Link>
          </nav>
          <QuickAdd
            plan={p}
            onOpenSection={(k) => go({ s: k })}
            onAdd={(t, value) => {
              u((x) => quickAdd(x, t, value, MAX_ROWS));
              if (group !== "all" && group !== SECTION_GROUP[t.list]) setGroup("all");
              setBumped(t.list);
              setTimeout(() => setBumped(null), 700);
              setToast({
                text: `اتضاف «${value.trim()}» في ${SECTION_LABELS[t.list]}`,
                go: t.list,
              });
            }}
          />
        </>,
      )}
    </Page>
  );
}
