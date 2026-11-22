# Prototyypin käyttöönotto ja Lovable, askel askeleelta

Tämä ohje on tehty niin, ettei sinun tarvitse koodata eikä käyttää komentoriviä. Tausta
(tietokanta ja palvelinfunktiot) julkaistaan GitHubista automaattisesti Supabaseen, ja Lovable
rakentaa käyttöliittymän sen päälle. Tarkat rajapinnat löytyvät tiedostoista
[kayttajat-api.md](kayttajat-api.md) ja [hinta-arvio-api.md](hinta-arvio-api.md).

## Vaihe 1. Yhdistä pull requestit GitHubissa (5 min)

Avaa https://github.com/fluffycoin/metsamyynti/pulls ja yhdistä tässä järjestyksessä. Avaa PR,
paina **Merge pull request** ja sitten **Confirm merge**:

1. **#3** Vaihe 1: kiinteistöjen datataulut ja datahaut
2. **#2** Käyttäjät, vahva tunnistus, omistajuus ja kiinnostukset
3. **#4** Vaihe 2: hinta-arvio ja "Luo alustava myynti-ilmoitus"
4. **#1** Lupahakemukset ja sopimuspohjat (pelkkiä dokumentteja, voi yhdistää milloin vain)

Jos GitHub ilmoittaa ristiriidasta (conflict), älä ratkaise sitä itse. Kerro minulle, niin korjaan sen.

## Vaihe 2. Luo Supabase-projekti (5 min)

1. Kirjaudu osoitteessa https://supabase.com ja valitse **New project**.
2. Nimi `metsamyynti` ja alue **North EU (Stockholm)**. Keksi tietokannan salasana ja **tallenna
   se**, koska tarvitset sitä vaiheessa 3.
3. Kun projekti on valmis, avaa **Project Settings → General** ja kopioi **Project ID**
   (lyhyt kirjainsarja). Se on projektin tunnus.
4. Avaa oikeasta yläkulmasta oma profiili, sitten **Account → Access Tokens → Generate new token**.
   Anna tunnukselle nimeksi `github` ja kopioi se talteen.

## Vaihe 3. Anna GitHubille lupa julkaista Supabaseen (3 min)

Avaa https://github.com/fluffycoin/metsamyynti/settings/secrets/actions ja lisää **New repository
secret** -napilla kolme salaisuutta:

| Name | Secret |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | vaiheen 2.4 tunnus |
| `SUPABASE_PROJECT_REF` | vaiheen 2.3 Project ID |
| `SUPABASE_DB_PASSWORD` | vaiheen 2.2 salasana |

Avaa sitten **Actions → Deploy Supabase → Run workflow → Run workflow**. Noin kahden minuutin
kuluttua rivin eteen pitäisi tulla vihreä ✓. Jos tulee punainen ✗, kerro minulle. Tästä eteenpäin
julkaisu tapahtuu itsestään aina, kun PR yhdistetään.

## Vaihe 4. Palvelinfunktioiden asetukset Supabasessa (5 min)

Avaa Supabasessa **Edge Functions → Secrets** ja lisää nämä:

| Name | Value |
|---|---|
| `MML_API_KEY` | MML:n API-avain (sama kuin Koirametsässä, tai uusi: maanmittauslaitos.fi → Rajapintapalvelut → API-avain) |
| `STRONG_AUTH_MODE` | `mock` |
| `ENVIRONMENT` | `development` |
| `STRONG_AUTH_REDIRECT_URI` | `https://<Project ID>.supabase.co/functions/v1/strong-auth-callback` |
| `ALLOWED_RETURN_ORIGINS` | `https://*.lovable.app,https://*.lovableproject.com` |

`STRONG_AUTH_MODE=mock` tarkoittaa, että pankkitunnistuksen sijaan sovelluksen sivu /testitunnistus näyttää testihenkilöiden
listan. Silloin koko proto toimii ilman tunnistusvälittäjän sopimusta.

Avaa lisäksi **Authentication → Sign In / Providers → Email** ja varmista, että **Confirm email**
on päällä.

## Vaihe 5. Lovable-projekti ja Supabase-yhteys (5 min)

1. Luo Lovablessa uusi projekti. Ensimmäiseksi viestiksi riittää: "Tyhjä projekti, ohjeet tulevat seuraavaksi."
2. Valitse oikeasta yläkulmasta **Supabase → Connect Supabase** ja valitse projekti `metsamyynti`.
   Lovable näkee silloin valmiit taulut ja funktiot.
