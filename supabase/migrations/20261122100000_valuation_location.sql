-- Hinta-arvio, korjaukset 22.11.2026 (Eetun palaute: Espoo, Bodominjärvi):
--  1. Maan arvo riippuu sijainnista: kasvukeskusten läheisyydessä maa on raakamaata, jonka hinta
--     (€/ha, puusto mukaan lukien) on moninkertainen metsämaahan verrattuna. Uusi maankäyttölaji
--     'raakamaa' kuntatasolla. Kaava, joka estää rakentamisen (virkistys, suojelu), pienentää arvoa.
--     Tasot ovat arvioita: Peltola, Maankäyttö 2/2005 (Uusimaa 1985–2004: raakamaa keskimäärin 1,3 €/m²,
--     Espoo/Vantaa 3,4–4,2 €/m², maa- ja metsätalousmaa 0,3 €/m², vuoden 2000 rahassa; raakamaa 5–8 %
--     tonttihinnasta) ja Espoon tonttien keskihinta 234 €/m² (MML 2025, kodinhinta.fi). Korvataan
--     MML:n kauppahintarekisterin kunnittaisilla raakamaakaupoilla, kun käyttölupa on saatu.
--  2. Ranta: myyjä ilmoittaa rantaviivan pituuden (property_land_use.shore_m), lisäarvo €/rantametri
--     (maankäyttölaji 'ranta_m').
--  3. Kantohinnat: property_summary käyttää jokaiselle puutavaralajille uusinta saatavilla olevaa
--     hintaa (12 viikon sisältä), ei pelkkää uusinta viikkoa, jossa osa hinnoista voi puuttua.

alter table public.land_price_reference drop constraint if exists land_price_reference_land_use_check;
alter table public.land_price_reference add constraint land_price_reference_land_use_check check (land_use in
  ('pelto', 'metsamaa_maapohja', 'metsatila_kokonais', 'rakennuspaikka', 'rakennusoikeus_kem2', 'muu_maa', 'raakamaa', 'ranta_m'));
alter table public.land_price_reference drop constraint if exists land_price_reference_unit_check;
alter table public.land_price_reference add constraint land_price_reference_unit_check check (unit in ('eur_ha', 'eur_kpl', 'eur_kem2', 'eur_m'));

