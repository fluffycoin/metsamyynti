# API: hinta-arvio ja "Luo alustava myynti-ilmoitus"

Ohje Lovable-käyttöliittymää varten. Kutsut tehdään Supabasen JS-asiakkaalla, kuten
käyttäjäpuolen API:ssa (`docs/kayttajat-api.md`). Edge Functionit kutsutaan
`supabase.functions.invoke(...)`, joka lähettää kirjautuneen käyttäjän tunnisteen mukana.
Virheissä `error.hint` (tai Edge Functionin vastauksen `hint`) on koneluettava koodi ja
`error.message` suomenkielinen teksti, jonka voi näyttää sellaisenaan.

## 1. Hinta-arvio

```ts
const { data } = await supabase.functions.invoke('valuation?kt=858-401-1-10', { method: 'GET' });
```

Vaatii kirjautumisen. Omistajalle arvio huomioi myyjän syötteet (alla) ja tallennetaan.
Muut saavat avoimesta datasta lasketun arvion, jota ei tallenneta.

Vastauksen tärkeimmät kentät:

```jsonc
{
  "property_id": 123, "is_owner": true,
  "display": { "price_eur": 193000, "label": "Hinta-arvio", "price_source": "alustava" },
  //            label: "Hinta-arvio" | "Myyjän hinta-arvio"
  //            price_source: "alustava" | "vahvistettu" | "myyjan_oma"
  "computed_total_eur": 193000,
  "range_eur": { "low": 164000, "high": 222000 },      // ±15 %, vahvistetulla puustolla ±10 %
  "land": {
    "label": "Maan arvo", "value_eur": 12000,
    "parts": [ { "type": "metsamaa", "label": "Metsämaa (maapohja)", "quantity": 17, "unit": "ha",
                 "unit_price_eur": 650, "value_eur": 11050, "basis": "..." } ],
    "comparison": { "eur_ha": 6500, "source": "MML, ...", "year": 2026 }   // alueen metsätilojen keskihinta
  },
  "timber": {
    "label": "Alustava puuston arvo",      // tai "Vahvistettu puuston arvo"
    "status": "alustava",                 // tai "vahvistettu"
    "value_eur": 181000, "computed_value_eur": 181000,
    "volume_m3": 3900, "sawlog_m3": 2150, "pulp_m3": 1460,
    "lines": [ { "assortment": "N2", "name": "Kuusitukki", "m3": 1500, "eur_m3": 75, "value_eur": 112000 } ],
    "price_week": "2026W46", "price_area": "1",
    "verified": null                       // tai { verifier, valued_on, timber_value_eur }
  },
  "kaava": {
    "status": "asemakaava",                // "asemakaava" | "yleiskaava" | "ei_tiedossa"
    "building_right": { "m2": 117, "basis": "...", "building_sites": 0, "residential": true },
    "kaavoitustilanne": "Kiinteistö sijaitsee ...",   // valmis ilmoitusteksti
    "rakennusoikeus": "Rakennusoikeus on noin ...",   // valmis ilmoitusteksti
    "documents": ["https://..."], "checks": ["Tarkista ..."]
  },
  "seller": null,                          // tai { total_eur, note, set_at }
  "notes": ["..."]                         // näytä käyttäjälle, esim. pyyntö ilmoittaa peltoala
}
```

Tallennetun arvion voi lukea myöhemmin ilman uudelleenlaskentaa:
`supabase.rpc('latest_valuation', { p_property_id })` (omistaja, tai kuka tahansa, jos kiinteistö on
julkaistussa ilmoituksessa). Erittely on kentässä `details`.

**Maan arvon osat** (`land.parts[].type`): `metsamaa`, `pelto`, `muu_maa`, `sijaintiarvo`
(kasvukeskusten lähellä: raakamaan hintataso, josta puuston arvo on vähennetty), `ranta`,
`rakennuspaikka`, `rakennusoikeus`. Näytä jokaisesta `label`, `quantity` + `unit`, `unit_price_eur`,
`value_eur` ja pienellä tekstillä `basis` (laskennan peruste ja lähde).

