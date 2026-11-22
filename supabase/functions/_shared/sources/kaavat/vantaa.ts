/** Vantaa: avoin GeoServer (gis.vantaa.fi), CC BY 4.0. */
import { wfsGetFeatures } from "../../wfs.ts";
import { date, num, ZoningRow, ZoningSource } from "./types.ts";

const WFS = "https://gis.vantaa.fi/geoserver/ows";

export const vantaa: ZoningSource = {
  municipalityCode: "092",
  municipalityName: "Vantaa",
  coverage:
    "Koko asemakaavahakemisto (kaavan nimi, voimaantulo, linkki määräyksiin) ja osa kaavayksiköistä (käyttötarkoitus, rakennusoikeus, tehokkuus).",
  async fetch(bbox) {
    const [plans, units] = await Promise.all([
      wfsGetFeatures({ endpoint: WFS, typeName: "kaava:asemakaavahakemisto", bbox, sortBy: "kaavanro" }),
      wfsGetFeatures({ endpoint: WFS, typeName: "kaava:kaavayksikot_sample", bbox }),
    ]);
    const rows: ZoningRow[] = [];
    for (const f of plans) {
      if (!f.geometry) continue;
      const p = f.properties;
      rows.push({
        level: "asemakaava",
        source_layer: "kaava:asemakaavahakemisto",
        source_id: String(p.kaavanro ?? f.id),
        plan_name: p.kaavan_nimi ? `Asemakaava ${p.kaavan_nimi}` : null,
        plan_id: p.kaavanro ? String(p.kaavanro) : null,
        approved_on: date(p.voimaantulopvm ?? p.hyvaksymispvm),
        designation: null,
        efficiency: null,
        building_right_m2: null,
        regulations: p.linkki ? `Kaavakartta ja -määräykset: ${p.linkki}` : null,
        geometry: f.geometry,
        raw: p,
      });
    }
    for (const f of units) {
      if (!f.geometry) continue;
      const p = f.properties;
      if (p.kaavallinenolotila && p.kaavallinenolotila !== "voimassa") continue;
      rows.push({
        level: "asemakaava",
        source_layer: "kaava:kaavayksikot_sample",
        source_id: String(p.kaavayksikkotunnus ?? f.id),
        plan_name: p.kaavatunnus ? `Asemakaava ${p.kaavatunnus}` : null,
        plan_id: p.kaavatunnus ? String(p.kaavatunnus) : null,
        approved_on: date(p.kaavanpvm),
        designation: p.kayttotarkoitusmerkinta ? String(p.kayttotarkoitusmerkinta) : null,
        efficiency: num(p.tehokkuus),
        building_right_m2: num(p.suunnitelturakennusoikeus ?? p.kerrosala),
        regulations: [
          p.kayttotarkoitusmerkintateksti ? `Merkintä ${p.kayttotarkoitusmerkintateksti}.` : null,
          num(p.kaytettyrakoikeus) !== null ? `Käytetty rakennusoikeus ${p.kaytettyrakoikeus} k-m².` : null,
          p.kaavatunnus
            ? `Kaavamääräykset: https://mfiles.matti.vantaa.fi/VampattiWebApplication/kaavamaaraykset/${String(p.kaavatunnus).padStart(6, "0")}`
            : null,
        ].filter(Boolean).join(" ") || null,
        geometry: f.geometry,
        raw: p,
      });
    }
    return rows;
  },
};
