/**
 * Maanmittauslaitoksen kiinteistötietojen avoin rajapinta (OGC API Features).
 * Kiinteistörajat ja palstat ovat avointa dataa (CC BY 4.0), mutta rajapinta vaatii
 * maksuttoman API-avaimen: https://www.maanmittauslaitos.fi/rajapinnat/api-avaimen-ohje
 * Avain annetaan ympäristömuuttujana MML_API_KEY.
 *
 * HUOM: Omistaja- ja lainhuutotiedot EIVÄT tule tästä rajapinnasta, vaan
 * käyttöluvanvaraisesta kiinteistötietopalvelusta (ks. docs/luvat/).
 */
import { FeatureCollection, fetchJson } from "../wfs.ts";

export const MML_KIINTEISTO_API =
  "https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3";

/** Kokoelma, jossa kiinteistön palstat ovat alueina. */
export const PARCEL_COLLECTION = "PalstanSijaintitiedot";

export interface MmlParcels {
  /** Kaikki palstat yhtenä MultiPolygonina (EPSG:3067). */
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
  parcelCount: number;
  raw: FeatureCollection;
}

export async function fetchParcels(kiinteistotunnus14: string, apiKey: string): Promise<MmlParcels | null> {
  const u = new URL(`${MML_KIINTEISTO_API}/collections/${PARCEL_COLLECTION}/items`);
  u.searchParams.set("kiinteistotunnus", kiinteistotunnus14);
  u.searchParams.set("crs", "http://www.opengis.net/def/crs/EPSG/0/3067");
  u.searchParams.set("limit", "1000");
  u.searchParams.set("api-key", apiKey);
  const fc = await fetchJson<FeatureCollection>(u.toString());
  const polys: number[][][][] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === "Polygon") polys.push(f.geometry.coordinates as number[][][]);
    else if (f.geometry.type === "MultiPolygon") polys.push(...(f.geometry.coordinates as number[][][][]));
  }
  if (polys.length === 0) return null;
  return { geometry: { type: "MultiPolygon", coordinates: polys }, parcelCount: fc.features.length, raw: fc };
}