3. GitHub-yhteyden voi tehdä Lovablen GitHub-napista. Lovable luo käyttöliittymälle oman repon,
   ja se on hyvä niin, koska taustan repo (metsamyynti) pysyy erillään.
4. Aseta Supabasessa Edge Functions → Secrets -kohtaan `ALLOWED_RETURN_ORIGINS` arvoksi
   `https://*.lovable.app,https://*.lovableproject.com`. Se kattaa kaikki Lovablen esikatselu- ja
   julkaisuosoitteet. Kun palvelulla on oma domain, lisää se perään pilkulla (esim.
   `,https://metsamyynti.fi`). Lisää **Authentication → URL Configuration** -kohtaan Site URL
   (julkaisuosoite) ja Redirect URLs -kohtaan `https://*.lovable.app/**` ja
   `https://*.lovableproject.com/**`.
5. Avaa Lovablessa **Project settings → Knowledge** ja liitä sinne tiedostojen
   [kayttajat-api.md](kayttajat-api.md) ja [hinta-arvio-api.md](hinta-arvio-api.md) sisältö.
   Avaa tiedosto GitHubissa, paina **Raw**, valitse kaikki ja kopioi. Jos tila loppuu kesken,
   liitä tiedoston sisältö sen sijaan siihen promptiin, joka sitä tarvitsee.

## Vaihe 6. Promptit Lovableen

Lähetä yksi prompt kerrallaan ja kokeile tulos ennen seuraavaa.

### Prompt 1: perusta ja ulkoasu

```
Rakennetaan suomenkielinen palvelu, jossa metsätilan, pellon tai rakentamattoman tontin omistaja
voi myydä kiinteistönsä ilman välittäjää. Tausta on valmiina Supabasessa: ÄLÄ luo tai muuta
tauluja, migraatioita tai Edge Functioneita. Käytä vain olemassa olevia tauluja, RPC-funktioita
(supabase.rpc) ja Edge Functioneita (supabase.functions.invoke), jotka on kuvattu Knowledgessa
(kayttajat-api.md ja hinta-arvio-api.md).

Virheissä näytä käyttäjälle error.message sellaisenaan. error.hint on koneluettava koodi, jonka
perusteella ohjataan eteenpäin (esim. TUNNISTAUDU_UUDELLEEN → vahva tunnistus).

Ulkoasu: tumma, moderni ja selkeä, vihreä korostusväri, kartta keskeisenä. Mobiili ensin.

Tee nyt:
- Yläpalkki: logo "Metsämyynti", linkit Kartta, Myynnissä, Omat kiinteistöt, Ilmoitukset
  (kellokuvake, jossa lukemattomien määrä my_account().unread_notifications) ja Kirjaudu/Profiili.
- Rekisteröinti ja kirjautuminen Supabase Authilla: sähköposti + salasana ja magic link.
  Rekisteröinnissä kysytään nimimerkki (options.data.display_name). Kerro, että sähköposti pitää
  vahvistaa.
- Etusivu: iso otsikko "Myy metsäsi, peltosi tai tonttisi ilman välittäjää", toinen otsikko
  "Tarkista, onko joku kiinnostunut ostamaan metsäsi" ja napit Etsi kiinteistö kartalta ja Myy omasi.
```

### Prompt 2: kartta ja kiinteistösivu

```
Tee sivu /kartta: koko ruudun kartta (MapLibre + OpenStreetMap-tausta). Hakukenttä
kiinteistötunnukselle (esim. 858-409-10-2). Haku kutsuu Edge Functionia property-summary
(kt=tunnus) ja avaa sivun /kiinteisto/:kt.

Kiinteistösivu /kiinteisto/:kt näyttää property-summaryn tiedot: rajat kartalla, pinta-ala
hehtaareina, kunta, tyyppi, metsäkuviot taulukkona (puulaji, ikä, tilavuus m³/ha), kaavatiedot
(kaavamerkintä, tehokkuus, rakennusoikeus, määräykset) ja hinta-arvio (Edge Function valuation,
ks. hinta-arvio-api.md). Merkitse puuston arvo "Alustava puuston arvo" tai "Vahvistettu puuston
arvo" -merkillä.

Lisää sivulle nappi "Olen kiinnostunut", myös kun kohde ei ole myynnissä. Kirjautumaton ohjataan
rekisteröitymään. Lomakkeessa on viesti, valinnainen hintatarjous ja valinta "Jaa yhteystietoni"
(nimi ja puhelin). Kutsu rpc('express_interest', { p_property_id: summary.id,
p_message, p_offer_eur, p_share_contact, p_contact_name, p_contact_phone }). Onnistuessa näytä: "Viesti tallennettu. Omistaja näkee sen sovelluksessa.
Jos hän ei vielä ole palvelussa, viesti odottaa häntä."
```

