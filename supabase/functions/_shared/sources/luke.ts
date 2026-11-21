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
