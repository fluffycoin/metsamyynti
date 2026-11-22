/**
 * Kevyt GML-jäsennin WFS 1.1 -vastauksille (Trimble/Tekla Kunta-GML, GeoServer/Spatial Web GML3).
 * Deno Edge Functioneissa ei ole DOMParseria, joten XML luetaan pienellä tokenisoijalla.
 *
 * Tuetut geometriat: Polygon, MultiSurface, MultiPolygon, PolyhedralSurface/PolygonPatch,
 * Ring/curveMember/Curve/segments (LineStringSegment, Arc, ArcString), posList, pos, coordinates.
 * Kaaret tihennetään murtoviivoiksi. Ominaisuuksiksi otetaan featuren lehtielementit
 * (toistuvat nimet listaksi).
 */
import type { Feature } from "./wfs.ts";

interface Node {
  name: string; // ilman nimiavaruusetuliitettä
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

const local = (qname: string) => qname.slice(qname.indexOf(":") + 1);

export function parseXml(xml: string): Node {
  const root: Node = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: Node[] = [root];
  const re = /<(\/?)([A-Za-z_][\w.\-:]*)((?:\s+[\w.\-:]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[6] !== undefined) {
      top.text += decode(m[6]);
    } else if (m[5] !== undefined) {
      top.text += m[5];
    } else if (m[2]) {
      if (m[1]) {
        stack.pop();
        continue;
      }
      const attrs: Record<string, string> = {};
      for (const a of m[3].matchAll(/([\w.\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[local(a[1])] = decode(a[2] ?? a[3]);
      }
      const node: Node = { name: local(m[2]), attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  return root;
}

const GEOM_ROOTS = new Set([
  "Polygon", "MultiSurface", "MultiPolygon", "PolyhedralSurface", "Surface", "CompositeSurface",
]);

function numbers(text: string): number[] {
  return text.trim().split(/[\s,]+/).filter(Boolean).map(Number);
}

function pairs(flat: number[], dim: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 1 < flat.length; i += dim) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Kaaren kolmesta pisteestä tihennetty murtoviiva (alku- ja loppupiste mukaan). */
export function densifyArc(p0: number[], p1: number[], p2: number[], maxStepDeg = 5): number[][] {
  const [ax, ay] = p0, [bx, by] = p1, [cx, cy] = p2;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return [p0, p1, p2]; // suora
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const ang = (x: number, y: number) => Math.atan2(y - uy, x - ux);
  const t0 = ang(ax, ay), t1 = ang(bx, by), t2 = ang(cx, cy);
  const norm = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // Kierrossuunta: kulkeeko kaari vastapäivään t0 -> t1 -> t2
  const ccw = norm(t1 - t0) < norm(t2 - t0);
  const sweep = ccw ? norm(t2 - t0) : -norm(t0 - t2);
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (maxStepDeg * Math.PI / 180)));
  const out: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (sweep * i) / steps;
    out.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]);
  }
  out[0] = p0;
  out[out.length - 1] = p2;
  return out;
}

/** Lukee renkaan (LinearRing tai Ring/curveMember) koordinaatit. */
function ringCoords(ring: Node): number[][] {
  const pts: number[][] = [];
  const push = (ps: number[][]) => {
    for (const p of ps) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
  };
  const segPoints = (n: Node): number[][] => {
    const dim = Number(n.attrs.srsDimension ?? 2);
    const posList = n.children.find((c) => c.name === "posList");
    if (posList) return pairs(numbers(posList.text), Number(posList.attrs.srsDimension ?? dim));
    const coords = n.children.find((c) => c.name === "coordinates");
    if (coords) {
      return coords.text.trim().split(/\s+/).map((t) => t.split(",").map(Number)).map((p) => [p[0], p[1]]);
    }
    return n.children.filter((c) => c.name === "pos" || c.name === "coord").map((c) => {
      if (c.name === "coord") {
        const x = c.children.find((k) => k.name === "X"), y = c.children.find((k) => k.name === "Y");
        return [Number(x?.text), Number(y?.text)];
      }
      return numbers(c.text).slice(0, 2);
    });
  };
  const visit = (n: Node) => {
    switch (n.name) {
      case "LinearRing":
      case "LineStringSegment":
      case "LineString":
        push(segPoints(n));
        return;
      case "Arc":
      case "ArcString": {
        const p = segPoints(n);
        for (let i = 0; i + 2 < p.length; i += 2) push(densifyArc(p[i], p[i + 1], p[i + 2]));
        return;
      }
      case "Circle": {
        const p = segPoints(n);
        if (p.length >= 3) push(fullCircle(p[0], p[1], p[2]));
        return;
      }
      default:
        n.children.forEach(visit);
    }
  };
  visit(ring);
  if (pts.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) {
    pts.push(pts[0]);
  }
  return pts;
}

function fullCircle(p0: number[], p1: number[], p2: number[], steps = 72): number[][] {
  const [ax, ay] = p0, [bx, by] = p1, [cx, cy] = p2;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return [p0, p1, p2];
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const t0 = Math.atan2(ay - uy, ax - ux);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = t0 + (2 * Math.PI * i) / steps;
    return [ux + r * Math.cos(t), uy + r * Math.sin(t)];
  });
}