insert into public.land_price_reference (scope, area_key, land_use, eur, unit, year, source, is_estimate) values
  ('kunta', '091', 'raakamaa', 50000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Helsinki', true),
  ('kunta', '049', 'raakamaa', 30000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Espoo', true),
  ('kunta', '092', 'raakamaa', 25000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Vantaa', true),
  ('kunta', '235', 'raakamaa', 40000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Kauniainen', true),
  ('kunta', '245', 'raakamaa', 20000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Kerava', true),
  ('kunta', '186', 'raakamaa', 18000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Järvenpää', true),
  ('kunta', '257', 'raakamaa', 14000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Kirkkonummi', true),
  ('kunta', '753', 'raakamaa', 14000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Sipoo', true),
  ('kunta', '858', 'raakamaa', 14000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Tuusula', true),
  ('kunta', '543', 'raakamaa', 12000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Nurmijärvi', true),
  ('kunta', '927', 'raakamaa', 10000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Vihti', true),
  ('kunta', '755', 'raakamaa', 9000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Siuntio', true),
  ('kunta', '638', 'raakamaa', 9000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Porvoo', true),
  ('kunta', '106', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Hyvinkää', true),
  ('kunta', '444', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Lohja', true),
  ('kunta', '505', 'raakamaa', 7000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Mäntsälä', true),
  ('kunta', '611', 'raakamaa', 7000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Pornainen', true),
  ('kunta', '837', 'raakamaa', 15000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Tampere', true),
  ('kunta', '604', 'raakamaa', 12000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Pirkkala', true),
  ('kunta', '211', 'raakamaa', 9000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Kangasala', true),
  ('kunta', '418', 'raakamaa', 9000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Lempäälä', true),
  ('kunta', '536', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Nokia', true),
  ('kunta', '980', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Ylöjärvi', true),
  ('kunta', '853', 'raakamaa', 14000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Turku', true),
  ('kunta', '202', 'raakamaa', 10000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Kaarina', true),
  ('kunta', '680', 'raakamaa', 10000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Raisio', true),
  ('kunta', '529', 'raakamaa', 9000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Naantali', true),
  ('kunta', '423', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Lieto', true),
  ('kunta', '564', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Oulu', true),
  ('kunta', '179', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Jyväskylä', true),
  ('kunta', '297', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Kuopio', true),
  ('kunta', '398', 'raakamaa', 8000, 'eur_ha', null, 'arvio: raakamaa kasvukeskuksen lähellä, Lahti', true),
  ('maakunta', 'Uusimaa', 'ranta_m', 400, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Varsinais-Suomi', 'ranta_m', 300, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Pirkanmaa', 'ranta_m', 300, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Ahvenanmaa', 'ranta_m', 300, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Kanta-Häme', 'ranta_m', 250, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Päijät-Häme', 'ranta_m', 250, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Kymenlaakso', 'ranta_m', 200, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Etelä-Karjala', 'ranta_m', 200, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Etelä-Savo', 'ranta_m', 200, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Satakunta', 'ranta_m', 200, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Keski-Suomi', 'ranta_m', 150, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Pohjois-Savo', 'ranta_m', 150, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Pohjois-Karjala', 'ranta_m', 150, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Etelä-Pohjanmaa', 'ranta_m', 120, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Pohjanmaa', 'ranta_m', 120, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Keski-Pohjanmaa', 'ranta_m', 120, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Pohjois-Pohjanmaa', 'ranta_m', 100, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Kainuu', 'ranta_m', 100, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('maakunta', 'Lappi', 'ranta_m', 100, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Etuovi 2026: rantamökkien hinnat maakunnittain)', true),
  ('kunta', '091', 'ranta_m', 800, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Helsinki)', true),
  ('kunta', '049', 'ranta_m', 700, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Espoo)', true),
  ('kunta', '092', 'ranta_m', 600, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Vantaa)', true),
  ('kunta', '235', 'ranta_m', 700, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Kauniainen)', true),
  ('kunta', '257', 'ranta_m', 500, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Kirkkonummi)', true),
  ('kunta', '753', 'ranta_m', 500, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Sipoo)', true),
  ('kunta', '858', 'ranta_m', 450, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Tuusula)', true),
  ('kunta', '245', 'ranta_m', 450, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo (Kerava)', true),
  ('koko_maa', 'FI', 'ranta_m', 150, 'eur_m', null, 'arvio: rakentamattoman rannan lisäarvo', true)
 on conflict (scope, area_key, land_use) do update
  set eur = excluded.eur, unit = excluded.unit, source = excluded.source, is_estimate = excluded.is_estimate, updated_at = now();

-- Metsätilojen keskihinnat vertailuun: Metsätilat.fi:n kaupat 16.1.2025–16.1.2026, missä MML:n lukua ei ollut.
update public.land_price_reference r set eur = v.eur, year = 2025, source = 'Metsätilat.fi, kaupat 2025 (keskihinta)', is_estimate = false
from (values ('Pirkanmaa', 7240), ('Kymenlaakso', 5911), ('Pohjois-Pohjanmaa', 2661), ('Kainuu', 3143)) v(area, eur)
where r.scope = 'maakunta' and r.area_key = v.area and r.land_use = 'metsatila_kokonais';

-- ---------------------------------------------------------------------------
-- Ranta
-- ---------------------------------------------------------------------------
alter table public.property_land_use add column if not exists shore_m numeric check (shore_m >= 0 and shore_m <= 100000);

drop function if exists public.set_property_land_use(bigint, numeric, integer, text);
create function public.set_property_land_use(
  p_property_id bigint, p_field_ha numeric, p_building_sites integer,
  p_designation text default null, p_shore_m numeric default null
) returns void
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
  if p_shore_m is not null and (p_shore_m < 0 or p_shore_m > 100000) then
    raise exception 'Virheellinen rantaviivan pituus' using hint = 'VIRHEELLINEN_ALA';
  end if;
  insert into public.property_land_use (property_id, field_ha, building_sites, designation, shore_m, updated_by)
  values (p_property_id, p_field_ha, p_building_sites, upper(nullif(btrim(p_designation), '')), p_shore_m, v_uid)
  on conflict (property_id) do update
    set field_ha = excluded.field_ha, building_sites = excluded.building_sites, designation = excluded.designation,
        shore_m = excluded.shore_m, updated_by = v_uid, updated_at = now();
end $$;
revoke all on function public.set_property_land_use(bigint, numeric, integer, text, numeric) from public, anon;
grant execute on function public.set_property_land_use(bigint, numeric, integer, text, numeric) to authenticated;

create or replace function private.valuation_inputs(p_property_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'land_use', (select jsonb_build_object('field_ha', field_ha, 'building_sites', building_sites,
                   'designation', designation, 'shore_m', shore_m)
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

-- ---------------------------------------------------------------------------
-- property_summary: kantohinnat puutavaralajeittain uusimmasta saatavilla olevasta viikosta
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
    -- Uusin saatavilla oleva hinta jokaiselle hakkuutavalle ja puutavaralajille 12 viimeisimmän
    -- viikon ajalta (uusimmalta viikolta voi puuttua osa hinnoista).
    select jsonb_object_agg(l.cutting_method || ':' || l.assortment, l.eur_m3) as map,
           max(l.week) as week
    from (
      select distinct on (sp.cutting_method, sp.assortment) sp.cutting_method, sp.assortment, sp.eur_m3, sp.week
      from stumpage_prices sp, pr
      where sp.price_area = pr.luke_price_area and sp.eur_m3 is not null
        and sp.week in (select distinct week from stumpage_prices where price_area = pr.luke_price_area
                        order by week desc limit 12)
      order by sp.cutting_method, sp.assortment, sp.week desc
    ) l
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

