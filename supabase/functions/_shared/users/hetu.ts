/**
 * Henkilötunnuksen tarkistus. Muoto PPKKVV C NNN T, välimerkki C kertoo vuosisadan
 * (+ 1800, - Y X W V U 1900, A B C D E F 2000). Tarkistusmerkki = (PPKKVVNNN mod 31).
 */
const CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY";
const CENTURY: Record<string, number> = {
  "+": 1800, "-": 1900, Y: 1900, X: 1900, W: 1900, V: 1900, U: 1900,
  A: 2000, B: 2000, C: 2000, D: 2000, E: 2000, F: 2000,
};

export function normalizeHetu(input: string): string {
  const s = input.trim().toUpperCase();
  const m = s.match(/^(\d{2})(\d{2})(\d{2})([-+ABCDEFUVWXY])(\d{3})([0-9A-Y])$/);
  if (!m) throw new Error("Virheellinen henkilötunnus");
  const [, dd, mm, yy, sep, nnn, check] = m;
  if (CHECK[Number(dd + mm + yy + nnn) % 31] !== check) {
    throw new Error("Virheellinen henkilötunnuksen tarkistusmerkki");
  }
  const year = CENTURY[sep] + Number(yy);
  const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
  if (d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) {
    throw new Error("Virheellinen henkilötunnuksen päivämäärä");
  }
  return s;
}

/** Testitunnukset käyttävät yksilönumeroita 900–999. */
export function isTestHetu(hetu: string): boolean {
  return Number(normalizeHetu(hetu).slice(7, 10)) >= 900;
}
