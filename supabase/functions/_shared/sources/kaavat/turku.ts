/**
 * Turku: avoin Trimble-palvelu (turku.asiointi.fi), ei kirjautumista, EPSG:3877.
 * Asemakaava-alueet OGC API Featuresista (GeoJSON) ja aluevaraukset (käyttötarkoitus,
 * kaavamerkintä) Kunta-GML WFS:stä: korttelit, M-, V-, E-, S-, W- ja muut alueet sekä
 * yleiskaavan käyttötarkoitusalueet.
 */
import { ogcApiItems, wfs1GetGmlFeatures } from "../../wfs.ts";
import { transformBBox, transformGeometry } from "../../proj.ts";
import { date, first, sentences, ZoningRow, ZoningSource } from "./types.ts";

const OGC = "https://turku.asiointi.fi/TrimbleOGCApi/collections";
const WFS = "https://turku.asiointi.fi/teklaogcweb/wfs.ashx";
const SRID = 3877;

const AREA_LAYERS = [
  "akaava:Kortteli",
  "akaava:MaaMetsatalousalue",
  "akaava:Virkistysalue",
  "akaava:Erityisalue",
  "akaava:Suojelualue",
  "akaava:Vesialue",
  "akaava:Muualue",
  "akaava:LuokittelematonAlue",
];

export const turku: ZoningSource = {
  municipalityCode: "853",
  municipalityName: "Turku",
  coverage: "Asemakaava-alueet ja asemakaavan aluevaraukset (käyttötarkoitus), yleiskaavan käyttötarkoitusalueet.",
  async fetch(bbox) {
    const b = transformBBox(3067, SRID, bbox);
    const [plans, master, ...areaLists] = await Promise.all([
      ogcApiItems({ collectionUrl: `${OGC}/GIS:Akaava_Asemakaava_alueet`, bbox }),
      wfs1GetGmlFeatures({ endpoint: WFS, typeName: "ykaava:Kayttotarkoitusalue", bbox: b }),
      ...AREA_LAYERS.map((typeName) => wfs1GetGmlFeatures({ endpoint: WFS, typeName, bbox: b })),
    ]);
    const rows: ZoningRow[] = [];
    for (const f of plans) {
      if (!f.geometry) continue;
      const p = f.properties;
      const tunnus = first(p.Kaavatunnus);
      rows.push({
        level: "asemakaava",
        source_layer: "GIS:Akaava_Asemakaava_alueet",
        source_id: tunnus ?? String(f.id),
        plan_name: first(p.KaavanNimi) ? `Asemakaava ${first(p.KaavanNimi)}` : null,
        plan_id: tunnus,
        approved_on: date(p.TullutVoimaanPvm),
        designation: null,
        efficiency: null,
        building_right_m2: null,
        regulations: sentences(first(p.Kaavalaji) ? `${first(p.Kaavalaji)}, ${(first(p.Kaavatilanne) ?? "").toLowerCase()}.` : null),
        geometry: f.geometry,
        raw: p,
      });
    }
    AREA_LAYERS.forEach((layer, i) => {
      for (const f of areaLists[i]) {
        if (!f.geometry) continue;
        const p = f.properties;
        const vaihe = first(p.kohteenvaihe);
        if (vaihe && !/lainvoima|voimassa/i.test(vaihe)) continue;
        rows.push({
          level: "asemakaava",
          source_layer: layer,
          source_id: String(first(p.tunnus) ?? f.id),
          plan_name: first(p.kaavatunnus) ? `Asemakaava ${first(p.kaavatunnus)}` : null,
          plan_id: first(p.kaavatunnus),
          approved_on: null,
          designation: first(p.kaavamerkinta) ?? first(p.kayttotarkoitus),
          efficiency: null,
          building_right_m2: null,
          regulations: null,
          geometry: transformGeometry(SRID, 3067, f.geometry),
          raw: p,
        });
      }
    });
    for (const f of master) {
      if (!f.geometry) continue;
      const p = f.properties;
      rows.push({
        level: "yleiskaava",
        source_layer: "ykaava:Kayttotarkoitusalue",
        source_id: String(f.id),
        plan_name: "Turun yleiskaava",
        plan_id: null,
        approved_on: null,
        designation: first(p.kaavamerkinta),
        efficiency: null,
        building_right_m2: null,
        regulations: sentences(first(p.merkinta), first(p.merkintaaKoskevaMaarays)),
        geometry: transformGeometry(SRID, 3067, f.geometry),
        raw: p,
      });
    }
    return rows;
  },
};
