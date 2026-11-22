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
| Kauppahinnat | MML kauppahintarekisteri | **käyttölupa**, maksullinen |

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
- `POST /functions/v1/sync-stumpage-prices` – päivittää Luken kantohinnat; ajastetaan viikoittain.

## Käyttöönotto Supabaseen

```bash
supabase link --project-ref <projekti>
supabase db push                       # migraatiot
supabase secrets set MML_API_KEY=...   # MML:n API-avain
supabase functions deploy property-summary sync-stumpage-prices
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
```
