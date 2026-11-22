/** Suomenkieliset luku- ja rahamuotoilut ilmoitusteksteihin. */

const nf = (digits: number) =>
  new Intl.NumberFormat("fi-FI", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 12345.6 -> "12 346"; tavallinen välilyönti tuhaterottimena (helpompi kopioida). */
export function num(n: number, digits = 0): string {
  return nf(digits).format(n).replace(/[  ]/g, " ").replace("−", "-");
}

/** Pyöristää hinnan esitystä varten: alle 10 000 € sataan, alle 1 M€ tuhanteen, muuten 10 000:een. */
export function roundPrice(n: number): number {
  const step = n < 10_000 ? 100 : n < 1_000_000 ? 1_000 : 10_000;
  return Math.round(n / step) * step;
}

export const eur = (n: number) => `${num(roundPrice(n))} €`;
export const ha = (n: number) => `${num(n, n < 1 ? 2 : 1)} ha`;
export const m2 = (n: number) => `${num(n)} m²`;
export const m3 = (n: number) => `${num(n)} m³`;

/** "2026-03-17" -> "17.3.2026" */
export function fiDate(iso: string | null | undefined): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : null;
}

/** "2026W46" -> "viikko 46/2026" */
export function fiWeek(w: string | null | undefined): string | null {
  const m = w?.match(/^(\d{4})W(\d{1,2})$/);
  return m ? `viikko ${Number(m[2])}/${m[1]}` : null;
}

/** Luettelo suomeksi: ["a","b","c"] -> "a, b ja c" */
export function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ja ${items[items.length - 1]}`;
}

/** Kuntien genetiivimuodot (pilotit ja suurimmat). Tuntematon -> null, jolloin teksti käyttää muotoa "kunnan". */
const GENITIVE: Record<string, string> = {
  Espoo: "Espoon", Vantaa: "Vantaan", Tampere: "Tampereen", Turku: "Turun", Tuusula: "Tuusulan",
  Kerava: "Keravan", Sipoo: "Sipoon", Pirkkala: "Pirkkalan", Helsinki: "Helsingin", Oulu: "Oulun",
  Jyväskylä: "Jyväskylän", Kuopio: "Kuopion", Lahti: "Lahden", Pori: "Porin", Joensuu: "Joensuun",
  Lappeenranta: "Lappeenrannan", Hämeenlinna: "Hämeenlinnan", Vaasa: "Vaasan", Seinäjoki: "Seinäjoen",
  Rovaniemi: "Rovaniemen", Mikkeli: "Mikkelin", Kotka: "Kotkan", Salo: "Salon", Porvoo: "Porvoon",
  Kouvola: "Kouvolan", Lohja: "Lohjan", Nurmijärvi: "Nurmijärven", Järvenpää: "Järvenpään",
  Kirkkonummi: "Kirkkonummen", Kangasala: "Kangasalan", Lempäälä: "Lempäälän", Ylöjärvi: "Ylöjärven",
  Nokia: "Nokian", Kaarina: "Kaarinan", Raisio: "Raision", Naantali: "Naantalin",
};
/** "Espoo" -> "Espoon kaupungin"-tyyppisiin lauseisiin: "Espoon" tai varamuoto "kunnan (Nimi)". */
export function municipalityOf(name: string | null | undefined): string {
  if (!name) return "kunnan";
  return GENITIVE[name] ?? `kunnan (${name})`;
}
