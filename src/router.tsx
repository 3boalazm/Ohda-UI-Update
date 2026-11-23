import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { routeTree } from "./routeTree.gen";
import { NONCE_HEADER } from "./lib/securityHeaders";

/** Per-request CSP nonce on the server (set by src/server.ts); undefined in the browser. */
const getNonce = createIsomorphicFn()
  .server((): string | undefined => getRequestHeader(NONCE_HEADER) ?? undefined)
  .client((): string | undefined => undefined);

export const getRouter = () => {
  const nonce = getNonce();
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
