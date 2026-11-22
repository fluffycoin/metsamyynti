/**
 * GET /property-at?lat=60.40&lon=25.33
 *
 * Kartan klikkaus -> kiinteistö. Palauttaa pisteessä olevan kiinteistön tunnuksen ja
 * palstan rajan, jotta käyttöliittymä voi korostaa sen ja avata kiinteistösivun:
 *   { "kiinteistotunnus": "75341200020007", "display": "753-412-2-7",
 *     "geometry": GeoJSON Polygon (WGS84) }
 * 404, jos pisteessä ei ole kiinteistöä (esim. vesialue, joka ei kuulu kiinteistöön).
 */
import { json, cors } from "../_shared/supabase.ts";
import { findParcelAt } from "../_shared/sources/mml.ts";

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
      return json(hit);
    } catch (e) {
      return json({ error: `Kiinteistön haku epäonnistui: ${(e as Error).message}` }, 502);
    }
  });
}
