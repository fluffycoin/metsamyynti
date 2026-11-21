-- Metsämyynti: perusskeema
-- Koordinaatisto: ETRS-TM35FIN (EPSG:3067), jota MML, Metsäkeskus ja kunnat käyttävät.
-- Kaikki pinta-alat lasketaan tässä koordinaatistossa (metrit).

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Tyypit
-- ---------------------------------------------------------------------------
create type property_kind as enum ('metsa', 'pelto', 'tontti', 'muu');
create type value_status as enum ('alustava', 'vahvistettu', 'myyjan_oma');
create type plan_level as enum ('asemakaava', 'yleiskaava', 'maakuntakaava');

-- ---------------------------------------------------------------------------
-- Kunnat ja hinta-alueet
-- ---------------------------------------------------------------------------
create table municipalities (
  code              char(3) primary key,          -- kuntanumero, esim. '049' Espoo
  name              text not null,
  region_name       text,                          -- maakunta
  luke_price_area   text not null default '9',     -- Luken kantohinta-alue (9 = koko maa)
  zoning_pilot      boolean not null default false -- haetaanko kaavatiedot automaattisesti
);

-- ---------------------------------------------------------------------------
-- Kiinteistöt
-- ---------------------------------------------------------------------------
create table properties (
  id                 bigint generated always as identity primary key,
  -- Kiinteistötunnus 14-numeroisena (esim. 04940100010001); esitysmuoto lasketaan.
  kiinteistotunnus   char(14) not null unique,
  display_id         text generated always as (
                       ltrim(substr(kiinteistotunnus, 1, 3), '0') || '-' ||
                       ltrim(substr(kiinteistotunnus, 4, 3), '0') || '-' ||
                       ltrim(substr(kiinteistotunnus, 7, 4), '0') || '-' ||
                       ltrim(substr(kiinteistotunnus, 11, 4), '0')
                     ) stored,
  municipality_code  char(3) not null,
  name               text,                          -- kiinteistön nimi, esim. 'Mäkelä'
  kind               property_kind not null default 'muu',
  is_maarala         boolean not null default false,
  geom               geometry(MultiPolygon, 3067),
  area_m2            double precision generated always as (st_area(geom)) stored,
  centroid_wgs84     geometry(Point, 4326) generated always as (
                       st_transform(st_pointonsurface(geom), 4326)
                     ) stored,
  source             text not null default 'mml',
  fetched_at         timestamptz
);
create index properties_geom_idx on properties using gist (geom);
create index properties_municipality_idx on properties (municipality_code);

-- ---------------------------------------------------------------------------
-- Metsävaratiedot (Metsäkeskuksen avoin kuviotieto, leikattuna kiinteistölle)
-- ---------------------------------------------------------------------------
create table forest_stands (
  property_id        bigint not null references properties(id) on delete cascade,
  stand_key          text not null,                 -- Metsäkeskuksen kohde-id, esim. 'stand.39625808'
  geom               geometry(MultiPolygon, 3067) not null,   -- leikattu kiinteistön rajoilla
  area_ha            double precision not null,
  development_class  text,
  main_species       smallint,                      -- 1 mänty, 2 kuusi, 3..: lehtipuut
  mean_age           numeric,
  volume_m3_ha       numeric,
  sawlog_m3_ha       numeric,
  pulp_m3_ha         numeric,
  prop_pine          numeric,
  prop_spruce        numeric,
  prop_other         numeric,
  fertility_class    smallint,
  cutting_type       smallint,
  cutting_year       smallint,
  measured_at        date,
  raw                jsonb not null,                -- kaikki lähdekentät
  fetched_at         timestamptz not null default now(),
  primary key (property_id, stand_key)
);
create index forest_stands_geom_idx on forest_stands using gist (geom);

-- ---------------------------------------------------------------------------
-- Kantohinnat (Luke, viikoittain)
-- ---------------------------------------------------------------------------
create table stumpage_prices (
  week               text not null,                 -- '2026W46'
  price_area         text not null,                 -- Luken hinta-aluekoodi
  cutting_method     text not null,                 -- '8021' uudistus, '8023' harvennus, '8022' ensiharvennus
  assortment         text not null,                 -- 'N1' mäntytukki ... 'N8'
  eur_m3             numeric,
  primary key (week, price_area, cutting_method, assortment)
);

-- ---------------------------------------------------------------------------
-- Kaavat (välimuisti: haetaan kunnilta kerran, käytetään monelle kiinteistölle)
-- ---------------------------------------------------------------------------
create table zoning_areas (
  id                 bigint generated always as identity primary key,
  municipality_code  char(3) not null,
  level              plan_level not null,
  source_layer       text not null,                 -- esim. 'akaava:Kortteli'
  source_id          text not null,
  plan_name          text,
  plan_id            text,
  approved_on        date,
  designation        text,                          -- käyttötarkoitus, esim. 'AT', 'AO', 'M'
  efficiency         numeric,                       -- tehokkuusluku e
  building_right_m2  numeric,                       -- rakennusoikeus kerros-m²
  regulations        text,                          -- kaavamääräykset tekstinä
  geom               geometry(MultiPolygon, 3067) not null,
  raw                jsonb not null,
  fetched_at         timestamptz not null default now(),
  unique (municipality_code, source_layer, source_id)
);
create index zoning_areas_geom_idx on zoning_areas using gist (geom);

-- ---------------------------------------------------------------------------
-- Arviot
-- ---------------------------------------------------------------------------
create table valuations (
  id                 bigint generated always as identity primary key,
  property_id        bigint not null references properties(id) on delete cascade,
  land_value_eur     numeric,
  timber_value_eur   numeric,
  timber_status      value_status not null default 'alustava',
  total_value_eur    numeric generated always as (coalesce(land_value_eur, 0) + coalesce(timber_value_eur, 0)) stored,
  verified_doc_path  text,                          -- Storage-polku vahvistettuun puustoarvioon
  verified_by        text,                          -- arvion laatija (yritys)
  method             jsonb not null default '{}',   -- laskennan erittely
  computed_at        timestamptz not null default now()
);
create index valuations_property_idx on valuations (property_id, computed_at desc);

-- Käyttäjät, omistajuus, ilmoitukset, kiinnostukset ja notifikaatiot ovat
-- migraatioissa 20261121200000_users_* (viittaavat properties(id bigint)).
