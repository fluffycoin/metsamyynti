/**
 * Päästä päähän -testi paikallista PostGIS-kantaa vasten ilman MML-avainta:
 * käyttää annettua suorakaidetta kiinteistön rajana, hakee oikeat metsäkuviot,
 * kaavat ja kantohinnat ja tulostaa property_summary-koosteen.
 *
 *   DATABASE_URL=postgres://... deno run -A scripts/smoke-test.ts 837 327000 6815000 400
 */
import postgres from "npm:postgres@3.4.4";
import { fetchStands } from "../supabase/functions/_shared/sources/metsakeskus.ts";
import { fetchZoning } from "../supabase/functions/_shared/sources/kaavat/index.ts";
import { fetchStumpagePrices } from "../supabase/functions/_shared/sources/luke.ts";
import type { BBox } from "../supabase/functions/_shared/wfs.ts";

const [kunta = "837", xs = "327000", ys = "6815000", sizeS = "400"] = Deno.args;
const [x, y, size] = [Number(xs), Number(ys), Number(sizeS)];
const kt = `${kunta}99999990001`; // keksitty testitunnus
const square = {
  type: "Polygon",
  coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
};
const bbox: BBox = [x - 5, y - 5, x + size + 5, y + size + 5];

const sql = postgres(Deno.env.get("DATABASE_URL")!, { onnotice: () => {} });
const [{ upsert_property: id }] = await sql`select upsert_property(${kt}, ${sql.json(square)}, 'Testitila')`;

const t0 = performance.now();
const [stands, zoning, prices] = await Promise.all([
  fetchStands(bbox),
  fetchZoning(kunta, bbox),
  fetchStumpagePrices(2),
]);
console.error(`haut ${Math.round(performance.now() - t0)} ms: kuvioita ${stands.length}, kaavarivejä ${zoning.rows.length}, hintoja ${prices.length}`);

await sql`select replace_forest_stands(${id}, ${sql.json(stands as never)})`;
if (zoning.rows.length) await sql`select upsert_zoning_areas(${kunta}, ${sql.json(zoning.rows as never)})`;
for (const p of prices) {
  await sql`insert into stumpage_prices ${sql(p)} on conflict do nothing`;
}
const [{ property_summary: s }] = await sql`select property_summary(${kt})`;
s.geometry = "(lyhennetty)";
s.forest.stands = s.forest.stands.slice(0, 3);
s.zoning = s.zoning.slice(0, 5);
console.log(JSON.stringify({ ...s, zoning_notes: zoning.notes }, null, 2));
await sql.end();
