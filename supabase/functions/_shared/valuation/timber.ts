/**
 * Alustava puuston arvo Metsäkeskuksen kuviotiedoista ja Luken kantohinnoista.
 *
 * Menetelmä (kantorahan mukainen hakkuuarvo, kuten metsätilakaupan arvioissa):
 *  1. Kuvion tukki- ja kuitupuutilavuus (m³/ha × ha) jaetaan puulajeille kuvion
 *     puulajiosuuksien mukaan: mänty, kuusi, lehtipuu (lehtipuu hinnoitellaan koivuna).
 *  2. Hakkuutapa ja siten kantohinta valitaan kehitysluokan mukaan:
 *       uudistuskypsä, suojuspuu-, siemenpuumetsikkö, ylispuustoinen taimikko,
 *       eri-ikäisrakenteinen -> uudistushakkuu (Luke 8021)
 *       varttunut kasvatusmetsikkö -> harvennus (8023)
 *       nuori kasvatusmetsikkö    -> ensiharvennus (8022)
 *  3. Taimikoille, joissa ei ole vielä myytävää puuta, lasketaan taimikon
 *     kustannusarvo (karkea, €/ha).
 *  4. Tilavuus, jota ei ole jaettu tukiksi tai kuiduksi, ei ole mukana (hukkapuu).
 * Kantohinnat ovat oman Luken hinta-alueen tuoreimman viikon hintoja; jos alueelta ei ole
 * hintaa, käytetään oletushintoja (DEFAULT_PRICES) ja siitä kerrotaan erittelyssä.
 */
import type { Stand } from "./types.ts";

export type CuttingMethod = "8021" | "8023" | "8022";
export const CUTTING_METHOD_NAME: Record<CuttingMethod, string> = {
  "8021": "uudistushakkuu",
  "8023": "harvennushakkuu",
  "8022": "ensiharvennus",
};

/** Puulaji -> [tukki, kuitu] puutavaralajit (Luke N1..N6). */
const ASSORTMENT_BY_SPECIES = {
  manty: ["N1", "N4"],
  kuusi: ["N2", "N5"],
  lehtipuu: ["N3", "N6"],
} as const;
type SpeciesGroup = keyof typeof ASSORTMENT_BY_SPECIES;

export const ASSORTMENT_NAME: Record<string, string> = {
  N1: "Mäntytukki",
  N2: "Kuusitukki",
  N3: "Koivutukki",
  N4: "Mäntykuitu",
  N5: "Kuusikuitu",
  N6: "Koivukuitu",
};

/**
 * Oletuskantohinnat (€/m³, Etelä-Suomen taso syksyllä 2026, pyöristetty). Käytetään vain,
 * jos tietokannassa ei ole Luken hintaa kyseiselle alueelle ja puutavaralajille.
 */
export const DEFAULT_PRICES: Record<CuttingMethod, Record<string, number>> = {
  "8021": { N1: 72, N2: 76, N3: 50, N4: 24, N5: 25, N6: 22 },
  "8023": { N1: 60, N2: 62, N3: 42, N4: 19, N5: 19, N6: 17 },
  "8022": { N1: 45, N2: 45, N3: 35, N4: 14, N5: 14, N6: 13 },
};

/** Taimikon karkea kustannusarvo, €/ha (perustamis- ja hoitokulut, ei korkoa). */
export const SEEDLING_VALUE_EUR_HA: Record<string, number> = { T1: 400, T2: 700, A0: 0 };

/** Jos kuviolta puuttuu tukki/kuitu-jako, oletettu tukkiosuus kehitysluokittain. */
const DEFAULT_SAWLOG_SHARE: Record<string, number> = { "02": 0.05, "03": 0.3, "04": 0.5, "05": 0.5, S0: 0.5, ER: 0.35, Y1: 0.4 };
const DEFAULT_PULP_SHARE: Record<string, number> = { "02": 0.75, "03": 0.6, "04": 0.45, "05": 0.45, S0: 0.45, ER: 0.55, Y1: 0.5 };

export function cuttingMethodFor(devClass: string | null): CuttingMethod | null {
  switch (devClass) {
    case "04":
    case "05":
    case "S0":
    case "Y1":
    case "ER":
      return "8021";
    case "03":
      return "8023";
    case "02":
      return "8022";
    default:
      return null;
  }
}

function speciesShares(s: Stand): Record<SpeciesGroup, number> {
  let pine = Number(s.prop_pine ?? 0), spruce = Number(s.prop_spruce ?? 0), other = Number(s.prop_other ?? 0);
  const sum = pine + spruce + other;
  if (sum <= 0) {
    // Ei osuuksia: koko tilavuus pääpuulajille.
    const main = s.main_species;
    return main === 1 ? { manty: 1, kuusi: 0, lehtipuu: 0 }
      : main === 2 ? { manty: 0, kuusi: 1, lehtipuu: 0 }
      : main === 8 ? { manty: 1, kuusi: 0, lehtipuu: 0 }
      : main ? { manty: 0, kuusi: 0, lehtipuu: 1 }
      : { manty: 1 / 3, kuusi: 1 / 3, lehtipuu: 1 / 3 };
  }
  pine /= sum;
  spruce /= sum;
  other /= sum;
  return { manty: pine, kuusi: spruce, lehtipuu: other };
}

