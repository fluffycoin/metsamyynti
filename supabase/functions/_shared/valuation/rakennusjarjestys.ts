/**
 * Rakennusjärjestysten rakentamisen määrä asemakaava-alueen ulkopuolella (yleiskaavan
 * asuin-, kylä- ja loma-alueet). Käytetään rakennusoikeuden arvioon, kun yleiskaava ei
 * itse kerro kerrosalaa. Pilottikunnille kunnan oma sääntö, muille valtakunnallinen
 * oletus (NATIONAL_RULE), joka merkitään aina arvioksi.
 *
 * Kentät:
 *  - min_site_m2: rakennuspaikan vähimmäiskoko (pienempi paikka ei ole uusi rakennuspaikka)
 *  - efficiency: rakennusoikeus osuutena rakennuspaikan pinta-alasta (esim. 0,1 = 10 %)
 *  - min_m2 / max_m2: rakennusoikeuden ala- ja yläraja asuinrakennuspaikalla (k-m²)
 *  - residential_max_m2 / outbuilding_m2: yksittäisen asuinrakennuksen ja talousrakennusten enimmäisala
 *  - holiday_total_m2: loma-asunnon rakennuspaikan kokonaiskerrosala
 */
export interface BuildingRule {
  municipality: string;
  min_site_m2: number;
  efficiency: number;
  min_m2?: number;
  max_m2: number;
  residential_max_m2?: number;
  outbuilding_m2?: number;
  holiday_max_m2?: number;
  holiday_total_m2?: number;
  /** Merkinnät, joita kunnan oma ohjeteksti koskee (Espoo: AT ja AME). */
  applies_to?: string[];
  source: string;
  /** true = oletusarvo tai tulkinta, ei suoraan kunnan rakennusjärjestyksestä. */
  is_estimate: boolean;
}

export const BUILDING_RULES: Record<string, BuildingRule> = {
  // Espoo: Kaupunkisuunnittelukeskuksen ohje yleiskaavan AT- ja AME-alueille (Eetun toimittama).
  "049": {
    municipality: "Espoo",
    // Vähimmäiskoko 2 000 m² rakennusjärjestysluonnoksen (30.10.2025) 24 §:n mukaan, tarkistettava.
    min_site_m2: 2000,
    efficiency: 0.1,
    max_m2: 360,
    residential_max_m2: 300,
    outbuilding_m2: 60,
    holiday_max_m2: 100,
    holiday_total_m2: 120,
    applies_to: ["AT", "AME"],
    source: "Kaupunkisuunnittelukeskus, Espoon kaupunki",
    is_estimate: false,
  },
  // Tuusula: rakennusjärjestys 2025, 17.1 § ja 18.1 §.
  "858": {
    municipality: "Tuusula",
    min_site_m2: 5000,
    efficiency: 0.1,
    min_m2: 200,
    max_m2: 400,
    residential_max_m2: 300,
    outbuilding_m2: 250,
    source: "Tuusulan rakennusjärjestys 2025, 17.1 § ja 18.1 §",
    is_estimate: false,
  },
  // Tampere: rakennusjärjestysehdotus 9.6.2026, 8 § ja 9 § (ei vielä voimassa).
  "837": {
    municipality: "Tampere",
    min_site_m2: 3000,
    efficiency: 0.15,
    max_m2: 500,
    source: "Tampereen rakennusjärjestysehdotus 2026, 8–9 § (vähimmäiskoko 1 000 m², jos liitytään vesihuoltoon)",
    is_estimate: false,
  },
  // Vantaa: rakennusjärjestyksen muutosehdotus 5.5.2026, 23–24 § (AT/AP 2 000 m², A 1 000 m²).
  "092": {
    municipality: "Vantaa",
    min_site_m2: 2000,
    efficiency: 0.1,
    max_m2: 500,
    source: "Vantaan rakennusjärjestyksen muutosehdotus 2026, 23–24 §",
    is_estimate: false,
  },
  // Pirkkala: rakennusjärjestys 2016, 27–28 § ja 30 § (ranta-alueen loma-asunto 100 m²).
  "604": {
    municipality: "Pirkkala",
    min_site_m2: 5000,
    efficiency: 0.15,
    max_m2: 500,
    holiday_total_m2: 100,
    source: "Pirkkalan rakennusjärjestys 2016, 27–28 § (vähimmäiskoko 2 000 m², jos liitytään vesihuoltoon)",
    is_estimate: false,
  },
  // Kerava, Sipoo ja Turku: kunnan rakennusjärjestystä ei vielä ole palvelussa -> NATIONAL_RULE.
};

/** Valtakunnallinen oletus: tyypillinen haja-asutusalueen rakennusjärjestys. */
export const NATIONAL_RULE: BuildingRule = {
  municipality: "",
  min_site_m2: 3000,
  efficiency: 0.1,
  min_m2: 200,
  max_m2: 400,
  residential_max_m2: 300,
  holiday_total_m2: 150,
  source: "tyypillinen haja-asutusalueen rakennusjärjestys (arvio, tarkista kunnan rakennusjärjestyksestä)",
  is_estimate: true,
};

export function ruleFor(municipalityCode: string): BuildingRule {
  return BUILDING_RULES[municipalityCode] ?? NATIONAL_RULE;
}

export interface RuleResult {
  m2: number;
  sites: number;
  /** Mikä rajasi: "tehokkuus" | "enimmäismäärä" | "vähimmäismäärä" | "loma" */
  limited_by: "tehokkuus" | "enimmaismaara" | "vahimmaismaara" | "loma";
  e_m2: number;
  below_min_site: boolean;
}

/** Rakennusoikeus yhdelle rakennuspaikalle säännön mukaan. */
export function applyRule(rule: BuildingRule, siteM2: number, holiday: boolean): RuleResult {
  const e = rule.efficiency * siteM2;
  const below = siteM2 < rule.min_site_m2;
  if (holiday) {
    const cap = rule.holiday_total_m2 ?? rule.holiday_max_m2 ?? NATIONAL_RULE.holiday_total_m2!;
    return { m2: Math.round(Math.min(e, cap)), sites: below ? 0 : 1, limited_by: e < cap ? "tehokkuus" : "loma", e_m2: e, below_min_site: below };
  }
  let m2 = e, by: RuleResult["limited_by"] = "tehokkuus";
  if (m2 > rule.max_m2) (m2 = rule.max_m2), (by = "enimmaismaara");
  if (rule.min_m2 && m2 < rule.min_m2) (m2 = rule.min_m2), (by = "vahimmaismaara");
  return { m2: Math.round(m2), sites: below ? 0 : 1, limited_by: by, e_m2: e, below_min_site: below };
}
