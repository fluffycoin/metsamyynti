-- Kiinteistöjen ydintaulu. Omistaja: datahakuketju.
-- Käyttäjäpuolen taulut (profiles, property_owners, listings, ...) tulevat
-- migraatioihin 20261121200000_users_* alkaen ja viittaavat tähän tauluun.

create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  -- MML:n esitysmuoto, esim. '091-403-0001-0002'
  kiinteistotunnus text not null unique
    check (kiinteistotunnus ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}-[0-9]{4}$'),
  -- Tallennusmuoto 14 numeroa, esim. '09140300010002'
  kiinteistotunnus_numeric text generated always as (replace(kiinteistotunnus, '-', '')) stored,
  kunta_nro text generated always as (substr(kiinteistotunnus, 1, 3)) stored,
  nimi text,
  rekisteriyksikkolaji text,
  rekisterointipvm date,
  pinta_ala_ha numeric(12, 4),
  -- Kiinteistön palstat yhdessä, ETRS-TM35FIN
  geom geometry(MultiPolygon, 3067),
  centroid geometry(Point, 3067) generated always as (st_pointonsurface(geom)) stored,
  boundaries_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_geom_gix on public.properties using gist (geom);
create index if not exists properties_kunta_idx on public.properties (kunta_nro);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- Muuntaa syötteen ('91-403-1-2', '09140300010002', '091-403-0001-0002')
-- esitysmuotoon. Palauttaa null, jos syöte ei ole kiinteistötunnus.
create or replace function public.normalize_kiinteistotunnus(input text) returns text
language plpgsql immutable as $$
declare
  s text := regexp_replace(coalesce(input, ''), '\s', '', 'g');
  parts text[];
begin
  if s ~ '^[0-9]{14}$' then
    return substr(s,1,3) || '-' || substr(s,4,3) || '-' || substr(s,7,4) || '-' || substr(s,11,4);
  end if;
  parts := string_to_array(s, '-');
  if array_length(parts, 1) = 4
     and parts[1] ~ '^[0-9]{1,3}$' and parts[2] ~ '^[0-9]{1,3}$'
     and parts[3] ~ '^[0-9]{1,4}$' and parts[4] ~ '^[0-9]{1,4}$' then
    return lpad(parts[1],3,'0') || '-' || lpad(parts[2],3,'0') || '-'
        || lpad(parts[3],4,'0') || '-' || lpad(parts[4],4,'0');
  end if;
  return null;
end $$;

alter table public.properties enable row level security;

drop policy if exists properties_read_all on public.properties;
create policy properties_read_all on public.properties
  for select to anon, authenticated using (true);
-- Kirjoitus vain service_rolella (Edge Functions), joka ohittaa RLS:n.
