# Metsämyynti

Palvelu, jossa tontin, metsätilan tai pellon omistaja voi myydä kiinteistönsä ilman välittäjää.
Kiinteistötunnuksen perusteella palvelu hakee automaattisesti rajat, puuston, kaavatiedot ja
alustavan hinta-arvion, ja täyttää myynti-ilmoituksen valmiiksi.

## Rakenne

| Osa | Missä | Kuka |
|---|---|---|
| Käyttöliittymä | Lovable (Supabasen päällä) | Eetu |
| Tietokanta (Postgres + PostGIS) | `supabase/migrations/` | tämä repo |
| Datahaut ja laskenta (Edge Functions, Deno) | `supabase/functions/` | tämä repo |

## Datalähteet

| Tieto | Lähde | Ehto |
|---|---|---|
| Kiinteistön rajat | MML kiinteistötietojen avoin rajapinta | maksuton API-avain (`MML_API_KEY`) |
| Metsäkuviot (puusto, ikä, puulajit, tilavuus) | Metsäkeskus, avoin metsävaratieto | avoin, CC BY 4.0 |
| Kantohinnat viikoittain | Luke, PxWeb | avoin |
| Kaavat | Kuntien rajapinnat (pilotit) + Syken Ryhti (koko Suomi) | avoin |
| Omistajatiedot (lainhuuto) | MML kiinteistötietopalvelu | **käyttölupa** (hakemus valmisteilla) |
| Kauppahinnat | MML kauppahintarekisteri | **käyttölupa**, maksullinen (siihen asti taulu `land_price_reference`) |
| Maan hintatasot (väliaikainen) | Luke: pellon kauppahinnat 2025; MML:n tiedotteet metsätilojen hinnoista 2025–2026; muut arvioita | avoin |

Kaavalähteet pilottikunnittain (tarkemmin `supabase/functions/_shared/sources/kaavat/index.ts`):

| Kunta | Mitä saadaan |
|---|---|
| Tampere | kaavayksiköt: käyttötarkoitus, rakennusoikeus, tehokkuus, kerrosluku |
| Turku | asemakaava-alueet, aluevaraukset (käyttötarkoitus), yleiskaava |
| Tuusula | asemakaava-alueet + määräys-PDF, kaavarekisterin kaavayksiköt, osayleiskaavat |
| Vantaa | koko asemakaavahakemisto + määräyslinkit, osa kaavayksiköistä |
| Espoo | asemakaavahakemisto + määräys-PDF (tarkemmat tasot vaativat tunnukset) |
| Kerava, Sipoo, Pirkkala | ei avointa rajapintaa, vain Ryhti |
| Muut kunnat | Ryhti (kattavuus kasvaa kuntien viedessä kaavoja) |

Kaikki kunnat ja niiden Luken kantohinta-alueet ovat taulussa `municipalities`.

## Rajapinnat (Edge Functions)

- `GET /functions/v1/property-summary?kt=837-585-11-181` – kiinteistön kooste (rajat, kuviot, kaavat, kantohinnat). Tulos tallennetaan kantaan ja haetaan uudelleen 30 päivän välein (`&refresh=1` pakottaa). Määräala: `?kt=224-404-1-30-M501`; jos määräalan rajoja ei ole rekisterissä, kooste tulee emokiinteistöltä ja `notes` kertoo sen.
- `GET /functions/v1/property-at?lat=..&lon=..` – kartan klikkaus: pisteessä olevan kiinteistön tunnus, palstan raja (WGS84) ja `owner_info`.
- Kunnan, valtion ja yhtiöiden maat: `owner_info` koosteessa ja kartalla, kiinnostukset estetty. Ks. `docs/omistajatyyppi.md`.
- `GET /functions/v1/mml-tiles/{taso}/{z}/{y}/{x}` – MML:n karttakuvat (taustakartta, selkokartta, ortokuva, maastokartta, kiinteistojaotus, kiinteistotunnukset) ilman että API-avain näkyy selaimelle. Julkinen (ei JWT:tä).
- `POST /functions/v1/sync-stumpage-prices` – päivittää Luken kantohinnat; ajastetaan viikoittain. Hinta-arvio hakee hinnat myös itse, jos kannan hinnat ovat yli 3 viikkoa vanhoja.
- `GET /functions/v1/valuation?kt=...` – hinta-arvio: maan arvo + "Alustava/Vahvistettu puuston arvo", kaavan ja rakennusoikeuden tulkinta.
- `POST /functions/v1/listing-draft` – "Luo alustava myynti-ilmoitus": luonnos ja välittäjätasoinen ilmoitusteksti valmiiksi.

