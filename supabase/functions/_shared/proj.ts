/** Koordinaattimuunnokset kuntien GK-tasokoordinaatistoista ETRS-TM35FIN:iin (EPSG:3067). */
import proj4 from "npm:proj4@2.12.1";
import type { BBox } from "./wfs.ts";

const GRS80 = "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
proj4.defs("EPSG:3067", `+proj=utm +zone=35 ${GRS80}`);
// ETRS-GK19 ... GK31 (EPSG:3873 ... 3885): keskimeridiaani 19..31, x_0 = kaista * 1e6 + 500000
for (let lon = 19; lon <= 31; lon++) {
  proj4.defs(`EPSG:${3854 + lon}`, `+proj=tmerc +lat_0=0 +lon_0=${lon} +k=1 +x_0=${lon * 1e6 + 500000} +y_0=0 ${GRS80}`);
}

export type Srid = 3067 | number;

export function transformPoint(from: Srid, to: Srid, xy: number[]): number[] {
  if (from === to) return xy;
  return proj4(`EPSG:${from}`, `EPSG:${to}`, [xy[0], xy[1]]);
}

/** Muuntaa suorakaiteen toiseen koordinaatistoon (kulmapisteiden ja reunojen keskipisteiden kautta). */
export function transformBBox(from: Srid, to: Srid, b: BBox): BBox {
  if (from === to) return b;
  const [x0, y0, x1, y1] = b;
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [xm, y0], [xm, y1], [x0, ym], [x1, ym]]
    .map((p) => transformPoint(from, to, p));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Muuntaa GeoJSON-geometrian koordinaatit (rekursiivisesti). */
export function transformGeometry<T extends { type: string; coordinates: unknown }>(from: Srid, to: Srid, g: T): T {
  if (from === to) return g;
  const walk = (c: unknown): unknown =>
    Array.isArray(c) && typeof c[0] === "number" ? transformPoint(from, to, c as number[]) : (c as unknown[]).map(walk);
  return { ...g, coordinates: walk(g.coordinates) };
}