### Prompt 3: myyjäksi ja omat kiinteistöt

```
Sivu /omat-kiinteistot:
- Jos my_account().is_seller on false, näytä selitys ("Myyminen vaatii kertaalleen
  tunnistautumisen pankkitunnuksilla. Haemme silloin omistamasi kiinteistöt automaattisesti.") ja
  nappi Tunnistaudu. Nappi kutsuu supabase.functions.invoke('strong-auth-start',
  { body: { purpose: 'kayttoonotto', return_to: location.origin + '/omat-kiinteistot' } })
  ja ohjaa selaimen data.url-osoitteeseen.
- Paluussa URL:ssa on ?strong_auth=ok, virhe tai peruttu (ja virheessä &syy=KOODI). Näytä
  ilmoitus ja poista parametrit osoitteesta.
- Myyjälle listaa rpc('my_properties') kortteina: nimi, tunnus (määräalalle perään -M ja
  maarala_no), tyyppi, pinta-ala ha, oma osuus murtolukuna (share_num/share_den), kuolinpesän nimi
  (via_estate), ilmoituksen tila ja kiinnostusten määrä.
- Kortissa on napit Luo alustava myynti-ilmoitus (Edge Function listing-draft, ks.
  hinta-arvio-api.md), Katso kiinnostukset ja Avaa kiinteistö.
- Jos estate_missing_shareholders on true, näytä huomautus "Kuolinpesän osakkaat puuttuvat" ja
  perukirjan latauslomake: lataus Storageen bucketiin 'perukirjat' polkuun <user.id>/<tiedosto>
  ja sen jälkeen rpc('submit_estate_claim').
```

### Prompt 3b: testitunnistussivu (vain testivaiheeseen)

```
Tee sivu /testitunnistus. Se näytetään, kun Tunnistaudu-nappia painetaan testitilassa.
- Lue URL:sta parametri state.
- Hae testihenkilöt: fetch(`${SUPABASE_URL}/functions/v1/strong-auth-callback?testihenkilot=1`),
  joka palauttaa { people: [{ hetu, name, description }] }. SUPABASE_URL on sama osoite, jota
  Supabase-asiakas käyttää.
- Näytä otsikko "Testitunnistus", teksti "Testivaihe: valitse henkilö, jona tunnistaudut. Oikeassa
  palvelussa tässä on pankkitunnistus." ja henkilöt kortteina (nimi, tunnus, kuvaus).
- Kortin klikkaus lähettää fetch POST samaan osoitteeseen, otsakkeena content-type
  application/json ja runkona { state, hetu }. Vastaus on { redirect } tai { error }. Jos redirect
  on mukana, ohjaa selain siihen osoitteeseen (location.href = redirect). Muuten näytä error.
- Älä käytä supabase.functions.invoke-kutsua tässä, vaan tavallista fetchiä.
```

### Prompt 4: ilmoituksen muokkaus, julkaisu ja yhteisomistajien hyväksyntä

