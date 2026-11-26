import { priceLabel } from "@/lib/pricing";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, meta } from "@/components/Brand";

export const Route = createFileRoute("/")({
  head: () =>
    meta(
      "عُهدة | ملف أهلك لو غبت فجأة",
      "لو غبت فجأة… أهلك يعرفوا يبدأوا منين؟ جهّز ملف مشفّر لأهلك في 10 دقايق، على جهازك ومن غير حساب.",
      "/",
    ),
  component: Landing,
});

const scenarios = [
  {
    t: "حادثة أو مستشفى",
    d: "أهلك يعرفوا يكلموا مين في الشغل، وفين التأمين الطبي، ومين قريب منك هناك.",
  },
  { t: "رجوع مفاجئ لمصر", d: "حسابات، عقد إيجار، عربية، فلوس عند ناس — كل ده مكتوب في مكان واحد." },
  { t: "وفاة", d: "بدل ما يدوّروا شهور، يبدأوا من خطوات انت كاتبها بنفسك." },
];
const faq = [
  [
    "هل ده وصية؟",
    "لا. ده دليل عملي يساعد أهلك يبدأوا. لو عايز وصية شرعية أو رسمية اعملها عند الجهة المختصة.",
  ],
  [
    "هل تقدروا تشوفوا ملفي؟",
    "لا. الملف بيتشفّر على جهازك قبل ما يتحفظ، وإحنا ما بنستلمش منه أي حاجة.",
  ],
  [
    "لو نسيت كلمة السر؟",
    "مفيش استرجاع. ده التمن الطبيعي للخصوصية الكاملة — اختار جملة تفتكرها واحتفظ بنسخة احتياطية.",
  ],
  ["لو الموقع قفل؟", "ملف الأهل ملف HTML مستقل بيفتح في المتصفح من غير الموقع، بالكود المطبوع بس."],
  [
    "أدفع إزاي؟",
    "في الفترة التجريبية بتكلمنا على واتساب، وبنبعتلك رابط دفع وكود التفعيل. الدفع دايمًا لشركة Code & Canvas في مصر: بالجنيه لو إنت في مصر، وبالدولار لو برّه مصر.",
  ],
];

function Landing() {
  return (
    <>
      <div className="mx-auto max-w-5xl px-3 pt-3 sm:px-4">
        <section className="color-screen rounded-[36px] px-6 py-12 sm:px-12 sm:py-20">
          <span
            aria-hidden="true"
            className="absolute -end-20 -top-24 size-80 rounded-full border-[52px] border-white/[0.06]"
          />
          <div className="relative">
            <p className="text-sm font-semibold text-gold-light">ملف لأهلك، مشفّر على جهازك</p>
            <h1 className="mt-3 text-[2rem] leading-tight font-bold sm:text-5xl">
              لو غبت فجأة… أهلك يعرفوا يبدأوا منين؟
            </h1>
            <p className="mt-5 max-w-2xl text-lg opacity-90">
              عُهدة بتساعدك تكتب في 10 دقايق أهم الحاجات اللي أهلك محتاجين يعرفوها: الشغل، البنوك،
              التأمين، الفلوس، الأوراق، ومين يكلموا الأول. وبتسلّمهولهم بكود مطبوع.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/start" className="btn-gold">
                ابدأ ملفك مجانًا
              </Link>
              <Link
                to="/quiz"
                className="btn bg-white/10 text-primary-foreground hover:bg-white/20"
              >
                اختبر نفسك في دقيقة
              </Link>
            </div>
          </div>
        </section>
      </div>

      <Page>
        <h2 className="text-2xl font-bold">إمتى أهلك هيحتاجوه؟</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {scenarios.map((s) => (
            <div key={s.t} className="panel">
              <h3 className="text-lg font-bold text-primary">{s.t}</h3>
              <p className="mt-2 text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-14 text-2xl font-bold">بتشتغل إزاي</h2>
        <ol className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {[
            ["املا ملفك في 10 دقايق", "الشغل، البنوك، التأمين، ومين يكلموا الأول."],
            ["احفظه مشفّر على جهازك", "من غير حساب، ونزّل نسخة احتياطية."],
            ["سلّمه لأهلك بكود مطبوع", "ملف بيفتح من غير الموقع، بالكارت بس."],
          ].map(([t, d], i) => (
            <li key={t} className="flex items-start gap-3">
              <span className="num grid size-11 shrink-0 place-items-center rounded-full bg-card text-2xl leading-none">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="block text-sm text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ol>

        <section className="mt-14 rounded-2xl bg-mint p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-primary">بياناتك بتفضل معاك</h2>
          <ul className="mt-4 space-y-2">
            {[
              "التشفير بيحصل على جهازك، قبل ما أي حاجة تتحفظ.",
              "إحنا ما بنشوفش ولا بنخزّن ملفك. مفيش سيرفر عليه بياناتك.",
              "مفيش حساب ولا إيميل ولا رقم موبايل مطلوب.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="font-bold text-primary">
                  ✓
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 font-bold">حاجات ما بنطلبهاش ولا المفروض تكتبها</h3>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            {[
              "كلمات السر ورموز التحقق (OTP).",
              "أرقام الحسابات أو الكروت كاملة — اسم البنك ونوع الحساب كفاية.",
              "عُهدة مش وصية قانونية ولا شرعية.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="font-bold text-destructive">
                  ✕
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <Link to="/security" className="btn-ghost mt-4 px-0">
            إزاي بنحمي ملفك ←
          </Link>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold">الأسعار</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="panel">
              <h3 className="font-bold">الملف</h3>
              <p className="mt-1 text-2xl font-bold text-primary">مجانًا</p>
              <p className="mt-2 text-sm text-muted-foreground">
                تكتب ملفك وتحفظه مشفّر وتنزّل نسخة احتياطية.
              </p>
            </div>
            <div className="panel">
              <h3 className="font-bold">فردي</h3>
              <p className="mt-1 text-2xl font-bold text-primary">{priceLabel("single", "EG")}</p>
              <p className="text-sm font-semibold">{priceLabel("single", "INTL")} من برّه مصر</p>
              <p className="mt-2 text-sm text-muted-foreground">
                مرة واحدة. تسليم الأهل والكروت المطبوعة.
              </p>
            </div>
            <div className="panel bg-gold-soft">
              <h3 className="font-bold">باقة العيلة</h3>
              <p className="mt-1 text-2xl font-bold text-primary">{priceLabel("family", "EG")}</p>
              <p className="text-sm font-semibold">{priceLabel("family", "INTL")} من برّه مصر</p>
              <p className="mt-2 text-sm text-muted-foreground">
                3 أكواد تفعيل لك ولاتنين من عيلتك.
              </p>
            </div>
          </div>
          <Link to="/activate" className="btn-outline mt-4">
            تفاصيل التفعيل
          </Link>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold">أسئلة بتتسأل كتير</h2>
          <div className="mt-4 space-y-3">
            {faq.map(([q, a]) => (
              <details key={q} className="group panel py-0 sm:py-0">
                <summary className="flex min-h-14 list-none items-center justify-between gap-3 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-lg leading-none text-primary transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-4 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-14 flex flex-wrap justify-center gap-3">
          <Link to="/quiz" className="btn-outline">
            اختبر نفسك في دقيقة
          </Link>
          <Link to="/start" className="btn-primary">
            ابدأ ملفك مجانًا
          </Link>
        </div>
      </Page>
    </>
  );
}
