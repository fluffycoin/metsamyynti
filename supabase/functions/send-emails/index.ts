/**
 * POST /functions/v1/send-emails   (ajastettu, Authorization: Bearer <service role -avain>)
 * Lähettää sähköpostijonon (private.email_outbox) Resendin kautta. Jonoon päätyy vain viestejä
 * käyttäjille, jotka ovat sallineet sähköposti-ilmoitukset.
 *
 * Ympäristömuuttujat: RESEND_API_KEY, EMAIL_FROM (esim. "Metsämyynti <ilmoitukset@domain.fi>"), APP_URL
 */
import { env, json, serviceClient } from "../_shared/users/http.ts";

Deno.serve(async (req) => {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== env("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "Ei oikeutta" }, 401);

  const db = serviceClient();
  const { data: batch, error } = await db.rpc("claim_email_batch", { p_limit: 50 });
  if (error) return json({ error: error.message }, 500);

  const appUrl = env("APP_URL").replace(/\/$/, "");
  let sent = 0, failed = 0;
  for (const m of batch ?? []) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env("EMAIL_FROM"),
          to: [m.to_email],
          subject: m.subject,
          text: String(m.body_text).replaceAll("{{APP_URL}}", appUrl),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      await db.rpc("complete_email", { p_id: m.id });
      sent++;
    } catch (e) {
      await db.rpc("complete_email", { p_id: m.id, p_error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }
  return json({ sent, failed });
});
