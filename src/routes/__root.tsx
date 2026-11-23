import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Header, Footer } from "@/components/Brand";
import { VaultProvider } from "@/lib/vault";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="mt-3 text-muted-foreground">الصفحة دي مش موجودة.</p>
        <Link to="/" className="btn-primary mt-6">
          ارجع للرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">الصفحة ما اتفتحتش</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حصلت مشكلة. جرّب تاني أو ارجع للرئيسية.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-primary"
          >
            جرّب تاني
          </button>
          <a href="/" className="btn-outline">
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "referrer", content: "no-referrer" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0f5c4d" },
      { title: "عُهدة | ملف أهلك لو غبت فجأة" },
      {
        name: "description",
        content:
          "عُهدة بتساعدك تجهّز ملف مشفّر لأهلك يعرفوا منه يبدأوا منين لو غبت فجأة. التشفير على جهازك، ومحدش غيرك يقدر يقراه.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "عُهدة" },
      { property: "og:locale", content: "ar_EG" },
      { property: "og:image", content: "https://ohda.codeandcanvas.net/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://ohda.codeandcanvas.net/og-image.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <VaultProvider>
        <div className="flex min-h-screen flex-col">
          <Header />
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </div>
      </VaultProvider>
    </QueryClientProvider>
  );
}
