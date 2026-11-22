/**
 * POST /functions/v1/strong-auth-start   (kirjautunut käyttäjä, Authorization: Bearer <JWT>)
 * body: { "purpose": "kayttoonotto" | "julkaisu" | "hyvaksynta", "return_to": "https://sovellus/..." }
 * vastaus: { "url": "https://..." }  -> selain ohjataan tähän osoitteeseen
 *
 * STRONG_AUTH_MODE=idura (oletus) ohjaa Iduran tunnistukseen. STRONG_AUTH_MODE=mock ohjaa
 * testilomakkeelle, jossa valitaan testihenkilö (vain kehitykseen, estetty tuotannossa).
 */
import { cors, env, isAllowedReturn, json, randomToken, requestUserId, serviceClient } from "../_shared/users/http.ts";
import { authorizeUrl, pkcePair } from "../_shared/users/oidc.ts";

const PURPOSES = ["kayttoonotto", "julkaisu", "hyvaksynta"];

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "virheellinen osoite";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Vain POST" }, 405);
  try {
    const db = serviceClient();
    const userId = await requestUserId(req, db);
    if (!userId) return json({ error: "Kirjaudu sisään", code: "KIRJAUDU" }, 401);

    const body = await req.json().catch(() => ({}));
    const purpose = body.purpose ?? "kayttoonotto";
    // return_to (suositus); returnTo/redirect_to sallitaan, ja puuttuessa käytetään kutsuvaa sivua.
    const return_to: string | undefined = body.return_to ?? body.returnTo ?? body.redirect_to ??
      req.headers.get("referer") ?? undefined;
    if (!PURPOSES.includes(purpose)) return json({ error: "Tuntematon tarkoitus", code: "VAARA_TARKOITUS" }, 400);
    if (!return_to || !isAllowedReturn(return_to)) {
      console.error("strong-auth-start: hylätty paluuosoite", JSON.stringify(return_to ?? null));
      return json({
        error: `Paluuosoite ei ole sallittu: ${return_to ? safeOrigin(return_to) : "puuttuu (return_to)"}`,
        code: "VAARA_PALUUOSOITE",
      }, 400);
    }

    const state = randomToken();
    const nonce = randomToken();
    const { verifier, challenge } = await pkcePair();
    const { error } = await db.rpc("strong_auth_session_create", {
      p_user: userId, p_purpose: purpose, p_state: state, p_nonce: nonce,
      p_code_verifier: verifier, p_return_to: return_to,
    });
    if (error) throw error;

    const mode = env("STRONG_AUTH_MODE", "idura");
    if (mode === "mock") {
      if (env("ENVIRONMENT", "development") === "production") throw new Error("Mock-tunnistus on estetty tuotannossa");
      const u = new URL(env("STRONG_AUTH_REDIRECT_URI"));
      u.searchParams.set("state", state);
      u.searchParams.set("mock", "1");
      return json({ url: u.toString(), mode });
    }
    return json({ url: await authorizeUrl({ state, nonce, codeChallenge: challenge }), mode });
  } catch (e) {
    console.error(e);
    return json({ error: "Tunnistautumisen aloitus epäonnistui" }, 500);
  }
});
