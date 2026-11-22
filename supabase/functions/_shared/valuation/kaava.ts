/**
 * Kaavan ja rakennusoikeuden tulkinta ilmoitustekstiksi (välittäjän kielellä).
 *
 * Syöte on property_summaryn kaavaosumat (zoning_areas-välimuistista). Tulkinta:
 *  1. Valitaan merkittävät osumat (yli 5 % kiinteistön alasta tai yli 200 m²).
 *  2. Asemakaava ohjaa ensisijaisesti; ilman asemakaavaa yleiskaava; ilman kumpaakaan
 *     alue on (sähköisen tiedon perusteella) haja-asutusaluetta.
 *  3. Kaavamerkintä (esim. AO, AT, M, RA) puretaan selkokieleksi ja luokitellaan.
 *  4. Rakennusoikeus: asemakaavan kerrosala tai tehokkuusluku × pinta-ala; yleiskaavan
 *     asuin-, kylä- ja loma-alueilla kunnan rakennusjärjestyksen määrät tai valtakunnallinen
 *     oletus (ks. rakennusjarjestys.ts).
 */
import { fiDate, list, m2, municipalityOf, num } from "./format.ts";
import type { PropertySummary, ZoningHit } from "./types.ts";
import { applyRule, BuildingRule, ruleFor } from "./rakennusjarjestys.ts";

export type DesignationCategory =
  | "asuin"
  | "kyla"
  | "loma"
  | "maatila"
  | "keskusta"
  | "liike"
  | "palvelu"
  | "teollisuus"
  | "maa_metsatalous"
  | "virkistys"
  | "suojelu"
  | "liikenne"
  | "erityis"
  | "vesi"
  | "muu";

export interface DesignationInfo {
  code: string;
  base: string;
  name: string;
  category: DesignationCategory;
  /** Sallitaanko asuinrakentaminen (tai loma-asuminen) merkinnän perusteella. */
  residential: boolean;
}

/** Yleisimmät kaavamerkinnät (ympäristöministeriön kaavamerkintäohjeen mukaisesti). */
export const DESIGNATIONS: Record<string, Omit<DesignationInfo, "code" | "base">> = {
  A: { name: "asuntoalue", category: "asuin", residential: true },
  AK: { name: "asuinkerrostalojen korttelialue", category: "asuin", residential: true },
  AR: { name: "rivitalojen ja muiden kytkettyjen asuinrakennusten korttelialue", category: "asuin", residential: true },
  AP: { name: "asuinpientalojen korttelialue", category: "asuin", residential: true },
  AO: { name: "erillispientalojen korttelialue", category: "asuin", residential: true },
  AOR: { name: "erillispientalojen ja rivitalojen korttelialue", category: "asuin", residential: true },
  AL: { name: "asuin-, liike- ja toimistorakennusten korttelialue", category: "asuin", residential: true },
  AH: { name: "asumista palvelevien rakennusten korttelialue", category: "asuin", residential: true },
  AT: { name: "kyläalue", category: "kyla", residential: true },
  AM: { name: "maatilojen talouskeskusten alue", category: "maatila", residential: true },
  AME: { name: "maatilojen talouskeskusten ja haja-asutuksen alue", category: "maatila", residential: true },
  RA: { name: "loma-asuntojen alue", category: "loma", residential: true },
  R: { name: "loma- ja matkailualue", category: "loma", residential: false },
  RM: { name: "matkailupalvelujen alue", category: "loma", residential: false },
  RP: { name: "palstaviljelyalue", category: "virkistys", residential: false },
  C: { name: "keskustatoimintojen alue", category: "keskusta", residential: true },
  K: { name: "liike- ja toimistorakennusten korttelialue", category: "liike", residential: false },
  KM: { name: "vähittäiskaupan suuryksikön korttelialue", category: "liike", residential: false },
  P: { name: "palvelurakennusten korttelialue", category: "palvelu", residential: false },
  PY: { name: "julkisten lähipalvelurakennusten korttelialue", category: "palvelu", residential: false },
  Y: { name: "yleisten rakennusten korttelialue", category: "palvelu", residential: false },
  T: { name: "teollisuus- ja varastorakennusten korttelialue", category: "teollisuus", residential: false },
  TY: { name: "teollisuusrakennusten korttelialue, jolla ympäristö asettaa toiminnan laadulle erityisiä vaatimuksia", category: "teollisuus", residential: false },
  TP: { name: "työpaikka-alue", category: "teollisuus", residential: false },
  M: { name: "maa- ja metsätalousvaltainen alue", category: "maa_metsatalous", residential: false },
  MT: { name: "maatalousalue", category: "maa_metsatalous", residential: false },
  MM: { name: "metsätalousvaltainen alue", category: "maa_metsatalous", residential: false },
  MU: { name: "maa- ja metsätalousvaltainen alue, jolla on erityistä ulkoilun ohjaamistarvetta", category: "maa_metsatalous", residential: false },
  MY: { name: "maa- ja metsätalousvaltainen alue, jolla on erityisiä ympäristöarvoja", category: "maa_metsatalous", residential: false },
  MA: { name: "arvokas peltoalue", category: "maa_metsatalous", residential: false },
  MRA: { name: "maaseutu- ja virkistysalue", category: "maa_metsatalous", residential: false },
  V: { name: "virkistysalue", category: "virkistys", residential: false },
  VL: { name: "lähivirkistysalue", category: "virkistys", residential: false },
  VP: { name: "puisto", category: "virkistys", residential: false },
  VU: { name: "urheilu- ja virkistyspalvelujen alue", category: "virkistys", residential: false },
  VR: { name: "retkeily- ja ulkoilualue", category: "virkistys", residential: false },
  S: { name: "suojelualue", category: "suojelu", residential: false },
  SL: { name: "luonnonsuojelualue", category: "suojelu", residential: false },
  SM: { name: "muinaismuistoalue", category: "suojelu", residential: false },
  L: { name: "liikennealue", category: "liikenne", residential: false },
  LT: { name: "yleisen tien alue", category: "liikenne", residential: false },
  LP: { name: "pysäköintialue", category: "liikenne", residential: false },
  E: { name: "erityisalue", category: "erityis", residential: false },
  EV: { name: "suojaviheralue", category: "erityis", residential: false },
  EO: { name: "maa-ainesten ottoalue", category: "erityis", residential: false },
  W: { name: "vesialue", category: "vesi", residential: false },
};

