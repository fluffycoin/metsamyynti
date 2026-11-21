# Lovable-ohjeet: käyttäjät, myynti ja kiinnostukset

Tässä ohjeessa käyttöliittymä rakennetaan Lovablella tämän repon Supabase-taustan päälle.
Rajapinnan tarkka kuvaus on tiedostossa [kayttajat-api.md](kayttajat-api.md).

## A. Kerran: Supabase-projektin käyttöönotto

1. Luo Supabase-projekti (tai käytä Lovablen luomaa) ja yhdistä se Lovableen.
2. Aja migraatiot ja julkaise funktiot koneelta, jossa on Supabase CLI:

   ```bash
   supabase link --project-ref <projekti>
   supabase db push
   supabase functions deploy strong-auth-start send-emails
   supabase functions deploy strong-auth-callback strong-auth-jwks --no-verify-jwt
   supabase secrets set STRONG_AUTH_MODE=mock ENVIRONMENT=development \
     STRONG_AUTH_REDIRECT_URI=https://<projekti>.supabase.co/functions/v1/strong-auth-callback \
     ALLOWED_RETURN_ORIGINS=https://<sovellus>.lovable.app,https://<esikatselu-domain>
   ```

3. Supabasen Authentication-asetuksissa: Email-kirjautuminen päälle, "Confirm email" päälle ja
   Site URL sekä Redirect URLs osoittamaan Lovable-sovellukseen.
4. Sähköposti-ilmoitukset (valinnainen): luo Resend-tili, aseta
   `supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Metsämyynti <ilmoitukset@domain.fi>" APP_URL=https://<sovellus>`
   ja ajasta lähetys SQL-editorissa (pg_cron ja pg_net päälle):

   ```sql
   select cron.schedule('sahkopostit', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://<projekti>.supabase.co/functions/v1/send-emails',
       headers := jsonb_build_object('Authorization', 'Bearer <service-role-avain>')) $$);
   ```

Mock-tilassa vahva tunnistus näyttää testihenkilölomakkeen, joten koko prototyypin voi testata
ilman tunnistusvälittäjää. Iduran testitilaan siirrytään kohdan C mukaan.

## B. Lovable-promptit

Liitä ensin tämä taustaksi (yksi kerta):

> Sovellus on suomenkielinen kiinteistöjen (metsätilat, pellot, rakentamattomat tontit)
> myyntialusta ilman välittäjää. Tausta on valmis Supabasessa, eikä tietokantaa saa muuttaa. Käytä
> vain olemassa olevia tauluja, RPC-funktioita ja Edge Functioneita, jotka on kuvattu tiedostossa
> docs/kayttajat-api.md. Näytä virheissä `error.message` käyttäjälle sellaisenaan ja ohjaa
> `error.hint`-koodin perusteella (esim. `TUNNISTAUDU_UUDELLEEN` → vahva tunnistus). Tumma, selkeä
> ulkoasu, kartta keskeisenä.

Sitten näkymä kerrallaan:

1. **Tili.** "Tee rekisteröityminen ja kirjautuminen Supabase Authilla (sähköposti + salasana ja
   magic link). Rekisteröinnissä kysytään nimimerkki (`options.data.display_name`). Yläpalkissa on
   kellokuvake, jossa näkyy lukemattomien ilmoitusten määrä `my_account().unread_notifications`."
2. **Ryhdy myyjäksi.** "Sivu /myy: jos `my_account().is_seller` on false, näytä selitys ja nappi
   Tunnistaudu pankkitunnuksilla, joka kutsuu `strong-auth-start` purpose `kayttoonotto` ja
   ohjaa `data.url`-osoitteeseen. Paluussa käsittele `?strong_auth=ok|virhe|peruttu` ja syykoodit."
3. **Omat kiinteistöt.** "Sivu /omat-kiinteistot listaa `my_properties()`-rivit kortteina:
   nimi, tunnus (määräalalle `-M`+maarala_no), tyyppi, pinta-ala hehtaareina, oma osuus
   murtolukuna, kuolinpesän nimi, ilmoituksen tila ja kiinnostusten määrä. Napit Luo alustava
   myynti-ilmoitus (`create_listing`) ja Katso kiinnostukset. Jos `estate_missing_shareholders`,
   näytä perukirjan latauslomake (`submit_estate_claim`)."
