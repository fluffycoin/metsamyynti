-- Metsämyynti: kiinnostusilmoitukset
--
-- Kuka tahansa tilin luonut (sähköposti vahvistettu) voi ilmoittaa kiinnostuksensa mistä
-- tahansa kiinteistöstä, myös sellaisesta, joka ei ole myynnissä. Lähettäjä ei näe
-- omistajaa eikä saa tietää, onko omistaja palvelussa. Omistaja näkee viestin
-- sovelluksessa ja halutessaan sähköpostissa. Omistaja ei näe lähettäjän yhteystietoja,
-- ellei lähettäjä itse jaa niitä. Omistaja voi kieltäytyä kaikista kiinnostuksista
-- (notification_prefs.accept_interests = false) tai estää yksittäisen lähettäjän.
--
-- Häirinnän esto (private.settings):
--   interest_daily_limit       kiinnostuksia / lähettäjä / 24 h            (oletus 10)
--   interest_repeat_days       saman kohteen uusi kiinnostus aikaisintaan  (oletus 7 vrk)
--   interest_property_daily    kiinnostuksia / kohde / 24 h kaikilta       (oletus 30)
-- Kiinnostukset, jotka tulevat ennen kuin omistaja liittyy, toimitetaan hänelle, kun hän
-- tunnistautuu vahvasti ja omistus täsmätään.

insert into private.settings (key, value) values
  ('interest_daily_limit', '10'),
  ('interest_repeat_days', '7'),
  ('interest_property_daily', '30')
on conflict (key) do nothing;

create type interest_status as enum ('lahetetty', 'luettu', 'vastattu', 'hylatty');

create table public.interests (
  id             uuid primary key default gen_random_uuid(),
  property_id    bigint not null references public.properties(id),
  listing_id     uuid references public.listings(id) on delete set null,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  message        text not null check (char_length(message) between 1 and 2000),
  offer_eur      numeric check (offer_eur >= 0),
  share_contact  boolean not null default false,
  contact_name   text check (char_length(contact_name) <= 120),
  contact_email  text check (char_length(contact_email) <= 200),
  contact_phone  text check (char_length(contact_phone) <= 40),
  status         public.interest_status not null default 'lahetetty',
  created_at     timestamptz not null default now(),
  check (share_contact or (contact_name is null and contact_email is null and contact_phone is null))
);
create index interests_sender_idx on public.interests (sender_id, created_at desc);
create index interests_property_idx on public.interests (property_id, created_at desc);

