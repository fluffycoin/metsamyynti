# Hakemus: MML Kauppahintarekisteri

**Tila: LUONNOS – EI LÄHETETTY.** Lähetetään vasta Eetun luvalla.

## 1. Mitä haetaan ja miksi

Hinta-arvion maan arvo (pellot, metsämaa, rakentamattomat tontit) lasketaan toteutuneista kauppahinnoista samalla alueella. Tarvitsemme kauppahintarekisteristä kaupat, joissa on kiinteistötunnus/sijainti, pinta-ala, kauppahinta, kauppapäivä ja kohteen tyyppi.

Emme tarvitse ostajien tai myyjien henkilötietoja. Haetaan **suppein tuote: ilman luonnollisten henkilöiden tunnistetietoja**. (Tämäkin on MML:n mukaan epäsuoraa henkilötietoa, joten GDPR koskee sitä.)

## 2. Menettely

1. Sähköposti osoitteeseen **verkkopalvelut@maanmittauslaitos.fi**: suunniteltu palvelu, käyttötarkoitus ja kuka tietoja käyttää (teksti alla).
2. MML lähettää hakemuslomakkeen ja **tietoturvaliitteen** (meidän valmis vastauksemme: [03-tietoturvaliite.md](03-tietoturvaliite.md)).
3. Lupapäätös kauppahintarekisterilain (552/1980) 5 §:n 1 momentin perusteella.
4. Myönteisen päätöksen jälkeen rajapintasopimus. Käyttöönotto vaatii **Suomi.fi-palveluväylän** (testilupa on voimassa 6 kk).

Huom. MML korvaa WFS- ja tiedostopalvelutuotteet OGC API Features -rajapinnalla, ja vanhat poistuvat 03/2027 mennessä. Haetaan suoraan uutta OGC API -tuotetta.

## 3. Luvan peruste

Laki sallii luovutuksen mm. "muihin arviointi- ja tutkimustehtäviin". Lupaa **ei myönnetä suoramarkkinointiin tai vastaavaan**. Meidän käyttömme on kiinteistön arvon arviointia, joten se sopii arviointi-perusteeseen. Hakemuksessa korostetaan, että:
- tietoja käytetään vain tilastollisen hinta-arvion laskemiseen (esim. €/ha alueittain ja kohdetyypeittäin),
- yksittäisiä kauppoja ei näytetä käyttäjille tunnistettavassa muodossa,
- tietoja ei luovuteta eikä myydä eteenpäin.

## 4. Valmis sähköpostiteksti (ei lähetetty)

> Aihe: Kauppahintarekisterin tietojen käyttölupa: kiinteistöjen hinta-arviointi
>
> Hei,
>
> [Yrityksen nimi] (Y-tunnus 3552285-3) rakentaa verkkopalvelua, jossa metsä-, pelto- ja rakentamattomien tonttien omistajat voivat ilmoittaa kiinteistönsä myyntiin ilman kiinteistönvälittäjää. Palvelu ei ole välitysliike.
>
> Palvelu laskee jokaiselle kohteelle alustavan hinta-arvion. Maan arvo perustuu alueen toteutuneisiin kauppahintoihin, ja metsien puuston arvo lasketaan erikseen Metsäkeskuksen avoimesta metsävaratiedosta. Haemme kauppahintarekisteristä tietoja ilman luonnollisten henkilöiden tunnistetietoja: kiinteistötunnus tai sijainti, pinta-ala, kauppahinta, kauppapäivä ja kohteen tyyppi koko Suomesta.
>
> Käyttötarkoitus on kiinteistöjen arvon arviointi (kauppahintarekisterilain 5 § 1 mom.). Tiedoista lasketaan tilastollisia aluehintoja (€/ha). Yksittäisiä kauppoja ei näytetä käyttäjille tunnistettavassa muodossa, eikä tietoja luovuteta tai myydä eteenpäin eikä käytetä suoramarkkinointiin. Tietoja käsittelee automaattinen laskentapalvelu EU-alueella; pääkäyttäjänä toimii allekirjoittanut.
>
> Pyydämme hakemuslomakkeen ja tietoturvaliitteen sekä tiedon sopivasta OGC API -tuotteesta ja sen hinnasta.
>
> Ystävällisin terveisin
> Eetu [Sukunimi]
> [Yrityksen nimi], [puhelin]

## 5. Hinnat (MML:n hinnasto, alv 0 %; sulkeissa alv 25,5 %)

- Vähimmäismaksu 247,40 € / v (310,49 €)
- Organisaatiot: ylläpitomaksu 108,50 € + aineistomaksu 426,26 € / 500 hakua (porrastus aina 5 miljoonaan hakuun)
- Kiinteä vuosimaksu "Property conveyance fixed fee" 36 183 € (45 409,67 €). **Ei tarvita meille**, se on suurkäyttäjille.

Arvio ensimmäiselle vuodelle: **n. 250–1 000 €**, mikä sopii sovittuun "muutama sata euroa vuodessa" -budjettiin, jos laskenta tehdään välimuistista eikä jokaiselle ilmoitukselle erikseen.

Hinnasto mainitsee yhä vanhat tuotteet, joten OGC API -tuotteen tarkka hinta kysytään sähköpostissa.

## 6. Tekniset ehdot, jotka toteutetaan

- Jokaisessa rajapintakyselyssä mukana loppukäyttäjän tunniste (meillä: järjestelmäkäyttäjä tai ilmoituksen luonut käyttäjä).
- Lokiin kuka kysyi, mitä ja milloin.
- Tiedot tallennetaan erilliseen tauluun, johon vain laskentapalvelulla on lukuoikeus (Supabase RLS).

## 7. Varasuunnitelma ennen lupaa

MML julkaisee avoimia kiinteistökauppojen hintatilastoja (alueellisia keskihintoja, esim. metsämaan €/ha; tarkistetaan alueellinen tarkkuus). Hinta-arvion v1 voi käyttää niitä, kunnes lupa on voimassa. Tarkkuus on huonompi, joten ilmoituksessa lukee "alustava, alueen keskihintaan perustuva".
