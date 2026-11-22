-- Metsämyynti: julkisyhteisöjen ja yhtiöiden maat
--
-- Merkitään kiinteistöt, jotka omistaa kunta tai kaupunki, valtio (Metsähallitus), seurakunta,
-- yhdistys tai säätiö, iso metsäyhtiö (UPM, Stora Enso, Metsä Group, Tornator...) tai
-- osakaskunta/yhteismetsä. Ostaja näkee merkinnän kiinteistösivulla ja kartalla, eikä
-- "Olen kiinnostunut" -viestiä voi lähettää (ellei kohteella ole julkaistua ilmoitusta).
--
-- Lähteet, vahvimmasta heikoimpaan:
--   1. land_owner_parcels: kiinteistökohtainen tieto. source = 'kasin' on ylläpidon korjaus,
--      jota automaattiset lähteet eivät ylikirjoita (category 'yksityinen' poistaa merkinnän).
--      Muut lähteet: tuodut listat (esim. Metsahaku) ja Espoon maanomistuskartta ('espoo_wms').
--   2. property_owners: lainhuudon omistajien nimet (owner_name_patterns), kun kaikki omistajat
--      ovat samaa tyyppiä.
--   3. Kiinteistötunnus: kylä 893 = valtion metsämaa, kylä 876 = yhteinen alue,
--      ryhmä 9900–9999 = asemakaavan yleinen alue (katu, puisto), joka on kunnan.
--   4. land_owner_areas: tuodut aluerajaukset (esim. kaupunkien maanomistus); vähintään puolet
--      kiinteistön alasta.

create type public.owner_category as enum
  ('kunta', 'valtio', 'seurakunta', 'yhtio', 'yhdistys', 'yhteisalue', 'yksityinen');

create table public.land_owner_parcels (
  kiinteistotunnus  char(14) primary key check (kiinteistotunnus ~ '^[0-9]{14}$'),
  category          public.owner_category not null,
  owner_name        text,
  source            text not null,
  share             numeric check (share between 0 and 1),
  updated_at        timestamptz not null default now()
);
comment on table public.land_owner_parcels is
  'Kiinteistökohtainen omistajatyyppi. source = kasin on ylläpidon korjaus, jota automaattiset lähteet eivät muuta.';

create table public.land_owner_areas (
  id           bigint generated always as identity primary key,
  category     public.owner_category not null check (category <> 'yksityinen'),
  owner_name   text,
  source       text not null,
  geom         geometry(MultiPolygon, 3067) not null,
  imported_at  timestamptz not null default now()
);
create index land_owner_areas_geom_idx on public.land_owner_areas using gist (geom);
create index land_owner_areas_source_idx on public.land_owner_areas (source);

create table public.owner_name_patterns (
  id          bigint generated always as identity primary key,
  pattern     text not null unique,     -- POSIX-regex, kirjainkoko ei merkitse
  category    public.owner_category not null,
  owner_label text                      -- näytettävä nimi, esim. 'UPM'; null = omistajan nimi sellaisenaan
);
insert into public.owner_name_patterns (pattern, category, owner_label) values
  ('\mUPM\M',                                         'yhtio',      'UPM'),
  ('\mStora\s*Enso\M',                                'yhtio',      'Stora Enso'),
  ('\mMetsäliitto\M|\mMetsä\s+(Group|Board|Fibre)\M', 'yhtio',      'Metsä Group'),
  ('\mTornator\M',                                    'yhtio',      'Tornator'),
  ('\mFinsilva\M',                                    'yhtio',      'Finsilva'),
  ('\mMetsähallitus\M',                               'valtio',     'Metsähallitus'),
  ('\mSuomen valtio\M|\mSenaatti-kiinteistöt\M|\mPuolustuskiinteistöt\M', 'valtio', null),
  ('\m(kaupunki|kunta|kuntayhtymä)$',                 'kunta',      null),
  ('seurakunta|seurakuntayhtymä',                     'seurakunta', null),
  ('yhteismetsä|osakaskunta|jakokunta|tiekunta',      'yhteisalue', null),
  ('säätiö|yhdistys|\mry\M|\mr\.y\.',                 'yhdistys',   null);

alter table public.land_owner_parcels enable row level security;
alter table public.land_owner_areas enable row level security;
alter table public.owner_name_patterns enable row level security;
revoke all on public.land_owner_parcels, public.land_owner_areas, public.owner_name_patterns from anon, authenticated;
grant all on public.land_owner_parcels, public.land_owner_areas, public.owner_name_patterns to service_role;

