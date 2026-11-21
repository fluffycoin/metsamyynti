-- Metsämyynti: notifikaatiot ja sähköpostijono
--
-- Kaikki ilmoitukset tulevat sovellukseen (public.notifications, Realtime-tilattava).
-- Sähköposti lähtee vain, jos käyttäjä on sen sallinut (notification_prefs), ja
-- sähköpostissa on vain otsikko ja linkki sovellukseen, ei viestin sisältöä.

create table public.notification_prefs (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  accept_interests      boolean not null default true,   -- otanko kiinnostusilmoituksia vastaan
  email_interests       boolean not null default false,  -- kiinnostukset myös sähköpostiin
  email_listing_events  boolean not null default false,  -- hyväksyntäpyynnöt ja julkaisut sähköpostiin
  updated_at            timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select, update (accept_interests, email_interests, email_listing_events) on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;
create policy notification_prefs_own_select on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());
create policy notification_prefs_own_update on public.notification_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger notification_prefs_touch before update on public.notification_prefs
  for each row execute function private.touch_updated_at();

-- Profiili ja asetukset syntyvät automaattisesti uudelle käyttäjälle.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create type notification_kind as enum (
  'kiinnostus',               -- joku on kiinnostunut kiinteistöstäsi
  'kiinnostukset_odottavat',  -- kiinnostuksia tullut ennen kuin liityit palveluun
  'kiinnostus_vastaus',       -- omistaja vastasi kiinnostukseesi
  'hyvaksyntapyynto',         -- yhteisomistaja pyytää hyväksymään ilmoituksen
  'ilmoitus_julkaistu',
  'ilmoitus_palautettu',      -- yhteisomistaja hylkäsi, ilmoitus palasi luonnokseksi
  'ilmoitus_poistettu'
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        public.notification_kind not null,
  title       text not null,
  body        text,
  payload     jsonb not null default '{}',   -- esim. {"listing_id": ..., "interest_id": ..., "property_id": ...}
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create table private.email_outbox (
  id               bigint generated always as identity primary key,
  notification_id  uuid references public.notifications(id) on delete cascade,
  to_email         text not null,
  subject          text not null,
  body_text        text not null,
  status           text not null default 'jonossa' check (status in ('jonossa', 'lahetetaan', 'lahetetty', 'virhe')),
  attempts         integer not null default 0,
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index email_outbox_status_idx on private.email_outbox (status, created_at);
revoke all on private.email_outbox from public, anon, authenticated;
grant all on private.email_outbox to service_role;

-- Luo notifikaatio ja tarvittaessa sähköposti. p_email_pref: 'interests' tai 'listing_events'.
create function private.notify(
  p_user uuid, p_kind public.notification_kind, p_title text, p_body text,
  p_payload jsonb, p_email_pref text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_send boolean;
  v_email text;
begin
  insert into public.notifications (user_id, kind, title, body, payload)
  values (p_user, p_kind, p_title, p_body, coalesce(p_payload, '{}'))
  returning id into v_id;

  select case p_email_pref
           when 'interests' then np.email_interests
           when 'listing_events' then np.email_listing_events
           else false end
  into v_send
  from public.notification_prefs np where np.user_id = p_user;

  if coalesce(v_send, false) then
    select email into v_email from auth.users where id = p_user;
    if v_email is not null then
      insert into private.email_outbox (notification_id, to_email, subject, body_text)
      values (v_id, v_email, p_title,
              p_title || E'\n\nLue lisää ja vastaa sovelluksessa: {{APP_URL}}/ilmoitukset' ||
              E'\n\nVoit muuttaa sähköposti-ilmoitusten asetuksia sovelluksen asetuksista.');
    end if;
  end if;
  return v_id;
end $$;
revoke all on function private.notify(uuid, public.notification_kind, text, text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: notifikaatiot
-- ---------------------------------------------------------------------------
create function public.mark_notifications_read(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Sähköpostijonon käsittely (vain send-emails-palvelinfunktio, service_role)
-- ---------------------------------------------------------------------------
create function public.claim_email_batch(p_limit integer default 50)
returns table (id bigint, to_email text, subject text, body_text text)
language sql security definer set search_path = '' as $$
  update private.email_outbox o set status = 'lahetetaan', attempts = o.attempts + 1
  where o.id in (
    select e.id from private.email_outbox e
    where e.status = 'jonossa' or (e.status = 'virhe' and e.attempts < 5)
    order by e.created_at limit p_limit
    for update skip locked)
  returning o.id, o.to_email, o.subject, o.body_text
$$;
revoke all on function public.claim_email_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;

create function public.complete_email(p_id bigint, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.email_outbox
  set status = case when p_error is null then 'lahetetty' else 'virhe' end,
      last_error = p_error,
      sent_at = case when p_error is null then now() end
  where id = p_id;
  if p_error is null then
    update public.notifications set emailed_at = now()
    where id = (select notification_id from private.email_outbox where id = p_id);
  end if;
end $$;
revoke all on function public.complete_email(bigint, text) from public, anon, authenticated;
grant execute on function public.complete_email(bigint, text) to service_role;
