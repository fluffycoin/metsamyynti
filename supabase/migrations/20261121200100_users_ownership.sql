-- Metsämyynti: omistajuudet
--
-- Omistajuus haetaan lainhuutotiedoista henkilötunnuksella, kun myyjä tunnistautuu
-- vahvasti. Ennen MML:n käyttölupaa lähteenä on testirekisteri
-- (private.ownership_registry_test). Kun lupa on saatu, palvelinfunktio hakee tiedot
-- MML:ltä ja kutsuu samaa private.replace_ownerships()-funktiota, eli muu sovellus
-- ei muutu (asetus private.settings.ownership_source = 'mml').
--
-- Yhteisomistus: jokainen omistaja on oma rivinsä (osuus share_num/share_den).
-- Kuolinpesä: lainhuudossa omistajana on kuolinpesä (is_estate = true). Kuolinpesä ei
-- itse voi hyväksyä ilmoitusta, vaan sen osakkaat (estate_owner_id viittaa
-- kuolinpesän riviin). Osakkaat saadaan perukirjasta: osakas lähettää perukirjan
-- (estate_claims), ylläpito tarkistaa sen ja lisää osakkaat.
-- Määräala on oma properties-rivinsä (maarala_no), ja sillä on omat omistajansa.

create table public.property_owners (
  id               bigint generated always as identity primary key,
  property_id      bigint not null references public.properties(id) on delete cascade,
  identity_hash    text not null,
  owner_name       text,              -- näkyy vain saman kiinteistön omistajille
  share_num        integer check (share_num > 0),
  share_den        integer check (share_den > 0),
  is_estate        boolean not null default false,
  estate_owner_id  bigint references public.property_owners(id) on delete cascade,
  source           text not null check (source in ('testi', 'mml', 'perukirja')),
  synced_at        timestamptz not null default now(),
  unique (property_id, identity_hash),
  check (not (is_estate and estate_owner_id is not null))
);
create index property_owners_identity_idx on public.property_owners (identity_hash);
comment on table public.property_owners is
  'Kiinteistön omistajat. Täsmäytys profiiliin identity_hashilla. Omistajan tiedot eivät näy muille kuin saman kiinteistön omistajille.';

-- Onko käyttäjä (vahvasti tunnistettu) kiinteistön omistaja tai kuolinpesän osakas?
create function private.is_owner(p_property bigint, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.property_owners po
    join public.profiles p on p.identity_hash = po.identity_hash
    where po.property_id = p_property and p.id = p_user and not po.is_estate
  )
$$;
revoke all on function private.is_owner(bigint, uuid) from public;
grant execute on function private.is_owner(bigint, uuid) to anon, authenticated, service_role;

alter table public.property_owners enable row level security;
revoke all on public.property_owners from anon, authenticated;
grant select (id, property_id, owner_name, share_num, share_den, is_estate, estate_owner_id, source, synced_at)
  on public.property_owners to authenticated;
grant all on public.property_owners to service_role;
create policy property_owners_select_coowners on public.property_owners
  for select to authenticated using (private.is_owner(property_id));

-- Arviot (valuations) ovat omistajien nähtävissä aina, muille julkaistun ilmoituksen kautta.
create policy valuations_select_owner on public.valuations
  for select to authenticated using (private.is_owner(property_id));

-- ---------------------------------------------------------------------------
-- Testirekisteri (korvaa MML:n lainhuutotiedot, kunnes käyttölupa on myönnetty)
-- ---------------------------------------------------------------------------
create table private.ownership_registry_test (
  id                bigint generated always as identity primary key,
  kiinteistotunnus  char(14) not null,
  maarala_no        text,
  property_name     text,
  hetu              text not null,      -- keksitty testihenkilötunnus
  owner_name        text not null,
  share_num         integer,
  share_den         integer,
  is_estate         boolean not null default false,
  estate_hetu       text                -- osakkaan rivillä: kuolinpesän (vainajan) tunnus
);
revoke all on private.ownership_registry_test from public, anon, authenticated;
grant all on private.ownership_registry_test to service_role;

