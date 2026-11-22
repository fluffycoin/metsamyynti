import { assertEquals } from "jsr:@std/assert@1.0.8";
import { isAllowedReturn } from "./http.ts";

const P = "https://*.lovable.app, https://*.lovableproject.com, https://metsamyynti.fi, http://localhost:5173";

Deno.test("jokerimerkki hyväksyy Lovablen esikatselut", () => {
  assertEquals(isAllowedReturn("https://id-preview--53a98c45-d617.lovable.app/omat-kiinteistot", P), true);
  assertEquals(isAllowedReturn("https://fresh-start-studio-14.lovable.app/x?y=1", P), true);
  assertEquals(isAllowedReturn("https://53a98c45-d617-41e2-ae23-d3ba9a2b64da.lovableproject.com/", P), true);
});

Deno.test("tarkat osoitteet", () => {
  assertEquals(isAllowedReturn("https://metsamyynti.fi/omat", P), true);
  assertEquals(isAllowedReturn("http://localhost:5173/omat", P), true);
  assertEquals(isAllowedReturn("http://localhost:3000/omat", P), false);
});

Deno.test("hylätään vieraat ja huijausosoitteet", () => {
  assertEquals(isAllowedReturn("https://lovable.app/", P), false);
  assertEquals(isAllowedReturn("https://evil-lovable.app/", P), false);
  assertEquals(isAllowedReturn("https://lovable.app.evil.com/", P), false);
  assertEquals(isAllowedReturn("http://x.lovable.app/", P), false);
  assertEquals(isAllowedReturn("https://x.lovable.app:8443/", P), false);
  assertEquals(isAllowedReturn("javascript:alert(1)", P), false);
  assertEquals(isAllowedReturn("https://metsamyynti.fi.evil.com/", P), false);
});