/** "AO-1", "AT/s", "ao 2" -> pisin tunnettu kirjainyhdistelmä alusta. */
export function parseDesignation(code: string | null | undefined): DesignationInfo | null {
  if (!code) return null;
  const letters = code.trim().toUpperCase().match(/^[A-ZÅÄÖ]+/)?.[0];
  if (!letters) return null;
  for (let n = letters.length; n > 0; n--) {
    const base = letters.slice(0, n);
    const d = DESIGNATIONS[base];
    if (d) return { code: code.trim().toUpperCase(), base, ...d };
  }
  return { code: code.trim().toUpperCase(), base: letters, name: `kaavamerkintä ${letters}`, category: "muu", residential: false };
}

export { BUILDING_RULES, NATIONAL_RULE } from "./rakennusjarjestys.ts";

export interface BuildingRight {
  m2: number | null;
  basis: string;
  /** Arvio rakennuspaikkojen määrästä (haja-asutus / yleiskaava), hinta-arviota varten. */
  building_sites: number;
  residential: boolean;
  /** Rakennusjärjestyksen sääntö, jolla rakennusoikeus arvioitiin (yleiskaava-alueet). */
  rule?: { municipality: string; source: string; is_estimate: boolean; min_site_m2: number };
}

export interface KaavaResult {
  status: "asemakaava" | "yleiskaava" | "ei_tiedossa";
  primary: (ZoningHit & { info: DesignationInfo | null }) | null;
  hits: (ZoningHit & { info: DesignationInfo | null })[];
  building_right: BuildingRight;
  /** Ilmoitukseen menevät kappaleet */
  kaavoitustilanne: string;
  rakennusoikeus: string;
  documents: string[];
  checks: string[];
  /** Mistä ensisijaisen osuman kaavamerkintä tuli. */
  designation_source: "rajapinta" | "myyja" | null;
  /** true, kun kiinteistö on kaava-alueella, mutta merkintää ei saatu: käyttöliittymä
   *  pyytää myyjää valitsemaan sen kaavakartasta (designation_options). */
  designation_needed: boolean;
  designation_options: { code: string; name: string }[];
}

