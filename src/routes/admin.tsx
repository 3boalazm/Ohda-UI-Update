import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Page } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "الإدارة | عُهدة" },
      { name: "description", content: "لوحة إدارة أكواد التفعيل." },
      { property: "og:title", content: "الإدارة | عُهدة" },
      { property: "og:description", content: "لوحة إدارة أكواد التفعيل." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    setup: s["setup"] === "1" || s["setup"] === 1 ? 1 : undefined,
  }),
  component: Admin,
});

const ALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function genCode(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const s = Array.from(b, (x) => ALPH[x & 31]).join("");
  return "OHDA-" + s.match(/.{4}/g)!.join("-");
}
async function sha256Hex(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("");
}
const norm = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

type Status = { is_admin: boolean; aal: string };

function Admin() {
  const { setup } = Route.useSearch();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => data.subscription.unsubscribe();
  }, []);
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_admin_status");
    setStatus(error ? { is_admin: false, aal: "aal1" } : (data as Status));
  }, []);
  useEffect(() => {
    if (!session) {
      setStatus(null);
      return;
    }
    void refresh();
  }, [session, refresh]);

  if (session === undefined) return null;
  if (!session)
    return (
      <Page narrow>
        <Login setup={!!setup} />
      </Page>
    );
  if (status === null)
    return (
      <Page narrow>
        <p>…</p>
      </Page>
    );
  const signOut = (
    <button className="btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>
      خروج
    </button>
  );
  if (!status.is_admin)
    return (
      <Page narrow>
        <p className="panel">غير مصرح</p>
        <div className="mt-3">{signOut}</div>
      </Page>
    );
  if (status.aal !== "aal2")
    return (
      <Page narrow>
        <Mfa
          onDone={async () => {
            await supabase.auth.refreshSession();
            await refresh();
          }}
        />
        <div className="mt-3">{signOut}</div>
      </Page>
    );
  return (
    <Page>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">الإدارة</h1>
        {signOut}
      </div>
      <Codes />
      <Audit />
    </Page>
  );
}

/** TOTP second factor: enroll once (QR), then a 6-digit challenge on every login. */
function Mfa({ onDone }: { onDone: () => Promise<void> }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setErr("ما قدرناش نقرا عوامل التحقق.");
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setFactorId(verified.id);
      // clean up half-finished enrolments, then start a new one
      for (const f of data.all.filter((x) => x.status !== "verified"))
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      const en = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "ohda-admin" });
      if (en.error) return setErr("ما قدرناش نبدأ تفعيل التحقق الثنائي.");
      setFactorId(en.data.id);
      setQr(en.data.totp.qr_code);
      setSecret(en.data.totp.secret);
    })();
  }, []);

  return (
    <form
      className="panel space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!factorId || !/^\d{6}$/.test(code)) return setErr("اكتب الـ 6 أرقام.");
        setBusy(true);
        setErr("");
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
        setBusy(false);
        if (error) return setErr("الكود غلط أو انتهى. جرّب الكود اللي بعده.");
        await onDone();
      }}
    >
      <h1 className="text-xl font-bold">التحقق الثنائي</h1>
      {qr ? (
        <>
          <p className="text-sm">
            امسح الكود ده بتطبيق مصادقة (Google Authenticator أو 1Password أو Authy) مرة واحدة.
          </p>
          <img src={qr} alt="QR للتحقق الثنائي" className="mx-auto h-48 w-48 bg-white p-2" />
          {secret && (
            <p className="break-all text-center font-mono text-xs" dir="ltr">
              {secret}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm">اكتب الكود من تطبيق المصادقة.</p>
      )}
      <input
        className="field text-center font-mono text-lg"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        dir="ltr"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <button className="btn-primary w-full" disabled={busy || !factorId}>
        تأكيد
      </button>
      {err && (
        <p role="alert" className="err-text">
          {err}
        </p>
      )}
    </form>
  );
}

