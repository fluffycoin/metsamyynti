/**
 * GET /functions/v1/strong-auth-callback?code=...&state=...   (Idura ohjaa tänne)
 * Julkaistava ilman JWT-tarkistusta:  supabase functions deploy strong-auth-callback --no-verify-jwt
 *
 * Varmentaa tunnistuksen, kirjaa sen (record_strong_auth), hakee omistukset ja ohjaa selaimen
 * takaisin sovellukseen: <return_to>?strong_auth=ok  tai  ?strong_auth=virhe&syy=<KOODI>
 */
import { env, serviceClient } from "../_shared/users/http.ts";
import { exchangeCode, ftnIdentity } from "../_shared/users/oidc.ts";
import { normalizeHetu } from "../_shared/users/hetu.ts";
import { fetchMmlOwnerships } from "../_shared/users/mml-ownership.ts";

// Testihenkilöt (ks. supabase/migrations/20261121200600_users_test_registry_seed.sql)
const TEST_PEOPLE: [string, string, string][] = [
  ["010170-901K", "Matti Metsänen", "metsätila Tuusula, tontti Kerava, kuolinpesän osakas Pirkkala"],
  ["150382-902B", "Liisa Pelto", "pelto Sipoo (yhteisomistus), määräala Espoo, Tampere kuolinpesän kanssa"],
  ["220379-9034", "Pekka Pelto", "pelto Sipoo (yhteisomistus)"],
  ["110868-9059", "Kalle Vainio", "kuolinpesän osakas Pirkkala"],
  ["300491-9069", "Sanna Vainio", "kuolinpesän osakas Pirkkala"],
  ["121212A907S", "Ella Ostaja", "ei omistuksia"],
];

function redirect(to: string, params: Record<string, string>): Response {
  const u = new URL(to);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 303, headers: { location: u.toString() } });
}

function mockForm(state: string): Response {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const rows = TEST_PEOPLE.map(([h, n, d]) =>
    `<label><input type="radio" name="hetu" value="${h}" required> <b>${esc(n)}</b> ${h}<br><small>${esc(d)}</small></label>`
  ).join("");
  const html = `<!doctype html><html lang="fi"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Testitunnistus</title><style>body{font-family:system-ui;max-width:480px;margin:2rem auto;padding:0 1rem}
label{display:block;padding:.6rem;border:1px solid #ccc;border-radius:8px;margin:.4rem 0}button{padding:.7rem 1.2rem}</style>
<h1>Testitunnistus</h1><p>Kehitystila: valitse testihenkilö. Oikeassa käytössä tässä on pankkitunnistus.</p>
<form method="post"><input type="hidden" name="state" value="${esc(state)}">${rows}
<p><label>Tai oma testitunnus: <input name="hetu_custom" placeholder="PPKKVV-9NNT"></label></p>
<button>Tunnistaudu</button></form></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mode = env("STRONG_AUTH_MODE", "idura");
  const isMock = mode === "mock" && env("ENVIRONMENT", "development") !== "production";
  const db = serviceClient();

  let state = url.searchParams.get("state") ?? "";
  let mockHetu: string | null = null;

  if (isMock && req.method === "GET" && url.searchParams.get("mock")) return mockForm(state);
  if (isMock && req.method === "POST") {
    const form = await req.formData();
    state = String(form.get("state") ?? "");
    mockHetu = String(form.get("hetu_custom") || form.get("hetu") || "");
  }

  const { data: sessions, error: sErr } = await db.rpc("strong_auth_session_consume", { p_state: state });
  const session = sessions?.[0];
  if (sErr || !session) {
    return new Response("Tunnistusistunto on vanhentunut. Palaa sovellukseen ja yritä uudelleen.", { status: 400 });
  }
  const back = (params: Record<string, string>) => redirect(session.return_to, params);

  try {
    let hetu: string, name: string, method: string | null, provider: string;
    if (mockHetu !== null) {
      hetu = normalizeHetu(mockHetu);
      if (Number(hetu.slice(7, 10)) < 900) throw Object.assign(new Error("Vain testitunnukset"), { code: "VAIN_TESTITUNNUKSET" });
      name = TEST_PEOPLE.find(([h]) => h === hetu)?.[1] ?? "Testihenkilö";
      method = "mock";
      provider = "mock";
    } else {
      if (url.searchParams.get("error")) return back({ strong_auth: "peruttu", syy: url.searchParams.get("error")! });
      const code = url.searchParams.get("code");
      if (!code) return back({ strong_auth: "virhe", syy: "KOODI_PUUTTUU" });
      const claims = await exchangeCode(code, session.code_verifier, session.nonce);
      ({ hetu, name, method } = ftnIdentity(claims));
      hetu = normalizeHetu(hetu);
      provider = "idura";
    }

    const { data: result, error } = await db.rpc("record_strong_auth", {
      p_user: session.user_id, p_hetu: hetu, p_verified_name: name,
      p_purpose: session.purpose, p_provider: provider, p_method: method,
    });
    if (error) return back({ strong_auth: "virhe", syy: error.hint || "TALLENNUS" });

    if (result?.ownership_source === "mml") {
      const rows = await fetchMmlOwnerships(hetu);
      const { error: mErr } = await db.rpc("store_mml_ownerships", { p_user: session.user_id, p_rows: rows });
      if (mErr) throw mErr;
    }
    return back({ strong_auth: "ok", tarkoitus: session.purpose });
  } catch (e) {
    console.error("strong-auth-callback", e instanceof Error ? e.message : e);
    return back({ strong_auth: "virhe", syy: (e as { code?: string }).code ?? "TUNNISTUS" });
  }
});