/** Valittavat merkinnät, kun kaavamerkintä puuttuu (yleisimmät ensin). */
const YK_OPTIONS = ["AT", "AME", "AO", "A", "RA", "M", "MU", "MY", "MA", "V", "VR", "SL"];
const AK_OPTIONS = ["AO", "AP", "AR", "AK", "RA", "M", "VL", "VP", "P", "T"];
function designationOptions(level: "asemakaava" | "yleiskaava", rule?: BuildingRule) {
  const codes = level === "asemakaava" ? AK_OPTIONS : [...new Set([...(rule?.applies_to ?? []), ...YK_OPTIONS])];
  return codes.map((code) => ({ code, name: DESIGNATIONS[code].name }));
}

/** "kyläalue" -> "kyläaluetta", "korttelialue" -> "korttelialuetta" */
const partitive = (s: string) => s.replace(/alue$/, "aluetta").replace(/puisto$/, "puistoa");
/** "kyläalue" -> "kyläalueeksi" */
const translative = (s: string) => s.replace(/alue$/, "alueeksi").replace(/puisto$/, "puistoksi");
const fmtE = (e: number) => num(e, 2).replace(/,?0+$/, "");
const URL_RE = /https?:\/\/[^\s)"']+/g;

function planLabel(h: ZoningHit): string {
  const parts = [h.plan_name ?? (h.level === "asemakaava" ? "asemakaava" : h.level)];
  if (h.plan_id && !(h.plan_name ?? "").includes(h.plan_id)) parts.push(`(${h.plan_id})`);
  const d = fiDate(h.approved_on);
  if (d) parts.push(`, hyväksytty/voimaan ${d}`);
  return parts.join(" ").replace(" ,", ",");
}


