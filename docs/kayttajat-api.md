# API: käyttäjät, omistajuus, ilmoitukset ja kiinnostukset

Kaikki kutsut tehdään Supabasen JS-asiakkaalla (`@supabase/supabase-js`), jonka Lovable luo
automaattisesti. Tietokantafunktiot kutsutaan `supabase.rpc('nimi', { parametrit })`. Taulut
luetaan `supabase.from('taulu').select(...)`. Rivitason tietoturva (RLS) rajaa, mitä käyttäjä
näkee, joten selaimessa käytetään aina julkista anon-avainta.

Virheissä `error.hint` sisältää koneluettavan koodin (esim. `PAIVARAJA`) ja `error.message`
suomenkielisen tekstin, jonka voi näyttää käyttäjälle sellaisenaan.

## 1. Tili ja kirjautuminen

| Toiminto | Kutsu |
|---|---|
| Rekisteröityminen | `supabase.auth.signUp({ email, password, options: { data: { display_name } } })` |
| Kirjautuminen | `supabase.auth.signInWithPassword(...)` tai `signInWithOtp({ email })` (magic link) |
| Omat tiedot | `rpc('my_account')` |
| Nimimerkin muutos | `from('profiles').update({ display_name }).eq('id', user.id)` |

Profiili ja ilmoitusasetukset syntyvät automaattisesti rekisteröityessä. Kiinnostuksen
lähettäminen vaatii vahvistetun sähköpostin.

`my_account()` palauttaa:

```json
{
  "id": "uuid", "email": "...", "email_confirmed": true, "display_name": "Matti",
  "is_seller": true,                 // vahvasti tunnistautunut, voi myydä
  "verified_name": "Matti Metsänen", // pankkitunnistuksen nimi
  "strong_auth_at": "...", "step_up_valid_until": "...",
  "step_up_valid": true,             // tunnistus alle 15 min vanha, julkaisu ja hyväksyntä sallittu
  "prefs": { "accept_interests": true, "email_interests": false, "email_listing_events": false },
  "unread_notifications": 3,
  "pending_approvals": 1             // ilmoituksia, jotka odottavat minun hyväksyntääni
}
```

## 2. Vahva tunnistautuminen (vain myyjät)

Tarvitaan kolmessa tilanteessa: myyntiominaisuuksien käyttöönotossa (`kayttoonotto`), ilmoituksen
lähettämisessä julkaistavaksi (`julkaisu`) ja yhteisomistajan hyväksynnässä (`hyvaksynta`).
Tunnistus on voimassa 15 minuuttia (`step_up_valid`). Muuten myyjä kirjautuu tavallisesti.

```ts
const { data } = await supabase.functions.invoke('strong-auth-start', {
  body: { purpose: 'kayttoonotto', return_to: `${location.origin}/omat-kiinteistot` },
});
location.href = data.url; // pankkitunnistus (tai testitilassa testihenkilön valinta)
```

Tunnistuksen jälkeen selain palaa osoitteeseen `return_to?strong_auth=ok&tarkoitus=kayttoonotto`.
Virheen sattuessa paluuosoitteen perässä on `?strong_auth=virhe&syy=<KOODI>`, tai peruutuksessa
`?strong_auth=peruttu`.

| syy | Merkitys |
|---|---|
| `HENKILO_TOISELLA_TILILLA` | Henkilö on jo liitetty toiseen tiliin |
| `TILI_TOISELLA_HENKILOLLA` | Tähän tiliin on liitetty eri henkilö |
| `VAIN_TESTITUNNUKSET` | Testitilassa kelpaavat vain testitunnukset (yksilönumero 900–999) |
| `TUNNISTUS` / `TALLENNUS` | Muu virhe, yritä uudelleen |

Ensimmäisellä tunnistuksella omistukset haetaan automaattisesti (testivaiheessa testirekisteristä),
ja kiinteistölle aiemmin tulleet kiinnostukset ja hyväksyntäpyynnöt toimitetaan käyttäjälle.

**Testitila** (`STRONG_AUTH_MODE=mock`): pankkitunnistuksen sijaan aukeaa lomake, jossa
valitaan testihenkilö:

| Testihenkilö | Tunnus | Omistukset |
|---|---|---|
| Matti Metsänen | 010170-901K | metsätila Tuusula, tontti Kerava, ¼ osakas Pirkkalan kuolinpesässä |
| Liisa Pelto | 150382-902B | ½ pelto Sipoo, määräala Espoo, ½ Tampere (toinen puolikas kuolinpesällä ilman osakkaita) |
| Pekka Pelto | 220379-9034 | ½ pelto Sipoo |
| Kalle Vainio | 110868-9059 | ½ osakas Pirkkalan kuolinpesässä |
| Sanna Vainio | 300491-9069 | ¼ osakas Pirkkalan kuolinpesässä |
| Ella Ostaja | 121212A907S | ei omistuksia |

