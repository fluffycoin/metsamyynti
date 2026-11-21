/**
 * GET /property-summary?kt=49-401-1-1[&refresh=1]
 *     /property-summary?kt=224-404-1-30-M501   (määräala)
 *
 * Palauttaa kiinteistön koosteen: rajat, pinta-ala, metsäkuviot leikattuna kiinteistölle,
 * kaavatiedot ja oman hinta-alueen tuoreimmat kantohinnat. Haetut tiedot tallennetaan
 * tietokantaan, joten seuraava haku on nopea (päivitys 30 päivän välein).
 */
import { parseKiinteistotunnus } from "../_shared/kiinteistotunnus.ts";
import { collectPropertyData, NotFoundError } from "../_shared/lookup.ts";
import { cors, json, serviceClient } from "../_shared/supabase.ts";

const MAX_AGE_DAYS = 30;

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

  const db = serviceClient();
  const refresh = url.searchParams.get("refresh") === "1";

  // Määräala on tallennettu omana rivinään vain, jos sen alue on rekisterissä.
  const candidates = kt.maarala ? [kt.maarala, null] : [null];
  let stored: { maarala_no: string | null } | null = null;
  for (const m of candidates) {
    const q = db.from("properties").select("id, fetched_at, geom, maarala_no").eq("kiinteistotunnus", kt.long);
    const { data } = await (m === null ? q.is("maarala_no", null) : q.eq("maarala_no", m)).maybeSingle();
    const fresh = data?.geom && data?.fetched_at &&
      Date.now() - new Date(data.fetched_at).getTime() < MAX_AGE_DAYS * 86_400_000;
    if (fresh) {
      stored = { maarala_no: data.maarala_no };
      break;
    }
  }

  let notes: string[] = [];
  let maaralaPoint: number[] | null = null;
  if (!stored || refresh) {
    const apiKey = Deno.env.get("MML_API_KEY");
    if (!apiKey) return json({ error: "MML_API_KEY puuttuu palvelimen asetuksista" }, 500);

    let data;
    try {
      data = await collectPropertyData(kt, apiKey);
    } catch (e) {
      if (e instanceof NotFoundError) return json({ error: e.message }, 404);
      return json({ error: `Kiinteistörajojen haku epäonnistui: ${(e as Error).message}` }, 502);
    }
    notes = data.notes;
    maaralaPoint = data.maaralaPoint;
    stored = data.storedAs;

    const { data: propertyId, error: upErr } = await db.rpc("upsert_property", {
      p_kiinteistotunnus: kt.long,
      p_geojson: data.geometry,
      p_maarala_no: data.storedAs.maarala_no,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    const { error: stErr } = await db.rpc("replace_forest_stands", {
      p_property_id: propertyId,
      p_features: data.stands,
    });
    if (stErr) notes.push(`Kuvioiden tallennus epäonnistui: ${stErr.message}`);

    if (data.zoning.length) {
      const { error: zErr } = await db.rpc("upsert_zoning_areas", {
        p_municipality_code: kt.municipalityCode,
        p_rows: data.zoning,
      });
      if (zErr) notes.push(`Kaavatietojen tallennus epäonnistui: ${zErr.message}`);
    }
  }

  const { data: summary, error } = await db.rpc("property_summary", {
    p_kiinteistotunnus: kt.long,
    p_maarala_no: stored.maarala_no,
  });
  if (error) return json({ error: error.message }, 500);
  return json({
    ...summary,
    requested: kt.display,
    ...(kt.maarala && !stored.maarala_no ? { maarala: { tunnus: kt.display, point_3067: maaralaPoint } } : {}),
    notes,
  });
});
