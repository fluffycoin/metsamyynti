-- Metsämyynti: perusskeema
-- Koordinaatisto: ETRS-TM35FIN (EPSG:3067), jota MML, Metsäkeskus ja kunnat käyttävät.
-- Kaikki pinta-alat lasketaan tässä koordinaatistossa (metrit).

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Tyypit
-- ---------------------------------------------------------------------------
create type property_kind as enum ('metsa', 'pelto', 'tontti', 'muu');
create type value_status as enum ('alustava', 'vahvistettu', 'myyjan_oma');
create type listing_status as enum (
  'luonnos',              -- myyjä muokkaa
  'odottaa_hyvaksyntaa',  -- odottaa muiden omistajien hyväksyntää
  'julkaistu',
  'myyty',
  'poistettu'
);
create type plan_level as enum ('asemakaava', 'yleiskaava', 'maakuntakaava');
create type user_kind as enum ('henkilo', 'yritys');

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
-- Käyttäjät
-- ---------------------------------------------------------------------------
-- Tili syntyy Supabase Authiin (sähköposti). Vahva tunnistautuminen on pakollinen
-- vain myyjälle; se täyttää strong_auth_* -kentät.
create table profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  display_name           text,
  kind                   user_kind not null default 'henkilo',
  business_id            text,                     -- Y-tunnus, jos yritys
  email_notifications    boolean not null default false,
  strong_auth_at         timestamptz,              -- viimeisin vahva tunnistautuminen
  -- Henkilötunnusta ei tallenneta selväkielisenä. Tunnisteen HMAC-tiiviste riittää
  -- omistajuuden täsmäytykseen MML:n tietoihin.
  identity_hash          text unique,
  created_at             timestamptz not null default now()
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

-- Omistajuus. owner_id täyttyy, kun omistaja kirjautuu vahvasti ja tunniste täsmää.
create table property_owners (
  property_id        bigint not null references properties(id) on delete cascade,
  identity_hash      text not null,
  owner_id           uuid references profiles(id) on delete set null,
  share_num          integer,
  share_den          integer,
  source             text not null,                 -- 'mml' tai 'testi'
  verified_at        timestamptz not null default now(),
  primary key (property_id, identity_hash)
);
create index property_owners_owner_idx on property_owners (owner_id);

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

-- ---------------------------------------------------------------------------
-- Ilmoitukset
-- ---------------------------------------------------------------------------
create table listings (
  id                 uuid primary key default gen_random_uuid(),
  created_by         uuid not null references profiles(id),
  status             listing_status not null default 'luonnos',
  title              text,
  asking_price_eur   numeric,
  price_source       value_status not null default 'alustava',
  sections           jsonb not null default '{}',   -- generoidut tekstiosiot (kaava, puusto, sijainti ...)
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table listing_properties (
  listing_id         uuid not null references listings(id) on delete cascade,
  property_id        bigint not null references properties(id),
  primary key (listing_id, property_id)
);

-- Jokaisen omistajan hyväksyntä ennen julkaisua (kuolinpesät, yhteisomistus).
create table listing_approvals (
  listing_id         uuid not null references listings(id) on delete cascade,
  owner_id           uuid not null references profiles(id),
  approved_at        timestamptz,
  primary key (listing_id, owner_id)
);

-- ---------------------------------------------------------------------------
-- Kiinnostukset ja notifikaatiot
-- ---------------------------------------------------------------------------
create table interests (
  id                 uuid primary key default gen_random_uuid(),
  property_id        bigint not null references properties(id),
  listing_id         uuid references listings(id),
  from_user          uuid not null references profiles(id),
  message            text check (char_length(message) <= 2000),
  created_at         timestamptz not null default now()
);
create index interests_from_user_idx on interests (from_user, created_at desc);

create table notifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  kind               text not null,                 -- 'kiinnostus', 'hyvaksyntapyynto', ...
  payload            jsonb not null default '{}',
  read_at            timestamptz,
  emailed_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
