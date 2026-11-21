# Hakemus: MML Kiinteistötietopalvelu (omistaja- ja lainhuutotiedot)

**Tila: LUONNOS – EI LÄHETETTY.** Lähetetään vasta Eetun luvalla.

## 1. Mitä haetaan ja miksi

Tarvitsemme kaksi asiaa, joita avoin data ei kata:

1. **Kirjautuneen myyjän omat kiinteistöt.** Kun myyjä tunnistautuu vahvasti, haemme henkilötunnuksella ne kiinteistöt ja määräalat, joihin hänellä on lainhuuto (tai jotka ovat kuolinpesän/yhtymän nimissä, jossa hän on osakkaana). Näin myyjän ei tarvitse kirjoittaa kiinteistötunnuksia itse.
2. **Yhteisomistuksen tarkistus.** Ennen ilmoituksen julkaisua tarkistamme lainhuutorekisteristä kaikki omistajat ja omistusosuudet, jotta ilmoitus julkaistaan vasta kun kaikki omistajat ovat tunnistautuneet ja hyväksyneet sen.

Kiinteistörajat, kiinteistötunnukset ja rajamerkit ovat **avointa dataa**, eikä niihin tarvita lupaa. Niitä käytetään karttanäkymässä ilman tätä hakemusta.

## 2. Menettely (MML:n ohjeiden mukaan)

1. Täytetään MML:n verkkosivulla **"Asiakkaan täyttämä hakemus tietojen saamiseksi"**.
2. Hakemus liitetään sopimukseen **"Sopimus Kiinteistötietopalvelusta" (Vnro 1.1)**, hakijan versio (media/31625).
3. MML tekee harkinnanvaraisen **tietolupapäätöksen** KTJ-lain (453/2002) 6 §:n 3 momentin perusteella.
4. Myönteisen päätöksen jälkeen allekirjoitetaan sopimus ja otetaan rajapinta käyttöön (testi → tuotanto).

Sopimuksen pakolliset kentät: organisaation nimi, Y-tunnus, yhteyshenkilön nimi, sähköposti ja puhelin, postiosoite, laskutustiedot (verkkolaskuoperaattori tai laskutusosoite), julkishallinnon valintaruutu (ei). Käyttäjähallintaa varten MML pyytää jokaisen pääkäyttäjän henkilötunnuksen.

## 3. Valmiiksi kirjoitettu hakemusteksti

Kopioidaan lomakkeen kenttiin.

**Hakija:** [Yrityksen nimi], Y-tunnus 3552285-3
**Yhteyshenkilö:** Eetu [Sukunimi], [sähköposti], [puhelin]
**Postiosoite:** [osoite]
**Laskutus:** [verkkolaskuosoite / operaattori tai sähköposti]
**Julkishallinnon organisaatio:** Ei

**Haettavat tiedot:**
- Lainhuutotiedot (omistajat, omistusosuudet, saantotiedot) kiinteistöistä ja määräaloista
- Kiinteistörekisterin perustiedot (pinta-ala, rekisteröintipäivä, käyttötarkoitus)
- Haku henkilötunnuksella: henkilön omistamat kiinteistöt ja määräalat
- Ei kiinnitys- eikä panttitietoja v1:ssä. (Haetaan myöhemmin erikseen, jos ostajille halutaan näyttää rasitteet ja kiinnitykset.)

**Käyttötarkoitus (kenttä "tietojen käyttötarkoitus"):**

> Ylläpidämme verkkopalvelua, jossa kiinteistön omistaja voi itse ilmoittaa omistamansa metsä-, pelto- tai rakentamattoman tontin myyntiin ilman kiinteistönvälittäjää. Palvelu ei ole välitysliike eikä ota toimeksiantoja.
>
> Omistaja tunnistautuu palveluun vahvalla sähköisellä tunnistuksella. Tunnistuksen jälkeen haemme hänen henkilötunnuksellaan **vain hänen omat** kiinteistönsä ja määräalansa, jotta hän voi valita myytävän kohteen. Haku tehdään aina rekisteröidyn omasta pyynnöstä ja hänen ollessaan kirjautuneena. Tämän lisäksi tarkistamme valitun kohteen kaikki lainhuudon saajat ja osuudet, jotta myynti-ilmoituksen voi julkaista vasta, kun jokainen omistaja on tunnistautunut ja hyväksynyt sen.
>
> Emme luovuta omistajatietoja kolmansille. Omistajan nimeä ei näytetä muille käyttäjille; kiinnostuneet ostajat voivat lähettää omistajalle viestin vain palvelun kautta, eikä omistajan henkilöllisyys paljastu ilman tämän omaa suostumusta. Tietoja ei käytetä suoramarkkinointiin, markkina- tai mielipidetutkimukseen eikä niitä myydä edelleen.

