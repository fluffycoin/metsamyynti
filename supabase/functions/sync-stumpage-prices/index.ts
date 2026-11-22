/**
 * Päivittää Luken kantohinnat. Ajastetaan viikoittain (pg_cron + pg_net, ks. README).
 */
import { syncStumpagePrices } from "../_shared/sources/luke.ts";
import { json, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async () => {
  try {
    return json({ upserted: await syncStumpagePrices(serviceClient()) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
