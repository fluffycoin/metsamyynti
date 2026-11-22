-- Metsämyynti: hinta-arvio ja myynti-ilmoitusgeneraattori
--
-- Riippuu migraatioista 20261121000* (datataulut) ja 20261121200* (käyttäjät, omistajuus,
-- ilmoitukset). Laskenta tehdään Edge Functioneissa (supabase/functions/_shared/valuation),
-- ja tulos tallennetaan tauluun valuations (method = koko erittely).
--
-- Hinta-arvio = maan arvo + puuston arvo.
--   * Maan arvo: pinta-ala maankäyttölajeittain × alueen hintataso (land_price_reference).
--     MML:n kauppahintarekisteri korvaa taulun, kun käyttölupa on saatu (LAND_PRICE_SOURCE).
--   * Puuston arvo: "Alustava puuston arvo" (Metsäkeskuksen kuviot × Luken kantohinnat) tai
--     "Vahvistettu puuston arvo", kun myyjän lataama kolmannen osapuolen arvio on hyväksytty
--     (timber_verifications).
--   * Myyjä voi asettaa oman hinta-arvionsa (seller_price_estimates); ilmoituksessa se näkyy
--     merkinnällä "Myyjän hinta-arvio" ja laskettu arvio vertailuna.

-- ---------------------------------------------------------------------------
-- Maan hintatasot
-- ---------------------------------------------------------------------------
create table public.land_price_reference (
  id           bigint generated always as identity primary key,
  scope        text not null check (scope in ('kunta', 'maakunta', 'koko_maa')),
  area_key     text not null,            -- kuntanumero, maakunnan nimi (municipalities.region_name) tai 'FI'
  land_use     text not null check (land_use in
                 ('pelto', 'metsamaa_maapohja', 'metsatila_kokonais', 'rakennuspaikka', 'rakennusoikeus_kem2', 'muu_maa')),
  eur          numeric not null check (eur >= 0),
  unit         text not null check (unit in ('eur_ha', 'eur_kpl', 'eur_kem2')),
  year         smallint,
  source       text not null,
  is_estimate  boolean not null default true,
  updated_at   timestamptz not null default now(),
  unique (scope, area_key, land_use)
);
comment on table public.land_price_reference is
  'Maan hintatasot hinta-arviota varten. Tilastoarvot: Luke (pellot 2025), MML:n tiedotteet (metsätilat 2025–2026). is_estimate = arvio, ei tilasto.';