Puuston rivit (`timber.lines`): `name` sisältää hakkuutavan, esim. "Kuusitukki (uudistushakkuu)".
Sama puutavaralaji voi esiintyä kahdesti, koska eri kuviot hinnoitellaan eri hakkuutavan
kantohinnalla (uudistuskypsät uudistushakkuun, kasvatusmetsät harvennuksen hinnalla).

**Merkinnät näkymässä:**
- `timber.label` näytetään sellaisenaan: "Alustava puuston arvo" tai "Vahvistettu puuston arvo".
- Jos `display.label` on "Myyjän hinta-arvio", näytä se pääarvona ja `computed_total_eur` vertailuna
  ("Palvelun laskema arvio").

## 2. Myyjän toiminnot (omistaja, vahvasti tunnistautunut)

| Toiminto | Kutsu |
|---|---|
| Oma hinta-arvio | `rpc('set_seller_price', { p_property_id, p_total_eur, p_land_value_eur?, p_timber_value_eur?, p_note? })` |
| Palaa laskettuun arvioon | `rpc('set_seller_price', { p_property_id, p_total_eur: null })` |
| Peltoala, rakennuspaikat, kaavamerkintä, ranta | `rpc('set_property_land_use', { p_property_id, p_field_ha, p_building_sites, p_designation, p_shore_m })` |
| Vahvistettu puuston arvo | ks. alla |
| Pyydä puustoarvio (toimeksiantopyyntö) | `rpc('request_timber_appraisal', { p_property_id, p_phone?, p_message? })` |

`set_property_land_use`: arvo `null` tarkoittaa "ei tiedossa". `p_shore_m` on rantaviivan pituus
metreinä; ranta lisää arvoa alueen €/rantametri-tason mukaan. Peltoalaa ei saada avoimesta datasta,
joten jos `notes` pyytää sitä, näytä kenttä.

**Kaavamerkintä:** kun `kaava.designation_needed` on `true`, kiinteistö on kaava-alueella, mutta
merkintää ei saatu rajapinnasta (esim. Espoon yleiskaavat, joiden rajapinta vaatii tunnukset).
Näytä silloin omistajalle valinta "Kaavamerkintä kaavakartasta", vaihtoehdot listasta
`kaava.designation_options` (`code` + `name`, esim. "AT – kyläalue"), ja linkki kaava-asiakirjaan
(`kaava.documents[0]`). Tallenna `set_property_land_use({ ..., p_designation: 'AT' })` ja hae arvio
uudelleen. Sen jälkeen `kaava.primary.designation`, `kaava.building_right.m2` ja
`kaava.rakennusoikeus` ovat täytetty, ja `kaava.designation_source` on `"myyja"` (näytä pieni
merkintä "myyjän ilmoittama"). Kaavatiedot-kortissa kannattaa käyttää hinta-arvion `kaava`-osaa,
koska siinä on myyjän valinta ja laskettu rakennusoikeus mukana.

Kaikki virhekoodit: `EI_OMISTAJA`, `VAHVA_TUNNISTUS`, `VIRHEELLINEN_HINTA`, `VIRHEELLINEN_ALA`,
`VAARA_POLKU`, `VANHA_ARVIO`, `PYYNTO_ON_JO`.

### Vahvistettu puuston arvo

1. Lataa kolmannen osapuolen (metsänhoitoyhdistys, metsäpalveluyritys, auktorisoitu
   kiinteistöarvioija) laatima arvio Storageen:
   ```ts
   const path = `${user.id}/${crypto.randomUUID()}.pdf`;
   await supabase.storage.from('puustoarviot').upload(path, file);
   ```
