/**
 * Luonnonvarakeskuksen kantohinnat viikoittain (PxWeb-rajapinta, avoin).
 * Taulukko: Metsäteollisuus ry:n puukaupan viikkoseuranta / Kantohinnat viikoittain.
 */
import { fetchJson } from "../wfs.ts";

export const LUKE_STUMPAGE_URL =
  "https://statdb.luke.fi/PxWeb/api/v1/fi/LUKE/met/metryv/0100_metryv.px";

export interface StumpagePrice {
  week: string;          // "2026W46"
  price_area: string;    // "1" Etelä-Suomi ... "9" koko maa
  cutting_method: string;// "0" pystykauppa yht., "8021" uudistus, "8023" harvennus, "8022" ensiharvennus
  assortment: string;    // "N1".."N8"
  eur_m3: number | null;
}

/** Puutavaralajit. */
export const ASSORTMENTS: Record<string, string> = {
  N1: "Mäntytukki",
  N2: "Kuusitukki",
  N3: "Koivutukki",
  N4: "Mäntykuitupuu",
  N5: "Kuusikuitupuu",
  N6: "Koivukuitupuu",
  N7: "Mäntypikkutukki",
  N8: "Kuusipikkutukki",
};

/** Hakee viimeisimmät `weeks` viikkoa kaikilta hinta-alueilta. */
export async function fetchStumpagePrices(weeks = 4): Promise<StumpagePrice[]> {
  const body = {
    query: [{ code: "W", selection: { filter: "top", values: [String(weeks)] } }],
    response: { format: "json" },
  };
  const res = await fetchJson<{ data: { key: string[]; values: string[] }[] }>(LUKE_STUMPAGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.data.map(({ key, values }) => {
    const v = Number(values[0]);
    return {
      week: key[0],
      price_area: key[1],
      cutting_method: key[2],
      assortment: key[3],
      eur_m3: Number.isFinite(v) && values[0] !== "." && values[0] !== ".." ? v : null,
    };
  });
}

/** "2026W46" -> kyseisen ISO-viikon maanantai (UTC). */
export function weekStart(week: string): Date | null {
  const m = week.match(/^(\d{4})W(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]), w = Number(m[2]);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(mon1.getTime() + (w - 1) * 7 * 86_400_000);
}

/** Ovatko kannan kantohinnat tuoreita (uusin viikko enintään 21 päivää vanha ja hintoja on)? */
export function stumpagePricesFresh(
  p: { week: string | null; eur_m3: Record<string, number | null> | null } | null | undefined,
  now = new Date(),
): boolean {
  if (!p?.week || !p.eur_m3 || !Object.values(p.eur_m3).some((v) => typeof v === "number" && v > 0)) return false;
  const start = weekStart(p.week);
  return !!start && now.getTime() - start.getTime() < 21 * 86_400_000;
}

/** Hakee hinnat Lukelta ja tallentaa ne (sama kuin sync-stumpage-prices). */
// deno-lint-ignore no-explicit-any
export async function syncStumpagePrices(db: any, weeks = 8): Promise<number> {
  const prices = await fetchStumpagePrices(weeks);
  const { error } = await db.from("stumpage_prices").upsert(prices);
  if (error) throw new Error(error.message);
  return prices.length;
}
