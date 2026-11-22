import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.8";
import { isTestHetu, normalizeHetu } from "./hetu.ts";

Deno.test("kelvolliset tunnukset", () => {
  assertEquals(normalizeHetu(" 010170-901k "), "010170-901K");
  assertEquals(normalizeHetu("121212A907S"), "121212A907S");
  assertEquals(normalizeHetu("070770-905D"), "070770-905D"); // Iduran esimerkkitunnus
});

Deno.test("virheelliset tunnukset", () => {
  assertThrows(() => normalizeHetu("010170-901A"));
  assertThrows(() => normalizeHetu("310270-901K"));
  assertThrows(() => normalizeHetu("abc"));
});

Deno.test("testitunnus", () => {
  assertEquals(isTestHetu("010170-901K"), true);
});