Iduran testitilassa (`STRONG_AUTH_MODE=idura`, testidomain) kirjaudutaan pankkien testitunnuksilla.
Esimerkiksi Nordeassa käyttäjä on DEMOUSER1, ja mobiilivarmenteessa numero on 0401234567.

## 3. Omat kiinteistöt

`rpc('my_properties')` palauttaa rivit:

| Kenttä | Kuvaus |
|---|---|
| `property_id`, `kiinteistotunnus`, `display_id`, `maarala_no`, `name`, `kind`, `area_m2` | kiinteistö (`display_id` esim. `858-401-1-10`; määräalassa lisäksi `-M601`) |
| `share_num` / `share_den` | oma osuus (osakkaalla osuus kuolinpesästä) |
| `via_estate` | kuolinpesän nimi, jos omistus on kuolinpesän kautta |
| `owner_count` | hyväksyjien määrä (omistajat ja osakkaat) |
| `estate_missing_shareholders` | kuolinpesän osakkaat puuttuvat, joten julkaisu vaatii perukirjan |
| `listing_id`, `listing_status`, `my_approval` | kiinteistön viimeisin ilmoitus ja oma hyväksyntätila |
| `interest_count` | kiinteistöstä tulleet kiinnostukset |

Yhteisomistajat: `from('property_owners').select('owner_name, share_num, share_den, is_estate').eq('property_id', id)`
(näkyy vain saman kiinteistön omistajille). Kiinteistön muut tiedot (rajat, puusto, kaavat, arvio)
tulevat datahakujen rajapinnasta (`property-summary`).

**Kuolinpesä ilman osakkaita:** lataa perukirja Storageen ja lähetä hakemus:

```ts
const path = `${user.id}/perukirja-${Date.now()}.pdf`;
await supabase.storage.from('perukirjat').upload(path, file);
await supabase.rpc('submit_estate_claim', { p_property_id: id, p_document_path: path });
```

Ylläpito tarkistaa perukirjan ja lisää osakkaat (`approve_estate_claim`, vain palvelimella).
Hakemusten tila: `from('estate_claims').select('*')`.

## 4. Myynti-ilmoitus ja hyväksynnät

```
luonnos ──submit_listing──▶ odottaa_hyvaksyntaa ──kaikki hyväksyvät──▶ julkaistu ──mark_listing_sold──▶ myyty
   ▲                              │ joku hylkää                            │
   └──────────────────────────────┘◀──────────── reopen_listing ───────────┘
mikä tahansa avoin ──withdraw_listing──▶ poistettu
```

| Kutsu | Vaatii | Palauttaa |
|---|---|---|
| `rpc('create_listing', { p_property_ids: [id, ...], p_title })` | myyjä, omistaa kaikki | listing id |
| `from('listings').update({ title, asking_price_eur, price_source, sections }).eq('id', id)` | luonnos-tila | |
| `rpc('submit_listing', { p_listing })` | `step_up_valid` | uusi tila |
| `rpc('decide_listing', { p_listing, p_approve: true/false, p_comment })` | `step_up_valid`, olen hyväksyjä | uusi tila |
| `rpc('listing_approval_status', { p_listing })` | omistaja | `owner_name, decision, has_account, is_me, comment, decided_at` |
| `rpc('reopen_listing', { p_listing })` | omistaja | `luonnos` |
| `rpc('withdraw_listing', { p_listing })` | omistaja | `poistettu` |
| `rpc('mark_listing_sold', { p_listing })` | omistaja, julkaistu | `myyty` |

Yksin omistettu kohde julkaistaan heti `submit_listing`-kutsusta. Yhteisomistetussa kohteessa ja
kuolinpesässä jokainen omistaja tai osakas saa hyväksyntäpyynnön, myös ne, jotka liittyvät
palveluun vasta myöhemmin. Ilmoitus julkaistaan, kun kaikki ovat hyväksyneet. Hylkäys palauttaa
ilmoituksen luonnokseksi ja välittää syyn muille. `price_source = 'vahvistettu'` asetetaan vain
palvelimella, kun vahvistettu puustoarvio on ladattu.

Virhekoodit: `VAHVA_TUNNISTUS`, `TUNNISTAUDU_UUDELLEEN` (ohjaa strong-auth-startiin
tarkoituksella `julkaisu` tai `hyvaksynta`), `EI_OMISTAJA`, `ILMOITUS_ON_JO`, `VAARA_TILA`,
`EI_HYVAKSYJA`, `OSAKKAAT_PUUTTUVAT`.

**Julkiset ilmoitukset** (myös kirjautumattomille):

```ts
supabase.from('listings')
  .select('id, title, asking_price_eur, price_source, sections, published_at, listing_properties(properties(id, display_id, name, kind, area_m2, municipality_code))')
  .eq('status', 'julkaistu').order('published_at', { ascending: false });
```

