/**
 * Espoo: Trimble/Tekla WFS (kartat.espoo.fi). Yksityiskohtaiset asemakaavatasot (akaava:*,
 * GIS:Kaavayksikot_julkinen, yleiskaavat) vaativat tunnukset, mutta asemakaavahakemisto
 * GIS:Asemakaavat on avoin: kaavan tunnus, nimi, tila, voimaantulopäivä ja linkki
 * kaavamääräyksiin (PDF). Koordinaatisto ETRS-GK25 (EPSG:3879).
 */
import { wfs1GetGmlFeatures } from "../../wfs.ts";
import { transformBBox, transformGeometry } from "../../proj.ts";
import { date, first, sentences, ZoningRow, ZoningSource } from "./types.ts";

const WFS = "https://kartat.espoo.fi/teklaogcweb/wfs.ashx";
const SRID = 3879;

export const espoo: ZoningSource = {
  municipalityCode: "049",
  municipalityName: "Espoo",
  coverage:
    "Asemakaavahakemisto: voimassa olevan asemakaavan nimi, tunnus, voimaantulo ja linkki kaavamääräyksiin. Käyttötarkoitus ja rakennusoikeus luetaan toistaiseksi kaavakartasta.",
  async fetch(bbox) {
    const features = await wfs1GetGmlFeatures({
      endpoint: WFS,
      typeName: "GIS:Asemakaavat",
      bbox: transformBBox(3067, SRID, bbox),
    });
    const rows: ZoningRow[] = [];
    for (const f of features) {
      if (!f.geometry) continue;
      const p = f.properties;
      const vaihe = first(p.VIIMEINENVAIHE);
      if (vaihe && !/voimassa|lainvoima/i.test(vaihe) && !/lainvoima/i.test(first(p.KAAVATILANNE) ?? "")) continue;
      const tunnus = first(p.KAAVATUNNUS);
      rows.push({
        level: "asemakaava",
        source_layer: "GIS:Asemakaavat",
        source_id: tunnus ?? String(f.id),
        plan_name: first(p.KAAVANNIMI),
        plan_id: tunnus,
        approved_on: date(p.VIIMEINENVAIHEPVMXML ?? p.VIIMEINENVAIHEPVM),
        designation: null,
        efficiency: null,
        building_right_m2: null,
        regulations: sentences(
          first(p.KAAVALAJI) ? `${first(p.KAAVALAJI)}, ${(first(p.KAAVATILANNE) ?? "").toLowerCase()}.` : null,
          first(p.KAAVAMAARAYS) ? `Kaavakartta ja -määräykset: ${first(p.KAAVAMAARAYS)}` : null,
        ),
        geometry: transformGeometry(SRID, 3067, f.geometry),
        raw: p,
      });
    }
    return rows;
  },
};