2. Lähetä tarkistettavaksi:
   ```ts
   await supabase.rpc('submit_timber_verification', {
     p_property_id, p_document_path: path, p_verifier: 'Metsänhoitoyhdistys X',
     p_timber_value_eur: 125000, p_valued_on: '2026-09-01',
   });
   ```
   Arvio saa olla enintään 3 vuotta vanha. Tila näkyy taulusta
   `from('timber_verifications').select('*').eq('property_id', id)`:
   `odottaa_tarkistusta` → `hyvaksytty` / `hylatty` (uusi lähetys korvaa vanhan: `korvattu`).
3. Ylläpito tarkistaa dokumentin ja hyväksyy sen (SQL-editorissa service rolella):
   `select review_timber_verification('<id>', true);` tai `false, 'syy'`.
   Omistaja saa ilmoituksen (`puustoarvio_hyvaksytty` / `puustoarvio_hylatty`), ja seuraava
   hinta-arvio näyttää "Vahvistettu puuston arvo".

## 3. "Luo alustava myynti-ilmoitus"

```ts
// Uusi luonnos omasta kiinteistöstä (tai useammasta: property_ids: [1, 2])
const { data, error } = await supabase.functions.invoke('listing-draft', { body: { property_ids: [id] } });
// Päivitä olemassa oleva luonnos (esim. kun myyjä muutti hintaa tai arvio vahvistettiin)
await supabase.functions.invoke('listing-draft', { body: { listing_id } });
```

Ensimmäinen ajo voi kestää minuutin tai pari, koska tiedot haetaan rajapinnoista (MML, Metsäkeskus,
kunnan kaavat). Näytä latausilmaisin. Myöhemmät ajot tulevat välimuistista (30 päivää).

Funktio luo luonnoksen (`create_listing`, vaatii vahvan tunnistautumisen ja omistajuuden), laskee
hinta-arvion ja kirjoittaa ilmoitukseen `title`, `asking_price_eur`, `price_source` ja `sections`.
Myyjä voi muokata luonnosta suoraan (`from('listings').update({ title, asking_price_eur, sections })`).
Uudelleenajo säilyttää myyjän itse muuttaman otsikon ja kaiken kentän `sections.myyja` alla.

`sections` (näytä ilmoitussivulla tässä järjestyksessä):

| Kenttä | Sisältö |
|---|---|
| `title`, `ingressi` | otsikko ja ingressi |
| `perustiedot` | `[{ label, value }]`: kiinteistötunnus, kunta, pinta-ala, metsämaa, puusto, kaavoitus, rakennusoikeus, maan arvo, puuston arvo, hinta-arvio |
| `kuvaus` | yleiskuvaus (kappaleet erotettu `\n\n`) |
| `metsa` | `teksti`, `kehitysluokat` (taulukko), `puulajit` (%), `hakkuumahdollisuudet`; `null`, jos ei metsää |
| `kaava` | `[{ kaavoitustilanne, rakennusoikeus, asiakirjat }]` |
| `hinta` | `teksti`, `merkinta`, `hinta_eur`, `vaihteluvali_eur`, `maan_arvo_eur`, `puuston_arvo_eur`, `puuston_arvo_merkinta`, `price_source` |
| `kaupan_ehdot`, `liitteet` | luettelot |
| `tarkistettavat` | myyjälle näytettävä tarkistuslista (ei julkiseen ilmoitukseen) |
| `taydennettavat` | `[{ key, label, ohje }]`: kentät, jotka myyjä täydentää (kulkuyhteydet, rakennukset, ranta, ...). Tallenna vastaukset `sections.myyja[key]`. |
| `lahteet` | lähdeviitteet (Metsäkeskuksen aineisto vaatii maininnan, CC BY 4.0) |
| `markdown` | koko ilmoitus valmiina Markdownina (esikatselu tai kopiointi) |

Virheet: `KIRJAUDU` (401), `VAHVA_TUNNISTUS`, `EI_OMISTAJA` (403), `ILMOITUS_ON_JO`, `EI_KIINTEISTOJA`,
`VAARA_TILA` (vain luonnoksen voi päivittää).
