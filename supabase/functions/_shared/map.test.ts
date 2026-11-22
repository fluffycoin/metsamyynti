import { assertEquals } from "jsr:@std/assert@1";
import { parseTilePath } from "../mml-tiles/index.ts";
import { pointInPolygon } from "./sources/mml.ts";

Deno.test("tile path", () => {
  assertEquals(parseTilePath("/mml-tiles/taustakartta/16/18885/37379"), { layer: "taustakartta", z: 16, y: 18885, x: 37379 });
  assertEquals(parseTilePath("/functions/v1/mml-tiles/kiinteistojaotus/17/37770/74758.png")?.layer, "kiinteistojaotus");
  assertEquals(parseTilePath("/mml-tiles/salainen/16/1/1"), null);
  assertEquals(parseTilePath("/mml-tiles/taustakartta/3/9/1"), null);
});

Deno.test("point in polygon with hole", () => {
  const sq = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]];
  assertEquals(pointInPolygon(1, 1, sq), true);
  assertEquals(pointInPolygon(5, 5, sq), false);
  assertEquals(pointInPolygon(11, 5, sq), false);
});
