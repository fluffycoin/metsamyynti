/**
 * "Luo alustava myynti-ilmoitus": täyttää välittäjätasoisen ilmoitustekstin valmiiksi
 * kiinteistön koosteesta ja hinta-arviosta. Tekstipohjat ovat deterministisiä (ei kielimallia),
 * joten sama data tuottaa aina saman tekstin ja luvut täsmäävät hinta-arvioon.
 *
 * Tulos tallennetaan listings.sections-kenttään. Myyjän itse kirjoittamat tekstit ovat
 * avaimen sections.myyja alla, eikä generaattori koske niihin uudelleen ajettaessa.
 */
import { DEVELOPMENT_CLASS } from "../sources/metsakeskus.ts";
import { eur, fiDate, fiWeek, ha, list, m2, m3, num, roundPrice } from "./format.ts";
import { FERTILITY_NAME } from "./land.ts";
import { CUTTING_METHOD_NAME, cuttingMethodFor } from "./timber.ts";
import type { PropertySummary } from "./types.ts";
import type { Valuation } from "./valuate.ts";

export interface ListingItem {
  summary: PropertySummary;
  valuation: Valuation;
}

export interface ListingSections {
  version: 1;
  generated_at: string;
  title: string;
  ingressi: string;
  perustiedot: { label: string; value: string }[];
  kohteet: { kiinteistotunnus: string; display_id: string; name: string | null; tyyppi: string; area_ha: number }[];
  kuvaus: string;
  metsa: {
    teksti: string;
    kehitysluokat: { luokka: string; ha: number; m3: number }[];
    puulajit: { manty: number; kuusi: number; lehtipuu: number };
    hakkuumahdollisuudet: string | null;
  } | null;
  kaava: { kaavoitustilanne: string; rakennusoikeus: string; asiakirjat: string[] }[];
  hinta: {
    teksti: string;
    merkinta: "Hinta-arvio" | "Myyjän hinta-arvio";
    hinta_eur: number;
    vaihteluvali_eur: { low: number; high: number };
    maan_arvo_eur: number;
    puuston_arvo_eur: number;
    puuston_arvo_merkinta: string;
    price_source: "alustava" | "vahvistettu" | "myyjan_oma";
  };
  kaupan_ehdot: string[];
  liitteet: string[];
  tarkistettavat: string[];
  taydennettavat: { key: string; label: string; ohje: string }[];
  lahteet: string[];
  markdown: string;
  myyja?: Record<string, unknown>;
}

/** Kohteen tyyppi ilmoituksen otsikkoon. */
export function kindLabel(s: PropertySummary, v: Valuation): string {
  const k = v.kaava;
  if (k.status === "asemakaava" && k.building_right.residential && (k.building_right.m2 ?? 0) > 0) {
    return s.area_ha < 1 ? "Omakotitontti" : "Rakennusmaa";
  }
  if (s.kind === "pelto") return "Peltotila";
  const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const forestShare = s.area_ha > 0 ? s.forest.forest_ha / s.area_ha : 0;
  if (k.building_right.building_sites > 0 && s.area_ha < 2) return "Rakennuspaikka";
  if (s.kind === "metsa" || forestShare > 0.5) return k.building_right.building_sites > 0 ? "Metsätila ja rakennuspaikka" : "Metsätila";
  if (s.is_maarala) return "Määräala";
  return "Kiinteistö";
}

const FERTILITY_PARTITIVE: Record<string, string> = {
  "lehto": "lehtoa",
  "lehtomainen kangas": "lehtomaista kangasta",
  "tuore kangas": "tuoretta kangasta",
  "kuivahko kangas": "kuivahkoa kangasta",
  "kuiva kangas": "kuivaa kangasta",
  "karukkokangas": "karukkokangasta",
  "kalliomaa tai hietikko": "kalliomaata tai hietikkoa",
  "lakimetsä tai tunturi": "lakimetsää tai tunturia",
};