Julkaistun kohteen hinta-arvio löytyy taulusta `valuations`. Omistajan tiedot eivät näy julkisesti.

## 5. Kiinnostukset

Kuka tahansa vahvistetun sähköpostin tilin luonut voi ilmoittaa kiinnostuksensa mistä tahansa
kiinteistöstä, myös sellaisesta, joka ei ole myynnissä. Omistaja pysyy nimettömänä. Jos omistaja
ei vielä ole palvelussa, kiinnostus odottaa kiinteistön kohdalla ja siirtyy hänelle, kun hän
liittyy. Kuolinpesissä kiinnostus näkyy kaikille osakkaille. Palvelu ei lähetä mitään henkilölle,
joka ei ole itse liittynyt.

**Lähettäjä**

```ts
await supabase.rpc('express_interest', {
  p_property_id: id, p_message: 'Olisin kiinnostunut...', p_offer_eur: 45000,   // tarjous valinnainen
  p_share_contact: true, p_contact_name: 'Olli Ostaja', p_contact_phone: '040...', // valinnaiset
});
await supabase.rpc('interests_sent');   // omat kiinnostukset, tila ja owner_replied
```

| Rajoitus | Oletus | Virhekoodi |
|---|---|---|
| Kiinnostuksia lähettäjältä vuorokaudessa | 10 | `PAIVARAJA` |
| Sama kohde uudelleen aikaisintaan | 7 vrk | `JO_ILMOITETTU` |
| Kiinnostuksia kohteeseen vuorokaudessa kaikilta | 30 | `KOHTEEN_RAJA` |
| Sähköposti vahvistettava | | `SAHKOPOSTI_VAHVISTAMATTA` |
| Oma kiinteistö | | `OMA_KIINTEISTO` |

Lähettäjä ei saa tietää, onko omistaja palvelussa, onko hän kieltäytynyt tai estänyt hänet.

**Omistaja**

| Kutsu | Kuvaus |
|---|---|
| `rpc('interests_received')` | `interest_id, property_id, property_label, listing_id, message, offer_eur, sender_alias, contact_name, contact_email, contact_phone, status, message_count, created_at` |
| `rpc('mark_interest_read', { p_interest })` | merkitse luetuksi |
| `rpc('reply_to_interest', { p_interest, p_body })` | vastaa (ostaja voi jatkaa vasta omistajan vastattua) |
| `rpc('interest_thread', { p_interest })` | keskustelu: `author_role ('ostaja'/'omistaja'), is_me, body, created_at` |
| `rpc('decline_interest', { p_interest, p_block: true })` | kieltäydy, ja halutessa estä lähettäjä |

`sender_alias` on muotoa "Kiinnostunut ostaja #A1B2", ellei lähettäjä jakanut nimeään.

## 6. Ilmoitukset (notifikaatiot) ja asetukset

```ts
supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
supabase.rpc('mark_notifications_read', { p_ids: [id] });   // tai ilman parametreja: kaikki
supabase.channel('notif').on('postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
  (p) => {/* uusi ilmoitus */}).subscribe();
```

`kind`: `kiinnostus`, `kiinnostukset_odottavat`, `kiinnostus_vastaus`, `hyvaksyntapyynto`,
`ilmoitus_julkaistu`, `ilmoitus_palautettu`, `ilmoitus_poistettu`. `payload` sisältää linkitettävät
tunnisteet (`interest_id`, `listing_id`, `property_id`).

Asetukset: `from('notification_prefs').update({ accept_interests, email_interests, email_listing_events }).eq('user_id', user.id)`.
Oletuksena kiinnostukset tulevat vain sovellukseen. Sähköposti lähtee vain luvalla, ja siinä on
vain otsikko ja linkki, ei viestin sisältöä. `accept_interests = false` lopettaa kiinnostusten
vastaanoton kokonaan.

## 7. Palvelimen asetukset (Supabase secrets)

| Muuttuja | Kuvaus |
|---|---|
| `STRONG_AUTH_MODE` | `mock` (kehitys) tai `idura` |
| `ENVIRONMENT` | `production` estää mock-tilan |
| `ALLOWED_RETURN_ORIGINS` | sallitut paluuosoitteet, esim. `https://metsamyynti.lovable.app,http://localhost:5173` |
| `STRONG_AUTH_REDIRECT_URI` | `https://<projekti>.supabase.co/functions/v1/strong-auth-callback` |
| `IDURA_DOMAIN`, `IDURA_CLIENT_ID`, `IDURA_SIGNING_JWK`, `IDURA_ENCRYPTION_JWK` | Idura (avaimet: `deno run scripts/generate-idura-keys.ts`) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` | sähköpostit |

Tietokanta-asetukset (`private.settings`, SQL-editorissa): `ownership_source` (`testi`/`mml`),
`step_up_minutes`, `interest_daily_limit`, `interest_repeat_days`, `interest_property_daily`.
