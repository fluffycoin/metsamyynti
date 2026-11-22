/**
 * Vahva tunnistautuminen tunnistusvälittäjän (Idura, ent. Criipto) kautta, Finnish Trust Network.
 *
 * FTN:n vaatimukset (Traficomin OIDC-profiili):
 *  - tunnistuspyyntö allekirjoitetaan (request object, JAR)
 *  - token-päätepisteeseen todennetaan private_key_jwt:llä (ei client secretiä)
 *  - id_token palautetaan salattuna (JWE), joka puretaan omalla salausavaimella
 *  - allekirjoitus- ja salausavaimet ovat eri avainpareja
 * Avaimet luodaan skriptillä scripts/generate-idura-keys.ts. Julkiset avaimet viedään Iduran
 * hallintapaneeliin (tai palvelinfunktio strong-auth-jwks palvelee ne).
 *
 * Ympäristömuuttujat:
 *   IDURA_DOMAIN            esim. metsamyynti-test.idura.broker (testitila) tai oma domain
 *   IDURA_CLIENT_ID         sovelluksen client id (realm) Idurassa
 *   IDURA_SIGNING_JWK       allekirjoitusavain, yksityinen JWK (JSON), sis. kid ja alg
 *   IDURA_ENCRYPTION_JWK    salausavain, yksityinen JWK (JSON), sis. kid ja alg
 *   STRONG_AUTH_REDIRECT_URI  https://<projekti>.supabase.co/functions/v1/strong-auth-callback
 *   IDURA_ACR_VALUES        oletus urn:grn:authn:fi:all (pankkitunnukset + mobiilivarmenne)
 */
import {
  compactDecrypt, createRemoteJWKSet, importJWK, jwtVerify, SignJWT, type JWK, type JWTPayload,
} from "npm:jose@5.9.6";
import { env, randomToken } from "./http.ts";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let discoveryCache: Discovery | null = null;

export async function discovery(): Promise<Discovery> {
  if (discoveryCache) return discoveryCache;
  const res = await fetch(`https://${env("IDURA_DOMAIN")}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery epäonnistui: ${res.status}`);
  discoveryCache = await res.json();
  return discoveryCache!;
}

function privateJwk(name: string): JWK {
  const jwk = JSON.parse(env(name)) as JWK;
  if (!jwk.kid || !jwk.alg) throw new Error(`${name}: kid ja alg ovat pakollisia`);
  return jwk;
}

async function signingKey() {
  const jwk = privateJwk("IDURA_SIGNING_JWK");
  return { jwk, key: await importJWK(jwk, jwk.alg) };
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(48);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { verifier, challenge };
}

/** Rakentaa allekirjoitetun tunnistuspyynnön URL:n, johon selain ohjataan. */
export async function authorizeUrl(p: { state: string; nonce: string; codeChallenge: string; loginHint?: string }) {
  const d = await discovery();
  const clientId = env("IDURA_CLIENT_ID");
  const { jwk, key } = await signingKey();
  const params: Record<string, string> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: env("STRONG_AUTH_REDIRECT_URI"),
    scope: "openid",
    state: p.state,
    nonce: p.nonce,
    acr_values: env("IDURA_ACR_VALUES", "urn:grn:authn:fi:all"),
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
    ui_locales: "fi",
  };
  if (p.loginHint) params.login_hint = p.loginHint;
  const request = await new SignJWT(params)
    .setProtectedHeader({ alg: jwk.alg!, kid: jwk.kid })
    .setIssuer(clientId)
    .setAudience(`https://${env("IDURA_DOMAIN")}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomToken(16))
    .sign(key);
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid");
  u.searchParams.set("request", request);
  return u.toString();
}

/** Vaihtaa koodin tokeneihin (private_key_jwt) ja palauttaa varmennetut id_tokenin claimit. */
export async function exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<JWTPayload> {
  const d = await discovery();
  const clientId = env("IDURA_CLIENT_ID");
  const { jwk, key } = await signingKey();
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: jwk.alg!, kid: jwk.kid })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(d.token_endpoint)
    .setIssuedAt()
    .setExpirationTime("2m")
    .setJti(randomToken(16))
    .sign(key);

  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env("STRONG_AUTH_REDIRECT_URI"),
      client_id: clientId,
      code_verifier: codeVerifier,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
    }),
  });
  if (!res.ok) throw new Error(`Token-vaihto epäonnistui: ${res.status} ${await res.text()}`);
  const { id_token } = await res.json();
  if (!id_token) throw new Error("id_token puuttuu");
  return verifyIdToken(id_token, nonce);
}

export async function verifyIdToken(idToken: string, nonce: string): Promise<JWTPayload> {
  const d = await discovery();
  let jws = idToken;
  if (idToken.split(".").length === 5) {
    const enc = privateJwk("IDURA_ENCRYPTION_JWK");
    const { plaintext } = await compactDecrypt(idToken, await importJWK(enc, enc.alg));
    jws = new TextDecoder().decode(plaintext);
  }
  const { payload } = await jwtVerify(jws, createRemoteJWKSet(new URL(d.jwks_uri)), {
    issuer: d.issuer,
    audience: env("IDURA_CLIENT_ID"),
  });
  if (payload.nonce !== nonce) throw new Error("nonce ei täsmää");
  return payload;
}

/** Poimii FTN-claimeista henkilötunnuksen, nimen ja tunnistustavan. */
export function ftnIdentity(claims: JWTPayload): { hetu: string; name: string; method: string | null } {
  const hetu = claims["hetu"];
  if (typeof hetu !== "string" || !hetu) throw new Error("Tunnistuksesta puuttuu henkilötunnus (hetu)");
  const name = (claims["name"] as string) ||
    [claims["given_name"], claims["family_name"]].filter(Boolean).join(" ");
  return { hetu, name, method: (claims["identityscheme"] as string) ?? null };
}

/** Julkiset avaimet Iduran hallintapaneeliin. */
export function publicJwks(): { keys: JWK[] } {
  const strip = (j: JWK, use: string): JWK => {
    const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...pub } = j;
    return { ...pub, use };
  };
  return {
    keys: [strip(privateJwk("IDURA_SIGNING_JWK"), "sig"), strip(privateJwk("IDURA_ENCRYPTION_JWK"), "enc")],
  };
}
