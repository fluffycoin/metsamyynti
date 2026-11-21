/**
 * Päästä päähän -testi paikallista PostGIS-kantaa vasten oikeilla rajapinnoilla.
 *
 *   # oikea kiinteistö (vaatii MML_API_KEY)
 *   DATABASE_URL=postgres://... MML_API_KEY=... deno run -A scripts/smoke-test.ts 837-585-11-181
 *   # ilman avainta: suorakaide kiinteistön rajana (kunta, x, y, sivu metreinä, EPSG:3067)
 *   DATABASE_URL=postgres://... deno run -A scripts/smoke-test.ts 837 327000 6815000 400
 */
import postgres from "npm:postgres@3.4.4";
import { parseKiinteistotunnus } from "../supabase/functions/_shared/kiinteistotunnus.ts";
import { collectPropertyData } from "../supabase/functions/_shared/lookup.ts";
import { fetchStands } from "../supabase/functions/_shared/sources/metsakeskus.ts";
import { fetchZoning } from "../supabase/functions/_shared/sources/kaavat/index.ts";
import { fetchStumpagePrices } from "../supabase/functions/_shared/sources/luke.ts";

const sql = postgres(Deno.env.get("DATABASE_URL")!, { onnotice: () => {} });
const t0 = performance.now();
let kt: string, maaralaNo: string | null = null, municipality: string;
let geometry: unknown, stands: unknown[], zoning: unknown[], notes: string[];

if (Deno.args.length === 1) {
  const k = parseKiinteistotunnus(Deno.args[0]);
  const d = await collectPropertyData(k, Deno.env.get("MML_API_KEY")!);
  ({ geometry, stands, zoning, notes } = d);
  kt = k.long;
  maaralaNo = d.storedAs.maarala_no;
  municipality = k.municipalityCode;
} else {
  const [kunta, xs, ys, sizeS] = Deno.args;
  const [x, y, size] = [Number(xs), Number(ys), Number(sizeS)];
  kt = `${kunta}99999990001`; // keksitty testitunnus
  municipality = kunta;
  geometry = { type: "Polygon", coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] };
  const bbox: [number, number, number, number] = [x - 5, y - 5, x + size + 5, y + size + 5];
  const [s, z] = await Promise.all([fetchStands(bbox), fetchZoning(kunta, bbox)]);
  stands = s;
  zoning = z.rows;
  notes = z.notes;
}
const prices = await fetchStumpagePrices(2);
console.error(`haut ${Math.round(performance.now() - t0)} ms: kuvioita ${stands.length}, kaavarivejä ${zoning.length}, hintoja ${prices.length}`);

const [{ upsert_property: id }] = await sql`select upsert_property(${kt}, ${sql.json(geometry as never)}, null, ${maaralaNo})`;
await sql`select replace_forest_stands(${id}, ${sql.json(stands as never)})`;
if (zoning.length) await sql`select upsert_zoning_areas(${municipality}, ${sql.json(zoning as never)})`;
for (const p of prices) await sql`insert into stumpage_prices ${sql(p)} on conflict do nothing`;

const [{ property_summary: s }] = await sql`select property_summary(${kt}, ${maaralaNo})`;
s.geometry = "(lyhennetty)";
s.forest.stands = s.forest.stands.slice(0, 3);
s.zoning = s.zoning.slice(0, 5);
console.log(JSON.stringify({ ...s, notes }, null, 2));
await sql.end();
