import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

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

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined || v === "") throw new Error(`Ympäristömuuttuja ${name} puuttuu`);
  return v;
}

/** Service role -asiakas: vain palvelinfunktioissa, ei koskaan selaimeen. */
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** Kirjautuneen käyttäjän id Authorization-otsakkeen JWT:stä, tai null. */
export async function requestUserId(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sallitaanko paluuosoite (ALLOWED_RETURN_ORIGINS, pilkuilla eroteltu lista)? */
export function isAllowedReturn(url: string): boolean {
  try {
    const origin = new URL(url).origin;
    return env("ALLOWED_RETURN_ORIGINS").split(",").map((s) => s.trim().replace(/\/$/, "")).includes(origin);
  } catch {
    return false;
  }
}
