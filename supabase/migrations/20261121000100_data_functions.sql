-- Datahakujen tallennusfunktiot. Edge Functionit kutsuvat näitä service rolella.

-- Tallentaa kiinteistön rajat (GeoJSON-geometria EPSG:3067).
create or replace function upsert_property(
  p_kiinteistotunnus text,
  p_geojson          jsonb,
  p_name             text default null,
  p_is_maarala       boolean default false
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  insert into properties (kiinteistotunnus, municipality_code, name, is_maarala, geom, fetched_at)
  values (
    p_kiinteistotunnus,
    substr(p_kiinteistotunnus, 1, 3),
    p_name,
    p_is_maarala,
    st_multi(st_makevalid(st_setsrid(st_geomfromgeojson(p_geojson::text), 3067)))::geometry(MultiPolygon, 3067),
    now()
  )
  on conflict (kiinteistotunnus) do update
    set geom = excluded.geom,
        name = coalesce(excluded.name, properties.name),
        fetched_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Tallentaa Metsäkeskuksen kuviot leikattuna kiinteistön rajoilla.
-- p_features: GeoJSON FeatureCollectionin features-taulukko (EPSG:3067).
-- Palauttaa tallennettujen kuvioiden määrän.
create or replace function replace_forest_stands(p_property_id bigint, p_features jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  delete from forest_stands where property_id = p_property_id;

  with src as (
    select
      f->>'id' as stand_key,
      f->'properties' as p,
      st_setsrid(st_geomfromgeojson((f->'geometry')::text), 3067) as g
    from jsonb_array_elements(p_features) f
  ),
  clipped as (
    select s.stand_key, s.p,
           st_multi(st_collectionextract(st_intersection(st_makevalid(s.g), pr.geom), 3)) as g
    from src s
    join properties pr on pr.id = p_property_id
    where st_intersects(s.g, pr.geom)
  )
  insert into forest_stands (
    property_id, stand_key, geom, area_ha, development_class, main_species, mean_age,
    volume_m3_ha, sawlog_m3_ha, pulp_m3_ha, prop_pine, prop_spruce, prop_other,
    fertility_class, cutting_type, cutting_year, measured_at, raw
  )
  select
    p_property_id, stand_key, g, st_area(g) / 10000.0,
    p->>'DEVELOPMENTCLASS',
    (p->>'MAINTREESPECIES')::smallint,
    (p->>'MEANAGE')::numeric,
    (p->>'VOLUME')::numeric,
    (p->>'SAWLOGVOLUME')::numeric,
    (p->>'PULPWOODVOLUME')::numeric,
    (p->>'PROPORTIONPINE')::numeric,
    (p->>'PROPORTIONSPRUCE')::numeric,
    (p->>'PROPORTIONOTHER')::numeric,
    (p->>'FERTILITYCLASS')::smallint,
    (p->>'CUTTINGTYPE')::smallint,
    (p->>'CUTTINGPROPOSALYEAR')::smallint,
    (p->>'MEASUREMENTDATE')::date,
    p
  from clipped
  where not st_isempty(g) and st_area(g) >= 10;   -- alle 10 m² siivut ovat rajojen epätarkkuutta

  get diagnostics v_count = row_count;

  -- Kiinteistötyypin päättely: yli puolet metsää -> metsätila.
  update properties pr
     set kind = case
       when pr.kind <> 'muu' then pr.kind
       when (select coalesce(sum(area_ha), 0) from forest_stands where property_id = pr.id) * 10000
            > 0.5 * pr.area_m2 then 'metsa'::property_kind
       else pr.kind end
   where pr.id = p_property_id;

  return v_count;
end $$;

-- Tallentaa kaava-alueet välimuistiin (upsert).
create or replace function upsert_zoning_areas(p_municipality_code text, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into zoning_areas (
    municipality_code, level, source_layer, source_id, plan_name, plan_id, approved_on,
    designation, efficiency, building_right_m2, regulations, geom, raw, fetched_at
  )
  select
    p_municipality_code,
    (r->>'level')::plan_level,
    r->>'source_layer',
    r->>'source_id',
    r->>'plan_name',
    r->>'plan_id',
    (r->>'approved_on')::date,
    r->>'designation',
    (r->>'efficiency')::numeric,
    (r->>'building_right_m2')::numeric,
    r->>'regulations',
    st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson((r->'geometry')::text), 3067)), 3)),
    coalesce(r->'raw', '{}'),
    now()
  from jsonb_array_elements(p_rows) r
  on conflict (municipality_code, source_layer, source_id) do update
    set plan_name = excluded.plan_name,
        plan_id = excluded.plan_id,
        approved_on = excluded.approved_on,
        designation = excluded.designation,
        efficiency = excluded.efficiency,
        building_right_m2 = excluded.building_right_m2,
        regulations = excluded.regulations,
        geom = excluded.geom,
        raw = excluded.raw,
        fetched_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Kooste yhdestä kiinteistöstä: perustiedot, kuviot, kaavat ja tuoreimmat kantohinnat.
create or replace function property_summary(p_kiinteistotunnus text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with pr as (
    select p.*, m.name as municipality_name, m.luke_price_area, m.zoning_pilot
    from properties p
    left join municipalities m on m.code = p.municipality_code
    where p.kiinteistotunnus = p_kiinteistotunnus
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
    'kiinteistotunnus', pr.kiinteistotunnus,
    'display_id', pr.display_id,
    'name', pr.name,
    'municipality', jsonb_build_object('code', pr.municipality_code, 'name', pr.municipality_name,
                                       'zoning_pilot', coalesce(pr.zoning_pilot, false)),
    'kind', pr.kind,
    'is_maarala', pr.is_maarala,
    'area_ha', round((pr.area_m2 / 10000.0)::numeric, 3),
    'center', jsonb_build_object('lat', st_y(pr.centroid_wgs84), 'lon', st_x(pr.centroid_wgs84)),
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
