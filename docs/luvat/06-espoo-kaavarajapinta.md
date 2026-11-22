# Pyyntö: Espoon yleiskaavojen rajapintatunnukset

**Tila: LUONNOS – EI LÄHETETTY.** Lähetetään vasta Eetun luvalla.

## 1. Miksi tätä tarvitaan

Espoon yleiskaavojen aluevaraukset (esim. AT kyläalue, AME, M, V) ovat Espoon WFS-rajapinnassa
tasolla `GIS:Yleiskaavat_alueet` (kartat.espoo.fi/teklaogcweb/wfs.ashx), mutta taso vaatii
tunnukset. Myös yleiskaavojen WMS-tasot (esim. `Yleiskaava_pohjoinen_keskinen`) vaativat ne.
Avoimesti saadaan vain asemakaavahakemisto. Valtakunnallinen Ryhti kertoo vain, että kiinteistö on
esim. Espoon pohjois- ja keskiosien yleiskaavan alueella, ei kaavamerkintää.

Ilman merkintää palvelu ei voi laskea rakennusoikeutta automaattisesti (Espoon AT/AME-sääntö:
e=0,1 tai 300 + 60 k-m²), joten myyjä valitsee merkinnän itse kaavakartasta.

Kun tunnukset on saatu, ne lisätään Supabasen Edge Functions -salaisuuksiin nimillä
`ESPOO_WFS_USER` ja `ESPOO_WFS_PASSWORD` (Supabase → Edge Functions → Secrets). Koodi on valmiina
(`supabase/functions/_shared/sources/kaavat/espoo.ts`), eikä muita muutoksia tarvita.

## 2. Kenelle

Espoon kaupungin paikkatietopalvelut / kaupunkimittaus. Osoite tarkistetaan sivulta
kartat.espoo.fi/avoindata tai Espoon kirjaamosta (kirjaamo@espoo.fi) ennen lähettämistä.

## 3. Viesti (luonnos)

> Aihe: Rajapintatunnukset Espoon yleiskaavojen aluevarauksiin (WFS)
>
> Hei,
>
> Kehitämme [yrityksen nimi] (Y-tunnus 3552285-3) palvelua, jossa kiinteistön omistaja voi
> ilmoittaa metsä- tai maatilansa myyntiin. Palvelu kokoaa ilmoitukseen kiinteistön
> kaavatilanteen avoimista lähteistä, ja Espoossa käytämme jo avointa asemakaavahakemistoa
> (GIS:Asemakaavat).
>
> Pyydämme lukutunnuksia Espoon WFS-rajapinnan tasolle GIS:Yleiskaavat_alueet, jotta voimme
> näyttää yleiskaavan aluevarauksen (esim. AT-kyläalue) ja laskea rakennusoikeuden Espoon
> ohjeen mukaisesti (e=0,1 tai rakennusjärjestyksen enimmäismäärät). Haemme vain yksittäisen
> kiinteistön alueen kohteet silloin, kun omistaja avaa kiinteistönsä tiedot, emmekä
> jaa aineistoa eteenpäin sellaisenaan. Lähde mainitaan palvelussa ("Espoon kaupunki").
>
> Jos tunnusten saamiselle on ehtoja tai maksuja, kertokaa ne, niin täytämme tarvittavat
> lomakkeet.
>
> Ystävällisin terveisin
> Eetu [sukunimi], [yritys], [puhelin]
