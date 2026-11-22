# Kunnan, valtion ja yhtiöiden maat

Iso osa Suomen metsistä on kuntien, valtion (Metsähallitus), seurakuntien ja metsäyhtiöiden
(UPM, Stora Enso, Metsä Group, Tornator...) omistuksessa. Näitä ei myydä palvelun kautta, joten
palvelu merkitsee ne ja estää turhat "Olen kiinnostunut" -viestit.

## Mitä käyttöliittymä saa

`property-summary` ja `rpc('property_summary')` palauttavat kentän `owner_info`, ja
`property-at` (kartan klikkaus) samoin. Erikseen: `rpc('property_owner_info', { p_property_id })`.

```json
"owner_info": {
  "category": "kunta",                 // kunta | valtio | seurakunta | yhtio | yhdistys | yhteisalue
  "label": "Kunnan tai kaupungin maa", // näytettävä merkintä
  "owner_name": "Espoon kaupunki",     // voi olla null
  "source": "espoo_wms",               // mistä tieto tuli
  "share": 0.93,                       // osuus kiinteistön alasta (voi olla null)
  "accepts_interest": false,           // true vain, jos kohteella on julkaistu myynti-ilmoitus
  "note": "Kiinteistö on kunnan tai kaupungin omistuksessa. ..."  // selitys ostajalle
}
```

`owner_info: null` = tavallinen (yksityinen tai tuntematon) omistaja.

Jos `accepts_interest` on false, `express_interest` palauttaa virheen, jonka hint on
`EI_YKSITYINEN_MAA` ja viesti sama kuin `note`.

## Mistä tieto tulee

| Järjestys | Lähde | Kattavuus |
|---|---|---|
| 1 | Ylläpidon korjaus `set_land_owner()` ja tuodut kiinteistölistat (`land_owner_parcels`) | mitä tuodaan |
| 2 | Lainhuudon omistajien nimet (`property_owners`, kun MML:n lupa on) | kun kaikki omistajat ovat esim. yhtiö tai seurakunta (`owner_name_patterns`) |
| 3 | Kiinteistötunnus | koko Suomi: sijaintialue 893 = valtion metsämaa, 876 = yhteinen alue, ryhmä 9900–9999 = asemakaavan yleinen alue (katu, puisto) |
| 4 | Espoon kaupungin maanomistuskartta (avoin WMS) | Espoo, tarkistetaan kiinteistöä haettaessa |
| 5 | Tuodut aluerajaukset (`land_owner_areas`) | mitä tuodaan; merkitään, jos vähintään puolet kiinteistöstä |

Helsinki, Vantaa, Tampere ja Turku eivät julkaise maanomistusta avoimena rajapintana. Yhtiöiden
maille ei ole avointa lähdettä; ne tulevat MML:n lainhuutotiedoista, kun käyttölupa on saatu, tai
tuotuina listoina.

## Ylläpito (Supabase → SQL Editor)

```sql
select set_land_owner('49-401-1-1', 'kunta', 'Espoon kaupunki');   -- merkitse
select set_land_owner('49-401-1-1', 'yksityinen');                 -- väärä merkintä pois
select set_land_owner('49-401-1-1', null);                         -- takaisin automaattiseen
```

## Aineiston tuonti

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run -A scripts/import-maanomistus.ts alueet --source=vantaa --category=kunta --owner="Vantaan kaupunki" vantaa.geojson
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  deno run -A scripts/import-maanomistus.ts lista --source=metsahaku omistajat.csv   # tunnus;category;nimi
```
