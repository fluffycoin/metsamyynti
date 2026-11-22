/**
 * GET /property-summary?kt=49-401-1-1[&refresh=1]
 *     /property-summary?kt=224-404-1-30-M501   (määräala)
 *
 * Palauttaa kiinteistön koosteen: rajat, pinta-ala, metsäkuviot leikattuna kiinteistölle,
 * kaavatiedot ja oman hinta-alueen tuoreimmat kantohinnat. Haetut tiedot tallennetaan
 * tietokantaan, joten seuraava haku on nopea (päivitys 30 päivän välein).
 */
import { ensureProperty, HttpError } from "../_shared/ensure.ts";
import { parseKiinteistotunnus } from "../_shared/kiinteistotunnus.ts";
import { cors, json, serviceClient } from "../_shared/supabase.ts";

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

  try {
    const r = await ensureProperty(serviceClient(), kt, url.searchParams.get("refresh") === "1");
    return json({
      ...r.summary,
      requested: kt.display,
      ...(kt.maarala && !r.storedAs.maarala_no ? { maarala: { tunnus: kt.display, point_3067: r.maaralaPoint } } : {}),
      notes: r.notes,
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
});
