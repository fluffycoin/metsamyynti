/**
 * Hinta-arvio ja ilmoitusluonnos paikallisesta kannasta (aja ensin scripts/smoke-test.ts).
 *
 *   DATABASE_URL=postgres://... deno run -A scripts/valuation-smoke.ts 85899999990001 [peltoala_ha]
 */
import postgres from "npm:postgres@3.4.4";
import { LandPrice, StaticSource } from "../supabase/functions/_shared/valuation/land.ts";
import { generateListing } from "../supabase/functions/_shared/valuation/listing.ts";
import { valuate } from "../supabase/functions/_shared/valuation/valuate.ts";

const sql = postgres(Deno.env.get("DATABASE_URL")!, { onnotice: () => {} });
const [kt, field] = Deno.args;
const [{ property_summary: s }] = await sql`select property_summary(${kt}, null)`;
if (!s) throw new Error(`Kiinteistöä ${kt} ei ole kannassa`);
const rows = await sql<LandPrice[]>`select land_use, eur::float8 as eur, unit, scope, area_key, year, source, is_estimate from land_price_reference`;
const src = new StaticSource(rows);
const prices = await src.prices({ municipality_code: s.municipality.code, region_name: s.municipality.region_name });
const v = valuate(s, prices, { id: "reference", name: "Avoimet tilastot ja arviot" }, { land_use: field ? { field_ha: Number(field) } : {} });
const l = generateListing([{ summary: s, valuation: v }]);
console.log(l.sections.markdown);
console.error(JSON.stringify({ land: v.land.parts, timber: { value: v.timber.value_eur, lines: v.timber.lines, week: v.timber.price_week }, kaava: v.kaava.building_right, notes: v.notes }, null, 1));
await sql.end();
