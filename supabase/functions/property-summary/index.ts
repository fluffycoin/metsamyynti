/**
 * GET /property-summary?kt=49-401-1-1[&refresh=1]
 *
 * Palauttaa kiinteistön koosteen: rajat, pinta-ala, metsäkuviot leikattuna kiinteistölle,
 * kaavatiedot (pilottikunnissa) ja oman hinta-alueen tuoreimmat kantohinnat.
 * Haetut tiedot tallennetaan tietokantaan, joten seuraava haku on nopea.
 */
import { parseKiinteistotunnus } from "../_shared/kiinteistotunnus.ts";
import { bboxOf } from "../_shared/wfs.ts";
import { fetchParcels } from "../_shared/sources/mml.ts";
import { fetchStands } from "../_shared/sources/metsakeskus.ts";
import { fetchZoning } from "../_shared/sources/kaavat/index.ts";
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
  if (kt.maarala) {
    return json({ error: "Määräalojen rajat eivät ole avoimessa rajapinnassa; tuki lisätään MML-luvan myötä." }, 501);
  }

  const db = serviceClient();
  const refresh = url.searchParams.get("refresh") === "1";

  const { data: existing } = await db.from("properties")
    .select("id, fetched_at, geom").eq("kiinteistotunnus", kt.long).is("maarala_no", null).maybeSingle();
  const fresh = existing?.geom && existing?.fetched_at &&
    Date.now() - new Date(existing.fetched_at).getTime() < MAX_AGE_DAYS * 86_400_000;

  const notes: string[] = [];
  if (!fresh || refresh) {
    const apiKey = Deno.env.get("MML_API_KEY");
    if (!apiKey) return json({ error: "MML_API_KEY puuttuu palvelimen asetuksista" }, 500);

    const parcels = await fetchParcels(kt.long, apiKey);
    if (!parcels) return json({ error: `Kiinteistöä ${kt.display} ei löytynyt` }, 404);

    const { data: propertyId, error: upErr } = await db.rpc("upsert_property", {
      p_kiinteistotunnus: kt.long,
      p_geojson: parcels.geometry,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    const bbox = bboxOf(parcels.geometry, 5);
    const [stands, zoning] = await Promise.all([
      fetchStands(bbox).catch((e) => {
        notes.push(`Metsävaratietojen haku epäonnistui: ${e.message}`);
        return [];
      }),
      fetchZoning(kt.municipalityCode, bbox).catch((e) => {
        notes.push(`Kaavatietojen haku epäonnistui: ${e.message}`);
        return { rows: [], notes: [] as string[] };
      }),
    ]);

    const { error: stErr } = await db.rpc("replace_forest_stands", {
      p_property_id: propertyId,
      p_features: stands,
    });
    if (stErr) notes.push(`Kuvioiden tallennus epäonnistui: ${stErr.message}`);

    notes.push(...zoning.notes);
    if (zoning.rows.length) {
      const { error: zErr } = await db.rpc("upsert_zoning_areas", {
        p_municipality_code: kt.municipalityCode,
        p_rows: zoning.rows,
      });
      if (zErr) notes.push(`Kaavatietojen tallennus epäonnistui: ${zErr.message}`);
    }
  }

  const { data: summary, error } = await db.rpc("property_summary", { p_kiinteistotunnus: kt.long });
  if (error) return json({ error: error.message }, 500);
  return json({ ...summary, notes });
});
