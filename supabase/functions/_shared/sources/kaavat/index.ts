/**
 * Pilottikuntien kaavalähteet. Kunta, jolla ei vielä ole lähdettä, palauttaa
 * tyhjän listan ja selityksen; ilmoitukseen tulee silloin ohje tarkistaa kaava kunnasta.
 *
 * Tilanne 21.11.2026:
 *   Tampere  ✓ avoin
 *   Vantaa   osittain: avoin taso kaava:kaavayksikot_sample sisältää vain ~1 100 kaavayksikköä;
 *            koko ajantasa-asemakaavan rajapinta selvitettävänä
 *   Espoo    rajapinta vaatii tunnukset (kartat.espoo.fi) -> haetaan käyttölupa
 *   Turku, Kerava, Sipoo, Tuusula, Pirkkala -> lähteet selvitettävänä;
 *   vaihtoehtona SYKE:n Ryhti-palvelu, johon kunnat vievät kaavoja tietomallimuodossa.
 */
import type { BBox } from "../../wfs.ts";
import { tampere } from "./tampere.ts";
import { vantaa } from "./vantaa.ts";
import type { ZoningRow, ZoningSource } from "./types.ts";

export const ZONING_SOURCES: Record<string, ZoningSource> = {
  [tampere.municipalityCode]: tampere,
  [vantaa.municipalityCode]: vantaa,
};

export const PENDING_SOURCES: Record<string, string> = {
  "049": "Espoon kaavarajapinta vaatii käyttäjätunnukset; käyttölupa haetaan.",
  "853": "Turun kaavarajapinta selvitettävänä.",
  "245": "Keravan kaavarajapinta selvitettävänä.",
  "753": "Sipoon kaavarajapinta selvitettävänä.",
  "858": "Tuusulan kaavarajapinta selvitettävänä.",
  "604": "Pirkkalan kaavarajapinta selvitettävänä.",
};

export async function fetchZoning(
  municipalityCode: string,
  bbox: BBox,
): Promise<{ rows: ZoningRow[]; note: string | null }> {
  const src = ZONING_SOURCES[municipalityCode];
  if (!src) {
    return {
      rows: [],
      note: PENDING_SOURCES[municipalityCode] ??
        "Kunnan kaavatietoja ei vielä haeta automaattisesti. Tarkista kaavatilanne kunnan kaavoituksesta.",
    };
  }
  return { rows: await src.fetch(bbox), note: null };
}

export type { ZoningRow, ZoningSource };
