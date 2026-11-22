/**
 * Luo Iduran FTN-integraation avainparit: allekirjoitus (RS256) ja salaus (RSA-OAEP-256).
 *   deno run scripts/generate-idura-keys.ts
 * Tulostaa yksityiset avaimet Supabasen secreteiksi ja julkiset avaimet Iduran hallintapaneeliin.
 */
import { exportJWK, generateKeyPair } from "npm:jose@5.9.6";

async function make(alg: string, use: string) {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true, modulusLength: 3072 });
  const kid = `${use}-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const priv = { ...(await exportJWK(privateKey)), kid, alg, use };
  const pub = { ...(await exportJWK(publicKey)), kid, alg, use };
  return { priv, pub };
}

const sig = await make("RS256", "sig");
const enc = await make("RSA-OAEP-256", "enc");

console.log("# 1) Supabase secrets (ÄLÄ jaa näitä):");
console.log(`supabase secrets set IDURA_SIGNING_JWK='${JSON.stringify(sig.priv)}'`);
console.log(`supabase secrets set IDURA_ENCRYPTION_JWK='${JSON.stringify(enc.priv)}'`);
console.log("\n# 2) Julkiset avaimet Iduran hallintapaneeliin (JWKS):");
console.log(JSON.stringify({ keys: [sig.pub, enc.pub] }, null, 2));
