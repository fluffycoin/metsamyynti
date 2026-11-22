import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/** Service role -asiakas: vain palvelinpuolen funktioille, ei koskaan selaimeen. */
export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Kutsujan oikeuksilla toimiva asiakas (RLS ja auth.uid() voimassa). Käytetään, kun
 * tarkistukset (omistajuus, vahva tunnistus) halutaan tehdä tietokannan RPC:issä.
 */
export function userClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("SUPABASE_URL tai SUPABASE_ANON_KEY puuttuu");
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}
