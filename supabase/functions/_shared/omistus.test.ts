import { assertEquals } from "jsr:@std/assert@1";
import { decodePng, isCityPixel, shareInside } from "./sources/omistus.ts";

/** Pieni RGBA-PNG testiä varten (suodin 0 kaikilla riveillä). */
async function encodePng(w: number, h: number, rgba: (x: number, y: number) => number[]): Promise<Uint8Array> {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgba(x, y), y * (w * 4 + 1) + 1 + x * 4);
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(body, 8);
    return out; // CRC:tä ei tarkisteta
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

Deno.test("pikselien luokittelu", () => {
  assertEquals(isCityPixel(255, 170, 170, 255), true);   // kaupungin maa
  assertEquals(isCityPixel(254, 85, 170, 254), true);    // magenta
  assertEquals(isCityPixel(1, 1, 1, 254), true);         // vuokra-alueen rasteri
  assertEquals(isCityPixel(255, 255, 255, 0), false);    // läpinäkyvä
  assertEquals(isCityPixel(9, 88, 169, 255), null);      // rajaviiva
});

Deno.test("kaupungin osuus kuvasta", async () => {
  // 10x10 px, vasen puolisko kaupungin maata
  const png = await encodePng(10, 10, (x) => (x < 5 ? [255, 170, 170, 255] : [255, 255, 255, 0]));
  const img = await decodePng(png);
  assertEquals([img.width, img.height], [10, 10]);
  const bbox = [0, 0, 100, 100];
  const whole = [[[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]];
  const left = [[[[0, 0], [40, 0], [40, 100], [0, 100], [0, 0]]]];
  assertEquals(shareInside(img, bbox, whole), 0.5);
  assertEquals(shareInside(img, bbox, left), 1);
});
