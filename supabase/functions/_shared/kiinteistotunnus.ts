/**
 * Kiinteistötunnus: kunta (3) - sijaintialue (3) - ryhmä (4) - yksikkö (4).
 * Esitysmuoto "49-401-1-1" tai "049-401-0001-0001", tallennusmuoto 14 numeroa.
 * Määräalatunnuksessa on lisäksi "M" ja määräalan numero, esim. "49-401-1-1-M601".
 */
export interface Kiinteistotunnus {
  /** 14-numeroinen muoto, esim. "04940100010001" */
  long: string;
  /** Esitysmuoto ilman etunollia, esim. "49-401-1-1" */
  display: string;
  municipalityCode: string;
  /** Määräalan numero, jos kyseessä on määräala */
  maarala?: string;
}

const WIDTHS = [3, 3, 4, 4];

export function parseKiinteistotunnus(input: string): Kiinteistotunnus {
  const s = input.trim().toUpperCase().replace(/\s+/g, "");
  let maarala: string | undefined;
  let main = s;
  const m = s.match(/^(.*?)-?M(\d{1,4})$/);
  if (m) {
    main = m[1];
    maarala = String(Number(m[2]));
  }

  let parts: string[];
  if (/^\d{14}$/.test(main)) {
    parts = [main.slice(0, 3), main.slice(3, 6), main.slice(6, 10), main.slice(10, 14)];
  } else if (/^\d{1,3}-\d{1,3}-\d{1,4}-\d{1,4}$/.test(main)) {
    parts = main.split("-");
  } else {
    throw new Error(`Virheellinen kiinteistötunnus: "${input}"`);
  }

  const padded = parts.map((p, i) => p.padStart(WIDTHS[i], "0"));
  const display = parts.map((p) => String(Number(p))).join("-");
  return {
    long: padded.join(""),
    display: maarala ? `${display}-M${Number(maarala)}` : display,
    municipalityCode: padded[0],
    maarala,
  };
}
