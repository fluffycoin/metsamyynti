/**
 * POST /listing-draft  — "Luo alustava myynti-ilmoitus"
 *
 *   { "property_ids": [123] }             uusi luonnos omista kiinteistöistä
 *   { "kt": ["858-401-5-12"] }           sama kiinteistötunnuksilla
 *   { "listing_id": "uuid" }             päivitä olemassa olevan luonnoksen tekstit ja hinta
 *
 * Hakee jokaisen kiinteistön tiedot (rajat, metsäkuviot, kaavat; välimuistista jos tuoreet),
 * laskee hinta-arvion ja täyttää välittäjätasoisen ilmoitustekstin (listings.sections).
 * Myyjän omat tekstit (sections.myyja) säilyvät. Uusi luonnos luodaan create_listing-RPC:llä
 * kutsujan oikeuksin, joten vahva tunnistus ja omistajuus tarkistetaan kannassa.
 * Ensimmäinen ajo voi kestää minuutin tai pari, jos kunnan kaavarajapinnat ovat hitaita.
 */
import { ensureProperty, HttpError } from "../_shared/ensure.ts";
import { parseKiinteistotunnus } from "../_shared/kiinteistotunnus.ts";
import { cors, json, serviceClient, userClient } from "../_shared/supabase.ts";
import { generateListing } from "../_shared/valuation/listing.ts";
import { ktOfRow, runValuation } from "../_shared/valuation/service.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Käytä POST-pyyntöä" }, 405);

  const user = userClient(req);
  const { data: auth } = await user.auth.getUser();
  if (!auth?.user) return json({ error: "Kirjaudu sisään", hint: "KIRJAUDU" }, 401);

  let body: { property_ids?: number[]; kt?: string[]; listing_id?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Virheellinen JSON" }, 400);
  }

  const db = serviceClient();
  try {
    let listingId = body.listing_id ?? null;
    let propertyIds: number[];
    let existing: Record<string, unknown> = {};
    let existingTitle: string | null = null;

    if (listingId) {
      // RLS: omistaja näkee oman luonnoksensa.
      const { data: l, error } = await user.from("listings")
        .select("id, status, title, sections, listing_properties(property_id)").eq("id", listingId).maybeSingle();
      if (error || !l) return json({ error: "Ilmoitusta ei löydy", hint: "EI_ILMOITUSTA" }, 404);
      if (l.status !== "luonnos") {
        return json({ error: "Vain luonnoksen voi päivittää. Avaa ilmoitus ensin muokattavaksi.", hint: "VAARA_TILA" }, 409);
      }
      propertyIds = (l.listing_properties as { property_id: number }[]).map((p) => p.property_id);
      existing = (l.sections as Record<string, unknown>) ?? {};
      existingTitle = l.title as string | null;
    } else {
      propertyIds = [...(body.property_ids ?? [])];
      for (const k of body.kt ?? []) {
        const r = await ensureProperty(db, parseKiinteistotunnus(k));
        propertyIds.push(r.summary.property_id);
      }
      propertyIds = [...new Set(propertyIds)];
      if (!propertyIds.length) return json({ error: "Valitse vähintään yksi kiinteistö", hint: "EI_KIINTEISTOJA" }, 400);
      const { data: id, error } = await user.rpc("create_listing", { p_property_ids: propertyIds, p_title: body.title ?? null });
      if (error) return json({ error: error.message, hint: error.hint }, error.code === "42501" || error.code === "28000" ? 403 : 400);
      listingId = id as string;
    }

    const { data: rows, error: pErr } = await db.from("properties")
      .select("id, kiinteistotunnus, maarala_no").in("id", propertyIds);
    if (pErr) throw new Error(pErr.message);

    const items = [];
    const ids: number[] = [];
    for (const row of rows ?? []) {
      const r = await runValuation(db, ktOfRow(row), { includePrivate: true, store: true, userId: auth.user.id });
      items.push({ summary: r.summary, valuation: r.valuation });
      if (r.valuation_id) ids.push(r.valuation_id);
    }
    const draft = generateListing(items);
    const sections = { ...draft.sections, ...(existing.myyja ? { myyja: existing.myyja } : {}) };

    const { error: uErr } = await db.from("listings")
      .update({
        // Myyjän itse muuttama otsikko säilyy; generoitu otsikko päivittyy.
        title: body.title ?? (existingTitle && existingTitle !== existing.generated_title ? existingTitle : draft.title),
        asking_price_eur: draft.asking_price_eur,
        price_source: draft.price_source,
        sections: { ...sections, generated_title: draft.title },
      })
      .eq("id", listingId).eq("status", "luonnos");
    if (uErr) throw new Error(uErr.message);

    return json({
      listing_id: listingId,
      title: draft.title,
      asking_price_eur: draft.asking_price_eur,
      price_source: draft.price_source,
      valuation_ids: ids,
      sections,
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error).message }, 500);
  }
});
