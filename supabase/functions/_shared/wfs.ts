/** Yhteiset apufunktiot WFS-/OGC API -rajapinnoille. */
import { gmlException, parseGmlFeatures } from "./gml.ts";

export type BBox = [number, number, number, number]; // minx, miny, maxx, maxy (EPSG:3067)

export interface Feature {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

/** Hakee JSON:n ja sietää UTF-8 BOM:n, jota osa kuntien palvelimista lähettää. */
export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 60_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text.replace(/^﻿/, "")) as T;
  } finally {
    clearTimeout(t);
  }
}

/** WFS 2.0 GetFeature GeoJSON-muodossa bbox-rajauksella, sivuttaen. */
export async function wfsGetFeatures(opts: {
  endpoint: string;
  typeName: string;
  bbox: BBox;
  srs?: string;
  pageSize?: number;
  maxFeatures?: number;
  /** Sivutus vaatii osalla palvelimista lajitteluavaimen (esim. GeoServer-näkymät). */
  sortBy?: string;
}): Promise<Feature[]> {
  const srs = opts.srs ?? "EPSG:3067";
  const pageSize = opts.pageSize ?? 1000;
  const max = opts.maxFeatures ?? 10_000;
  const out: Feature[] = [];
  for (let start = 0; start < max; start += pageSize) {
    const u = new URL(opts.endpoint);
    u.searchParams.set("service", "WFS");
    u.searchParams.set("version", "2.0.0");
    u.searchParams.set("request", "GetFeature");
    u.searchParams.set("typeNames", opts.typeName);
    u.searchParams.set("outputFormat", "application/json");
    u.searchParams.set("srsName", srs);
    u.searchParams.set("bbox", [...opts.bbox, srs].join(","));
    u.searchParams.set("count", String(pageSize));
    if (start > 0 || opts.sortBy) u.searchParams.set("startIndex", String(start));
    if (opts.sortBy) u.searchParams.set("sortBy", opts.sortBy);
    const fc = await fetchJson<FeatureCollection>(u.toString());
    out.push(...fc.features);
    if (fc.features.length < pageSize) break;
    if (!opts.sortBy) {
      throw new Error(`${opts.typeName}: yli ${pageSize} kohdetta eikä sivutusavainta (sortBy) ole annettu`);
    }
  }
  return out;
}

/** Laskee geometrian rajaavan suorakaiteen (toimii Polygon/MultiPolygon-koordinaateille). */
export function bboxOf(geometry: { coordinates: unknown }, buffer = 0): BBox {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);
  return [minx - buffer, miny - buffer, maxx + buffer, maxy + buffer];
}

/**
 * WFS 1.1.0 GetFeature GML-muodossa (Trimble/Tekla- ja Spatial Web -palvelimet, jotka eivät
 * tarjoa GeoJSONia). bbox annetaan palvelimen omassa koordinaatistossa ilman srs-päätettä,
 * koska Tekla ei tue sitä. Palauttaa featuret lähteen koordinaatistossa.
 */
export async function wfs1GetGmlFeatures(opts: {
  endpoint: string;
  typeName: string;
  bbox: BBox;
  maxFeatures?: number;
  timeoutMs?: number;
}): Promise<Feature[]> {
  const u = new URL(opts.endpoint);
  u.searchParams.set("service", "WFS");
  u.searchParams.set("version", "1.1.0");
  u.searchParams.set("request", "GetFeature");
  u.searchParams.set("typeName", opts.typeName);
  u.searchParams.set("maxFeatures", String(opts.maxFeatures ?? 2000));
  u.searchParams.set("bbox", opts.bbox.map((v) => v.toFixed(1)).join(","));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${opts.typeName}`);
    const exc = gmlException(text);
    if (exc) throw new Error(`${opts.typeName}: ${exc}`);
    return parseGmlFeatures(text);
  } finally {
    clearTimeout(t);
  }
}

/** OGC API Features -haku bbox-rajauksella EPSG:3067:ssä, sivuttaen. */
export async function ogcApiItems(opts: {
  collectionUrl: string;
  bbox: BBox;
  params?: Record<string, string>;
  pageSize?: number;
  maxFeatures?: number;
}): Promise<Feature[]> {
  const crs = "http://www.opengis.net/def/crs/EPSG/0/3067";
  const pageSize = opts.pageSize ?? 500;
  const max = opts.maxFeatures ?? 5000;
  const out: Feature[] = [];
  for (let offset = 0; offset < max; offset += pageSize) {
    const u = new URL(`${opts.collectionUrl}/items`);
    u.searchParams.set("f", "json");
    u.searchParams.set("limit", String(pageSize));
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("crs", crs);
    u.searchParams.set("bbox-crs", crs);
    u.searchParams.set("bbox", opts.bbox.join(","));
    for (const [k, v] of Object.entries(opts.params ?? {})) u.searchParams.set(k, v);
    const fc = await fetchJson<FeatureCollection>(u.toString());
    out.push(...fc.features);
    if (fc.features.length < pageSize) break;
  }
  return out;
}
