/**
 * Ryhti (Syke, rakennetun ympäristön tietojärjestelmä): valtakunnallinen asemakaava- ja
 * yleiskaavahakemisto OGC API Featuresina. Avoin, ei API-avainta. Kattavuus kasvaa sitä
 * mukaa kuin kunnat vievät kaavojaan Ryhtiin (marraskuu 2026: n. 5 800 asemakaavaa ja
 * 650 yleiskaavaa; pilottikunnista vain Espoon yleiskaavat).
 * Käytetään kaikille kunnille kunnan oman lähteen lisäksi.
 */
import { ogcApiItems } from "../../wfs.ts";
import { date, first, sentences, ZoningRow } from "./types.ts";

const OGC = "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections";
const COLLECTIONS = ["pub_valid_ld_plan_ix_gs", "pub_valid_lm_plan_ix_gs"] as const;

function documentLink(v: unknown): string | null {
  try {
    const docs = JSON.parse(String(v ?? "[]")) as { uri?: string; name_fin?: string }[];
    return docs.find((d) => d.uri)?.uri ?? null;
  } catch {
    return null;
  }
}

export async function fetchRyhti(municipalityCode: string, bbox: [number, number, number, number]): Promise<ZoningRow[]> {
  const lists = await Promise.all(COLLECTIONS.map((c) => ogcApiItems({ collectionUrl: `${OGC}/${c}`, bbox })));
  const rows: ZoningRow[] = [];
  COLLECTIONS.forEach((c, i) => {
    for (const f of lists[i]) {
      if (!f.geometry) continue;
      const p = f.properties;
      const areas = String(p.administrative_area_identifiers ?? "");
      if (areas && !areas.includes(`"${municipalityCode}"`)) continue;
      if (p.period_of_validity_end) continue; // kumottu tai korvattu
      const type = first(p.plan_type_name_fin) ?? "";
      const doc = documentLink(p.documents);
      rows.push({
        level: /yleiskaava/i.test(type) ? "yleiskaava" : "asemakaava",
        source_layer: `ryhti:${c}`,
        source_id: String(p.id ?? f.id),
        plan_name: first(p.name_fin),
        plan_id: first(p.permanent_plan_identifier),
        approved_on: date(p.approval_date),
        designation: null,
        efficiency: null,
        building_right_m2: null,
        regulations: sentences(
          type ? `${type}.` : null,
          first(p.description_fin),
          doc ? `Kaava-asiakirjat: ${doc}` : null,
        ),
        geometry: f.geometry,
        raw: p,
      });
    }
  });
  return rows;
}
