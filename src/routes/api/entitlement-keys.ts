import { createFileRoute } from "@tanstack/react-router";

/** Public halves of the entitlement signing keys (by id), for client-side verification. */
export const Route = createFileRoute("/api/entitlement-keys")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const r = await supabaseAdmin.rpc("entitlement_public_keys");
        const keys: Record<string, string> = {};
        if (!r.error && Array.isArray(r.data))
          for (const k of r.data as { id: string; public_raw_b64url: string }[])
            if (/^[a-z0-9-]{1,32}$/.test(k.id) && /^[A-Za-z0-9_-]{43}$/.test(k.public_raw_b64url))
              keys[k.id] = k.public_raw_b64url;
        return new Response(JSON.stringify({ keys }), {
          status: r.error ? 503 : 200,
          headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
        });
      },
    },
  },
});
