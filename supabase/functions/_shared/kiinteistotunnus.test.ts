import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parseKiinteistotunnus } from "./kiinteistotunnus.ts";

Deno.test("lyhyt esitysmuoto", () => {
  const k = parseKiinteistotunnus("49-401-1-1");
  assertEquals(k.long, "04940100010001");
  assertEquals(k.display, "49-401-1-1");
  assertEquals(k.municipalityCode, "049");
});

Deno.test("pitkä muoto ja välilyönnit", () => {
  const k = parseKiinteistotunnus(" 83706058540002 ");
  assertEquals(k.display, "837-60-5854-2");
});

Deno.test("määräala", () => {
  const k = parseKiinteistotunnus("858-415-3-120-M601");
  assertEquals(k.long, "85841500030120");
  assertEquals(k.maarala, "601");
  assertEquals(k.display, "858-415-3-120-M601");
});

Deno.test("virheellinen", () => {
  assertThrows(() => parseKiinteistotunnus("abc"));
  assertThrows(() => parseKiinteistotunnus("1-2-3"));
});