export function interpretZoning(summary: PropertySummary, opts: { designation?: string | null } = {}): KaavaResult {
  const areaM2 = summary.area_ha * 10_000;
  const muni = municipalityOf(summary.municipality.name);
  const rule = ruleFor(summary.municipality.code);

  const hits = (summary.zoning ?? [])
    .filter((h) => h.overlap_m2 >= 200 || h.overlap_m2 >= 0.05 * areaM2)
    .map((h) => ({ ...h, info: parseDesignation(h.designation) }));
  const documents = [...new Set(hits.flatMap((h) => h.regulations?.match(URL_RE) ?? []))];
  // Myyjän kaavakartasta ilmoittama merkintä täydentää osuman, jolta merkintä puuttuu.
  const override = parseDesignation(opts.designation);
  let overridden: ZoningHit | null = null;
  if (override) {
    const level = hits.some((h) => h.level === "asemakaava") ? "asemakaava" : "yleiskaava";
    // Rajapinnasta saatu merkintä on ensisijainen; myyjän valinta täydentää vain puuttuvan.
    const target = hits.some((h) => h.level === level && h.info)
      ? undefined
      : hits.filter((h) => h.level === level).sort((a, b) => b.overlap_m2 - a.overlap_m2)[0];
    if (target) {
      target.info = override;
      target.designation = override.code;
      overridden = target;
    }
  }
  const overrideUsed = (h: ZoningHit) => h === overridden;
  const ak = hits.filter((h) => h.level === "asemakaava");
  const yk = hits.filter((h) => h.level === "yleiskaava");
  const checks: string[] = [];
  if (overridden) {
    checks.push(`Kaavamerkintä ${override!.code} on myyjän kaavakartasta ilmoittama; varmista se kaavaotteesta.`);
  }

  const pick = (rows: typeof hits) =>
    [...rows].sort((a, b) =>
      Number(!!b.info) - Number(!!a.info) ||
      Number(b.building_right_m2 !== null || b.efficiency !== null) -
        Number(a.building_right_m2 !== null || a.efficiency !== null) ||
      b.overlap_m2 - a.overlap_m2
    )[0] ?? null;

  // ---- Asemakaava ------------------------------------------------------------
  if (ak.length) {
    const p = pick(ak)!;
    const share = Math.min(1, p.overlap_m2 / areaM2);
    const shareTxt = share > 0.95 ? "kokonaan" : share > 0.5 ? "pääosin" : "osittain";
    let right: number | null = null, basis = "";
    if (p.building_right_m2) {
      const frac = p.zone_area_m2 && p.zone_area_m2 > 0 ? Math.min(1, p.overlap_m2 / p.zone_area_m2) : 1;
      right = Math.round(p.building_right_m2 * frac);
      basis = frac < 0.95
        ? `kaavayksikön rakennusoikeudesta ${num(p.building_right_m2)} k-m² kiinteistön osuus ${num(frac * 100)} %`
        : "asemakaavaan merkitty kerrosala";
    } else if (p.efficiency) {
      right = Math.round(p.efficiency * p.overlap_m2);
      basis = `tehokkuusluku e=${fmtE(p.efficiency)} × kaava-alueeseen kuuluva pinta-ala ${m2(p.overlap_m2)}`;
    }
    const info = p.info;
    let tilanne = `Kiinteistö sijaitsee ${shareTxt} asemakaava-alueella: ${planLabel(p)}.`;
    if (info) {
      tilanne += ` Kaavamerkintä ${info.code} – ${info.name}.`;
      if (info.residential) tilanne += " Alue on osoitettu asumiseen, ja rakentaminen tapahtuu rakennusluvalla asemakaavan mukaisesti.";
      else if (info.category === "maa_metsatalous") tilanne += " Alue on osoitettu maa- ja metsätalouskäyttöön; uutta asuinrakentamista ei ole osoitettu.";
      else if (info.category === "virkistys" || info.category === "suojelu" || info.category === "liikenne") {
        tilanne += " Alue on osoitettu yleiseen käyttöön, eikä sille ole osoitettu yksityistä rakennusoikeutta. Kunnalla voi olla lunastusvelvollisuus tai -oikeus.";
      }
    } else {
      tilanne += " Kaavan käyttötarkoitusmerkintä ei ole saatavilla sähköisesti; se tarkistetaan kaavakartasta.";
      checks.push("Tarkista asemakaavan käyttötarkoitus ja rakennusoikeus kaavakartasta.");
    }
    const other = [...new Set(ak.filter((h) => h !== p && h.info && h.info.base !== info?.base).map((h) => `${h.info!.code} (${h.info!.name})`))];
    if (other.length) tilanne += ` Kiinteistölle ulottuu lisäksi ${list(other)}.`;
    const pr = hits.find((h) => /suurin sallittu kerrosluku/i.test(h.regulations ?? ""))?.regulations?.match(/Suurin sallittu kerrosluku [^.]+\./)?.[0];

    let rak: string;
    if (right) {
      rak = `Rakennusoikeus on noin ${num(right)} k-m² (${basis}).`;
      if (pr) rak += ` ${pr}`;
      rak += " Rakennusoikeuden käytetty ja käyttämätön osuus sekä mahdolliset rakennusalat ja -rajoitukset tarkistetaan kunnan rakennusvalvonnasta.";
    } else if (info && !info.residential) {
      rak = "Asemakaavassa alueelle ei ole osoitettu asuinrakennusoikeutta.";
    } else {
      rak = "Rakennusoikeuden määrä ei ole saatavilla sähköisesti. Se tarkistetaan kaavakartasta ja -määräyksistä tai kunnan rakennusvalvonnasta.";
      checks.push("Selvitä rakennusoikeus (k-m²) ja tehokkuusluku kunnan rakennusvalvonnasta.");
    }
    return {
      status: "asemakaava",
      primary: p,
      hits,
      building_right: { m2: right, basis: basis || "ei tiedossa", building_sites: 0, residential: !!info?.residential },
      kaavoitustilanne: tilanne,
      rakennusoikeus: rak,
      documents,
      checks,
      designation_source: info ? (overrideUsed(p) ? "myyja" : "rajapinta") : null,
      designation_needed: !info,
      designation_options: info ? [] : designationOptions("asemakaava"),
    };
  }

  // ---- Yleiskaava -------------------------------------------------------------
  const noPlanText = (prefix: string) =>
    `${prefix}Rakentaminen asemakaavoittamattomalla alueella ratkaistaan rakennusluvalla ja tarvittaessa suunnittelutarveratkaisulla tai poikkeamispäätöksellä (alueidenkäyttölaki, entinen maankäyttö- ja rakennuslaki). ` +
    `Rakennuspaikan vähimmäiskoko, rakennusten enimmäiskoko ja etäisyydet määräytyvät ${muni} rakennusjärjestyksen mukaan; haja-asutusalueella rakennuspaikan vähimmäiskoko on tyypillisesti 2 000–5 000 m².`;

  if (yk.length) {
    const p = pick(yk)!;
    const info = p.info;
    const share = Math.min(1, p.overlap_m2 / areaM2);
    const shareTxt = share > 0.95 ? "kokonaan" : share > 0.5 ? "pääosin" : "osittain";
    let tilanne = `Kiinteistö sijaitsee ${shareTxt} yleiskaava-alueella: ${planLabel(p)}`;
    tilanne += info ? `. Kaavamerkintä ${info.code} – ${info.name}.` : ".";
    tilanne += " Alueella ei ole voimassa olevaa asemakaavaa.";

    let rak = "";
    let right: number | null = null, sites = 0, basis = "";
    let ruleInfo: BuildingRight["rule"];
    const residential = !!info?.residential;
    if (info && residential) {
      const zoneM2 = Math.min(p.overlap_m2, areaM2);
      const holiday = info.category === "loma";
      const r = applyRule(rule, zoneM2, holiday);
      right = r.m2;
      sites = r.sites;
      ruleInfo = { municipality: rule.municipality, source: rule.source, is_estimate: rule.is_estimate, min_site_m2: rule.min_site_m2 };
      basis = r.limited_by === "tehokkuus"
        ? `${num(rule.efficiency * 100)} % × ${m2(zoneM2)} (${rule.is_estimate ? "arvio" : rule.municipality + ", rakennusjärjestys"})`
        : `${rule.is_estimate ? "tyypillinen rakennusjärjestys (arvio)" : rule.source}`;
      if (rule.applies_to?.includes(info.base)) {
        // Kunnan oma ohjeteksti (Espoo), välittäjän kielellä.
        const cap = (rule.residential_max_m2 ?? rule.max_m2) + (rule.outbuilding_m2 ?? 0);
        rak =
          `Yleiskaavan ${list(rule.applies_to.map((c) => c + "-"))}alueilla on asuinrakentamisen osalta noudatettu enimmäistehokkuutta e=${fmtE(rule.efficiency)} ` +
          `tai rakennusjärjestyksen enimmäismääriä (asuinrakennus enintään ${num(rule.residential_max_m2 ?? rule.max_m2)} m², lisäksi talousrakennuksia yhteensä enintään ${num(rule.outbuilding_m2 ?? 0)} m² asuntoa kohti` +
          (rule.holiday_max_m2
            ? `, loma-asunnot tällä alueella enintään ${num(rule.holiday_max_m2)} m² sekä talousrakennuksia siten, että kokonaiskerrosala on enintään ${num(rule.holiday_total_m2 ?? rule.holiday_max_m2)} m²`
            : "") +
          `), kumpi ensin tulee täyteen. Jos kyseessä on muu kuin asuinrakentaminen tai loma-asunnon rakentaminen, on niiden enimmäismäärä tehokkuusluvun e=${fmtE(rule.efficiency)} mukainen. ` +
          `Kiinteistö on ${shareTxt} yleiskaavan ${partitive(info.name)} ${info.base}, joten se mahdollistaa vakituisen asumisen, jos muut edellytykset täyttyvät. ` +
          `Kiinteistön ${info.base}-alueeseen kuuluvalla pinta-alalla (${m2(zoneM2)}) tehokkuusluvun mukainen enimmäiskerrosala olisi ${num(Math.round(r.e_m2))} k-m², ` +
          (r.e_m2 < cap
            ? `joten rakennusoikeutta rajaa tehokkuusluku: arviolta ${num(right)} k-m².`
            : `joten rakennusoikeutta rajaavat rakennusjärjestyksen enimmäismäärät: arviolta ${num(rule.residential_max_m2 ?? rule.max_m2)} m² asuinrakennus ja ${num(rule.outbuilding_m2 ?? 0)} m² talousrakennuksia asuntoa kohti.`) +
          ` (${rule.source})`;
      } else {
        const what = holiday ? "loma-asumisen" : "asumisen";
        const ruleTxt = rule.is_estimate
          ? `${muni} rakennusjärjestyksen tarkkoja määriä ei ole vielä palvelussa, joten arvio perustuu tyypilliseen haja-asutusalueen rakennusjärjestykseen: `
          : `${rule.source}: `;
        const limits = holiday
          ? `loma-asunnon rakennuspaikan kerrosala enintään ${num(rule.holiday_total_m2 ?? rule.holiday_max_m2 ?? 150)} k-m²`
          : `rakennusoikeus ${num(rule.efficiency * 100)} % rakennuspaikan pinta-alasta` +
            (rule.min_m2 ? `, kuitenkin vähintään ${num(rule.min_m2)} k-m²` : "") +
            ` ja enintään ${num(rule.max_m2)} k-m²` +
            (rule.residential_max_m2 ? `; asuinrakennus enintään ${num(rule.residential_max_m2)} k-m²` : "") +
            (rule.outbuilding_m2 ? ` ja talousrakennukset yhteensä enintään ${num(rule.outbuilding_m2)} m²` : "");
        rak =
          `Yleiskaava osoittaa alueen ${translative(info.name)} (${info.base}), joka mahdollistaa ${what}, jos muut edellytykset täyttyvät. ` +
          `${ruleTxt}rakennuspaikan vähimmäiskoko ${m2(rule.min_site_m2)}, ${limits}. ` +
          (r.below_min_site
            ? `Kiinteistön ${info.base}-alueeseen kuuluva pinta-ala (${m2(zoneM2)}) alittaa vähimmäiskoon, joten uuden rakennuspaikan saaminen edellyttää poikkeamista; olemassa olevalla rakennuspaikalla korvaava rakentaminen on yleensä mahdollista. `
            : `Kiinteistön ${info.base}-alueeseen kuuluvalla pinta-alalla (${m2(zoneM2)}) rakennusoikeus on arviolta ${num(right)} k-m². `) +
          "Rakennuspaikkojen määrä perustuu yleiskaavan mitoitukseen, ja rakentaminen ratkaistaan rakennusluvalla.";
        checks.push(
          rule.is_estimate
            ? `Rakennusoikeus on arvio tyypillisen rakennusjärjestyksen mukaan; tarkista ${muni} rakennusjärjestys ja yleiskaavan mitoitus.`
            : `Tarkista yleiskaavan mitoitus ja käyttämättömät rakennusoikeudet (${muni} kaavoitus / rakennusvalvonta).`,
        );
      }
    } else if (info?.category === "maa_metsatalous") {
      rak =
        "Alue on yleiskaavassa osoitettu maa- ja metsätalouskäyttöön. Alueelle saa rakentaa maa- ja metsätaloutta palvelevia rakennuksia; " +
        "uusi asuinrakentaminen edellyttää yleensä suunnittelutarveratkaisua tai poikkeamispäätöstä, eikä sen myöntäminen ole varmaa.";
    } else if (info) {
      rak = `Yleiskaavan merkintä ${info.code} ei osoita alueelle yksityistä asuinrakentamista. ` + noPlanText("");
    } else {
      rak = "Yleiskaavan käyttötarkoitusmerkintä ei ole saatavilla sähköisesti. " + noPlanText("");
      checks.push("Tarkista yleiskaavan käyttötarkoitusmerkintä kaavakartasta.");
    }
    return {
      status: "yleiskaava",
      primary: p,
      hits,
      building_right: { m2: right, basis: basis || "ei tiedossa", building_sites: sites, residential, rule: ruleInfo },
      kaavoitustilanne: tilanne,
      rakennusoikeus: rak,
      documents,
      checks,
      designation_source: info ? (overrideUsed(p) ? "myyja" : "rajapinta") : null,
      designation_needed: !info,
      designation_options: info ? [] : designationOptions("yleiskaava", rule),
    };
  }

  // ---- Ei kaavatietoa ---------------------------------------------------------------
  const pilotTxt = summary.municipality.zoning_pilot
    ? `Kiinteistön alueelta ei löytynyt voimassa olevaa asema- tai yleiskaavaa ${muni} omista aineistoista eikä valtakunnallisen Ryhti-palvelun aineistoista.`
    : `Kiinteistön alueelta ei löytynyt voimassa olevaa asema- tai yleiskaavaa valtakunnallisesta Ryhti-palvelusta (${muni} kaavoja ei vielä haeta automaattisesti).`;
  checks.push(`Varmista kaavatilanne ${muni} kaavoituksesta (myös maakuntakaava ja vireillä olevat kaavat).`);
  return {
    status: "ei_tiedossa",
    primary: null,
    hits,
    building_right: { m2: null, basis: "ei kaavaa", building_sites: 0, residential: false },
    kaavoitustilanne: `${pilotTxt} Alue on todennäköisesti asemakaavoittamatonta haja-asutusaluetta.`,
    rakennusoikeus: noPlanText(""),
    documents,
    checks,
    designation_source: null,
    designation_needed: false,
    designation_options: [],
  };
}
