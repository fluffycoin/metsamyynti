/**
 * Varmistaa, että kiinteistön tiedot ovat kannassa ja tuoreita (enintään 30 päivää), ja
 * palauttaa property_summaryn. Käytössä property-summary-, valuation- ja listing-draft-funktioissa.
 */
import type { Kiinteistotunnus } from "./kiinteistotunnus.ts";
import { collectPropertyData, NotFoundError } from "./lookup.ts";
import { checkMunicipalOwnership } from "./sources/omistus.ts";

export const MAX_AGE_DAYS = 30;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface EnsuredProperty {
  // deno-lint-ignore no-explicit-any
  summary: any;
  storedAs: { maarala_no: string | null };
  maaralaPoint: number[] | null;
  notes: string[];
}

// deno-lint-ignore no-explicit-any
export async function ensureProperty(db: any, kt: Kiinteistotunnus, refresh = false): Promise<EnsuredProperty> {
  // Määräala on tallennettu omana rivinään vain, jos sen alue on rekisterissä.
  const candidates = kt.maarala ? [kt.maarala, null] : [null];
  let stored: { maarala_no: string | null } | null = null;
  for (const m of candidates) {
    const q = db.from("properties").select("id, fetched_at, geom, maarala_no").eq("kiinteistotunnus", kt.long);
    const { data } = await (m === null ? q.is("maarala_no", null) : q.eq("maarala_no", m)).maybeSingle();
    const fresh = data?.geom && data?.fetched_at &&
      Date.now() - new Date(data.fetched_at).getTime() < MAX_AGE_DAYS * 86_400_000;
    if (fresh) {
      stored = { maarala_no: data.maarala_no };
      break;
    }
  }

  let notes: string[] = [];
  let maaralaPoint: number[] | null = null;
  if (!stored || refresh) {
    const apiKey = Deno.env.get("MML_API_KEY");
    if (!apiKey) throw new HttpError(500, "MML_API_KEY puuttuu palvelimen asetuksista");

    let data;
    try {
      data = await collectPropertyData(kt, apiKey);
    } catch (e) {
      if (e instanceof NotFoundError) throw new HttpError(404, e.message);
      throw new HttpError(502, `Kiinteistörajojen haku epäonnistui: ${(e as Error).message}`);
    }
    notes = data.notes;
    maaralaPoint = data.maaralaPoint;
    stored = data.storedAs;

    const { data: propertyId, error: upErr } = await db.rpc("upsert_property", {
      p_kiinteistotunnus: kt.long,
      p_geojson: data.geometry,
      p_maarala_no: data.storedAs.maarala_no,
    });
    if (upErr) throw new HttpError(500, upErr.message);

    // Kunnan maa (avoin maanomistuskartta): vain koko kiinteistölle, ei määräalalle
    if (!data.storedAs.maarala_no) await checkMunicipalOwnership(db, kt.long, data.geometry);

    const { error: stErr } = await db.rpc("replace_forest_stands", {
      p_property_id: propertyId,
      p_features: data.stands,
    });
    if (stErr) notes.push(`Kuvioiden tallennus epäonnistui: ${stErr.message}`);

    if (data.zoning.length) {
      const { error: zErr } = await db.rpc("upsert_zoning_areas", {
        p_municipality_code: kt.municipalityCode,
        p_rows: data.zoning,
      });
      if (zErr) notes.push(`Kaavatietojen tallennus epäonnistui: ${zErr.message}`);
    }
  }

  const { data: summary, error } = await db.rpc("property_summary", {
    p_kiinteistotunnus: kt.long,
    p_maarala_no: stored!.maarala_no,
  });
  if (error) throw new HttpError(500, error.message);
  return { summary, storedAs: stored!, maaralaPoint, notes };
}