```
Sivu /ilmoitus/:id/muokkaa:
- Näytä listing-draftin generoimat tekstiosiot (listings.sections) muokattavina, otsikko ja
  pyyntöhinta. Tallennus tehdään suoraan listings-tauluun update-kutsulla (vain luonnos-tilassa).
  Näytä hinta-arvio ja myyjän oman hinnan asetus (rpc set_seller_price, ks. hinta-arvio-api.md).
- Nappi Lähetä julkaistavaksi kutsuu rpc('submit_listing', { p_listing: id }). Jos virheen hint
  on TUNNISTAUDU_UUDELLEEN, käynnistä strong-auth-start purpose 'julkaisu' ja return_to samalle
  sivulle, ja paluun jälkeen yritä julkaisua automaattisesti uudelleen.
- Näytä rpc('listing_approval_status') listana: omistajan nimi, tila (odottaa / hyväksytty /
  hylätty) ja "ei vielä palvelussa", jos has_account on false.
- Jos minulta odotetaan hyväksyntää (my_properties().my_approval = 'odottaa' tai
  hyvaksyntapyynto-ilmoitus), näytä napit Hyväksy ja Hylkää (hylkäykseen syy-kenttä). Ne
  kutsuvat rpc('decide_listing'). Tunnistuslogiikka on sama, mutta purpose on 'hyvaksynta'.
- Julkaistulle ilmoitukselle napit Muokkaa (rpc reopen_listing), Merkitse myydyksi
  (rpc mark_listing_sold) ja Poista ilmoitus (rpc withdraw_listing), kukin vahvistusdialogilla.

Sivu /myynnissa: listaa julkaistut ilmoitukset (listings, status 'julkaistu', ks.
kayttajat-api.md kohta 4) kortteina ja kartalla. Kortti avaa julkisen ilmoitussivun
/ilmoitus/:id, jossa on myös "Olen kiinnostunut" -nappi.
```

### Prompt 5: Ilmoitukset-välilehti ja asetukset

```
Sivu /ilmoitukset, jossa on kaksi välilehteä:
1. Kiinnostukset: rpc('interests_received'). Kortissa kiinteistö (property_label), viesti,
   tarjous, lähettäjä (sender_alias) ja jaetut yhteystiedot. Avaus kutsuu rpc('mark_interest_read')
   ja näyttää keskustelun rpc('interest_thread') chat-tyylisenä. Vastauskenttä kutsuu
   rpc('reply_to_interest'). Napit Kieltäydy ja Estä lähettäjä kutsuvat rpc('decline_interest',
   { p_interest, p_block }).
2. Kaikki: notifications-taulu uusin ensin, Realtime-tilaus uusille riveille
   (filter user_id=eq.<oma id>). Klikkaus vie payloadin listing_id- tai interest_id-kohteeseen.
   "Merkitse kaikki luetuiksi" kutsuu rpc('mark_notifications_read').

Sivu /kiinnostukseni: rpc('interests_sent'), jossa näkyvät tila ja "Omistaja vastasi" -merkki.
Kortti avaa keskustelun samaan tapaan.

Sivu /asetukset: kolme kytkintä notification_prefs-tauluun: "Otan vastaan kiinnostuksia",
"Kiinnostukset myös sähköpostiin" ja "Hyväksyntäpyynnöt ja julkaisut sähköpostiin". Lisäksi
nimimerkin muutos (profiles.display_name).
```

## Vaihe 7. Kokeile protoa testihenkilöillä

1. Rekisteröidy omalla sähköpostilla, vahvista se ja avaa Omat kiinteistöt → Tunnistaudu.
2. Valitse testilistalta esimerkiksi **Matti Metsänen**. Hänellä on metsätila Tuusulassa, tontti
   Keravalla ja osuus kuolinpesän metsästä Pirkkalassa.
3. Kokeile yhteisomistusta toisella tilillä (toinen sähköpostiosoite tai selaimen
   incognito-ikkuna): rekisteröi Liisa Pelto ja Pekka Pelto, jotka omistavat yhdessä Sipoon pellon.
4. Kokeile kiinnostusta kolmannella tilillä ilman tunnistusta: hae kartalta `753-412-2-7`
   (Peltola) ja lähetä kiinnostus. Se tulee Liisalle ja Pekalle.

## Myöhemmin

- **Sähköposti-ilmoitukset:** luo Resend-tili ja lisää Secretsiin `RESEND_API_KEY`, `EMAIL_FROM`
  ja `APP_URL`. Ajastuksen teen sinulle, kun olet valmis.
- **Oikea pankkitunnistus (Idura):** tehdään sopimuksen jälkeen (ks. tunnistuspalveluiden
  vertailu). Avaimet luodaan skriptillä `scripts/generate-idura-keys.ts`, ja `STRONG_AUTH_MODE`
  vaihdetaan arvoon `idura`.
- **MML:n omistajatiedot:** kun käyttölupa on myönnetty, testirekisteri vaihdetaan oikeaan yhdellä
  asetuksella. Käyttöliittymä ei muutu.