export interface AssortmentLine {
  cutting_method: CuttingMethod;
  /** "uudistushakkuu" | "harvennushakkuu" | "ensiharvennus" */
  method_name: string;
  assortment: string;
  name: string;
  m3: number;
  eur_m3: number;
  value_eur: number;
  default_price: boolean;
}

export interface TimberResult {
  value_eur: number;
  stumpage_value_eur: number;
  seedling_value_eur: number;
  volume_m3: number;
  sawlog_m3: number;
  pulp_m3: number;
  lines: AssortmentLine[];
  by_stand: { stand_key: string; area_ha: number; development_class: string | null; value_eur: number }[];
  price_area: string;
  price_week: string | null;
  used_default_prices: boolean;
  notes: string[];
}

export function computeTimberValue(
  stands: Stand[],
  prices: { price_area: string; week: string | null; eur_m3: Record<string, number | null> | null },
): TimberResult {
  const lines = new Map<string, AssortmentLine>();
  const byStand: TimberResult["by_stand"] = [];
  let seedling = 0, volume = 0, sawlog = 0, pulp = 0;
  let usedDefault = false;
  const notes: string[] = [];

  const price = (method: CuttingMethod, a: string): [number, boolean] => {
    const v = prices.eur_m3?.[`${method}:${a}`];
    if (typeof v === "number" && v > 0) return [v, false];
    return [DEFAULT_PRICES[method][a], true];
  };

  for (const s of stands) {
    const area = Number(s.area_ha) || 0;
    const vol = Number(s.volume_m3_ha ?? 0) * area;
    volume += vol;
    const method = cuttingMethodFor(s.development_class);
    let standValue = 0;

    if (!method) {
      const v = (SEEDLING_VALUE_EUR_HA[s.development_class ?? ""] ?? 0) * area;
      seedling += v;
      byStand.push({ stand_key: s.stand_key, area_ha: area, development_class: s.development_class, value_eur: v });
      continue;
    }

    let sawHa = s.sawlog_m3_ha === null || s.sawlog_m3_ha === undefined ? null : Number(s.sawlog_m3_ha);
    let pulpHa = s.pulp_m3_ha === null || s.pulp_m3_ha === undefined ? null : Number(s.pulp_m3_ha);
    if (sawHa === null && pulpHa === null) {
      const v = Number(s.volume_m3_ha ?? 0);
      sawHa = v * (DEFAULT_SAWLOG_SHARE[s.development_class!] ?? 0.3);
      pulpHa = v * (DEFAULT_PULP_SHARE[s.development_class!] ?? 0.6);
    }
    const saw = (sawHa ?? 0) * area, pul = (pulpHa ?? 0) * area;
    sawlog += saw;
    pulp += pul;

    const shares = speciesShares(s);
    for (const g of Object.keys(shares) as SpeciesGroup[]) {
      const [logA, pulpA] = ASSORTMENT_BY_SPECIES[g];
      for (const [a, m3] of [[logA, saw * shares[g]], [pulpA, pul * shares[g]]] as [string, number][]) {
        if (m3 <= 0) continue;
        const [p, isDefault] = price(method, a);
        usedDefault ||= isDefault;
        const key = `${method}:${a}`;
        const line = lines.get(key) ??
          {
            cutting_method: method,
            method_name: CUTTING_METHOD_NAME[method],
            assortment: a,
            // Sama puutavaralaji voi esiintyä kahdesti eri hakkuutavoilla (eri kuviot, eri kantohinta).
            name: `${ASSORTMENT_NAME[a]} (${CUTTING_METHOD_NAME[method]})`,
            m3: 0,
            eur_m3: p,
            value_eur: 0,
            default_price: isDefault,
          };
        line.m3 += m3;
        line.value_eur += m3 * p;
        lines.set(key, line);
        standValue += m3 * p;
      }
    }
    byStand.push({ stand_key: s.stand_key, area_ha: area, development_class: s.development_class, value_eur: standValue });
  }

  if (usedDefault) {
    notes.push(
      `Kantohinta-alueelta ${prices.price_area} ei saatu kaikkia Luken hintoja, joten osa puutavaralajeista on hinnoiteltu oletushinnoilla.`,
    );
  }
  const stumpage = [...lines.values()].reduce((a, l) => a + l.value_eur, 0);
  const sorted = [...lines.values()]
    .map((l) => ({ ...l, m3: Math.round(l.m3), value_eur: Math.round(l.value_eur) }))
    .filter((l) => l.m3 > 0)
    .sort((a, b) => a.cutting_method.localeCompare(b.cutting_method) || a.assortment.localeCompare(b.assortment));

  return {
    value_eur: Math.round(stumpage + seedling),
    stumpage_value_eur: Math.round(stumpage),
    seedling_value_eur: Math.round(seedling),
    volume_m3: Math.round(volume),
    sawlog_m3: Math.round(sawlog),
    pulp_m3: Math.round(pulp),
    lines: sorted,
    by_stand: byStand.map((b) => ({ ...b, area_ha: Math.round(b.area_ha * 100) / 100, value_eur: Math.round(b.value_eur) })),
    price_area: prices.price_area,
    price_week: prices.week,
    used_default_prices: usedDefault,
    notes,
  };
}