function Audit() {
  type A = { id: number; at: string; action: string; target: string | null };
  const [rows, setRows] = useState<A[]>([]);
  useEffect(() => {
    void supabase
      .from("audit_log")
      .select("id, at, action, target")
      .order("id", { ascending: false })
      .limit(50)
      .then(({ data }) => setRows((data as A[]) ?? []));
  }, []);
  return (
    <section className="panel mt-5 overflow-x-auto">
      <h2 className="mb-2 font-bold">سجل العمليات (آخر 50)</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-2" dir="ltr">
                {r.at.slice(0, 19).replace("T", " ")}
              </td>
              <td className="p-2 font-mono">{r.action}</td>
              <td className="p-2 font-mono" dir="ltr">
                {r.target}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Login({ setup }: { setup: boolean }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  return (
    <form
      className="panel space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("");
        if (mode === "in") {
          const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
          if (error) setMsg("بيانات الدخول غلط.");
        } else {
          const { error } = await supabase.auth.signUp({
            email,
            password: pw,
            options: { emailRedirectTo: `${window.location.origin}/admin` },
          });
          setMsg(error ? error.message : "اتبعت إيميل تأكيد. أكّد وارجع سجّل دخول.");
        }
      }}
    >
      <h1 className="text-xl font-bold">{mode === "in" ? "دخول الإدارة" : "إنشاء حساب إدارة"}</h1>
      <input
        className="field"
        type="email"
        dir="ltr"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="field"
        type="password"
        dir="ltr"
        placeholder="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <button className="btn-primary w-full">{mode === "in" ? "دخول" : "إنشاء"}</button>
      {setup && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "إنشاء حساب" : "عندي حساب"}
        </button>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </form>
  );
}

type Row = {
  id: string;
  ref: string | null;
  plan: string;
  uses: number;
  max_uses: number;
  note: string | null;
  created_at: string | null;
};

function Codes() {
  const [plan, setPlan] = useState<"single" | "family">("single");
  const [n, setN] = useState(1);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("activation_codes")
      .select("id, ref, plan, uses, max_uses, note, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data as Row[]) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setErr("");
    const count = plan === "family" ? n * 3 : n;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const c = genCode();
      const { error } = await supabase.rpc("admin_create_code", {
        p_hash: await sha256Hex(norm(c)),
        p_plan: plan,
        p_max_uses: 2,
        p_note: note,
      });
      if (error) {
        setErr(error.message);
        break;
      }
      out.push(c);
    }
    setFresh(out);
    setNote("");
    void load();
  }

  const waMsg = (c: string) => `كود تفعيل عُهدة: ${c} — ادخل على ohda.codeandcanvas.net/activate`;

  return (
    <div className="space-y-5">
      <section className="panel space-y-3">
        <h2 className="font-bold">أكواد جديدة</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1">
            <input type="radio" checked={plan === "single"} onChange={() => setPlan("single")} />{" "}
            فردي (2 استخدام)
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={plan === "family"} onChange={() => setPlan("family")} />{" "}
            عيلة (3 أكواد × 2 استخدام)
          </label>
        </div>
        <label className="block">
          <span className="field-label">العدد</span>
          <input
            type="number"
            min={1}
            max={20}
            className="field w-28"
            value={n}
            onChange={(e) => setN(Math.max(1, Math.min(20, +e.target.value || 1)))}
          />
        </label>
        <label className="block">
          <span className="field-label">ملاحظة (اختياري)</span>
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="text-xs text-muted-foreground">
            ما تكتبش اسم أو رقم العميل، رقم العملية بس
          </span>
        </label>
        <button className="btn-primary" onClick={create}>
          اعمل الأكواد
        </button>
        {err && (
          <p role="alert" className="err-text">
            {err}
          </p>
        )}
        {fresh.length > 0 && (
          <div className="space-y-2">
            <p className="warn">الأكواد دي مش هتظهر تاني.</p>
            {fresh.map((c) => (
              <div key={c} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2">
                <code dir="ltr" className="font-mono font-bold">
                  {c}
                </code>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => navigator.clipboard.writeText(c)}
                >
                  انسخ
                </button>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => navigator.clipboard.writeText(waMsg(c))}
                >
                  انسخ رسالة واتساب
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel overflow-x-auto">
        <h2 className="mb-2 font-bold">الأكواد</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="p-2 text-right">ref</th>
              <th className="p-2 text-right">الباقة</th>
              <th className="p-2 text-right">استخدام</th>
              <th className="p-2 text-right">ملاحظة</th>
              <th className="p-2 text-right">التاريخ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 font-mono" dir="ltr">
                  {r.ref ?? "—"}
                </td>
                <td className="p-2">{r.plan}</td>
                <td className="p-2">
                  {r.uses}/{r.max_uses}
                </td>
                <td className="p-2">{r.note}</td>
                <td className="p-2">{r.created_at?.slice(0, 10)}</td>
                <td className="p-2">
                  {r.uses < r.max_uses && (
                    <button
                      className="btn-danger btn-sm"
                      onClick={async () => {
                        if (!r.ref) return;
                        const { error } = await supabase.rpc("admin_revoke_code", { p_ref: r.ref });
                        if (error) setErr("ما اتلغاش: " + error.message);
                        void load();
                      }}
                    >
                      إلغاء
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
