/**
 * GET /property-at?lat=60.40&lon=25.33
 *
 * Kartan klikkaus -> kiinteistö. Palauttaa pisteessä olevan kiinteistön tunnuksen ja
 * palstan rajan, jotta käyttöliittymä voi korostaa sen ja avata kiinteistösivun:
 *   { "kiinteistotunnus": "75341200020007", "display": "753-412-2-7",
 *     "geometry": GeoJSON Polygon (WGS84),
 *     "owner_info": null | { "category": "kunta", "label": "Kunnan tai kaupungin maa", ... } }
 * owner_info kertoo, jos maa on kunnan, valtion, seurakunnan, yhtiön, yhdistyksen tai
 * osakaskunnan (ks. property_owner_info / docs/omistajatyyppi.md).
 * 404, jos pisteessä ei ole kiinteistöä (esim. vesialue, joka ei kuulu kiinteistöön).
 */
import { json, cors, serviceClient } from "../_shared/supabase.ts";
import { findParcelAt } from "../_shared/sources/mml.ts";
import { checkMunicipalOwnership, ownershipSourceFor } from "../_shared/sources/omistus.ts";
import { transformGeometry } from "../_shared/proj.ts";

/** Omistajatyyppi kartan klikkaukselle. Virhe ei kaada hakua: palautetaan null. */
async function ownerInfo(
  kt: string,
  lon: number,
  lat: number,
  polygon: { type: "Polygon"; coordinates: number[][][] },
): Promise<unknown> {
  try {
    const db = serviceClient();
    const call = () => db.rpc("owner_info_at", { p_kiinteistotunnus: kt, p_lon: lon, p_lat: lat });
    let { data, error } = await call();
    if (error) throw error;
    if (data === null && ownershipSourceFor(kt.slice(0, 3))) {
      // Ei vielä tietoa: tarkistetaan kunnan kartasta tämä palsta ja kysytään uudelleen
      const g = transformGeometry(4326, 3067, polygon);
      await checkMunicipalOwnership(db, kt, { coordinates: [g.coordinates] });
      ({ data, error } = await call());
      if (error) throw error;
    }
    return data ?? null;
  } catch (e) {
    console.warn(`owner_info_at: ${(e as Error).message}`);
    return null;
  }
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 59 || lat > 71 || lon < 19 || lon > 32) {
      return json({ error: "Anna piste Suomesta parametreina lat ja lon" }, 400);
    }
    const apiKey = Deno.env.get("MML_API_KEY");
    if (!apiKey) return json({ error: "MML_API_KEY puuttuu palvelimen asetuksista" }, 500);
    try {
      const hit = await findParcelAt(lat, lon, apiKey);
      if (!hit) return json({ error: "Tässä kohdassa ei ole kiinteistöä" }, 404);
      return json({ ...hit, owner_info: await ownerInfo(hit.kiinteistotunnus, lon, lat, hit.geometry) });
    } catch (e) {
      return json({ error: `Kiinteistön haku epäonnistui: ${(e as Error).message}` }, 502);
    }
  });
}
