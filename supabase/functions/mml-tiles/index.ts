/**
 * GET /mml-tiles/{taso}/{z}/{y}/{x}
 *
 * Välityspalvelin MML:n avoimille karttakuville (WMTS, WGS84_Pseudo-Mercator), jotta
 * MML_API_KEY ei päädy selaimeen. Julkaistaan ilman JWT-tarkistusta, koska karttakirjasto
 * hakee kuvat suoraan <img>-tyyliin ilman otsakkeita.
 *
 * Tasot:
 *   taustakartta        selkeä taustakartta (ei maastosymboleita)
 *   selkokartta         vielä pelkistetympi
 *   ortokuva            ilmakuva (jpg)
 *   maastokartta        maastokartta
 *   kiinteistojaotus    kiinteistörajat (läpinäkyvä png), näkyy n. zoomista 14 alkaen
 *   kiinteistotunnukset kiinteistötunnukset (läpinäkyvä png), n. zoomista 15 alkaen
 *
 * Lähde: © Maanmittauslaitos, CC BY 4.0.
 */
const LAYERS: Record<string, string> = {
  taustakartta: "png",
  selkokartta: "png",
  ortokuva: "jpg",
  maastokartta: "png",
  kiinteistojaotus: "png",
  kiinteistotunnukset: "png",
};

const BASE = "https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0";
const cors = { "Access-Control-Allow-Origin": "*" };

export function parseTilePath(pathname: string): { layer: string; z: number; y: number; x: number } | null {
  const m = pathname.match(/\/([a-z]+)\/(\d{1,2})\/(\d+)\/(\d+)(?:\.\w+)?$/);
  if (!m || !(m[1] in LAYERS)) return null;
  const [z, y, x] = [Number(m[2]), Number(m[3]), Number(m[4])];
  if (z > 19 || y >= 2 ** z || x >= 2 ** z) return null;
  return { layer: m[1], z, y, x };
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const t = parseTilePath(new URL(req.url).pathname);
    if (!t) return new Response("Tuntematon karttataso tai ruutu", { status: 404, headers: cors });
    const apiKey = Deno.env.get("MML_API_KEY");
    if (!apiKey) return new Response("MML_API_KEY puuttuu", { status: 500, headers: cors });

    const url = `${BASE}/${t.layer}/default/WGS84_Pseudo-Mercator/${t.z}/${t.y}/${t.x}.${LAYERS[t.layer]}?api-key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      // Ruudun puuttuminen (esim. meri tai liian kaukainen zoom) ei ole virhe: tyhjä 204.
      return new Response(null, { status: res.status === 404 ? 204 : 502, headers: cors });
    }
    return new Response(res.body, {
      headers: {
        ...cors,
        "content-type": res.headers.get("content-type") ?? "image/png",
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  });
}
