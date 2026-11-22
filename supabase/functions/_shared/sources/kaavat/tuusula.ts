/**
 * Tuusula: avoin WFS (kartta.tuusula.fi/tuusula_rajapintapalvelu), CC BY 4.0, EPSG:3879.
 *   swdata:KAAV_asemakaava-alueet_PDF               asemakaava-alueet + linkki määräyksiin
 *   swdata:Kaavarekisteri                            kaavayksiköt (laji, pinta-ala, selite)
 *   swdata:KAAV_Osayleiskaava_alue_lainvoimainen_PDF lainvoimaiset osayleiskaavat + määräykset
 */
import { wfs1GetGmlFeatures } from "../../wfs.ts";
import { transformBBox, transformGeometry } from "../../proj.ts";
import { first, num, sentences, ZoningRow, ZoningSource } from "./types.ts";

const WFS = "https://kartta.tuusula.fi/tuusula_rajapintapalvelu/ows.ashx";
const SRID = 3879;

export const tuusula: ZoningSource = {
  municipalityCode: "858",
  municipalityName: "Tuusula",
  coverage: "Asemakaava-alueet, kaavarekisterin kaavayksiköt ja lainvoimaiset osayleiskaavat, linkit määräyksiin.",
  async fetch(bbox) {
    const b = transformBBox(3067, SRID, bbox);
    const get = (typeName: string) => wfs1GetGmlFeatures({ endpoint: WFS, typeName, bbox: b });
    const [areas, units, master] = await Promise.all([
      get("swdata:KAAV_asemakaava-alueet_PDF"),
      get("swdata:Kaavarekisteri"),
      get("swdata:KAAV_Osayleiskaava_alue_lainvoimainen_PDF"),
    ]);
    const rows: ZoningRow[] = [];
    for (const f of areas) {
      if (!f.geometry) continue;
      const p = f.properties;
      const tunnus = first(p.tunnus2);
      rows.push({
        level: "asemakaava",
        source_layer: "swdata:KAAV_asemakaava-alueet_PDF",
        source_id: String(first(p.id) ?? f.id),
        plan_name: tunnus ? `Asemakaava ${tunnus}` : null,
        plan_id: tunnus,
        approved_on: null,
        designation: null,
        efficiency: null,
        building_right_m2: null,
        regulations: first(p.linkki) ? `Kaavakartta ja -määräykset: ${first(p.linkki)}` : null,
        geometry: transformGeometry(SRID, 3067, f.geometry),
        raw: p,
      });
    }
    for (const f of units) {
      if (!f.geometry) continue;
      const p = f.properties;
      rows.push({
        level: "asemakaava",
        source_layer: "swdata:Kaavarekisteri",
        source_id: String(first(p.kaavayksik) ?? first(p.id) ?? f.id),
        plan_name: first(p.c_kaavatun) ? `Asemakaava ${first(p.c_kaavatun)}` : null,
        plan_id: first(p.c_kaavatun),
        approved_on: null,
        designation: first(p.kaavayklaj),
        efficiency: null,
        building_right_m2: null,
        regulations: sentences(
          first(p.kaavayksik) ? `Kaavayksikkö ${first(p.kaavayksik)}.` : null,
          first(p.c_ktarsel),
          num(p.i_pintaala) !== null ? `Pinta-ala ${first(p.i_pintaala)} m².` : null,
        ),
        geometry: transformGeometry(SRID, 3067, f.geometry),
        raw: p,
      });
    }
    for (const f of master) {
      if (!f.geometry) continue;
      const p = f.properties;
      rows.push({
        level: "yleiskaava",
        source_layer: "swdata:KAAV_Osayleiskaava_alue_lainvoimainen_PDF",
        source_id: String(f.id ?? first(p.nimi)),
        plan_name: first(p.nimi),
        plan_id: first(p.nimi),
        approved_on: null,
        designation: null,
        efficiency: null,
        building_right_m2: null,
        regulations: sentences(
          first(p.tyyppi) ? `${first(p.tyyppi)}${first(p.huom) ? ` (${first(p.huom)!.toLowerCase()})` : ""}.` : null,
          first(p.paatos) ? `Hyväksytty ${first(p.paatos)}.` : null,
          first(p.linkki) ? `Määräykset: ${encodeURI(first(p.linkki)!)}` : null,
        ),
        geometry: transformGeometry(SRID, 3067, f.geometry),
        raw: p,
      });
    }
    return rows;
  },
};
