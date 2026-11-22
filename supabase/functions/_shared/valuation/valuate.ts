/**
 * Kiinteistön hinta-arvio: maan arvo + puuston arvo (+ rakennusoikeus / rakennuspaikat).
 * Puhdas funktio: kaikki data annetaan parametreina, joten logiikka on testattavissa ilman kantaa.
 */
import { interpretZoning, KaavaResult } from "./kaava.ts";
import { computeLandValue, LandPrice, LandResult, LandUse } from "./land.ts";
import { computeTimberValue, TimberResult } from "./timber.ts";
import type { LandUseInput, PropertySummary, SellerPrice, VerifiedTimber } from "./types.ts";

export const TIMBER_LABEL = {
  alustava: "Alustava puuston arvo",
  vahvistettu: "Vahvistettu puuston arvo",
} as const;

export interface Valuation {
  kiinteistotunnus: string;
  display_id: string;
  area_ha: number;
  land: LandResult & { label: "Maan arvo"; status: "arvio" };
  timber: TimberResult & {
    label: (typeof TIMBER_LABEL)[keyof typeof TIMBER_LABEL];
    status: "alustava" | "vahvistettu";
    computed_value_eur: number;
    verified: VerifiedTimber | null;
  };
  kaava: KaavaResult;
  /** Laskettu kokonaisarvo (maa + puusto). */
  computed_total_eur: number;
  /** Vaihteluväli: alustavalle ±15 %, vahvistetulla puustolla ±10 %. */
  range_eur: { low: number; high: number };
  seller: SellerPrice | null;
  /** Ilmoituksessa näytettävä hinta ja sen merkintä. */
  display: {
    price_eur: number;
    label: "Hinta-arvio" | "Myyjän hinta-arvio";
    price_source: "alustava" | "vahvistettu" | "myyjan_oma";
  };
  implied_eur_ha: number | null;
  notes: string[];
  method_version: 1;
}

export function valuate(
  summary: PropertySummary,
  prices: Partial<Record<LandUse, LandPrice>>,
  priceSource: { id: string; name: string },
  opts: { land_use?: LandUseInput; verified?: VerifiedTimber | null; seller?: SellerPrice | null } = {},
): Valuation {
  const kaava = interpretZoning(summary, { designation: opts.land_use?.designation });
  const land = computeLandValue(summary, kaava, prices, opts.land_use ?? {}, priceSource);
  const timber = computeTimberValue(summary.forest.stands, summary.stumpage_prices);
  const verified = opts.verified ?? null;
  const timberValue = verified ? Math.round(verified.timber_value_eur) : timber.value_eur;
  const status = verified ? "vahvistettu" : "alustava";
  const total = land.value_eur + timberValue;
  const spread = verified ? 0.1 : 0.15;
  const seller = opts.seller ?? null;

  const notes = [...land.notes, ...timber.notes];
  if (!summary.forest.stands.length && summary.kind === "metsa") {
    notes.push("Kiinteistöltä ei löytynyt Metsäkeskuksen kuviotietoja, joten puuston arvoa ei voitu laskea.");
  }
  if (!summary.area_ha) {
    notes.push("Kiinteistön rajoja ei ole vielä haettu.");
  }

  return {
    kiinteistotunnus: summary.kiinteistotunnus,
    display_id: summary.display_id,
    area_ha: summary.area_ha,
    land: { ...land, label: "Maan arvo", status: "arvio" },
    timber: { ...timber, label: TIMBER_LABEL[status], status, computed_value_eur: timber.value_eur, value_eur: timberValue, verified },
    kaava,
    computed_total_eur: total,
    range_eur: { low: Math.round(total * (1 - spread)), high: Math.round(total * (1 + spread)) },
    seller,
    display: seller
      ? { price_eur: seller.total_eur, label: "Myyjän hinta-arvio", price_source: "myyjan_oma" }
      : { price_eur: total, label: "Hinta-arvio", price_source: status },
    implied_eur_ha: summary.area_ha > 0 ? Math.round(total / summary.area_ha) : null,
    notes,
    method_version: 1,
  };
}