create table public.interest_messages (
  id           uuid primary key default gen_random_uuid(),
  interest_id  uuid not null references public.interests(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  author_role  text not null check (author_role in ('ostaja', 'omistaja')),
  body         text not null check (char_length(body) between 1 and 4000),
  created_at   timestamptz not null default now()
);
create index interest_messages_interest_idx on public.interest_messages (interest_id, created_at);

create table public.interest_blocks (
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (owner_id, sender_id)
);

alter table public.interests enable row level security;
alter table public.interest_messages enable row level security;
alter table public.interest_blocks enable row level security;
revoke all on public.interests, public.interest_messages, public.interest_blocks from anon, authenticated;
grant all on public.interests, public.interest_messages, public.interest_blocks to service_role;
-- Lähettäjä näkee omat kiinnostuksensa suoraan; omistajat RPC:n kautta (suodatus ja nimettömyys).
grant select on public.interests to authenticated;
create policy interests_select_sender on public.interests
  for select to authenticated using (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Toimitus omistajille
-- ---------------------------------------------------------------------------
create function private.property_label(p_property bigint) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(name, '') || ' (' || display_id || coalesce('-M' || maarala_no, '') || ')',
                  display_id || coalesce('-M' || maarala_no, ''))
  from public.properties where id = p_property
$$;
revoke all on function private.property_label(bigint) from public, anon, authenticated;

-- Omistajat (profiilit), jotka ottavat vastaan kiinnostuksia tältä lähettäjältä.
create function private.interest_recipients(p_property bigint, p_sender uuid)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct p.id
  from public.property_owners po
  join public.profiles p on p.identity_hash = po.identity_hash
  join public.notification_prefs np on np.user_id = p.id
  where po.property_id = p_property and not po.is_estate
    and np.accept_interests
    and p.id <> p_sender
    and not exists (select 1 from public.interest_blocks b where b.owner_id = p.id and b.sender_id = p_sender)
$$;
revoke all on function private.interest_recipients(bigint, uuid) from public, anon, authenticated;

create function private.deliver_interest(p_interest uuid, p_only_user uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  i public.interests;
  v_user uuid;
  n integer := 0;
begin
  select * into i from public.interests where id = p_interest;
  for v_user in select * from private.interest_recipients(i.property_id, i.sender_id) loop
    continue when p_only_user is not null and v_user <> p_only_user;
    continue when exists (select 1 from public.notifications
                          where user_id = v_user and kind = 'kiinnostus'
                            and payload ->> 'interest_id' = p_interest::text);
    perform private.notify(v_user, 'kiinnostus',
      'Uusi kiinnostus kiinteistöstäsi ' || coalesce(private.property_label(i.property_id), ''),
      left(i.message, 200),
      jsonb_build_object('interest_id', i.id, 'property_id', i.property_id, 'listing_id', i.listing_id),
      'interests');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.deliver_interest(uuid, uuid) from public, anon, authenticated;

-- Kutsutaan, kun käyttäjän omistukset täsmätään: toimita kiinnostukset, jotka tulivat ennen liittymistä.
create function private.deliver_pending_interests(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  n integer := 0;
begin
  for v_id in
    select i.id from public.interests i
    where private.is_owner(i.property_id, p_user) and i.status <> 'hylatty'
      and i.created_at > now() - interval '365 days'
    order by i.created_at desc limit 100
  loop
    n := n + private.deliver_interest(v_id, p_user);
  end loop;
  return n;
end $$;
revoke all on function private.deliver_pending_interests(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: kiinnostuksen lähettäjä
-- ---------------------------------------------------------------------------
create function public.express_interest(
  p_property_id bigint,
  p_message text,
  p_offer_eur numeric default null,
  p_share_contact boolean default false,
  p_contact_name text default null,
  p_contact_phone text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_id uuid;
  v_listing uuid;
begin
  if v_uid is null then
    raise exception 'Luo tili tai kirjaudu sisään' using errcode = '28000', hint = 'KIRJAUDU';
  end if;
  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null then
    raise exception 'Vahvista sähköpostiosoitteesi ennen kiinnostuksen lähettämistä' using hint = 'SAHKOPOSTI_VAHVISTAMATTA';
  end if;
  if not exists (select 1 from public.properties where id = p_property_id) then
    raise exception 'Kiinteistöä ei löydy' using hint = 'EI_KIINTEISTOA';
  end if;
  if private.is_owner(p_property_id, v_uid) then
    raise exception 'Tämä on oma kiinteistösi' using hint = 'OMA_KIINTEISTO';
  end if;
  if (select count(*) from public.interests
      where sender_id = v_uid and created_at > now() - interval '24 hours')
     >= private.setting('interest_daily_limit')::int then
    raise exception 'Olet lähettänyt tänään jo enimmäismäärän kiinnostuksia. Yritä huomenna uudelleen.'
      using hint = 'PAIVARAJA';
  end if;
  if exists (select 1 from public.interests
             where sender_id = v_uid and property_id = p_property_id
               and created_at > now() - make_interval(days => private.setting('interest_repeat_days')::int)) then
    raise exception 'Olet jo ilmoittanut kiinnostuksesi tästä kiinteistöstä. Voit jatkaa keskustelua, kun omistaja vastaa.'
      using hint = 'JO_ILMOITETTU';
  end if;
  if (select count(*) from public.interests
      where property_id = p_property_id and created_at > now() - interval '24 hours')
     >= private.setting('interest_property_daily')::int then
    raise exception 'Kohteeseen on tullut tänään poikkeuksellisen paljon yhteydenottoja. Yritä huomenna uudelleen.'
      using hint = 'KOHTEEN_RAJA';
  end if;

  select l.id into v_listing from public.listing_properties lp
  join public.listings l on l.id = lp.listing_id
  where lp.property_id = p_property_id and l.status = 'julkaistu' limit 1;

  insert into public.interests
    (property_id, listing_id, sender_id, message, offer_eur, share_contact, contact_name, contact_email, contact_phone)
  values (
    p_property_id, v_listing, v_uid, btrim(p_message), p_offer_eur, coalesce(p_share_contact, false),
    case when p_share_contact then nullif(btrim(p_contact_name), '') end,
    case when p_share_contact then v_email end,
    case when p_share_contact then nullif(btrim(p_contact_phone), '') end)
  returning id into v_id;

  perform private.deliver_interest(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: omistaja
-- ---------------------------------------------------------------------------
-- Omistajalle tulleet kiinnostukset. Lähettäjä näkyy aliaksena, ellei hän jakanut yhteystietojaan.
create function public.interests_received()
returns table (
  interest_id uuid, property_id bigint, property_label text, listing_id uuid,
  message text, offer_eur numeric, sender_alias text,
  contact_name text, contact_email text, contact_phone text,
  status public.interest_status, message_count bigint, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.property_id, private.property_label(i.property_id), i.listing_id,
         i.message, i.offer_eur,
         coalesce(i.contact_name, 'Kiinnostunut ostaja #' || upper(left(md5(i.sender_id::text), 4))),
         i.contact_name, i.contact_email, i.contact_phone,
         i.status,
         (select count(*) from public.interest_messages m where m.interest_id = i.id),
         i.created_at
  from public.interests i
  where private.is_owner(i.property_id, auth.uid())
    and auth.uid() in (select * from private.interest_recipients(i.property_id, i.sender_id))
  order by i.created_at desc
$$;

-- Lähettäjän näkymä omiin kiinnostuksiin (omistajasta ei paljasteta mitään).
create function public.interests_sent()
returns table (
  interest_id uuid, property_id bigint, property_label text, listing_id uuid,
  message text, offer_eur numeric, share_contact boolean, status public.interest_status,
  owner_replied boolean, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.property_id, private.property_label(i.property_id), i.listing_id,
         i.message, i.offer_eur, i.share_contact,
         -- 'hylatty' näytetään lähettäjälle 'lahetetty'-tilana, ettei kieltäytyminen paljastu
         case when i.status = 'hylatty' then 'lahetetty'::public.interest_status
              when i.status = 'luettu' then 'lahetetty'::public.interest_status
              else i.status end,
         exists (select 1 from public.interest_messages m where m.interest_id = i.id and m.author_role = 'omistaja'),
         i.created_at
  from public.interests i
  where i.sender_id = auth.uid()
  order by i.created_at desc
$$;

-- Keskustelu kiinnostuksen ympärillä. Omistajan nimi ei näy; ostaja näkyy aliaksena.
create function public.interest_thread(p_interest uuid)
returns table (message_id uuid, author_role text, is_me boolean, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare i public.interests;
begin
  select * into i from public.interests where id = p_interest;
  if not found or not (i.sender_id = auth.uid() or private.is_owner(i.property_id, auth.uid())) then
    raise exception 'Keskustelua ei löydy' using errcode = '42501', hint = 'EI_OIKEUTTA';
  end if;
  return query
    select null::uuid, 'ostaja'::text, i.sender_id = auth.uid(), i.message, i.created_at
    union all
    select m.id, m.author_role, m.author_id = auth.uid(), m.body, m.created_at
    from public.interest_messages m where m.interest_id = p_interest
    order by 5;
end $$;

create function public.reply_to_interest(p_interest uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  i public.interests;
  v_id uuid;
  v_user uuid;
begin
  select * into i from public.interests where id = p_interest for update;
  if not found then raise exception 'Kiinnostusta ei löydy' using hint = 'EI_OIKEUTTA'; end if;

  if private.is_owner(i.property_id, v_uid)
     and v_uid in (select * from private.interest_recipients(i.property_id, i.sender_id)) then
    insert into public.interest_messages (interest_id, author_id, author_role, body)
    values (p_interest, v_uid, 'omistaja', btrim(p_body)) returning id into v_id;
    update public.interests set status = 'vastattu' where id = p_interest;
    perform private.notify(i.sender_id, 'kiinnostus_vastaus',
      'Omistaja vastasi kiinnostukseesi: ' || coalesce(private.property_label(i.property_id), ''),
      left(btrim(p_body), 200), jsonb_build_object('interest_id', p_interest, 'property_id', i.property_id),
      'interests');
  elsif i.sender_id = v_uid then
    -- Ostaja voi jatkaa vasta, kun omistaja on vastannut (estää yksipuolisen viestitulvan).
    if not exists (select 1 from public.interest_messages
                   where interest_id = p_interest and author_role = 'omistaja') then
      raise exception 'Voit jatkaa keskustelua, kun omistaja on vastannut' using hint = 'ODOTA_VASTAUSTA';
    end if;
    if i.status = 'hylatty' then
      raise exception 'Keskustelu on suljettu' using hint = 'SULJETTU';
    end if;
    insert into public.interest_messages (interest_id, author_id, author_role, body)
    values (p_interest, v_uid, 'ostaja', btrim(p_body)) returning id into v_id;
    for v_user in select distinct m.author_id from public.interest_messages m
                  where m.interest_id = p_interest and m.author_role = 'omistaja' loop
      perform private.notify(v_user, 'kiinnostus',
        'Uusi viesti kiinnostuneelta: ' || coalesce(private.property_label(i.property_id), ''),
        left(btrim(p_body), 200), jsonb_build_object('interest_id', p_interest, 'property_id', i.property_id, 'reply', true),
        'interests');
    end loop;
  else
    raise exception 'Kiinnostusta ei löydy' using errcode = '42501', hint = 'EI_OIKEUTTA';
  end if;
  return v_id;
end $$;

create function public.mark_interest_read(p_interest uuid) returns void
language sql security definer set search_path = '' as $$
  update public.interests set status = 'luettu'
  where id = p_interest and status = 'lahetetty' and private.is_owner(property_id, auth.uid())
$$;

-- Kieltäydy kiinnostuksesta; p_block estää lähettäjän kaikilta omilta kiinteistöiltäsi.
create function public.decline_interest(p_interest uuid, p_block boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.interests;
begin
  select * into i from public.interests where id = p_interest;
  if not found or not private.is_owner(i.property_id, auth.uid()) then
    raise exception 'Kiinnostusta ei löydy' using errcode = '42501', hint = 'EI_OIKEUTTA';
  end if;
  update public.interests set status = 'hylatty' where id = p_interest;
  if p_block then
    insert into public.interest_blocks (owner_id, sender_id) values (auth.uid(), i.sender_id)
    on conflict do nothing;
  end if;
end $$;

revoke all on function public.express_interest(bigint, text, numeric, boolean, text, text),
  public.interests_received(), public.interests_sent(), public.interest_thread(uuid),
  public.reply_to_interest(uuid, text), public.mark_interest_read(uuid),
  public.decline_interest(uuid, boolean) from public, anon;
grant execute on function public.express_interest(bigint, text, numeric, boolean, text, text),
  public.interests_received(), public.interests_sent(), public.interest_thread(uuid),
  public.reply_to_interest(uuid, text), public.mark_interest_read(uuid),
  public.decline_interest(uuid, boolean) to authenticated;
