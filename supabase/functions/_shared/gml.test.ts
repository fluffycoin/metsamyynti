import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { densifyArc, gmlException, parseGmlFeatures } from "./gml.ts";

Deno.test("Tekla PolyhedralSurface with arc", () => {
  const xml = `<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="w" xmlns:gml="g" xmlns:GIS="t">
  <gml:featureMember><GIS:Asemakaavat>
    <GIS:KAAVATUNNUS>049 611803</GIS:KAAVATUNNUS>
    <GIS:KAAVANNIMI>KIRSTIN &amp; SUVELA</GIS:KAAVANNIMI>
    <GIS:Geometry><gml:PolyhedralSurface><gml:polygonPatches><gml:PolygonPatch><gml:exterior><gml:Ring>
      <gml:curveMember><gml:Curve><gml:segments>
        <gml:Arc><gml:pos>0 0</gml:pos><gml:pos>5 -5</gml:pos><gml:pos>10 0</gml:pos></gml:Arc>
        <gml:LineStringSegment><gml:pos>10 0</gml:pos><gml:pos>10 10</gml:pos><gml:pos>0 10</gml:pos><gml:pos>0 0</gml:pos></gml:LineStringSegment>
      </gml:segments></gml:Curve></gml:curveMember>
    </gml:Ring></gml:exterior></gml:PolygonPatch></gml:polygonPatches></gml:PolyhedralSurface></GIS:Geometry>
  </GIS:Asemakaavat></gml:featureMember></wfs:FeatureCollection>`;
  const [f] = parseGmlFeatures(xml);
  assertEquals(f.properties.KAAVATUNNUS, "049 611803");
  assertEquals(f.properties.KAAVANNIMI, "KIRSTIN & SUVELA");
  assertEquals(f.geometry?.type, "MultiPolygon");
  const ring = (f.geometry!.coordinates as number[][][][])[0][0];
  assertEquals(ring[0], ring[ring.length - 1]);
  // Kaari kulkee pisteen (5,-5) kautta, joten alin piste on y ≈ -5
  assertAlmostEquals(Math.min(...ring.map((p) => p[1])), -5, 0.1);
});

Deno.test("GeoServer MultiSurface posList and repeated props", () => {
  const xml = `<gml:FeatureCollection xmlns:gml="g"><gml:featureMember><K gml:id="K.1">
    <linkki>https://x/1.pdf</linkki><kiinteisto>1</kiinteisto><kiinteisto>2</kiinteisto>
    <geom><gml:MultiSurface srsName="EPSG:3879"><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing>
    <gml:posList srsDimension="2" count="4">0 0 1 0 1 1 0 0</gml:posList></gml:LinearRing></gml:exterior>
    </gml:Polygon></gml:surfaceMember></gml:MultiSurface></geom></K></gml:featureMember></gml:FeatureCollection>`;
  const [f] = parseGmlFeatures(xml);
  assertEquals(f.id, "K.1");
  assertEquals(f.properties.linkki, "https://x/1.pdf");
  assertEquals(f.properties.kiinteisto, ["1", "2"]);
  assertEquals((f.geometry!.coordinates as number[][][][])[0][0].length, 4);
});

Deno.test("densifyArc keeps endpoints and radius", () => {
  const pts = densifyArc([1, 0], [0, 1], [-1, 0]);
  assertEquals(pts[0], [1, 0]);
  assertEquals(pts[pts.length - 1], [-1, 0]);
  for (const [x, y] of pts) assertAlmostEquals(Math.hypot(x, y), 1, 1e-9);
  assertEquals(pts.every(([, y]) => y >= -1e-9), true);
});

Deno.test("exception report", () => {
  assertEquals(gmlException(`<ExceptionReport><Exception><ExceptionText>Bad</ExceptionText></Exception></ExceptionReport>`), "Bad");
});
