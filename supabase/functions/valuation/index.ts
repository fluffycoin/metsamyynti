/**
 * GET /valuation?kt=49-401-1-1[&refresh=1]
 *
 * Hinta-arvio: maan arvo + puuston arvo ("Alustava" tai "Vahvistettu puuston arvo") sekä
 * kaavan ja rakennusoikeuden tulkinta. Vaatii kirjautumisen.
 *  - Omistajalle: arvio huomioi peltoalan, rakennuspaikat, vahvistetun puustoarvion ja
 *    myyjän oman hinta-arvion, ja se tallennetaan (valuations).
 *  - Muille: pelkkä avoimesta datasta laskettu arvio, ei tallenneta.
 */
import { HttpError } from "../_shared/ensure.ts";
import { parseKiinteistotunnus } from "../_shared/kiinteistotunnus.ts";
import { cors, json, serviceClient, userClient } from "../_shared/supabase.ts";
import { runValuation } from "../_shared/valuation/service.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const input = url.searchParams.get("kt");
  if (!input) return json({ error: "Anna kiinteistötunnus parametrina kt" }, 400);
  let kt;
  try {
    kt = parseKiinteistotunnus(input);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  const user = userClient(req);
  const { data: auth } = await user.auth.getUser();
  if (!auth?.user) return json({ error: "Kirjaudu sisään", hint: "KIRJAUDU" }, 401);

  const db = serviceClient();
  try {
    // Omistajuus: RLS palauttaa property_owners-rivit vain saman kiinteistön omistajille.
    const q = db.from("properties").select("id").eq("kiinteistotunnus", kt.long);
    const { data: prop } = await (kt.maarala ? q.eq("maarala_no", kt.maarala) : q.is("maarala_no", null)).maybeSingle();
    let isOwner = false;
    if (prop) {
      const { data: own } = await user.from("property_owners").select("id").eq("property_id", prop.id).limit(1);
      isOwner = !!own?.length;
    }
    const r = await runValuation(db, kt, {
      includePrivate: isOwner,
      store: isOwner,
      userId: auth.user.id,
      refresh: url.searchParams.get("refresh") === "1",
    });
    return json({ property_id: r.summary.property_id, is_owner: isOwner, valuation_id: r.valuation_id, ...r.valuation });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error).message }, 500);
  }
});
