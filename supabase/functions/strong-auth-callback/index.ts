/**
 * Vahvan tunnistautumisen paluu. Julkaistaan ilman JWT-tarkistusta (--no-verify-jwt).
 *
 * Idura (oikea tunnistus):
 *   GET /functions/v1/strong-auth-callback?code=...&state=...
 *   -> varmentaa tunnistuksen ja ohjaa selaimen (303) takaisin sovellukseen:
 *      <return_to>?strong_auth=ok   tai   ?strong_auth=virhe&syy=<KOODI>
 *
 * Testitila (STRONG_AUTH_MODE=mock, estetty tuotannossa). Sovelluksen sivu /testitunnistus:
 *   GET  ...?testihenkilot=1                         -> { people: [{ hetu, name, description }] }
 *   POST { "state": "...", "hetu": "010170-901K" }   -> { redirect: "<return_to>?strong_auth=ok..." }
 *   Sivu ohjaa selaimen redirect-osoitteeseen.
 */
import { cors, env, json, serviceClient } from "../_shared/users/http.ts";
import { exchangeCode, ftnIdentity } from "../_shared/users/oidc.ts";
import { normalizeHetu } from "../_shared/users/hetu.ts";
import { fetchMmlOwnerships } from "../_shared/users/mml-ownership.ts";

// Testihenkilöt (ks. supabase/migrations/20261122300000_users_real_test_properties.sql)
const TEST_PEOPLE = [
  { hetu: "010170-901K", name: "Matti Metsänen", description: "metsätila Tuusula 858-409-10-2, tontti Kerava 245-401-8-150, kuolinpesän osakas Pirkkala 604-413-10-31" },
  { hetu: "150382-902B", name: "Liisa Pelto", description: "pelto Sipoo 753-412-2-7 (yhteisomistus), määräala Espoo 49-456-1-101-M601, Tampere 837-585-11-181 kuolinpesän kanssa" },
  { hetu: "220379-9034", name: "Pekka Pelto", description: "pelto Sipoo 753-412-2-7 (yhteisomistus)" },
  { hetu: "110868-9059", name: "Kalle Vainio", description: "kuolinpesän osakas Pirkkala 604-413-10-31" },
  { hetu: "300491-9069", name: "Sanna Vainio", description: "kuolinpesän osakas Pirkkala 604-413-10-31" },
  { hetu: "121212A907S", name: "Ella Ostaja", description: "ei omistuksia" },
];

class AuthError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

function withParams(to: string, params: Record<string, string>): string {
  const u = new URL(to);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** Kuluttaa istunnon, kirjaa tunnistuksen ja palauttaa paluuosoitteen. */
async function complete(
  state: string,
  identify: (session: { code_verifier: string; nonce: string }) => Promise<
    { hetu: string; name: string; method: string | null; provider: string }
  >,
): Promise<string> {
  const db = serviceClient();
  const { data: sessions, error: sErr } = await db.rpc("strong_auth_session_consume", { p_state: state });
  const session = sessions?.[0];
  if (sErr || !session) throw new AuthError("ISTUNTO_VANHENTUNUT", "Tunnistusistunto on vanhentunut. Palaa sovellukseen ja yritä uudelleen.");

  try {
    const id = await identify(session);
    const { data: result, error } = await db.rpc("record_strong_auth", {
      p_user: session.user_id, p_hetu: id.hetu, p_verified_name: id.name,
      p_purpose: session.purpose, p_provider: id.provider, p_method: id.method,
    });
    if (error) return withParams(session.return_to, { strong_auth: "virhe", syy: error.hint || "TALLENNUS" });

    if (result?.ownership_source === "mml") {
      const rows = await fetchMmlOwnerships(id.hetu);
      const { error: mErr } = await db.rpc("store_mml_ownerships", { p_user: session.user_id, p_rows: rows });
      if (mErr) throw mErr;
    }
    return withParams(session.return_to, { strong_auth: "ok", tarkoitus: session.purpose });
  } catch (e) {
    console.error("strong-auth-callback", e instanceof Error ? e.message : e);
    const code = e instanceof AuthError ? e.code : "TUNNISTUS";
    return withParams(session.return_to, { strong_auth: "virhe", syy: code });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const isMock = env("STRONG_AUTH_MODE", "idura") === "mock" && env("ENVIRONMENT", "development") !== "production";

  // --- Testitila --------------------------------------------------------------------------
  if (isMock && req.method === "GET" && url.searchParams.has("testihenkilot")) {
    return json({ people: TEST_PEOPLE });
  }
  if (isMock && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    try {
      const redirect = await complete(String(body.state ?? ""), () => {
        let hetu: string;
        try {
          hetu = normalizeHetu(String(body.hetu ?? ""));
        } catch {
          throw new AuthError("VIRHEELLINEN_HETU");
        }
        if (Number(hetu.slice(7, 10)) < 900) throw new AuthError("VAIN_TESTITUNNUKSET");
        const name = TEST_PEOPLE.find((p) => p.hetu === hetu)?.name ?? "Testihenkilö";
        return Promise.resolve({ hetu, name, method: "mock", provider: "mock" });
      });
      return json({ redirect });
    } catch (e) {
      const err = e as AuthError;
      return json({ error: err.message, code: err.code ?? "TUNNISTUS" }, 400);
    }
  }

  // --- Idura ------------------------------------------------------------------------------
  const state = url.searchParams.get("state") ?? "";
  try {
    const redirect = await complete(state, async (session) => {
      if (url.searchParams.get("error")) throw new AuthError("PERUTTU");
      const code = url.searchParams.get("code");
      if (!code) throw new AuthError("KOODI_PUUTTUU");
      const claims = await exchangeCode(code, session.code_verifier, session.nonce);
      const id = ftnIdentity(claims);
      return { ...id, hetu: normalizeHetu(id.hetu), provider: "idura" };
    });
    return new Response(null, { status: 303, headers: { location: redirect } });
  } catch (e) {
    return new Response((e as Error).message, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
});