-- ---------------------------------------------------------------------------
-- Omistajuuksien päivitys
-- ---------------------------------------------------------------------------
-- p_rows: kaikkien niiden kiinteistöjen KAIKKI omistajat, joissa käyttäjä on omistajana:
--   [{ "kiinteistotunnus": "04940100010001", "maarala_no": null, "property_name": "Mäkelä",
--      "hetu": "...", "owner_name": "...", "share_num": 1, "share_den": 2,
--      "is_estate": false, "estate_hetu": null }, ...]
-- Käyttäjän rivit kiinteistöihin, jotka eivät enää ole listassa, poistetaan (myyty).
create function private.replace_ownerships(p_identity_hash text, p_rows jsonb, p_source text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_property bigint;
  v_kt text;
  v_props bigint[] := '{}';
  v_kept bigint[] := '{}';
  v_id bigint;
  v_estate bigint;
begin
  if p_source not in ('testi', 'mml') then
    raise exception 'Tuntematon lähde %', p_source;
  end if;

  -- 1) Varmista properties-rivit ja omistajat (ensin omistajat ja kuolinpesät, sitten osakkaat)
  for r in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
    order by (value ->> 'estate_hetu') is not null
  loop
    v_kt := r ->> 'kiinteistotunnus';
    if v_kt !~ '^[0-9]{14}$' then
      raise exception 'Virheellinen kiinteistötunnus %', v_kt;
    end if;

    insert into public.properties (kiinteistotunnus, municipality_code, maarala_no, name, source)
    values (v_kt, substr(v_kt, 1, 3), nullif(r ->> 'maarala_no', ''), r ->> 'property_name', 'omistajasynkka')
    on conflict (kiinteistotunnus, maarala_no) do nothing;

    select id into v_property from public.properties
    where kiinteistotunnus = v_kt and maarala_no is not distinct from nullif(r ->> 'maarala_no', '');
    v_props := array_append(v_props, v_property);

    v_estate := null;
    if r ->> 'estate_hetu' is not null then
      select id into v_estate from public.property_owners
      where property_id = v_property and identity_hash = private.identity_hash(r ->> 'estate_hetu') and is_estate;
    end if;

    insert into public.property_owners as po
      (property_id, identity_hash, owner_name, share_num, share_den, is_estate, estate_owner_id, source, synced_at)
    values (
      v_property, private.identity_hash(r ->> 'hetu'), r ->> 'owner_name',
      (r ->> 'share_num')::int, (r ->> 'share_den')::int,
      coalesce((r ->> 'is_estate')::boolean, false), v_estate, p_source, now())
    on conflict (property_id, identity_hash) do update set
      owner_name = excluded.owner_name, share_num = excluded.share_num, share_den = excluded.share_den,
      is_estate = excluded.is_estate, estate_owner_id = excluded.estate_owner_id,
      source = excluded.source, synced_at = now()
    returning po.id into v_id;
    v_kept := array_append(v_kept, v_id);
  end loop;

  -- 2) Saman lähteen vanhentuneet omistajat näillä kiinteistöillä pois
  delete from public.property_owners
  where property_id = any (v_props) and source = p_source and not (id = any (v_kept));

  -- 3) Käyttäjän omistukset muilla kiinteistöillä (esim. myyty) pois
  delete from public.property_owners
  where identity_hash = p_identity_hash and source = p_source and not (property_id = any (v_props));

  return coalesce(array_length(v_kept, 1), 0);
end $$;
revoke all on function private.replace_ownerships(text, jsonb, text) from public, anon, authenticated;
grant execute on function private.replace_ownerships(text, jsonb, text) to service_role;

-- Testitila: hae testirekisteristä kaikki kiinteistöt, joissa henkilö on omistaja tai
-- kuolinpesän osakas, ja niiden kaikki omistajat.
create function private.sync_ownerships_from_test_registry(p_identity_hash text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  with mine as (
    select distinct kiinteistotunnus, maarala_no
    from private.ownership_registry_test
    where private.identity_hash(hetu) = p_identity_hash
  )
  select coalesce(jsonb_agg(to_jsonb(t) - 'id'), '[]'::jsonb) into v_rows
  from private.ownership_registry_test t
  join mine m on m.kiinteistotunnus = t.kiinteistotunnus and m.maarala_no is not distinct from t.maarala_no;

  return private.replace_ownerships(p_identity_hash, v_rows, 'testi');
end $$;
revoke all on function private.sync_ownerships_from_test_registry(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kuolinpesän osakkuus perukirjalla
-- ---------------------------------------------------------------------------
create type estate_claim_status as enum ('odottaa', 'hyvaksytty', 'hylatty');

create table public.estate_claims (
  id              uuid primary key default gen_random_uuid(),
  estate_owner_id bigint not null references public.property_owners(id) on delete cascade,
  claimant_id     uuid not null references public.profiles(id) on delete cascade,
  document_path   text not null,        -- Storage-polku: perukirjat/<user_id>/<tiedosto>.pdf
  status          public.estate_claim_status not null default 'odottaa',
  reviewer_note   text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);
alter table public.estate_claims enable row level security;
revoke all on public.estate_claims from anon, authenticated;
grant select on public.estate_claims to authenticated;
grant all on public.estate_claims to service_role;
create policy estate_claims_select_own on public.estate_claims
  for select to authenticated using (claimant_id = auth.uid());

-- Ylläpito hyväksyy perukirjan ja lisää osakkaat.
-- p_shareholders: [{ "hetu": "...", "owner_name": "...", "share_num": 1, "share_den": 3 }, ...]
create function public.approve_estate_claim(p_claim uuid, p_shareholders jsonb, p_note text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.estate_claims;
  e public.property_owners;
  r jsonb;
  n integer := 0;
begin
  select * into c from public.estate_claims where id = p_claim for update;
  if not found or c.status <> 'odottaa' then
    raise exception 'Hakemusta ei löydy tai se on jo käsitelty';
  end if;
  select * into e from public.property_owners where id = c.estate_owner_id;

  for r in select value from jsonb_array_elements(p_shareholders) loop
    insert into public.property_owners
      (property_id, identity_hash, owner_name, share_num, share_den, estate_owner_id, source)
    values (e.property_id, private.identity_hash(r ->> 'hetu'), r ->> 'owner_name',
            (r ->> 'share_num')::int, (r ->> 'share_den')::int, e.id, 'perukirja')
    on conflict (property_id, identity_hash) do update set
      estate_owner_id = excluded.estate_owner_id, owner_name = excluded.owner_name,
      share_num = excluded.share_num, share_den = excluded.share_den, synced_at = now();
    n := n + 1;
  end loop;

  update public.estate_claims set status = 'hyvaksytty', reviewer_note = p_note, reviewed_at = now()
  where id = p_claim;

  -- Jo palvelussa olevat osakkaat saavat heti kiinteistön odottavat kiinnostukset ja hyväksyntäpyynnöt.
  perform private.deliver_pending_interests(p.id), private.deliver_pending_approvals(p.id)
  from public.property_owners po join public.profiles p on p.identity_hash = po.identity_hash
  where po.estate_owner_id = e.id;
  return n;
end $$;
revoke all on function public.approve_estate_claim(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.approve_estate_claim(uuid, jsonb, text) to service_role;
