/**
 * Maan arvo: pinta-ala × alueen hintataso maankäyttölajeittain.
 *
 * Hintataso tulee vaihdettavasta lähteestä (LandPriceSource):
 *  - "reference" (oletus): taulu land_price_reference, johon on koottu julkiset tilastot
 *    (Luke: pellon kauppahinnat 2025, MML:n tiedotteet metsätilojen hinnoista 2025–2026)
 *    ja arviot sinne, mistä tilastoa ei ole. Haku tarkimmasta tasosta: kunta -> maakunta -> koko maa.
 *  - "mml_kauppahinta": MML:n kauppahintarekisteri (maksullinen, vaatii käyttöluvan). Rajapinta on
 *    valmiina, toteutus kytketään, kun lupa on myönnetty (ks. MmlKauppahintaSource).
 * Lähde valitaan ympäristömuuttujalla LAND_PRICE_SOURCE.
 */
import type { KaavaResult } from "./kaava.ts";
import type { LandUseInput, PropertySummary } from "./types.ts";

export type LandUse =
  | "pelto"
  | "metsamaa_maapohja"
  | "metsatila_kokonais"
  | "rakennuspaikka"
  | "rakennusoikeus_kem2"
  | "muu_maa"
  /** Sijaintiin perustuva maan kokonaisarvo (€/ha, puusto mukaan lukien) kasvukeskusten
   *  läheisyydessä: raakamaan / odotusarvoisen maan hintataso. */
  | "raakamaa"
  /** Rakentamattoman rannan lisäarvo €/rantametri. */
  | "ranta_m";

export interface LandPrice {
  land_use: LandUse;
  eur: number;
  unit: "eur_ha" | "eur_kpl" | "eur_kem2" | "eur_m";
  scope: "kunta" | "maakunta" | "koko_maa";
  area_key: string;
  year: number | null;
  source: string;
  is_estimate: boolean;
}

export interface LandPriceQuery {
  municipality_code: string;
  region_name: string | null;
}

export interface LandPriceSource {
  readonly id: string;
  readonly name: string;
  /** Palauttaa hintatason jokaiselle maankäyttölajille, jolle sellainen löytyy. */
  prices(q: LandPriceQuery): Promise<Partial<Record<LandUse, LandPrice>>>;
}

/** Valitsee tarkimman tason riveistä (kunta > maakunta > koko maa). Testattava ilman kantaa. */
export function resolvePrices(rows: LandPrice[], q: LandPriceQuery): Partial<Record<LandUse, LandPrice>> {
  const rank = (r: LandPrice) =>
    r.scope === "kunta" && r.area_key === q.municipality_code ? 3
      : r.scope === "maakunta" && r.area_key === q.region_name ? 2
      : r.scope === "koko_maa" ? 1
      : 0;
  const out: Partial<Record<LandUse, LandPrice>> = {};
  for (const r of rows) {
    const k = rank(r);
    if (!k) continue;
    const cur = out[r.land_use];
    if (!cur || rank(cur) < k) out[r.land_use] = r;
  }
  return out;
}

/** Oletuslähde: Supabasen taulu land_price_reference. */
export class ReferenceTableSource implements LandPriceSource {
  readonly id = "reference";
  readonly name = "Avoimet tilastot ja arviot (land_price_reference)";
  // deno-lint-ignore no-explicit-any
  constructor(private db: any) {}
  async prices(q: LandPriceQuery) {
    const { data, error } = await this.db
      .from("land_price_reference")
      .select("land_use, eur, unit, scope, area_key, year, source, is_estimate")
      .or(`and(scope.eq.kunta,area_key.eq.${q.municipality_code}),scope.eq.koko_maa${
        q.region_name ? `,and(scope.eq.maakunta,area_key.eq."${q.region_name}")` : ""
      }`);
    if (error) throw new Error(`Hintatason haku epäonnistui: ${error.message}`);
    return resolvePrices((data ?? []).map((r: LandPrice) => ({ ...r, eur: Number(r.eur) })), q);
  }
}

/** Kiinteät rivit (testit ja paikallinen ajo). */
export class StaticSource implements LandPriceSource {
  readonly id = "static";
  readonly name = "Kiinteät hintatasot";
  constructor(private rows: LandPrice[]) {}
  prices(q: LandPriceQuery) {
    return Promise.resolve(resolvePrices(this.rows, q));
  }
}

