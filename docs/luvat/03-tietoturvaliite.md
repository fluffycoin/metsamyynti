# Tietoturvaliite (MML:n hakemuksiin)

**Tila: LUONNOS.** MML lähettää oman lomakkeensa; vastaukset kopioidaan tästä. Hakasulkeiden kohdat tarkistetaan, kun tekninen toteutus on lukittu.

**Organisaatio:** [Yrityksen nimi], Y-tunnus 3552285-3
**Tietoturvasta vastaava:** Eetu [Sukunimi], [sähköposti]

## 1. Hallinnollinen tietoturva
- Tietoja käsittelevät vain nimetyt pääkäyttäjät (1–3 henkilöä). Käyttöoikeudet myönnetään tehtävän perusteella ja poistetaan heti, kun tehtävä päättyy.
- Käyttäjät sitoutuvat kirjallisesti salassapitoon ja MML:n käyttöehtoihin.
- Tietosuojaseloste on julkinen palvelussa.
- Tietoturvapoikkeamista ilmoitetaan MML:lle viipymättä ja tietosuojavaltuutetulle 72 tunnin kuluessa (GDPR 33 art.).

## 2. Tekninen tietoturva
- **Sijainti:** tietokanta Supabase (PostgreSQL + PostGIS), EU-alue [eu-central-1, Frankfurt]. Ei siirtoja EU/ETA:n ulkopuolelle.
- **Salaus:** TLS 1.2+ kaikessa liikenteessä; levyn salaus (AES-256) palveluntarjoajan puolella.
- **Pääsynhallinta:** rivitason käyttöoikeudet (Row Level Security). MML:n tietoja sisältäviin tauluihin on pääsy vain palvelinpuolen funktioilla, ei suoraan selaimesta.
- **Rajapinta-avaimet:** säilytetään palvelinpuolen salaisuuksina, ei koskaan selaimessa tai koodivarastossa.
- **Ylläpitäjien kirjautuminen:** kaksivaiheinen tunnistus kaikissa hallintapaneeleissa (Supabase, GitHub, hosting).
- **Henkilötunnus:** tallennetaan vain salattuna, ja hakuja varten käytetään erillistä avainta. Ei näytetä käyttöliittymässä.

## 3. Lokitus ja valvonta
- Jokaisesta MML-kyselystä kirjataan: aika, kyselyn tyyppi, haettu tunnus, loppukäyttäjän tunniste ja syy (esim. "omat kiinteistöt", "yhteisomistuksen tarkistus").
- Lokit säilytetään [5 vuotta] ja ovat MML:n auditoitavissa.
- Poikkeavan määrän kyselyitä hälyttää automaattinen raja (esim. yli [50] henkilöhakua tunnissa).

## 4. Tietojen säilytys ja poisto
- Omistajatiedot: niin kauan kuin käyttäjällä on tili tai aktiivinen ilmoitus, ja poistetaan [30 päivän] kuluessa tilin poistosta.
- Kauppahintatiedot: päivitetään säännöllisesti; vanhentuneet rivit poistetaan päivityksen yhteydessä.
- Varmuuskopiot: [7–30 päivää], salattuina, EU-alueella.

## 5. Käyttötarkoitussidonnaisuus
- Tietoja ei käytetä suoramarkkinointiin, markkina- tai mielipidetutkimukseen.
- Tietoja ei luovuteta eikä myydä eteenpäin.
- Omistajan nimeä ei näytetä muille käyttäjille.