-- ---------------------------------------------------------------------------
-- Päättely
-- ---------------------------------------------------------------------------
create function private.owner_category_label(p_category public.owner_category) returns text
language sql immutable set search_path = '' as $$
  select case p_category
    when 'kunta' then 'Kunnan tai kaupungin maa'
    when 'valtio' then 'Valtion maa'
    when 'seurakunta' then 'Seurakunnan maa'
    when 'yhtio' then 'Yhtiön maa'
    when 'yhdistys' then 'Yhdistyksen tai säätiön maa'
    when 'yhteisalue' then 'Yhteinen alue'
    else null end
$$;

-- Kiinteistötunnuksen numerosarjoista pääteltävä tyyppi (14 numeroa).
create function private.owner_category_by_tunnus(p_kt text) returns public.owner_category
language sql immutable set search_path = '' as $$
  select case
    when p_kt !~ '^[0-9]{14}$' then null
    when substr(p_kt, 4, 3) = '893' then 'valtio'::public.owner_category
    when substr(p_kt, 4, 3) = '876' then 'yhteisalue'::public.owner_category
    when substr(p_kt, 7, 4) between '9900' and '9999' then 'kunta'::public.owner_category
    end
$$;

-- Kokoaa tuloksen JSONiksi.
create function private.owner_info_json(
  p_category public.owner_category, p_owner_name text, p_source text, p_share numeric, p_published boolean
) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_category is null or p_category = 'yksityinen' then null else jsonb_build_object(
    'category', p_category,
    'label', private.owner_category_label(p_category),
    'owner_name', p_owner_name,
    'source', p_source,
    'share', round(p_share, 2),
    'accepts_interest', p_published,
    'note', case when p_published
      then 'Omistaja on itse laittanut kohteen myyntiin palvelussa.'
      else case p_category
        when 'kunta' then 'Kiinteistö on kunnan tai kaupungin omistuksessa. Kiinnostusta ei voi ilmoittaa palvelun kautta; kysy maan myynnistä suoraan kunnalta.'
        when 'valtio' then 'Kiinteistö on valtion omistuksessa (yleensä Metsähallitus). Kiinnostusta ei voi ilmoittaa palvelun kautta.'
        when 'seurakunta' then 'Kiinteistö on seurakunnan omistuksessa. Kiinnostusta ei voi ilmoittaa palvelun kautta; kysy suoraan seurakunnalta.'
        when 'yhtio' then 'Kiinteistö on yhtiön omistuksessa. Kiinnostusta ei voi ilmoittaa palvelun kautta; ota tarvittaessa yhteyttä suoraan yhtiöön.'
        when 'yhdistys' then 'Kiinteistö on yhdistyksen tai säätiön omistuksessa. Kiinnostusta ei voi ilmoittaa palvelun kautta.'
        when 'yhteisalue' then 'Kiinteistö on osakaskunnan tai yhteismetsän yhteinen alue, jota ei myydä tavallisena tilana. Kiinnostusta ei voi ilmoittaa palvelun kautta.'
      end end
  ) end
$$;

-- Kiinteistön omistajatyyppi. null = tavallinen (yksityinen tai tuntematon) omistaja.
create function private.owner_info(p_property bigint) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  pr public.properties;
  v_cat public.owner_category;
  v_name text;
  v_source text;
  v_share numeric;
  v_published boolean;
begin
  select * into pr from public.properties where id = p_property;
  if not found then return null; end if;
  v_published := private.is_published_property(p_property);

  -- 1. Kiinteistökohtainen tieto (koko kiinteistön tieto koskee myös sen määräaloja)
  select lp.category, lp.owner_name, lp.source, lp.share into v_cat, v_name, v_source, v_share
  from public.land_owner_parcels lp where lp.kiinteistotunnus = pr.kiinteistotunnus;
  if found then
    return private.owner_info_json(v_cat, v_name, v_source, v_share, v_published);
  end if;

  -- 2. Lainhuudon omistajat: kaikki omistajat osuvat samaan tyyppiin
  with o as (
    select po.owner_name,
           (select np from public.owner_name_patterns np
            where po.owner_name ~* np.pattern order by np.id limit 1) as np
    from public.property_owners po
    where po.property_id = p_property and po.estate_owner_id is null and po.owner_name is not null
  )
  select (min((o.np).category::text))::public.owner_category,
         string_agg(distinct coalesce((o.np).owner_label, o.owner_name), ', ')
    into v_cat, v_name
  from o
  having count(*) > 0 and count(*) = count(o.np) and count(distinct (o.np).category) = 1;
  if v_cat is not null then
    return private.owner_info_json(v_cat, v_name, 'lainhuuto', 1, v_published);
  end if;

  -- 3. Kiinteistötunnus
  v_cat := private.owner_category_by_tunnus(pr.kiinteistotunnus);
  if v_cat is not null then
    return private.owner_info_json(v_cat, case v_cat when 'valtio' then 'Metsähallitus' end,
                                   'kiinteistotunnus', 1, v_published);
  end if;

  -- 4. Aluerajaukset: suurin tyyppi, jos se kattaa vähintään puolet kiinteistöstä
  if pr.geom is not null and pr.area_m2 > 0 then
    select a.category, string_agg(distinct a.owner_name, ', '),
           sum(st_area(st_intersection(a.geom, pr.geom))) / pr.area_m2
      into v_cat, v_name, v_share
    from public.land_owner_areas a
    where st_intersects(a.geom, pr.geom)
    group by a.category
    order by 3 desc limit 1;
    if v_cat is not null and v_share >= 0.5 then
      return private.owner_info_json(v_cat, v_name, 'aluerajaus', least(v_share, 1), v_published);
    end if;
  end if;
  return null;