**Käyttäjät:** Tietoja käsittelee automaattinen rajapintaintegraatio. Pääkäyttäjät: Eetu [Sukunimi] (+ enintään 1–2 ylläpitäjää). Jokainen kysely kirjataan lokiin (kuka, mitä, milloin, minkä loppukäyttäjän pyynnöstä).

**Arvioitu kyselymäärä:** Ensimmäinen vuosi n. 2 000–10 000 henkilöhakua ja 5 000–30 000 kiinteistöhakua.

**Tietojen sijainti:** EU/ETA (Supabase, EU-alue [Frankfurt/eu-central-1]). Tietoja ei siirretä EU/ETA-alueen ulkopuolelle.

**Liitteet:** Tietoturvaliite ([03-tietoturvaliite.md](03-tietoturvaliite.md)), tietosuojaseloste ([../juridiikka/tietosuojaseloste.md](../juridiikka/tietosuojaseloste.md)), kaupparekisteriote.

## 4. Sopimuksen ehdot, jotka meidän pitää täyttää

Sopimusluonnoksesta (31625):

- **Ei suoramarkkinointia, mielipide- eikä markkinatutkimusta** (10 kohta). Tämä tarkoittaa käytännössä: emme koskaan lähetä omistajille "myisitkö metsäsi?" -viestejä heidän tietojensa perusteella. Kiinnostusilmoitukset tulevat vain omistajille, jotka ovat itse luoneet tilin ja sallineet ilmoitukset. **Tämä vaikuttaa tuotteeseen:** kiinnostusilmoitus kohteeseen, jonka omistaja ei ole palvelussa, jää odottamaan eikä sitä välitetä omistajalle muuta kautta.
- Vain ilmoitettuun käyttötarkoitukseen, ei edelleenmyyntiä. Otteita ja todistuksia saavat myydä vain MML ja kunnat (4 kohta).
- Tiedot pysyvät EU/ETA-alueella (10 kohta).
- Käyttäjät kirjautuvat MML:n palveluun vahvasti Suomi.fi:n kautta (4 kohta).
- MML voi auditoida käytön (11 kohta). Lokit säilytetään [vähintään 5 vuotta / MML:n vaatima aika].
- Käyttöoikeus vain niille, joiden tehtävä sitä vaatii.

## 5. Hinnat (tiedossa olevat)

Sopimusasiakkaan hinnaston mukaan (alv 0 %, otteissa ei alv:ia):
- Kiinteistörekisteriote 5,60 €
- Rekisteriyksikön perustiedot 0,62 € / kysely
- Lainhuutotodistus henkilötunnuksin 5,60 €
- Käyttäjätunnuksen ylläpito 14,80 € / kk / tunnus

Rajapintakyselyjen tarkka hinta lainhuutotiedoille ei näy julkisesta hinnastosta. **Kysytään MML:ltä hakemuksen yhteydessä.** Karkea arvio ensimmäiselle vuodelle: 200–1 500 € riippuen kyselymäärästä.

## 6. Riskit ja varasuunnitelma

- **Lupa on harkinnanvarainen.** MML:n käsikirjan esimerkit hyväksytyistä käyttötarkoituksista (naapuri, metsästys, puukauppa, tuulivoima) eivät suoraan kata ilmoitusalustaa. Vahvin perusteemme on, että haku tehdään rekisteröidyn omasta pyynnöstä hänen omista tiedoistaan.
- **Jos lupaa ei myönnetä:** myyjä syöttää kiinteistötunnuksen itse ja lataa lainhuutotodistuksen (saa itse MML:n asiointipalvelusta). Tarkistamme omistuksen vertaamalla todistuksen nimeä tunnistuksen nimeen. Hitaampi, mutta toimii ilman lupaa.
- Ennen virallista hakemusta kannattaa lähettää lyhyt ennakkokysely MML:lle (viesti alla), jotta tiedetään, onko tämä käyttötarkoitus mahdollinen.

### Ennakkokysely MML:lle (luonnos, ei lähetetty)

> Aihe: Ennakkokysely: kiinteistötietopalvelun lupa omistajan omien kiinteistöjen hakuun
>
> Hei,
>
> Olemme rakentamassa verkkopalvelua, jossa kiinteistön omistaja voi itse ilmoittaa metsä-, pelto- tai tonttikiinteistönsä myyntiin ilman välittäjää. Omistaja tunnistautuu vahvasti, minkä jälkeen haluaisimme hakea hänen henkilötunnuksellaan hänen omat kiinteistönsä ja määräalansa sekä tarkistaa valitun kohteen muut lainhuudon saajat (yhteisomistus, kuolinpesät). Tietoja ei käytetä suoramarkkinointiin eikä luovuteta eteenpäin.
>
> Onko tämä käyttötarkoitus mahdollinen KTJ-lain 6 §:n mukaisella luvalla, ja mitkä rajapintatuotteet ja hinnat siihen sopisivat?
>
> Ystävällisin terveisin
> Eetu [Sukunimi]
> [Yrityksen nimi], Y-tunnus 3552285-3
