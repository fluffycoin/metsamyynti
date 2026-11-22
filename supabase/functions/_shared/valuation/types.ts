/** property_summary()-funktion palauttama kooste (vain hinta-arviossa ja ilmoituksessa käytetyt kentät). */
export interface PropertySummary {
  kiinteistotunnus: string;
  display_id: string;
  name: string | null;
  municipality: { code: string; name: string | null; region_name?: string | null; zoning_pilot: boolean };
  kind: "metsa" | "pelto" | "tontti" | "muu";
  is_maarala: boolean;
  maarala_no: string | null;
  area_ha: number;
  center?: { lat: number; lon: number };
  forest: { forest_ha: number; total_volume_m3: number; stands: Stand[] };
  zoning: ZoningHit[];
  stumpage_prices: { price_area: string; week: string | null; eur_m3: Record<string, number | null> | null };
  fetched_at?: string | null;
}

export interface Stand {
  stand_key: string;
  area_ha: number;
  development_class: string | null;
  main_species: number | null;
  mean_age: number | null;
  volume_m3_ha: number | null;
  sawlog_m3_ha: number | null;
  pulp_m3_ha: number | null;
  prop_pine: number | null;
  prop_spruce: number | null;
  prop_other: number | null;
  fertility_class: number | null;
  cutting_type: number | null;
  cutting_year: number | null;
  measured_at: string | null;
}

export interface ZoningHit {
  level: "asemakaava" | "yleiskaava" | "maakuntakaava";
  plan_name: string | null;
  plan_id: string | null;
  approved_on: string | null;
  designation: string | null;
  efficiency: number | null;
  building_right_m2: number | null;
  regulations: string | null;
  overlap_m2: number;
  /** Kaava-alueen (kaavayksikön) koko pinta-ala; lisätty tässä vaiheessa property_summaryyn. */
  zone_area_m2?: number | null;
  source_layer: string;
}

/** Myyjän ilmoittama maankäyttö, jota avoimista lähteistä ei saada (esim. peltoala). */
export interface LandUseInput {
  field_ha?: number | null;
  building_sites?: number | null;
  /** Kaavamerkintä kaavakartasta (esim. "AT"), kun rajapinta ei kerro sitä. */
  designation?: string | null;
  /** Rantaviivan pituus metreinä (myyjän ilmoittama). */
  shore_m?: number | null;
}

/** Hyväksytty kolmannen osapuolen puustoarvio. */
export interface VerifiedTimber {
  timber_value_eur: number;
  verifier: string;
  valued_on: string | null;
  document_path: string;
}

/** Myyjän oma hinta-arvio (korvaa lasketun, näytetään merkinnällä "Myyjän hinta-arvio"). */
export interface SellerPrice {
  land_value_eur: number | null;
  timber_value_eur: number | null;
  total_eur: number;
  note: string | null;
  set_at: string;
}