Käyttöliittymän ohjeet: `docs/hinta-arvio-api.md` (hinta-arvio ja ilmoitusgeneraattori).

## Hinta-arvio lyhyesti

| Osa | Laskenta | Koodi |
|---|---|---|
| Puuston arvo | kuvioiden tukki- ja kuitupuu puulajeittain × Luken kantohinta (hakkuutapa kehitysluokan mukaan), taimikoille kustannusarvo | `_shared/valuation/timber.ts` |
| Maan arvo | metsämaa (kasvupaikan mukaan), pelto, muu maa €/ha; kasvukeskusten lähellä sijaintiarvo (raakamaa €/ha, kuntakohtainen); ranta €/rantametri; asemakaavan rakennusoikeus €/k-m²; rakennuspaikat €/kpl | `_shared/valuation/land.ts` |
| Hintalähde | vaihdettava: `LAND_PRICE_SOURCE=reference` (oletus) tai `mml_kauppahinta` (kun lupa on) | `land.ts` |
| Kaava ja rakennusoikeus | kaavamerkinnät selkokielelle, rakennusoikeus kaavasta tai rakennusjärjestyksestä (Espoo: AT/AME) | `_shared/valuation/kaava.ts` |
| Ilmoitusteksti | otsikko, perustiedot, metsä, kaava, hinta, kaupan ehdot, liitteet, tarkistuslista | `_shared/valuation/listing.ts` |

Vahvistettu puuston arvo: myyjä lataa kolmannen osapuolen arvion (`puustoarviot`-bucket), ylläpito
hyväksyy sen `review_timber_verification()`-funktiolla. Myyjän oma hinta: `set_seller_price()`.

## Käyttöönotto Supabaseen

```bash
supabase link --project-ref <projekti>
supabase db push                       # migraatiot
supabase secrets set MML_API_KEY=...   # MML:n API-avain
supabase functions deploy property-summary sync-stumpage-prices valuation listing-draft
```

Viikoittainen kantohintapäivitys (SQL-editorissa, pg_cron + pg_net päälle):

```sql
select cron.schedule('kantohinnat', '0 6 * * 1', $$
  select net.http_post(
    url := 'https://<projekti>.supabase.co/functions/v1/sync-stumpage-prices',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-avain>')
  ) $$);
```

## Testaus paikallisesti

```bash
# Yksikkötestit
deno test supabase/functions/_shared/

# Päästä päähän: PostGIS-kanta + oikeat rajapinnat, testineliö kiinteistön rajana
psql -d mm -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do psql -d mm -f $f; done
DATABASE_URL=postgres://postgres@localhost:5432/mm MML_API_KEY=... deno run -A scripts/smoke-test.ts 837-585-11-181
# ilman avainta: suorakaide rajana
DATABASE_URL=postgres://postgres@localhost:5432/mm deno run -A scripts/smoke-test.ts 837 327000 6815000 400
# hinta-arvio ja ilmoitusluonnos edellisen tuloksesta (suorakaiteen tunnus: kunta + 99999990001)
DATABASE_URL=postgres://postgres@localhost:5432/mm deno run -A scripts/valuation-smoke.ts 83799999990001

# Hinta-arvion tietokantatestit (vaatii myös käyttäjämigraatiot 20261121200*)
supabase/tests/valuation/run.sh
```
