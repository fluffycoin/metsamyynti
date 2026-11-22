/**
 * Tuo maanomistusaineiston (esim. Metsahaku-projektin kaupunkien maat) tietokantaan.
 *
 * Aluerajaukset (GeoJSON, EPSG:3067 tai WGS84; muu koordinaatisto: --srid=3879 tms.):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run -A scripts/import-maanomistus.ts \
 *     alueet --source=vantaa --category=kunta --owner="Vantaan kaupunki" vantaa.geojson
 *   Featuren ominaisuudet category ja owner_name (jos on) voittavat komentorivin arvot.
 *
 * Kiinteistölista (CSV: kiinteistotunnus;category;owner_name, otsikkorivi valinnainen):
 *   ... deno run -A scripts/import-maanomistus.ts lista --source=metsahaku omistajat.csv
 *
 * category: kunta | valtio | seurakunta | yhtio | yhdistys | yhteisalue
 * Saman lähteen (--source) aiemmat alueet korvataan.
 */
import { parseArgs } from "jsr:@std/cli@1/parse-args";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { parseKiinteistotunnus } from "../supabase/functions/_shared/kiinteistotunnus.ts";
import { transformGeometry } from "../supabase/functions/_shared/proj.ts";

const CATEGORIES = ["kunta", "valtio", "seurakunta", "yhtio", "yhdistys", "yhteisalue"];
const args = parseArgs(Deno.args, { string: ["source", "category", "owner", "srid"] });
const [mode, file] = args._.map(String);
if (!["alueet", "lista"].includes(mode) || !file || !args.source) {
  console.error("Käyttö: import-maanomistus.ts alueet|lista --source=<nimi> [--category=kunta] [--owner=...] <tiedosto>");
  Deno.exit(1);
}
if (args.category && !CATEGORIES.includes(args.category)) {
  console.error(`Tuntematon category ${args.category}. Sallitut: ${CATEGORIES.join(", ")}`);
  Deno.exit(1);
}
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

if (mode === "alueet") {
  // deno-lint-ignore no-explicit-any
  const fc = JSON.parse(await Deno.readTextFile(file)) as { crs?: any; features: any[] };
  const crsName = String(fc.crs?.properties?.name ?? "");
  let srid = args.srid ? Number(args.srid) : Number(crsName.match(/(\d{4,5})$/)?.[1] ?? 0);
  if (!srid) {
    const first = JSON.stringify(fc.features[0]?.geometry?.coordinates ?? []).match(/-?\d+(\.\d+)?/)?.[0];
    srid = Math.abs(Number(first)) <= 180 ? 4326 : 3067;
  }
  const features = fc.features.filter((f) => f.geometry).map((f) => ({
    ...f,
    geometry: transformGeometry(srid, 3067, f.geometry),
  }));
  if (!args.category && features.some((f) => !CATEGORIES.includes(f.properties?.category))) {
    console.error("Anna --category, tai jokaisella featurella pitää olla properties.category");
    Deno.exit(1);
  }
  let n = 0;
  for (let i = 0; i < features.length; i += 200) {
    const { data, error } = await db.rpc("import_land_owner_areas", {
      p_source: args.source,
      p_category: args.category ?? "kunta",
      p_owner_name: args.owner ?? null,
      p_features: features.slice(i, i + 200),
      p_replace: i === 0,
    });
    if (error) throw new Error(error.message);
    n += data as number;
  }
  console.log(`Tuotiin ${n} aluetta lähteeseen ${args.source} (koordinaatisto EPSG:${srid})`);
} else {
  const rows = (await Deno.readTextFile(file)).split(/\r?\n/).map((l) => l.split(/[;,\t]/).map((c) => c.trim()))
    .filter((r) => r[0] && /\d/.test(r[0]) && !/tunnus/i.test(r[0]))
    .map((r) => ({
      kiinteistotunnus: parseKiinteistotunnus(r[0]).long,
      category: r[1] || args.category,
      owner_name: r[2] || args.owner || null,
    }));
  const bad = rows.filter((r) => !CATEGORIES.includes(r.category ?? ""));
  if (bad.length) {
    console.error(`${bad.length} riviltä puuttuu kelvollinen category (esim. ${bad[0].kiinteistotunnus}). Anna --category.`);
    Deno.exit(1);
  }
  let n = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const { data, error } = await db.rpc("import_land_owner_parcels", { p_source: args.source, p_rows: rows.slice(i, i + 1000) });
    if (error) throw new Error(error.message);
    n += data as number;
  }
  console.log(`Tuotiin ${n} kiinteistöä lähteestä ${args.source}`);
}