const SPECIES = (s: PropertySummary) => {
  let p = 0, k = 0, l = 0;
  for (const st of s.forest.stands) {
    const vol = Number(st.volume_m3_ha ?? 0) * st.area_ha;
    const sum = Number(st.prop_pine ?? 0) + Number(st.prop_spruce ?? 0) + Number(st.prop_other ?? 0);
    if (sum > 0) {
      p += vol * Number(st.prop_pine ?? 0) / sum;
      k += vol * Number(st.prop_spruce ?? 0) / sum;
      l += vol * Number(st.prop_other ?? 0) / sum;
    } else if (st.main_species === 1) p += vol;
    else if (st.main_species === 2) k += vol;
    else l += vol;
  }
  const t = p + k + l || 1;
  return { manty: Math.round(100 * p / t), kuusi: Math.round(100 * k / t), lehtipuu: Math.round(100 * l / t) };
};

function speciesSentence(sp: { manty: number; kuusi: number; lehtipuu: number }): string {
  const parts = [
    ["mäntyä", sp.manty],
    ["kuusta", sp.kuusi],
    ["lehtipuuta", sp.lehtipuu],
  ].filter(([, v]) => (v as number) > 0) as [string, number][];
  const dom = [...parts].sort((a, b) => b[1] - a[1]);
  const lead = dom[0]?.[1] >= 60
    ? { mäntyä: "mäntyvaltaista", kuusta: "kuusivaltaista", lehtipuuta: "lehtipuuvaltaista" }[dom[0][0]]
    : dom.length >= 2
    ? `${{ mäntyä: "mänty", kuusta: "kuusi", lehtipuuta: "lehtipuu" }[dom[0][0]]}- ja ${{ mäntyä: "mänty", kuusta: "kuusi", lehtipuuta: "lehtipuu" }[dom[1][0]]}valtaista`
    : "sekapuustoista";
  return `Puusto on ${lead}: ${list(parts.map(([n, v]) => `${n} ${v} %`))} tilavuudesta.`;
}

