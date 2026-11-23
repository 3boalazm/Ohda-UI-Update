import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Page, meta } from "@/components/Brand";
import { Area, Field, NeedUnlock } from "@/components/Fields";
import { PlanView } from "@/components/PlanView";
import { MAX_ROWS, completion, downloadBlob, familyCopy, today, type Plan } from "@/lib/plan";
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
}: {
  plan: Plan;
  list: ListKey;
  cols: ColDef[];
  upd: (fn: (p: Plan) => Plan) => void;
  addLabel: string;
}) {
  const rows = plan[list] as unknown as Record<string, string>[];
  const set = (i: number, k: string, v: string) =>
    upd((p) => ({
      ...p,
      [list]: (p[list] as unknown as Record<string, string>[]).map((r, j) =>
        j === i ? { ...r, [k]: v } : r,
      ),
    }));
  return (
    <div className="space-y-4">
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-border bg-background p-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
          <button
            className="btn-ghost btn-sm mt-2 text-destructive"
            onClick={() =>
              upd((p) => ({ ...p, [list]: (p[list] as unknown[]).filter((_, j) => j !== i) }))
            }
          >
            شيل ده
          </button>
        </div>
      ))}
      <button
        className="btn-outline btn-sm"
        disabled={rows.length >= MAX_ROWS}
        onClick={() =>
          upd((p) => ({
            ...p,
            [list]: [...(p[list] as unknown[]), Object.fromEntries(cols.map((c) => [c.k, ""]))],
          }))
        }
      >
        + {addLabel}
      </button>
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
  if (!v.session)
    return (
      <Page narrow>
        <NeedUnlock />
      </Page>
    );
  const p = v.session.plan;
  const u = v.update;
  const pct = completion(p);
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
    return true;
  }

  const body = [
    <div key={0} className="grid gap-3 sm:grid-cols-2">
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
      cols={[
        { k: "name", l: "الاسم" },
        { k: "relation", l: "الصلة", ph: "أخ، زميل، صاحب…" },
        { k: "phone", l: "الرقم" },
        { k: "note", l: "ليه تكلموه", ph: "عارف حاجات الشغل" },
      ]}
    />,
    <div key={3} className="grid gap-3 sm:grid-cols-2">
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
      <div className="sm:col-span-2">
        <Area label="ملاحظات" rows={3} value={p.work.notes} onChange={setWork("notes")} />
      </div>
    </div>,
    <Rows
      key={4}
      plan={p}
      upd={u}
      list="banks"
      addLabel="ضيف بنك"
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
      addLabel="ضيف"
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
      addLabel="ضيف"
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

  if (preview)
    return (
      <Page narrow>
        <div className="noprint mb-4 flex items-center justify-between gap-2">
          <p className="font-semibold">كده أهلك هيشوفوا الملف</p>
          <button className="btn-outline btn-sm" onClick={() => setPreview(false)}>
            ارجع للتعديل
          </button>
        </div>
        <PlanView plan={familyCopy(p)} />
      </Page>
    );

  return (
    <Page>
      <div className="noprint mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ملفي</h1>
          <p className="text-sm text-primary" role="status" aria-live="polite">
            {v.status === "saving"
              ? "بيتحفظ…"
              : v.status === "error"
                ? "ما اتحفظش على الجهاز — نزّل نسخة احتياطية دلوقتي عشان ما يضيعش حاجة"
                : v.status === "conflict"
                  ? "الملف اتفتح واتعدّل في شاشة تانية. نزّل نسخة احتياطية من اللي هنا، وبعدين افتح الملف من جديد."
                  : "اتحفظ مشفّر على جهازك ✓"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" onClick={() => setPreview(true)}>
            شوفه زي أهلك
          </button>
          <button className="btn-outline btn-sm" onClick={backup}>
            نزّل نسخة احتياطية مشفّرة
          </button>
          <Link to="/handover" className="btn-primary btn-sm">
            سلّم أهلك
          </Link>
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
      {lockProblem && (
        <div className="warn noprint mb-5 space-y-2" role="alert">
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
      <div className="mb-5">
        <div className="flex justify-between text-sm">
          <span>اكتمال الملف</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`shrink-0 rounded-lg px-3 py-2 text-right text-sm ${i === step ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}
            >
              {i + 1}. {s}
            </button>
          ))}
        </nav>
        <section className="panel">
          <h2 className="mb-4 text-xl font-bold text-primary">{SECTIONS[step]}</h2>
          {body[step]}
          <div className="mt-6 flex justify-between">
            <button
              className="btn-ghost btn-sm"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              السابق
            </button>
            {step < SECTIONS.length - 1 ? (
              <button className="btn-primary btn-sm" onClick={() => setStep(step + 1)}>
                التالي
              </button>
            ) : (
              <Link to="/handover" className="btn-primary btn-sm">
                سلّم أهلك
              </Link>
            )}
          </div>
        </section>
      </div>
      <p className="warn mt-6">
        بيانات المتصفح ممكن تتمسح. النسخة الاحتياطية المشفّرة هي نسختك الحقيقية — نزّلها بعد كل
        تعديل مهم.
      </p>
      <div className="mt-6">
        {!confirmDel ? (
          <button className="btn-danger btn-sm" onClick={() => setConfirmDel(true)}>
            امسح الملف من الجهاز
          </button>
        ) : (
          <div className="panel border-destructive">
            <p className="font-semibold">
              متأكد؟ الملف هيتمسح من الجهاز ده نهائيًا. لو ما عندكش نسخة احتياطية مش هتقدر ترجّعه.
            </p>
            <div className="mt-3 flex gap-2">
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
                لأ
              </button>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