/** Kerää kaikki polygonit (exterior + interior) geometriaelementin alta. */
function polygonsOf(g: Node): number[][][][] {
  const polys: number[][][][] = [];
  const visit = (n: Node) => {
    if (n.name === "featureMember" || n.name === "Label") return; // sisäkkäiset osat ja tekstien sijainnit
    if (n.name === "Polygon" || n.name === "PolygonPatch") {
      const rings: number[][][] = [];
      const ext = n.children.find((c) => c.name === "exterior" || c.name === "outerBoundaryIs");
      if (ext) rings.push(ringCoords(ext));
      for (const c of n.children) {
        if (c.name === "interior" || c.name === "innerBoundaryIs") rings.push(ringCoords(c));
      }
      if (rings.length && rings[0].length >= 4) polys.push(rings.filter((r) => r.length >= 4));
      return;
    }
    n.children.forEach(visit);
  };
  visit(g);
  return polys;
}

/** Featuren lehtiominaisuudet: { nimi: teksti }, toistuvat nimet listaksi. */
function propsOf(n: Node, out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const c of n.children) {
    if (GEOM_ROOTS.has(c.name) || c.children.some((k) => GEOM_ROOTS.has(k.name))) continue;
    if (c.children.length === 0) {
      const v = c.text.trim();
      if (c.name in out) {
        const prev = out[c.name];
        out[c.name] = Array.isArray(prev) ? [...prev, v] : [prev, v];
      } else out[c.name] = v === "" ? null : v;
    } else {
      propsOf(c, out);
    }
  }
  return out;
}

/** Jäsentää WFS FeatureCollectionin GeoJSON-tyyppisiksi featureiksi (koordinaatit lähteen omassa koordinaatistossa). */
export function parseGmlFeatures(xml: string): Feature[] {
  const root = parseXml(xml);
  const out: Feature[] = [];
  // Vain ylimmän tason featureMemberit; Kunta-GML:ssä featureMember voi olla myös kohteen sisällä.
  const members: Node[] = [];
  const find = (n: Node) => {
    if (n.name === "featureMember" || n.name === "featureMembers" || n.name === "member") members.push(n);
    else n.children.forEach(find);
  };
  find(root);
  for (const n of members) {
    for (const f of n.children) {
      const polys = polygonsOf(f);
      out.push({
        type: "Feature",
        id: f.attrs.id,
        geometry: polys.length ? { type: "MultiPolygon", coordinates: polys } : null,
        properties: propsOf(f),
      });
    }
  }
  return out;
}

/** Palvelimen virheilmoitus (ExceptionReport), jos vastaus on sellainen. */
export function gmlException(xml: string): string | null {
  const m = xml.match(/<(?:\w+:)?ExceptionText>([\s\S]*?)<\/(?:\w+:)?ExceptionText>/);
  return m ? decode(m[1].trim()) : null;
}