end $$;
revoke all on function private.owner_info(bigint) from public;
grant execute on function private.owner_info(bigint) to anon, authenticated, service_role;

-- Kartan klikkaus: tieto kiinteistötunnuksella ja pisteellä (WGS84) ilman, että kiinteistö on kannassa.
create function public.owner_info_at(p_kiinteistotunnus text, p_lon double precision, p_lat double precision)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_id bigint;
  v_cat public.owner_category;
  v_name text;
  v_source text;
begin
  select id into v_id from public.properties
  where kiinteistotunnus = p_kiinteistotunnus and maarala_no is null;
  if v_id is not null then return private.owner_info(v_id); end if;

  select lp.category, lp.owner_name, lp.source into v_cat, v_name, v_source
  from public.land_owner_parcels lp where lp.kiinteistotunnus = p_kiinteistotunnus;
  if found then return private.owner_info_json(v_cat, v_name, v_source, null, false); end if;

  v_cat := private.owner_category_by_tunnus(p_kiinteistotunnus);
  if v_cat is not null then
    return private.owner_info_json(v_cat, case v_cat when 'valtio' then 'Metsähallitus' end,
                                   'kiinteistotunnus', null, false);
  end if;

  if p_lon is not null and p_lat is not null then
    select a.category, a.owner_name into v_cat, v_name
    from public.land_owner_areas a
    where st_contains(a.geom, st_transform(st_setsrid(st_makepoint(p_lon, p_lat), 4326), 3067))
    limit 1;
    if v_cat is not null then return private.owner_info_json(v_cat, v_name, 'aluerajaus', null, false); end if;
  end if;
  return null;
end $$;
revoke all on function public.owner_info_at(text, double precision, double precision) from public;
grant execute on function public.owner_info_at(text, double precision, double precision) to anon, authenticated, service_role;

