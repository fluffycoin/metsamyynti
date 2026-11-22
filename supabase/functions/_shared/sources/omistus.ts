/**
 * Maanomistus avoimista karttapalveluista.
 *
 * Espoo: "Espoon kaupungin maanomistus" (kartat.espoo.fi, WMS-taso Kaupungin_maanomistus,
 * avoindata.fi). Taso on vain kuvana (ei GetFeatureInfoa, WFS-taso vaatii tunnukset), joten
 * kaupungin osuus luetaan kuvasta: kaupungin maa on värillinen, muu maa läpinäkyvä.
 * Sinisellä piirretyt kiinteistörajat ohitetaan.
 *
 * Muut kaupungit (Helsinki, Vantaa, Tampere, Turku) eivät julkaise maanomistusta avoimena
 * rajapintana. Niiden aineistot tuodaan tauluun land_owner_areas (scripts/import-maanomistus.ts).
 */
import { pointInPolygon } from "./mml.ts";
import { bboxOf } from "../wfs.ts";

export const ESPOO_WMS = "https://kartat.espoo.fi/teklaogcweb/wms.ashx";
export const ESPOO_LAYER = "Kaupungin_maanomistus";

export interface OwnerShare {
  category: "kunta";
  owner_name: string;
  /** Osuus kiinteistön alasta, jonka kartta näyttää kaupungin maana (0..1). */
  share: number;
  source: string;
}

/** Lähteet kuntanumeron mukaan. */
export function ownershipSourceFor(municipalityCode: string): "espoo" | null {
  return municipalityCode === "049" ? "espoo" : null;
}

// ---------------------------------------------------------------------------
// PNG (8-bit RGB/RGBA/paletti, ei lomitusta)
// ---------------------------------------------------------------------------
export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 tavua pikseliä kohden */
  data: Uint8Array;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodePng(buf: Uint8Array): Promise<Raster> {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => buf[i] === b)) throw new Error("Vastaus ei ole PNG-kuva");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos < buf.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = dv.getUint32(pos + 8);
      height = dv.getUint32(pos + 12);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`PNG-muotoa ei tueta (bitDepth ${bitDepth}, interlace ${interlace})`);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) throw new Error(`PNG-värityyppiä ${colorType} ei tueta`);
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of idat) { joined.set(c, o); o += c.length; }
  const raw = await inflate(joined);

  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 255;
    }
  }

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (colorType === 6) data.set(pixels.subarray(s, s + 4), d);
    else if (colorType === 2) {
      data.set(pixels.subarray(s, s + 3), d);
      data[d + 3] = 255;
    } else if (colorType === 3) {
      const k = pixels[s];
      data.set(palette!.subarray(k * 3, k * 3 + 3), d);
      data[d + 3] = trns && k < trns.length ? trns[k] : 255;
    } else {
      const g = pixels[s];
      data[d] = data[d + 1] = data[d + 2] = g;
      data[d + 3] = colorType === 4 ? pixels[s + 1] : 255;
    }
  }
  return { width, height, data };
}

/**
 * Onko pikseli kaupungin maata? Kaupungin maa on piirretty peittävällä värillä (vaaleanpunainen,
 * magenta, vuokra-alueiden tiheä rasteri mustana). Kiinteistörajat ovat sinisiä; läpinäkyvä on
 * muuta maata. Palauttaa null rajaviivalle (ei lasketa kumpaankaan).
 */
export function isCityPixel(r: number, g: number, b: number, a: number): boolean | null {
  if (a < 128) return false;
  if (r > 240 && g > 240 && b > 240) return false;   // valkoinen tausta
  if (b > r + 40 && b > g) return null;              // sininen rajaviiva
  return true;
}

