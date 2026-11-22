/**
 * Hinta-arvion laskenta ja tallennus kannan kanssa (Edge Functionien yhteinen osa).
 */
import { ensureProperty } from "../ensure.ts";
import { parseKiinteistotunnus } from "../kiinteistotunnus.ts";
import { stumpagePricesFresh, syncStumpagePrices } from "../sources/luke.ts";
import { landPriceSource } from "./land.ts";
import type { PropertySummary } from "./types.ts";
import { valuate, Valuation } from "./valuate.ts";

/** properties-rivin tunnus muotoon, jonka parseKiinteistotunnus ymmärtää. */
export function ktOfRow(row: { kiinteistotunnus: string; maarala_no: string | null }) {
  return parseKiinteistotunnus(row.maarala_no ? `${row.kiinteistotunnus}M${row.maarala_no}` : row.kiinteistotunnus);
}

export interface ValuationRun {
  summary: PropertySummary & { property_id: number };
  valuation: Valuation;
  valuation_id: number | null;
  notes: string[];
}

/**
 * Laskee arvion. includePrivate = käytetäänkö omistajan syötteitä (peltoala, oma hinta,
 * vahvistettu puustoarvio); store = tallennetaanko valuations-tauluun.
 */
export async function runValuation(
  // deno-lint-ignore no-explicit-any
  db: any,
  kt: ReturnType<typeof parseKiinteistotunnus>,
  opts: { includePrivate: boolean; store: boolean; userId?: string | null; refresh?: boolean },
): Promise<ValuationRun> {
  let ensured = await ensureProperty(db, kt, opts.refresh);
  const notes = [...ensured.notes];

  // Kantohinnat: jos kannassa ei ole tuoreita Luken hintoja (viikkoajo puuttuu), haetaan ne nyt.
  if (!stumpagePricesFresh(ensured.summary?.stumpage_prices)) {
    try {
      await syncStumpagePrices(db);
      ensured = { ...ensured, summary: (await ensureProperty(db, kt)).summary };
    } catch (e) {
      notes.push(`Luken kantohintojen päivitys epäonnistui (${(e as Error).message}).`);
    }
  }
  const summary = ensured.summary as ValuationRun["summary"];

  let inputs: { land_use?: unknown; seller?: unknown; verified?: unknown } = {};
  if (opts.includePrivate) {
    const { data, error } = await db.rpc("valuation_inputs", { p_property_id: summary.property_id });
    if (error) throw new Error(`Hinta-arvion syötteiden haku epäonnistui: ${error.message}`);
    inputs = data ?? {};
  }

  const source = landPriceSource(db);
  let prices = {};
  try {
    prices = await source.prices({ municipality_code: summary.municipality.code, region_name: summary.municipality.region_name ?? null });
  } catch (e) {
    notes.push(`Maan hintatasoa ei saatu (${(e as Error).message}).`);
  }

  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const lu = inputs.land_use as { field_ha?: unknown; building_sites?: unknown; designation?: unknown; shore_m?: unknown } | null | undefined;
  const sel = inputs.seller as Record<string, unknown> | null | undefined;
  const ver = inputs.verified as Record<string, unknown> | null | undefined;
  const valuation = valuate(summary, prices, { id: source.id, name: source.name }, {
    land_use: lu ? { field_ha: n(lu.field_ha), building_sites: n(lu.building_sites), designation: (lu.designation as string) ?? null, shore_m: n(lu.shore_m) } : {},
    seller: sel
      ? {
        total_eur: Number(sel.total_eur),
        land_value_eur: n(sel.land_value_eur),
        timber_value_eur: n(sel.timber_value_eur),
        note: (sel.note as string) ?? null,
        set_at: String(sel.set_at),
      }
      : null,
    verified: ver
      ? {
        timber_value_eur: Number(ver.timber_value_eur),
        verifier: String(ver.verifier),
        valued_on: (ver.valued_on as string) ?? null,
        document_path: String(ver.document_path),
      }
      : null,
  });
  valuation.notes.unshift(...notes);

  let valuationId: number | null = null;
  if (opts.store) {
    const { data, error } = await db.from("valuations").insert({
      property_id: summary.property_id,
      land_value_eur: valuation.land.value_eur,
      timber_value_eur: valuation.timber.value_eur,
      timber_status: valuation.timber.status,
      verified_doc_path: valuation.timber.verified?.document_path ?? null,
      verified_by: valuation.timber.verified?.verifier ?? null,
      land_source: source.id,
      created_by: opts.userId ?? null,
      method: valuation,
    }).select("id").single();
    if (error) valuation.notes.push(`Arvion tallennus epäonnistui: ${error.message}`);
    else valuationId = data.id;
  }
  return { summary, valuation, valuation_id: valuationId, notes };
}
