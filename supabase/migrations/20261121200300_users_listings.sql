-- Metsämyynti: myynti-ilmoitukset ja yhteisomistajien hyväksyntä
--
-- Elinkaari:
--   luonnos -> (submit_listing, vahva tunnistus) -> odottaa_hyvaksyntaa
--           -> (kaikki omistajat hyväksyvät, kukin vahvasti tunnistautuneena) -> julkaistu
--   hylkäys palauttaa ilmoituksen luonnokseksi, ja hyväksynnät kerätään uudelleen.
--   julkaistu -> reopen_listing -> luonnos (muokkaus vaatii uuden hyväksyntäkierroksen)
--   julkaistu -> mark_listing_sold -> myyty;  mikä tahansa -> withdraw_listing -> poistettu
--
-- Ilmoitukseen voi kuulua useita kiinteistöjä tai määräaloja (listing_properties).
-- Hyväksyjiä ovat kaikkien niiden kaikki omistajat; kuolinpesän puolesta hyväksyvät
-- kaikki sen osakkaat. Ilmoitustekstit (sections) ja hinta-arvion täyttää
-- ilmoitusgeneraattori, eikä se kuulu tähän tiedostoon.

create type listing_status as enum (
  'luonnos',
  'odottaa_hyvaksyntaa',
  'julkaistu',
  'myyty',
  'poistettu'
);
create type approval_decision as enum ('odottaa', 'hyvaksytty', 'hylatty');

