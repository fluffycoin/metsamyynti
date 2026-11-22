import { assert, assertAlmostEquals, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1";
import { interpretZoning, parseDesignation } from "./kaava.ts";
import { LandPrice, resolvePrices } from "./land.ts";
import { generateListing } from "./listing.ts";
import { computeTimberValue } from "./timber.ts";
import type { PropertySummary, Stand } from "./types.ts";
import { valuate } from "./valuate.ts";

const PRICES: LandPrice[] = [
  { land_use: "metsamaa_maapohja", eur: 650, unit: "eur_ha", scope: "maakunta", area_key: "Uusimaa", year: null, source: "arvio", is_estimate: true },
  { land_use: "metsatila_kokonais", eur: 6500, unit: "eur_ha", scope: "maakunta", area_key: "Uusimaa", year: 2026, source: "MML", is_estimate: false },
  { land_use: "pelto", eur: 10135, unit: "eur_ha", scope: "maakunta", area_key: "Uusimaa", year: 2025, source: "Luke", is_estimate: true },
  { land_use: "muu_maa", eur: 320, unit: "eur_ha", scope: "maakunta", area_key: "Uusimaa", year: null, source: "arvio", is_estimate: true },
  { land_use: "rakennuspaikka", eur: 60000, unit: "eur_kpl", scope: "maakunta", area_key: "Uusimaa", year: null, source: "arvio", is_estimate: true },
  { land_use: "rakennuspaikka", eur: 180000, unit: "eur_kpl", scope: "kunta", area_key: "049", year: null, source: "arvio: Espoo", is_estimate: true },
  { land_use: "rakennusoikeus_kem2", eur: 100, unit: "eur_kem2", scope: "koko_maa", area_key: "FI", year: null, source: "arvio", is_estimate: true },
  { land_use: "rakennusoikeus_kem2", eur: 300, unit: "eur_kem2", scope: "kunta", area_key: "837", year: null, source: "arvio: Tampere", is_estimate: true },
];
const SRC = { id: "static", name: "Testihinnat" };

const stand = (o: Partial<Stand>): Stand => ({
  stand_key: "s" + Math.random(),
  area_ha: 1,
  development_class: "04",
  main_species: 2,
  mean_age: 80,
  volume_m3_ha: 250,
  sawlog_m3_ha: 150,
  pulp_m3_ha: 80,
  prop_pine: 20,
  prop_spruce: 70,
  prop_other: 10,
  fertility_class: 3,
  cutting_type: null,
  cutting_year: null,
  measured_at: "2022-06-01",
  ...o,
});

const base = (o: Partial<PropertySummary>): PropertySummary => ({
  kiinteistotunnus: "85840100050012",
  display_id: "858-401-5-12",
  name: "Metsälä",
  municipality: { code: "858", name: "Tuusula", region_name: "Uusimaa", zoning_pilot: true },
  kind: "metsa",
  is_maarala: false,
  maarala_no: null,
  area_ha: 20,
  forest: { forest_ha: 0, total_volume_m3: 0, stands: [] },
  zoning: [],
  stumpage_prices: { price_area: "1", week: "2026W46", eur_m3: { "8021:N1": 70, "8021:N2": 75, "8021:N3": 48, "8021:N4": 23, "8021:N5": 24, "8021:N6": 21 } },
  ...o,
});

Deno.test("puuston arvo: uudistuskypsä kuusikko Luken hinnoilla", () => {
  const s = [stand({ area_ha: 10 })];
  const t = computeTimberValue(s, base({}).stumpage_prices);
  // tukki 1500 m³: 20/70/10 % -> 300×70 + 1050×75 + 150×48 = 106 950
  // kuitu 800 m³: 160×23 + 560×24 + 80×21 = 18 800
  assertEquals(t.value_eur, 106_950 + 18_800);
  assertEquals(t.volume_m3, 2500);
  assertEquals(t.used_default_prices, false);
});

Deno.test("puuston arvo: harvennus käyttää oletushintoja ja taimikko kustannusarvoa", () => {
  const s = [stand({ area_ha: 5, development_class: "03" }), stand({ area_ha: 2, development_class: "T2", volume_m3_ha: 10, sawlog_m3_ha: 0, pulp_m3_ha: 0 })];
  const t = computeTimberValue(s, base({}).stumpage_prices);
  assert(t.used_default_prices);
  assertEquals(t.seedling_value_eur, 1400);
  assert(t.notes.length === 1);
});

Deno.test("kaavamerkinnät", () => {
  assertEquals(parseDesignation("AO-1")?.base, "AO");
  assertEquals(parseDesignation("AME")?.base, "AME");
  assertEquals(parseDesignation("MU/s")?.category, "maa_metsatalous");
  assertEquals(parseDesignation("XQ")?.category, "muu");
  assertEquals(parseDesignation(null), null);
});

Deno.test("Espoo, yleiskaavan AT-kyläalue: rakennusjärjestyksen enimmäismäärät", () => {
  const s = base({
    municipality: { code: "049", name: "Espoo", region_name: "Uusimaa", zoning_pilot: true },
    kind: "muu",
    area_ha: 0.8,
    zoning: [{
      level: "yleiskaava", plan_name: "Espoon pohjoisosien yleiskaava, osa I", plan_id: "Y-1", approved_on: "1997-01-01",
      designation: "AT", efficiency: 0.1, building_right_m2: null, regulations: null, overlap_m2: 8000, source_layer: "x",
    }],
  });
  const k = interpretZoning(s);
  assertEquals(k.status, "yleiskaava");
  // e=0,1 × 8000 = 800 > 300 + 60 -> rakennusjärjestys rajaa
  assertEquals(k.building_right.m2, 360);
  assertEquals(k.building_right.building_sites, 1);
  assertStringIncludes(k.rakennusoikeus, "Yleiskaavan AT- ja AME-alueilla on asuinrakentamisen osalta noudatettu enimmäistehokkuutta e=0,1");
  assertStringIncludes(k.rakennusoikeus, "kumpi ensin tulee täyteen");
  assertStringIncludes(k.rakennusoikeus, "yleiskaavan kyläaluetta AT, joten se mahdollistaa vakituisen asumisen");

  const v = valuate(s, resolvePrices(PRICES, { municipality_code: "049", region_name: "Uusimaa" }), SRC);
  const site = v.land.parts.find((p) => p.type === "rakennuspaikka")!;
  assertEquals(site.unit_price_eur, 180000); // kuntataso voittaa maakunnan
});

Deno.test("Tampere, asemakaavan AO-kortteli: rakennusoikeus suhteutetaan", () => {
  const s = base({
    municipality: { code: "837", name: "Tampere", region_name: "Pirkanmaa", zoning_pilot: true },
    kind: "muu",
    area_ha: 0.12,
    zoning: [{
      level: "asemakaava", plan_name: "Asemakaava 8123", plan_id: "8123", approved_on: "2015-05-04", designation: "AO",
      efficiency: 0.25, building_right_m2: 600, regulations: "Suurin sallittu kerrosluku II.", overlap_m2: 1200,
      zone_area_m2: 2400, source_layer: "maankaytto:KAAVAYKSIKOT_ALUE_PUBLIC_VIEW",
    }],
  });
  const v = valuate(s, resolvePrices(PRICES, { municipality_code: "837", region_name: "Pirkanmaa" }), SRC);
  assertEquals(v.kaava.building_right.m2, 300);
  assertEquals(v.land.value_eur, 300 * 300);
  const l = generateListing([{ summary: s, valuation: v }]);
  assertMatch(l.title, /^Omakotitontti 0,12 ha, Tampere – AO-kaava, rakennusoikeus 300 k-m²$/);
  assertStringIncludes(l.sections.kaava[0].rakennusoikeus, "Suurin sallittu kerrosluku II.");
});

Deno.test("metsätila: alustava -> vahvistettu -> myyjän hinta-arvio", () => {
  const stands = [stand({ area_ha: 8 }), stand({ area_ha: 6, development_class: "02", volume_m3_ha: 90, sawlog_m3_ha: 5, pulp_m3_ha: 70, fertility_class: 4 })];
  const s = base({ forest: { forest_ha: 14, total_volume_m3: 2540, stands } });
  const prices = resolvePrices(PRICES, { municipality_code: "858", region_name: "Uusimaa" });

  const a = valuate(s, prices, SRC);
  assertEquals(a.timber.label, "Alustava puuston arvo");
  assertEquals(a.display.price_source, "alustava");
  assert(a.land.parts.some((p) => p.type === "metsamaa"));
  assert(a.land.parts.some((p) => p.type === "muu_maa"));
  assertAlmostEquals(a.range_eur.low / a.computed_total_eur, 0.85, 0.001);

  const b = valuate(s, prices, SRC, { verified: { timber_value_eur: 150000, verifier: "Metsänhoitoyhdistys Testi", valued_on: "2026-09-01", document_path: "u/a.pdf" } });
  assertEquals(b.timber.label, "Vahvistettu puuston arvo");
  assertEquals(b.timber.value_eur, 150000);
  assertEquals(b.computed_total_eur, b.land.value_eur + 150000);
  const lb = generateListing([{ summary: s, valuation: b }]);
  assertEquals(lb.price_source, "vahvistettu");
  assertStringIncludes(lb.sections.hinta.teksti, "Metsänhoitoyhdistys Testi laatimaan puustoarvioon (1.9.2026)");

  const c = valuate(s, prices, SRC, { seller: { total_eur: 260000, land_value_eur: null, timber_value_eur: null, note: "Hyvät tieyhteydet", set_at: "" } });
  const lc = generateListing([{ summary: s, valuation: c }]);
  assertEquals(lc.price_source, "myyjan_oma");
  assertEquals(lc.asking_price_eur, 260000);
  assertEquals(lc.sections.hinta.merkinta, "Myyjän hinta-arvio");
  assertStringIncludes(lc.sections.hinta.teksti, "Palvelun laskema arvio on noin");
});

Deno.test("peltoala myyjältä ja ei kaavaa", () => {
  const s = base({ kind: "muu", area_ha: 10, municipality: { code: "005", name: "Alajärvi", region_name: "Etelä-Pohjanmaa", zoning_pilot: false } });
  const prices = resolvePrices(
    [...PRICES, { land_use: "pelto", eur: 9296, unit: "eur_ha", scope: "maakunta", area_key: "Etelä-Pohjanmaa", year: 2025, source: "Luke", is_estimate: false }],
    { municipality_code: "005", region_name: "Etelä-Pohjanmaa" },
  );
  const v = valuate(s, prices, SRC, { land_use: { field_ha: 8 } });
  assertEquals(v.kaava.status, "ei_tiedossa");
  assertEquals(v.land.parts.find((p) => p.type === "pelto")!.value_eur, 8 * 9296);
  assertStringIncludes(v.kaava.kaavoitustilanne, "kunnan (Alajärvi) kaavoja ei vielä haeta");
});

Deno.test("ilmoitus: kaikki osiot ja markdown", () => {
  const stands = [stand({ area_ha: 12, cutting_year: 2027 }), stand({ area_ha: 5, development_class: "03", volume_m3_ha: 180, sawlog_m3_ha: 70, pulp_m3_ha: 100 })];
  const s = base({ forest: { forest_ha: 17, total_volume_m3: 3900, stands } });
  const v = valuate(s, resolvePrices(PRICES, { municipality_code: "858", region_name: "Uusimaa" }), SRC);
  const l = generateListing([{ summary: s, valuation: v }], new Date("2026-11-21T12:00:00Z"));
  assertMatch(l.title, /^Metsätila 20,0 ha, Tuusula – puustoa 3 900 m³$/);
  for (const h of ["## Perustiedot", "## Metsä", "## Kaavoitus ja rakennusoikeus", "## Hinta-arvio", "## Kaupan ehdot", "varainsiirtoveron (3 %"]) {
    assertStringIncludes(l.sections.markdown, h);
  }
  assertStringIncludes(l.sections.metsa!.hakkuumahdollisuudet!, "Uudistuskypsää puustoa on noin 3 000 m³");
  assert(l.sections.perustiedot.some((p) => p.label === "Alustava puuston arvo"));
  if (Deno.env.get("SHOW")) console.log(l.sections.markdown);
});

Deno.test("Espoo: Ryhdin yleiskaavaosuma ilman merkintää + myyjän ilmoittama AT", () => {
  const s = base({
    municipality: { code: "049", name: "Espoo", region_name: "Uusimaa", zoning_pilot: true },
    kind: "muu",
    area_ha: 0.5,
    zoning: [{
      level: "yleiskaava", plan_name: "Espoon pohjoisosien yleiskaava osa I", plan_id: null, approved_on: null,
      designation: null, efficiency: null, building_right_m2: null, regulations: null, overlap_m2: 5000, source_layer: "ryhti:pub_valid_lm_plan_ix_gs",
    }],
  });
  const without = interpretZoning(s);
  assertEquals(without.building_right.m2, null);
  const withAt = interpretZoning(s, { designation: "at" });
  assertEquals(withAt.building_right.m2, 360);
  assert(withAt.checks.some((c) => c.includes("myyjän kaavakartasta")));
});
