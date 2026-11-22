/**
 * Kaavalähteet. Jokaiselle kunnalle haetaan Ryhdin valtakunnallinen kaavahakemisto ja
 * lisäksi kunnan oma rajapinta, jos sellainen on. Tilanne 21.11.2026:
 *
 *   Tampere  ✓ asemakaavan kaavayksiköt ja käyttötarkoitusalueet
 *   Turku    ✓ asemakaava-alueet, aluevaraukset (käyttötarkoitus) ja yleiskaava
 *   Tuusula  ✓ asemakaava-alueet, kaavarekisteri ja lainvoimaiset osayleiskaavat
 *   Vantaa   ✓ koko asemakaavahakemisto + osa kaavayksiköistä (avoin otos)
 *   Espoo    ✓ asemakaavahakemisto (avoin); yksityiskohtaiset tasot vaativat tunnukset
 *   Kerava, Sipoo, Pirkkala: ei löydettyä avointa rajapintaa, vain Ryhti
 */
import type { BBox } from "../../wfs.ts";
import { espoo } from "./espoo.ts";
import { fetchRyhti } from "./ryhti.ts";
import { tampere } from "./tampere.ts";
import { turku } from "./turku.ts";
import { tuusula } from "./tuusula.ts";
import { vantaa } from "./vantaa.ts";
import type { ZoningRow, ZoningSource } from "./types.ts";

export const ZONING_SOURCES: Record<string, ZoningSource> = Object.fromEntries(
  [tampere, vantaa, espoo, turku, tuusula].map((s) => [s.municipalityCode, s]),
);

export const PENDING_SOURCES: Record<string, string> = {
  "245": "Keravalta ei ole avointa kaavarajapintaa; kaavatieto vain Ryhdistä, jos kunta on vienyt sen sinne.",
  "753": "Sipoolta ei ole avointa kaavarajapintaa; kaavatieto vain Ryhdistä, jos kunta on vienyt sen sinne.",
  "604": "Pirkkalalta ei ole avointa kaavarajapintaa; kaavatieto vain Ryhdistä, jos kunta on vienyt sen sinne.",
};

export async function fetchZoning(
  municipalityCode: string,
  bbox: BBox,
): Promise<{ rows: ZoningRow[]; notes: string[] }> {
  const src = ZONING_SOURCES[municipalityCode];
  const notes: string[] = [];
  const [own, ryhti] = await Promise.all([
    src
      ? src.fetch(bbox).catch((e) => {
        notes.push(`${src.municipalityName}: kaavarajapinnan haku epäonnistui (${(e as Error).message}).`);
        return [] as ZoningRow[];
      })
      : Promise.resolve([] as ZoningRow[]),
    fetchRyhti(municipalityCode, bbox).catch((e) => {
      notes.push(`Ryhti: kaavahakemiston haku epäonnistui (${(e as Error).message}).`);
      return [] as ZoningRow[];
    }),
  ]);
  if (!src) {
    notes.push(
      PENDING_SOURCES[municipalityCode] ??
        "Kunnan omaa kaavarajapintaa ei vielä haeta; kaavatieto vain Ryhdistä. Tarkista kaavatilanne kunnan kaavoituksesta.",
    );
  }
  return { rows: [...own, ...ryhti], notes };
}

export type { ZoningRow, ZoningSource };
