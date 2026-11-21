# Vahvan tunnistuksen palvelut: hintavertailu

Tarkistettu 21.11.2026 palveluiden omilta hinnastosivuilta. Hinnat alv 0 %.

## Tiivistelmä

**Suositus: Idura (ent. Criipto) Verify.** Se on ainoa välittäjä, jolla on julkinen hinnasto, ei aloitusmaksua itsepalvelutilauksessa eikä sitoutumista, ja se kattaa kaikki suomalaiset pankkitunnukset ja Mobiilivarmenteen (FTN-luottamusverkosto).

**Kustannus ei ole 50 000 €.** Kaksi asiaa pitää kulut pieninä:
1. Vahva tunnistus vaaditaan **vain myyjiltä**. Ostajat ja kiinnostusilmoitusten lähettäjät luovat tavallisen tilin (sähköposti/Google), mikä on ilmaista.
2. Myyjä tunnistautuu vahvasti **kerran**, ja henkilöllisyys sidotaan hänen tiliinsä. Uusi vahva tunnistus pyydetään vain kriittisissä kohdissa (ilmoituksen julkaisu, omistajien hyväksyntä), ei joka kirjautumisella.

## Hinnat

| Palvelu | Kuukausimaksu | Tunnistus / kpl (FTN) | Aloitus | Sitoutuminen | Huom. |
|---|---|---|---|---|---|
| **Idura Verify** Small | 67 € (1 000 kirjautumista/kk) | 0,053 € | 0 € itsepalvelussa ("onboarding fees may apply" sopimusasiakkaille) | Ei, kuukausittain irtisanottava | Vuosimaksulla −10 %. FTN vaatii sopimuksen Iduran kanssa. |
| Idura Verify Medium | 220 € (5 000/kk) | 0,053 € | sama | sama | |
| Idura Verify Large | 400 € (10 000/kk) | 0,053 € | sama | sama | |
| Idura Signatures (allekirjoitus) | 139 € (200 allekirj./kk) → 348 € (1 000/kk) | 0,053 € | sama | sama | Ei tarvita v1:ssä, koska kauppa allekirjoitetaan MML:n palvelussa. |
| **Suomi.fi-tunnistus** (DVV) | 100 € / asiointipalvelu | 0,72 € | 600 € | Ei mainittu | Hinnasto 1.4.2026. Yksityiset saavat käyttää maksullisena. Noin 14× kalliimpi tunnistus kuin Idura. |
| **Signicat** | Ei julkista hintaa | Ei julkista hintaa | Kyllä (aloitus + kk + tapahtuma) | Tarjouksen mukaan | Pyydetään tarjous vertailuun. |
| Telia, Visma/Nets ym. välittäjät | Ei julkista hintaa | Ei julkista hintaa | | | Pyydetään tarjous tarvittaessa. |
| Suora pankkisopimus (esim. S-Pankki) | | 0,03 € | | | Kattaa vain yhden pankin asiakkaat. Jokaisen pankin kanssa oma sopimus ja integraatio, joten ei järkevä pienelle palvelulle. |

Lähteet: https://idura.eu/pricing/verify, https://idura.eu/pricing/signatures, https://cdn.verkkopalvelu.suomi.fi/files/Suomi.fi-tunnistus_hinnasto_01042026-36ab513540a5d1415dc9d9b5e21d6494.pdf, https://dokumentit.s-pankki.fi/tiedostot/palveluhinnasto-s-pankin-tunnistuspalvelu, https://beverified.org/providers/signicat/

Iduran sivulta ei näy, paljonko paketin ylittävä kirjautuminen maksaa. Kysytään ennen sopimusta.

## Kustannuslaskelma (Idura)

Oletus: jokainen myyjä tunnistautuu keskimäärin 2 kertaa (tilin vahvistus + julkaisu). Yhteisomistuksessa jokainen omistaja tunnistautuu erikseen, joten kerroin on noin 1,5 omistajaa per kohde.

| Skenaario | Myyjiä / v | Tunnistuksia / v | FTN-maksut / v | Paketti / v | **Yhteensä / v** |
|---|---|---|---|---|---|
| Pilotti | 1 000 | 3 000 | 159 € | Small 804 € | **≈ 960 €** |
| Kasvu | 10 000 | 30 000 | 1 590 € | Medium 2 640 € (≈ 2 500 kirjautumista/kk) | **≈ 4 230 €** |
| Iso | 50 000 | 150 000 | 7 950 € | Large 4 800 € tai Enterprise (≈ 12 500/kk) | **≈ 12 800 €+** |
| Kaikki 500 000 omistajaa kerran | 500 000 | 500 000 | 26 500 € | Enterprise (tarjous) | **≈ 30 000 €+** |

Viimeinenkin rivi jakautuisi vuosille, ja siinä vaiheessa palvelulla on jo ansaintamalli. Suomi.fi:llä pilottivuosi maksaisi noin 600 + 1 200 + 3 000 × 0,72 = **≈ 3 960 €**.

## Säästökeinot

- Vahva tunnistus vain myyjille (päätetty).
- Henkilöllisyys sidotaan tiliin, ja kirjautuminen tapahtuu sen jälkeen sähköpostilla, Googlella tai passkeylla.
- Uudelleentunnistus vain kriittisissä toiminnoissa.
- Iduran testiympäristö on ilmainen, joten kehitys ei maksa mitään.

## Sääntely

Kun käytämme tunnistusvälittäjää, olemme **asiointipalvelu** (luottava osapuoli), emme tunnistuspalvelun tarjoaja. Emme tarvitse omaa rekisteröintiä Traficomiin. Välittäjä (Idura) on Traficomin valvoma FTN-jäsen.

Tunnistuksesta saamme nimen ja henkilötunnuksen. Henkilötunnusta käsitellään tietosuojalain (1050/2018) 29 §:n perusteella, koska yksiselitteinen tunnistaminen on tarpeen MML-haussa. Henkilötunnus säilytetään salattuna (ks. tietoturvaliite).

## Seuraavat askeleet (ei tehty)

1. Iduran tili ja testiympäristö. Ilmainen, ei sitoumusta. Tämän voi tehdä heti.
2. Tarjouspyyntö Signicatille vertailuun (vapaaehtoinen).
3. FTN-sopimus Iduran kanssa ennen tuotantoa.
