/**
 * Kiinteistön datahaku lähteistä (ilman tietokantaa): MML-rajat, Metsäkeskuksen kuviot ja
 * kaavat. Tallennus tehdään kutsujassa (Edge Function tai testiskripti).
 */
import type { Kiinteistotunnus } from "./kiinteistotunnus.ts";
import { bboxOf, Feature } from "./wfs.ts";
import { fetchMaarala, fetchParcels } from "./sources/mml.ts";
import { fetchStands } from "./sources/metsakeskus.ts";
import { fetchZoning, ZoningRow } from "./sources/kaavat/index.ts";

export interface CollectedData {
  /** Kiinteistön (tai määräalan) rajat, EPSG:3067 */
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
  /** Mille tunnukselle rajat ja tiedot tallennetaan: määräala, jos sen alue on rekisterissä, muuten emokiinteistö */
  storedAs: { maarala_no: string | null };
  maaralaPoint: number[] | null;
  stands: Feature[];
  zoning: ZoningRow[];
  notes: string[];
}

export class NotFoundError extends Error {}

export async function collectPropertyData(kt: Kiinteistotunnus, apiKey: string): Promise<CollectedData> {
  const notes: string[] = [];
  let geometry: CollectedData["geometry"] | null = null;
  let maaralaNo: string | null = null;
  let maaralaPoint: number[] | null = null;

  if (kt.maarala) {
    const m = await fetchMaarala(kt.long, kt.maarala, apiKey);
    if (!m) throw new NotFoundError(`Määräalaa ${kt.display} ei löytynyt`);
    if (m.geometry) {
      geometry = m.geometry;
      maaralaNo = kt.maarala;
    } else {
      maaralaPoint = m.point;
      notes.push(
        `Määräalan ${kt.display} rajoja ei ole kiinteistörekisterissä (vain sijaintipiste). Tiedot näytetään koko emokiinteistöltä; rajaa määräala kartalle tarkempaa arviota varten.`,
      );
    }
  }
  if (!geometry) {
    const parcels = await fetchParcels(kt.long, apiKey);
    if (!parcels) throw new NotFoundError(`Kiinteistöä ${kt.display.replace(/-M\d+$/, "")} ei löytynyt`);
    geometry = parcels.geometry;
  }

  const bbox = bboxOf(geometry, 5);
  const [stands, zoning] = await Promise.all([
    fetchStands(bbox).catch((e) => {
      notes.push(`Metsävaratietojen haku epäonnistui: ${(e as Error).message}`);
      return [] as Feature[];
    }),
    fetchZoning(kt.municipalityCode, bbox).catch((e) => {
      notes.push(`Kaavatietojen haku epäonnistui: ${(e as Error).message}`);
      return { rows: [] as ZoningRow[], notes: [] as string[] };
    }),
  ]);
  notes.push(...zoning.notes);
  return { geometry, storedAs: { maarala_no: maaralaNo }, maaralaPoint, stands, zoning: zoning.rows, notes };
}
