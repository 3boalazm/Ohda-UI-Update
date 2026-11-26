import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Page, meta } from "@/components/Brand";
import { FilePicker, PasswordInput, StrengthMeter } from "@/components/Kit";
import {
  makePassWrap,
  newDataKey,
  passphraseProblem,
  sealContent,
  unlockWithPassphrase,
  validateEnvelope,
  type Bytes,
  type OhdaEnvelope,
} from "@/lib/ohdaCrypto";
import {
  emptyPlan,
  loadPrevious,
  loadVault,
  loadVaultRev,
  readLimited,
  saveVault,
} from "@/lib/plan";
import { upgradeOnUnlock } from "@/lib/upgrade";
import { claimVault, useVault } from "@/lib/vault";
import { OwnershipBusyError, acquireOwnership, type Ownership } from "@/lib/ownership";

export const Route = createFileRoute("/start")({
  head: () => meta("ملفي | عُهدة", "افتح ملفك المشفّر أو ابدأ ملف جديد على جهازك.", "/start"),
  component: Start,
});

function Start() {
  const nav = useNavigate();
  const vault = useVault();
  const [env, setEnv] = useState<OhdaEnvelope | null | undefined>(undefined);
  const [imported, setImported] = useState<OhdaEnvelope | null>(null);
  const [err, setErr] = useState("");
  const [hasPrevious, setHasPrevious] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  useEffect(() => {
    if (vault.session) {
      nav({ to: "/file" });
      return;
    }
    loadVault()
      .then(setEnv)
      .catch(() => setEnv(null));
    loadPrevious()
      .then((p) => setHasPrevious(!!p))
      .catch(() => setHasPrevious(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Swap the current file with the one replaced by the last import (fenced, under ownership). */
  async function restorePrevious() {
    setRestoreMsg("");
    let own: Ownership | null = null;
    try {
      await claimVault();
      own = await acquireOwnership({ waitMs: 5000 });
      const prev = await loadPrevious();
      if (!prev) throw new Error("مفيش نسخة سابقة.");
      if (!own.held()) throw new OwnershipBusyError();
      await saveVault(prev, own.fence, { keepPrevious: true });
      setEnv(prev);
      setRestoreMsg(
        "رجّعنا الملف اللي كان قبل الاستيراد. النسخة اللي كانت مفتوحة بقت هي النسخة السابقة.",
      );
    } catch (x) {
      setRestoreMsg(x instanceof Error ? x.message : "ما قدرناش نرجّع النسخة السابقة.");
    } finally {
      own?.release();
    }
  }

  async function onImport(f: File) {
    setErr("");
    try {
      const e = validateEnvelope(JSON.parse(await readLimited(f)));
      if (e.kind !== "owner")
        throw new Error("ده ملف أهل، مش نسخة احتياطية. افتحه من صفحة «افتح ملف أهلك».");
      setImported(e);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "الملف مش صالح");
    }
  }

  const target = imported ?? env;
  return (
    <Page narrow>
      {env === undefined ? (
        <p className="text-muted-foreground">جاري التحميل…</p>
      ) : target ? (
        <Unlock
          isImport={!!imported}
          replaces={!!imported && !!env}
          onUnlock={async (pass, steal) => {
            // 1) exclusive ownership first: no other tab can write while we read, upgrade, edit
            if (!steal) await claimVault();
            const own = await acquireOwnership({ steal, waitMs: 5000 });
            let dk: Bytes | null = null;
            let newKey: Bytes | null = null;
            try {
              // 2) read the newest version from disk while holding ownership
              let rev = own.fence.rev; // read under ownership at claim time
              const source = imported ?? (await loadVault());
              if (!source) throw new Error("مفيش ملف على الجهاز ده.");
              const r = await unlockWithPassphrase(source, pass);
              dk = r.dk;
              const u = await upgradeOnUnlock(source, r.dk, r.content, pass);
              if (u.dk !== r.dk) newKey = u.dk;
              // 3) every write is fenced by the revision we read under ownership
              // re-check ownership after the slow key derivation, right before writing
              if ((u.changed || imported) && !own.held()) throw new OwnershipBusyError();
              const fence = { rev, epoch: own.fence.epoch };
              if (u.changed) rev = await saveVault(u.env, fence, { keepPrevious: !!imported });
              else if (imported) rev = await saveVault(imported, fence, { keepPrevious: true });
              if (newKey) dk.fill(0); // old key retired only after the upgrade was saved
              if (!own.held()) throw new OwnershipBusyError(); // stolen during key derivation
              vault.open(u.dk, u.env, u.plan, rev, own);
              dk = null;
              newKey = null;
              nav({ to: "/file" });
            } catch (e) {
              dk?.fill(0);
              newKey?.fill(0);
              own.release();
              throw e;
            }
          }}
          onCancel={imported ? () => setImported(null) : undefined}
        />
      ) : (
        <Create
          onDone={(dk, e, p, rev, own) => {
            vault.open(dk, e, p, rev, own);
            nav({ to: "/file" });
          }}
        />
      )}

      {!imported && (
        <div className="panel mt-6">
          <h2 className="text-lg font-bold">عندي نسخة احتياطية</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ارفع ملف ‎.ohda‎ اللي نزّلته قبل كده، وافتحه بكلمة السر.
            {env ? " ده هيستبدل الملف الحالي على الجهاز بعد ما تفتحه." : ""}
          </p>
          <div className="mt-3">
            <FilePicker
              label="اختار ملف النسخة الاحتياطية"
              accept=".ohda,application/json"
              onFile={(f) => void onImport(f)}
            />
          </div>
          {err && (
            <p role="alert" className="err-text mt-2">
              {err}
            </p>
          )}
        </div>
      )}
      {!imported && hasPrevious && env && (
        <div className="panel mt-4">
          <p className="text-sm">
            استوردت نسخة احتياطية قبل كده؟ الملف اللي كان على الجهاز قبلها لسه محفوظ (مشفّر).
          </p>
          <button className="btn-outline btn-sm mt-2" onClick={() => void restorePrevious()}>
            رجّع الملف اللي كان قبل آخر استيراد
          </button>
          {restoreMsg && (
            <p className="mt-2 text-sm" role="status">
              {restoreMsg}
            </p>
          )}
        </div>
      )}
      <p className="warn mt-6">
        بيانات المتصفح ممكن تتمسح (تنظيف، تغيير موبايل، وضع التصفح الخفي). النسخة الاحتياطية
        المشفّرة هي نسختك الحقيقية — نزّلها واحفظها في مكان آمن.
      </p>
    </Page>
  );
}

function Unlock({
  isImport,
  replaces,
  onUnlock,
  onCancel,
}: {
  isImport: boolean;
  replaces: boolean;
  onUnlock: (passphrase: string, steal: boolean) => Promise<void>;
  onCancel?: (() => void) | undefined;
}) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [busyElsewhere, setBusyElsewhere] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  async function run(steal: boolean) {
    if (replaces && !confirmReplace)
      return setErr("أكّد الأول إنك عايز تستبدل الملف اللي على الجهاز.");
    setBusy(true);
    setErr("");
    try {
      await onUnlock(pass, steal);
      setPass("");
    } catch (x) {
      if (x instanceof OwnershipBusyError) setBusyElsewhere(true);
      setErr(x instanceof Error ? x.message : "حصلت مشكلة");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        void run(false);
      }}
    >
      <h1 className="text-[1.75rem] font-bold">
        {isImport ? "افتح النسخة الاحتياطية" : "افتح ملفك"}
      </h1>
      <p className="mt-1 text-muted-foreground">الملف متشفّر على الجهاز ده. اكتب كلمة السر.</p>
      <label className="field-label mt-4" htmlFor="pw">
        كلمة السر
      </label>
      <PasswordInput
        id="pw"
        value={pass}
        onChange={setPass}
        autoComplete="current-password"
        autoFocus
      />
      {err && (
        <p role="alert" className="err-text mt-2">
          {err}
        </p>
      )}
      {replaces && (
        <label className="warn mt-3 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmReplace}
            onChange={(e) => setConfirmReplace(e.target.checked)}
          />
          <span>
            فاهم إن النسخة دي هتستبدل الملف اللي على الجهاز. الملف الحالي هيتحفظ كنسخة سابقة وتقدر
            ترجّعه من الصفحة دي.
          </span>
        </label>
      )}
      {busyElsewhere && (
        <div className="warn mt-2">
          <p>
            لو الشاشة التانية مش معاك أو مقفولة، تقدر تفتحه هنا. أي تعديل مش محفوظ هناك مش هيتكتب
            فوق الملف.
          </p>
          <button
            type="button"
            className="btn-outline btn-sm mt-2"
            disabled={busy || !pass}
            onClick={() => void run(true)}
          >
            افتحه هنا على أي حال
          </button>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary flex-1" disabled={busy || !pass}>
          {busy ? "بيفتح…" : "افتح"}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            إلغاء
          </button>
        )}
      </div>
    </form>
  );
}

function Create({
  onDone,
}: {
  onDone: (
    dk: Bytes,
    e: OhdaEnvelope,
    p: ReturnType<typeof emptyPlan>,
    rev: number,
    own: Ownership,
  ) => void;
}) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // zxcvbn dictionaries are large: load them only on this screen
  const [assess, setAssess] = useState<
    typeof import("@/lib/passwordStrength").assessPassphrase | null
  >(null);
  useEffect(() => {
    void import("@/lib/passwordStrength").then((m) => setAssess(() => m.assessPassphrase));
  }, []);
  const check = (p: string): string | null => {
    const basic = passphraseProblem(p);
    if (basic) return basic;
    if (!assess) return null;
    const r = assess(p);
    return r.ok ? null : r.message;
  };
  const problem = p1 ? check(p1) : null;
  // UI only: the same rules as `check`, shown as a 0-4 bar
  const strength = p1 && assess && !passphraseProblem(p1) ? assess(p1) : null;
  const level = (!p1 ? 0 : !strength ? 1 : Math.max(1, strength.score)) as 0 | 1 | 2 | 3 | 4;
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        if (!assess) return setErr("لحظة، بنجهّز فحص قوة كلمة السر…");
        const pr = check(p1);
        if (pr) return setErr(pr);
        if (p1 !== p2) return setErr("كلمتين السر مش زي بعض.");
        if (!ok) return setErr("لازم توافق على الملاحظة الأخيرة.");
        setBusy(true);
        let own: Ownership | null = null;
        const dk = newDataKey();
        try {
          await claimVault();
          own = await acquireOwnership({ waitMs: 5000 });
          // never overwrite an existing file from the "new file" screen
          if (await loadVault())
            throw new Error("في ملف موجود على الجهاز ده. افتحه بدل ما تعمل جديد.");
          const wraps = [await makePassWrap(dk, p1)];
          const plan = emptyPlan();
          const env = await sealContent(dk, plan, "owner", wraps);
          if (!own.held()) throw new OwnershipBusyError();
          const rev = await saveVault(env, own.fence);
          setP1("");
          setP2("");
          onDone(dk, env, plan, rev, own);
        } catch (x) {
          dk.fill(0);
          own?.release();
          setErr(
            x instanceof OwnershipBusyError ||
              (x instanceof Error && x.message.startsWith("في ملف"))
              ? x.message
              : "حصلت مشكلة في الحفظ على الجهاز.",
          );
          setBusy(false);
        }
      }}
    >
      <h1 className="text-[1.75rem] font-bold">ابدأ ملفك</h1>
      <p className="mt-1 text-muted-foreground">
        اختار كلمة سر طويلة — جملة قصيرة تفتكرها أحسن من كلمة معقدة. هي اللي بتشفّر ملفك على جهازك.
      </p>
      <label className="field-label mt-4" htmlFor="p1">
        كلمة السر (12 حرف على الأقل)
      </label>
      <PasswordInput
        id="p1"
        value={p1}
        onChange={setP1}
        autoComplete="new-password"
        describedBy="p1-hint"
      />
      <StrengthMeter level={level} />
      <p id="p1-hint" className="field-hint" aria-live="polite">
        {problem ??
          (p1 && strength
            ? strength.message
            : "مثلًا: 4 كلمات مش مرتبطة ببعض، بالعربي أو بالإنجليزي.")}
      </p>
      <label className="field-label mt-4" htmlFor="p2">
        اكتبها تاني
      </label>
      <PasswordInput id="p2" value={p2} onChange={setP2} autoComplete="new-password" />
      {p2 && p1 !== p2 && <p className="field-hint">لسه مش زي الأولى.</p>}
      <div className="mt-5 flex items-start gap-3 rounded-lg bg-gold-soft p-3.5">
        <input
          id="ack"
          type="checkbox"
          className="mt-1"
          checked={ok}
          onChange={(e) => setOk(e.target.checked)}
        />
        <label htmlFor="ack" className="text-[0.9375rem]">
          فاهم إن لو نسيت كلمة السر محدش يقدر يرجّع الملف، ولا حتى عُهدة.
        </label>
      </div>
      {err && (
        <p role="alert" className="err-text mt-3">
          {err}
        </p>
      )}
      <button className="btn-primary mt-5 w-full" disabled={busy}>
        {busy ? "بيجهّز الملف…" : "اعمل ملفي"}
      </button>
    </form>
  );
}
