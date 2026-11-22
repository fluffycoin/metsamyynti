import type { BBox } from "../../wfs.ts";

/** Kaavatieto yhtenäisessä muodossa; vastaa zoning_areas-taulua. */
export interface ZoningRow {
  level: "asemakaava" | "yleiskaava" | "maakuntakaava";
  source_layer: string;
  source_id: string;
  plan_name: string | null;
  plan_id: string | null;
  approved_on: string | null; // YYYY-MM-DD
  designation: string | null; // käyttötarkoitus, esim. "AO", "AT", "M"
  efficiency: number | null;  // tehokkuusluku e
  building_right_m2: number | null;
  regulations: string | null;
  geometry: { type: string; coordinates: unknown };
  raw: Record<string, unknown>;
}

export interface ZoningSource {
  municipalityCode: string;
  municipalityName: string;
  /** Mitä tästä kunnasta saadaan; näytetään käyttäjälle, jos tieto puuttuu. */
  coverage: string;
  fetch(bbox: BBox): Promise<ZoningRow[]>;
}

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** "20140317" tai "17.3.2014" tai ISO -> "2014-03-17" */
export const date = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v);
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

/** Poistaa HTML-linkeistä tagit mutta säilyttää osoitteen. */
export const hrefOf = (v: unknown): string | null => {
  const m = String(v ?? "").match(/href="([^"]+)"/);
  return m ? m[1] : null;
};

/** Ensimmäinen arvo, jos ominaisuus toistuu (GML-listat). */
export const first = (v: unknown): string | null => {
  const x = Array.isArray(v) ? v.find((e) => e !== null && e !== "") : v;
  return x === null || x === undefined || x === "" ? null : String(x);
};

/** Yhdistää ei-tyhjät lauseet. */
export const sentences = (...parts: (string | null | undefined | false)[]): string | null =>
  parts.filter(Boolean).join(" ") || null;