/**
 * MML:n kauppahintarekisteri. Käyttölupa ja sopimus puuttuvat vielä, joten tämä heittää virheen.
 * Kun lupa on saatu: hae vertailukaupat (kunta/naapurikunnat, 3 v, maankäyttölaji) ja
 * palauta mediaani €/ha samassa muodossa; muu laskenta ei muutu.
 */
export class MmlKauppahintaSource implements LandPriceSource {
  readonly id = "mml_kauppahinta";
  readonly name = "MML kauppahintarekisteri";
  prices(_q: LandPriceQuery): Promise<Partial<Record<LandUse, LandPrice>>> {
    return Promise.reject(new Error("MML:n kauppahintarekisterin käyttölupaa ei ole vielä myönnetty"));
  }
}

// deno-lint-ignore no-explicit-any
export function landPriceSource(db: any, id = Deno.env.get("LAND_PRICE_SOURCE") ?? "reference"): LandPriceSource {
  switch (id) {
    case "mml_kauppahinta":
      return new MmlKauppahintaSource();
    default:
      return new ReferenceTableSource(db);
  }
}

// ---------------------------------------------------------------------------
// Laskenta
// ---------------------------------------------------------------------------

/** Metsämaan maapohjan arvon kerroin kasvupaikan (FERTILITYCLASS) mukaan; tuore kangas = 1. */
export const FERTILITY_FACTOR: Record<number, number> = { 1: 1.5, 2: 1.3, 3: 1.0, 4: 0.7, 5: 0.45, 6: 0.3, 7: 0.2, 8: 0.2 };
export const FERTILITY_NAME: Record<number, string> = {
  1: "lehto",
  2: "lehtomainen kangas",
  3: "tuore kangas",
  4: "kuivahko kangas",
  5: "kuiva kangas",
  6: "karukkokangas",
  7: "kalliomaa tai hietikko",
  8: "lakimetsä tai tunturi",
};

export interface LandPart {
  type: "metsamaa" | "pelto" | "muu_maa" | "rakennuspaikka" | "rakennusoikeus" | "sijaintiarvo" | "ranta";
  label: string;
  quantity: number;
  unit: "ha" | "kpl" | "k-m²" | "m";
  unit_price_eur: number;
  value_eur: number;
  basis: string;
}

export interface LandResult {
  value_eur: number;
  parts: LandPart[];
  source: { id: string; name: string; prices: LandPrice[] };
  comparison: { eur_ha: number; source: string; year: number | null } | null;
  notes: string[];
}

const num0 = (n: number) => Math.round(n).toLocaleString("fi-FI").replace(/[\u00a0\u202f]/g, " ");

/** Kaavan vaikutus sijainti- ja ranta-arvoon: rakentamisen estävä kaava laskee arvoa. */
export function planFactor(k: KaavaResult): { factor: number; reason: string } {
  const c = k.primary?.info?.category;
  if (c === "suojelu") return { factor: 0.25, reason: "kaavassa suojelualue" };
  if (c === "virkistys") return { factor: 0.4, reason: "kaavassa virkistysalue" };
  if (c === "maa_metsatalous") return { factor: 0.6, reason: "kaavassa maa- ja metsätalousalue" };
  if (c === "liikenne" || c === "erityis") return { factor: 0.5, reason: "kaavassa liikenne- tai erityisalue" };
  return { factor: 1, reason: "" };
}

const RESIDENTIAL_TONTTI = (k: KaavaResult) =>
  k.status === "asemakaava" && k.building_right.residential && (k.building_right.m2 ?? 0) > 0;