insert into public.land_price_reference (scope, area_key, land_use, eur, unit, year, source, is_estimate) values
  ('maakunta', 'Ahvenanmaa', 'metsatila_kokonais', 4500, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Ahvenanmaa', 'metsamaa_maapohja', 450, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Ahvenanmaa', 'muu_maa', 220, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Etelä-Karjala', 'metsatila_kokonais', 5300, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Etelä-Karjala', 'metsamaa_maapohja', 530, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Etelä-Karjala', 'muu_maa', 260, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Etelä-Pohjanmaa', 'metsatila_kokonais', 4000, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Etelä-Pohjanmaa', 'metsamaa_maapohja', 400, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Etelä-Pohjanmaa', 'muu_maa', 200, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Etelä-Savo', 'metsatila_kokonais', 6600, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('maakunta', 'Etelä-Savo', 'metsamaa_maapohja', 660, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Etelä-Savo', 'muu_maa', 330, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Kainuu', 'metsatila_kokonais', 2800, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Kainuu', 'metsamaa_maapohja', 280, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Kainuu', 'muu_maa', 140, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Kanta-Häme', 'metsatila_kokonais', 6800, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('maakunta', 'Kanta-Häme', 'metsamaa_maapohja', 680, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Kanta-Häme', 'muu_maa', 340, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Keski-Pohjanmaa', 'metsatila_kokonais', 3600, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Keski-Pohjanmaa', 'metsamaa_maapohja', 360, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Keski-Pohjanmaa', 'muu_maa', 180, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Keski-Suomi', 'metsatila_kokonais', 5300, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Keski-Suomi', 'metsamaa_maapohja', 530, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Keski-Suomi', 'muu_maa', 260, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Kymenlaakso', 'metsatila_kokonais', 5500, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Kymenlaakso', 'metsamaa_maapohja', 550, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Kymenlaakso', 'muu_maa', 280, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Lappi', 'metsatila_kokonais', 1700, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('maakunta', 'Lappi', 'metsamaa_maapohja', 170, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Lappi', 'muu_maa', 80, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Pirkanmaa', 'metsatila_kokonais', 6000, 'eur_ha', 2025, 'MML, kauppahintatilasto 2025 (mediaani)', false),
  ('maakunta', 'Pirkanmaa', 'metsamaa_maapohja', 600, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Pirkanmaa', 'muu_maa', 300, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Pohjanmaa', 'metsatila_kokonais', 4000, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Pohjanmaa', 'metsamaa_maapohja', 400, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Pohjanmaa', 'muu_maa', 200, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Pohjois-Karjala', 'metsatila_kokonais', 4600, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Pohjois-Karjala', 'metsamaa_maapohja', 460, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Pohjois-Karjala', 'muu_maa', 230, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Pohjois-Pohjanmaa', 'metsatila_kokonais', 3200, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Pohjois-Pohjanmaa', 'metsamaa_maapohja', 320, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Pohjois-Pohjanmaa', 'muu_maa', 160, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Pohjois-Savo', 'metsatila_kokonais', 5200, 'eur_ha', null, 'arvio', true),
  ('maakunta', 'Pohjois-Savo', 'metsamaa_maapohja', 520, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Pohjois-Savo', 'muu_maa', 260, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Päijät-Häme', 'metsatila_kokonais', 6500, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('maakunta', 'Päijät-Häme', 'metsamaa_maapohja', 650, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Päijät-Häme', 'muu_maa', 320, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Satakunta', 'metsatila_kokonais', 6200, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('maakunta', 'Satakunta', 'metsamaa_maapohja', 620, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Satakunta', 'muu_maa', 310, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Uusimaa', 'metsatila_kokonais', 6500, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('maakunta', 'Uusimaa', 'metsamaa_maapohja', 650, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Uusimaa', 'muu_maa', 320, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Varsinais-Suomi', 'metsatila_kokonais', 6950, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('maakunta', 'Varsinais-Suomi', 'metsamaa_maapohja', 700, 'eur_ha', null, 'arvio: 10 % alueen metsätilojen keskihinnasta', true),
  ('maakunta', 'Varsinais-Suomi', 'muu_maa', 350, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('maakunta', 'Ahvenanmaa', 'pelto', 12914, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Ahvenanmaa', false),
  ('maakunta', 'Etelä-Karjala', 'pelto', 10135, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Etelä-Suomi', false),
  ('maakunta', 'Etelä-Pohjanmaa', 'pelto', 9296, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Länsi-Suomi', false),
  ('maakunta', 'Etelä-Savo', 'pelto', 6013, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Pohjois- ja Itä-Suomi', false),
  ('maakunta', 'Kainuu', 'pelto', 2300, 'eur_ha', 2025, 'MML, kauppahintatilasto 2025 (mediaani), vähän kauppoja', false),
  ('maakunta', 'Kanta-Häme', 'pelto', 10135, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Etelä-Suomi', false),
  ('maakunta', 'Keski-Pohjanmaa', 'pelto', 6013, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Pohjois- ja Itä-Suomi', false),
  ('maakunta', 'Keski-Suomi', 'pelto', 9296, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Länsi-Suomi', false),
  ('maakunta', 'Kymenlaakso', 'pelto', 10135, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Etelä-Suomi', false),
  ('maakunta', 'Lappi', 'pelto', 6013, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Pohjois- ja Itä-Suomi', false),
  ('maakunta', 'Pirkanmaa', 'pelto', 9296, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Länsi-Suomi', false),
  ('maakunta', 'Pohjanmaa', 'pelto', 9296, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Länsi-Suomi', false),
  ('maakunta', 'Pohjois-Karjala', 'pelto', 6013, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Pohjois- ja Itä-Suomi', false),
  ('maakunta', 'Pohjois-Pohjanmaa', 'pelto', 6013, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Pohjois- ja Itä-Suomi', false),
  ('maakunta', 'Pohjois-Savo', 'pelto', 6013, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Pohjois- ja Itä-Suomi', false),
  ('maakunta', 'Päijät-Häme', 'pelto', 10135, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Etelä-Suomi', false),
  ('maakunta', 'Satakunta', 'pelto', 9296, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, Länsi-Suomi', false),
  ('maakunta', 'Uusimaa', 'pelto', 10135, 'eur_ha', 2025, 'arvio (Luke 2025 Etelä-Suomen taso)', true),
  ('maakunta', 'Varsinais-Suomi', 'pelto', 12000, 'eur_ha', 2025, 'MML, kauppahintatilasto 2025 (mediaani)', false),
  ('maakunta', 'Ahvenanmaa', 'rakennuspaikka', 40000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Ahvenanmaa', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Etelä-Karjala', 'rakennuspaikka', 20000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Etelä-Karjala', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Etelä-Pohjanmaa', 'rakennuspaikka', 15000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Etelä-Pohjanmaa', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Etelä-Savo', 'rakennuspaikka', 18000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Etelä-Savo', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Kainuu', 'rakennuspaikka', 12000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Kainuu', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Kanta-Häme', 'rakennuspaikka', 25000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Kanta-Häme', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Keski-Pohjanmaa', 'rakennuspaikka', 15000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Keski-Pohjanmaa', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Keski-Suomi', 'rakennuspaikka', 20000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Keski-Suomi', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Kymenlaakso', 'rakennuspaikka', 20000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Kymenlaakso', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Lappi', 'rakennuspaikka', 12000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Lappi', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Pirkanmaa', 'rakennuspaikka', 35000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Pirkanmaa', 'rakennusoikeus_kem2', 150, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Pohjanmaa', 'rakennuspaikka', 18000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Pohjanmaa', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Pohjois-Karjala', 'rakennuspaikka', 15000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Pohjois-Karjala', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Pohjois-Pohjanmaa', 'rakennuspaikka', 18000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Pohjois-Pohjanmaa', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Pohjois-Savo', 'rakennuspaikka', 18000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Pohjois-Savo', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Päijät-Häme', 'rakennuspaikka', 25000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Päijät-Häme', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Satakunta', 'rakennuspaikka', 20000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Satakunta', 'rakennusoikeus_kem2', 80, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Uusimaa', 'rakennuspaikka', 60000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Uusimaa', 'rakennusoikeus_kem2', 200, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('maakunta', 'Varsinais-Suomi', 'rakennuspaikka', 35000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('maakunta', 'Varsinais-Suomi', 'rakennusoikeus_kem2', 150, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('koko_maa', 'FI', 'metsatila_kokonais', 4520, 'eur_ha', 2026, 'MML, metsätilakaupat 1–9/2026 (keskiarvo, yli 10 ha)', false),
  ('koko_maa', 'FI', 'metsamaa_maapohja', 450, 'eur_ha', null, 'arvio: 10 % metsätilojen keskihinnasta', true),
  ('koko_maa', 'FI', 'muu_maa', 220, 'eur_ha', null, 'arvio: puolet metsämaan maapohjan arvosta', true),
  ('koko_maa', 'FI', 'pelto', 8535, 'eur_ha', 2025, 'Luke, pellon kauppahinnat 2025, koko maa', false),
  ('koko_maa', 'FI', 'rakennuspaikka', 20000, 'eur_kpl', null, 'arvio: haja-asutusalueen omakotirakennuspaikka', true),
  ('koko_maa', 'FI', 'rakennusoikeus_kem2', 100, 'eur_kem2', null, 'arvio: pientalorakennusoikeus', true),
  ('kunta', '049', 'rakennuspaikka', 180000, 'eur_kpl', null, 'arvio: Espoo, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '049', 'rakennusoikeus_kem2', 600, 'eur_kem2', null, 'arvio: Espoo, pientalorakennusoikeus (AO/AP)', true),
  ('kunta', '092', 'rakennuspaikka', 120000, 'eur_kpl', null, 'arvio: Vantaa, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '092', 'rakennusoikeus_kem2', 400, 'eur_kem2', null, 'arvio: Vantaa, pientalorakennusoikeus (AO/AP)', true),
  ('kunta', '245', 'rakennuspaikka', 90000, 'eur_kpl', null, 'arvio: Kerava, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '245', 'rakennusoikeus_kem2', 330, 'eur_kem2', null, 'arvio: Kerava, pientalorakennusoikeus (AO/AP)', true),
  ('kunta', '753', 'rakennuspaikka', 80000, 'eur_kpl', null, 'arvio: Sipoo, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '753', 'rakennusoikeus_kem2', 250, 'eur_kem2', null, 'arvio: Sipoo, pientalorakennusoikeus (AO/AP)', true),
  ('kunta', '858', 'rakennuspaikka', 80000, 'eur_kpl', null, 'arvio: Tuusula, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '858', 'rakennusoikeus_kem2', 250, 'eur_kem2', null, 'arvio: Tuusula, pientalorakennusoikeus (AO/AP)', true),
  ('kunta', '837', 'rakennuspaikka', 70000, 'eur_kpl', null, 'arvio: Tampere, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '837', 'rakennusoikeus_kem2', 300, 'eur_kem2', null, 'arvio: Tampere, pientalorakennusoikeus (AO/AP)', true),
  ('kunta', '604', 'rakennuspaikka', 60000, 'eur_kpl', null, 'arvio: Pirkkala, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '604', 'rakennusoikeus_kem2', 230, 'eur_kem2', null, 'arvio: Pirkkala, pientalorakennusoikeus (AO/AP)', true),
  ('kunta', '853', 'rakennuspaikka', 60000, 'eur_kpl', null, 'arvio: Turku, asemakaavoittamaton omakotirakennuspaikka', true),
  ('kunta', '853', 'rakennusoikeus_kem2', 280, 'eur_kem2', null, 'arvio: Turku, pientalorakennusoikeus (AO/AP)', true);

-- ---------------------------------------------------------------------------
-- Myyjän syötteet
-- ---------------------------------------------------------------------------
-- Tiedot, joita avoimista lähteistä ei saada: peltoala, rakennuspaikkojen määrä ja
-- kaavamerkintä (esim. Espoon yleiskaavan AT), jos kunnan rajapinta ei kerro sitä.
create table public.property_land_use (
  property_id     bigint primary key references public.properties(id) on delete cascade,
  field_ha        numeric check (field_ha >= 0),
  building_sites  smallint check (building_sites >= 0),
  designation     text check (designation ~ '^[A-Za-zÅÄÖåäö]{1,5}([-/ ]?[0-9A-Za-z]{1,4})?$'),
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now()
);

-- Myyjän oma hinta-arvio. Korvaa ilmoituksessa lasketun arvion.
create table public.seller_price_estimates (
  property_id       bigint primary key references public.properties(id) on delete cascade,
  total_eur         numeric not null check (total_eur >= 0),
  land_value_eur    numeric check (land_value_eur >= 0),
  timber_value_eur  numeric check (timber_value_eur >= 0),
  note              text check (char_length(note) <= 1000),
  set_by            uuid not null references public.profiles(id),
  set_at            timestamptz not null default now()
);

-- Vahvistettu puuston arvo: myyjä lataa kolmannen osapuolen (metsäpalveluyritys,
-- metsänhoitoyhdistys, auktorisoitu kiinteistöarvioija) laatiman arvion. Ylläpito tarkistaa.
create type public.verification_status as enum ('odottaa_tarkistusta', 'hyvaksytty', 'hylatty', 'korvattu');

create table public.timber_verifications (
  id                uuid primary key default gen_random_uuid(),
  property_id       bigint not null references public.properties(id) on delete cascade,
  document_path     text not null,          -- Storage: puustoarviot/<user id>/<tiedosto>.pdf
  verifier          text not null check (char_length(verifier) between 2 and 200),
  valued_on         date,
  timber_value_eur  numeric not null check (timber_value_eur >= 0),
  status            public.verification_status not null default 'odottaa_tarkistusta',
  submitted_by      uuid not null references public.profiles(id),
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  review_note       text
);
create index timber_verifications_property_idx on public.timber_verifications (property_id, status);

-- Toimeksiantopyyntö puustoarviosta (välitetään yhteistyökumppanille; ei lähetetä automaattisesti).
create table public.timber_appraisal_requests (
  id            uuid primary key default gen_random_uuid(),
  property_id   bigint not null references public.properties(id) on delete cascade,
  requested_by  uuid not null references public.profiles(id),
  phone         text check (char_length(phone) <= 40),
  message       text check (char_length(message) <= 2000),
  status        text not null default 'uusi' check (status in ('uusi', 'kasittelyssa', 'valmis', 'peruttu')),
  created_at    timestamptz not null default now()
);

alter table public.valuations add column if not exists land_source text;
alter table public.valuations add column if not exists created_by uuid references public.profiles(id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.land_price_reference enable row level security;
alter table public.property_land_use enable row level security;
alter table public.seller_price_estimates enable row level security;
alter table public.timber_verifications enable row level security;
alter table public.timber_appraisal_requests enable row level security;

revoke all on public.land_price_reference, public.property_land_use, public.seller_price_estimates,
  public.timber_verifications, public.timber_appraisal_requests from anon, authenticated;
grant select on public.land_price_reference to anon, authenticated;
grant select on public.property_land_use, public.seller_price_estimates, public.timber_verifications,
  public.timber_appraisal_requests to authenticated;
grant all on public.land_price_reference, public.property_land_use, public.seller_price_estimates,
  public.timber_verifications, public.timber_appraisal_requests to service_role;

create policy land_price_reference_read on public.land_price_reference for select to anon, authenticated using (true);
create policy property_land_use_owner on public.property_land_use for select to authenticated
  using (private.is_owner(property_id));
create policy seller_price_estimates_owner on public.seller_price_estimates for select to authenticated
  using (private.is_owner(property_id));
create policy timber_verifications_owner on public.timber_verifications for select to authenticated
  using (private.is_owner(property_id));
create policy timber_appraisal_requests_owner on public.timber_appraisal_requests for select to authenticated
  using (private.is_owner(property_id));

-- ---------------------------------------------------------------------------
-- Ilmoitustyypit
-- ---------------------------------------------------------------------------
alter type public.notification_kind add value if not exists 'puustoarvio_hyvaksytty';
alter type public.notification_kind add value if not exists 'puustoarvio_hylatty';

-- ---------------------------------------------------------------------------
-- RPC: myyjän toiminnot (omistaja)
-- ---------------------------------------------------------------------------
create function private.require_owner(p_property_id bigint) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_strong_auth(false);
begin
  if not private.is_owner(p_property_id, v_uid) then
    raise exception 'Et ole tämän kiinteistön omistaja' using errcode = '42501', hint = 'EI_OMISTAJA';
  end if;
  return v_uid;
end $$;
revoke all on function private.require_owner(bigint) from public, anon;
grant execute on function private.require_owner(bigint) to authenticated;

-- Peltoala, rakennuspaikat ja kaavamerkintä (null = ei tiedossa, käytetään oletusta).
create function public.set_property_land_use(
  p_property_id bigint, p_field_ha numeric, p_building_sites integer, p_designation text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_owner(p_property_id);
  v_area numeric;
begin
  select area_m2 / 10000.0 into v_area from public.properties where id = p_property_id;
  if p_field_ha is not null and v_area is not null and p_field_ha > v_area * 1.01 then
    raise exception 'Peltoala (% ha) on suurempi kuin kiinteistön pinta-ala (% ha)', p_field_ha, round(v_area, 2)
      using hint = 'VIRHEELLINEN_ALA';
  end if;
  insert into public.property_land_use (property_id, field_ha, building_sites, designation, updated_by)
  values (p_property_id, p_field_ha, p_building_sites, upper(nullif(btrim(p_designation), '')), v_uid)
  on conflict (property_id) do update
    set field_ha = excluded.field_ha, building_sites = excluded.building_sites, designation = excluded.designation,
        updated_by = v_uid, updated_at = now();
end $$;

-- Myyjän oma hinta-arvio. p_total_eur = null poistaa sen (palataan laskettuun arvioon).
create function public.set_seller_price(
  p_property_id bigint, p_total_eur numeric,
  p_land_value_eur numeric default null, p_timber_value_eur numeric default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_owner(p_property_id);
begin
  if p_total_eur is null then
    delete from public.seller_price_estimates where property_id = p_property_id;
    return;
  end if;
  if p_total_eur < 0 or p_total_eur > 1e9 then
    raise exception 'Virheellinen hinta' using hint = 'VIRHEELLINEN_HINTA';
  end if;
  insert into public.seller_price_estimates (property_id, total_eur, land_value_eur, timber_value_eur, note, set_by)
  values (p_property_id, round(p_total_eur), round(p_land_value_eur), round(p_timber_value_eur), nullif(btrim(p_note), ''), v_uid)
  on conflict (property_id) do update
    set total_eur = excluded.total_eur, land_value_eur = excluded.land_value_eur,
        timber_value_eur = excluded.timber_value_eur, note = excluded.note,
        set_by = v_uid, set_at = now();
end $$;

-- Lähetä vahvistettu puustoarvio tarkistettavaksi. Tiedosto ladataan ensin Storageen
-- bucketiin 'puustoarviot' polkuun <oma user id>/<tiedosto>.
create function public.submit_timber_verification(
  p_property_id bigint, p_document_path text, p_verifier text, p_timber_value_eur numeric, p_valued_on date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_owner(p_property_id);
  v_id uuid;
begin
  if p_document_path is null or p_document_path not like v_uid::text || '/%' then
    raise exception 'Arviodokumentin tiedostopolku on virheellinen' using hint = 'VAARA_POLKU';
  end if;
  if p_valued_on is not null and (p_valued_on > current_date or p_valued_on < current_date - interval '3 years') then
    raise exception 'Arvion päiväys on liian vanha tai tulevaisuudessa (enintään 3 vuotta vanha)' using hint = 'VANHA_ARVIO';
  end if;
  if p_timber_value_eur is null or p_timber_value_eur < 0 then
    raise exception 'Anna arvion mukainen puuston arvo' using hint = 'VIRHEELLINEN_HINTA';
  end if;
  -- Aiempi tarkistusta odottava korvataan uudella.
  update public.timber_verifications set status = 'korvattu'
  where property_id = p_property_id and status = 'odottaa_tarkistusta';
  insert into public.timber_verifications (property_id, document_path, verifier, valued_on, timber_value_eur, submitted_by)
  values (p_property_id, p_document_path, btrim(p_verifier), p_valued_on, round(p_timber_value_eur), v_uid)
  returning id into v_id;
  return v_id;
end $$;

create function public.request_timber_appraisal(p_property_id bigint, p_phone text default null, p_message text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_owner(p_property_id);
  v_id uuid;
begin
  if exists (select 1 from public.timber_appraisal_requests
             where property_id = p_property_id and status in ('uusi', 'kasittelyssa')) then
    raise exception 'Kiinteistöllä on jo avoin arviopyyntö' using hint = 'PYYNTO_ON_JO';
  end if;
  insert into public.timber_appraisal_requests (property_id, requested_by, phone, message)
  values (p_property_id, v_uid, nullif(btrim(p_phone), ''), nullif(btrim(p_message), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.set_property_land_use(bigint, numeric, integer, text),
  public.set_seller_price(bigint, numeric, numeric, numeric, text),
  public.submit_timber_verification(bigint, text, text, numeric, date),
  public.request_timber_appraisal(bigint, text, text) from public, anon;
grant execute on function public.set_property_land_use(bigint, numeric, integer, text),
  public.set_seller_price(bigint, numeric, numeric, numeric, text),
  public.submit_timber_verification(bigint, text, text, numeric, date),
  public.request_timber_appraisal(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: ylläpito (vain service_role, esim. SQL-editori tai ylläpidon funktio)
-- ---------------------------------------------------------------------------
create function public.review_timber_verification(p_id uuid, p_approve boolean, p_note text default null)
returns public.verification_status
language plpgsql security definer set search_path = '' as $$
declare
  v public.timber_verifications;
  r record;
begin
  select * into v from public.timber_verifications where id = p_id and status = 'odottaa_tarkistusta' for update;
  if not found then raise exception 'Arviota ei löydy tai se on jo käsitelty' using hint = 'VAARA_TILA'; end if;
  if p_approve then
    update public.timber_verifications set status = 'korvattu'
    where property_id = v.property_id and status = 'hyvaksytty';
  end if;
  update public.timber_verifications
  set status = case when p_approve then 'hyvaksytty'::public.verification_status else 'hylatty' end,
      reviewed_at = now(), review_note = p_note
  where id = p_id;

  for r in select distinct p.id from public.property_owners po
           join public.profiles p on p.identity_hash = po.identity_hash
           where po.property_id = v.property_id and not po.is_estate loop
    perform private.notify(r.id,
      (case when p_approve then 'puustoarvio_hyvaksytty' else 'puustoarvio_hylatty' end)::public.notification_kind,
      case when p_approve then 'Puuston arvo vahvistettu' else 'Puustoarviota ei hyväksytty' end,
      case when p_approve
        then 'Ilmoituksessa näkyy nyt "Vahvistettu puuston arvo". Päivitä ilmoitusluonnos, niin hinta-arvio päivittyy.'
        else coalesce('Syy: ' || p_note, 'Tarkista arviodokumentti ja lähetä uudelleen.') end,
      jsonb_build_object('property_id', v.property_id, 'verification_id', p_id), 'listing_events');
  end loop;
  return (select status from public.timber_verifications where id = p_id);
end $$;
revoke all on function public.review_timber_verification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_timber_verification(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Hinta-arvion syötteet palvelimelle (yksi kutsu)
-- ---------------------------------------------------------------------------
create function private.valuation_inputs(p_property_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'land_use', (select jsonb_build_object('field_ha', field_ha, 'building_sites', building_sites, 'designation', designation)
                 from public.property_land_use where property_id = p_property_id),
    'seller', (select jsonb_build_object('total_eur', total_eur, 'land_value_eur', land_value_eur,
                 'timber_value_eur', timber_value_eur, 'note', note, 'set_at', set_at)
               from public.seller_price_estimates where property_id = p_property_id),
    'verified', (select jsonb_build_object('timber_value_eur', timber_value_eur, 'verifier', verifier,
                   'valued_on', valued_on, 'document_path', document_path)
                 from public.timber_verifications
                 where property_id = p_property_id and status = 'hyvaksytty'
                 order by reviewed_at desc limit 1)
  )
$$;
revoke all on function private.valuation_inputs(bigint) from public, anon, authenticated;
grant execute on function private.valuation_inputs(bigint) to service_role;
-- PostgREST näkee vain public-skeeman: kääre palvelimelle.
create function public.valuation_inputs(p_property_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.valuation_inputs(p_property_id) $$;
revoke all on function public.valuation_inputs(bigint) from public, anon, authenticated;
grant execute on function public.valuation_inputs(bigint) to service_role;

-- Uusin hinta-arvio (RLS: omistaja tai julkaistu ilmoitus). Käyttöliittymä lukee tätä.
create function public.latest_valuation(p_property_id bigint) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(v) - 'method' || jsonb_build_object('details', v.method)
  from public.valuations v where v.property_id = p_property_id
  order by v.computed_at desc limit 1
$$;
grant execute on function public.latest_valuation(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- property_summary: lisätään maakunta ja kaava-alueen koko (rakennusoikeuden suhteutus)
-- ---------------------------------------------------------------------------
create or replace function public.property_summary(p_kiinteistotunnus text, p_maarala_no text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  with pr as (
    select p.*, m.name as municipality_name, m.region_name, m.luke_price_area, m.zoning_pilot
    from properties p
    left join municipalities m on m.code = p.municipality_code
    where p.kiinteistotunnus = p_kiinteistotunnus
      and p.maarala_no is not distinct from p_maarala_no
  ),
  stands as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'stand_key', s.stand_key,
      'area_ha', round(s.area_ha::numeric, 2),
      'development_class', s.development_class,
      'main_species', s.main_species,
      'mean_age', s.mean_age,
      'volume_m3_ha', s.volume_m3_ha,
      'sawlog_m3_ha', s.sawlog_m3_ha,
      'pulp_m3_ha', s.pulp_m3_ha,
      'prop_pine', s.prop_pine,
      'prop_spruce', s.prop_spruce,
      'prop_other', s.prop_other,
      'fertility_class', s.fertility_class,
      'cutting_type', s.cutting_type,
      'cutting_year', s.cutting_year,
      'measured_at', s.measured_at
    ) order by s.area_ha desc), '[]'::jsonb) as list,
    coalesce(sum(s.area_ha), 0) as forest_ha,
    coalesce(sum(s.area_ha * s.volume_m3_ha), 0) as volume_m3
    from forest_stands s join pr on pr.id = s.property_id
  ),
  zoning as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'level', z.level,
      'plan_name', z.plan_name,
      'plan_id', z.plan_id,
      'approved_on', z.approved_on,
      'designation', z.designation,
      'efficiency', z.efficiency,
      'building_right_m2', z.building_right_m2,
      'regulations', z.regulations,
      'overlap_m2', round(st_area(st_intersection(z.geom, pr.geom))::numeric),
      'zone_area_m2', round(st_area(z.geom)::numeric),
      'source_layer', z.source_layer
    ) order by z.level, st_area(st_intersection(z.geom, pr.geom)) desc), '[]'::jsonb) as list
    from zoning_areas z join pr on st_intersects(z.geom, pr.geom)
    where st_area(st_intersection(z.geom, pr.geom)) >= 1
  ),
  prices as (
    select jsonb_object_agg(sp.cutting_method || ':' || sp.assortment, sp.eur_m3) as map,
           max(sp.week) as week
    from stumpage_prices sp, pr
    where sp.price_area = pr.luke_price_area
      and sp.week = (select max(week) from stumpage_prices where price_area = pr.luke_price_area)
  )
  select case when not exists (select 1 from pr) then null else jsonb_build_object(
    'property_id', pr.id,
    'kiinteistotunnus', pr.kiinteistotunnus,
    'display_id', pr.display_id,
    'name', pr.name,
    'municipality', jsonb_build_object('code', pr.municipality_code, 'name', pr.municipality_name,
                                       'region_name', pr.region_name,
                                       'zoning_pilot', coalesce(pr.zoning_pilot, false)),
    'kind', pr.kind,
    'is_maarala', pr.is_maarala,
    'maarala_no', pr.maarala_no,
    'area_ha', round((coalesce(pr.area_m2, 0) / 10000.0)::numeric, 3),
    'center', case when pr.centroid_wgs84 is null then null
                   else jsonb_build_object('lat', st_y(pr.centroid_wgs84), 'lon', st_x(pr.centroid_wgs84)) end,
    'geometry', st_asgeojson(st_transform(pr.geom, 4326), 6)::jsonb,
    'forest', jsonb_build_object(
      'forest_ha', round(stands.forest_ha::numeric, 2),
      'total_volume_m3', round(stands.volume_m3::numeric),
      'stands', stands.list
    ),
    'zoning', zoning.list,
    'stumpage_prices', jsonb_build_object('price_area', pr.luke_price_area,
                                          'week', prices.week, 'eur_m3', prices.map),
    'fetched_at', pr.fetched_at
  ) end
  from pr, stands, zoning, prices;
$$;

-- ---------------------------------------------------------------------------
-- Storage: yksityinen bucket vahvistetuille puustoarvioille
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public) values ('puustoarviot', 'puustoarviot', false)
    on conflict (id) do nothing;
    execute $p$
      create policy puustoarviot_upload_own on storage.objects for insert to authenticated
      with check (bucket_id = 'puustoarviot' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy puustoarviot_read_own on storage.objects for select to authenticated
      using (bucket_id = 'puustoarviot' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end $$;
