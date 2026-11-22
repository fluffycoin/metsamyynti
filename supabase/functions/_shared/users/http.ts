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

/** Kehitystilassa Lovablen esikatselu- ja julkaisuosoitteet sallitaan aina. */
const DEV_PATTERNS = ["https://*.lovable.app", "https://*.lovableproject.com", "https://*.lovable.dev"];

/** Paluuosoitteiden lista: ALLOWED_RETURN_ORIGINS (+ kehitystilassa Lovable). Sietää välilyönnit ja lainausmerkit. */
export function returnPatterns(): string[] {
  const raw = Deno.env.get("ALLOWED_RETURN_ORIGINS") ?? "";
  const list = raw.split(/[,\s]+/).map((s) => s.trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, ""))
    .filter(Boolean);
  if ((Deno.env.get("ENVIRONMENT") ?? "development") !== "production") list.push(...DEV_PATTERNS);
  return list;
}

/**
 * Sallitaanko paluuosoite? Jokainen kohta on joko tarkka osoite (https://sovellus.fi) tai
 * jokerimerkki ensimmäisenä osana (https://*.lovable.app), joka hyväksyy minkä tahansa
 * aliverkkotunnuksen, mutta ei itse päätasoa eikä eri protokollaa tai porttia.
 * http hyväksytään vain localhostille (kehitystilassa mikä tahansa portti).
 */
export function isAllowedReturn(url: string, patterns: string | string[] = returnPatterns()): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const isLocal = u.protocol === "http:" && u.hostname === "localhost";
  if (u.protocol !== "https:" && !isLocal) return false;
  if (isLocal && (Deno.env.get("ENVIRONMENT") ?? "development") !== "production" && typeof patterns !== "string") {
    return true;
  }
  const list = typeof patterns === "string"
    ? patterns.split(",").map((s) => s.trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "")).filter(Boolean)
    : patterns;
  return list.some((p) => {
    const m = p.match(/^(https?):\/\/\*\.([a-z0-9.-]+)(?::(\d+))?$/i);
    if (!m) return p.toLowerCase() === u.origin;
    const [, scheme, domain, port] = m;
    return u.protocol === `${scheme.toLowerCase()}:` &&
      u.port === (port ?? "") &&
      u.hostname.endsWith(`.${domain.toLowerCase()}`);
  });
}