export function computeLandValue(
  summary: PropertySummary,
  kaava: KaavaResult,
  prices: Partial<Record<LandUse, LandPrice>>,
  input: LandUseInput,
  source: { id: string; name: string },
  timberValueEur = 0,
): LandResult {
  const notes: string[] = [];
  const parts: LandPart[] = [];
  const total = summary.area_ha;
  const used = Object.values(prices).filter(Boolean) as LandPrice[];

  // 1) Asemakaavan asuinrakennusoikeus: rakennusmaan arvo kerrosalan mukaan. Kaava-alueeseen
  //    kuuluva pinta-ala ei saa enää maa- tai metsätalousmaan arvoa.
  let zonedHa = 0;
  if (RESIDENTIAL_TONTTI(kaava) && prices.rakennusoikeus_kem2) {
    const p = prices.rakennusoikeus_kem2;
    const k = kaava.building_right.m2!;
    zonedHa = Math.min(total, (kaava.primary?.overlap_m2 ?? 0) / 10_000);
    parts.push({
      type: "rakennusoikeus",
      label: `Rakennusoikeus (${kaava.primary?.info?.code ?? "asemakaava"})`,
      quantity: k,
      unit: "k-m²",
      unit_price_eur: p.eur,
      value_eur: k * p.eur,
      basis: `${kaava.building_right.basis}; rakennusmaan hintataso ${p.eur} €/k-m² (${p.source})`,
    });
  }

  // 2) Rakennuspaikat (yleiskaavan kyläalue tai myyjän ilmoittamat).
  const sites = input.building_sites ?? (zonedHa > 0 ? 0 : kaava.building_right.building_sites);
  let siteHa = 0;
  if (sites > 0 && prices.rakennuspaikka) {
    const p = prices.rakennuspaikka;
    siteHa = Math.min(total - zonedHa, sites * 0.5);
    // Rakennuspaikan hinta sisältää sen alueen puuston, joten se vähennetään (puusto näkyy
    // erikseen puuston arvossa eikä tule lasketuksi kahdesti).
    const siteTimber = total > 0 ? timberValueEur * (siteHa / total) : 0;
    const value = Math.max(sites * p.eur * 0.5, sites * p.eur - siteTimber);
    parts.push({
      type: "rakennuspaikka",
      label: sites === 1 ? "Rakennuspaikka" : `Rakennuspaikat (${sites} kpl)`,
      quantity: sites,
      unit: "kpl",
      unit_price_eur: p.eur,
      value_eur: value,
      basis: (input.building_sites !== undefined && input.building_sites !== null
        ? `myyjän ilmoittama rakennuspaikkojen määrä; hintataso ${num0(p.eur)} €/kpl (${p.source})`
        : `kiinteistö on yleiskaavan ${kaava.primary?.info?.code ?? ""}-alueella ja riittävän suuri rakennuspaikaksi; edellyttää rakennuslupaa. Hintataso ${num0(p.eur)} €/kpl (${p.source})`) +
        (siteTimber >= 1 ? `; rakennuspaikan alueen puusto (${num0(sites * p.eur - value)} €) vähennetty, koska se sisältyy hintaan` : ""),
    });
    if (input.building_sites === undefined || input.building_sites === null) {
      notes.push("Rakennuspaikan arvo perustuu oletukseen, että kiinteistölle voi saada rakennusluvan. Varmista asia kunnasta ennen julkaisua.");
    }
  }

  // 3) Loppuala: metsämaa (kuvioittain kasvupaikan mukaan), pelto, muu maa.
  const rest = Math.max(0, total - zonedHa - siteHa);
  const restFactor = total - zonedHa > 0 ? rest / total : 0;
  const forestHa = Math.min(rest, summary.forest.forest_ha * restFactor);
  const fieldHa = Math.min(
    rest - forestHa,
    input.field_ha ?? (summary.kind === "pelto" ? rest - forestHa : 0),
  );
  const otherHa = Math.max(0, rest - forestHa - fieldHa);

  if (forestHa > 0.01) {
    const p = prices.metsamaa_maapohja;
    if (p) {
      // Kasvupaikkakertoimen pinta-alapainotettu keskiarvo.
      const st = summary.forest.stands;
      const sumA = st.reduce((a, s) => a + s.area_ha, 0) || 1;
      const factor = st.reduce((a, s) => a + s.area_ha * (FERTILITY_FACTOR[s.fertility_class ?? 3] ?? 1), 0) / sumA;
      const unit = p.eur * factor;
      parts.push({
        type: "metsamaa",
        label: "Metsämaa (maapohja)",
        quantity: forestHa,
        unit: "ha",
        unit_price_eur: Math.round(unit),
        value_eur: forestHa * unit,
        basis: `maapohjan hintataso ${p.eur} €/ha × kasvupaikkakerroin ${factor.toFixed(2).replace(".", ",")} (${p.source})`,
      });
    } else notes.push("Metsämaan maapohjan hintatasoa ei löytynyt alueelle.");
  }
  if (fieldHa > 0.01) {
    const p = prices.pelto;
    if (p) {
      parts.push({
        type: "pelto",
        label: "Pelto",
        quantity: fieldHa,
        unit: "ha",
        unit_price_eur: p.eur,
        value_eur: fieldHa * p.eur,
        basis: `${input.field_ha !== undefined && input.field_ha !== null ? "myyjän ilmoittama peltoala" : "kiinteistö on merkitty pelloksi"}; hintataso ${p.source}${p.year ? ` ${p.year}` : ""}`,
      });
    } else notes.push("Pellon hintatasoa ei löytynyt alueelle.");
  }
  if (otherHa > 0.01) {
    const p = prices.muu_maa;
    if (p) {
      parts.push({
        type: "muu_maa",
        label: "Muu maa (avoin alue, joutomaa, tiet)",
        quantity: otherHa,
        unit: "ha",
        unit_price_eur: p.eur,
        value_eur: otherHa * p.eur,
        basis: `alue, jolla ei ole metsäkuviota eikä ilmoitettua peltoa; hintataso ${p.source}`,
      });
    }
    if (otherHa > 0.2 * total && input.field_ha === undefined) {
      notes.push(
        `Kiinteistöstä ${otherHa.toFixed(1).replace(".", ",")} ha on muuta kuin metsää. Jos osa on peltoa, ilmoita peltoala, niin arvio tarkentuu.`,
      );
    }
  }

  // 4) Sijaintiarvo: kasvukeskusten läheisyydessä maa myydään raakamaana, jonka hinta (€/ha,
  //    puusto mukaan lukien) on moninkertainen metsä- tai peltomaahan nähden. Jos sijainnin
  //    mukainen kokonaisarvo ylittää maa- ja metsätalousarvon (maa + puusto), maan arvoksi
  //    tulee sijaintiarvo miinus puusto, jolloin puustoa ei lasketa kahdesti.
  const loc = prices.raakamaa;
  if (loc && rest > 0.01) {
    const f = planFactor(kaava);
    const locTotal = rest * loc.eur * f.factor;
    const timberOnRest = timberValueEur * (total > 0 ? rest / total : 0);
    const agriParts = parts.filter((p) => ["metsamaa", "pelto", "muu_maa"].includes(p.type));
    const agriValue = agriParts.reduce((a, p) => a + p.value_eur, 0);
    if (locTotal > agriValue + timberOnRest) {
      for (const p of agriParts) parts.splice(parts.indexOf(p), 1);
      parts.push({
        type: "sijaintiarvo",
        label: "Maapohja, sijaintiarvo",
        quantity: rest,
        unit: "ha",
        unit_price_eur: Math.round((locTotal - timberOnRest) / rest),
        value_eur: locTotal - timberOnRest,
        basis: `alueen raakamaan hintataso ${num0(loc.eur)} €/ha (${loc.source})` +
          (f.factor < 1 ? ` × ${f.factor.toString().replace(".", ",")} (${f.reason})` : "") +
          `; puuston arvo vähennetty, koska sijaintiarvo sisältää puuston`,
      });
      if (f.factor === 1 && kaava.status !== "asemakaava") {
        notes.push("Sijaintiarvo olettaa, että alueella on maankäytön odotusarvoa. Jos yleiskaava osoittaa alueen virkistykseen tai suojeluun, arvo on pienempi.");
      }
    }
  }

  // 5) Ranta: rakentamattoman rannan lisäarvo rantametreinä (myyjän ilmoittama).
  if (input.shore_m && input.shore_m > 0 && prices.ranta_m) {
    const p = prices.ranta_m;
    const f = planFactor(kaava);
    parts.push({
      type: "ranta",
      label: "Ranta",
      quantity: input.shore_m,
      unit: "m",
      unit_price_eur: Math.round(p.eur * f.factor),
      value_eur: input.shore_m * p.eur * f.factor,
      basis: `rantaviivaa ${num0(input.shore_m)} m × ${num0(p.eur)} €/m (${p.source})` + (f.factor < 1 ? ` × ${String(f.factor).replace(".", ",")} (${f.reason})` : ""),
    });
  } else if (!input.shore_m && prices.ranta_m) {
    notes.push("Jos kiinteistöllä on rantaa, ilmoita rantaviivan pituus: ranta nostaa arvoa merkittävästi.");
  }

  const value = parts.reduce((a, p) => a + p.value_eur, 0);
  const cmp = prices.metsatila_kokonais;
  return {
    value_eur: Math.round(value),
    parts: parts.map((p) => ({ ...p, quantity: Math.round(p.quantity * 100) / 100, value_eur: Math.round(p.value_eur) })),
    source: { ...source, prices: used },
    comparison: cmp ? { eur_ha: cmp.eur, source: cmp.source, year: cmp.year } : null,
    notes,
  };
}