function forestSection(s: PropertySummary, v: Valuation): ListingSections["metsa"] {
  const st = s.forest.stands;
  if (!st.length) return null;
  const fha = s.forest.forest_ha;
  const vol = s.forest.total_volume_m3;
  const sp = SPECIES(s);

  const classes = new Map<string, { ha: number; m3: number }>();
  for (const x of st) {
    const name = DEVELOPMENT_CLASS[x.development_class ?? ""] ?? "Kehitysluokka ei tiedossa";
    const c = classes.get(name) ?? { ha: 0, m3: 0 };
    c.ha += x.area_ha;
    c.m3 += Number(x.volume_m3_ha ?? 0) * x.area_ha;
    classes.set(name, c);
  }
  const kehitysluokat = [...classes.entries()]
    .map(([luokka, c]) => ({ luokka, ha: Math.round(c.ha * 10) / 10, m3: Math.round(c.m3) }))
    .sort((a, b) => b.ha - a.ha);

  const ageW = st.filter((x) => x.mean_age).reduce((a, x) => a + x.area_ha, 0);
  const meanAge = ageW ? st.reduce((a, x) => a + Number(x.mean_age ?? 0) * x.area_ha, 0) / ageW : null;
  const fert = new Map<number, number>();
  for (const x of st) if (x.fertility_class) fert.set(x.fertility_class, (fert.get(x.fertility_class) ?? 0) + x.area_ha);
  const fertTop = [...fert.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => FERTILITY_NAME[c]).filter(Boolean);

  const t = v.timber;
  const sentences = [
    `Metsämaata on noin ${ha(fha)}, ja puuston kokonaistilavuus on noin ${m3(vol)} (keskimäärin ${num(fha ? vol / fha : 0)} m³/ha).`,
    t.sawlog_m3 + t.pulp_m3 > 0 ? `Tukkipuuta on arviolta ${m3(t.sawlog_m3)} ja kuitupuuta ${m3(t.pulp_m3)}.` : null,
    vol > 0 ? speciesSentence(sp) : null,
    `Ikärakenne: ${list(kehitysluokat.slice(0, 4).map((k) => `${k.luokka.toLowerCase()} ${ha(k.ha)}`))}.`,
    meanAge ? `Puuston pinta-alalla painotettu keski-ikä on noin ${num(meanAge)} vuotta.` : null,
    fertTop.length ? `Kasvupaikat ovat pääosin ${list(fertTop.map((f) => FERTILITY_PARTITIVE[f] ?? f))}.` : null,
  ].filter(Boolean);

  // Hakkuumahdollisuudet: uudistushakkuu ja harvennukset kantohinnoin
  const byMethod = new Map<string, { m3: number; ha: number; eur: number }>();
  for (const b of t.by_stand) {
    const x = st.find((y) => y.stand_key === b.stand_key)!;
    const m = cuttingMethodFor(x.development_class);
    if (!m) continue;
    const c = byMethod.get(m) ?? { m3: 0, ha: 0, eur: 0 };
    c.m3 += Number(x.volume_m3_ha ?? 0) * x.area_ha;
    c.ha += x.area_ha;
    c.eur += b.value_eur;
    byMethod.set(m, c);
  }
  const hm: string[] = [];
  const u = byMethod.get("8021");
  if (u && u.m3 > 50) hm.push(`Uudistuskypsää puustoa on noin ${m3(u.m3)} ${ha(u.ha)} alalla (kantoraha-arvo noin ${eur(u.eur)}).`);
  const h = (byMethod.get("8023")?.ha ?? 0) + (byMethod.get("8022")?.ha ?? 0);
  if (h > 0.5) hm.push(`Kasvatusmetsiä, joissa harvennukset tulevat ajankohtaisiksi lähivuosina, on noin ${ha(h)}.`);
  const proposals = st.filter((x) => x.cutting_year);
  if (proposals.length) {
    const yrs = proposals.map((x) => x.cutting_year!);
    const [y0, y1] = [Math.min(...yrs), Math.max(...yrs)];
    hm.push(`Metsäkeskuksen aineistossa on hakkuuehdotus ${proposals.length} kuviolle ${y0 === y1 ? `vuodelle ${y0}` : `vuosille ${y0}–${y1}`}.`);
  }

  return {
    teksti: sentences.join(" "),
    kehitysluokat,
    puulajit: sp,
    hakkuumahdollisuudet: hm.length ? hm.join(" ") : null,
  };
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const forestShare = (v: Valuation) =>
  v.area_ha > 0 ? v.land.parts.filter((p) => p.type === "metsamaa").reduce((a, p) => a + p.quantity, 0) / v.area_ha : 0;

function priceText(v: Valuation, multiple: boolean): string {
  const t = v.timber;
  const parts: string[] = [];
  if (v.seller) {
    parts.push(`${v.display.label} on ${eur(v.seller.total_eur)}.`);
    if (v.seller.note) parts.push(v.seller.note.trim().replace(/([^.!?])$/, "$1."));
    parts.push(`Palvelun laskema arvio on noin ${eur(v.computed_total_eur)}: maan arvo noin ${eur(v.land.value_eur)}${t.value_eur > 0 ? ` ja ${t.label.toLowerCase()} noin ${eur(t.value_eur)}` : ""}.`);
  } else {
    parts.push(
      `${multiple ? `Kiinteistön ${v.display_id} hinta-arvio` : "Hinta-arvio"} on noin ${eur(v.computed_total_eur)} (vaihteluväli ${num(roundPrice(v.range_eur.low))}–${eur(v.range_eur.high)}). ` +
        (t.value_eur > 0 ? `Siitä maan arvo on noin ${eur(v.land.value_eur)} ja ${t.label.toLowerCase()} noin ${eur(t.value_eur)}.` : ""),
    );
  }
  if (t.status === "vahvistettu" && t.verified) {
    parts.push(
      `Vahvistettu puuston arvo perustuu ${t.verified.verifier} laatimaan puustoarvioon${t.verified.valued_on ? ` (${fiDate(t.verified.valued_on)})` : ""}.`,
    );
  } else if (t.value_eur > 0) {
    const w = fiWeek(t.price_week);
    parts.push(
      `Alustava puuston arvo on laskettu Metsäkeskuksen avoimesta metsävaratiedosta ja Luonnonvarakeskuksen kantohinnoista${w ? ` (${w})` : ""} kehitysluokan mukaisella hakkuutavalla. ` +
        "Arvo on suuntaa-antava, eikä se korvaa maastossa tehtyä puukauppa- tai tila-arviota.",
    );
  }
  if (v.land.parts.length) {
    parts.push(`Maan arvo: ${list(v.land.parts.map((p) => `${lcFirst(p.label)} ${p.unit === "ha" ? ha(p.quantity) : `${num(p.quantity)} ${p.unit}`} noin ${eur(p.value_eur)}`))}.`);
  }
  if (v.land.comparison && v.implied_eur_ha && v.timber.value_eur > 0 && v.area_ha >= 2 && v.timber.volume_m3 > 0 && forestShare(v) > 0.6) {
    parts.push(
      `Vertailuksi: metsätilojen keskihinta alueella on noin ${num(v.land.comparison.eur_ha)} €/ha (${v.land.comparison.source}${v.land.comparison.year && !v.land.comparison.source.includes(String(v.land.comparison.year)) ? ` ${v.land.comparison.year}` : ""}); tämän kohteen arvio on noin ${num(Math.round(v.implied_eur_ha / 10) * 10)} €/ha.`,
    );
  }
  return parts.map((p) => p.trim()).filter(Boolean).join(" ");
}

const KAUPAN_EHDOT = [
  "Kauppa tehdään kiinteistökauppana joko julkisen kaupanvahvistajan läsnä ollessa tai sähköisesti Maanmittauslaitoksen Kiinteistökaupan palvelussa.",
  "Ostaja maksaa varainsiirtoveron (3 % kauppahinnasta) sekä lainhuudon ja mahdollisten kiinnitysten kirjaamismaksut.",
  "Omistus- ja hallintaoikeus siirtyvät ostajalle, kun koko kauppahinta on maksettu, ellei kauppakirjassa toisin sovita.",
  "Kauppaan sisältyvät kiinteistön osuudet yhteisiin alueisiin ja yhteisiin erityisiin etuuksiin sekä kiinteistölle kuuluvat rasiteoikeudet, ellei toisin sovita.",
  "Kohde myydään siinä kunnossa kuin se on kaupantekohetkellä. Ostajan tulee tutustua kohteeseen ja sen asiakirjoihin ennen kauppaa (ostajan selonottovelvollisuus).",
];

const LIITTEET = [
  "Kiinteistörekisteriote ja kiinteistörekisterin karttaote",
  "Lainhuutorekisteriote",
  "Rasitustodistus (kiinnitykset)",
  "Kaavaote ja kaavamääräykset",
];

const TAYDENNETTAVAT: ListingSections["taydennettavat"] = [
  { key: "kulkuyhteydet", label: "Kulkuyhteydet", ohje: "Tieyhteys perille asti? Tiekunta ja tiemaksut, talvikunnossapito." },
  { key: "rakennukset", label: "Rakennukset", ohje: "Kiinteistöllä olevat rakennukset, niiden koko ja kunto." },
  { key: "ranta", label: "Ranta ja vesialueet", ohje: "Oma ranta, rantaviivan pituus, osuus yhteiseen vesialueeseen." },
  { key: "erityispiirteet", label: "Kohteen erityispiirteet", ohje: "Maisema, marja- ja sienimaastot, metsästysoikeus, palvelujen etäisyys." },
  { key: "sopimukset", label: "Voimassa olevat sopimukset", ohje: "Puukaupat, vuokra- ja metsästysvuokrasopimukset, sähkö- ja tierasitteet." },
];

export function generateListing(items: ListingItem[], now = new Date()): {
  title: string;
  asking_price_eur: number;
  price_source: "alustava" | "vahvistettu" | "myyjan_oma";
  sections: ListingSections;
} {
  if (!items.length) throw new Error("Ilmoitukseen tarvitaan vähintään yksi kiinteistö");
  const multiple = items.length > 1;
  const first = items[0];
  const muniNames = [...new Set(items.map((i) => i.summary.municipality.name).filter(Boolean))] as string[];
  const totalHa = items.reduce((a, i) => a + i.summary.area_ha, 0);
  const forestHa = items.reduce((a, i) => a + i.summary.forest.forest_ha, 0);
  const volume = items.reduce((a, i) => a + i.summary.forest.total_volume_m3, 0);
  const kinds = items.map((i) => kindLabel(i.summary, i.valuation));
  const kind = new Set(kinds).size === 1 ? kinds[0] : forestHa / (totalHa || 1) > 0.5 ? "Metsätila" : "Kiinteistöt";

  const price = items.reduce((a, i) => a + i.valuation.display.price_eur, 0);
  const land = items.reduce((a, i) => a + i.valuation.land.value_eur, 0);
  const timber = items.reduce((a, i) => a + i.valuation.timber.value_eur, 0);
  const anySeller = items.some((i) => i.valuation.seller);
  const allVerified = items.every((i) => i.valuation.timber.status === "vahvistettu" || i.valuation.timber.value_eur === 0) &&
    items.some((i) => i.valuation.timber.status === "vahvistettu");
  const price_source = anySeller ? "myyjan_oma" : allVerified ? "vahvistettu" : "alustava";
  const timberLabel = allVerified ? "Vahvistettu puuston arvo" : "Alustava puuston arvo";

  // ---- Otsikko ja ingressi -------------------------------------------------------
  const place = list(muniNames) || "Suomi";
  let title = `${kind} ${ha(totalHa)}, ${place}`;
  const k0 = first.valuation.kaava;
  if (k0.primary?.info && (k0.building_right.residential || k0.building_right.building_sites > 0)) {
    title += ` – ${k0.primary.info.base}-${k0.status === "asemakaava" ? "kaava" : "alue"}`;
    if (k0.building_right.m2) title += `, rakennusoikeus ${num(k0.building_right.m2)} k-m²`;
  } else if (volume >= 100) {
    title += ` – puustoa ${m3(Math.round(volume / (volume >= 1000 ? 100 : 10)) * (volume >= 1000 ? 100 : 10))}`;
  }
  if (title.length > 200) title = title.slice(0, 197) + "...";

  const ingressiParts = [
    `Myynnissä ${multiple ? `${items.length} kiinteistön kokonaisuus` : kind.toLowerCase()}, ${place}, yhteensä ${ha(totalHa)}.`,
    forestHa > 0.5 ? `Metsämaata on noin ${ha(forestHa)} ja puustoa noin ${m3(volume)}.` : null,
    k0.status !== "ei_tiedossa" && k0.primary?.info
      ? `Kaavassa alue on ${k0.primary.info.name} (${k0.primary.info.code}).`
      : null,
    `${anySeller ? "Myyjän hinta-arvio" : "Hinta-arvio"} ${eur(price)}.`,
  ].filter(Boolean);
  const ingressi = ingressiParts.join(" ");

  // ---- Perustiedot ------------------------------------------------------------------
  const perustiedot: ListingSections["perustiedot"] = [
    { label: multiple ? "Kiinteistötunnukset" : "Kiinteistötunnus", value: items.map((i) => i.summary.display_id + (i.summary.is_maarala ? ` (määräala M${i.summary.maarala_no})` : "")).join(", ") },
    ...(first.summary.name && !multiple ? [{ label: "Kiinteistön nimi", value: first.summary.name }] : []),
    { label: "Kunta", value: place },
    { label: "Kohdetyyppi", value: kind },
    { label: "Pinta-ala", value: `${ha(totalHa)} (${m2(Math.round(totalHa * 10_000))})` },
  ];
  if (forestHa > 0.1) {
    perustiedot.push({ label: "Metsämaata", value: ha(forestHa) });
    perustiedot.push({ label: "Puuston tilavuus", value: `${m3(volume)} (${num(forestHa ? volume / forestHa : 0)} m³/ha)` });
  }
  perustiedot.push({
    label: "Kaavoitus",
    value: k0.status === "ei_tiedossa"
      ? "Ei asema- tai yleiskaavaa tiedossa"
      : `${k0.status === "asemakaava" ? "Asemakaava" : "Yleiskaava"}${k0.primary?.info ? `, ${k0.primary.info.code}` : ""}`,
  });
  if (k0.building_right.m2) perustiedot.push({ label: "Rakennusoikeus", value: `n. ${num(k0.building_right.m2)} k-m²` });
  perustiedot.push({ label: "Maan arvo", value: eur(land) });
  if (timber > 0) perustiedot.push({ label: timberLabel, value: eur(timber) });
  perustiedot.push({ label: anySeller ? "Myyjän hinta-arvio" : "Hinta-arvio", value: eur(price) });

  // ---- Kuvaus -------------------------------------------------------------------------
  const kuvaus = items.map((i) => {
    const s = i.summary;
    const region = s.municipality.region_name ? `, ${s.municipality.region_name}` : "";
    const name = s.name ? ` ${s.name}` : "";
    const open = Math.max(0, s.area_ha - s.forest.forest_ha);
    return [
      `Kiinteistö${name} (${s.display_id}) sijaitsee kunnassa ${s.municipality.name ?? s.municipality.code}${region}.`,
      `Kokonaispinta-ala on ${ha(s.area_ha)}, josta metsämaata noin ${ha(s.forest.forest_ha)}${open > 0.1 ? ` ja muuta maata (pelto, avoin alue, tiet) noin ${ha(open)}` : ""}.`,
      s.is_maarala ? "Kohde on määräala, joka muodostetaan omaksi kiinteistökseen kaupan jälkeen lohkomalla; lohkomiskustannuksista sovitaan kauppakirjassa." : null,
    ].filter(Boolean).join(" ");
  }).join("\n\n");

  const metsa = multiple
    ? (() => {
      const secs = items.map((i) => forestSection(i.summary, i.valuation)).filter(Boolean) as NonNullable<ListingSections["metsa"]>[];
      if (!secs.length) return null;
      return {
        teksti: secs.map((s, n) => `${items[n].summary.display_id}: ${s.teksti}`).join("\n\n"),
        kehitysluokat: secs.flatMap((s) => s.kehitysluokat),
        puulajit: secs[0].puulajit,
        hakkuumahdollisuudet: secs.map((s) => s.hakkuumahdollisuudet).filter(Boolean).join(" ") || null,
      };
    })()
    : forestSection(first.summary, first.valuation);

  const kaava = items.map((i) => ({
    kaavoitustilanne: (multiple ? `${i.summary.display_id}: ` : "") + i.valuation.kaava.kaavoitustilanne,
    rakennusoikeus: i.valuation.kaava.rakennusoikeus,
    asiakirjat: i.valuation.kaava.documents,
  }));

  const hintaTeksti = items.map((i) => priceText(i.valuation, multiple)).join("\n\n");
  const low = items.reduce((a, i) => a + (i.valuation.seller ? i.valuation.seller.total_eur : i.valuation.range_eur.low), 0);
  const high = items.reduce((a, i) => a + (i.valuation.seller ? i.valuation.seller.total_eur : i.valuation.range_eur.high), 0);

  const hasForest = forestHa > 0.5;
  const tarkistettavat = [
    ...new Set([
      ...items.flatMap((i) => i.valuation.kaava.checks),
      ...items.flatMap((i) => i.valuation.notes),
      "Tarkista rasitteet, kiinnitykset ja mahdolliset vuokraoikeudet rekisteriotteista.",
      ...(hasForest
        ? [
          "Ilmoita, onko kiinteistöllä voimassa olevia puukauppoja tai kesken olevia hakkuita.",
          "Ilmoita, onko kiinteistölle myönnetty Kemera- tai Metka-tukea, jonka ehdot siirtyvät ostajalle.",
          "Tarkista mahdolliset luonnonsuojelualueet, METSO-kohteet ja muinaisjäännökset.",
        ]
        : []),
    ]),
  ];

  const lahteet = [
    "Kiinteistön rajat ja pinta-ala: Maanmittauslaitos, kiinteistörekisteri.",
    ...(hasForest ? ["Metsävaratiedot: Suomen metsäkeskus, avoin metsävaratieto (CC BY 4.0)."] : []),
    ...(timber > 0 && !allVerified ? ["Kantohinnat: Luonnonvarakeskus (Luke), kantohinnat viikoittain."] : []),
    "Kaavatiedot: kunnan kaavarajapinta ja Syken Ryhti-palvelu.",
    `Maan hintataso: ${first.valuation.land.source.name}.`,
  ];

  const liitteet = [...LIITTEET, ...(hasForest ? ["Metsäsuunnitelma tai metsävaratiedot (Metsään.fi)"] : [])];
  const ehdot = [...KAUPAN_EHDOT];
  if (items.some((i) => i.summary.is_maarala)) {
    ehdot.push("Määräalan lohkominen haetaan kaupan jälkeen Maanmittauslaitokselta; lohkomistoimituksen kustannuksista sovitaan kauppakirjassa.");
  }

  const sections: Omit<ListingSections, "markdown"> = {
    version: 1,
    generated_at: now.toISOString(),
    title,
    ingressi,
    perustiedot,
    kohteet: items.map((i) => ({
      kiinteistotunnus: i.summary.kiinteistotunnus,
      display_id: i.summary.display_id,
      name: i.summary.name,
      tyyppi: kindLabel(i.summary, i.valuation),
      area_ha: i.summary.area_ha,
    })),
    kuvaus,
    metsa,
    kaava,
    hinta: {
      teksti: hintaTeksti,
      merkinta: anySeller ? "Myyjän hinta-arvio" : "Hinta-arvio",
      hinta_eur: roundPrice(price),
      vaihteluvali_eur: { low: roundPrice(low), high: roundPrice(high) },
      maan_arvo_eur: roundPrice(land),
      puuston_arvo_eur: roundPrice(timber),
      puuston_arvo_merkinta: timberLabel,
      price_source,
    },
    kaupan_ehdot: ehdot,
    liitteet,
    tarkistettavat,
    taydennettavat: TAYDENNETTAVAT,
    lahteet,
  };

  return { title, asking_price_eur: roundPrice(price), price_source, sections: { ...sections, markdown: toMarkdown(sections) } };
}

export function toMarkdown(s: Omit<ListingSections, "markdown">): string {
  const out: string[] = [`# ${s.title}`, "", s.ingressi, "", "## Perustiedot", ""];
  for (const p of s.perustiedot) out.push(`- **${p.label}:** ${p.value}`);
  out.push("", "## Kohteen kuvaus", "", s.kuvaus);
  if (s.metsa) {
    out.push("", "## Metsä", "", s.metsa.teksti);
    if (s.metsa.hakkuumahdollisuudet) out.push("", `**Hakkuumahdollisuudet.** ${s.metsa.hakkuumahdollisuudet}`);
  }
  out.push("", "## Kaavoitus ja rakennusoikeus");
  for (const k of s.kaava) {
    out.push("", k.kaavoitustilanne, "", `**Rakennusoikeus.** ${k.rakennusoikeus}`);
    if (k.asiakirjat.length) out.push("", `Kaava-asiakirjat: ${k.asiakirjat.join(", ")}`);
  }
  out.push("", `## ${s.hinta.merkinta}`, "", s.hinta.teksti);
  out.push("", "## Kaupan ehdot", "", ...s.kaupan_ehdot.map((e) => `- ${e}`));
  out.push("", "## Asiakirjat", "", ...s.liitteet.map((e) => `- ${e}`));
  out.push("", "---", "", `_Lähteet: ${s.lahteet.join(" ")}_`);
  return out.join("\n");
}