-- Käyttöliittymälle: omistajatyyppi kiinteistön id:llä.
create function public.property_owner_info(p_property_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.owner_info(p_property_id)
$$;
grant execute on function public.property_owner_info(bigint) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- property_summary: lisätään owner_info
-- ---------------------------------------------------------------------------
alter function public.property_summary(text, text) rename to property_summary_base;
alter function public.property_summary_base(text, text) set schema private;
revoke all on function private.property_summary_base(text, text) from public, anon, authenticated;

create function public.property_summary(p_kiinteistotunnus text, p_maarala_no text default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select b || jsonb_build_object('owner_info', private.owner_info((b ->> 'property_id')::bigint))
  from (select private.property_summary_base(p_kiinteistotunnus, p_maarala_no) as b) s
  where b is not null
$$;
grant execute on function public.property_summary(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Kiinnostusten esto
-- ---------------------------------------------------------------------------
create function private.block_interest_on_public_land() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v jsonb := private.owner_info(new.property_id);
begin
  if v is not null and not (v ->> 'accepts_interest')::boolean then
    raise exception '%', v ->> 'note' using hint = 'EI_YKSITYINEN_MAA', errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger interests_block_public_land before insert on public.interests
  for each row execute function private.block_interest_on_public_land();

-- ---------------------------------------------------------------------------
-- Tallennus ja tuonti (palvelin ja ylläpito)
-- ---------------------------------------------------------------------------
-- Automaattinen lähde (esim. Espoon kartta) kirjaa tuloksen; ylläpidon korjauksia ei muuteta.
-- p_category null poistaa saman lähteen aiemman merkinnän.
create function public.record_land_owner(
  p_kiinteistotunnus text, p_category public.owner_category, p_owner_name text,
  p_source text, p_share numeric default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_category is null then
    delete from public.land_owner_parcels
    where kiinteistotunnus = p_kiinteistotunnus and source = p_source;
    return;
  end if;
  insert into public.land_owner_parcels (kiinteistotunnus, category, owner_name, source, share)
  values (p_kiinteistotunnus, p_category, p_owner_name, p_source, p_share)
  on conflict (kiinteistotunnus) do update
    set category = excluded.category, owner_name = excluded.owner_name, source = excluded.source,
        share = excluded.share, updated_at = now()
    where public.land_owner_parcels.source <> 'kasin';
end $$;

-- Ylläpidon korjaus SQL-editorista, esim.
--   select set_land_owner('49-401-1-1', 'kunta', 'Espoon kaupunki');
--   select set_land_owner('49-401-1-1', 'yksityinen');   -- poistaa väärän merkinnän
--   select set_land_owner('49-401-1-1', null);           -- palauttaa automaattisen päättelyn
create function public.set_land_owner(p_kiinteistotunnus text, p_category public.owner_category, p_owner_name text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_kt text := p_kiinteistotunnus;
begin
  if v_kt ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$' then
    v_kt := lpad(split_part(v_kt, '-', 1), 3, '0') || lpad(split_part(v_kt, '-', 2), 3, '0') ||
            lpad(split_part(v_kt, '-', 3), 4, '0') || lpad(split_part(v_kt, '-', 4), 4, '0');
  end if;
  if v_kt !~ '^[0-9]{14}$' then
    raise exception 'Virheellinen kiinteistötunnus %', p_kiinteistotunnus;
  end if;
  if p_category is null then
    delete from public.land_owner_parcels where kiinteistotunnus = v_kt;
  else
    insert into public.land_owner_parcels (kiinteistotunnus, category, owner_name, source)
    values (v_kt, p_category, p_owner_name, 'kasin')
    on conflict (kiinteistotunnus) do update
      set category = excluded.category, owner_name = excluded.owner_name, source = 'kasin',
          share = null, updated_at = now();
  end if;
end $$;

-- Aluerajausten tuonti (scripts/import-maanomistus.ts). p_features: GeoJSON-featuret EPSG:3067.
-- p_replace: poista ensin saman lähteen vanhat alueet (ensimmäinen erä).
create function public.import_land_owner_areas(
  p_source text, p_category public.owner_category, p_owner_name text, p_features jsonb, p_replace boolean default false
) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  if p_replace then delete from public.land_owner_areas where source = p_source; end if;
  insert into public.land_owner_areas (category, owner_name, source, geom)
  select coalesce((f -> 'properties' ->> 'category')::public.owner_category, p_category),
         coalesce(f -> 'properties' ->> 'owner_name', p_owner_name),
         p_source,
         st_multi(st_collectionextract(st_makevalid(st_force2d(
           st_setsrid(st_geomfromgeojson((f -> 'geometry')::text), 3067))), 3))
  from jsonb_array_elements(p_features) f
  where f -> 'geometry' is not null and f -> 'geometry' <> 'null'::jsonb;
  get diagnostics n = row_count;
  delete from public.land_owner_areas where source = p_source and st_isempty(geom);
  return n;
end $$;

-- Kiinteistölistan tuonti: p_rows = [{"kiinteistotunnus": "...", "category": "kunta", "owner_name": "..."}]
create function public.import_land_owner_parcels(p_source text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.land_owner_parcels (kiinteistotunnus, category, owner_name, source)
  select r ->> 'kiinteistotunnus', (r ->> 'category')::public.owner_category, r ->> 'owner_name', p_source
  from jsonb_array_elements(p_rows) r
  on conflict (kiinteistotunnus) do update
    set category = excluded.category, owner_name = excluded.owner_name, source = excluded.source,
        share = null, updated_at = now()
    where public.land_owner_parcels.source <> 'kasin';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.record_land_owner(text, public.owner_category, text, text, numeric),
  public.set_land_owner(text, public.owner_category, text),
  public.import_land_owner_areas(text, public.owner_category, text, jsonb, boolean),
  public.import_land_owner_parcels(text, jsonb) from public, anon, authenticated;
grant execute on function public.record_land_owner(text, public.owner_category, text, text, numeric),
  public.set_land_owner(text, public.owner_category, text),
  public.import_land_owner_areas(text, public.owner_category, text, jsonb, boolean),
  public.import_land_owner_parcels(text, jsonb) to service_role;
