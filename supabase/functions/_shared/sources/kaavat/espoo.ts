/**
 * Espoo: Trimble/Tekla WFS (kartat.espoo.fi). Koordinaatisto ETRS-GK25 (EPSG:3879).
 *
 *  - GIS:Asemakaavat (avoin): asemakaavahakemisto eli kaavan tunnus, nimi, tila,
 *    voimaantulopäivä ja linkki kaavamääräyksiin (PDF).
 *  - GIS:Yleiskaavat_alueet (vaatii tunnukset): yleiskaavojen aluevaraukset eli
 *    kaavamerkintä (AT, AME, M, V ...). Haetaan vain, jos ympäristömuuttujat
 *    ESPOO_WFS_USER ja ESPOO_WFS_PASSWORD on asetettu. Tunnukset pyydetään Espoon
 *    kaupungilta (ks. docs/luvat/06-espoo-kaavarajapinta.md). Ilman niitä yleiskaavan
 *    merkintä tulee myyjän valinnasta (set_property_land_use, p_designation).
 *
 * Yleiskaavatason ominaisuuksien nimiä ei ole voitu tarkistaa ilman tunnuksia, joten
 * merkintä luetaan joustavasti (designationFromProps). Tarkista ensimmäisellä ajolla.
 */
import { wfs1GetGmlFeatures } from "../../wfs.ts";
import { transformBBox, transformGeometry } from "../../proj.ts";
import { date, first, sentences, ZoningRow, ZoningSource } from "./types.ts";
import { DESIGNATIONS } from "../../valuation/kaava.ts";

const WFS = "https://kartat.espoo.fi/teklaogcweb/wfs.ashx";
const SRID = 3879;
const YK_LAYER = "GIS:Yleiskaavat_alueet";

function credentials(): { user: string; password: string } | null {
  const user = Deno.env.get("ESPOO_WFS_USER");
  const password = Deno.env.get("ESPOO_WFS_PASSWORD");
  return user && password ? { user, password } : null;
}

/**
 * Etsii kaavamerkinnän ominaisuuksista: ensin kentät, joiden nimi viittaa merkintään,
 * sitten mikä tahansa arvo, joka näyttää tunnetulta kaavamerkinnältä (esim. "AT", "AT-1").
 */
export function designationFromProps(p: Record<string, unknown>): string | null {
  const looksLike = (v: string) => {
    const m = v.trim().toUpperCase().match(/^([A-ZÅÄÖ]{1,4})(?:[0-9]{1,3}|[-/ ][0-9A-ZÅÄÖ/]{1,6})?$/);
    if (!m) return false;
    for (let n = m[1].length; n > 0; n--) if (DESIGNATIONS[m[1].slice(0, n)]) return true;
    return false;
  };
  const entries = Object.entries(p).map(([k, v]) => [k, first(v)] as [string, string | null]);
  const named = entries.filter(([k]) => /merkint|lyhenne|tunnus|kaytto|kayttotark|symbol|luokka/i.test(k) && !/kaavatunnus/i.test(k));
  for (const [, v] of [...named, ...entries]) if (v && looksLike(v)) return v.trim().toUpperCase();
  return null;
}

async function fetchAsemakaavat(bbox: [number, number, number, number]): Promise<ZoningRow[]> {
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
}

async function fetchYleiskaavat(
  bbox: [number, number, number, number],
  auth: { user: string; password: string },
): Promise<ZoningRow[]> {
  const features = await wfs1GetGmlFeatures({
    endpoint: WFS,
    typeName: YK_LAYER,
    bbox: transformBBox(3067, SRID, bbox),
    auth,
  });
  const rows: ZoningRow[] = [];
  for (const f of features) {
    if (!f.geometry) continue;
    const p = f.properties;
    const designation = designationFromProps(p);
    if (!designation) continue;
    const planName = Object.entries(p).find(([k]) => /kaava.*nimi|nimi/i.test(k))?.[1];
    rows.push({
      level: "yleiskaava",
      source_layer: YK_LAYER,
      source_id: String(f.id ?? `${designation}:${JSON.stringify(bbox)}`),
      plan_name: first(planName),
      plan_id: null,
      approved_on: null,
      designation,
      efficiency: null,
      building_right_m2: null,
      regulations: "Yleiskaavan aluevaraus (Espoon kaupungin yleiskaavarajapinta).",
      geometry: transformGeometry(SRID, 3067, f.geometry),
      raw: p,
    });
  }
  return rows;
}

export const espoo: ZoningSource = {
  municipalityCode: "049",
  municipalityName: "Espoo",
  coverage:
    "Asemakaavahakemisto: voimassa olevan asemakaavan nimi, tunnus, voimaantulo ja linkki kaavamääräyksiin. Yleiskaavan merkintä (esim. AT) haetaan Espoon rajapinnasta, kun tunnukset on saatu; siihen asti myyjä valitsee sen kaavakartasta.",
  async fetch(bbox) {
    const auth = credentials();
    const [ak, yk] = await Promise.all([
      fetchAsemakaavat(bbox),
      auth ? fetchYleiskaavat(bbox, auth).catch(() => [] as ZoningRow[]) : Promise.resolve([] as ZoningRow[]),
    ]);
    return [...ak, ...yk];
  },
};
