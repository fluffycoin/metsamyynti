-- Metsämyynti: käyttäjätilit ja vahva tunnistautuminen
--
-- Periaatteet
--  * Tili syntyy Supabase Authiin (sähköposti + salasana tai magic link). Pelkkä tili
--    riittää kiinnostuksen ilmaisemiseen.
--  * Vahva tunnistautuminen (pankkitunnukset / mobiilivarmenne tunnistusvälittäjän,
--    esim. Iduran, kautta) vaaditaan vain myyjältä. Se tehdään harvoin:
--      'kayttoonotto'  kerran, kun myyjä ottaa myyntiominaisuudet käyttöön
--      'julkaisu'      ilmoituksen lähettämisessä julkaistavaksi
--      'hyvaksynta'    yhteisomistajan hyväksyessä tai hylätessä ilmoituksen
--  * Henkilötunnusta ei tallenneta selväkielisenä. Kanta laskee siitä HMAC-SHA256-
--    tiivisteen salaisella pippurilla (private.settings), ja omistajuus täsmätään
--    tiivisteellä. Selväkielinen tunnus kulkee vain palvelinfunktiolta kannan
--    funktiolle record_strong_auth() eikä päädy mihinkään tauluun.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Palvelimen asetukset (ei näy selaimelle)
-- ---------------------------------------------------------------------------
create table private.settings (
  key    text primary key,
  value  text not null
);
revoke all on private.settings from public, anon, authenticated;
grant all on private.settings to service_role;

insert into private.settings (key, value) values
  -- Henkilötunnusten tiivisteen pippuri. Generoidaan kerran; ÄLÄ vaihda tuotannossa,
  -- koska vanhat tiivisteet eivät enää täsmäisi.
  ('identity_pepper', encode(extensions.gen_random_bytes(32), 'hex')),
  -- Omistajatietojen lähde: 'testi' (testirekisteri) tai 'mml' (MML:n lainhuutotiedot,
  -- kun käyttölupa on myönnetty).
  ('ownership_source', 'testi'),
  -- Kuinka monta minuuttia vahva tunnistautuminen kelpaa julkaisuun ja hyväksyntään.
  ('step_up_minutes', '15')
on conflict (key) do nothing;

create function private.setting(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.settings where key = p_key
$$;
revoke all on function private.setting(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Henkilötunnus: tarkistus ja tiiviste
-- ---------------------------------------------------------------------------
-- Palauttaa normalisoidun henkilötunnuksen (isot kirjaimet) tai virheen, jos
-- tarkistusmerkki tai muoto ei täsmää.
create function private.normalize_hetu(p_hetu text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  s text := upper(btrim(p_hetu));
  chars constant text := '0123456789ABCDEFHJKLMNPRSTUVWXY';
  n bigint;
begin
  if s !~ '^[0-9]{6}[-+ABCDEFUVWXY][0-9]{3}[0-9ABCDEFHJKLMNPRSTUVWXY]$' then
    raise exception 'Virheellinen henkilötunnus' using errcode = '22023';
  end if;
  n := (substr(s, 1, 6) || substr(s, 8, 3))::bigint;
  if substr(chars, (n % 31)::int + 1, 1) <> substr(s, 11, 1) then
    raise exception 'Virheellinen henkilötunnuksen tarkistusmerkki' using errcode = '22023';
  end if;
  return s;
end $$;
revoke all on function private.normalize_hetu(text) from public, anon, authenticated;

create function private.identity_hash(p_hetu text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(private.normalize_hetu(p_hetu), private.setting('identity_pepper'), 'sha256'), 'hex')
$$;
revoke all on function private.identity_hash(text) from public, anon, authenticated;
grant execute on function private.identity_hash(text) to service_role;

-- ---------------------------------------------------------------------------
-- Profiilit
-- ---------------------------------------------------------------------------
create type user_kind as enum ('henkilo', 'yritys');

create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  display_name           text check (char_length(display_name) <= 80),
  kind                   public.user_kind not null default 'henkilo',
  business_id            text check (business_id ~ '^[0-9]{7}-[0-9]$'),  -- Y-tunnus (v1.1)
  -- Vahva tunnistautuminen. identity_hash täyttyy ensimmäisellä kerralla eikä vaihdu.
  identity_hash          text unique,
  verified_name          text,            -- nimi tunnistusvälittäjältä
  strong_auth_at         timestamptz,     -- viimeisin vahva tunnistautuminen
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table public.profiles is 'Käyttäjän profiili. Rivi syntyy automaattisesti, kun auth.users-rivi luodaan.';

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Uusi auth-käyttäjä -> profiili. display_name otetaan rekisteröinnin metadatasta, jos annettu.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''))
  on conflict (id) do nothing;
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- notification_prefs ja trigger luodaan tiedostossa 20261121200200_users_notifications.sql.

-- ---------------------------------------------------------------------------
-- Vahvan tunnistautumisen istunnot ja loki
-- ---------------------------------------------------------------------------
create type strong_auth_purpose as enum ('kayttoonotto', 'julkaisu', 'hyvaksynta');

-- OIDC-kirjautumisen tila (state, nonce, PKCE). Vain palvelinfunktiot käyttävät.
create table private.strong_auth_sessions (
  state          text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  purpose        public.strong_auth_purpose not null,
  nonce          text not null,
  code_verifier  text not null,
  return_to      text not null,
  created_at     timestamptz not null default now(),
  consumed_at    timestamptz
);
revoke all on private.strong_auth_sessions from public, anon, authenticated;
grant all on private.strong_auth_sessions to service_role;

create table public.identity_verifications (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  purpose        public.strong_auth_purpose not null,
  provider       text not null,     -- 'idura', 'mock'
  method         text,              -- esim. 'fi-op', 'fi-nordea', 'fi-mobiilivarmenne'
  verified_at    timestamptz not null default now()
);
create index identity_verifications_user_idx on public.identity_verifications (user_id, verified_at desc);
alter table public.identity_verifications enable row level security;
revoke all on public.identity_verifications from anon, authenticated;
grant select on public.identity_verifications to authenticated;
grant all on public.identity_verifications to service_role;
create policy identity_verifications_select_own on public.identity_verifications
  for select to authenticated using (user_id = auth.uid());

-- Onko käyttäjä tunnistautunut vahvasti viimeisen step_up_minutes minuutin aikana?
create function private.has_recent_strong_auth(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = p_user
      and identity_hash is not null
      and strong_auth_at > now() - make_interval(mins => private.setting('step_up_minutes')::int)
  )
$$;
revoke all on function private.has_recent_strong_auth(uuid) from public, anon;
grant execute on function private.has_recent_strong_auth(uuid) to authenticated, service_role;

create function private.my_identity_hash() returns text
language sql stable security definer set search_path = '' as $$
  select identity_hash from public.profiles where id = auth.uid()
$$;
revoke all on function private.my_identity_hash() from public, anon;
grant execute on function private.my_identity_hash() to authenticated, service_role;
