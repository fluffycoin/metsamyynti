/**
 * Päivittää Luken kantohinnat. Ajastetaan viikoittain (pg_cron + pg_net, ks. README).
 */
import { fetchStumpagePrices } from "../_shared/sources/luke.ts";
import { json, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async () => {
  const prices = await fetchStumpagePrices(8);
  const db = serviceClient();
  const { error } = await db.from("stumpage_prices").upsert(prices);
  if (error) return json({ error: error.message }, 500);
  return json({ upserted: prices.length, latest_week: prices.map((p) => p.week).sort().at(-1) });
});
