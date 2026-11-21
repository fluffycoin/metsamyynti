/**
 * GET /functions/v1/strong-auth-jwks  ->  sovelluksen julkiset avaimet (allekirjoitus + salaus)
 * Iduran hallintapaneeliin. Julkaistava ilman JWT-tarkistusta (--no-verify-jwt).
 */
import { json } from "../_shared/users/http.ts";
import { publicJwks } from "../_shared/users/oidc.ts";

Deno.serve(() => {
  try {
    return json(publicJwks());
  } catch (e) {
    console.error(e);
    return json({ error: "Avaimia ei ole asetettu" }, 500);
  }
});
