import { Link } from "@tanstack/react-router";
import { DEMO } from "@/lib/demo";

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0f5c4d" />
      <path
        d="M12 22h40v26a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z"
        fill="none"
        stroke="#c8913a"
        strokeWidth="3"
      />
      <path
        d="M12 22l20 15 20-15"
        fill="none"
        stroke="#c8913a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="38" r="8" fill="#c8913a" />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#0f5c4d"
        fontFamily="Tahoma, Arial"
      >
        ع
      </text>
    </svg>
  );
}

export function Header() {
  return (
    <header className="noprint sticky top-0 z-20 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="عُهدة — الصفحة الرئيسية"
        >
          <LogoMark size={36} />
          <span className="leading-tight">
            <span className="block text-xl font-bold text-primary">عُهدة</span>
            <span className="hidden text-[11px] text-muted-foreground sm:block" dir="ltr">
              by Code &amp; Canvas
            </span>
          </span>
          <span className="chip-todo px-2 text-[11px] leading-5">
            <span className="sm:hidden">تجريبي</span>
            <span className="hidden sm:inline">نسخة تجريبية</span>
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1 text-sm" aria-label="الرئيسية">
          <Link
            to="/open"
            aria-label="افتح ملف استلمته من أهلك"
            className="inline-flex min-h-11 items-center rounded-lg px-2.5 font-semibold whitespace-nowrap hover:bg-secondary"
          >
            <span className="sm:hidden">استلمت ملف؟</span>
            <span className="hidden sm:inline">استلمت ملف من أهلك؟</span>
          </Link>
          <Link to="/start" className="btn-primary btn-sm min-h-11 whitespace-nowrap">
            اكتب ملفي
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="noprint mt-16 rounded-t-[36px] bg-card">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-8 text-sm text-muted-foreground">
        <p>
          عُهدة — منتج من Code &amp; Canvas، شركة مسجّلة في مصر ·{" "}
          <a href="mailto:admin@codeandcanvas.net" className="underline">
            admin@codeandcanvas.net
          </a>{" "}
          ·{" "}
          <a
            href="https://wa.me/201001850509"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            واتساب
          </a>
        </p>
        <nav className="flex flex-wrap gap-4 font-semibold text-primary">
          <Link to="/security">الأمان</Link>
          <Link to="/privacy">الخصوصية</Link>
          <Link to="/open">افتح ملف أهلك</Link>
          <Link to="/activate">التفعيل</Link>
        </nav>
        <p className="text-xs">عُهدة دليل عملي وليست خدمة قانونية أو مالية.</p>
      </div>
    </footer>
  );
}

export function Page({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <main className={`mx-auto px-4 py-8 ${narrow ? "max-w-2xl" : "max-w-5xl"}`}>
      {DEMO && (
        <p className="notice mb-5 text-sm" role="note">
          نسخة تجريبية للتصميم — مفيش سيرفر ولا بيانات حقيقية.
        </p>
      )}
      {children}
    </main>
  );
}

export function meta(title: string, description: string, path: string) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: `https://ohda.codeandcanvas.net${path}` },
    ],
    links: [{ rel: "canonical", href: `https://ohda.codeandcanvas.net${path}` }],
  };
}