async function getMap(bbox: number[], width: number, height: number): Promise<Raster> {
  const u = new URL(ESPOO_WMS);
  u.searchParams.set("service", "WMS");
  u.searchParams.set("version", "1.3.0");
  u.searchParams.set("request", "GetMap");
  u.searchParams.set("layers", ESPOO_LAYER);
  u.searchParams.set("styles", "");
  u.searchParams.set("crs", "EPSG:3067");
  u.searchParams.set("bbox", bbox.map((v) => v.toFixed(1)).join(","));
  u.searchParams.set("width", String(width));
  u.searchParams.set("height", String(height));
  u.searchParams.set("format", "image/png");
  u.searchParams.set("transparent", "true");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!res.ok) throw new Error(`Espoon maanomistuskartta: HTTP ${res.status}`);
    return await decodePng(buf);
  } finally {
    clearTimeout(t);
  }
}

/** Laskee kuvasta, kuinka suuri osa monikulmiosta on kaupungin maata. */
export function shareInside(
  img: Raster,
  bbox: number[],
  polygons: number[][][][],
): number | null {
  const [x0, y0, x1, y1] = bbox;
  const sx = (x1 - x0) / img.width, sy = (y1 - y0) / img.height;
  let city = 0, total = 0;
  for (let j = 0; j < img.height; j++) {
    const y = y1 - (j + 0.5) * sy;   // kuvan rivi 0 on pohjoisessa
    for (let i = 0; i < img.width; i++) {
      const x = x0 + (i + 0.5) * sx;
      if (!polygons.some((p) => pointInPolygon(x, y, p))) continue;
      const d = (j * img.width + i) * 4;
      const v = isCityPixel(img.data[d], img.data[d + 1], img.data[d + 2], img.data[d + 3]);
      if (v === null) continue;
      total++;
      if (v) city++;
    }
  }
  return total === 0 ? null : city / total;
}

/** Espoon kaupungin osuus kiinteistöstä (geometria EPSG:3067). */
export async function espooCityShare(geometry: { coordinates: number[][][][] }): Promise<OwnerShare | null> {
  const bbox = bboxOf(geometry, 2);
  const w = bbox[2] - bbox[0], h = bbox[3] - bbox[1];
  // Noin 1–2 m pikseli pienille, enintään 400 px suurille kiinteistöille
  const scale = Math.min(400 / w, 400 / h, 1);
  const width = Math.max(8, Math.round(w * scale)), height = Math.max(8, Math.round(h * scale));
  const img = await getMap(bbox, width, height);
  const share = shareInside(img, bbox, geometry.coordinates);
  if (share === null) return null;
  return { category: "kunta", owner_name: "Espoon kaupunki", share, source: "espoo_wms" };
}

/**
 * Tarkistaa kunnan avoimesta maanomistuskartasta, onko kiinteistö kunnan maata, ja kirjaa
 * tuloksen tietokantaan (record_land_owner). Ylläpidon korjauksia ei muuteta. Virheet
 * ohitetaan: merkintä on lisätieto, eikä sen puuttuminen saa estää kiinteistön näyttämistä.
 */
export async function checkMunicipalOwnership(
  // deno-lint-ignore no-explicit-any
  db: any,
  kiinteistotunnus14: string,
  geometry: { coordinates: number[][][][] },
): Promise<void> {
  if (ownershipSourceFor(kiinteistotunnus14.slice(0, 3)) !== "espoo") return;
  try {
    const r = await espooCityShare(geometry);
    if (!r) return;
    const flagged = r.share >= 0.5;
    const { error } = await db.rpc("record_land_owner", {
      p_kiinteistotunnus: kiinteistotunnus14,
      p_category: flagged ? r.category : null,
      p_owner_name: r.owner_name,
      p_source: r.source,
      p_share: Math.round(r.share * 100) / 100,
    });
    if (error) console.warn(`record_land_owner: ${error.message}`);
  } catch (e) {
    console.warn(`Maanomistuksen tarkistus epäonnistui (${kiinteistotunnus14}): ${(e as Error).message}`);
  }
}