create table public.listings (
  id                 uuid primary key default gen_random_uuid(),
  created_by         uuid not null references public.profiles(id),
  status             public.listing_status not null default 'luonnos',
  title              text check (char_length(title) <= 200),
  asking_price_eur   numeric check (asking_price_eur >= 0),
  price_source       public.value_status not null default 'alustava',
  sections           jsonb not null default '{}',
  published_at       timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index listings_status_idx on public.listings (status, published_at desc);
create trigger listings_touch before update on public.listings
  for each row execute function private.touch_updated_at();

create table public.listing_properties (
  listing_id   uuid not null references public.listings(id) on delete cascade,
  property_id  bigint not null references public.properties(id),
  primary key (listing_id, property_id)
);
create index listing_properties_property_idx on public.listing_properties (property_id);

create table public.listing_approvals (
  listing_id     uuid not null references public.listings(id) on delete cascade,
  identity_hash  text not null,
  owner_name     text,
  decision       public.approval_decision not null default 'odottaa',
  decided_by     uuid references public.profiles(id),
  comment        text check (char_length(comment) <= 1000),
  decided_at     timestamptz,
  primary key (listing_id, identity_hash)
);

-- ---------------------------------------------------------------------------
-- Apufunktiot
-- ---------------------------------------------------------------------------
create function private.is_listing_owner(p_listing uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listing_properties lp
    where lp.listing_id = p_listing and private.is_owner(lp.property_id, p_user)
  )
$$;
revoke all on function private.is_listing_owner(uuid, uuid) from public;
grant execute on function private.is_listing_owner(uuid, uuid) to anon, authenticated, service_role;

create function private.is_published_property(p_property bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listing_properties lp
    join public.listings l on l.id = lp.listing_id
    where lp.property_id = p_property and l.status = 'julkaistu'
  )
$$;
grant execute on function private.is_published_property(bigint) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.listings enable row level security;
alter table public.listing_properties enable row level security;
alter table public.listing_approvals enable row level security;
revoke all on public.listings, public.listing_properties, public.listing_approvals from anon, authenticated;

grant select on public.listings, public.listing_properties to anon, authenticated;
-- Omistajat voivat muokata luonnoksen sisältöä suoraan; tila muuttuu vain RPC:llä.
grant update (title, asking_price_eur, price_source, sections) on public.listings to authenticated;
grant select on public.listing_approvals to authenticated;
grant all on public.listings, public.listing_properties, public.listing_approvals to service_role;

create policy listings_select_published on public.listings
  for select to anon, authenticated using (status = 'julkaistu');
create policy listings_select_owner on public.listings
  for select to authenticated using (private.is_listing_owner(id));
create policy listings_update_draft on public.listings
  for update to authenticated
  using (status = 'luonnos' and private.is_listing_owner(id))
  -- 'vahvistettu' hinta asetetaan vain palvelimella, kun vahvistettu arvio on ladattu.
  with check (status = 'luonnos' and price_source <> 'vahvistettu' and private.is_listing_owner(id));

create policy listing_properties_select on public.listing_properties
  for select to anon, authenticated using (
    exists (select 1 from public.listings l where l.id = listing_id and l.status = 'julkaistu')
    or private.is_listing_owner(listing_id));

create policy listing_approvals_select_owner on public.listing_approvals
  for select to authenticated using (private.is_listing_owner(listing_id));

-- Julkaistun ilmoituksen kiinteistön hinta-arvio näkyy kaikille.
create policy valuations_select_published on public.valuations
  for select to anon, authenticated using (private.is_published_property(property_id));

-- ---------------------------------------------------------------------------
-- Ilmoituksen elinkaari (RPC)
-- ---------------------------------------------------------------------------
create function private.require_strong_auth(p_step_up boolean) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Kirjaudu sisään' using errcode = '28000', hint = 'KIRJAUDU';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and identity_hash is not null) then
    raise exception 'Myynti vaatii vahvan tunnistautumisen' using errcode = '28000', hint = 'VAHVA_TUNNISTUS';
  end if;
  if p_step_up and not private.has_recent_strong_auth(v_uid) then
    raise exception 'Tunnistaudu uudelleen pankkitunnuksilla tai mobiilivarmenteella'
      using errcode = '28000', hint = 'TUNNISTAUDU_UUDELLEEN';
  end if;
  return v_uid;
end $$;
revoke all on function private.require_strong_auth(boolean) from public, anon;
grant execute on function private.require_strong_auth(boolean) to authenticated;

-- Luo luonnos yhdelle tai useammalle omalle kiinteistölle.
create function public.create_listing(p_property_ids bigint[], p_title text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_strong_auth(false);
  v_id uuid;
  v_pid bigint;
begin
  if p_property_ids is null or cardinality(p_property_ids) = 0 then
    raise exception 'Valitse vähintään yksi kiinteistö' using hint = 'EI_KIINTEISTOJA';
  end if;
  foreach v_pid in array p_property_ids loop
    if not private.is_owner(v_pid, v_uid) then
      raise exception 'Et omista kiinteistöä %', v_pid using errcode = '42501', hint = 'EI_OMISTAJA';
    end if;
    if exists (select 1 from public.listing_properties lp join public.listings l on l.id = lp.listing_id
               where lp.property_id = v_pid and l.status in ('luonnos', 'odottaa_hyvaksyntaa', 'julkaistu')) then
      raise exception 'Kiinteistöllä % on jo avoin ilmoitus', v_pid using hint = 'ILMOITUS_ON_JO';
    end if;
  end loop;

  insert into public.listings (created_by, title) values (v_uid, p_title) returning id into v_id;
  insert into public.listing_properties (listing_id, property_id)
  select v_id, unnest(p_property_ids) on conflict do nothing;
  return v_id;
end $$;

create function private.try_publish(p_listing uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  r record;
begin
  if exists (select 1 from public.listing_approvals where listing_id = p_listing and decision <> 'hyvaksytty') then
    return false;
  end if;
  update public.listings set status = 'julkaistu', published_at = now()
  where id = p_listing and status = 'odottaa_hyvaksyntaa'
  returning coalesce(title, 'Ilmoitus') into v_title;
  if not found then return false; end if;

  for r in select p.id from public.listing_approvals a
           join public.profiles p on p.identity_hash = a.identity_hash
           where a.listing_id = p_listing loop
    perform private.notify(r.id, 'ilmoitus_julkaistu', 'Ilmoitus julkaistu: ' || v_title,
      'Kaikki omistajat hyväksyivät ilmoituksen, ja se on nyt julkinen.',
      jsonb_build_object('listing_id', p_listing), 'listing_events');
  end loop;
  return true;
end $$;
revoke all on function private.try_publish(uuid) from public, anon, authenticated;

-- Lähetä luonnos julkaistavaksi. Vaatii tuoreen vahvan tunnistautumisen (tarkoitus 'julkaisu').
-- Palauttaa uuden tilan.
create function public.submit_listing(p_listing uuid) returns public.listing_status
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_strong_auth(true);
  v_hash text;
  v_title text;
  v_missing text;
  r record;
begin
  if not private.is_listing_owner(p_listing, v_uid) then
    raise exception 'Et ole tämän ilmoituksen kiinteistön omistaja' using errcode = '42501', hint = 'EI_OMISTAJA';
  end if;
  select coalesce(title, 'Ilmoitus') into v_title from public.listings
  where id = p_listing and status = 'luonnos' for update;
  if not found then
    raise exception 'Vain luonnoksen voi lähettää julkaistavaksi' using hint = 'VAARA_TILA';
  end if;

  -- Kuolinpesä, jolla ei ole vielä osakkaita: julkaisu ei ole mahdollinen.
  select string_agg(coalesce(e.owner_name, 'kuolinpesä'), ', ') into v_missing
  from public.listing_properties lp
  join public.property_owners e on e.property_id = lp.property_id and e.is_estate
  where lp.listing_id = p_listing
    and not exists (select 1 from public.property_owners s where s.estate_owner_id = e.id);
  if v_missing is not null then
    raise exception 'Kuolinpesän osakkaat puuttuvat (%). Lähetä perukirja.', v_missing using hint = 'OSAKKAAT_PUUTTUVAT';
  end if;

  select identity_hash into v_hash from public.profiles where id = v_uid;

  delete from public.listing_approvals where listing_id = p_listing;
  insert into public.listing_approvals (listing_id, identity_hash, owner_name)
  select distinct on (po.identity_hash) p_listing, po.identity_hash, po.owner_name
  from public.listing_properties lp
  join public.property_owners po on po.property_id = lp.property_id and not po.is_estate
  where lp.listing_id = p_listing
  order by po.identity_hash;

  update public.listing_approvals set decision = 'hyvaksytty', decided_by = v_uid, decided_at = now()
  where listing_id = p_listing and identity_hash = v_hash;

  update public.listings set status = 'odottaa_hyvaksyntaa' where id = p_listing;

  for r in select p.id from public.listing_approvals a
           join public.profiles p on p.identity_hash = a.identity_hash
           where a.listing_id = p_listing and a.decision = 'odottaa' loop
    perform private.notify(r.id, 'hyvaksyntapyynto', 'Hyväksyntäpyyntö: ' || v_title,
      'Yhteisomistaja haluaa julkaista myynti-ilmoituksen yhteisestä kiinteistöstänne. Tarkista ja hyväksy tai hylkää.',
      jsonb_build_object('listing_id', p_listing), 'listing_events');
  end loop;

  perform private.try_publish(p_listing);
  return (select status from public.listings where id = p_listing);
end $$;

-- Yhteisomistajan päätös. Vaatii tuoreen vahvan tunnistautumisen (tarkoitus 'hyvaksynta').
create function public.decide_listing(p_listing uuid, p_approve boolean, p_comment text default null)
returns public.listing_status
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_strong_auth(true);
  v_hash text;
  v_title text;
  r record;
begin
  select identity_hash into v_hash from public.profiles where id = v_uid;
  select coalesce(title, 'Ilmoitus') into v_title from public.listings
  where id = p_listing and status = 'odottaa_hyvaksyntaa' for update;
  if not found then
    raise exception 'Ilmoitus ei odota hyväksyntää' using hint = 'VAARA_TILA';
  end if;

  update public.listing_approvals
  set decision = case when p_approve then 'hyvaksytty'::public.approval_decision else 'hylatty' end,
      decided_by = v_uid, decided_at = now(), comment = p_comment
  where listing_id = p_listing and identity_hash = v_hash and decision = 'odottaa';
  if not found then
    raise exception 'Sinulta ei odoteta päätöstä tähän ilmoitukseen' using errcode = '42501', hint = 'EI_HYVAKSYJA';
  end if;

  if p_approve then
    perform private.try_publish(p_listing);
  else
    update public.listings set status = 'luonnos' where id = p_listing;
    for r in select p.id from public.listing_approvals a
             join public.profiles p on p.identity_hash = a.identity_hash
             where a.listing_id = p_listing and p.id <> v_uid loop
      perform private.notify(r.id, 'ilmoitus_palautettu', 'Ilmoitus palautettiin luonnokseksi: ' || v_title,
        coalesce('Yhteisomistaja ei hyväksynyt ilmoitusta: ' || p_comment, 'Yhteisomistaja ei hyväksynyt ilmoitusta.'),
        jsonb_build_object('listing_id', p_listing), 'listing_events');
    end loop;
  end if;
  return (select status from public.listings where id = p_listing);
end $$;

-- Julkaistu ilmoitus takaisin muokattavaksi (poistuu julkisuudesta, vaatii uudet hyväksynnät).
create function public.reopen_listing(p_listing uuid) returns public.listing_status
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_strong_auth(false);
begin
  if not private.is_listing_owner(p_listing, v_uid) then
    raise exception 'Et ole tämän ilmoituksen kiinteistön omistaja' using errcode = '42501', hint = 'EI_OMISTAJA';
  end if;
  update public.listings set status = 'luonnos', published_at = null
  where id = p_listing and status in ('odottaa_hyvaksyntaa', 'julkaistu');
  if not found then raise exception 'Ilmoitusta ei voi avata muokattavaksi' using hint = 'VAARA_TILA'; end if;
  delete from public.listing_approvals where listing_id = p_listing;
  return 'luonnos';
end $$;

create function public.withdraw_listing(p_listing uuid) returns public.listing_status
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_strong_auth(false);
  v_title text;
  r record;
begin
  if not private.is_listing_owner(p_listing, v_uid) then
    raise exception 'Et ole tämän ilmoituksen kiinteistön omistaja' using errcode = '42501', hint = 'EI_OMISTAJA';
  end if;
  update public.listings set status = 'poistettu', closed_at = now()
  where id = p_listing and status in ('luonnos', 'odottaa_hyvaksyntaa', 'julkaistu')
  returning coalesce(title, 'Ilmoitus') into v_title;
  if not found then raise exception 'Ilmoitus on jo suljettu' using hint = 'VAARA_TILA'; end if;
  for r in select p.id from public.listing_approvals a
           join public.profiles p on p.identity_hash = a.identity_hash
           where a.listing_id = p_listing and p.id <> v_uid loop
    perform private.notify(r.id, 'ilmoitus_poistettu', 'Ilmoitus poistettu: ' || v_title,
      'Yhteisomistaja poisti ilmoituksen.', jsonb_build_object('listing_id', p_listing), 'listing_events');
  end loop;
  return 'poistettu';
end $$;

create function public.mark_listing_sold(p_listing uuid) returns public.listing_status
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_strong_auth(false);
begin
  if not private.is_listing_owner(p_listing, v_uid) then
    raise exception 'Et ole tämän ilmoituksen kiinteistön omistaja' using errcode = '42501', hint = 'EI_OMISTAJA';
  end if;
  update public.listings set status = 'myyty', closed_at = now()
  where id = p_listing and status = 'julkaistu';
  if not found then raise exception 'Vain julkaistun ilmoituksen voi merkitä myydyksi' using hint = 'VAARA_TILA'; end if;
  return 'myyty';
end $$;

revoke all on function public.create_listing(bigint[], text), public.submit_listing(uuid),
  public.decide_listing(uuid, boolean, text), public.reopen_listing(uuid),
  public.withdraw_listing(uuid), public.mark_listing_sold(uuid) from public, anon;
grant execute on function public.create_listing(bigint[], text), public.submit_listing(uuid),
  public.decide_listing(uuid, boolean, text), public.reopen_listing(uuid),
  public.withdraw_listing(uuid), public.mark_listing_sold(uuid) to authenticated;
