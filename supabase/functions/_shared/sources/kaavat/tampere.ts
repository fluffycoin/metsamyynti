/** Tampere: avoin GeoServer (geodata.tampere.fi), CC BY 4.0. */
import { wfsGetFeatures } from "../../wfs.ts";
import { date, hrefOf, num, ZoningRow, ZoningSource } from "./types.ts";

const WFS = "https://geodata.tampere.fi/geoserver/ows";

export const tampere: ZoningSource = {
  municipalityCode: "837",
  municipalityName: "Tampere",
  coverage: "Asemakaavan kaavayksiköt (käyttötarkoitus, rakennusoikeus, tehokkuus) ja asemakaavan käyttötarkoitusalueet.",
  async fetch(bbox) {
    const [units, areas] = await Promise.all([
      wfsGetFeatures({ endpoint: WFS, typeName: "maankaytto:KAAVAYKSIKOT_ALUE_PUBLIC_VIEW", bbox, sortBy: "KG_KKAAVYKS" }),
      wfsGetFeatures({ endpoint: WFS, typeName: "julkinen:KAYTTOTARKOITUSALUEET_PUBLIC_MVIEW", bbox, sortBy: "ID" }),
    ]);
    const rows: ZoningRow[] = [];
    for (const f of units) {
      if (!f.geometry) continue;
      const p = f.properties;
      rows.push({
        level: "asemakaava",
        source_layer: "maankaytto:KAAVAYKSIKOT_ALUE_PUBLIC_VIEW",
        source_id: String(p.KG_KKAAVYKS ?? f.id),
        plan_name: p.C_KAAVTUNN ? `Asemakaava ${p.C_KAAVTUNN}` : null,
        plan_id: p.C_KAAVTUNN ? String(p.C_KAAVTUNN) : null,
        approved_on: date(p.C_VAHPVM),
        designation: p.C_KAYTTOTA ? String(p.C_KAYTTOTA) : null,
        efficiency: num(p.I_TEHOKKUUS),
        building_right_m2: num(p.I_RAKOIKEUS),
        regulations: [
          p.C_KERRLKM ? `Suurin sallittu kerrosluku ${p.C_KERRLKM}.` : null,
          hrefOf(p.KAAVALINKKI) ? `Kaavakartta ja -määräykset: ${hrefOf(p.KAAVALINKKI)}` : null,
        ].filter(Boolean).join(" ") || null,
        geometry: f.geometry,
        raw: p,
      });
    }
    for (const f of areas) {
      if (!f.geometry) continue;
      const p = f.properties;
      rows.push({
        level: "asemakaava",
        source_layer: "julkinen:KAYTTOTARKOITUSALUEET_PUBLIC_MVIEW",
        source_id: String(p.ID ?? f.id),
        plan_name: p.KAAVATUNNUS ? `Asemakaava ${p.KAAVATUNNUS}` : null,
        plan_id: p.KAAVATUNNUS ? String(p.KAAVATUNNUS) : null,
        approved_on: null,
        designation: p.KAAVAMERKINTA ? String(p.KAAVAMERKINTA) : null,
        efficiency: num(p.TEHOKKUUSLUKU),
        building_right_m2: num(p.KM2),
        regulations: p.KAYTTOTARKOITUS ? String(p.KAYTTOTARKOITUS) : null,
        geometry: f.geometry,
        raw: p,
      });
    }
    return rows;
  },
};
