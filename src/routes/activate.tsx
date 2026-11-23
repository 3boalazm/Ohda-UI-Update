import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Page, meta } from "@/components/Brand";
import { redeemActivation } from "@/lib/activation.functions";
import { DEMO, DEMO_CODES, demoRedeem, writeDemoActivation } from "@/lib/demo";
import { bundledPins } from "@/lib/entitlementKey";
import { normalizeCode, randomBytes, toB64 } from "@/lib/ohdaCrypto";
import { getActivation, storeActivation, type Activation } from "@/lib/plan";
import { ORDER_WHATSAPP, PLAN_NAME, SELLER_LINE, priceLabel } from "@/lib/pricing";

export const Route = createFileRoute("/activate")({
  head: () =>
    meta(
      "التفعيل | عُهدة",
      "فعّل تسليم الأهل في عُهدة: فردي 99 جنيه في مصر أو 5 دولار من برّه مصر، باقة العيلة 199 جنيه أو 10 دولار، مرة واحدة.",
      "/activate",
    ),
  component: Activate,
});

const reasonText = (reason: string) =>
  reason === "used"
    ? "الكود ده اتستخدم قبل كده للحد الأقصى."
    : reason === "rate_limited"
      ? "محاولات كتير. استنى ساعة وجرّب تاني."
      : reason === "unavailable"
        ? "الخدمة مش متاحة دلوقتي. الكود ما اتحسبش — جرّب تاني بعد شوية."
        : reason === "update_required"
          ? "فيه نسخة أحدث من الموقع. اعمل تحديث للصفحة (Reload) وجرّب نفس الكود — ما اتحسبش."
          : "الكود ده مش صحيح. راجعه تاني.";

const wa = (pkg: string, from: string, price: string) =>
  `https://wa.me/${ORDER_WHATSAPP}?text=${encodeURIComponent(`عايز أفعّل عُهدة — باقة: ${pkg} — من: ${from} — السعر: ${price}`)}`;

function Activate() {
  const [act, setAct] = useState<Activation | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getActivation().then(setAct);
  }, []);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    if (DEMO) {
      await new Promise((res) => setTimeout(res, 600)); // feel of a network round trip
      const d = demoRedeem(code);
      setBusy(false);
      if (!d.ok) return setErr(reasonText(d.reason));
      writeDemoActivation(d.activation);
      setAct(d.activation);
      setCode("");
      return;
    }
    let r: Awaited<ReturnType<typeof redeemActivation>> | null = null;
    // One request id per code, reused on retry: a lost response never costs another use.
    const slot = "ohda-redeem-req:" + normalizeCode(code);
    let requestId = "";
    try {
      requestId = localStorage.getItem(slot) ?? "";
    } catch {
      /* storage blocked: a fresh id still works, just without replay protection */
    }
    if (!requestId) {
      requestId = toB64(randomBytes(18)).replace(/\+/g, "-").replace(/\//g, "_");
      try {
        localStorage.setItem(slot, requestId);
      } catch {
        /* ignore */
      }
    }
    for (let attempt = 0; attempt < 3 && !r; attempt++) {
      try {
        r = await redeemActivation({ data: { code, requestId, pins: bundledPins() } });
      } catch {
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
    }

    setBusy(false);
    if (!r) return setErr("مقدرناش نتأكد من الكود دلوقتي. جرّب تاني بعد شوية.");
    if (!r.ok) return setErr(reasonText(r.reason));
    const a = await storeActivation(r.token, { kid: r.kid, publicKey: r.publicKey });
    // keep the retry id until the entitlement is stored and verified: a retry then replays the
    // same redemption instead of consuming another use
    if (!a)
      return setErr(
        "اتفعّل، بس ما قدرناش نحفظه على المتصفح ده. اسمح بالتخزين وجرّب نفس الكود تاني — مش هيتحسب مرة تانية.",
      );
    try {
      localStorage.removeItem(slot);
    } catch {
      /* ignore */
    }
    setAct(a);
    setCode("");
  }

  return (
    <Page narrow>
      <h1 className="text-2xl font-bold">التفعيل</h1>
      {act && (
        <div className="notice mt-4">
          <p className="font-semibold">
            عُهدة متفعّلة على الجهاز ده ✓ ({act.plan === "family" ? "باقة العيلة" : "فردي"})
          </p>
          <Link to="/handover" className="btn-primary btn-sm mt-3">
            روح لسلّم أهلك
          </Link>
          {DEMO && (
            <button
              type="button"
              className="btn-ghost btn-sm mt-3 ms-2"
              onClick={() => {
                writeDemoActivation(null);
                setAct(null);
              }}
            >
              ألغِ التفعيل التجريبي
            </button>
          )}
        </div>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="panel">
          <h2 className="font-bold">فردي</h2>
          <p className="mt-1 text-xl font-bold text-primary">{priceLabel("single", "EG")}</p>
          <p className="text-sm font-semibold">{priceLabel("single", "INTL")} من برّه مصر</p>
          <p className="text-sm text-muted-foreground">مرة واحدة</p>
        </div>
        <div className="panel border-gold">
          <h2 className="font-bold">باقة العيلة</h2>
          <p className="mt-1 text-xl font-bold text-primary">{priceLabel("family", "EG")}</p>
          <p className="text-sm font-semibold">{priceLabel("family", "INTL")} من برّه مصر</p>
          <p className="text-sm text-muted-foreground">3 أكواد — مرة واحدة</p>
        </div>
      </div>
      <p className="mt-4">
        <b>بيشمل:</b> تسليم الأهل، الكروت المطبوعة، تقسيم الكود، تجربة الفتح، وتحديثات بلا حدود.
      </p>

      <section className="panel mt-5">
        <h2 className="font-bold">تدفع إزاي؟</h2>
        <p className="mt-2 text-muted-foreground">
          في الفترة التجريبية بنرد ونبعتلك طريقة الدفع وكود التفعيل يدويًا في خلال ساعات.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(["single", "family"] as const).flatMap((p) =>
            (["EG", "INTL"] as const).map((m) => (
              <a
                key={p + m}
                className={p === "single" ? "btn-primary btn-sm" : "btn-outline btn-sm"}
                target="_blank"
                rel="noreferrer"
                href={wa(PLAN_NAME[p], m === "EG" ? "مصر" : "برّه مصر", priceLabel(p, m))}
              >
                {PLAN_NAME[p]} — {m === "EG" ? "من مصر" : "من برّه مصر"} ({priceLabel(p, m)})
              </a>
            )),
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{SELLER_LINE}</p>
      </section>

      <form className="panel mt-5" onSubmit={redeem}>
        <label className="block">
          <span className="field-label">عندك كود تفعيل؟</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="OHDA-XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {err && (
          <p role="alert" className="err-text mt-2">
            {err}
          </p>
        )}
        <button className="btn-primary mt-3 w-full" disabled={busy || code.trim().length < 10}>
          {busy ? "بيتأكد…" : "فعّل"}
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          الكود بس هو اللي بيتبعت للتأكد منه — ولا حاجة من ملفك.
        </p>
        {DEMO && (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>أكواد تجريبية:</p>
            {(
              [
                [DEMO_CODES.single, "فردي"],
                [DEMO_CODES.family, "باقة العيلة"],
                [DEMO_CODES.used, "كود مستخدم (رسالة خطأ)"],
              ] as const
            ).map(([c, label]) => (
              <button
                key={c}
                type="button"
                className="block font-mono underline"
                dir="ltr"
                onClick={() => setCode(c)}
              >
                {c} — {label}
              </button>
            ))}
          </div>
        )}
      </form>
    </Page>
  );
}