4. **Ilmoituksen julkaisu ja hyväksyntä.** "Ilmoituksen muokkaussivulla luonnoksen kenttiä
   päivitetään suoraan `listings`-tauluun. Lähetä julkaistavaksi kutsuu `submit_listing`. Jos
   virhe on `TUNNISTAUDU_UUDELLEEN`, käynnistä vahva tunnistus tarkoituksella `julkaisu` ja
   `return_to` takaisin samalle sivulle, ja yritä uudelleen paluun jälkeen. Näytä
   `listing_approval_status` listana: kuka on hyväksynyt, kuka odottaa ja kuka ei ole vielä
   palvelussa. Hyväksyntäpyynnön saaneelle näytä Hyväksy- ja Hylkää-napit (`decide_listing`, hylkäykseen
   syy) samalla tunnistuslogiikalla, tarkoitus `hyvaksynta`."
5. **Kiinnostuksen ilmaisu.** "Jokaisella kiinteistösivulla on nappi Olen kiinnostunut, myös kun
   kohde ei ole myynnissä. Kirjautumaton ohjataan rekisteröitymään. Lomakkeessa on viesti,
   valinnainen hintatarjous ja valinta Jaa yhteystietoni (nimi ja puhelin). Kutsu `express_interest`.
   Onnistuessa näytä: 'Viesti tallennettu. Omistaja näkee sen sovelluksessa, ja jos hän ei vielä
   ole palvelussa, viesti odottaa häntä.' Sivu /kiinnostukseni näyttää `interests_sent()`."
6. **Ilmoitukset-välilehti.** "Sivu /ilmoitukset: välilehdet Kiinnostukset (`interests_received`)
   ja Kaikki ilmoitukset (`notifications`, reaaliaikainen tilaus). Kiinnostuksen avaus kutsuu
   `mark_interest_read` ja näyttää keskustelun (`interest_thread`), vastauskentän
   (`reply_to_interest`) sekä napit Kieltäydy ja Estä lähettäjä (`decline_interest`)."
7. **Asetukset.** "Sivu /asetukset: kytkimet Otan vastaan kiinnostuksia, Kiinnostukset myös
   sähköpostiin ja Hyväksyntäpyynnöt ja julkaisut sähköpostiin (`notification_prefs`)."

Markkinointilause, jota voi käyttää etusivulla: "Tarkista, onko joku kiinnostunut ostamaan
metsäsi." Omistaja näkee kiinteistönsä odottavat kiinnostukset heti tunnistauduttuaan.

## C. Myöhemmin: oikea pankkitunnistus (Idura)

1. Tee Iduran kanssa sopimus FTN-tunnistuksesta (tarkastus 2–8 arkipäivää). Testidomain toimii
   heti pankkien testitunnuksilla.
2. Luo avaimet: `deno run scripts/generate-idura-keys.ts`. Aja tulostetut `supabase secrets set`
   -rivit ja vie julkinen JWKS Iduran hallintapaneeliin. Ne näkyvät myös osoitteessa
   `/functions/v1/strong-auth-jwks`.
3. Rekisteröi Idurassa callback-osoitteeksi `STRONG_AUTH_REDIRECT_URI`.
4. `supabase secrets set STRONG_AUTH_MODE=idura IDURA_DOMAIN=... IDURA_CLIENT_ID=...`
5. Tuotannossa: `ENVIRONMENT=production`.

## D. Myöhemmin: MML:n omistajatiedot

Kun käyttölupa on myönnetty, toteutetaan `supabase/functions/_shared/users/mml-ownership.ts`. Sen
jälkeen SQL-editorissa ajetaan
`update private.settings set value = 'mml' where key = 'ownership_source'; truncate private.ownership_registry_test;`.
Käyttöliittymä ei muutu.
