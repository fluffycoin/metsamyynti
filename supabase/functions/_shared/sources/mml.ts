/**
 * Maanmittauslaitoksen kiinteistötietojen avoin rajapinta (OGC API Features, v3).
 * Kiinteistörajat ja palstat ovat avointa dataa (CC BY 4.0), mutta rajapinta vaatii
 * maksuttoman API-avaimen: https://www.maanmittauslaitos.fi/rajapinnat/api-avaimen-ohje
 * Avain annetaan ympäristömuuttujana MML_API_KEY.
 *
 * Kokoelmat (testattu 21.11.2026):
 *   PalstanSijaintitiedot          kiinteistön palstat alueina; suodin ?kiinteistotunnus=14 numeroa
 *   MaaraalanOsanSijaintitiedot    määräalan osat; suodin ?maaraalatunnus=<14>M<4>, useimmiten
 *                                  vain piste (määräalan rajoja ei ole mitattu)
 *
 * HUOM: Omistaja- ja lainhuutotiedot EIVÄT tule tästä rajapinnasta, vaan
 * käyttöluvanvaraisesta kiinteistötietopalvelusta.
 */
import { FeatureCollection, fetchJson } from "../wfs.ts";

export const MML_KIINTEISTO_API =
  "https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3";

const CRS_3067 = "http://www.opengis.net/def/crs/EPSG/0/3067";

export interface MmlParcels {
  /** Kaikki palstat yhtenä MultiPolygonina (EPSG:3067). */
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
  parcelCount: number;
  /** Esitysmuoto, esim. "91-16-745-4" */
  display: string | null;
}

export interface MmlMaarala {
  /** Määräalan osien alueet, jos ne on rekisterissä (EPSG:3067). */
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] } | null;
  /** Määräalan sijaintipiste, jos alueita ei ole (EPSG:3067). */
  point: number[] | null;
  display: string | null;
}

async function items(collection: string, params: Record<string, string>, apiKey: string): Promise<FeatureCollection> {
  const u = new URL(`${MML_KIINTEISTO_API}/collections/${collection}/items`);
  u.searchParams.set("f", "json");
  u.searchParams.set("crs", CRS_3067);
  u.searchParams.set("limit", "1000");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("api-key", apiKey);
  try {
    return await fetchJson<FeatureCollection>(u.toString());
  } catch (e) {
    // Virheviestissä on URL, jossa on API-avain: poistetaan se.
    throw new Error((e as Error).message.replaceAll(apiKey, "***"));
  }
}

function polygonsOf(fc: FeatureCollection): number[][][][] {
  const polys: number[][][][] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === "Polygon") polys.push(f.geometry.coordinates as number[][][]);
    else if (f.geometry.type === "MultiPolygon") polys.push(...(f.geometry.coordinates as number[][][][]));
  }
  return polys;
}

export async function fetchParcels(kiinteistotunnus14: string, apiKey: string): Promise<MmlParcels | null> {
  const fc = await items("PalstanSijaintitiedot", { kiinteistotunnus: kiinteistotunnus14 }, apiKey);
  const polys = polygonsOf(fc);
  if (polys.length === 0) return null;
  return {
    geometry: { type: "MultiPolygon", coordinates: polys },
    parcelCount: fc.features.length,
    display: (fc.features[0]?.properties.kiinteistotunnuksenEsitysmuoto as string) ?? null,
  };
}

/** Määräalatunnus MML:n muodossa: 14 numeroa + "M" + 4 numeroa, esim. 22440400010030M0501. */
export function maaralatunnus(kiinteistotunnus14: string, maarala: string): string {
  return `${kiinteistotunnus14}M${maarala.padStart(4, "0")}`;
}

export async function fetchMaarala(kiinteistotunnus14: string, maarala: string, apiKey: string): Promise<MmlMaarala | null> {
  const fc = await items("MaaraalanOsanSijaintitiedot", { maaraalatunnus: maaralatunnus(kiinteistotunnus14, maarala) }, apiKey);
  if (fc.features.length === 0) return null;
  const polys = polygonsOf(fc);
  const pt = fc.features.find((f) => f.geometry?.type === "Point")?.geometry?.coordinates as number[] | undefined;
  return {
    geometry: polys.length ? { type: "MultiPolygon", coordinates: polys } : null,
    point: polys.length ? null : pt ?? null,
    display: (fc.features[0].properties.maaraalatunnuksenEsitysmuoto as string) ?? null,
  };
}

/** Pisteen (x, y) sisältyminen renkaaseen (ray casting). */
export function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x: number, y: number, rings: number[][][]): boolean {
  return pointInRing(x, y, rings[0]) && !rings.slice(1).some((h) => pointInRing(x, y, h));
}

/** Kiinteistö pisteessä (WGS84). Palauttaa palstan rajan WGS84:nä. */
export async function findParcelAt(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<{ kiinteistotunnus: string; display: string; geometry: { type: "Polygon"; coordinates: number[][][] } } | null> {
  const d = 0.00002; // n. 1–2 m
  const u = new URL(`${MML_KIINTEISTO_API}/collections/PalstanSijaintitiedot/items`);
  u.searchParams.set("f", "json");
  u.searchParams.set("limit", "50");
  u.searchParams.set("bbox", [lon - d, lat - d, lon + d, lat + d].join(","));
  u.searchParams.set("api-key", apiKey);
  let fc: FeatureCollection;
  try {
    fc = await fetchJson<FeatureCollection>(u.toString());
  } catch (e) {
    throw new Error((e as Error).message.replaceAll(apiKey, "***"));
  }
  for (const f of fc.features) {
    if (f.geometry?.type !== "Polygon") continue;
    const rings = f.geometry.coordinates as number[][][];
    if (pointInPolygon(lon, lat, rings)) {
      return {
        kiinteistotunnus: String(f.properties.kiinteistotunnus),
        display: String(f.properties.kiinteistotunnuksenEsitysmuoto),
        geometry: { type: "Polygon", coordinates: rings },
      };
    }
  }
  return null;
}
